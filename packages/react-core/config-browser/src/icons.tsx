/**
 * Lucide-backed DynamicIcon for config-browser (replaces @wellsfargo-starui/icons-svg).
 */
import type { CSSProperties } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  Check,
  CircleCheck,
  Cloud,
  CloudOff,
  Database,
  DatabaseBackup,
  Download,
  FileJson,
  Info,
  Inbox,
  Moon,
  OctagonAlert,
  Package,
  Plus,
  PlusCircle,
  RefreshCw,
  Rocket,
  Search,
  Sun,
  Trash2,
  TriangleAlert,
  Upload,
  X,
} from 'lucide-react';

const ICON_MAP: Record<string, LucideIcon> = {
  'lucide:alert-triangle': AlertTriangle,
  'lucide:check': Check,
  'lucide:circle-check': CircleCheck,
  'lucide:cloud': Cloud,
  'lucide:cloud-off': CloudOff,
  'lucide:database': Database,
  'lucide:database-backup': DatabaseBackup,
  'lucide:download': Download,
  'lucide:file-json': FileJson,
  'lucide:inbox': Inbox,
  'lucide:info': Info,
  'lucide:moon': Moon,
  'lucide:octagon-alert': OctagonAlert,
  'lucide:package': Package,
  'lucide:plus': Plus,
  'lucide:plus-circle': PlusCircle,
  'lucide:refresh-cw': RefreshCw,
  'lucide:rocket': Rocket,
  'lucide:search': Search,
  'lucide:sun': Sun,
  'lucide:trash-2': Trash2,
  'lucide:triangle-alert': TriangleAlert,
  'lucide:upload': Upload,
  'lucide:x': X,
};

export interface DynamicIconProps {
  icon: string;
  style?: CSSProperties;
  className?: string;
}

export function DynamicIcon({ icon, style, className }: DynamicIconProps) {
  const rawW = style?.width;
  const rawH = style?.height;
  const size = typeof rawW === 'number' ? rawW : typeof rawH === 'number' ? rawH : 16;
  const color = style?.color as string | undefined;
  const LucideComponent = ICON_MAP[icon];

  if (LucideComponent) {
    return (
      <LucideComponent
        size={size}
        color={color}
        className={className}
        style={{ flexShrink: 0, ...style, width: undefined, height: undefined, color: undefined }}
      />
    );
  }

  const [prefix, name] = icon.split(':');
  if (!prefix || !name) return null;
  const src = `https://api.iconify.design/${prefix}/${name}.svg?height=${size}`;
  return (
    <img
      src={src}
      width={size}
      height={size}
      alt={icon}
      style={{ flexShrink: 0, ...style }}
      className={className}
      loading="lazy"
    />
  );
}
