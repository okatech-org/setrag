"use client"

import { Ban, Copy, Lock, RotateCcw, Search, Wallet, X } from "lucide-react"
import type { Route } from "next"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useMemo, useState, type ReactNode } from "react"

import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@workspace/ui/components/dialog"
import { Field, Input, SelectNative, Textarea } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { SegmentedControl } from "@workspace/ui/components/segmented-control"
import { SkeletonLines } from "@workspace/ui/components/empty-state"
import { Tag } from "@workspace/ui/components/tag"
import { PastilleBillet, type StatutBillet } from "@workspace/ui/voyage/statut"
import { cn } from "@workspace/ui/lib/utils"

import { CelluleDouble, Chronologie, EnTetePage, Fiche, TableauDonnees, type ColonneTableau } from "@/components/charte"
import {
  dateCourte,
  dateHeure,
  heure,
  libelleClasse,
  libelleMoyen,
  libelleProduit,
  montant,
  montantSigne,
  nomTrain,
  xaf,
} from "@/lib/agent-data"

import { CadreGestion, mentionLectureSeule } from "@/components/gestion/referentiels/cadre"
import { useDroitsGestion } from "@/components/gestion/referentiels/droits"
import { useOnlineStatus } from "@/hooks/use-online-status"

import { BilletImprime } from "./billet-imprime"
import { CadreGuichet, ChargementEcran, LimiteErreur, useGuichet } from "./cadre"
import { messageErreur, useEcriture, useLecture, type DossierVente, type Operation } from "./donnees"
import { HorsReseau, LigneRecap, PastilleEtat } from "./elements"
import { useImpression } from "./impression"

/* ════════════════════════════ Libellés ════════════════════════════════════ */

const ACTIONS_JOURNAL: Record<string, string> = {
  "vente.guichet": "Vente enregistrée",
  "vente.bagage": "Bagage enregistré",
  "vente.colis": "Colis enregistré",
  "vente.taa": "Auto accompagné enregistré",
  "vente.funeraire": "Transport funéraire enregistré",
  "vente.annuler": "Vente annulée",
  "vente.rembourser": "Vente remboursée",
  "vente.tenue.liberer": "Places rendues avant règlement",
  "vente.manuelle.ressaisir": "Souche papier ressaisie",
  "reservation.creer": "Places tenues",
  "reservation.confirmer": "Réservation réglée",
  "billet.duplicata": "Duplicata imprimé",
  "paiement.demander": "Demande de paiement envoyée",
  "paiement.confirmation_simulee": "Paiement confirmé (simulation opérateur)",
  "controle.valide": "Contrôlé à bord",
  "controle.deja_controle": "Présenté une seconde fois au contrôle",
}

export function libelleJournal(action: string) {
  return ACTIONS_JOURNAL[action] ?? action.replaceAll(".", " · ").replaceAll("_", " ")
}

const PRODUITS_FILTRE = [
  { valeur: "tous", libelle: "Tous" },
  { valeur: "billet", libelle: "Billets" },
  { valeur: "bagage", libelle: "Bagages" },
  { valeur: "colis", libelle: "Colis" },
  { valeur: "special", libelle: "Prestations" },
  { valeur: "sorties", libelle: "Annulations et remboursements" },
] as const

const ETATS_FILTRE = [
  { valeur: "tous", libelle: "Tous les états" },
  { valeur: "emis", libelle: "Émis ou enregistré" },
  { valeur: "controle", libelle: "Contrôlé à bord" },
  { valeur: "annule", libelle: "Annulé" },
  { valeur: "rembourse", libelle: "Remboursé" },
] as const

function correspondProduit(o: Operation, filtre: string) {
  if (filtre === "tous") return true
  if (filtre === "sorties") return o.kind !== "vente"
  if (o.kind !== "vente") return false
  if (filtre === "special") return o.produit === "taa" || o.produit === "funeraire"
  return o.produit === filtre
}

function correspondEtat(o: Operation, filtre: string) {
  if (filtre === "tous") return true
  if (filtre === "emis") return o.etat === "emis" || o.etat === "enregistre"
  return o.etat === filtre
}

/* ═════════════════════════════ Liste ══════════════════════════════════════ */

