/**
 * icons — tabela de-para dos ícones antigos (Material Icons) → lucide-react e nomes semânticos do produto.
 *
 * Objetivo: as frentes da migração trocarem ícones sem cada uma escolher um desenho diferente.
 * Use o nome semântico quando existir (`IconGira`, `IconPorta`, `IconSenha`...); para o resto,
 * consulte `MUI_TO_LUCIDE` e importe de 'lucide-react'.
 *
 *   import { IconGira, IconEditar, IconExcluir } from '@/lib/icons';
 *   <Button size="sm"><IconEditar /> Editar</Button>
 *
 * Tamanho: o Button já dimensiona `svg` (16px); fora dele use `className="size-5"`.
 * Contagem (grep em src, 2026-10-05): os 80 ícones MUI mais usados estão mapeados abaixo.
 */
import {
  ArrowDown,
  ArrowDownUp,
  ArrowLeft,
  ArrowUp,
  BookOpen,
  Building2,
  Calendar,
  CalendarDays,
  ChartColumn,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  CircleCheck,
  CircleX,
  ClipboardList,
  Clock,
  CookingPot,
  Copy,
  CreditCard,
  DoorOpen,
  Drum,
  Download,
  EllipsisVertical,
  ExternalLink,
  Eye,
  EyeOff,
  Flame,
  Flower2,
  Globe,
  GraduationCap,
  HeartHandshake,
  Headset,
  History,
  Hourglass,
  Info,
  Landmark,
  LayoutDashboard,
  Leaf,
  Lock,
  LogOut,
  Mail,
  MapPin,
  Menu,
  MessageCircle,
  Moon,
  MoveRight,
  Package,
  Pencil,
  Plus,
  Printer,
  QrCode,
  RefreshCw,
  Save,
  Search,
  Send,
  Settings,
  Shield,
  SlidersHorizontal,
  Sparkles,
  SprayCan,
  Sprout,
  Star,
  Sun,
  Tag,
  Ticket,
  Trash2,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Undo2,
  User,
  UserPlus,
  Users,
  Wallet,
  Waves,
  X,
  type LucideIcon,
} from 'lucide-react';

/**
 * Nome do ícone MUI (sem o sufixo `Icon`, com ou sem `Rounded`/`Outlined`) → componente lucide.
 * Ordenado pela frequência de uso em `src` na data da fase 1.
 */
export const MUI_TO_LUCIDE: Record<string, LucideIcon> = {
  Refresh: RefreshCw,
  RefreshRounded: RefreshCw,
  Delete: Trash2,
  Add: Plus,
  Edit: Pencil,
  CheckCircle: CircleCheck,
  CheckCircleRounded: CircleCheck,
  Search: Search,
  SearchRounded: Search,
  People: Users,
  PeopleAltRounded: Users,
  Groups: Users,
  ConfirmationNumber: Ticket,
  ConfirmationNumberRounded: Ticket,
  Star: Star,
  StarRounded: Star,
  ArrowBack: ArrowLeft,
  WhatsApp: MessageCircle,
  WarningAmber: TriangleAlert,
  WarningAmberRounded: TriangleAlert,
  Warning: TriangleAlert,
  TrendingUp: TrendingUp,
  TrendingUpRounded: TrendingUp,
  LockOutlined: Lock,
  Lock: Lock,
  Event: CalendarDays,
  EventAvailableRounded: CalendarDays,
  CalendarMonth: Calendar,
  Download: Download,
  DownloadRounded: Download,
  SendRounded: Send,
  Send: Send,
  Save: Save,
  Menu: Menu,
  ErrorOutline: CircleAlert,
  CheckRounded: Check,
  Check: Check,
  Visibility: Eye,
  VisibilityOff: EyeOff,
  UndoRounded: Undo2,
  Settings: Settings,
  OpenInNewRounded: ExternalLink,
  OpenInNew: ExternalLink,
  Inventory2: Package,
  CloseRounded: X,
  Close: X,
  Clear: X,
  CancelRounded: CircleX,
  Cancel: CircleX,
  BarChart: ChartColumn,
  ArrowUpward: ArrowUp,
  ArrowDownward: ArrowDown,
  AccountBalanceWallet: Wallet,
  AccountBalance: Landmark,
  TuneRounded: SlidersHorizontal,
  TrendingFlatRounded: MoveRight,
  TrendingDownRounded: TrendingDown,
  TrendingDown: TrendingDown,
  SwapVert: ArrowDownUp,
  SupportAgentRounded: Headset,
  SelfImprovement: Flower2,
  Security: Shield,
  School: GraduationCap,
  Place: MapPin,
  MoreVert: EllipsisVertical,
  MeetingRoom: DoorOpen,
  LogoutRounded: LogOut,
  Logout: LogOut,
  LightModeRounded: Sun,
  DarkModeRounded: Moon,
  Language: Globe,
  InfoOutlined: Info,
  HourglassEmpty: Hourglass,
  History: History,
  ExpandMoreRounded: ChevronDown,
  ExpandMore: ChevronDown,
  ExpandLessRounded: ChevronUp,
  ExpandLess: ChevronUp,
  ChevronLeft: ChevronLeft,
  ChevronRight: ChevronRight,
  Diversity3: HeartHandshake,
  Dashboard: LayoutDashboard,
  CreditCard: CreditCard,
  Category: Tag,
  BusinessRounded: Building2,
  Business: Building2,
  AutoAwesomeRounded: Sparkles,
  Person: User,
  PersonAdd: UserPlus,
  Email: Mail,
  AccessTime: Clock,
  ContentCopy: Copy,
  Print: Printer,
  QrCode2: QrCode,
};

