import { Terminal } from 'lucide-react';
import {
  Alert, AlertDescription, AlertTitle,
  Button,
  Progress,
  Skeleton,
  Toaster,
  useToast,
} from '@wellsfargo-starui/react';
import type { ShowcaseEntry } from '../types';

function ToastDemo() {
  const { toast } = useToast();
  return (
    <div>
      <Button
        variant="outline"
        onClick={() => toast({ title: 'Order working', description: 'BUY 5,000,000 AAPL 3.25 02/30 @ 101.25' })}
      >
        Show toast
      </Button>
      <Toaster />
    </div>
  );
}

export const feedbackEntries: ShowcaseEntry[] = [
  {
    id: 'alert', name: 'Alert', category: 'feedback',
    importLine: "import { Alert, AlertTitle, AlertDescription } from '@wellsfargo-starui/react';",
    code: `<Alert>
  <AlertTitle>Connection restored</AlertTitle>
  <AlertDescription>Live prices are streaming.</AlertDescription>
</Alert>`,
    Demo: () => (
      <Alert className="w-[320px]">
        <Terminal size={15} />
        <AlertTitle>Connection restored</AlertTitle>
        <AlertDescription>Live prices are streaming again.</AlertDescription>
      </Alert>
    ),
  },
  {
    id: 'toast', name: 'Toast', category: 'feedback',
    importLine: "import { useToast, Toaster } from '@wellsfargo-starui/react';",
    code: `const { toast } = useToast();
<Button onClick={() => toast({ title: 'Order working' })}>Show toast</Button>
<Toaster />`,
    Demo: ToastDemo,
  },
  {
    id: 'progress', name: 'Progress', category: 'feedback',
    importLine: "import { Progress } from '@wellsfargo-starui/react';",
    code: `<Progress value={64} />`,
    Demo: () => (
      <div className="flex w-[240px] flex-col gap-1">
        <div className="flex justify-between text-[11px] text-[color:var(--ds-text-secondary)]"><span>Limit utilization</span><span>64%</span></div>
        <Progress value={64} />
      </div>
    ),
  },
  {
    id: 'skeleton', name: 'Skeleton', category: 'feedback',
    importLine: "import { Skeleton } from '@wellsfargo-starui/react';",
    code: `<Skeleton className="h-4 w-[200px]" />`,
    Demo: () => (
      <div className="flex w-[240px] flex-col gap-2">
        <Skeleton className="h-4 w-[200px]" />
        <Skeleton className="h-4 w-[160px]" />
        <Skeleton className="h-4 w-[120px]" />
      </div>
    ),
  },
];
