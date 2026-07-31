import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarTrigger,
} from '@wellsfargo-starui/ui';

interface AppMenubarProps {
  onReset: () => void;
  onExport: () => void;
  onImport: () => void;
  onOpenInspector: () => void;
  onToggleTheme: () => void;
  isDark: boolean;
}

export function AppMenubar({
  onReset,
  onExport,
  onImport,
  onOpenInspector,
  onToggleTheme,
  isDark,
}: AppMenubarProps) {
  return (
    <Menubar className="h-7 gap-0 border-none bg-transparent p-0 shadow-none">
      <MenubarItemMenu label="File">
        <MenubarItem onSelect={onExport} className="font-mono text-[12px]">
          Export config…
          <MenubarShortcut>Ctrl+E</MenubarShortcut>
        </MenubarItem>
        <MenubarItem onSelect={onImport} className="font-mono text-[12px]">
          Import config…
          <MenubarShortcut>Ctrl+I</MenubarShortcut>
        </MenubarItem>
        <MenubarSeparator />
        <MenubarItem
          onSelect={onReset}
          className="font-mono text-[12px] text-[color:var(--ds-accent-negative)] focus:bg-[color:var(--ds-overlay-negative-soft)] focus:text-[color:var(--ds-accent-negative)]"
        >
          Reset all layouts
          <MenubarShortcut>Ctrl+Shift+R</MenubarShortcut>
        </MenubarItem>
      </MenubarItemMenu>

      <MenubarItemMenu label="View">
        <MenubarItem onSelect={onOpenInspector} className="font-mono text-[12px]">
          Storage inspector
          <MenubarShortcut>Ctrl+J</MenubarShortcut>
        </MenubarItem>
        <MenubarSeparator />
        <MenubarItem onSelect={onToggleTheme} className="font-mono text-[12px]">
          Switch to {isDark ? 'light' : 'dark'} mode
          <MenubarShortcut>Ctrl+.</MenubarShortcut>
        </MenubarItem>
      </MenubarItemMenu>

      <MenubarItemMenu label="Help">
        <MenubarItem
          className="font-mono text-[12px]"
          onSelect={() =>
            window.open(
              'https://github.com/nndrao/starui',
              '_blank',
              'noopener,noreferrer',
            )
          }
        >
          About this demo
        </MenubarItem>
        <MenubarItem
          className="font-mono text-[12px]"
          onSelect={() =>
            window.open(
              'https://www.ag-grid.com/javascript-data-grid/',
              '_blank',
              'noopener,noreferrer',
            )
          }
        >
          AG-Grid documentation
        </MenubarItem>
      </MenubarItemMenu>
    </Menubar>
  );
}

function MenubarItemMenu({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <MenubarMenu>
      <MenubarTrigger className="h-7 cursor-pointer rounded-sm px-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--ds-text-secondary)] data-[state=open]:bg-[color:var(--ds-surface-secondary)] data-[state=open]:text-[color:var(--ds-text-primary)] hover:bg-[color:var(--ds-surface-secondary)] hover:text-[color:var(--ds-text-primary)]">
        {label}
      </MenubarTrigger>
      <MenubarContent
        align="start"
        sideOffset={6}
        className="min-w-[220px] border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)]"
      >
        {children}
      </MenubarContent>
    </MenubarMenu>
  );
}
