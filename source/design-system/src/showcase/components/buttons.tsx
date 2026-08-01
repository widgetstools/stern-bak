import { Button, ButtonGroup, Toggle, ToggleGroup, ToggleGroupItem } from '@wellsfargo-starui/react';
import { Bold, Italic, Underline } from 'lucide-react';
import type { ShowcaseEntry } from '../types';

export const buttonsEntries: ShowcaseEntry[] = [
  {
    id: 'button',
    name: 'Button',
    category: 'buttons',
    importLine: "import { Button } from '@wellsfargo-starui/react';",
    code: `<div className="flex gap-2">
  <Button>Default</Button>
  <Button variant="secondary">Secondary</Button>
  <Button variant="outline">Outline</Button>
  <Button variant="destructive">Destructive</Button>
  <Button variant="ghost">Ghost</Button>
  <Button variant="link">Link</Button>
</div>`,
    Demo: () => (
      <div className="flex flex-wrap items-center gap-2">
        <Button>Default</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="destructive">Destructive</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="link">Link</Button>
      </div>
    ),
  },
  {
    id: 'button-group',
    name: 'Button Group',
    category: 'buttons',
    importLine: "import { ButtonGroup, Button } from '@wellsfargo-starui/react';",
    code: `<ButtonGroup>
  <Button variant="outline">Bid</Button>
  <Button variant="outline">Mid</Button>
  <Button variant="outline">Ask</Button>
</ButtonGroup>`,
    Demo: () => (
      <ButtonGroup>
        <Button variant="outline">Bid</Button>
        <Button variant="outline">Mid</Button>
        <Button variant="outline">Ask</Button>
      </ButtonGroup>
    ),
  },
  {
    id: 'toggle',
    name: 'Toggle',
    category: 'buttons',
    importLine: "import { Toggle } from '@wellsfargo-starui/react';",
    code: `<Toggle aria-label="Bold"><Bold size={14} /></Toggle>`,
    Demo: () => (
      <Toggle aria-label="Toggle bold">
        <Bold size={14} />
      </Toggle>
    ),
  },
  {
    id: 'toggle-group',
    name: 'Toggle Group',
    category: 'buttons',
    importLine: "import { ToggleGroup, ToggleGroupItem } from '@wellsfargo-starui/react';",
    code: `<ToggleGroup type="multiple">
  <ToggleGroupItem value="bold"><Bold size={14} /></ToggleGroupItem>
  <ToggleGroupItem value="italic"><Italic size={14} /></ToggleGroupItem>
  <ToggleGroupItem value="underline"><Underline size={14} /></ToggleGroupItem>
</ToggleGroup>`,
    Demo: () => (
      <ToggleGroup type="multiple">
        <ToggleGroupItem value="bold" aria-label="Bold"><Bold size={14} /></ToggleGroupItem>
        <ToggleGroupItem value="italic" aria-label="Italic"><Italic size={14} /></ToggleGroupItem>
        <ToggleGroupItem value="underline" aria-label="Underline"><Underline size={14} /></ToggleGroupItem>
      </ToggleGroup>
    ),
  },
];
