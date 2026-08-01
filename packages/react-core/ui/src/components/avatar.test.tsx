import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Avatar, AvatarFallback, AvatarImage } from './avatar.js';

afterEach(cleanup);

describe('Avatar', () => {
  it('shows fallback initials while the image is loading', () => {
    render(
      <Avatar>
        <AvatarImage alt="Jane Doe" src="https://example.com/jane.png" />
        <AvatarFallback>JD</AvatarFallback>
      </Avatar>,
    );

    expect(screen.getByText('JD')).toBeInTheDocument();
  });

  it('falls back to initials when the image is absent', () => {
    render(
      <Avatar>
        <AvatarImage alt="Jane Doe" src="" />
        <AvatarFallback>JD</AvatarFallback>
      </Avatar>,
    );

    expect(screen.getByText('JD')).toBeInTheDocument();
  });

  it('merges className on the root avatar shell', () => {
    const { container } = render(
      <Avatar className="h-8 w-8">
        <AvatarFallback>AB</AvatarFallback>
      </Avatar>,
    );

    expect(container.firstElementChild).toHaveClass('h-8', 'w-8');
  });
});
