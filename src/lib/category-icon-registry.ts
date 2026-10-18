/**
 * Category Icon Registry
 * -----------------------
 * A curated set of vector icons (from lucide-react) grouped into sections for the
 * icon picker on the Add/Edit Category screen, plus the color palette used there.
 *
 * Icons are referenced by a stable string key (e.g. "food.utensils") so the choice
 * can be persisted to the DB (custom categories) or localStorage (default categories)
 * and rendered later via `getIconComponent(key)`.
 */

import {
  // Food & Dining
  Utensils, UtensilsCrossed, CupSoda, Coffee, Pizza, Apple, Beef, Egg,
  Sandwich, IceCream, Cake, Wine, Beer, Milk, Soup, Salad, Fish, Candy,
  // Travel
  Route, Fuel, ParkingCircle, Car, Bike, Bus, TrainFront, Plane, MapPin,
  Ship, Caravan, Luggage, Compass, Mountain, Tent,
  // Shopping
  ShoppingCart, Tag, ShoppingBag, Shirt, Footprints, Sofa, Refrigerator,
  Store, Gift, Watch, Gem, Glasses,
  // Family & Home
  Users, Baby, Home, PawPrint, Heart, Dog, Cat, Flower2, TreePine, Bed,
  // Bills & Finance
  Receipt, FileText, CreditCard, Landmark, Wallet, PiggyBank, Banknote,
  Coins, TrendingUp, TrendingDown, DollarSign, Percent, Calculator,
  // Health
  HeartPulse, Pill, Stethoscope, Activity, Dumbbell, Cross, Syringe,
  // Entertainment
  Gamepad2, Film, Music, Clapperboard, Tv, Headphones, Ticket, PartyPopper,
  Radio, Dices, Guitar,
  // Utilities & Tech
  Lightbulb, Wifi, Smartphone, Phone, Zap, Droplet, Flame, Plug,
  Laptop, Monitor, Wrench, Hammer, Cpu, Cloud,
  // Education & Work
  GraduationCap, BookOpen, Book, Pencil, Briefcase, Building2, Building,
  School, Library, Backpack,
  // Personal care
  Bath, Scissors, Sparkles, Shield, Droplets,
  // Misc / fallback
  MoreHorizontal, Star, Bookmark, Flag, Bell, Camera, Palette, Globe,
  Umbrella, Sun, Gift as GiftIcon, HandCoins, Repeat, Undo2, Trophy,
  type LucideIcon,
} from 'lucide-react'

export interface IconSection {
  title: string
  icons: { key: string; Icon: LucideIcon }[]
}

