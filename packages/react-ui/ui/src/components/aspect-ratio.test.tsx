import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { AspectRatio } from './aspect-ratio.js';

afterEach(cleanup);

describe('AspectRatio', () => {
  it('preserves the requested ratio around its child content', () => {
    render(
      <AspectRatio ratio={16 / 9}>
        <img alt="Preview frame" src="/placeholder.png" />
      </AspectRatio>,
    );

    expect(screen.getByRole('img', { name: 'Preview frame' })).toBeInTheDocument();
  });
});
