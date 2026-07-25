/**
 * Barrel du design system SETRAG.
 *
 * Point d'entrée unique consommé par le bundle claude.ai/design. Les
 * applications continuent d'importer par chemin (`@workspace/ui/components/*`)
 * pour garder le tree-shaking ; ce fichier ne remplace pas ces imports.
 */

// ── Primitives ──
export { Badge, badgeVariants } from "./components/badge"
export { Button, buttonVariants } from "./components/button"
export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "./components/card"
export { Checkbox, Radio, RadioGroup, Switch } from "./components/choice"
export { EmptyState, SkeletonLines } from "./components/empty-state"
export { Field, Input, Textarea, SelectNative } from "./components/field"
export {
  InlineMessage,
  ToastBar,
  inlineMessageVariants,
} from "./components/inline-message"
export { Separator } from "./components/separator"
export { Skeleton } from "./components/skeleton"
export { Stepper } from "./components/stepper"
export { Tag, tagVariants } from "./components/tag"
export { ThemeScope } from "./components/theme-scope"
export {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  tabsListVariants,
} from "./components/tabs"

// ── Composants métier voyage ──
export { CheckoutSummary } from "./components/voyage/checkout-summary"
export { PriceCalendar } from "./components/voyage/price-calendar"
export { Ticket, TICKET_STATE_LABELS } from "./components/voyage/ticket"
export { TrafficBanner } from "./components/voyage/traffic-banner"
export { TripResultCard } from "./components/voyage/trip-result-card"
export { TripSearchBar, SearchSlot } from "./components/voyage/trip-search-bar"

// ── Utilitaires ──
export { cn } from "./lib/utils"
export {
  formatPrice,
  formatTime,
  formatDuration,
  spellTime,
  DEFAULT_CURRENCY,
  DEFAULT_LOCALE,
} from "./lib/format"

// ── Types ──
export type { ButtonProps } from "./components/button"
export type { TagProps } from "./components/tag"
export type { ThemeScopeProps } from "./components/theme-scope"
export type { FieldProps } from "./components/field"
export type { InlineMessageProps } from "./components/inline-message"
export type { StepperProps, StepperStep } from "./components/stepper"
export type { EmptyStateProps } from "./components/empty-state"
export type { CheckoutSummaryProps, CheckoutLine, PaymentOption } from "./components/voyage/checkout-summary"
export type { PriceCalendarProps, PriceCalendarDay } from "./components/voyage/price-calendar"
export type { TicketProps, TicketState } from "./components/voyage/ticket"
export type { TrafficBannerProps } from "./components/voyage/traffic-banner"
export type { TripResultCardProps, TripCardState } from "./components/voyage/trip-result-card"
export type { TripSearchBarProps, TripKind } from "./components/voyage/trip-search-bar"
