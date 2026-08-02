import { useForm } from 'react-hook-form';
import {
  Button, Form, FormControl, FormField, FormItem, FormLabel, FormMessage, Input,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  ToggleGroup, ToggleGroupItem,
} from '@wellsfargo-starui/react';
import type { TerminalState } from '../data/types';

interface OrderForm {
  instrumentId: string;
  side: 'buy' | 'sell';
  qty: number;
  price: number;
}

export interface OrderEntryFormProps {
  state: TerminalState;
  onSubmit?: (order: OrderForm) => void;
}

export function OrderEntryForm({ state, onSubmit }: OrderEntryFormProps) {
  const form = useForm<OrderForm>({
    defaultValues: { instrumentId: state.instruments[0]?.id ?? '', side: 'buy', qty: 1_000_000, price: 100 },
  });

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-[color:var(--ds-border-primary)] px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--ds-text-secondary)]">
        New order
      </div>
      <Form {...form}>
        <form onSubmit={form.handleSubmit((v) => onSubmit?.(v))} className="flex flex-col gap-3 p-3">
          <FormField
            control={form.control}
            name="instrumentId"
            rules={{ required: 'Select an instrument' }}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Instrument</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger></FormControl>
                  <SelectContent>
                    {state.instruments.map((i) => <SelectItem key={i.id} value={i.id}>{i.ticker}</SelectItem>)}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="side"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Side</FormLabel>
                <FormControl>
                  <ToggleGroup type="single" value={field.value} onValueChange={(v) => v && field.onChange(v)} className="justify-start">
                    <ToggleGroupItem value="buy" className="px-6">Buy</ToggleGroupItem>
                    <ToggleGroupItem value="sell" className="px-6">Sell</ToggleGroupItem>
                  </ToggleGroup>
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="qty"
            rules={{ required: 'Quantity required', min: { value: 1, message: 'Must be positive' } }}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Quantity (face)</FormLabel>
                <FormControl><Input type="number" {...field} onChange={(e) => field.onChange(Number.isNaN(e.target.valueAsNumber) ? 0 : e.target.valueAsNumber)} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="price"
            rules={{ required: 'Price required', min: { value: 0.01, message: 'Must be positive' } }}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Limit price</FormLabel>
                <FormControl><Input type="number" step="0.001" {...field} onChange={(e) => field.onChange(Number.isNaN(e.target.valueAsNumber) ? 0 : e.target.valueAsNumber)} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit">Submit order</Button>
        </form>
      </Form>
    </div>
  );
}
