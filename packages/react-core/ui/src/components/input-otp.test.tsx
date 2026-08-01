import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from './input-otp.js';

afterEach(cleanup);

describe('InputOTP', () => {
  it('accepts typed digits across slots', async () => {
    const onChange = vi.fn();
    render(
      <InputOTP aria-label="Verification code" maxLength={4} onChange={onChange}>
        <InputOTPGroup>
          <InputOTPSlot index={0} />
          <InputOTPSlot index={1} />
          <InputOTPSeparator />
          <InputOTPSlot index={2} />
          <InputOTPSlot index={3} />
        </InputOTPGroup>
      </InputOTP>,
    );

    await userEvent.type(screen.getByRole('textbox', { name: 'Verification code' }), '1234');

    expect(onChange).toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: 'Verification code' })).toHaveValue('1234');
  });

  it('does not accept input while disabled', async () => {
    const onChange = vi.fn();
    render(
      <InputOTP aria-label="Locked code" disabled maxLength={4} onChange={onChange}>
        <InputOTPGroup>
          <InputOTPSlot index={0} />
          <InputOTPSlot index={1} />
        </InputOTPGroup>
      </InputOTP>,
    );

    await userEvent.type(screen.getByRole('textbox', { name: 'Locked code' }), '12');

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: 'Locked code' })).toBeDisabled();
  });

  it('merges containerClassName on the otp root', () => {
    const { container } = render(
      <InputOTP aria-label="Code" containerClassName="gap-4" maxLength={2}>
        <InputOTPGroup>
          <InputOTPSlot index={0} />
        </InputOTPGroup>
      </InputOTP>,
    );

    expect(container.querySelector('.gap-4')).toBeInTheDocument();
  });
});
