import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { TriStateToggle } from './TriStateToggle';
import { pickNativeSelect } from '../../../test/selectHelpers';

describe('TriStateToggle', () => {
  it('maps undefined to Host default', () => {
    render(<TriStateToggle value={undefined} onChange={() => {}} testId="tri" />);
    expect(document.querySelector('[data-testid="tri"]')?.textContent).toMatch(/Host default/i);
  });

  it('emits true when On selected', async () => {
    const onChange = vi.fn();
    render(<TriStateToggle value={undefined} onChange={onChange} testId="tri" />);
    await pickNativeSelect('tri', 'On');
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('emits false when Off selected', async () => {
    const onChange = vi.fn();
    render(<TriStateToggle value={undefined} onChange={onChange} testId="tri" />);
    await pickNativeSelect('tri', 'Off');
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('emits undefined when Host default selected from On', async () => {
    const onChange = vi.fn();
    render(<TriStateToggle value={true} onChange={onChange} testId="tri" />);
    await pickNativeSelect('tri', 'Host default');
    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});
