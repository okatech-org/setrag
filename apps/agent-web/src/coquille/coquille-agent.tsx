"use client"

import {
  ChevronDown,
  ChevronRight,
  LockOpen,
  Lock,
  LogOut,
  Menu,
  Settings,
  WifiOff,
  X,
} from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Suspense, useEffect, useMemo, useState, type ReactNode } from "react"

import { useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { moduleCodeForResource } from "@workspace/backend/modules"
import {
  EXTERNAL_STAKEHOLDER_ROLES,
  type AppRole,
} from "@workspace/backend/permissions"
import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { NavRubanVertical } from "@workspace/ui/components/indicateur"
import { cn } from "@workspace/ui/lib/utils"
import { Logo } from "@workspace/ui/marque"

import { usePortalSession } from "@/components/portal-guard"
import { useModuleNavigationAccesses } from "@/components/module-access-navigation"
import { useOnlineStatus } from "@/hooks/use-online-status"
import { formatTime, formatXaf, initials } from "@/lib/format"
import {
  asAppRole,
  canAccessManagementPath,
  canRole,
  MANAGEMENT_DESTINATIONS,
  portalForRole,
  SELLER_ROLES,
} from "@/lib/portal-access"
import { ROLE_LABELS } from "@/lib/roles"

import { FiletNavigation } from "./filet-navigation"
import {
  ENTREES_TRANSVERSES,
  GROUPES_MENU,
  ICONES_MODULES,
  TOUCHES_MODULES,
  chemineVers,
  entreeAutorisee,
  entreeCourante,
  type EntreeMenu,
} from "./navigation"
import {
  CHEMIN_REGLAGES,
  RaccourcisProvider,
  useToucheRaccourci,
} from "./raccourcis"

const E2E_MODE =
  process.env.NODE_ENV !== "production" &&
  process.env.NEXT_PUBLIC_E2E_MODE === "1"

export interface UtilisateurCoquille {
  firstName?: string
  lastName?: string
  matricule?: string
  role?: string
}

export interface CoquilleAgentProps {
  children: ReactNode
  /** Identité affichée ; lue dans la session quand elle est absente. */
  utilisateur?: UtilisateurCoquille
  /** Périmètre de travail : point de vente, direction, site. */
  perimetre?: string
  /** Dernier maillon du fil d'Ariane (titre d'un dossier ouvert). */
  titre?: string
  /**
   * Rubriques d'un espace transverse (Direction générale), rendues en tête du
   * menu. Le rappel reçoit la fermeture du tiroir mobile.
   */
  rubriques?: (contexte: { onNavigate: () => void }) => ReactNode
}

/** Heure de Libreville, rafraîchie au changement de minute ; vide avant hydratation. */
function useHorlogeLibreville() {
  const [heure, setHeure] = useState("")
  useEffect(() => {
    let minuteur = 0
    const battre = () => {
      const maintenant = new Date()
      setHeure(formatTime(maintenant))
      minuteur = window.setTimeout(
        battre,
        60_000 - (maintenant.getTime() % 60_000) + 250
      )
    }
    battre()
    return () => window.clearTimeout(minuteur)
  }, [])
  return heure
}

const dateDuJour = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "Africa/Libreville",
})

interface GroupeVisible {
  cle: string
  libelle: string
  entrees: (EntreeMenu & { cle: string })[]
}

/** Groupes et entrées que le rôle peut ouvrir — les mêmes gardes que les pages. */
function useMenu(role: AppRole | undefined) {
  const { accesses, loading } = useModuleNavigationAccesses(role)
  return useMemo<GroupeVisible[]>(() => {
    if (!role) return []
    // Une rubrique dont le module n'est pas activé pour ce compte (incidents →
    // Sécurité, journal comptable → Finances) mènerait à un écran fermé.
    const modulesOuverts = new Set(accesses.map((acces) => acces.code))
    const moduleOuvert = (href: string) => {
      if (loading) return true
      const ressource = MANAGEMENT_DESTINATIONS.find(
        (destination) => destination.href === href
      )?.resource
      const code = ressource ? moduleCodeForResource(ressource) : undefined
      return !code || modulesOuverts.has(code)
    }
    // Un rôle n'ouvre qu'un portail (garde des pages) : le menu n'en montre
    // pas d'autre.
    const portail = portalForRole(role)
    const groupes: GroupeVisible[] = GROUPES_MENU.filter(
      (groupe) => groupe.espace === portail
    ).map((groupe) => ({
      cle: groupe.cle,
      libelle: groupe.libelle,
      entrees: groupe.entrees
        .filter(
          (entree) =>
            entreeAutorisee(role, groupe, entree) &&
            (groupe.espace === "vente" || moduleOuvert(entree.href))
        )
        .map((entree) => ({ ...entree, cle: entree.href })),
    }))
    const modules = accesses
      .filter((acces) => acces.code !== "voyageurs")
      .map((acces) => ({
        cle: acces.code,
        href: acces.route,
        libelle: acces.label,
        icone: ICONES_MODULES[acces.code],
        touche: TOUCHES_MODULES[acces.code],
      }))
    const transverses = ENTREES_TRANSVERSES.filter((entree) =>
      canAccessManagementPath(role, entree.href)
    )
    if (portail === "gestion")
      groupes.push({
        cle: "modules",
        libelle: "Modules",
        entrees: [...modules, ...transverses],
      })
    return groupes.filter((groupe) => groupe.entrees.length > 0)
  }, [role, accesses, loading])
}

