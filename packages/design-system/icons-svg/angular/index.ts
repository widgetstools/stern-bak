/**
 * @wellsfargo-starui/icons-svg/angular
 *
 * Angular icon bindings for the MarketsUI monorepo.
 * Wraps @lucide/angular so icon versions are centralised and consistent.
 *
 * @lucide/angular ships each icon as its own standalone component (selector
 * `svg[lucide<Name>]`). Import the icon component(s) you need and render with
 * the matching attribute selector. The legacy `LucideAngularModule` no longer
 * exists — use the standalone `LucideComponent` plus `provideLucideIcons` for
 * the dynamic, name-driven flow.
 *
 * Usage (per-icon standalone component):
 *   import { FileText, Home } from '@wellsfargo-starui/icons-svg/angular';
 *
 *   @Component({
 *     imports: [FileText, Home],
 *     template: `<svg lucideFileText [size]="16"></svg>`
 *   })
 *   export class MyComponent {}
 *
 * Usage (dynamic, name-driven):
 *   import { LucideComponent, provideLucideIcons, FileText, Home } from '@wellsfargo-starui/icons-svg/angular';
 *
 *   // app config — register the icons you use:
 *   providers: [provideLucideIcons({ FileText, Home })]
 *
 *   @Component({
 *     imports: [LucideComponent],
 *     template: `<svg lucideComponent name="file-text" [size]="16"></svg>`
 *   })
 *   export class MyComponent {}
 *
 * To add a new icon, re-export it (aliased to its friendly name) from
 * @lucide/angular below. To swap the underlying icon library, update only
 * this file.
 */

// Re-export the generic render component + providers needed to render icons
export {
  LucideComponent,
  provideLucideIcons,
  provideLucideConfig,
  LUCIDE_ICONS,
  LUCIDE_CONFIG,
} from '@lucide/angular';

// Re-export individual icon components, aliased to their friendly names.
// Each is a standalone component (selector `svg[lucide<Name>]`).
export {
  // ─── File & Document ───────────────────────────────────────────
  LucideFileText as FileText,
  LucideFile as File,
  LucideFilePlus as FilePlus,
  LucideFolderOpen as FolderOpen,
  LucideFolder as Folder,
  LucideSave as Save,
  LucideDownload as Download,
  LucideUpload as Upload,
  LucideCopy as Copy,
  LucideClipboard as Clipboard,
  LucideScissors as Scissors,

  // ─── Editing ───────────────────────────────────────────────────
  LucidePencil as Pencil,
  LucideTrash2 as Trash2,
  LucideUndo as Undo,
  LucideRedo as Redo,
  LucideRotateCcw as RotateCcw,

  // ─── Settings & Tools ──────────────────────────────────────────
  LucideSettings as Settings,
  LucideSlidersHorizontal as SlidersHorizontal,
  LucideWrench as Wrench,

  // ─── Search & View ─────────────────────────────────────────────
  LucideSearch as Search,
  LucideZoomIn as ZoomIn,
  LucideZoomOut as ZoomOut,
  LucideEye as Eye,
  LucideEyeOff as EyeOff,

  // ─── Layout ────────────────────────────────────────────────────
  LucideLayout as Layout,
  LucideLayoutGrid as LayoutGrid,
  LucideColumns3 as Columns3,
  LucideMaximize as Maximize,
  LucideMinimize as Minimize,

  // ─── Actions ───────────────────────────────────────────────────
  LucidePlus as Plus,
  LucidePlusCircle as PlusCircle,
  LucideMinus as Minus,
  LucideX as X,
  LucideCheck as Check,
  LucideChevronRight as ChevronRight,
  LucideChevronDown as ChevronDown,
  LucideChevronUp as ChevronUp,
  LucidePlay as Play,
  LucidePause as Pause,
  LucideRefreshCw as RefreshCw,

  // ─── Communication ─────────────────────────────────────────────
  LucideBell as Bell,
  LucideMail as Mail,
  LucideSend as Send,
  LucideMessageSquare as MessageSquare,

  // ─── Navigation ────────────────────────────────────────────────
  LucideGlobe as Globe,
  LucideLink as Link,
  LucideExternalLink as ExternalLink,
  LucideHome as Home,
  LucideStore as Store,
  LucideMap as Map,
  LucideCompass as Compass,

  // ─── Users & Security ──────────────────────────────────────────
  LucideUser as User,
  LucideUsers as Users,
  LucideLock as Lock,
  LucideKey as Key,
  LucideShield as Shield,
  LucideLogIn as LogIn,
  LucideLogOut as LogOut,

  // ─── Status & Feedback ─────────────────────────────────────────
  LucideStar as Star,
  LucideHeart as Heart,
  LucideBookmark as Bookmark,
  LucideFlag as Flag,
  LucideTag as Tag,
  LucideInfo as Info,
  LucideHelpCircle as HelpCircle,
  LucideAlertTriangle as AlertTriangle,

  // ─── Development ───────────────────────────────────────────────
  LucideTerminal as Terminal,
  LucideCode as Code,
  LucideDatabase as Database,
  LucideServer as Server,
  LucideMonitor as Monitor,
  LucideGitBranch as GitBranch,
  LucideShare2 as Share2,
  LucidePower as Power,
  LucideWorkflow as Workflow,

  // ─── Media ─────────────────────────────────────────────────────
  LucideImage as Image,
  LucideSun as Sun,
  LucideMoon as Moon,
  LucidePalette as Palette,

  // ─── Data & Charts ─────────────────────────────────────────────
  LucideZap as Zap,
  LucideActivity as Activity,
  LucideBarChart2 as BarChart2,
  LucideLineChart as LineChart,
  LucidePieChart as PieChart,
  LucideTrendingUp as TrendingUp,
  LucideTrendingDown as TrendingDown,
  LucideDollarSign as DollarSign,
  LucideCreditCard as CreditCard,
  LucideWallet as Wallet,

  // ─── Organization ──────────────────────────────────────────────
  LucidePackage as Package,
  LucideLayers as Layers,
  LucideClock as Clock,
  LucideCalendar as Calendar,
  LucideFilter as Filter,
  LucideTable as Table,
  LucideMenu as Menu,
  LucideTarget as Target,
  LucideGripVertical as GripVertical,
  LucideListOrdered as ListOrdered,
} from '@lucide/angular';