/** Resolve um nome MUI (aceita o sufixo `Icon`) para o ícone lucide, ou undefined. */
export function lucideFor(muiName: string): LucideIcon | undefined {
  return MUI_TO_LUCIDE[muiName.replace(/Icon$/, '')];
}

// ── Nomes semânticos do produto ──────────────────────────────────────────────
// Entidades
export const IconGira = CalendarDays;
export const IconPorta = DoorOpen;
export const IconSenha = Ticket;
export const IconMedium = Flower2;
export const IconAssociado = HeartHandshake;
export const IconUsuario = User;
export const IconUsuarios = Users;
export const IconEstoque = Package;
export const IconFinanceiro = Wallet;
export const IconConta = Landmark;
export const IconCurso = GraduationCap;
export const IconTerreiro = Building2;
export const IconPlano = CreditCard;
export const IconSuporte = Headset;
export const IconWhatsApp = MessageCircle;
export const IconRelatorio = ChartColumn;
export const IconDashboard = LayoutDashboard;
export const IconConfiguracoes = Settings;
export const IconAuditoria = History;
export const IconPermissao = Shield;
export const IconSite = Globe;
export const IconLocal = MapPin;
export const IconQrCode = QrCode;

// Ações
export const IconNovo = Plus;
export const IconEditar = Pencil;
export const IconExcluir = Trash2;
export const IconSalvar = Save;
export const IconAtualizar = RefreshCw;
export const IconBuscar = Search;
export const IconFiltrar = SlidersHorizontal;
export const IconFechar = X;
export const IconVoltar = ArrowLeft;
export const IconAvancar = ChevronRight;
export const IconEnviar = Send;
export const IconBaixar = Download;
export const IconImprimir = Printer;
export const IconCopiar = Copy;
export const IconDesfazer = Undo2;
export const IconAbrirExterno = ExternalLink;
export const IconMenu = Menu;
export const IconMais = EllipsisVertical;
export const IconSair = LogOut;
export const IconMostrar = Eye;
export const IconOcultar = EyeOff;
export const IconOrdenar = ArrowDownUp;
export const IconExpandir = ChevronDown;
export const IconRecolher = ChevronUp;

// Estados
export const IconSucesso = CircleCheck;
export const IconErro = CircleAlert;
export const IconAviso = TriangleAlert;
export const IconInfo = Info;
export const IconCancelado = CircleX;
export const IconConfirmado = Check;
export const IconPendente = Hourglass;
export const IconHorario = Clock;
export const IconBloqueado = Lock;
export const IconDestaque = Star;
export const IconNovidade = Sparkles;
export const IconSubiu = TrendingUp;
export const IconDesceu = TrendingDown;
export const IconEstavel = MoveRight;
export const IconClaro = Sun;
export const IconEscuro = Moon;

// Ícones dos tipos de atividade da casa (AM-08) — lista fechada, chaves espelhadas em
// `constants/atividades.ts` e no CHECK `ck_atividade_tipos_icone` (migração 078).
export const ICONES_DE_ATIVIDADE: Record<string, LucideIcon> = {
  gira: CalendarDays,
  faxina: SprayCan,
  vela: Flame,
  flor: Flower2,
  organizacao: ClipboardList,
  curso: GraduationCap,
  desenvolvimento: Sprout,
  reuniao: Users,
  atabaque: Drum,
  cozinha: CookingPot,
  estudo: BookOpen,
  estrela: Star,
  folha: Leaf,
  agua: Waves,
};

/** Ícone do tipo de atividade (chave desconhecida → estrela). */
export function iconeDaAtividade(chave: string | null | undefined): LucideIcon {
  return (chave && ICONES_DE_ATIVIDADE[chave]) || Star;
}

export type { LucideIcon };
