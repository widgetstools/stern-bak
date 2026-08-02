import { screen } from '@testing-library/react';
/** Prefer the active portal node when Radix/tarball installs duplicate DOM in jsdom. */
function pickTarballMatch(matches) {
    if (matches.length <= 1)
        return matches[0];
    const visible = matches.filter((el) => !el.closest('[aria-hidden="true"]') && !el.hasAttribute('hidden'));
    return (visible.at(-1) ?? matches.at(-1));
}
export function getOneByText(text) {
    return pickTarballMatch(screen.getAllByText(text));
}
export function getOneByTestId(id) {
    return pickTarballMatch(screen.getAllByTestId(id));
}
export function getOneByLabelText(text) {
    return pickTarballMatch(screen.getAllByLabelText(text));
}
export function getOneByDisplayValue(value) {
    return pickTarballMatch(screen.getAllByDisplayValue(value));
}
export function getOneByPlaceholderText(text) {
    return pickTarballMatch(screen.getAllByPlaceholderText(text));
}
export function getOneByRole(role, options) {
    return pickTarballMatch(screen.getAllByRole(role, options));
}
/** When duplicates carry different props, pick the node that matches an attribute value. */
export function getOneByTestIdAttribute(id, attr, value) {
    const match = screen.getAllByTestId(id).find((el) => el.getAttribute(attr) === value);
    if (!match) {
        throw new Error(`No [data-testid="${id}"] with ${attr}="${value}"`);
    }
    return match;
}
//# sourceMappingURL=queries.js.map