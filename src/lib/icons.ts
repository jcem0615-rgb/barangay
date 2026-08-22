import {
  Coins,
  HardHat,
  Stethoscope,
  Store,
  HeartHandshake,
  ScrollText,
  FileText,
  Wallet,
  IdCard,
  Baby,
  Heart,
  Cross,
  Home,
  Users,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'

export const ICONS: Record<string, LucideIcon> = {
  store: Store,
  coins: Coins,
  'hard-hat': HardHat,
  stethoscope: Stethoscope,
  'hand-heart': HeartHandshake,
  'scroll-text': ScrollText,
  'file-text': FileText,
  wallet: Wallet,
  'id-card': IdCard,
  baby: Baby,
  heart: Heart,
  cross: Cross,
  home: Home,
  users: Users,
  'shield-check': ShieldCheck,
}

export function resolveIcon(name: string): LucideIcon {
  return ICONS[name] ?? FileText
}
