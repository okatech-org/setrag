"use client"

import { SearchIcon } from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { EmptyState } from "@workspace/ui/components/empty-state"
import { Input } from "@workspace/ui/components/field"
import { SegmentedControl } from "@workspace/ui/components/segmented-control"
import { Tag } from "@workspace/ui/components/tag"

import { TERRAIN } from "@/composants/boutons"
import { Message } from "@/composants/message"
import { TagVerdict } from "@/composants/picto-verdict"
import { Bas, BarreApp, Corps, Note } from "@/coquille/ecran"
import { humanError } from "@/lib/errors"
import { normalize } from "@/lib/offline/db"
import type { EmbarkedManifest, EmbarkedTicket, LocalScan } from "@/lib/offline/types"
import { arretDeRang } from "@/lib/position"
import { dernierControle, etatDuTitre } from "@/lib/tournee"
import { leTrain, nomDuTrain } from "@/lib/train"
import { FAMILLE_DU_VERDICT, LIBELLE_VERDICT } from "@/lib/verdicts"

import { useControle, type ResultatControle } from "../controle/controle"
import { Verdict } from "../controle/verdict"
import { useTerminal } from "../terminal/contexte-terminal"
import { useDonneesTournee } from "../tournee/donnees-tournee"

type Axe = "reference" | "nom" | "place"

const AXES: Array<{ value: Axe; label: string }> = [
  { value: "reference", label: "Référence" },
  { value: "nom", label: "Nom" },
  { value: "place", label: "Place" },
]

const CHAMPS: Record<Axe, { libelle: string; exemple: string; absent: string }> = {
  reference: {
    libelle: "Référence du titre",
    exemple: "B-OWE-PV-20260930-000002",
    absent: "Aucun titre de cette référence",
  },
  nom: { libelle: "Nom du voyageur", exemple: "KOUMBA", absent: "Aucun voyageur de ce nom" },
  place: { libelle: "Numéro de place", exemple: "2B", absent: "Aucun titre à cette place" },
}

/**
 * Recherche manuelle — par référence, nom ou place, dans le manifeste
 * embarqué. Zéro requête réseau.
 *
 * Un titre trouvé ici suit le même chemin qu'un titre scanné : sa signature
 * (celle du code embarqué au manifeste) est vérifiée, son verdict rendu,
 * son contrôle enregistré — marqué « recherche manuelle », puisque le code
 * du voyageur, lui, n'a pas été lu. Sans quoi la recherche deviendrait une
 * porte dérobée.
 */
