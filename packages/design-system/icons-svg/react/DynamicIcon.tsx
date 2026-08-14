/**
 * DynamicIcon — renders a Lucide icon from a string identifier.
 *
 * Drop-in replacement for @iconify/react's <Icon icon="lucide:file-text" />.
 * Renders as an inline <svg> using lucide-react, which supports CSS
 * `color` and `currentColor` (unlike <img> tags from CDN).
 *
 * If the icon ID is not in the curated map, falls back to an <img>
 * from the Iconify CDN so unknown icons still render.
 *
 * Usage:
 *   import { DynamicIcon } from '@wellsfargo-starui/icons-svg/react';
 *   <DynamicIcon icon="lucide:file-text" style={{ width: 14, height: 14 }} />
 */

import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { MARKET_ICON_SVGS } from '../allIcons';

// Import all icons we use in the dock editor
import {
  FileText, File, FilePlus, FolderOpen, Folder, Save, Download, Upload,
  Copy, Clipboard, ClipboardPaste, Scissors, Pencil, PencilLine, Trash2,
  Undo, Redo, RotateCcw, Settings, SlidersHorizontal, Search, ZoomIn,
  ZoomOut, Eye, EyeOff, Layout, LayoutGrid, Columns3, Rows3, Maximize,
  Minimize, Plus, PlusCircle, Minus, X, Check, ChevronRight, ChevronDown,
  ChevronUp, Play, Pause, Square, RefreshCw, Bell, BellRing, Mail, Send,
  Globe, Link, ExternalLink, Home, Store, User, Users, Lock, Unlock, Key,
  Shield, Star, Heart, Bookmark, Flag, Tag, Hash, Terminal, Code, Database,
  Server, Cpu, Monitor, Smartphone, Printer, Image, Camera, Palette, Sun,
  Moon, Zap, Activity, BarChart2, LineChart, PieChart, TrendingUp,
  TrendingDown, DollarSign, CreditCard, Wallet, Package, Box, Layers, Map,
  Navigation, Compass, Clock, Calendar, AlarmClock, Filter,
  ArrowUpNarrowWide, ArrowUpDown, ListOrdered, Table, Grid3x3, Menu,
  MoreHorizontal, GripVertical, Move, Crosshair, Target, Workflow,
  GitBranch, Share2, Plug, Power, LogIn, LogOut, Info, HelpCircle,
  AlertTriangle, AlertCircle, Ban, MessageSquare, MessageCircle,
  ListTree, SunMoon, Pipette, Wrench, Loader2, SearchX,
  CircleCheck, Cloud, CloudOff, DatabaseBackup, FileJson, Inbox,
  OctagonAlert, Rocket, TriangleAlert,
} from 'lucide-react';

