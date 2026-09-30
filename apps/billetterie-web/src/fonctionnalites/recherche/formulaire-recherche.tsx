"use client"

import { ArrowLeftRightIcon, ArrowUpDownIcon, SearchIcon } from "lucide-react"
import {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { useNaviguer } from "@/coquille/filet-navigation"
import { useToday } from "@/hooks/use-today"
import { dateDeService, dateRelative } from "@/lib/format"
import {
  codesReduction,
  derniereRechercheBrute,
  libelleVoyageurs,
  lireRechercheMemorisee,
  memoriserRecherche,
  parametresRecherche,
  type Recherche,
} from "@/lib/recherche"

import { useGares, useReductions } from "../reference/use-reference"
import { ChoixDate } from "./choix-date"
import { ChoixGare } from "./choix-gare"
import { ChoixVoyageurs } from "./choix-voyageurs"

type Brouillon = {
  de: string | null
  a: string | null
  le: string | null
  adultes: number
  enfants: number
}

const sAbonner = () => () => {}

/** Un champ du formulaire : le libellé en petit, la valeur en gras ; il ouvre une feuille. */
function BlocChamp({
  libelle,
  valeur,
  vide,
  erreur,
  onClick,
  className,
}: {
  libelle: string
  valeur: ReactNode
  vide?: boolean
  erreur?: boolean
  onClick: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-describedby={erreur ? "erreur-gares" : undefined}
      className={cn(
        "flex min-h-14 min-w-0 flex-col justify-center rounded-md bg-surface-sunk px-4 py-1.5 text-left transition-colors hover:bg-accent-soft",
        erreur && "shadow-[inset_0_0_0_1.5px_var(--c-danger)]",
        className
      )}
    >
      <small
        className={cn(
          "text-caption",
          erreur ? "text-danger-ink" : "text-ink-muted"
        )}
      >
        {libelle}
      </small>
      <b
        className={cn(
          "truncate text-[16px] font-semibold",
          vide && "font-medium text-ink-faint"
        )}
      >
        {valeur}
      </b>
    </button>
  )
}

/**
 * La recherche d'un trajet, sur l'accueil et en tête des résultats.
 *
 * Un seul formulaire pour tous les écrans : une carte sur mobile (gares
 * l'une sous l'autre, ⇅ pour les échanger), une barre sur grand écran. Chaque
 * champ ouvre une feuille — les gares sur la ligne, les jours avec leur prix,
 * le compteur de voyageurs.
 */
export function FormulaireRecherche({
  initiale,
  onGaresChange,
  className,
}: {
  initiale?: Recherche | null
  /** Pour dessiner le trajet choisi sur le schéma de la ligne. */
  onGaresChange?: (de: string | null, a: string | null) => void
  className?: string
}) {
  const naviguer = useNaviguer()
  const instant = useToday()
  const aujourdhui = instant === null ? null : dateDeService(instant)
  const { gares, parCode } = useGares()
  const { enfant } = useReductions()

  // Sans recherche en cours, l'accueil reprend la dernière, comme une app.
  // Lue sans effet : le texte mémorisé est stable, sa lecture est pure.
  const derniereBrute = useSyncExternalStore(
    sAbonner,
    derniereRechercheBrute,
    () => null
  )
  const derniere = useMemo(
    () => lireRechercheMemorisee(derniereBrute),
    [derniereBrute]
  )
  const base = initiale ?? (derniere ? { ...derniere, le: null } : null)
  // Seules les modifications du voyageur sont un état ; le reste se déduit.
  const [modifs, setModifs] = useState<Partial<Brouillon>>({})
  const brouillon: Brouillon = {
    de: modifs.de !== undefined ? modifs.de : (base?.de ?? null),
    a: modifs.a !== undefined ? modifs.a : (base?.a ?? null),
    le: modifs.le !== undefined ? modifs.le : (base?.le ?? null),
    adultes: modifs.adultes ?? base?.adultes ?? 1,
    enfants: modifs.enfants ?? base?.enfants ?? 0,
  }
  const setBrouillon = (maj: (b: Brouillon) => Brouillon) => {
    const suivant = maj(brouillon)
    setModifs(suivant)
  }
  const [ouvert, setOuvert] = useState<null | "de" | "a" | "le" | "voyageurs">(
    null
  )
  const [tourne, setTourne] = useState(false)
  const [soumis, setSoumis] = useState(false)

  useEffect(() => {
    onGaresChange?.(brouillon.de, brouillon.a)
  }, [brouillon.de, brouillon.a, onGaresChange])

  const date =
    brouillon.le && aujourdhui && brouillon.le >= aujourdhui
      ? brouillon.le
      : aujourdhui
  const depart = parCode(brouillon.de)
  const arrivee = parCode(brouillon.a)
  const erreurGares = soumis && (!depart || !arrivee)

  const echanger = () => {
    setTourne((t) => !t)
    setBrouillon((b) => ({ ...b, de: b.a, a: b.de }))
  }

  const rechercher = () => {
    setSoumis(true)
    if (!brouillon.de || !brouillon.a || !date) return
    const recherche: Recherche = {
      de: brouillon.de,
      a: brouillon.a,
      le: date,
      adultes: brouillon.adultes,
      enfants: brouillon.enfants,
    }
    memoriserRecherche(recherche)
    naviguer(
      `/resultats?${new URLSearchParams(parametresRecherche(recherche))}`
    )
  }

  const trajet =
    depart && arrivee
      ? {
          originStationId: depart._id,
          destinationStationId: arrivee._id,
          passengers: brouillon.adultes + brouillon.enfants,
          discountCodes: codesReduction(brouillon, enfant?.code ?? null),
        }
      : null

  return (
    <form
      className={cn("grid gap-3 md:gap-0", className)}
      onSubmit={(event) => {
        event.preventDefault()
        rechercher()
      }}
    >
      <div className="grid gap-1.5 rounded-lg border border-line bg-surface p-2 shadow-sm md:grid-cols-[minmax(0,2fr)_minmax(150px,0.8fr)_minmax(170px,0.9fr)_auto] md:rounded-[20px] md:border-line-strong md:shadow-md">
        <div className="relative grid gap-1.5 md:grid-cols-2">
          <BlocChamp
            libelle="Départ"
            valeur={depart?.name ?? "Choisir une gare"}
            vide={!depart}
            erreur={erreurGares && !depart}
            onClick={() => setOuvert("de")}
          />
          <BlocChamp
            libelle="Arrivée"
            valeur={arrivee?.name ?? "Choisir une gare"}
            vide={!arrivee}
            erreur={erreurGares && !arrivee}
            onClick={() => setOuvert("a")}
            className="md:pl-8"
          />
          <button
            type="button"
            onClick={echanger}
            aria-label="Inverser départ et arrivée"
            className={cn(
              "absolute top-1/2 right-3.5 grid size-10 -translate-y-1/2 place-items-center rounded-pill border border-line-strong bg-surface text-accent-ink transition-[rotate] duration-[var(--dur-slow)] ease-[var(--ease-glisse)] md:right-auto md:left-1/2 md:-translate-x-1/2",
              tourne && "rotate-180"
            )}
          >
            <ArrowUpDownIcon className="size-[18px] md:hidden" />
            <ArrowLeftRightIcon className="hidden size-[18px] md:block" />
          </button>
        </div>
        <div className="grid grid-cols-[1.1fr_1fr] gap-1.5 md:contents">
          <BlocChamp
            libelle="Aller"
            valeur={
              date && aujourdhui
                ? dateRelative(date, aujourdhui)
                : "Aujourd'hui"
            }
            onClick={() => setOuvert("le")}
          />
          <BlocChamp
            libelle="Voyageurs"
            valeur={libelleVoyageurs(brouillon)}
            onClick={() => setOuvert("voyageurs")}
          />
        </div>
        <Button
          type="submit"
          size="lg"
          className="max-md:hidden md:ml-1 md:h-auto md:min-h-14 md:px-7"
        >
          <SearchIcon />
          Rechercher
        </Button>
      </div>
      {erreurGares && (
        <p
          id="erreur-gares"
          role="alert"
          className="text-small px-1 font-medium text-danger-ink md:mt-2"
        >
          Choisissez une gare de départ et une gare d&apos;arrivée.
        </p>
      )}
      <Button type="submit" size="lg" block className="md:hidden">
        <SearchIcon />
        Rechercher
      </Button>

      {
        <>
          <ChoixGare
            open={ouvert === "de"}
            onOpenChange={(o) => setOuvert(o ? "de" : null)}
            titre="Gare de départ"
            gares={gares}
            valeur={brouillon.de}
            autre={brouillon.a}
            autreLibelle="Arrivée"
            onChoisir={(code) => setBrouillon((b) => ({ ...b, de: code }))}
          />
          <ChoixGare
            open={ouvert === "a"}
            onOpenChange={(o) => setOuvert(o ? "a" : null)}
            titre="Gare d'arrivée"
            gares={gares}
            valeur={brouillon.a}
            autre={brouillon.de}
            autreLibelle="Départ"
            onChoisir={(code) => setBrouillon((b) => ({ ...b, a: code }))}
          />
        </>
      }
      {aujourdhui && date && (
        <ChoixDate
          open={ouvert === "le"}
          onOpenChange={(o) => setOuvert(o ? "le" : null)}
          valeur={date}
          aujourdhui={aujourdhui}
          trajet={trajet}
          onChoisir={(le) => setBrouillon((b) => ({ ...b, le }))}
        />
      )}
      <ChoixVoyageurs
        open={ouvert === "voyageurs"}
        onOpenChange={(o) => setOuvert(o ? "voyageurs" : null)}
        adultes={brouillon.adultes}
        enfants={brouillon.enfants}
        reductionEnfant={enfant}
        onChange={(v) => setBrouillon((b) => ({ ...b, ...v }))}
      />
    </form>
  )
}
