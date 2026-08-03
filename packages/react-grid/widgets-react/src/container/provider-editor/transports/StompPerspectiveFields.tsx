/**
 * StompPerspectiveFields — the STOMP form, plus the Table the book lives in.
 *
 * `StompPerspectiveProviderConfig extends Omit<StompProviderConfig,
 * 'providerType'>`, so every STOMP wire setting still applies verbatim: same
 * broker, same destinations, same snapshot handshake. Composing `StompFields`
 * is what keeps that true — a fork would restate 116 lines to add five, and
 * the next change to a STOMP field would reach only one of them.
 */

import type { StompPerspectiveProviderConfig } from '@wellsfargo-starui/types/shared';
import { StompFields } from './StompFields.js';
import { PerspectiveTableFields } from './PerspectiveTableFields.js';

export interface StompPerspectiveFieldsProps {
  cfg: StompPerspectiveProviderConfig;
  onChange(next: Partial<StompPerspectiveProviderConfig>): void;
  /** Named in the keyColumn refusal. */
  providerLabel: string;
  providerId?: string | null;
}

export function StompPerspectiveFields({
  cfg,
  onChange,
  providerLabel,
  providerId,
}: StompPerspectiveFieldsProps) {
  return (
    <div className="space-y-4">
      <StompFields cfg={cfg} onChange={onChange} />
      <PerspectiveTableFields
        cfg={cfg}
        onChange={onChange}
        providerLabel={providerLabel}
        providerId={providerId}
      />
    </div>
  );
}