const COLONNES: readonly ColonneTableau<Operation>[] = [
  {
    cle: "numero",
    libelle: "N°",
    rendu: (o) => <CelluleDouble mono haut={o.numero} bas={o.references[0] && o.references[0] !== o.numero ? o.references[0] : undefined} />,
    tri: (o) => o.numero,
  },
  { cle: "heure", libelle: "Heure", rendu: (o) => <span className="tabular">{heure(o.heure)}</span>, tri: (o) => o.heure, export: (o) => new Date(o.heure) },
  { cle: "produit", libelle: "Produit", rendu: (o) => libelleProduit(o.produit, o.kind), tri: (o) => libelleProduit(o.produit, o.kind) },
  {
    cle: "desserte",
    libelle: "Desserte · trajet",
    rendu: (o) => (
      <CelluleDouble
        haut={o.desserte ? `${nomTrain(o.desserte.trainType, o.desserte.trainNumber)} · ${dateCourte(o.desserte.serviceDate)}` : "—"}
        bas={o.trajet ?? undefined}
      />
    ),
    tri: (o) => o.desserte?.departAt ?? 0,
    export: (o) => [o.desserte ? `${nomTrain(o.desserte.trainType, o.desserte.trainNumber)} ${o.desserte.serviceDate}` : "", o.trajet ?? ""].join(" · "),
    secondaire: true,
  },
  { cle: "client", libelle: "Client", rendu: (o) => o.client ?? "—", tri: (o) => o.client ?? "" },
  { cle: "moyen", libelle: "Moyen", rendu: (o) => libelleMoyen(o.moyen), tri: (o) => libelleMoyen(o.moyen), secondaire: true },
  { cle: "montant", libelle: "Montant", rendu: (o) => montantSigne(o.montant), tri: (o) => o.montant, numerique: true },
  { cle: "etat", libelle: "État", rendu: (o) => <PastilleEtat etat={o.etat} />, tri: (o) => o.etat },
]

/* ═════════════════════════════ Tiroir ═════════════════════════════════════ */

/** Tiroir latéral : le dossier s'ouvre à côté de la liste. */
function Tiroir({ ouvert, onFermer, titre, description, pied, children }: { ouvert: boolean; onFermer: () => void; titre: ReactNode; description?: ReactNode; pied?: ReactNode; children: ReactNode }) {
  return (
    <Dialog open={ouvert} onOpenChange={(o) => (!o ? onFermer() : undefined)}>
      <DialogContent
        showCloseButton={false}
        className="top-0 right-0 left-auto grid h-dvh w-[min(520px,100vw)] max-w-none translate-x-0 translate-y-0 grid-rows-[auto_1fr_auto] gap-0 rounded-none bg-surface p-0 text-ink sm:max-w-none"
      >
        <header className="flex items-start gap-3 border-b border-line px-5 pt-5 pb-3">
          <div className="grid min-w-0 flex-1 gap-1">
            <DialogTitle className="tabular text-[18px] leading-tight font-bold break-all">{titre}</DialogTitle>
            <DialogDescription className="text-small text-ink-muted">{description}</DialogDescription>
          </div>
          <Button type="button" variant="ghost" size="icon" aria-label="Fermer le dossier" onClick={onFermer}>
            <X />
          </Button>
        </header>
        <div className="grid min-h-0 content-start gap-5 overflow-y-auto px-5 py-4">{children}</div>
        {pied ? <footer className="flex flex-wrap justify-end gap-2 border-t border-line bg-surface-sunk px-5 py-4">{pied}</footer> : null}
      </DialogContent>
    </Dialog>
  )
}

type Boite = null | "annuler" | "rembourser"

