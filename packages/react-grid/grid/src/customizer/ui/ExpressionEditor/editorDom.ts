/**
 * DOM-context helpers for the expression editor and its portalled overlays.
 *
 * Everything Monaco-specific that used to live here is gone: the
 * overflow-widget host (Monaco needs a DOM node outside the editor so its
 * popups can escape `overflow:hidden`), the injected widget stylesheet, the
 * `vs`/`vs-dark` theme-name mapping, and the suggest-widget visibility probe
 * that the key bridges used. CodeMirror positions its own tooltips and is
 * themed with CSS custom properties (see `expressionEditor.css`), so the only
 * thing still needed is resolving the owning document/window — which matters
 * because these components render inside popped-out OpenFin/browser windows,
 * where `document` is NOT the right document.
 */

export interface EditorDomContext {
  document: Document;
  window: Window;
}

export function getElementDomContext(element: HTMLElement | null): EditorDomContext | null {
  if (!element) return null;
  const doc = element.ownerDocument;
  return {
    document: doc,
    window: doc.defaultView ?? window,
  };
}

export function getPortalDomContext(container: HTMLElement | null | undefined): EditorDomContext {
  const doc = container?.ownerDocument ?? document;
  return {
    document: doc,
    window: doc.defaultView ?? window,
  };
}
