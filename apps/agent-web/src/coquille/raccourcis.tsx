"use client"

import { RotateCcw } from "lucide-react"
import type { Route } from "next"
import { useRouter } from "next/navigation"
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { Switch } from "@workspace/ui/components/choice"
import { SkeletonLines } from "@workspace/ui/components/empty-state"
import { cn } from "@workspace/ui/lib/utils"

import { messageErreur } from "@/components/guichet/donnees"

import { signalerNavigation } from "./filet-navigation"
import type { EntreeMenu } from "./navigation"

const E2E_MODE =
  process.env.NODE_ENV !== "production" &&
  process.env.NEXT_PUBLIC_E2E_MODE === "1"

/** Page des réglages de l'agent ; « ? » y mène, sur la section des raccourcis. */
export const CHEMIN_REGLAGES = "/reglages"

/** Touche acceptée : une lettre ou un chiffre, comme côté serveur. */
const TOUCHE = /^[a-z0-9]$/

export interface GroupeRaccourcis {
  cle: string
  libelle: string
  entrees: readonly EntreeMenu[]
}

interface Preferences {
  raccourcisActifs: boolean
  afficherTouches: boolean
  /** Écarts aux touches par défaut : `null` retire le raccourci. */
  touches: Record<string, string | null>
}

/** Les accueils n'ont pas de raccourci : le logo y ramène. */
const ACCUEILS = new Set(["/vente", "/gestion"])

/** Rubriques qui peuvent porter une touche, groupe par groupe. */
function groupesReglables(groupes: readonly GroupeRaccourcis[]) {
  return groupes
    .map((groupe) => ({
      ...groupe,
      entrees: groupe.entrees.filter((entree) => !ACCUEILS.has(entree.href)),
    }))
    .filter((groupe) => groupe.entrees.length > 0)
}

const PAR_DEFAUT: Preferences = {
  raccourcisActifs: true,
  afficherTouches: true,
  touches: {},
}

interface ContexteRaccourcis {
  /** Touche d'une rubrique, en capitale ; absente si désactivée ou masquée. */
  touche: (href: string) => string | undefined
  groupes: readonly GroupeRaccourcis[]
  /** `undefined` tant que les préférences du compte ne sont pas lues. */
  preferences: Preferences | undefined
  attribuees: Map<string, string>
  enregistrer: (preferences: Preferences) => Promise<void>
  reinitialiser: () => Promise<void>
}

const Contexte = createContext<ContexteRaccourcis | null>(null)

/** Touche affichée à côté d'une rubrique (menu, tuiles de l'accueil). */
export function useToucheRaccourci(href: string) {
  return useContext(Contexte)?.touche(href)
}

/**
 * Attribue une touche à chaque rubrique : celle choisie par l'agent, sinon
 * celle par défaut. Une touche par défaut déjà reprise par un choix de l'agent
 * s'efface : deux rubriques ne partagent jamais une touche.
 */
export function attribuerTouches(
  entrees: readonly EntreeMenu[],
  choix: Record<string, string | null>
) {
  const attribuees = new Map<string, string>()
  const prises = new Set<string>()
  for (const entree of entrees) {
    const choisie = choix[entree.href]
    if (typeof choisie === "string" && !prises.has(choisie)) {
      attribuees.set(entree.href, choisie)
      prises.add(choisie)
    }
  }
  for (const entree of entrees) {
    if (entree.href in choix) continue
    const defaut = entree.touche?.toLowerCase()
    if (defaut && !prises.has(defaut)) {
      attribuees.set(entree.href, defaut)
      prises.add(defaut)
    }
  }
  return attribuees
}

/** Préférences de l'agent : Convex en temps réel, ou un état local en E2E. */
function usePreferences() {
  const distantes = useQuery(
    api.functions.preferences.mesPreferences,
    E2E_MODE ? "skip" : {}
  )
  const enregistrerDistant = useMutation(
    api.functions.preferences.enregistrerRaccourcis
  )
  const reinitialiserDistant = useMutation(
    api.functions.preferences.reinitialiserRaccourcis
  )
  const [locales, setLocales] = useState<Preferences>(PAR_DEFAUT)
  return {
    preferences: E2E_MODE ? locales : distantes,
    enregistrer: async (suivantes: Preferences) => {
      if (E2E_MODE) return setLocales(suivantes)
      await enregistrerDistant(suivantes)
    },
    reinitialiser: async () => {
      if (E2E_MODE) return setLocales(PAR_DEFAUT)
      await reinitialiserDistant({})
    },
  }
}

/** La frappe vise-t-elle une saisie ou un dialogue ? Alors elle ne navigue pas. */
function frappeOccupee(event: KeyboardEvent) {
  const cible = event.target as HTMLElement | null
  if (
    cible?.closest(
      "input, textarea, select, [contenteditable='true'], [role='dialog'], [role='menu']"
    )
  )
    return true
  return Boolean(
    document.querySelector(
      "[role='dialog'][data-state='open'], [role='alertdialog'], [role='menu'][data-state='open']"
    )
  )
}

