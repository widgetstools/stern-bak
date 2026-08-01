import { ThemeProvider as NextThemesProvider, type ThemeProviderProps as NextThemesProviderProps } from "next-themes";

export type Theme = 'light' | 'dark' | 'system';

// next-themes v0.4 narrowed `attribute` from `string` to a strict
// `Attribute | Attribute[]` union. Reuse its prop type so consumers
// pass valid values.
export type ThemeAttribute = NextThemesProviderProps['attribute'];

export interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
  enableSystem?: boolean;
  disableTransitionOnChange?: boolean;
  attribute?: ThemeAttribute;
}

export function ThemeProvider({
  children,
  defaultTheme = 'dark',
  storageKey = 'marketsui-theme',
  enableSystem = true,
  disableTransitionOnChange = false,
  attribute = 'class',
  ...props
}: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute={attribute}
      defaultTheme={defaultTheme}
      enableSystem={enableSystem}
      storageKey={storageKey}
      disableTransitionOnChange={disableTransitionOnChange}
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}

// Re-export useTheme for convenience
export { useTheme } from "next-themes";
