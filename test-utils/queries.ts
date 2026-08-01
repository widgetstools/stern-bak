import { screen, type ByRoleOptions, type Matcher } from '@testing-library/react';

/** Prefer the active portal node when Radix/tarball installs duplicate DOM in jsdom. */
function pickTarballMatch<T extends Element>(matches: T[]): T {
  if (matches.length <= 1) return matches[0]!;
  const visible = matches.filter(
    (el) => !el.closest('[aria-hidden="true"]') && !el.hasAttribute('hidden'),
  );
  return (visible.at(-1) ?? matches.at(-1))!;
}

export function getOneByText(text: Matcher) {
  return pickTarballMatch(screen.getAllByText(text));
}

export function getOneByTestId(id: string) {
  return pickTarballMatch(screen.getAllByTestId(id));
}

export function getOneByLabelText(text: Matcher) {
  return pickTarballMatch(screen.getAllByLabelText(text));
}

export function getOneByDisplayValue(value: string | RegExp) {
  return pickTarballMatch(screen.getAllByDisplayValue(value));
}

export function getOneByPlaceholderText(text: Matcher) {
  return pickTarballMatch(screen.getAllByPlaceholderText(text));
}

export function getOneByRole(role: Parameters<typeof screen.getByRole>[0], options?: ByRoleOptions) {
  return pickTarballMatch(screen.getAllByRole(role, options));
}

/** When duplicates carry different props, pick the node that matches an attribute value. */
export function getOneByTestIdAttribute(id: string, attr: string, value: string) {
  const match = screen.getAllByTestId(id).find((el) => el.getAttribute(attr) === value);
  if (!match) {
    throw new Error(`No [data-testid="${id}"] with ${attr}="${value}"`);
  }
  return match;
}