/**
 * Raccourcis clavier du portail : une touche ouvre une rubrique du menu,
 * « ? » ouvre les réglages. Les touches propres à un écran (moyens de
 * paiement à l'encaissement, « N » après une vente) passent avant : l'écoute
 * attend la fin de la propagation et cède si l'écran a déjà consommé la frappe.
 */
export function RaccourcisProvider({
  groupes,
  children,
}: {
  groupes: readonly GroupeRaccourcis[]
  children: ReactNode
}) {
  const router = useRouter()
  const { preferences, enregistrer, reinitialiser } = usePreferences()
  const enVigueur = preferences ?? PAR_DEFAUT

  const entrees = useMemo(
    () => groupes.flatMap((groupe) => groupe.entrees),
    [groupes]
  )
  const attribuees = useMemo(
    () => attribuerTouches(entrees, enVigueur.touches),
    [entrees, enVigueur.touches]
  )
  const actifs = enVigueur.raccourcisActifs

  useEffect(() => {
    const versRubrique = new Map(
      [...attribuees].map(([href, touche]) => [touche, href])
    )
    const aller = (href: string) => {
      signalerNavigation()
      router.push(href as Route)
    }
    const ecouter = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return
      if (frappeOccupee(event)) return
      if (event.key === "?") {
        event.preventDefault()
        aller(`${CHEMIN_REGLAGES}#raccourcis`)
        return
      }
      if (!actifs) return
      const href = versRubrique.get(event.key.toLowerCase())
      if (!href) return
      // Après les écouteurs de l'écran : s'il a pris la touche, elle lui reste.
      window.setTimeout(() => {
        if (!event.defaultPrevented) aller(href)
      }, 0)
    }
    window.addEventListener("keydown", ecouter)
    return () => window.removeEventListener("keydown", ecouter)
  }, [attribuees, actifs, router])

  const contexte = useMemo<ContexteRaccourcis>(
    () => ({
      touche: (href) =>
        actifs && enVigueur.afficherTouches
          ? attribuees.get(href)?.toUpperCase()
          : undefined,
      groupes,
      preferences,
      attribuees,
      enregistrer,
      reinitialiser,
    }),
    [
      actifs,
      enVigueur.afficherTouches,
      attribuees,
      groupes,
      preferences,
      enregistrer,
      reinitialiser,
    ]
  )

  return <Contexte.Provider value={contexte}>{children}</Contexte.Provider>
}

/* ============================================================== Réglages */

/**
 * Réglage des raccourcis, sur la page des réglages. Le formulaire repart des
 * réglages en vigueur chaque fois qu'ils changent (enregistrement, retour aux
 * touches par défaut, autre onglet).
 */
export function ReglagesRaccourcis() {
  const contexte = useContext(Contexte)
  const [message, setMessage] = useState("")
  if (!contexte?.preferences) return <SkeletonLines />
  return (
    <FormulaireRaccourcis
      key={JSON.stringify(contexte.preferences)}
      contexte={contexte}
      preferences={contexte.preferences}
      message={message}
      onMessage={setMessage}
    />
  )
}

