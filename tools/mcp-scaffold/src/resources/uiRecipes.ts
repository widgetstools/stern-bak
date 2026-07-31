export interface UiRecipe {
  id: string;
  name: string;
  description: string;
  shadcnComponents: string[];
  fragmentPath: string;
  defaultTarget: string;
}

export const UI_RECIPES: UiRecipe[] = [
  {
    id: 'help-sheet',
    name: 'Help Sheet',
    description: 'Side sheet with tabbed MarketsGrid feature documentation.',
    shadcnComponents: ['Sheet', 'Tabs', 'ScrollArea', 'Badge', 'Separator'],
    fragmentPath: 'ui/help-sheet.tsx',
    defaultTarget: 'src/components/HelpSheet.tsx',
  },
  {
    id: 'app-menubar',
    name: 'App Menubar',
    description: 'Top menubar with file/view/theme actions.',
    shadcnComponents: ['Menubar', 'DropdownMenu'],
    fragmentPath: 'ui/app-menubar.tsx',
    defaultTarget: 'src/components/AppMenubar.tsx',
  },
  {
    id: 'status-strip',
    name: 'Status Strip',
    description: 'Row count and profile status strip above the grid.',
    shadcnComponents: ['Badge'],
    fragmentPath: 'ui/status-strip.tsx',
    defaultTarget: 'src/components/StatusStrip.tsx',
  },
  {
    id: 'theme-toggle',
    name: 'Theme Toggle',
    description: 'Dark/light toggle using applyTheme from design-system.',
    shadcnComponents: ['Button', 'Tooltip'],
    fragmentPath: 'ui/theme-toggle.tsx',
    defaultTarget: 'src/components/ThemeToggle.tsx',
  },
];

export const UI_COMPONENT_EXPORTS = [
  'Button', 'Input', 'Textarea', 'Select', 'Switch', 'Label', 'Checkbox',
  'Dialog', 'AlertDialog', 'Sheet', 'Tabs', 'Menubar', 'DropdownMenu',
  'Tooltip', 'Badge', 'Card', 'ScrollArea', 'Separator', 'SonnerToaster',
];
