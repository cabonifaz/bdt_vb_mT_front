import {
  Angry, Archive, ClipboardList, Briefcase, FileUser, ChartColumn, Minus, TrendingDown, TrendingUp, TriangleAlert, User, Building2, CalendarCheck, Check, ChevronLeft, ChevronRight, Clock, Copy, Download, ExternalLink, Eye, EyeOff,
  FileCheck, FileText, Funnel, Github, Heart, Home, IdCard, KeyRound, Laptop, LayoutDashboard, Linkedin, LogOut, Mail, MapPin, Menu, Palette,
  Pencil, Phone, PhoneCall, Pin, Plus, Search, Star, Trash2, Upload, UserCog, Users, Video, Wallet, X, type LucideIcon,
} from 'lucide-react';

// Íconos de lucide-react (misma librería y mismos íconos por función que el sistema original).
const icons: Record<string, LucideIcon> = {
  home: LayoutDashboard,
  talents: Home,            // original: «Inicio» = talentos
  interviews: Users,        // original: Entrevistas
  requirements: ClipboardList, // original: Requerimientos
  ban: Angry,               // original: Lista negra
  heart: Heart,
  building: Building2,
  fileCheck: FileCheck,
  brush: Palette,
  users: UserCog,
  key: KeyRound,
  check: Check,
  menu: Menu,
  chevronLeft: ChevronLeft,
  chevronRight: ChevronRight,
  eye: Eye,
  eyeOff: EyeOff,
  pin: Pin,
  plus: Plus,
  x: X,
  filter: Funnel,
  search: Search,
  mail: Mail,
  phone: Phone,
  phoneCall: PhoneCall,
  idcard: IdCard,
  linkedin: Linkedin,
  github: Github,
  clock: Clock,
  laptop: Laptop,
  wallet: Wallet,
  copy: Copy,
  edit: Pencil,
  trash: Trash2,
  file: FileText,
  archive: Archive,
  calendar: CalendarCheck,
  video: Video,
  mapPin: MapPin,
  external: ExternalLink,
  upload: Upload,
  download: Download,
  star: Star,
  logout: LogOut,
  briefcase: Briefcase,
  alert: TriangleAlert,
  chart: ChartColumn,
  trendUp: TrendingUp,
  trendDown: TrendingDown,
  minus: Minus,
  user: User,
  cv: FileUser,
};

export function Icon({ name, size = 20, title, filled }: { name: string; size?: number; title?: string; filled?: boolean }) {
  const C = icons[name] ?? X;
  return <C size={size} fill={filled ? 'currentColor' : 'none'} aria-hidden={title ? undefined : true} role={title ? 'img' : undefined} aria-label={title} />;
}