// ─── Icon lookup map ─────────────────────────────────────────────────
// Maps Iconify-style IDs ("lucide:file-text") to Lucide React components.
// This lets us render icons from config strings without @iconify/react.
const ICON_MAP: Record<string, LucideIcon> = {
  // config-browser set (merged when its private icon fork was deleted)
  'lucide:circle-check': CircleCheck,
  'lucide:cloud': Cloud,
  'lucide:cloud-off': CloudOff,
  'lucide:database-backup': DatabaseBackup,
  'lucide:file-json': FileJson,
  'lucide:inbox': Inbox,
  'lucide:octagon-alert': OctagonAlert,
  'lucide:rocket': Rocket,
  'lucide:triangle-alert': TriangleAlert,
  'lucide:file-text': FileText,
  'lucide:file': File,
  'lucide:file-plus': FilePlus,
  'lucide:folder-open': FolderOpen,
  'lucide:folder': Folder,
  'lucide:save': Save,
  'lucide:download': Download,
  'lucide:upload': Upload,
  'lucide:copy': Copy,
  'lucide:clipboard': Clipboard,
  'lucide:clipboard-paste': ClipboardPaste,
  'lucide:scissors': Scissors,
  'lucide:pencil': Pencil,
  'lucide:pencil-line': PencilLine,
  'lucide:trash-2': Trash2,
  'lucide:undo': Undo,
  'lucide:redo': Redo,
  'lucide:rotate-ccw': RotateCcw,
  'lucide:settings': Settings,
  'lucide:sliders-horizontal': SlidersHorizontal,
  'lucide:search': Search,
  'lucide:zoom-in': ZoomIn,
  'lucide:zoom-out': ZoomOut,
  'lucide:eye': Eye,
  'lucide:eye-off': EyeOff,
  'lucide:layout': Layout,
  'lucide:layout-grid': LayoutGrid,
  'lucide:columns-3': Columns3,
  'lucide:rows-3': Rows3,
  'lucide:maximize': Maximize,
  'lucide:minimize': Minimize,
  'lucide:plus': Plus,
  'lucide:plus-circle': PlusCircle,
  'lucide:minus': Minus,
  'lucide:x': X,
  'lucide:check': Check,
  'lucide:chevron-right': ChevronRight,
  'lucide:chevron-down': ChevronDown,
  'lucide:chevron-up': ChevronUp,
  'lucide:play': Play,
  'lucide:pause': Pause,
  'lucide:square': Square,
  'lucide:refresh-cw': RefreshCw,
  'lucide:bell': Bell,
  'lucide:bell-ring': BellRing,
  'lucide:mail': Mail,
  'lucide:send': Send,
  'lucide:globe': Globe,
  'lucide:link': Link,
  'lucide:external-link': ExternalLink,
  'lucide:home': Home,
  'lucide:store': Store,
  'lucide:user': User,
  'lucide:users': Users,
  'lucide:lock': Lock,
  'lucide:unlock': Unlock,
  'lucide:key': Key,
  'lucide:shield': Shield,
  'lucide:star': Star,
  'lucide:heart': Heart,
  'lucide:bookmark': Bookmark,
  'lucide:flag': Flag,
  'lucide:tag': Tag,
  'lucide:hash': Hash,
  'lucide:terminal': Terminal,
  'lucide:code': Code,
  'lucide:database': Database,
  'lucide:server': Server,
  'lucide:cpu': Cpu,
  'lucide:monitor': Monitor,
  'lucide:smartphone': Smartphone,
  'lucide:printer': Printer,
  'lucide:image': Image,
  'lucide:camera': Camera,
  'lucide:palette': Palette,
  'lucide:sun': Sun,
  'lucide:moon': Moon,
  'lucide:sun-moon': SunMoon,
  'lucide:pipette': Pipette,
  'lucide:wrench': Wrench,
  'lucide:zap': Zap,
  'lucide:activity': Activity,
  'lucide:bar-chart-2': BarChart2,
  'lucide:line-chart': LineChart,
  'lucide:pie-chart': PieChart,
  'lucide:trending-up': TrendingUp,
  'lucide:trending-down': TrendingDown,
  'lucide:dollar-sign': DollarSign,
  'lucide:credit-card': CreditCard,
  'lucide:wallet': Wallet,
  'lucide:package': Package,
  'lucide:box': Box,
  'lucide:layers': Layers,
  'lucide:map': Map,
  'lucide:navigation': Navigation,
  'lucide:compass': Compass,
  'lucide:clock': Clock,
  'lucide:calendar': Calendar,
  'lucide:alarm-clock': AlarmClock,
  'lucide:filter': Filter,
  'lucide:arrow-up-narrow-wide': ArrowUpNarrowWide,
  'lucide:arrow-up-down': ArrowUpDown,
  'lucide:list-ordered': ListOrdered,
  'lucide:table': Table,
  'lucide:grid-3x3': Grid3x3,
  'lucide:menu': Menu,
  'lucide:more-horizontal': MoreHorizontal,
  'lucide:grip-vertical': GripVertical,
  'lucide:move': Move,
  'lucide:crosshair': Crosshair,
  'lucide:target': Target,
  'lucide:workflow': Workflow,
  'lucide:git-branch': GitBranch,
  'lucide:share-2': Share2,
  'lucide:plug': Plug,
  'lucide:power': Power,
  'lucide:log-in': LogIn,
  'lucide:log-out': LogOut,
  'lucide:info': Info,
  'lucide:help-circle': HelpCircle,
  'lucide:alert-triangle': AlertTriangle,
  'lucide:alert-circle': AlertCircle,
  'lucide:ban': Ban,
  'lucide:message-square': MessageSquare,
  'lucide:message-circle': MessageCircle,
  'lucide:list-tree': ListTree,
  'lucide:loader-2': Loader2,
  'lucide:search-x': SearchX,
};

// ─── Component ──────────────────────────────────────────────────────

export interface DynamicIconProps {
  /** Iconify-style icon ID (e.g. "lucide:file-text") */
  icon: string;
  /** CSS styles — width/height/color are applied to the SVG */
  style?: React.CSSProperties;
  /** Additional class name */
  className?: string;
}

/**
 * Renders a Lucide icon from a string identifier.
 *
 * If the icon is in our curated map, renders an inline <svg> that
 * supports CSS `color`. Otherwise falls back to an <img> from the
 * Iconify CDN.
 */
export function DynamicIcon({ icon, style, className }: DynamicIconProps) {
  // Extract numeric size — guard against CSS string values like "100%" or "1.5rem"
  const rawW = style?.width;
  const rawH = style?.height;
  const size = (typeof rawW === "number" ? rawW : typeof rawH === "number" ? rawH : 16);
  const color = style?.color as string | undefined;

  // 1. Lucide icons — render as inline React SVG components
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

  // 2. Custom market icons (mkt:bond, mkt:trade-blotter, etc.)
  //    Render as inline SVG from @wellsfargo-starui/icons-svg strings
  if (prefix === 'mkt') {
    const svgStr = MARKET_ICON_SVGS[name];
    if (svgStr) {
      const colored = svgStr
        .replace(/currentColor/g, color ?? 'currentColor')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/width="24"/, `width="${size}"`)
        .replace(/height="24"/, `height="${size}"`);
      return (
        <span
          className={className}
          style={{ display: 'inline-flex', flexShrink: 0, width: size, height: size, ...style, color: undefined }}
          dangerouslySetInnerHTML={{ __html: colored }}
        />
      );
    }
  }

  // 3. Fallback: render from Iconify CDN for other icon sets
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