export function Recherche() {
  const parametres = useSearchParams()
  const { manifest, ready } = useTerminal()
  const donnees = useDonneesTournee(manifest)
  const { inspecter } = useControle()
  const refInitiale = parametres.get("ref") ?? ""
  const [axe, setAxe] = useState<Axe>("reference")
  const [saisie, setSaisie] = useState(refInitiale)
  const [resultat, setResultat] = useState<ResultatControle | null>(null)

  const trouves = useMemo(() => {
    const aiguille = normalize(saisie)
    if (aiguille.length < 2) return []
    return donnees.tickets
      .filter((t) => {
        if (axe === "reference") return normalize(t.number).includes(aiguille)
        if (axe === "place") return normalize(t.seatLabel ?? "").includes(aiguille)
        return normalize(`${t.passenger.lastName} ${t.passenger.firstName}`).includes(aiguille)
      })
      .slice(0, 40)
  }, [axe, donnees.tickets, saisie])

  if (!ready) return null
  if (!manifest) {
    return (
      <>
        <BarreApp retour="/scan" titre="Recherche manuelle" />
        <Corps>
          <Message ton="alerte" titre="Aucun manifeste embarqué.">
            La recherche lit le manifeste du terminal : téléchargez-le d&apos;abord.
          </Message>
        </Corps>
        <Bas>
          <Button size="lg" block className={TERRAIN} asChild>
            <Link href="/manifeste">Télécharger le manifeste</Link>
          </Button>
        </Bas>
      </>
    )
  }

  if (resultat) {
    return <Verdict resultat={resultat} onFermer={() => setResultat(null)} />
  }

  async function ouvrir(ticket: EmbarkedTicket) {
    if (!ticket.barcodePayload) {
      toast.error("Ce titre n'a pas de code embarqué : il ne peut pas être vérifié hors ligne.")
      return
    }
    try {
      setResultat(await inspecter(ticket.barcodePayload, { manuel: true }))
    } catch (error) {
      toast.error(humanError(error))
    }
  }

  const champ = CHAMPS[axe]
  const aucun = normalize(saisie).length >= 2 && trouves.length === 0 && donnees.charge

  return (
    <>
      <BarreApp
        retour="/scan"
        titre="Recherche manuelle"
        sousTitre={
          <>
            {nomDuTrain(manifest)} · <span className="tabular">{donnees.tickets.length}</span> titres
            embarqués
          </>
        }
      />
      <Corps>
        <SegmentedControl
          label="Chercher par"
          size="touch"
          options={AXES}
          value={axe}
          onValueChange={(valeur) => setAxe(valeur as Axe)}
          className="w-full"
        />
        <div className="grid gap-1.5">
          <label htmlFor="recherche" className="text-[13px] leading-snug font-medium">
            {champ.libelle}
          </label>
          <div className="relative">
            <SearchIcon
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-ink-muted"
            />
            <Input
              id="recherche"
              autoFocus
              aria-describedby="recherche-aide"
              autoComplete="off"
              spellCheck={false}
              value={saisie}
              onChange={(event) => setSaisie(event.target.value)}
              placeholder={champ.exemple}
              className="pl-10 font-mono"
            />
          </div>
          <span id="recherche-aide" className="text-[12px] text-ink-muted">
            Recherche locale : aucune donnée n&apos;est envoyée.
          </span>
        </div>

        {trouves.length > 0 && (
          <>
            <ul className="grid gap-2">
              {trouves.map((ticket) => (
                <li key={ticket.number}>
                  <Resultat
                    manifest={manifest}
                    ticket={ticket}
                    scans={donnees.scans}
                    onOuvrir={() => void ouvrir(ticket)}
                  />
                </li>
              ))}
            </ul>
            <Note>
              <span className="tabular">{trouves.length}</span> résultat{trouves.length > 1 ? "s" : ""} ·
              recherche locale, aucune donnée envoyée.
            </Note>
          </>
        )}

        {aucun && (
          <>
            <EmptyState
              title="Aucun titre trouvé"
              description={`${champ.absent} dans le manifeste de ${leTrain(manifest)}.`}
            />
            {!manifest.complete && (
              <Message ton="alerte" titre="Manifeste incomplet : l'absence ne vaut pas preuve.">
                {manifest.ticketCount - manifest.downloadedCount} titres n&apos;ont
                pas été embarqués. Vérifiez la signature du code avant de conclure.
              </Message>
            )}
          </>
        )}
      </Corps>
      <Bas>
        {aucun ? (
          <>
            <Button size="lg" block className={TERRAIN} asChild>
              <Link href="/vente">Vendre un titre à bord</Link>
            </Button>
            <Button variant="secondary" size="lg" block className={TERRAIN} asChild>
              <Link href={"/pv?motif=sans_titre" as Route}>Établir un procès-verbal</Link>
            </Button>
          </>
        ) : (
          <Button variant="ghost" block asChild>
            <Link href="/scan">Retour au scanner</Link>
          </Button>
        )}
      </Bas>
    </>
  )
}

/** Un titre trouvé : qui, quoi, où — et son état, avec la forme du verdict. */
function Resultat({
  manifest,
  ticket,
  scans,
  onOuvrir,
}: {
  manifest: EmbarkedManifest
  ticket: EmbarkedTicket
  scans: LocalScan[]
  onOuvrir: () => void
}) {
  const de = arretDeRang(manifest, ticket.fromStopIndex)?.name ?? "?"
  const a = arretDeRang(manifest, ticket.toStopIndex)?.name ?? "?"
  return (
    <button
      type="button"
      onClick={onOuvrir}
      className="grid min-h-16 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 rounded-md border border-line bg-surface px-3.5 py-2.5 text-left active:bg-surface-sunk"
    >
      <b className="truncate text-[15px] font-bold">
        {ticket.passenger.lastName} {ticket.passenger.firstName}
      </b>
      <span className="col-start-2 row-start-1">
        <EtatTitre ticket={ticket} scans={scans} />
      </span>
      <span className="col-span-2 truncate font-mono text-[11.5px] text-ink-muted">{ticket.number}</span>
      <span className="col-span-2 truncate text-[13px] font-medium text-ink-muted">
        {de} → {a}
        {ticket.seatLabel && ` · ${ticket.seatLabel}`}
      </span>
    </button>
  )
}

/** L'état d'un titre, en pastille à la forme de son verdict. */
export function EtatTitre({ ticket, scans }: { ticket: EmbarkedTicket; scans: LocalScan[] }) {
  const etat = etatDuTitre(ticket, scans)
  const dernier = dernierControle(scans, ticket.number)
  if (etat === "controle") return <TagVerdict famille="vigilance">déjà contrôlé</TagVerdict>
  if (etat === "refus" && dernier) {
    return (
      <TagVerdict famille={FAMILLE_DU_VERDICT[dernier.verdict]}>
        {LIBELLE_VERDICT[dernier.verdict]}
      </TagVerdict>
    )
  }
  if (ticket.status === "annule") return <TagVerdict famille="refus">annulé</TagVerdict>
  if (ticket.status === "rembourse") return <TagVerdict famille="refus">remboursé</TagVerdict>
  return <Tag tone="accent">à contrôler</Tag>
}
