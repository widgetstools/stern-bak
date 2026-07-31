import { DataProviderEditor } from '@wellsfargo-starui/widgets-react/provider-editor';
import { LOGGED_IN_USER_ID } from '@wellsfargo-starui/types';

interface ProviderEditorPanelProps {
  initialProviderId?: string | null;
  onClose?: () => void;
}

export function ProviderEditorPanel({ initialProviderId, onClose }: ProviderEditorPanelProps) {
  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[color:var(--ds-surface-ground)]">
      <DataProviderEditor
        userId={LOGGED_IN_USER_ID}
        initialProviderId={initialProviderId ?? null}
        onClose={onClose}
      />
    </div>
  );
}
