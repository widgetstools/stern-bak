import { act, fireEvent, screen, within } from '@testing-library/react';

/** Radix-backed NativeOptionsSelect — open trigger then pick option by label. */
export async function pickNativeSelect(testId: string, optionLabel: string | RegExp) {
  await act(async () => {
    fireEvent.click(screen.getByTestId(testId));
  });
  const options = await screen.findAllByRole('option', { name: optionLabel });
  const match = options.length === 1
    ? options[0]
    : options.find((el) => {
        const text = el.textContent ?? '';
        if (typeof optionLabel === 'string') return text.trim() === optionLabel;
        return optionLabel.test(text);
      });
  if (!match) {
    throw new Error(`No unique option match for ${String(optionLabel)} among ${options.length} options`);
  }
  await act(async () => {
    fireEvent.click(match);
  });
}

/** Pick from an already-open listbox (scoped to the most recent portal). */
export async function pickOpenOption(optionLabel: string | RegExp) {
  const lists = screen.getAllByRole('listbox');
  const list = lists[lists.length - 1]!;
  const options = within(list).getAllByRole('option', { name: optionLabel });
  const match = options[0];
  if (!match) throw new Error(`Option not found: ${String(optionLabel)}`);
  await act(async () => {
    fireEvent.click(match);
  });
}
