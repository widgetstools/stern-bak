import {
  Children,
  Fragment,
  forwardRef,
  isValidElement,
  useMemo,
  type ChangeEvent,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  Select as SelectRoot,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
} from '@wellsfargo-starui/react';
import { ChromeButton } from './ChromeButton';

/** Radix `Select.Item` forbids `value=""` — map real `""` options through this sentinel. */
const RADIX_EMPTY_OPTION = '__STARUI_GRID_SELECT_EMPTY__';

function toRadixItemValue(v: string): string {
  return v === '' ? RADIX_EMPTY_OPTION : v;
}

function fromRadixItemValue(v: string): string {
  return v === RADIX_EMPTY_OPTION ? '' : v;
}

export interface NativeOptionsSelectProps {
  value?: string | number | readonly string[] | undefined;
  defaultValue?: string | number | readonly string[] | undefined;
  /** Same shape as a native `<select>` change event — only `target.value` is populated. */
  onChange?: (e: Pick<ChangeEvent<HTMLSelectElement>, 'target'> & { target: { value: string } }) => void;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  'data-testid'?: string;
  children?: ReactNode;
}

function stringifyProp(v: NativeOptionsSelectProps['value'] | NativeOptionsSelectProps['defaultValue']): string | undefined {
  if (v === undefined) return undefined;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.join(',');
  return String(v);
}

function collectOptions(children: ReactNode): Array<{ value: string; label: ReactNode }> {
  const out: Array<{ value: string; label: ReactNode }> = [];
  const walk = (nodes: ReactNode) => {
    Children.forEach(nodes, (node) => {
      if (!isValidElement(node)) return;
      if (node.type === Fragment) {
        walk((node.props as { children?: ReactNode }).children);
        return;
      }
      if (node.type === 'option') {
        const p = node.props as { value?: unknown; children?: ReactNode };
        out.push({
          value: p.value != null ? String(p.value) : '',
          label: p.children,
        });
      }
    });
  };
  walk(children);
  return out;
}

/**
 * Legacy `<option>`-children select adapter backed by `@wellsfargo-starui/react` Radix
 * Select. Not a shadcn primitive — keeps call sites on the native-select
 * event shape while forbidding native `<select>` in the UI stack.
 */
export const NativeOptionsSelect = forwardRef<HTMLButtonElement, NativeOptionsSelectProps>(function NativeOptionsSelect(
  { value, defaultValue, onChange, disabled, className, style, 'data-testid': dataTestId, children },
  ref,
) {
  const items = useMemo(() => collectOptions(children), [children]);

  const encodedValue = stringifyProp(value);
  const encodedDefault = stringifyProp(defaultValue);
  const isControlled = value !== undefined;

  const rootValue = isControlled ? toRadixItemValue(encodedValue ?? '') : undefined;
  const rootDefault = !isControlled ? toRadixItemValue(encodedDefault ?? '') : undefined;

  const handleValueChange = (next: string) => {
    onChange?.({
      target: { value: fromRadixItemValue(next) },
    } as ChangeEvent<HTMLSelectElement>);
  };

  if (items.length === 0) {
    return (
      <ChromeButton
        type="button"
        ref={ref}
        disabled={disabled}
        data-testid={dataTestId}
        className={cn(
          'inline-flex h-7 min-h-[28px] w-full items-center rounded-md border border-[var(--ds-border-primary)] bg-[var(--ds-surface-primary)] px-2 text-left text-[11px] text-[var(--ds-text-muted)]',
          className,
        )}
        style={style}
      >
        —
      </ChromeButton>
    );
  }

  return (
    <SelectRoot
      value={rootValue}
      defaultValue={rootDefault}
      onValueChange={handleValueChange}
      disabled={disabled}
    >
      <SelectTrigger
        ref={ref}
        className={cn(
          'h-7 min-h-[28px] w-full gap-1 px-2 py-0 text-[11px] shadow-sm',
          className,
        )}
        style={style}
        data-testid={dataTestId}
      >
        <SelectValue placeholder="—" />
      </SelectTrigger>
      <SelectContent position="popper" className="max-h-72">
        {items.map((it, idx) => (
          <SelectItem
            key={`${idx}:${toRadixItemValue(it.value)}`}
            value={toRadixItemValue(it.value)}
            className="text-[11px]"
          >
            {it.label}
          </SelectItem>
        ))}
      </SelectContent>
    </SelectRoot>
  );
});
NativeOptionsSelect.displayName = 'NativeOptionsSelect';

/** @deprecated Use `NativeOptionsSelect` — kept as `Select` for call-site compat. */
export const Select = NativeOptionsSelect;