function MenuLateral({
  groupes,
  chemin,
  onNavigate,
}: {
  groupes: GroupeVisible[]
  chemin: string
  onNavigate?: () => void
}) {
  const toutes = groupes.flatMap((groupe) => groupe.entrees)
  const courante = entreeCourante(chemin, toutes)
  return (
    <NavRubanVertical
      actif={courante?.href ?? null}
      aria-label="Menu du portail"
      className="grid gap-4 px-3 pb-4"
      indicateurClassName="left-3"
    >
      {groupes.map((groupe) => (
        <div key={groupe.cle} className="grid gap-0.5">
          <h2 className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-[0.07em] text-ink-faint uppercase">
            {groupe.libelle}
          </h2>
          {groupe.entrees.map((entree) => {
            const actif = entree === courante
            const Icone = entree.icone
            return (
              <Link
                key={entree.cle}
                href={entree.href as Route}
                data-actif={actif}
                aria-current={actif ? "page" : undefined}
                onClick={onNavigate}
                className={cn(
                  "flex min-h-11 items-center gap-2.5 rounded-sm pr-2.5 pl-3.5 text-[14px] transition-colors duration-[var(--dur-fast)]",
                  actif
                    ? "bg-accent-soft font-bold text-ink"
                    : "font-medium text-ink-muted hover:bg-surface-sunk hover:text-ink"
                )}
              >
                <Icone
                  aria-hidden
                  className={cn(
                    "size-[18px] shrink-0",
                    actif && "text-accent-ink"
                  )}
                />
                <span className="min-w-0 flex-1 truncate">
                  {entree.libelle}
                </span>
                <ToucheMenu href={entree.href} />
              </Link>
            )
          })}
        </div>
      ))}
    </NavRubanVertical>
  )
}

/** État de la caisse du vendeur, lu en direct ; lien vers la caisse. */
function PastilleCaisse() {
  const session = useQuery(api.functions.cash.mySession, E2E_MODE ? "skip" : {})
  if (session === undefined) return null
  if (session === null) {
    return (
      <Link
        href="/vente/caisse"
        className="inline-flex min-h-9 items-center gap-2 rounded-pill bg-warning-soft px-3 text-[13px] font-semibold text-warning-ink"
      >
        <Lock aria-hidden className="size-4" />
        Caisse fermée
      </Link>
    )
  }
  return (
    <Link
      href="/vente/caisse"
      className="inline-flex min-h-9 items-center gap-2 rounded-pill bg-success-soft px-3 text-[13px] font-semibold text-success-ink"
      title={`Caisse ouverte depuis ${formatTime(session.session.openedAt)}`}
    >
      <LockOpen aria-hidden className="size-4" />
      <span className="hidden xl:inline">Caisse ouverte</span>
      <span className="font-bold tabular-nums">
        {formatXaf(session.totalTtc)}
      </span>
    </Link>
  )
}

/** Touche du raccourci, quand l'agent garde les touches affichées. */
function ToucheMenu({ href }: { href: string }) {
  const touche = useToucheRaccourci(href)
  if (!touche) return null
  return (
    <kbd className="tabular hidden h-[22px] min-w-[22px] place-items-center rounded-[6px] border border-b-2 border-line-strong bg-surface px-1.5 text-[11px] text-ink-muted lg:grid">
      {touche}
    </kbd>
  )
}

/**
 * Bloc du compte, dans la barre du haut : il ouvre les réglages et la
 * déconnexion. Sous lg, seules les initiales restent ; le menu redonne le nom.
 */
