/**
 * Type declarations for SVG imports via vite-plugin-svgr.
 *
 * - `import iconUrl from './icon.svg'`         → string (asset URL)
 * - `import Icon from './icon.svg?react'`      → React component (supports currentColor + sizing)
 */

declare module '*.svg' {
  const src: string;
  export default src;
}

declare module '*.svg?react' {
  import type { FC, SVGProps } from 'react';
  const ReactComponent: FC<SVGProps<SVGSVGElement>>;
  export default ReactComponent;
}
