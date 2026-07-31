import { useForm } from 'react-hook-form';
import {
  Button, Checkbox, Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage,
  Input, InputOTP, InputOTPGroup, InputOTPSlot, Label, RadioGroup, RadioGroupItem, Slider, Switch, Textarea,
} from '@wellsfargo-starui/ui';
import type { ShowcaseEntry } from '../types';

function FormDemo() {
  const form = useForm<{ ticker: string }>({ defaultValues: { ticker: '' } });
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(() => undefined)} className="w-[260px] space-y-2">
        <FormField
          control={form.control}
          name="ticker"
          rules={{ required: 'Ticker is required' }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Ticker</FormLabel>
              <FormControl>
                <Input placeholder="AAPL 3.25 02/30" {...field} />
              </FormControl>
              <FormDescription>Bond identifier.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" size="sm">Submit</Button>
      </form>
    </Form>
  );
}

export const inputsEntries: ShowcaseEntry[] = [
  {
    id: 'input', name: 'Input', category: 'inputs',
    importLine: "import { Input } from '@wellsfargo-starui/ui';",
    code: `<Input placeholder="Search instruments…" />`,
    Demo: () => <Input className="w-[260px]" placeholder="Search instruments…" />,
  },
  {
    id: 'textarea', name: 'Textarea', category: 'inputs',
    importLine: "import { Textarea } from '@wellsfargo-starui/ui';",
    code: `<Textarea placeholder="Order notes…" />`,
    Demo: () => <Textarea className="w-[260px]" placeholder="Order notes…" />,
  },
  {
    id: 'label', name: 'Label', category: 'inputs',
    importLine: "import { Label, Input } from '@wellsfargo-starui/ui';",
    code: `<Label htmlFor="qty">Quantity</Label>
<Input id="qty" />`,
    Demo: () => (
      <div className="flex w-[200px] flex-col gap-1">
        <Label htmlFor="demo-qty">Quantity</Label>
        <Input id="demo-qty" defaultValue="1,000,000" />
      </div>
    ),
  },
  {
    id: 'input-otp', name: 'Input OTP', category: 'inputs',
    importLine: "import { InputOTP, InputOTPGroup, InputOTPSlot } from '@wellsfargo-starui/ui';",
    code: `<InputOTP maxLength={4}>
  <InputOTPGroup>
    <InputOTPSlot index={0} /><InputOTPSlot index={1} />
    <InputOTPSlot index={2} /><InputOTPSlot index={3} />
  </InputOTPGroup>
</InputOTP>`,
    Demo: () => (
      <InputOTP maxLength={4}>
        <InputOTPGroup>
          <InputOTPSlot index={0} /><InputOTPSlot index={1} />
          <InputOTPSlot index={2} /><InputOTPSlot index={3} />
        </InputOTPGroup>
      </InputOTP>
    ),
  },
  {
    id: 'form', name: 'Form', category: 'inputs',
    importLine: "import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@wellsfargo-starui/ui';",
    code: `const form = useForm({ defaultValues: { ticker: '' } });
<Form {...form}>
  <FormField name="ticker" control={form.control} rules={{ required: true }}
    render={({ field }) => (
      <FormItem>
        <FormLabel>Ticker</FormLabel>
        <FormControl><Input {...field} /></FormControl>
        <FormMessage />
      </FormItem>
    )} />
</Form>`,
    Demo: FormDemo,
  },
  {
    id: 'slider', name: 'Slider', category: 'inputs',
    importLine: "import { Slider } from '@wellsfargo-starui/ui';",
    code: `<Slider defaultValue={[50]} max={100} step={1} />`,
    Demo: () => <Slider className="w-[240px]" defaultValue={[50]} max={100} step={1} />,
  },
  {
    id: 'checkbox', name: 'Checkbox', category: 'inputs',
    importLine: "import { Checkbox, Label } from '@wellsfargo-starui/ui';",
    code: `<Checkbox id="agree" />
<Label htmlFor="agree">Settle T+1</Label>`,
    Demo: () => (
      <div className="flex items-center gap-2">
        <Checkbox id="demo-settle" defaultChecked />
        <Label htmlFor="demo-settle">Settle T+1</Label>
      </div>
    ),
  },
  {
    id: 'switch', name: 'Switch', category: 'inputs',
    importLine: "import { Switch, Label } from '@wellsfargo-starui/ui';",
    code: `<Switch id="live" />
<Label htmlFor="live">Live prices</Label>`,
    Demo: () => (
      <div className="flex items-center gap-2">
        <Switch id="demo-live" defaultChecked />
        <Label htmlFor="demo-live">Live prices</Label>
      </div>
    ),
  },
  {
    id: 'radio-group', name: 'Radio Group', category: 'inputs',
    importLine: "import { RadioGroup, RadioGroupItem, Label } from '@wellsfargo-starui/ui';",
    code: `<RadioGroup defaultValue="mid">
  <div className="flex items-center gap-2"><RadioGroupItem value="bid" id="r-bid" /><Label htmlFor="r-bid">Bid</Label></div>
  <div className="flex items-center gap-2"><RadioGroupItem value="mid" id="r-mid" /><Label htmlFor="r-mid">Mid</Label></div>
</RadioGroup>`,
    Demo: () => (
      <RadioGroup defaultValue="mid" className="flex gap-4">
        <div className="flex items-center gap-2"><RadioGroupItem value="bid" id="demo-r-bid" /><Label htmlFor="demo-r-bid">Bid</Label></div>
        <div className="flex items-center gap-2"><RadioGroupItem value="mid" id="demo-r-mid" /><Label htmlFor="demo-r-mid">Mid</Label></div>
        <div className="flex items-center gap-2"><RadioGroupItem value="ask" id="demo-r-ask" /><Label htmlFor="demo-r-ask">Ask</Label></div>
      </RadioGroup>
    ),
  },
];