export const ICON_SECTIONS: IconSection[] = [
  {
    title: 'Food & Dining',
    icons: [
      { key: 'food.utensils', Icon: UtensilsCrossed },
      { key: 'food.utensils2', Icon: Utensils },
      { key: 'food.pizza', Icon: Pizza },
      { key: 'food.apple', Icon: Apple },
      { key: 'food.salad', Icon: Salad },
      { key: 'food.beef', Icon: Beef },
      { key: 'food.sandwich', Icon: Sandwich },
      { key: 'food.soup', Icon: Soup },
      { key: 'food.fish', Icon: Fish },
      { key: 'food.egg', Icon: Egg },
      { key: 'food.milk', Icon: Milk },
      { key: 'food.icecream', Icon: IceCream },
      { key: 'food.cake', Icon: Cake },
      { key: 'food.candy', Icon: Candy },
      { key: 'food.coffee', Icon: Coffee },
      { key: 'food.soda', Icon: CupSoda },
      { key: 'food.wine', Icon: Wine },
      { key: 'food.beer', Icon: Beer },
    ],
  },
  {
    title: 'Travel',
    icons: [
      { key: 'travel.route', Icon: Route },
      { key: 'travel.fuel', Icon: Fuel },
      { key: 'travel.parking', Icon: ParkingCircle },
      { key: 'travel.car', Icon: Car },
      { key: 'travel.bike', Icon: Bike },
      { key: 'travel.bus', Icon: Bus },
      { key: 'travel.train', Icon: TrainFront },
      { key: 'travel.plane', Icon: Plane },
      { key: 'travel.map', Icon: MapPin },
      { key: 'travel.ship', Icon: Ship },
      { key: 'travel.caravan', Icon: Caravan },
      { key: 'travel.luggage', Icon: Luggage },
      { key: 'travel.compass', Icon: Compass },
      { key: 'travel.mountain', Icon: Mountain },
      { key: 'travel.tent', Icon: Tent },
    ],
  },
  {
    title: 'Shopping',
    icons: [
      { key: 'shop.cart', Icon: ShoppingCart },
      { key: 'shop.tag', Icon: Tag },
      { key: 'shop.bag', Icon: ShoppingBag },
      { key: 'shop.shirt', Icon: Shirt },
      { key: 'shop.shoe', Icon: Footprints },
      { key: 'shop.sofa', Icon: Sofa },
      { key: 'shop.fridge', Icon: Refrigerator },
      { key: 'shop.store', Icon: Store },
      { key: 'shop.gift', Icon: Gift },
      { key: 'shop.watch', Icon: Watch },
      { key: 'shop.gem', Icon: Gem },
      { key: 'shop.glasses', Icon: Glasses },
    ],
  },
  {
    title: 'Family & Home',
    icons: [
      { key: 'family.users', Icon: Users },
      { key: 'family.baby', Icon: Baby },
      { key: 'family.home', Icon: Home },
      { key: 'family.pet', Icon: PawPrint },
      { key: 'family.dog', Icon: Dog },
      { key: 'family.cat', Icon: Cat },
      { key: 'family.heart', Icon: Heart },
      { key: 'family.flower', Icon: Flower2 },
      { key: 'family.tree', Icon: TreePine },
      { key: 'family.bed', Icon: Bed },
    ],
  },
  {
    title: 'Bills & Finance',
    icons: [
      { key: 'bill.receipt', Icon: Receipt },
      { key: 'bill.file', Icon: FileText },
      { key: 'bill.card', Icon: CreditCard },
      { key: 'bill.bank', Icon: Landmark },
      { key: 'bill.wallet', Icon: Wallet },
      { key: 'bill.piggy', Icon: PiggyBank },
      { key: 'bill.cash', Icon: Banknote },
      { key: 'bill.coins', Icon: Coins },
      { key: 'bill.trendup', Icon: TrendingUp },
      { key: 'bill.trenddown', Icon: TrendingDown },
      { key: 'bill.dollar', Icon: DollarSign },
      { key: 'bill.percent', Icon: Percent },
      { key: 'bill.calc', Icon: Calculator },
      { key: 'bill.handcoins', Icon: HandCoins },
    ],
  },
  {
    title: 'Health',
    icons: [
      { key: 'health.pulse', Icon: HeartPulse },
      { key: 'health.pill', Icon: Pill },
      { key: 'health.stethoscope', Icon: Stethoscope },
      { key: 'health.activity', Icon: Activity },
      { key: 'health.dumbbell', Icon: Dumbbell },
      { key: 'health.cross', Icon: Cross },
      { key: 'health.syringe', Icon: Syringe },
    ],
  },
  {
    title: 'Entertainment',
    icons: [
      { key: 'fun.gamepad', Icon: Gamepad2 },
      { key: 'fun.film', Icon: Film },
      { key: 'fun.music', Icon: Music },
      { key: 'fun.clapper', Icon: Clapperboard },
      { key: 'fun.tv', Icon: Tv },
      { key: 'fun.headphones', Icon: Headphones },
      { key: 'fun.ticket', Icon: Ticket },
      { key: 'fun.party', Icon: PartyPopper },
      { key: 'fun.radio', Icon: Radio },
      { key: 'fun.dice', Icon: Dices },
      { key: 'fun.guitar', Icon: Guitar },
    ],
  },
  {
    title: 'Utilities & Tech',
    icons: [
      { key: 'util.bulb', Icon: Lightbulb },
      { key: 'util.wifi', Icon: Wifi },
      { key: 'util.phone', Icon: Smartphone },
      { key: 'util.call', Icon: Phone },
      { key: 'util.zap', Icon: Zap },
      { key: 'util.water', Icon: Droplet },
      { key: 'util.flame', Icon: Flame },
      { key: 'util.plug', Icon: Plug },
      { key: 'util.laptop', Icon: Laptop },
      { key: 'util.monitor', Icon: Monitor },
      { key: 'util.wrench', Icon: Wrench },
      { key: 'util.hammer', Icon: Hammer },
      { key: 'util.cpu', Icon: Cpu },
      { key: 'util.cloud', Icon: Cloud },
    ],
  },
  {
    title: 'Education & Work',
    icons: [
      { key: 'edu.cap', Icon: GraduationCap },
      { key: 'edu.bookopen', Icon: BookOpen },
      { key: 'edu.book', Icon: Book },
      { key: 'edu.pencil', Icon: Pencil },
      { key: 'edu.briefcase', Icon: Briefcase },
      { key: 'edu.building2', Icon: Building2 },
      { key: 'edu.building', Icon: Building },
      { key: 'edu.school', Icon: School },
      { key: 'edu.library', Icon: Library },
      { key: 'edu.backpack', Icon: Backpack },
    ],
  },
  {
    title: 'Personal Care',
    icons: [
      { key: 'care.bath', Icon: Bath },
      { key: 'care.scissors', Icon: Scissors },
      { key: 'care.sparkles', Icon: Sparkles },
      { key: 'care.shield', Icon: Shield },
      { key: 'care.droplets', Icon: Droplets },
    ],
  },
  {
    title: 'Other',
    icons: [
      { key: 'misc.more', Icon: MoreHorizontal },
      { key: 'misc.star', Icon: Star },
      { key: 'misc.bookmark', Icon: Bookmark },
      { key: 'misc.flag', Icon: Flag },
      { key: 'misc.bell', Icon: Bell },
      { key: 'misc.camera', Icon: Camera },
      { key: 'misc.palette', Icon: Palette },
      { key: 'misc.globe', Icon: Globe },
      { key: 'misc.umbrella', Icon: Umbrella },
      { key: 'misc.sun', Icon: Sun },
      { key: 'misc.gift', Icon: GiftIcon },
      { key: 'misc.repeat', Icon: Repeat },
      { key: 'misc.refund', Icon: Undo2 },
      { key: 'misc.trophy', Icon: Trophy },
    ],
  },
]