function DossierOperation({
  venteId,
  parametres,
  enLigne,
  actionsCoupees,
  onFermer,
  onOuvrir,
}: {
  venteId: string
  parametres: ParametresImpression
  enLigne: boolean
  /** Niveau « lecture » sur le module : aucune action. */
  actionsCoupees?: boolean
  onFermer: () => void
  onOuvrir: (id: string) => void
}) {
  const dossier = useLecture(api.functions.guichet.vente, { venteId: venteId as never })
  const dupliquer = useEcriture(api.functions.sales.reprintTicket)
  const { imprimer, zone } = useImpression()
  const [boite, setBoite] = useState<Boite>(null)
  const [message, setMessage] = useState<{ ton: "success" | "danger"; texte: string } | null>(null)
  const [enCours, setEnCours] = useState(false)

  if (dossier === undefined) {
    return (
      <Tiroir ouvert onFermer={onFermer} titre="Chargement du dossier…">
        <SkeletonLines />
        <SkeletonLines />
      </Tiroir>
    )
  }
  if (dossier === null) {
    return (
      <Tiroir ouvert onFermer={onFermer} titre="Opération introuvable">
        <InlineMessage tone="warning" title="Cette opération n'existe plus.">
          Vérifiez le numéro dans la liste.
        </InlineMessage>
      </Tiroir>
    )
  }

  const { vente, actions } = dossier
  // Droits calculés par le serveur selon la matrice ; le niveau du module
  // peut encore les couper (lecture seule).
  const peutAnnuler = dossier.droits.annuler && !actionsCoupees
  const peutRembourser = dossier.droits.rembourser && !actionsCoupees
  const peutDupliquer = dossier.droits.dupliquer && !actionsCoupees
  const valides = dossier.billets.filter((b) => b.statut === "valide")
  const raisonBlocage = actions.controle
    ? "Contrôlé à bord : ni annulation ni remboursement au guichet. Réclamation au service clients."
    : vente.kind !== "vente"
      ? `Écriture ${libelleProduit(vente.produit, vente.kind).toLowerCase()} : elle se consulte, elle ne s'annule pas.`
      : vente.produit !== "billet"
        ? "Seuls les billets s'annulent ou se remboursent au guichet."
        : null

  const duplicata = async () => {
    setEnCours(true)
    setMessage(null)
    try {
      const imprimes: ReactNode[] = []
      const mentions: string[] = []
      for (const billet of valides) {
        const resultat = await dupliquer({ ticketId: billet.id as never })
        const mention = `${parametres.mentionDuplicata} N°${resultat.duplicateCount}`
        mentions.push(mention)
        imprimes.push(<BilletImprime key={billet.id} dossier={dossier} billet={billet} duplicata={mention} piedBillet={parametres.piedBillet} />)
      }
      imprimer(imprimes, "ticket")
      setMessage({ ton: "success", texte: `${mentions.join(", ")} imprimé${mentions.length > 1 ? "s" : ""} · tracé au journal d'audit` })
    } catch (cause) {
      setMessage({ ton: "danger", texte: messageErreur(cause, "Le duplicata n'a pas pu être émis.") })
    } finally {
      setEnCours(false)
    }
  }

  return (
    <>
      <Tiroir
        ouvert
        onFermer={onFermer}
        titre={vente.numero}
        description={`${libelleProduit(vente.produit, vente.kind)}${dossier.desserte ? ` · ${nomTrain(dossier.desserte.trainType, dossier.desserte.trainNumber)} · ${dateCourte(dossier.desserte.serviceDate)}` : ""}`}
        pied={
          vente.kind === "vente" && vente.produit === "billet" ? (
            <>
              {peutDupliquer ? (
                <Button type="button" variant="secondary" disabled={!enLigne || !actions.duplicata} loading={enCours} loadingLabel="Duplicata…" onClick={duplicata}>
                  <Copy aria-hidden />
                  Duplicata
                </Button>
              ) : null}
              {peutAnnuler ? (
                <Button type="button" variant="danger" disabled={!enLigne || !actions.annulation} onClick={() => setBoite("annuler")}>
                  <Ban aria-hidden />
                  Annuler la vente
                </Button>
              ) : null}
              <Button type="button" variant="danger" disabled={!enLigne || !peutRembourser || !actions.remboursement} onClick={() => setBoite("rembourser")}>
                <RotateCcw aria-hidden />
                Rembourser
              </Button>
            </>
          ) : undefined
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <PastilleEtat etat={dossier.resume.etat} />
          {vente.canal === "manuel" ? <Tag tone="neutral">Vente papier ressaisie</Tag> : null}
        </div>
        {message ? <InlineMessage tone={message.ton} title={message.texte} /> : null}
        {raisonBlocage && vente.kind === "vente" ? (
          <p className={cn("flex items-start gap-2 rounded-md px-3.5 py-2.5 text-[13px] font-medium", actions.controle ? "bg-info-soft text-info-ink" : "bg-surface-sunk text-ink-muted")}>
            <Lock aria-hidden className="mt-0.5 size-4 shrink-0" />
            {raisonBlocage}
          </p>
        ) : null}
        {vente.kind === "vente" && vente.produit === "billet" && !actions.controle && !peutRembourser ? (
          <p className="text-[12.5px] text-ink-muted">
            {actionsCoupees
              ? "Accès en lecture au module : les actions d'après-vente sont coupées pour ce compte."
              : "Remboursement réservé aux encadrants (chef de gare, contrôle des recettes, chef de vente)."}
          </p>
        ) : null}
        {vente.kind === "vente" && vente.produit === "billet" && actions.politique && !actions.politique.autorise ? (
          <p className="text-[12.5px] text-ink-muted">{actions.politique.raison}</p>
        ) : null}

        <Fiche
          elements={[
            ["Client", dossier.resume.client ?? "—"],
            dossier.resume.telephone ? ["Téléphone", <span key="t" className="tabular">{dossier.resume.telephone}</span>] : null,
            ["Trajet", dossier.resume.trajet ?? "—"],
            dossier.desserte ? ["Desserte", `${nomTrain(dossier.desserte.trainType, dossier.desserte.trainNumber)} · ${dateCourte(dossier.desserte.serviceDate)} · ${heure(dossier.desserte.departAt)}`] : null,
            dossier.resume.places.length ? ["Place", <span key="p" className="tabular">{dossier.resume.places.join(", ")}</span>] : null,
            ["Montant", <span key="m" className="tabular">{xaf(vente.montants.ttc)}</span>],
            ["Moyen", libelleMoyen(vente.moyen)],
            vente.motif ? ["Motif", vente.motif] : null,
            vente.penalitePct !== null ? ["Pénalité", `${vente.penalitePct} %`] : null,
            dossier.resume.origine ? ["Opération d'origine", <button key="o" type="button" className="tabular font-semibold text-accent-ink underline" onClick={() => onOuvrir(dossier.resume.origine!.id)}>{dossier.resume.origine.numero}</button>] : null,
            ["Vendu par", [vente.vendeur, vente.matriculeVendeur].filter(Boolean).join(" · ") || "—"],
            ["Point de vente", vente.pointDeVente?.name ?? "—"],
            ["Enregistré le", dateHeure(vente.heure)],
          ]}
        />

        {dossier.billets.length > 0 ? (
          <section className="grid gap-2">
            <h3 className="text-[13px] font-semibold">Billets</h3>
            <ul className="grid gap-2">
              {dossier.billets.map((b) => (
                <li key={b.id} className="grid gap-1 rounded-md border border-line px-3.5 py-2.5 text-[13.5px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="tabular text-[12.5px] font-semibold">{b.numero}</span>
                    <PastilleBillet statut={b.statut as StatutBillet} />
                    {b.duplicatas > 0 ? <small className="text-[12px] text-ink-muted">{b.duplicatas} duplicata{b.duplicatas > 1 ? "s" : ""}</small> : null}
                  </div>
                  <div className="flex flex-wrap justify-between gap-2 text-ink-muted">
                    <span>
                      {b.voyageur.prenom} {b.voyageur.nom} · {libelleClasse(b.classe, true)}
                    </span>
                    <span className="tabular">{b.place ? `${b.voiture ?? ""} · ${b.place}` : "—"} · {montant(b.prix)}</span>
                  </div>
                  {b.controleA ? <small className="text-[12px] text-info-ink">Contrôlé à bord à {heure(b.controleA)}</small> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {dossier.paiements.length > 0 ? (
          <section className="grid gap-2">
            <h3 className="text-[13px] font-semibold">Règlement</h3>
            {dossier.paiements.map((p) => (
              <div key={p.id} className="grid gap-0.5 rounded-md bg-surface-sunk px-3.5 py-2.5 text-[13.5px]">
                <span className="flex flex-wrap justify-between gap-2">
                  <b className="font-semibold">{libelleMoyen(p.moyen)}</b>
                  <span className="tabular">{xaf(p.montant)}</span>
                </span>
                <small className="text-[12.5px] text-ink-muted">
                  {p.statut === "confirme" ? "Confirmé" : p.statut === "echoue" ? `Refusé${p.raison ? ` · ${p.raison}` : ""}` : p.statut}
                  {p.remis !== null ? ` · reçu ${montant(p.remis)} · rendu ${montant(p.rendu ?? 0)}` : ""}
                  {p.reference ? ` · réf. ${p.reference}` : ""}
                  {p.simule ? " · réponse opérateur simulée" : ""}
                </small>
              </div>
            ))}
          </section>
        ) : null}

        {dossier.liees.length > 0 ? (
          <section className="grid gap-2">
            <h3 className="text-[13px] font-semibold">Écritures liées</h3>
            {dossier.liees.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => onOuvrir(l.id)}
                className="flex min-h-11 flex-wrap items-center justify-between gap-2 rounded-md border border-line px-3.5 py-2 text-left text-[13.5px] hover:bg-surface-sunk"
              >
                <span className="tabular text-[12.5px] font-semibold">{l.numero}</span>
                <span className="text-ink-muted">{libelleProduit(l.produit, l.kind)}</span>
                <span className="tabular">{montantSigne(l.montant)} XAF</span>
              </button>
            ))}
          </section>
        ) : null}

        <section className="grid gap-2">
          <h3 className="text-[13px] font-semibold">Historique</h3>
          <Chronologie
            evenements={dossier.chronologie.map((e) => ({
              cle: e.cle,
              heure: heure(e.heure),
              titre: libelleJournal(e.action),
              detail: [e.acteur, e.action.startsWith("controle") ? e.detail : null].filter(Boolean).join(" · ") || undefined,
            }))}
          />
        </section>
      </Tiroir>
      {boite ? <BoiteAction boite={boite} dossier={dossier} onFermer={() => setBoite(null)} onFait={(texte) => setMessage({ ton: "success", texte })} /> : null}
      {zone}
    </>
  )
}

/* ═══════════════════════ Annulation et remboursement ══════════════════════ */

function BoiteAction({ boite, dossier, onFermer, onFait }: { boite: "annuler" | "rembourser"; dossier: DossierVente; onFermer: () => void; onFait: (texte: string) => void }) {
  const annuler = useEcriture(api.functions.sales.cancel)
  const rembourser = useEcriture(api.functions.guichet.rembourser)
  const motifs = boite === "rembourser" ? dossier.actions.motifs : ["Erreur de vente au guichet", "Voyage annulé par le client", "Changement de date"]
  const [motif, setMotif] = useState(motifs[0] ?? "")
  const [precision, setPrecision] = useState("")
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState("")
  const valides = dossier.billets.filter((b) => b.statut === "valide")
  const paye = valides.reduce((s, b) => s + b.prix, 0)
  const penalite = boite === "rembourser" && dossier.actions.politique?.autorise ? dossier.actions.politique.penalitePct : 0
  const retenue = Math.round((paye * penalite) / 100)
  const rendu = paye - retenue
  const places = valides.filter((b) => b.place).map((b) => `${b.voiture ?? ""} · ${b.place}`)
  const moyenSortie = dossier.vente.moyen === "en_compte" ? "au crédit du compte client" : "en espèces"
  const texteMotif = [motif, precision.trim()].filter(Boolean).join(" — ")

  const confirmer = async () => {
    if (!texteMotif) return setErreur("Le motif est obligatoire.")
    setEnCours(true)
    setErreur("")
    try {
      if (boite === "annuler") {
        const r = await annuler({ saleId: dossier.vente.id as never, reason: texteMotif })
        onFait(`Annulation ${r.number} enregistrée · ${xaf(Math.abs(r.amountTtc))} rendus ${moyenSortie} · place remise en vente`)
      } else {
        const r = await rembourser({ venteId: dossier.vente.id as never, motif: texteMotif })
        onFait(`Remboursement ${r?.number ?? ""} enregistré · ${xaf(r?.refundedTtc ?? rendu)} rendus ${moyenSortie} · place remise en vente`)
      }
      onFermer()
    } catch (cause) {
      setErreur(messageErreur(cause))
    } finally {
      setEnCours(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => (!o ? onFermer() : undefined)}>
      <DialogContent className="max-w-[min(560px,calc(100%-2rem))] gap-4 bg-surface text-ink sm:max-w-[560px]">
        <div className="grid gap-1 pr-10">
          <DialogTitle className="text-[20px] font-bold">{boite === "annuler" ? "Annuler la vente" : "Rembourser le billet"}</DialogTitle>
          <DialogDescription className="text-small text-ink-muted">
            <span className="tabular">{dossier.vente.numero}</span> · {dossier.resume.client ?? "—"} · {dossier.resume.trajet ?? ""}
          </DialogDescription>
        </div>
        <Field label="Motif" htmlFor="motif-apres-vente">
          <SelectNative id="motif-apres-vente" value={motif} onChange={(event) => setMotif(event.target.value)}>
            {motifs.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </SelectNative>
        </Field>
        <Field label="Précision" htmlFor="precision-apres-vente" hint="Facultatif · reportée au journal d'audit.">
          <Textarea id="precision-apres-vente" value={precision} onChange={(event) => setPrecision(event.target.value)} className="min-h-20" />
        </Field>
        <div className="grid gap-2.5 rounded-md border border-line p-4">
          <LigneRecap libelle="Prix payé" valeur={montant(paye)} />
          {boite === "rembourser" ? (
            <LigneRecap libelle={`Pénalité ${penalite} % · ${dossier.actions.politique?.raison ?? ""}`} valeur={`−${montant(retenue)}`} />
          ) : (
            <LigneRecap libelle="Annulation au guichet · sans pénalité" valeur="0" />
          )}
          <LigneRecap libelle={`À rendre ${moyenSortie}`} valeur={xaf(boite === "annuler" ? paye : rendu)} fort />
        </div>
        {dossier.caisseSortie && dossier.vente.moyen !== "en_compte" ? (
          <p className="text-small flex items-start gap-2 text-ink-muted">
            <Wallet aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>
              <b className="font-semibold text-ink">{dossier.caisseSortie.libelle}.</b>{" "}
              {dossier.caisseSortie.mode === "hors_caisse"
                ? "L'écriture entre dans la journée comptable, sans toucher au rapprochement d'un guichet."
                : "L'écriture entre dans le rapprochement de cette caisse."}
            </span>
          </p>
        ) : null}
        {boite === "rembourser" && dossier.actions.baremeProvisoire ? (
          <p className="text-[12.5px] text-ink-muted">Barème par défaut du guichet, en attente du paramétrage des pénalités par SETRAG.</p>
        ) : null}
        {places.length ? (
          <p className="text-small flex items-start gap-2 rounded-md bg-surface-sunk px-3.5 py-2.5 text-ink-muted">
            <RotateCcw aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>
              <b className="font-semibold text-ink">La place {places.join(", ")} repart à la vente</b> dès la validation, pour tous les canaux.
            </span>
          </p>
        ) : null}
        {erreur ? (
          <InlineMessage tone="danger" title="Opération refusée.">
            {erreur}
          </InlineMessage>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onFermer}>
            Fermer
          </Button>
          <Button type="button" loading={enCours} loadingLabel="Enregistrement…" onClick={confirmer}>
            {boite === "annuler" ? <Ban aria-hidden /> : <RotateCcw aria-hidden />}
            {boite === "annuler" ? `Annuler et rendre ${xaf(paye)}` : `Rembourser ${xaf(rendu)}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ═════════════════════════════ Écran ══════════════════════════════════════ */

export interface ParametresImpression {
  mentionDuplicata: string
  piedBillet: string
}

/**
 * Liste et dossiers d'après-vente. `guichet` : les opérations du point de
 * vente du vendeur ; `reseau` : le périmètre de l'encadrant (sa gare, ou le
 * réseau entier avec un filtre par point de vente).
 */
export function EcranApresVente({
  mode = "guichet",
  parametres,
  enLigne,
  actionsCoupees,
  enTete = true,
}: {
  mode?: "guichet" | "reseau"
  parametres: ParametresImpression
  enLigne: boolean
  actionsCoupees?: boolean
  enTete?: boolean
}) {
  const router = useRouter()
  const params = useSearchParams()
  const ouvert = params.get("op")
  const [periode, setPeriode] = useState<"jour" | "7j" | "30j">("jour")
  const [produit, setProduit] = useState<string>("tous")
  const [etat, setEtat] = useState<string>("tous")
  const [saisieNumero, setSaisieNumero] = useState("")
  const [numero, setNumero] = useState("")
  const [pointDeVente, setPointDeVente] = useState("")
  const perimetre = useLecture(api.functions.guichet.perimetreApresVente, mode === "reseau" ? {} : "skip")
  const operationsGuichet = useLecture(api.functions.guichet.operations, mode === "guichet" ? (numero ? { periode, numero } : { periode }) : "skip")
  const operationsReseau = useLecture(
    api.functions.guichet.operationsReseau,
    mode === "reseau" ? { periode, numero: numero || undefined, pointOfSaleId: (pointDeVente || undefined) as never } : "skip"
  )
  const operations = mode === "reseau" ? operationsReseau : operationsGuichet
  const colonnes = useMemo(
    () =>
      mode === "reseau"
        ? [
            ...COLONNES.slice(0, 2),
            {
              cle: "pdv",
              libelle: "Point de vente",
              rendu: (o: Operation) => o.pointDeVente?.name ?? (o.canal === "ligne" ? "Vente en ligne" : "—"),
              tri: (o: Operation) => o.pointDeVente?.name ?? "",
              secondaire: true,
            },
            ...COLONNES.slice(2),
          ]
        : COLONNES,
    [mode]
  )
  const lignes = useMemo(() => operations?.filter((o) => correspondProduit(o, produit) && correspondEtat(o, etat)), [operations, produit, etat])

  const ouvrir = (id: string | null) => {
    const suite = new URLSearchParams(params.toString())
    if (id) suite.set("op", id)
    else suite.delete("op")
    const requete = suite.toString()
    const chemin = mode === "reseau" ? "/gestion/apres-vente" : "/vente/operations"
    router.replace(`${chemin}${requete ? `?${requete}` : ""}` as Route, { scroll: false })
  }

  return (
    <>
      {enTete ? (
        <EnTetePage
          surtitre="Guichet · opérations"
          titre="Après-vente"
          description="Retrouver une opération par numéro, nom ou téléphone. Un billet contrôlé à bord ne s'annule plus et ne se rembourse plus au guichet."
        />
      ) : null}
      {mode === "reseau" && perimetre ? (
        <p className="text-small text-ink-muted">
          {perimetre.mode === "gare"
            ? `Périmètre : ${perimetre.gare ? `gare de ${perimetre.gare.name}` : (perimetre.pointsDeVente[0]?.name ?? "votre point de vente")}. Un numéro exact se retrouve sur tout le réseau.`
            : "Périmètre : réseau entier, ventes en ligne comprises."}
        </p>
      ) : null}
      {!enLigne ? <HorsReseau /> : null}
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          setNumero(saisieNumero.trim())
        }}
      >
        <Field label="Numéro exact de vente, de billet, d'étiquette ou de souche" htmlFor="numero-operation" className="min-w-[260px] flex-1">
          <Input
            id="numero-operation"
            className="tabular"
            autoComplete="off"
            placeholder="B-OWE-PV-20261001-000042"
            value={saisieNumero}
            onChange={(event) => setSaisieNumero(event.target.value)}
          />
        </Field>
        <Button type="submit" variant="secondary" size="lg">
          <Search aria-hidden />
          Retrouver
        </Button>
        {numero ? (
          <Button
            type="button"
            variant="ghost"
            size="lg"
            onClick={() => {
              setNumero("")
              setSaisieNumero("")
            }}
          >
            Revenir à la liste
          </Button>
        ) : null}
      </form>

      <TableauDonnees
        libelle="Opérations du guichet"
        colonnes={colonnes}
        lignes={lignes}
        cle={(o) => o.id}
        surLigne={(o) => ouvrir(o.id)}
        selection={ouvert ?? undefined}
        recherche={{
          placeholder: "N° de vente, de billet, nom ou téléphone",
          texte: (o) => [o.numero, ...o.references, o.client, o.telephone, o.trajet].filter(Boolean).join(" "),
        }}
        exportNom={mode === "reseau" ? "apres-vente-reseau" : "operations-guichet"}
        triInitial={{ cle: "heure", sens: "desc" }}
        filtres={
          <div className="flex w-full flex-wrap items-center gap-2">
            <SegmentedControl
              label="Période"
              size="touch"
              value={periode}
              onValueChange={(v) => setPeriode(v as typeof periode)}
              options={[
                { value: "jour", label: "Aujourd'hui" },
                { value: "7j", label: "7 jours" },
                { value: "30j", label: "30 jours" },
              ]}
            />
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Produit">
              {PRODUITS_FILTRE.map((f) => (
                <button
                  key={f.valeur}
                  type="button"
                  aria-pressed={produit === f.valeur}
                  onClick={() => setProduit(f.valeur)}
                  className={cn(
                    "min-h-11 rounded-pill border px-3.5 text-[13px] font-semibold",
                    produit === f.valeur ? "border-accent-base bg-accent-soft text-accent-ink" : "border-line-strong bg-surface text-ink-muted hover:text-ink"
                  )}
                >
                  {f.libelle}
                </button>
              ))}
            </div>
            {mode === "reseau" && perimetre && perimetre.pointsDeVente.length > 1 ? (
              <>
                <label className="sr-only" htmlFor="filtre-pdv">
                  Point de vente
                </label>
                <select
                  id="filtre-pdv"
                  value={pointDeVente}
                  onChange={(event) => setPointDeVente(event.target.value)}
                  className="min-h-11 max-w-[260px] rounded-md border border-line-strong bg-surface px-3 text-[14px]"
                >
                  <option value="">{perimetre.mode === "gare" ? "Tous les guichets de la gare" : "Tous les points de vente"}</option>
                  {perimetre.pointsDeVente.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </>
            ) : null}
            <label className="sr-only" htmlFor="filtre-etat">
              État
            </label>
            <select
              id="filtre-etat"
              value={etat}
              onChange={(event) => setEtat(event.target.value)}
              className="min-h-11 rounded-md border border-line-strong bg-surface px-3 text-[14px]"
            >
              {ETATS_FILTRE.map((f) => (
                <option key={f.valeur} value={f.valeur}>
                  {f.libelle}
                </option>
              ))}
            </select>
          </div>
        }
        vide={{
          titre: numero ? `Aucune opération ne porte le numéro ${numero}` : "Aucune opération sur la période",
          description: numero ? "Vérifiez le numéro, ou cherchez par nom dans la liste." : "Élargissez la période, ou changez de filtre.",
          action: periode !== "30j" && !numero ? (
            <Button type="button" variant="secondary" size="sm" onClick={() => setPeriode("30j")}>
              Voir 30 jours
            </Button>
          ) : undefined,
        }}
      />
      {ouvert ? (
        <LimiteErreur titre="Le dossier n'a pas pu être lu.">
          <DossierOperation
            key={ouvert}
            venteId={ouvert}
            parametres={parametres}
            enLigne={enLigne}
            actionsCoupees={actionsCoupees}
            onFermer={() => ouvrir(null)}
            onOuvrir={(id) => ouvrir(id)}
          />
        </LimiteErreur>
      ) : null}
    </>
  )
}

export function OperationsPageClient() {
  return (
    <Suspense fallback={null}>
      <PageApresVente />
    </Suspense>
  )
}

function PageApresVente() {
  const { contexte, enLigne } = useGuichet()
  return (
    <CadreGuichet contexte={contexte}>
      {contexte ? (
        <LimiteErreur titre="Les opérations n'ont pas pu être lues.">
          <EcranApresVente parametres={contexte.parametres} enLigne={enLigne} />
        </LimiteErreur>
      ) : (
        <ChargementEcran libelle="Chargement des opérations…" />
      )}
    </CadreGuichet>
  )
}

/* ═════════════════════════ Après-vente du réseau ══════════════════════════ */

/**
 * Rubrique de gestion : la même liste et les mêmes dossiers, au périmètre
 * de l'encadrant. C'est ici que le chef de gare, le contrôle des recettes et
 * le chef de vente remboursent — la vendeuse ne le peut pas.
 */
export function ApresVenteReseauPageClient() {
  return (
    <Suspense fallback={null}>
      <PageApresVenteReseau />
    </Suspense>
  )
}

function PageApresVenteReseau() {
  const enLigne = useOnlineStatus()
  const { may, lectureModule, role } = useDroitsGestion()
  const perimetre = useLecture(api.functions.guichet.perimetreApresVente, {})
  const actionsCoupees = lectureModule || !(may("remboursements", "creer") || may("remboursements", "valider") || may("annulations", "creer"))
  return (
    <CadreGestion
      surtitre="Commercial · après-vente"
      titre="Après-vente du réseau"
      description="Retrouver une vente, l'annuler ou la rembourser avec motif, pénalité du paramétrage et trace au journal. Un billet contrôlé à bord ne s'annule ni ne se rembourse."
      lectureSeule={actionsCoupees ? mentionLectureSeule(role, "l'après-vente") : undefined}
    >
      <LimiteErreur titre="L'après-vente n'a pas pu être lue.">
        {perimetre ? (
          <EcranApresVente mode="reseau" parametres={perimetre.parametres} enLigne={enLigne} actionsCoupees={lectureModule} enTete={false} />
        ) : (
          <ChargementEcran libelle="Chargement de l'après-vente…" />
        )}
      </LimiteErreur>
    </CadreGestion>
  )
}
