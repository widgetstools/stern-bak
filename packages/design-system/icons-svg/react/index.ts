/**
 * @wellsfargo-starui/icons-svg/react
 *
 * React icon bindings for the MarketsUI monorepo.
 * Wraps lucide-react so icon versions are centralised and consistent.
 *
 * Usage:
 *   import { Home, Settings, FileText } from '@wellsfargo-starui/icons-svg/react';
 *   <Home size={16} />
 *
 * To add a new icon, re-export it from lucide-react below.
 * To swap the underlying icon library, update only this file.
 */

// Re-export the LucideIcon type for components that accept dynamic icons
export type { LucideIcon, LucideProps } from 'lucide-react';

// Dynamic icon component — renders a Lucide icon from a string ID.
// Drop-in replacement for @iconify/react's <Icon> component.
export { DynamicIcon, type DynamicIconProps } from './DynamicIcon';

// ─── File & Document ─────────────────────────────────────────────────
export {
  FileText,
  File,
  FilePlus,
  FolderOpen,
  Folder,
  Save,
  Download,
  Upload,
  Copy,
  Clipboard,
  ClipboardPaste,
  Scissors,
} from 'lucide-react';

// ─── Editing ─────────────────────────────────────────────────────────
export {
  Pencil,
  PencilLine,
  Trash2,
  Undo,
  Redo,
  RotateCcw,
} from 'lucide-react';

// ─── Settings & Tools ────────────────────────────────────────────────
export {
  Settings,
  SlidersHorizontal,
  Wrench,
} from 'lucide-react';

// ─── Search & View ───────────────────────────────────────────────────
export {
  Search,
  ZoomIn,
  ZoomOut,
  Eye,
  EyeOff,
} from 'lucide-react';

// ─── Layout ──────────────────────────────────────────────────────────
export {
  Layout,
  LayoutGrid,
  Columns3,
  Rows3,
  Maximize,
  Minimize,
} from 'lucide-react';

// ─── Actions ─────────────────────────────────────────────────────────
export {
  Plus,
  PlusCircle,
  Minus,
  X,
  Check,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Play,
  Pause,
  Square,
  RefreshCw,
} from 'lucide-react';

// ─── Communication ───────────────────────────────────────────────────
export {
  Bell,
  BellRing,
  Mail,
  Send,
  MessageSquare,
  MessageCircle,
} from 'lucide-react';

// ─── Navigation ──────────────────────────────────────────────────────
export {
  Globe,
  Link,
  ExternalLink,
  Home,
  Store,
  Map,
  Navigation,
  Compass,
} from 'lucide-react';

// ─── Users & Security ────────────────────────────────────────────────
export {
  User,
  Users,
  Lock,
  Unlock,
  Key,
  Shield,
  LogIn,
  LogOut,
} from 'lucide-react';

// ─── Status & Feedback ──────────────────────────────────────────────
export {
  Star,
  Heart,
  Bookmark,
  Flag,
  Tag,
  Hash,
  Info,
  HelpCircle,
  AlertTriangle,
  AlertCircle,
  Ban,
} from 'lucide-react';

// ─── Development ─────────────────────────────────────────────────────
export {
  Terminal,
  Code,
  Database,
  Server,
  Cpu,
  Monitor,
  Smartphone,
  Printer,
  GitBranch,
  Share2,
  Plug,
  Power,
  Workflow,
} from 'lucide-react';

// ─── Media ───────────────────────────────────────────────────────────
export {
  Image,
  Camera,
  Palette,
  Sun,
  Moon,
  Pipette,
  SunMoon,
} from 'lucide-react';

// ─── Data & Charts ───────────────────────────────────────────────────
export {
  Zap,
  Activity,
  BarChart2,
  LineChart,
  PieChart,
  TrendingUp,
  TrendingDown,
  DollarSign,
  CreditCard,
  Wallet,
} from 'lucide-react';

// ─── Organization ────────────────────────────────────────────────────
export {
  Package,
  Box,
  Layers,
  Clock,
  Calendar,
  AlarmClock,
  Filter,
  ArrowUpNarrowWide,
  ArrowUpDown,
  ListOrdered,
  Table,
  Grid3x3,
  Menu,
  MoreHorizontal,
  GripVertical,
  Move,
  Crosshair,
  Target,
} from 'lucide-react';

// ─── List tree ───────────────────────────────────────────────────────
export { ListTree } from 'lucide-react';

// ─── Config-browser set (merged from its private icon fork) ──────────
export {
  CircleCheck,
  Cloud,
  CloudOff,
  DatabaseBackup,
  FileJson,
  Inbox,
  OctagonAlert,
  Rocket,
  TriangleAlert,
} from 'lucide-react';
