import { Injectable, signal, OnDestroy } from '@angular/core';
import {
  type Bond,
  type RfqRequest,
  type Order,
  BONDS,
  INITIAL_ORDERS,
  RESEARCH_NOTES,
  type ResearchNote,
} from './trading-data.service';

@Injectable({ providedIn: 'root' })
export class SharedStateService implements OnDestroy {
  selectedBond = signal<Bond>(BONDS[0]);
  rfqRequests = signal<RfqRequest[]>([]);
  showRfq = signal(false);
  clickedPrice = signal<number | undefined>(undefined);

  // Orders tab shared state
  orders = signal<Order[]>([...INITIAL_ORDERS]);
  selectedOrder = signal<Order | null>(null);
  orderFilter = signal('All');

  // Research tab shared state
  selectedNote = signal<ResearchNote>(RESEARCH_NOTES[0]);
  researchFilter = signal('All');

  // Auto-fill partial orders (matches React behavior)
  private fillInterval = setInterval(() => {
    this.orders.update((orders) =>
      orders.map((o) =>
        o.status === 'Partial' && Math.random() < 0.3
          ? { ...o, status: 'Filled', filled: o.qty }
          : o,
      ),
    );
  }, 5000);

  ngOnDestroy() {
    clearInterval(this.fillInterval);
  }
}
