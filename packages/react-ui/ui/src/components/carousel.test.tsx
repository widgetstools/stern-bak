import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  resetApi: null as (() => void) | null,
}));

vi.mock('embla-carousel-react', () => {
  class CarouselMockApi {
    private index = 0;
    private readonly slideCount: number;
    private readonly listeners = new Map<
      'select' | 'reInit',
      Set<(api: CarouselMockApi) => void>
    >();

    constructor(slideCount: number) {
      this.slideCount = slideCount;
    }

    canScrollPrev() {
      return this.index > 0;
    }

    canScrollNext() {
      return this.index < this.slideCount - 1;
    }

    private emit(event: 'select' | 'reInit') {
      this.listeners.get(event)?.forEach((handler) => handler(this));
    }

    scrollPrev() {
      emblaSpies.scrollPrev();
      this.index = Math.max(0, this.index - 1);
      this.emit('select');
    }

    scrollNext() {
      emblaSpies.scrollNext();
      this.index = Math.min(this.slideCount - 1, this.index + 1);
      this.emit('select');
    }

    on(event: 'select' | 'reInit', handler: (api: CarouselMockApi) => void) {
      const handlers = this.listeners.get(event) ?? new Set();
      handlers.add(handler);
      this.listeners.set(event, handlers);
    }

    off(event: 'select' | 'reInit', handler: (api: CarouselMockApi) => void) {
      this.listeners.get(event)?.delete(handler);
    }
  }

  let api: CarouselMockApi | undefined;

  emblaSpies.resetApi = () => {
    api = undefined;
  };

  return {
    default: () => {
      api ??= new CarouselMockApi(3);
      return [vi.fn(), api] as const;
    },
  };
});

afterEach(() => {
  cleanup();
  emblaSpies.scrollNext.mockClear();
  emblaSpies.scrollPrev.mockClear();
  emblaSpies.resetApi?.();
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

  it('handles ArrowLeft to request the previous slide', async () => {
    render(
      <Carousel>
        <CarouselContent>
          <CarouselItem>Slide A</CarouselItem>
          <CarouselItem>Slide B</CarouselItem>
          <CarouselItem>Slide C</CarouselItem>
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Next slide' }));
    emblaSpies.scrollPrev.mockClear();

    fireEvent.keyDown(screen.getByRole('region'), { key: 'ArrowLeft' });

    expect(emblaSpies.scrollPrev).toHaveBeenCalledTimes(1);
  });

  it('requests the previous slide from the previous control', async () => {
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
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Previous slide' })).toBeEnabled();
    });
    emblaSpies.scrollPrev.mockClear();

    await userEvent.click(screen.getByRole('button', { name: 'Previous slide' }));

    expect(emblaSpies.scrollPrev).toHaveBeenCalledTimes(1);
  });

  it('applies vertical layout classes when orientation is vertical', () => {
    render(
      <Carousel orientation="vertical">
        <CarouselContent data-testid="content">
          <CarouselItem data-testid="item">Slide A</CarouselItem>
        </CarouselContent>
        <CarouselPrevious data-testid="previous" />
        <CarouselNext data-testid="next" />
      </Carousel>,
    );

    expect(screen.getByTestId('content')).toHaveClass('flex-col');
    expect(screen.getByTestId('item')).toHaveClass('pt-4');
    expect(screen.getByTestId('previous')).toHaveClass('-top-12');
    expect(screen.getByTestId('next')).toHaveClass('-bottom-12');
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
