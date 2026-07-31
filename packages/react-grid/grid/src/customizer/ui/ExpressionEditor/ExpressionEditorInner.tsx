import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import { EditorState, type Extension } from '@codemirror/state';
import {
  EditorView,
  keymap,
  placeholder as cmPlaceholder,
  drawSelection,
  rectangularSelection,
  highlightSpecialChars,
} from '@codemirror/view';
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from '@codemirror/commands';
import {
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
  completionStatus,
  acceptCompletion,
} from '@codemirror/autocomplete';
import { lintKeymap } from '@codemirror/lint';
import { bracketMatching } from '@codemirror/language';
import './expressionEditor.css';
import type { ExpressionEditorProps, ExpressionEditorHandle } from './types';
import { expressionLanguage } from './cmSyntax';
import { expressionAutocompletion, defaultFunctionsProvider } from './cmCompletions';
import { expressionLinter } from './cmDiagnostics';
import { Palette, type PaletteItem } from './Palette';
import { HelpOverlay } from './HelpOverlay';

/**
 * CodeMirror 6 expression editor. Code-split from the public wrapper so the
 * editor payload only downloads when a user actually opens an editor.
 *
 * Replaced Monaco (4.3 MB lazy chunk) with CodeMirror (~350 KB) at feature
 * parity. Beyond size, the swap deleted an entire class of workaround that
 * Monaco required in this app:
 *
 *   - `monacoEnvironment.ts` — a fake web-worker environment, because Monaco
 *     insists on workers we never wanted (our DSL needs no TS/CSS/HTML
 *     services). CodeMirror has no workers.
 *   - `expressionEditorKeyBridges.ts` — 97 lines re-binding Tab, arrows,
 *     Home/End, shift-selection and Backspace/Delete through
 *     `editor.addCommand`, because Monaco's hidden-textarea input path drops
 *     keystrokes inside popped-out windows and transformed containers.
 *     CodeMirror uses a contenteditable with ordinary DOM events, so its
 *     stock keymaps work in popouts unchanged.
 *   - `editContext: false` — a documented time-bomb workaround for the same
 *     keystroke-drop bug.
 *   - `expressionEditorDeletion.ts` — model-level delete re-implementation
 *     needed once the key bridges took over Backspace/Delete.
 *   - `expressionEditorPlaceholder.ts` — a decoration-based placeholder,
 *     because Monaco has none. CodeMirror ships `placeholder()`.
 *   - The overflow-widget host + `monaco-overflow.css` — Monaco needs a
 *     DOM node outside the editor for popups to escape `overflow:hidden`.
 *     CodeMirror's tooltips handle this natively.
 *   - A `MutationObserver` on `data-theme` calling `monaco.editor.setTheme`.
 *     Our highlight style is CSS custom properties, so theming is free.
 */

/** Palette chords + commit/close behaviour, above the default keymaps. */
function appKeymap(opts: {
  multiline: boolean;
  onCommit: () => void;
  onOpenColumns: () => void;
  onOpenFunctions: () => void;
  onOpenHelp: () => void;
}): Extension {
  return keymap.of([
    { key: 'Mod-Shift-c', preventDefault: true, run: () => (opts.onOpenColumns(), true) },
    { key: 'Mod-Shift-f', preventDefault: true, run: () => (opts.onOpenFunctions(), true) },
    { key: 'F1', preventDefault: true, run: () => (opts.onOpenHelp(), true) },
    // Tab accepts an open completion, otherwise falls through to indent.
    { key: 'Tab', run: (view) => (completionStatus(view.state) ? acceptCompletion(view) : false) },
    {
      key: 'Enter',
      run: (view) => {
        // Completion open → let the completion keymap take it.
        if (completionStatus(view.state)) return false;
        // Single-line: Enter commits instead of inserting a newline.
        if (!opts.multiline) {
          opts.onCommit();
          return true;
        }
        return false;
      },
    },
    // Multiline commits on Ctrl/Cmd+Enter (matches the documented contract).
    { key: 'Mod-Enter', preventDefault: true, run: () => (opts.onCommit(), true) },
  ]);
}