function MenuCompte({
  identite,
  nomComplet,
  detail,
  session,
}: {
  identite: UtilisateurCoquille
  nomComplet: string
  detail: string
  session: ReturnType<typeof usePortalSession>
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Compte de ${nomComplet || "l'agent"} : réglages et déconnexion`}
        className="-my-1 flex min-h-11 items-center gap-2.5 rounded-md border-l border-line py-1 pr-2 pl-3 text-left transition-colors duration-[var(--dur-fast)] hover:bg-surface-sunk data-[state=open]:bg-surface-sunk"
      >
        <span
          aria-hidden
          className="grid size-[38px] shrink-0 place-items-center rounded-full bg-second-soft text-[13px] font-bold text-second-ink"
        >
          {initials(identite.firstName, identite.lastName)}
        </span>
        <span className="hidden min-w-0 leading-tight lg:grid">
          <span className="truncate text-[13.5px] font-semibold">
            {nomComplet || "Agent SETRAG"}
          </span>
          <small className="truncate text-[12px] text-ink-muted">
            {detail}
          </small>
        </span>
        <ChevronDown aria-hidden className="size-4 text-ink-muted" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="grid leading-tight lg:hidden">
          <span className="truncate text-[14px] font-semibold">
            {nomComplet || "Agent SETRAG"}
          </span>
          <small className="truncate text-[12.5px] text-ink-muted">
            {detail}
          </small>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="lg:hidden" />
        <DropdownMenuItem asChild>
          <Link href={CHEMIN_REGLAGES as Route}>
            <Settings />
            Réglages
          </Link>
        </DropdownMenuItem>
        {session ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="danger"
              disabled={session.signingOut}
              onSelect={() => void session.signOut()}
            >
              <LogOut />
              Se déconnecter
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * Cadre du portail agent : menu latéral à ruban, barre du haut (fil d'Ariane,
 * caisse, heure de Libreville, compte), contenu. Sous `lg`, le menu devient un
 * tiroir ouvert par le bouton de la barre.
 */
export function CoquilleAgent({
  children,
  utilisateur,
  perimetre,
  titre,
  rubriques,
}: CoquilleAgentProps) {
  const chemin = usePathname()
  const session = usePortalSession()
  const profil = session?.profile.user
  const identite: UtilisateurCoquille | undefined =
    utilisateur ??
    (profil
      ? {
          firstName: profil.firstName,
          lastName: profil.lastName,
          matricule: profil.matricule,
          role: profil.role,
        }
      : undefined)
  const role =
    E2E_MODE && !identite?.role
      ? ("admin_fonctionnel" as const)
      : asAppRole(identite?.role)
  const groupes = useMenu(role)
  const [tiroir, setTiroir] = useState(false)
  const horloge = useHorlogeLibreville()
  const enLigne = useOnlineStatus()
  const vendeur = Boolean(role && SELLER_ROLES.includes(role))
  const partenaire = Boolean(
    role && (EXTERNAL_STAKEHOLDER_ROLES as readonly AppRole[]).includes(role)
  )

  // Le tiroir se ferme quand la page change.
  const [cheminVu, setCheminVu] = useState(chemin)
  if (chemin !== cheminVu) {
    setCheminVu(chemin)
    setTiroir(false)
  }

  const toutes = groupes.flatMap((groupe) => groupe.entrees)
  const courante = entreeCourante(chemin, toutes)
  const groupeCourant = groupes.find((groupe) =>
    groupe.entrees.some((entree) => entree === courante)
  )
  // Le dernier maillon nomme la page quand elle est plus profonde que son
  // entrée de menu (un dossier, une sous-rubrique de module) ; sur la page de
  // l'entrée elle-même, il ferait doublon.
  const profonde =
    courante !== undefined &&
    chemin !== courante.href &&
    !chemineVers(chemin, "/vente/confirmation") &&
    !(courante.aussi ?? []).some((a) => chemineVers(a, chemin))
  // Hors menu (réglages), le titre de la page fait seul le fil.
  const fil = (
    courante
      ? [
          groupeCourant?.libelle,
          courante.libelle,
          profonde ? (titre ?? "Dossier") : undefined,
        ]
      : [titre]
  ).filter((maillon): maillon is string => Boolean(maillon))

  const nomComplet = identite
    ? [identite.firstName, identite.lastName].filter(Boolean).join(" ")
    : ""
  const libelleRole = role ? ROLE_LABELS[role] : undefined

  const lateral = (
    <>
      <div className="flex min-h-16 items-center gap-2 px-5">
        <Link
          href={(vendeur ? "/vente" : "/gestion") as Route}
          className="rounded-sm"
          aria-label="SETRAG — accueil du portail agent"
        >
          <Logo variante="compact" title="" className="h-[34px]" />
        </Link>
        <span className="ml-auto text-[11px] font-semibold tracking-[0.06em] text-ink-faint uppercase">
          {partenaire ? "Partenaire" : "Agent"}
        </span>
      </div>
      <div className="min-h-0 flex-1 [scrollbar-width:thin] overflow-y-auto">
        {rubriques ? (
          <div className="px-3 pb-3">
            {rubriques({ onNavigate: () => setTiroir(false) })}
          </div>
        ) : null}
        {groupes.length > 0 ? (
          <MenuLateral
            groupes={groupes}
            chemin={chemin}
            onNavigate={() => setTiroir(false)}
          />
        ) : (
          <p role="status" className="text-small px-6 py-4 text-ink-muted">
            Chargement des habilitations…
          </p>
        )}
      </div>
      <div className="grid gap-1 border-t border-line px-5 py-3 text-[12px] text-ink-muted">
        <b className="truncate text-[13px] font-semibold text-ink">
          {perimetre ?? libelleRole ?? "Portail agent"}
        </b>
        {enLigne ? (
          <span className="inline-flex items-center gap-1.5 font-semibold text-success-ink">
            <span
              aria-hidden
              className="size-2 animate-[st-veille_2.4s_ease-in-out_infinite] rounded-full bg-success"
            />
            En ligne · synchronisé
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 font-semibold text-warning-ink">
            <WifiOff aria-hidden className="size-3.5" />
            Hors réseau
          </span>
        )}
      </div>
    </>
  )

  return (
    <RaccourcisProvider groupes={groupes}>
      <div className="min-h-dvh bg-canvas text-ink lg:grid lg:grid-cols-[256px_minmax(0,1fr)]">
        <a
          href="#contenu"
          className="text-small sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:rounded-md focus:bg-surface focus:px-4 focus:py-3 focus:font-semibold"
        >
          Aller au contenu
        </a>
        <Suspense fallback={null}>
          <FiletNavigation />
        </Suspense>

        {/* Menu latéral : colonne collante au-delà de lg, tiroir en deçà. */}
        <aside
          id="menu-portail"
          aria-label="Navigation du portail"
          className={cn(
            "fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col border-r border-line bg-surface shadow-xl transition-[translate,visibility] duration-[var(--dur-slow)] ease-[var(--ease)]",
            "lg:visible lg:sticky lg:top-0 lg:z-auto lg:h-dvh lg:w-auto lg:translate-x-0 lg:shadow-none",
            tiroir ? "visible translate-x-0" : "invisible -translate-x-full"
          )}
        >
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="absolute top-3 right-3 lg:hidden"
            aria-label="Fermer le menu"
            onClick={() => setTiroir(false)}
          >
            <X />
          </Button>
          {lateral}
        </aside>
        {tiroir ? (
          <button
            type="button"
            aria-label="Fermer le menu"
            className="fixed inset-0 z-40 bg-ink/40 lg:hidden"
            onClick={() => setTiroir(false)}
          />
        ) : null}

        <div className="flex min-w-0 flex-col">
          <header className="sticky top-0 z-30 flex min-h-16 items-center gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur-md sm:px-6">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="-ml-2 lg:hidden"
              aria-label="Ouvrir le menu"
              aria-expanded={tiroir}
              aria-controls="menu-portail"
              onClick={() => setTiroir(true)}
            >
              <Menu />
            </Button>
            <nav
              aria-label="Fil d'Ariane"
              className="flex min-w-0 items-center gap-1.5 text-[14px] text-ink-muted"
            >
              {fil.map((maillon, index) =>
                index === fil.length - 1 ? (
                  <b
                    key={maillon}
                    aria-current="page"
                    className="truncate font-bold text-ink"
                  >
                    {maillon}
                  </b>
                ) : (
                  <span
                    key={maillon}
                    className="hidden items-center gap-1.5 whitespace-nowrap sm:inline-flex"
                  >
                    {maillon}
                    <ChevronRight
                      aria-hidden
                      className="size-3.5 text-ink-faint"
                    />
                  </span>
                )
              )}
            </nav>
            <div className="ml-auto flex shrink-0 items-center gap-3">
              {vendeur && role && canRole(role, "caisse") ? (
                <PastilleCaisse />
              ) : null}
              <span className="hidden text-right leading-tight md:grid">
                <span className="text-[12px] text-ink-faint">
                  {dateDuJour.format(new Date())}
                </span>
                <b className="tabular text-[16px] font-semibold">
                  {horloge || "--:--"}
                </b>
              </span>
              {identite ? (
                <MenuCompte
                  identite={identite}
                  nomComplet={nomComplet}
                  detail={[libelleRole, identite.matricule]
                    .filter(Boolean)
                    .join(" · ")}
                  session={session}
                />
              ) : null}
            </div>
          </header>
          {!enLigne ? (
            <div
              role="status"
              className="flex items-center gap-2 border-b border-line bg-warning-soft px-6 py-2 text-[13px] font-medium text-warning-ink"
            >
              <WifiOff aria-hidden className="size-4" />
              Réseau perdu : les ventes en ligne sont suspendues. Au guichet,
              passez sur les billets pré-imprimés et ressaisissez-les au retour
              du réseau.
            </div>
          ) : null}
          <main
            id="contenu"
            className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8"
          >
            {children}
          </main>
        </div>
      </div>
    </RaccourcisProvider>
  )
}
