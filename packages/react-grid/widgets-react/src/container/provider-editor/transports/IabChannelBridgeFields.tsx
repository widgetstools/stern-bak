/**
 * Connection fields for IAB channel bridge providers — points at an
 * upstream catalog row the dock hub runs (typically STOMP).
 */

import { Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@wellsfargo-starui/react';
import type { DataProviderConfig, IabChannelBridgeProviderConfig } from '@wellsfargo-starui/types/shared';
import { DEFAULT_MARKETSUI_DATA_HUB_CHANNEL } from '@wellsfargo-starui/types/shared';
import { useDataProvidersList } from '@wellsfargo-starui/react/data/runtime';
import { useEffect, useMemo } from 'react';

export interface IabChannelBridgeFieldsProps {
  cfg: IabChannelBridgeProviderConfig;
  onChange(next: Partial<IabChannelBridgeProviderConfig>): void;
}

export function IabChannelBridgeFields({ cfg, onChange }: IabChannelBridgeFieldsProps) {
  const list = useDataProvidersList({ includeAppData: false });

  const upstreamOptions = useMemo(
    () =>
      list.configs.filter(
        (row) =>
          row.providerType !== 'iab-channel-bridge'
          && row.providerType !== 'appdata'
          && row.providerId,
      ),
    [list.configs],
  );

  const selectedUpstream = useMemo(
    () => upstreamOptions.find((r) => r.providerId === cfg.upstreamProviderId),
    [cfg.upstreamProviderId, upstreamOptions],
  );

  useEffect(() => {
    if (!selectedUpstream?.config || selectedUpstream.config.providerType === 'iab-channel-bridge') {
      return;
    }
    const upstream = selectedUpstream.config as {
      keyColumn?: string | readonly string[];
      columnDefinitions?: IabChannelBridgeProviderConfig['columnDefinitions'];
      inferredFields?: IabChannelBridgeProviderConfig['inferredFields'];
    };
    onChange({
      keyColumn: upstream.keyColumn,
      columnDefinitions: upstream.columnDefinitions,
      inferredFields: upstream.inferredFields,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync schema when upstream selection changes only
  }, [cfg.upstreamProviderId]);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="upstream-provider">Upstream provider (hub)</Label>
        <Select
          value={cfg.upstreamProviderId || undefined}
          onValueChange={(upstreamProviderId) => onChange({ upstreamProviderId })}
        >
          <SelectTrigger id="upstream-provider" className="h-9">
            <SelectValue placeholder="Select STOMP / mock provider…" />
          </SelectTrigger>
          <SelectContent>
            {upstreamOptions.map((row: DataProviderConfig) => (
              <SelectItem key={row.providerId} value={row.providerId!}>
                {row.name} ({row.providerType})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Configure the upstream feed with the STOMP editor. The dock hub runs that provider;
          this bridge row is what MarketsGrid selects for cross-window access.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="channel-name">Channel name (optional)</Label>
        <Input
          id="channel-name"
          className="h-9 font-mono text-xs"
          placeholder={DEFAULT_MARKETSUI_DATA_HUB_CHANNEL}
          value={cfg.channelName ?? ''}
          onChange={(e) => onChange({ channelName: e.target.value || undefined })}
        />
      </div>
    </div>
  );
}