export default function ExpressionEditorInner(
  props: ExpressionEditorProps & { handleRef?: React.Ref<ExpressionEditorHandle> },
) {
  const {
    value,
    onCommit,
    onChange,
    placeholder,
    multiline,
    lines = 4,
    fontSize = 11,
    columnsProvider,
    functionsProvider,
    validate = true,
    warnDeprecated = true,
    readOnly,
    className,
    style: hostStyle,
    'data-testid': dataTestId,
    handleRef,
  } = props;

  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const textRef = useRef(value);

  // Reactive props read through refs so the editor is constructed exactly
  // once — rebuilding it per keystroke would be catastrophic for UX + perf.
  const providersRef = useRef({ columnsProvider, functionsProvider });
  providersRef.current = { columnsProvider, functionsProvider };
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [activePalette, setActivePalette] = useState<'columns' | 'functions' | 'help' | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;

    const commit = () => {
      const view = viewRef.current;
      if (!view) return;
      const current = view.state.doc.toString();
      if (current !== textRef.current) {
        textRef.current = current;
        onCommitRef.current(current);
      }
    };

    const extensions: Extension[] = [
      history(),
      drawSelection(),
      rectangularSelection(),
      highlightSpecialChars(),
      bracketMatching(),
      closeBrackets(),
      expressionLanguage(),
      expressionAutocompletion(
        () => providersRef.current.columnsProvider?.() ?? [],
        () => providersRef.current.functionsProvider?.() ?? defaultFunctionsProvider(),
      ),
      EditorView.editable.of(!readOnly),
      EditorState.readOnly.of(!!readOnly),
      EditorView.theme({
        '&': { fontSize: `${fontSize}px` },
        '.cm-content': { fontFamily: "'JetBrains Mono', Menlo, monospace" },
      }),
      appKeymap({
        multiline: !!multiline,
        onCommit: commit,
        onOpenColumns: () => setActivePalette('columns'),
        onOpenFunctions: () => setActivePalette('functions'),
        onOpenHelp: () => setActivePalette('help'),
      }),
      // Order matters: closeBrackets and completion keymaps must precede the
      // defaults so Backspace/Enter/Escape reach them first.
      keymap.of([...closeBracketsKeymap, ...completionKeymap, ...lintKeymap, ...historyKeymap]),
      keymap.of([...defaultKeymap, indentWithTab]),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) onChangeRef.current?.(u.state.doc.toString());
        // Blur commit — the previous implementation used Monaco's
        // onDidBlurEditorText.
        if (u.focusChanged && !u.view.hasFocus) commit();
      }),
    ];

    if (!multiline) {
      // Single-line: no newlines at all, no wrapping.
      extensions.push(EditorState.transactionFilter.of((tr) => {
        if (!tr.docChanged) return tr;
        const inserted = tr.newDoc.toString();
        return inserted.includes('\n') ? [] : tr;
      }));
    } else {
      extensions.push(EditorView.lineWrapping);
    }

    if (placeholder) extensions.push(cmPlaceholder(placeholder));
    if (validate) extensions.push(expressionLinter({ warnDeprecated }));

    const view = new EditorView({
      state: EditorState.create({ doc: value, extensions }),
      parent: hostRef.current,
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Reason: one-shot construction. Every reactive prop is forwarded via
    // refs above or the dedicated effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // External value changes (parent switched which rule is being edited).
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (value !== current) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
      textRef.current = value;
    }
  }, [value]);

  useImperativeHandle(handleRef, () => ({
    focus: () => viewRef.current?.focus(),
    getValue: () => viewRef.current?.state.doc.toString() ?? textRef.current,
  }), []);

  const heightPx = multiline ? Math.max(lines * (fontSize + 6), 60) : Math.max(fontSize + 14, 24);

  const insertAtCursor = (text: string) => {
    const view = viewRef.current;
    if (!view || readOnly) return;
    const { from, to } = view.state.selection.main;
    view.dispatch({
      changes: { from, to, insert: text },
      selection: { anchor: from + text.length },
    });
    view.focus();
  };

  const columnItems: PaletteItem[] = activePalette === 'columns'
    ? (providersRef.current.columnsProvider?.() ?? []).map((c) => ({
        id: c.colId,
        label: `[${c.colId}]`,
        detail: c.headerName + (c.dataType ? ` · ${c.dataType}` : ''),
        description: `Reference the "${c.headerName}" column of the current row.`,
        keywords: [c.colId, c.headerName],
      }))
    : [];

  const functionItems: PaletteItem[] = activePalette === 'functions'
    ? (providersRef.current.functionsProvider?.() ?? defaultFunctionsProvider())
        .slice()
        .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
        .map((f) => ({
          id: f.name,
          label: f.name,
          detail: f.signature,
          description: f.description,
          group: f.category,
          keywords: [f.name, f.category],
        }))
    : [];

  return (
    <>
      <div
        ref={hostRef}
        data-testid={dataTestId}
        className={`ds-expression-editor${className ? ` ${className}` : ''}`}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          height: heightPx,
          border: '1px solid var(--ds-border-primary)',
          borderRadius: 2,
          background: 'var(--ds-surface-ground)',
          overflow: 'hidden',
          ...hostStyle,
        }}
      />
      {activePalette === 'columns' && (
        <Palette
          title="Columns"
          subtitle="Ctrl+Shift+C"
          placeholder="Filter columns…"
          items={columnItems}
          onPick={(it) => {
            insertAtCursor(it.label);
            setActivePalette(null);
          }}
          onClose={() => setActivePalette(null)}
        />
      )}
      {activePalette === 'functions' && (
        <Palette
          title="Functions"
          subtitle="Ctrl+Shift+F · 45+ built-ins grouped by category"
          placeholder="Filter functions…"
          items={functionItems}
          onPick={(it) => {
            insertAtCursor(`${it.label}()`);
            const view = viewRef.current;
            if (view) {
              const pos = view.state.selection.main.head;
              view.dispatch({ selection: { anchor: Math.max(0, pos - 1) } });
            }
            setActivePalette(null);
          }}
          onClose={() => setActivePalette(null)}
        />
      )}
      {activePalette === 'help' && (
        <HelpOverlay onClose={() => setActivePalette(null)} />
      )}
    </>
  );
}
