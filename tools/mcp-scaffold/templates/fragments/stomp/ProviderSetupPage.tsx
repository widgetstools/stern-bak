import { DataProviderEditor } from '@wellsfargo-starui/widgets-react/provider-editor';
import { LOGGED_IN_USER_ID } from '@wellsfargo-starui/types';

export function ProviderSetupPage() {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)]">
      <DataProviderEditor userId={LOGGED_IN_USER_ID} />
    </div>
  );
}
