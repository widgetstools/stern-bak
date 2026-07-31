/**
 * Custom scrollbar for AG-Grid that works on macOS overlay mode.
 *
 * AG-Grid separates its scrollbar into container + viewport elements:
 *   .ag-body-vertical-scroll > .ag-body-vertical-scroll-viewport
 *
 * This module:
 * 1. Hides the native (invisible) scrollbar inside the viewport
 * 2. Paints a visible, draggable thumb inside the container
 * 3. Supports click-on-track to jump, drag to scroll, and wheel passthrough
 */

interface ScrollbarState {
  container: HTMLElement;
  viewport: HTMLElement;
  thumb: HTMLElement;
  axis: 'vertical' | 'horizontal';
  dragging: boolean;
  dragStart: number;
  scrollStart: number;
  raf: number | null;
  cleanup: (() => void)[];
}

export function initCustomScrollbars() {
  const states: ScrollbarState[] = [];

  const v = setup('.ag-body-vertical-scroll', '.ag-body-vertical-scroll-viewport', 'vertical');
  const h = setup('.ag-body-horizontal-scroll', '.ag-body-horizontal-scroll-viewport', 'horizontal');
  if (v) states.push(v);
  if (h) states.push(h);

  return () => {
    for (const s of states) {
      for (const fn of s.cleanup) fn();
      s.thumb.remove();
    }
  };
}

function setup(
  containerSel: string,
  viewportSel: string,
  axis: 'vertical' | 'horizontal',
): ScrollbarState | null {
  const container = document.querySelector(containerSel) as HTMLElement;
  const viewport = document.querySelector(viewportSel) as HTMLElement;
  if (!container || !viewport) return null;

  // Remove any old thumb
  container.querySelector('.ds-thumb')?.remove();

  // Create thumb
  const thumb = document.createElement('div');
  thumb.className = 'ds-thumb';
  thumb.dataset.axis = axis;
  container.style.position = 'relative';
  container.appendChild(thumb);

  const state: ScrollbarState = {
    container, viewport, thumb, axis,
    dragging: false, dragStart: 0, scrollStart: 0,
    raf: null, cleanup: [],
  };

  // ── Update thumb position/size ──
  const update = () => {
    if (axis === 'vertical') {
      const ratio = viewport.clientHeight / viewport.scrollHeight;
      if (ratio >= 1) { thumb.style.opacity = '0'; return; }
      thumb.style.opacity = '1';
      const trackH = container.clientHeight;
      const thumbH = Math.max(30, Math.round(trackH * ratio));
      const maxScroll = viewport.scrollHeight - viewport.clientHeight;
      const scrollPos = maxScroll > 0 ? viewport.scrollTop / maxScroll : 0;
      thumb.style.height = `${thumbH}px`;
      thumb.style.top = `${Math.round(scrollPos * (trackH - thumbH))}px`;
    } else {
      const ratio = viewport.clientWidth / viewport.scrollWidth;
      if (ratio >= 1) { thumb.style.opacity = '0'; return; }
      thumb.style.opacity = '1';
      const trackW = container.clientWidth;
      const thumbW = Math.max(30, Math.round(trackW * ratio));
      const maxScroll = viewport.scrollWidth - viewport.clientWidth;
      const scrollPos = maxScroll > 0 ? viewport.scrollLeft / maxScroll : 0;
      thumb.style.width = `${thumbW}px`;
      thumb.style.left = `${Math.round(scrollPos * (trackW - thumbW))}px`;
    }
  };

  // ── Scroll listener ──
  const onScroll = () => {
    if (state.raf) return;
    state.raf = requestAnimationFrame(() => { state.raf = null; update(); });
  };
  viewport.addEventListener('scroll', onScroll, { passive: true });
  state.cleanup.push(() => viewport.removeEventListener('scroll', onScroll));

  // ── Resize observer ──
  const ro = new ResizeObserver(update);
  ro.observe(viewport);
  ro.observe(container);
  state.cleanup.push(() => ro.disconnect());

  // ── Drag to scroll ──
  const onMouseDown = (e: MouseEvent) => {
    if (e.target !== thumb) return;
    e.preventDefault();
    state.dragging = true;
    thumb.classList.add('active');
    if (axis === 'vertical') {
      state.dragStart = e.clientY;
      state.scrollStart = viewport.scrollTop;
    } else {
      state.dragStart = e.clientX;
      state.scrollStart = viewport.scrollLeft;
    }
  };

  const onMouseMove = (e: MouseEvent) => {
    if (!state.dragging) return;
    e.preventDefault();
    const trackSize = axis === 'vertical' ? container.clientHeight : container.clientWidth;
    const thumbSize = axis === 'vertical' ? thumb.offsetHeight : thumb.offsetWidth;
    const maxScroll = axis === 'vertical'
      ? viewport.scrollHeight - viewport.clientHeight
      : viewport.scrollWidth - viewport.clientWidth;
    const delta = axis === 'vertical' ? e.clientY - state.dragStart : e.clientX - state.dragStart;
    const scrollDelta = (delta / (trackSize - thumbSize)) * maxScroll;

    if (axis === 'vertical') {
      viewport.scrollTop = state.scrollStart + scrollDelta;
    } else {
      viewport.scrollLeft = state.scrollStart + scrollDelta;
    }
  };

  const onMouseUp = () => {
    if (!state.dragging) return;
    state.dragging = false;
    thumb.classList.remove('active');
  };

  // ── Click on track to jump ──
  const onTrackClick = (e: MouseEvent) => {
    if (e.target === thumb) return;
    const rect = container.getBoundingClientRect();
    const maxScroll = axis === 'vertical'
      ? viewport.scrollHeight - viewport.clientHeight
      : viewport.scrollWidth - viewport.clientWidth;

    if (axis === 'vertical') {
      const clickRatio = (e.clientY - rect.top) / rect.height;
      viewport.scrollTop = clickRatio * maxScroll;
    } else {
      const clickRatio = (e.clientX - rect.left) / rect.width;
      viewport.scrollLeft = clickRatio * maxScroll;
    }
  };

  container.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
  container.addEventListener('click', onTrackClick);

  state.cleanup.push(
    () => container.removeEventListener('mousedown', onMouseDown),
    () => document.removeEventListener('mousemove', onMouseMove),
    () => document.removeEventListener('mouseup', onMouseUp),
    () => container.removeEventListener('click', onTrackClick),
  );

  // Initial paint
  update();

  return state;
}
