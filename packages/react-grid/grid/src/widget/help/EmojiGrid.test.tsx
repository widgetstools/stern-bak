import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { EmojiGrid } from './EmojiGrid';

describe('EmojiGrid', () => {
  const writeText = vi.fn(async () => {});

  afterEach(() => {
    vi.unstubAllGlobals();
    writeText.mockReset();
  });

  it('copies emoji to clipboard and flashes copied state', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    render(<EmojiGrid items={[{ emoji: '🟢', label: 'Green' }]} />);
    fireEvent.click(screen.getByText('🟢').closest('button')!);

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('🟢');
      expect(screen.getByText('copied!')).toBeInTheDocument();
    });
  });

  it('swallows clipboard failures without throwing', async () => {
    writeText.mockRejectedValueOnce(new Error('denied'));
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    render(<EmojiGrid items={[{ emoji: '🔴', label: 'Red' }]} />);
    fireEvent.click(screen.getByText('🔴').closest('button')!);
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(screen.getByText('Red')).toBeInTheDocument();
  });
});
