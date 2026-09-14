/**
 * SSRM-hosted MarketsGrid chrome. Same persistence / toolbar as
 * {@link MarketsGridContainer}; auto-picks WASM SSRM when the catalog
 * row is `stomp-ssrm`.
 */
export {
  MarketsGridContainer as SsrmMarketsGridContainer,
  type MarketsGridContainerProps as SsrmMarketsGridContainerProps,
} from './MarketsGridContainer.js';
