import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ensureAiAssistantDockButton, AI_ASSISTANT_REGISTRY_ID } from './ensureDockButton';

const mockAddRegistryEntry = vi.fn();
const mockAddDockButton = vi.fn();
vi.mock('./registryOps', () => ({
  addRegistryEntry: (...args: unknown[]) => mockAddRegistryEntry(...args),
  addDockButton: (...args: unknown[]) => mockAddDockButton(...args),
  buildRegistryEntry: (spec: unknown) => spec,
}));

describe('ensureAiAssistantDockButton', () => {
  beforeEach(() => {
    mockAddRegistryEntry.mockReset().mockResolvedValue(undefined);
    mockAddDockButton.mockReset().mockResolvedValue(undefined);
  });

  it('registers the assistant as a singleton window component and adds its dock button', async () => {
    await ensureAiAssistantDockButton('Star-Demo');

    expect(mockAddRegistryEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        id: AI_ASSISTANT_REGISTRY_ID,
        hostUrl: '/#/ai-assistant',
        appId: 'Star-Demo',
        // singleton: re-clicking the dock button focuses the open window
        // rather than spawning duplicates; asWindow: a real OpenFin window.
        singleton: true,
        asWindow: true,
      }),
    );
    expect(mockAddDockButton).toHaveBeenCalledWith(
      expect.objectContaining({ registryEntryId: AI_ASSISTANT_REGISTRY_ID, tooltip: 'AI Assistant', asWindow: true }),
    );
  });
});
