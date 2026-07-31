import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from './carousel.js';

const emblaSpies = vi.hoisted(() => ({
  scrollNext: vi.fn(),
  scrollPrev: vi.fn(),
}));

vi.mock('embla-carousel-react', () => {
  class CarouselMockApi {
    private index = 0;
    private readonly slideCount: number;
    private readonly listeners = new Set<(api: CarouselMockApi) => void>();

    constructor(slideCount: number) {
      this.slideCount = slideCount;
    }

    canScrollPrev() {
      return this.index > 0;
    }

    canScrollNext() {
      return this.index < this.slideCount - 1;
    }

    scrollPrev() {
      emblaSpies.scrollPrev();
      this.index = Math.max(0, this.index - 1);
      this.listeners.forEach((handler) => handler(this));
    }

    scrollNext() {
      emblaSpies.scrollNext();
      this.index = Math.min(this.slideCount - 1, this.index + 1);
      this.listeners.forEach((handler) => handler(this));
    }

    on(_event: 'select' | 'reInit', handler: (api: CarouselMockApi) => void) {
      this.listeners.add(handler);
    }

    off(_event: 'select' | 'reInit', handler: (api: CarouselMockApi) => void) {
      this.listeners.delete(handler);
    }
  }

  return {
    default: () => [vi.fn(), new CarouselMockApi(3)] as const,
  };
});

afterEach(() => {
  cleanup();
  emblaSpies.scrollNext.mockClear();
  emblaSpies.scrollPrev.mockClear();
});

describe('Carousel', () => {
  it('exposes previous and next controls with accessible names', () => {
    render(
      <Carousel>
        <CarouselContent>
          <CarouselItem>Slide A</CarouselItem>
          <CarouselItem>Slide B</CarouselItem>
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>,
    );

    expect(screen.getByRole('region')).toHaveAttribute('aria-roledescription', 'carousel');
    expect(screen.getByRole('button', { name: 'Previous slide' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next slide' })).toBeEnabled();
  });

  it('requests the next slide from the next control', async () => {
    render(
      <Carousel>
        <CarouselContent>
          <CarouselItem>Slide A</CarouselItem>
          <CarouselItem>Slide B</CarouselItem>
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Next slide' }));

    expect(emblaSpies.scrollNext).toHaveBeenCalledTimes(1);
  });

  it('handles ArrowRight to request the next slide', () => {
    render(
      <Carousel>
        <CarouselContent>
          <CarouselItem>Slide A</CarouselItem>
          <CarouselItem>Slide B</CarouselItem>
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>,
    );

    const region = screen.getByRole('region');
    fireEvent.keyDown(region, { key: 'ArrowRight' });

    expect(emblaSpies.scrollNext).toHaveBeenCalledTimes(1);
  });

  it('forwards the embla api through setApi', () => {
    const setApi = vi.fn();
    render(
      <Carousel setApi={setApi}>
        <CarouselContent>
          <CarouselItem>Only</CarouselItem>
        </CarouselContent>
      </Carousel>,
    );

    expect(setApi).toHaveBeenCalled();
  });

  it('throws when carousel controls render outside a provider', () => {
    expect(() => render(<CarouselPrevious />)).toThrow(/Carousel/);
  });

  it('merges className on the carousel root', () => {
    render(
      <Carousel className="max-w-sm">
        <CarouselContent>
          <CarouselItem>Only</CarouselItem>
        </CarouselContent>
      </Carousel>,
    );

    expect(screen.getByRole('region')).toHaveClass('max-w-sm');
  });
});
