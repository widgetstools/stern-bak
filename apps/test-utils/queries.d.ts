import { screen, type ByRoleOptions, type Matcher } from '@testing-library/react';
export declare function getOneByText(text: Matcher): HTMLElement;
export declare function getOneByTestId(id: string): HTMLElement;
export declare function getOneByLabelText(text: Matcher): HTMLElement;
export declare function getOneByDisplayValue(value: string | RegExp): HTMLElement;
export declare function getOneByPlaceholderText(text: Matcher): HTMLElement;
export declare function getOneByRole(role: Parameters<typeof screen.getByRole>[0], options?: ByRoleOptions): HTMLElement;
/** When duplicates carry different props, pick the node that matches an attribute value. */
export declare function getOneByTestIdAttribute(id: string, attr: string, value: string): HTMLElement;
//# sourceMappingURL=queries.d.ts.map