function FormulaireRaccourcis({
  contexte,
  preferences,
  message,
  onMessage,
}: {
  contexte: ContexteRaccourcis
  preferences: Preferences
  message: string
  onMessage: (message: string) => void
}) {
  const { attribuees, enregistrer, reinitialiser } = contexte
  const reglables = groupesReglables(contexte.groupes)
  const entrees = reglables.flatMap((groupe) => groupe.entrees)
  const enVigueur = Object.fromEntries(
    entrees.map((entree) => [
      entree.href,
      attribuees.get(entree.href)?.toUpperCase() ?? "",
    ])
  )
  const [actifs, setActifs] = useState(preferences.raccourcisActifs)
  const [afficher, setAfficher] = useState(preferences.afficherTouches)
  const [saisies, setSaisies] = useState<Record<string, string>>(enVigueur)
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState("")

  const modifie =
    actifs !== preferences.raccourcisActifs ||
    afficher !== preferences.afficherTouches ||
    entrees.some((entree) => saisies[entree.href] !== enVigueur[entree.href])
  const personnalise =
    !preferences.raccourcisActifs ||
    !preferences.afficherTouches ||
    Object.keys(preferences.touches).length > 0

  // Une touche invalide ou partagée se signale sur chacune des rubriques concernées.
  const problemes = (() => {
    const parTouche = new Map<string, EntreeMenu[]>()
    const resultat = new Map<string, string>()
    for (const entree of entrees) {
      const touche = (saisies[entree.href] ?? "").toLowerCase()
      if (!touche) continue
      if (!TOUCHE.test(touche)) {
        resultat.set(entree.href, "Une lettre ou un chiffre.")
        continue
      }
      parTouche.set(touche, [...(parTouche.get(touche) ?? []), entree])
    }
    for (const [touche, rubriques] of parTouche) {
      if (rubriques.length < 2) continue
      for (const rubrique of rubriques) {
        const autres = rubriques
          .filter((r) => r !== rubrique)
          .map((r) => r.libelle)
        resultat.set(
          rubrique.href,
          `${touche.toUpperCase()} sert déjà à ${autres.join(", ")}.`
        )
      }
    }
    return resultat
  })()

  const executer = async (
    action: () => Promise<void>,
    reussite: string,
    echec: string
  ) => {
    setEnvoi(true)
    setErreur("")
    onMessage("")
    try {
      await action()
      onMessage(reussite)
    } catch (cause) {
      setErreur(messageErreur(cause, echec))
    } finally {
      setEnvoi(false)
    }
  }

  const valider = () => {
    if (problemes.size > 0)
      return setErreur("Corrigez les touches signalées avant d'enregistrer.")
    // Seuls les écarts aux touches par défaut sont conservés : une touche par
    // défaut qui évolue reste ainsi à jour chez l'agent qui ne l'a pas changée.
    const touches: Record<string, string | null> = {}
    for (const entree of entrees) {
      const saisie = (saisies[entree.href] ?? "").toLowerCase()
      const defaut = entree.touche?.toLowerCase() ?? ""
      if (saisie !== defaut) touches[entree.href] = saisie || null
    }
    void executer(
      () =>
        enregistrer({
          raccourcisActifs: actifs,
          afficherTouches: afficher,
          touches,
        }),
      "Raccourcis enregistrés.",
      "Les raccourcis n'ont pas été enregistrés. Réessayez."
    )
  }

  return (
    <form
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault()
        valider()
      }}
    >
      <div className="grid gap-1">
        <Switch
          label="Activer les raccourcis clavier"
          checked={actifs}
          onCheckedChange={(valeur) => {
            setActifs(valeur)
            onMessage("")
          }}
        />
        <Switch
          label="Afficher les touches dans le menu"
          checked={afficher}
          disabled={!actifs}
          onCheckedChange={(valeur) => {
            setAfficher(valeur)
            onMessage("")
          }}
        />
      </div>

      <fieldset
        disabled={!actifs}
        className="grid gap-x-8 gap-y-5 disabled:opacity-60 lg:grid-cols-2"
      >
        <legend className="sr-only">Touche de chaque rubrique</legend>
        {reglables.map((groupe) => (
          <div key={groupe.cle} className="grid content-start gap-1">
            <h3 className="text-[11px] font-semibold tracking-[0.07em] text-ink-faint uppercase">
              {groupe.libelle}
            </h3>
            <ul className="grid">
              {groupe.entrees.map((entree) => {
                const Icone = entree.icone
                const probleme = problemes.get(entree.href)
                const id = `touche-${entree.href.replaceAll("/", "-")}`
                return (
                  <li
                    key={entree.href}
                    className="grid grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-x-3 border-b border-line py-1.5 last:border-b-0"
                  >
                    <Icone aria-hidden className="size-[18px] text-ink-muted" />
                    <label
                      htmlFor={id}
                      className="truncate text-[14px] font-medium"
                    >
                      {entree.libelle}
                    </label>
                    <input
                      id={id}
                      value={saisies[entree.href] ?? ""}
                      maxLength={1}
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="—"
                      aria-invalid={probleme ? true : undefined}
                      aria-describedby={probleme ? `${id}-probleme` : undefined}
                      onFocus={(event) => event.target.select()}
                      onChange={(event) => {
                        onMessage("")
                        setSaisies((s) => ({
                          ...s,
                          [entree.href]: event.target.value
                            .slice(-1)
                            .toUpperCase(),
                        }))
                      }}
                      className={cn(
                        "tabular size-11 rounded-md border border-b-2 bg-surface text-center text-[15px] font-semibold uppercase placeholder:text-ink-faint",
                        probleme
                          ? "border-danger text-danger-ink"
                          : "border-line-strong"
                      )}
                    />
                    {probleme ? (
                      <p
                        id={`${id}-probleme`}
                        className="col-start-2 col-end-4 pb-1 text-[12.5px] font-medium text-danger-ink"
                      >
                        {probleme}
                      </p>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </fieldset>
      <p className="text-[12.5px] text-ink-muted">
        Videz une case pour retirer le raccourci de la rubrique. L&apos;accueil
        n&apos;en a pas : le logo y ramène. Une touche propre à un écran (moyen
        de paiement à l&apos;encaissement, par exemple) passe avant celle du
        menu.
      </p>

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
        {erreur ? (
          <p role="alert" className="text-[13px] font-medium text-danger-ink">
            {erreur}
          </p>
        ) : (
          <p role="status" className="text-[13px] font-medium text-success-ink">
            {message}
          </p>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={envoi || !personnalise}
            onClick={() =>
              void executer(
                reinitialiser,
                "Touches par défaut rétablies.",
                "Les touches par défaut n'ont pas été rétablies. Réessayez."
              )
            }
          >
            <RotateCcw />
            Rétablir par défaut
          </Button>
          <Button type="submit" disabled={envoi || !modifie}>
            {envoi ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>
      </div>
    </form>
  )
}
