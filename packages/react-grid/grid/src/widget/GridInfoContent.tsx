import type { ReactElement } from 'react';

export interface GridInfoContentProps {
  readonly componentName: string | undefined;
  readonly gridId: string;
  readonly instanceId: string | undefined;
  readonly appId: string | undefined;
  readonly userId: string | undefined;
}

export function GridInfoContent({
  componentName,
  gridId,
  instanceId,
  appId,
  userId,
}: GridInfoContentProps): ReactElement {
  const path = typeof window !== 'undefined' ? window.location.pathname : '';
  const resolvedInstanceId = instanceId ?? gridId;

  return (
    <>
      {componentName ? (
        <div
          className="border-b px-3 py-2 text-[13px] font-semibold"
          style={{
            color: 'var(--ds-text-primary)',
            borderColor: 'var(--ds-border-primary)',
          }}
        >
          {componentName}
        </div>
      ) : null}
      <div className="flex flex-col gap-1.5 px-3 py-2">
        <InfoRow label="path" value={path} mono />
        <InfoRow label="instanceId" value={resolvedInstanceId} mono />
        <InfoRow label="gridId" value={gridId} mono />
        <InfoRow label="appId" value={appId ?? '—'} />
        <InfoRow label="userId" value={userId ?? '—'} />
      </div>
    </>
  );
}

function InfoRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-baseline gap-2">
      <span
        className="shrink-0"
        style={{
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: 0.6,
          textTransform: 'uppercase',
          color: 'var(--ds-text-faint)',
          width: 80,
        }}
      >
        {label}
      </span>
      <span
        className="min-w-0 truncate"
        title={value}
        style={{
          color: 'var(--ds-text-primary)',
          fontFamily: mono
            ? "'JetBrains Mono', 'IBM Plex Mono', ui-monospace, monospace"
            : 'inherit',
          fontSize: 12,
        }}
      >
        {value}
      </span>
    </div>
  );
}
