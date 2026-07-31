/**
 * Shared DOM scaffolding for the streamSafe floating filter family.
 * Both `StreamSafeTextFloatingFilter` and `StreamSafeNumberFloatingFilter`
 * call this to build a structure 100% identical to AG-Grid's native
 * text-floating-filter, plus a clear button. Centralised so look-and-
 * feel stays in lockstep across the two components and across future
 * additions.
 *
 * **DOM mirror.** AG-Grid 35's native floating filter, simplified:
 *
 * ```
 * <div class="ag-floating-filter-input">
 *   <div class="ag-labeled ag-label-align-left ag-text-field ag-input-field">
 *     <div class="ag-input-field-label ag-label ag-hidden ag-text-field-label" />
 *     <div class="ag-wrapper ag-input-wrapper ag-text-field-input-wrapper">
 *       <input class="ag-input-field-input ag-text-field-input" />
 *     </div>
 *   </div>
 * </div>
 * ```
 *
 * We add ONE extra child inside the wrapper — the clear button —
 * positioned absolutely against the wrapper's right edge so the
 * input's height + border + focus ring stay exactly as the theme
 * styles them (no inline style overrides on those properties).
 *
 * **Theme-awareness.** The clear button reads from design-system CSS
 * variables (`--ds-text-primary`, `--ds-surface-secondary`) so it
 * adapts automatically to the active theme — light/dark/etc.
 * Falls back to neutral defaults when the variables aren't defined
 * (e.g. running outside the design-system theme). The wrapper's
 * `position: relative` is the only structural inline style we add.
 */
export interface FloatingFilterDom {
  /** Outer element returned to AG-Grid via `getGui()`. */
  eGui: HTMLDivElement;
  /** The text `<input>` element the user types into. */
  input: HTMLInputElement;
  /** The ✕ clear button — hidden when input is empty. */
  clearBtn: HTMLButtonElement;
  /** Toggles `clearBtn.style.display` based on the input's current value. */
  syncClearVisibility: () => void;
}

export interface BuildFloatingFilterDomOptions {
  placeholder: string;
  /** Bound `oninput` handler — fired on every keystroke. */
  onInput: () => void;
  /** Bound `onmousedown` handler for the clear button. */
  onClearMouseDown: (e: MouseEvent) => void;
}

export function buildFloatingFilterDom(opts: BuildFloatingFilterDomOptions): FloatingFilterDom {
  // Outer — fills the floating-filter cell. AG-Grid theme rules target
  // `.ag-floating-filter-input` directly for height + padding.
  const eGui = document.createElement('div');
  eGui.className = 'ag-floating-filter-input';
  eGui.setAttribute('role', 'presentation');

  // Field — pulls in border / focus ring / typography / disabled state
  // from the theme. We mirror the native `<ag-input-text-field>` element.
  const field = document.createElement('div');
  field.className = 'ag-labeled ag-label-align-left ag-text-field ag-input-field';
  field.setAttribute('role', 'presentation');

  // Hidden label — preserved for AG-Grid's accessibility tree compat.
  const label = document.createElement('div');
  label.className = 'ag-input-field-label ag-label ag-hidden ag-text-field-label';
  label.setAttribute('aria-hidden', 'true');
  label.setAttribute('role', 'presentation');
  field.appendChild(label);

  // Wrapper — `position: relative` so the clear button can absolutely
  // position against its right edge. AG-Grid's wrapper styles already
  // set width/height, but explicitly setting position keeps the layout
  // robust if a theme override removes it.
  const wrapper = document.createElement('div');
  wrapper.className = 'ag-wrapper ag-input-wrapper ag-text-field-input-wrapper';
  wrapper.setAttribute('role', 'presentation');
  wrapper.style.position = 'relative';
  field.appendChild(wrapper);

  // Input — pure native AG-Grid styling. We add only `padding-right` so
  // typed text doesn't run under the clear button. Everything else
  // (color, background, border, focus ring, height) is theme-driven.
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = opts.placeholder;
  input.className = 'ag-input-field-input ag-text-field-input';
  input.style.paddingRight = '22px';
  input.addEventListener('input', opts.onInput);
  wrapper.appendChild(input);

  // Clear button — theme-aware via CSS variables. Falls back to
  // neutral grey on themes that don't define them.
  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.tabIndex = -1; // skip in tab order so the input flow stays clean
  clearBtn.setAttribute('aria-label', 'Clear filter');
  clearBtn.title = 'Clear filter';
  clearBtn.textContent = '✕';
  clearBtn.style.display = 'none';
  clearBtn.style.position = 'absolute';
  clearBtn.style.right = '3px';
  clearBtn.style.top = '50%';
  clearBtn.style.transform = 'translateY(-50%)';
  clearBtn.style.padding = '0';
  clearBtn.style.width = '18px';
  clearBtn.style.height = '18px';
  clearBtn.style.lineHeight = '18px';
  clearBtn.style.fontSize = '14px';
  clearBtn.style.fontWeight = '600';
  clearBtn.style.borderRadius = '2px';
  clearBtn.style.background = 'transparent';
  clearBtn.style.border = 'none';
  // `--ds-text-primary` flips automatically between light/dark
  // themes; `currentColor` is the safe fallback.
  clearBtn.style.color = 'var(--ds-text-primary, currentColor)';
  clearBtn.style.opacity = '0.75';
  clearBtn.style.cursor = 'pointer';
  clearBtn.addEventListener('mouseenter', () => {
    clearBtn.style.opacity = '1';
    // `--ds-surface-secondary` is themed for both light and dark; falls
    // back to a low-alpha neutral grey when the variable is undefined.
    clearBtn.style.background = 'var(--ds-surface-secondary, rgba(127, 127, 127, 0.18))';
  });
  clearBtn.addEventListener('mouseleave', () => {
    clearBtn.style.opacity = '0.75';
    clearBtn.style.background = 'transparent';
  });
  clearBtn.addEventListener('mousedown', opts.onClearMouseDown);
  wrapper.appendChild(clearBtn);

  eGui.appendChild(field);

  const syncClearVisibility = (): void => {
    clearBtn.style.display = input.value === '' ? 'none' : 'inline-block';
  };

  return { eGui, input, clearBtn, syncClearVisibility };
}