/** Flat lookup table: icon key -> component. Built once from ICON_SECTIONS. */
const ICON_MAP: Record<string, LucideIcon> = (() => {
  const map: Record<string, LucideIcon> = {}
  ICON_SECTIONS.forEach((section) => {
    section.icons.forEach(({ key, Icon }) => {
      map[key] = Icon
    })
  })
  return map
})()

export const DEFAULT_ICON_KEY = 'misc.more'

/** Resolve an icon key to its component, falling back to a neutral icon. */
export function getIconComponent(key?: string): LucideIcon {
  if (key && ICON_MAP[key]) return ICON_MAP[key]
  return MoreHorizontal
}

/**
 * Color palette for the category color picker.
 * Mirrors the swatch grid in the design — a wide spread of hues at a muted
 * saturation that reads well on dark backgrounds.
 */
export const CATEGORY_COLORS: string[] = [
  '#9ca3af', '#f59e0b', '#38bdf8', '#8b5cf6', '#86efac', '#ef4444', '#fb923c', '#c084fc', '#f87171',
  '#a3e635', '#5eead4', '#94a3b8', '#818cf8', '#2dd4bf', '#f472b6', '#34d399', '#22c55e', '#fda4af',
  '#93c5fd', '#fde047', '#4ade80', '#f0abfc', '#d946ef', '#7dd3fc', '#bef264', '#d6d3d1',
  '#6366f1', '#eab308', '#6ee7b7', '#fb7185', '#f97316', '#ec4899', '#db2777', '#f9a8d4',
]

export const DEFAULT_CATEGORY_COLOR = '#f97316'
