/**
 * Barrel du design system SETRAG.
 *
 * Point d'entrée unique consommé par le bundle claude.ai/design. Les
 * applications continuent d'importer par chemin (`@workspace/ui/components/*`,
 * `@workspace/ui/voyage/*`, `@workspace/ui/marque`) pour garder le
 * tree-shaking ; ce fichier ne remplace pas ces imports.
 */

// ── Marque ──
export { Logo, LogoAnime, SigneRuban } from "./marque"

// ── Primitives ──
export { Avatar } from "./components/avatar"
export { Badge, badgeVariants } from "./components/badge"
export { Button, buttonVariants } from "./components/button"
export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "./components/card"
export { Checkbox, Radio, RadioGroup, Switch } from "./components/choice"
export { CodeAztec } from "./components/code-aztec"
export { CodeOtp } from "./components/code-otp"
export { Tenue, formatRebours, useCompteARebours } from "./components/compte-a-rebours"
export { Compteur } from "./components/compteur"
export { EmptyState, SAttente, SkeletonLines } from "./components/empty-state"
export { Feuille } from "./components/feuille"
export { Field, Input, Textarea, SelectNative } from "./components/field"
export { IndicateurRuban, NavRuban, useIndicateur } from "./components/indicateur"
export { InlineMessage, ToastBar, inlineMessageVariants } from "./components/inline-message"
export { Jours } from "./components/jours"
export { LigneArrets } from "./components/ligne-arrets"
export { SchemaLigne } from "./components/schema-ligne"
export { SegmentedControl } from "./components/segmented-control"
export { Separator } from "./components/separator"
export { Skeleton } from "./components/skeleton"
export { Stepper } from "./components/stepper"
export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants } from "./components/tabs"
export { Tag, tagVariants } from "./components/tag"
export { ThemeScope } from "./components/theme-scope"
export { Chargeur, Voie } from "./components/voie"

// ── Composants métier voyage ──
export { BandeauTrafic } from "./components/voyage/bandeau-trafic"
export { Billet } from "./components/voyage/billet"
export { CarteTrajet } from "./components/voyage/carte-trajet"
export { ChoixCartes, MarqueOperateur } from "./components/voyage/choix"
export { Recapitulatif } from "./components/voyage/recapitulatif"
export { PastilleBillet, PastilleDesserte } from "./components/voyage/statut"
export { TableauDeparts } from "./components/voyage/tableau-departs"

// ── Utilitaires ──
export { cn } from "./lib/utils"
export {
  formatPrice,
  formatPriceCompact,
  formatTime,
  formatDuration,
  spellTime,
  DEFAULT_CURRENCY,
  DEFAULT_LOCALE,
} from "./lib/format"

// ── Types ──
export type { LogoProps, LogoAnimeProps, SigneRubanProps } from "./marque"
export type { AvatarProps } from "./components/avatar"
export type { ButtonProps } from "./components/button"
export type { EmptyStateProps } from "./components/empty-state"
export type { FeuilleProps } from "./components/feuille"
export type { FieldProps } from "./components/field"
export type { IndicateurRubanProps, NavRubanProps, PositionIndicateur } from "./components/indicateur"
export type { InlineMessageProps } from "./components/inline-message"
export type { Jour, JoursProps } from "./components/jours"
export type { Arret, LigneArretsProps } from "./components/ligne-arrets"
export type { GareLigne, SchemaLigneProps, TrainLigne } from "./components/schema-ligne"
export type { SegmentedControlProps, SegmentedOption } from "./components/segmented-control"
export type { StepperProps, StepperStep } from "./components/stepper"
export type { TagProps } from "./components/tag"
export type { ThemeScopeProps } from "./components/theme-scope"
export type { VoieProps } from "./components/voie"
export type { BandeauTraficProps } from "./components/voyage/bandeau-trafic"
export type { BilletEtat, BilletProps } from "./components/voyage/billet"
export type { CarteTrajetProps, PointTrajet } from "./components/voyage/carte-trajet"
export type { OptionChoix } from "./components/voyage/choix"
export type { LigneRecap, RecapitulatifProps } from "./components/voyage/recapitulatif"
export type { StatutBillet, StatutDesserte } from "./components/voyage/statut"
export type { Depart } from "./components/voyage/tableau-departs"
