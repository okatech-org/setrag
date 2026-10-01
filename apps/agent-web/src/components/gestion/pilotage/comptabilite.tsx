"use client"

import {
  BadgeCheck,
  Database,
  Download,
  FileCheck,
  FileSpreadsheet,
  History,
  RefreshCw,
  Scale,
  Send,
  TriangleAlert,
  X,
} from "lucide-react"
import type { FunctionReturnType } from "convex/server"
import { useConvex } from "convex/react"
import { useState } from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { Checkbox, RadioGroup, Radio } from "@workspace/ui/components/choice"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { EmptyState, SkeletonLines } from "@workspace/ui/components/empty-state"
import { Field, SelectNative, Textarea } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { Tag } from "@workspace/ui/components/tag"

import {
  Chronologie,
  EnTetePage,
  Fiche,
  Indicateur,
  Indicateurs,
  LienBouton,
  Panneau,
  TableauDonnees,
  telechargerTexte,
  type ColonneTableau,
} from "@/components/charte"

import { CadrePilotage, messageLectureSeule, usePilotage } from "./cadre"
import { Chiffre, ListeEtDossier, TagDeversement, TagJournee, useExecution } from "./elements"
import { dateNumerique, horodatage, jourLong, jourNumerique, montant, montantCompact, nombre } from "./format"
import { useSelectionUrl } from "./url"

type Journees = FunctionReturnType<typeof api.functions.pilotage.journeesComptables>
type Journee = Journees[number]
type Detail = NonNullable<FunctionReturnType<typeof api.functions.pilotage.detailJournee>>
type Ecriture = Detail["entries"][number]

export function Comptabilite() {
  const pilotage = usePilotage()
  const [selection, choisir] = useSelectionUrl(["journee"] as const)
  const journees = useQuery(api.functions.pilotage.journeesComptables, pilotage.voit("journal_comptable") ? { limit: 60 } : "skip")
  const journee: Journee | undefined =
    journees?.find((j) => j._id === selection.journee) ??
    journees?.find((j) => j.exportStatus === "echec") ??
    journees?.find((j) => j.status === "cloturee")
  const detail = useQuery(api.functions.pilotage.detailJournee, journee ? { accountingDayId: journee._id } : "skip")
  const rejetees = journees?.filter((j) => j.exportStatus === "echec") ?? []

  const peutEcrire = pilotage.peut("journal_comptable", "modifier")
  const peutEngendrer = pilotage.peut("journal_comptable", "creer")
  const lectureSeule =
    pilotage.pret && pilotage.enLigne && !peutEcrire && !peutEngendrer
      ? messageLectureSeule(pilotage.role, "la comptabilité")
      : false

  const colonnes: ColonneTableau<Journee>[] = [
    { cle: "date", libelle: "Journée", rendu: (j) => <b className="tabular font-semibold">{jourNumerique(j.date)}</b>, tri: (j) => j.date, export: (j) => j.date },
    { cle: "pieces", libelle: "Pièces", numerique: true, rendu: (j) => nombre(j.journal?.pieces), tri: (j) => j.journal?.pieces ?? null },
    { cle: "ttc", libelle: "Ventes TTC", numerique: true, rendu: (j) => montant(j.journal ? j.journal.totalTtc + (j.journal.refundsTtc ?? 0) : j.totalTtc), tri: (j) => j.totalTtc },
    { cle: "remb", libelle: "Remboursements", numerique: true, secondaire: true, rendu: (j) => (j.journal?.refundsTtc ? `−${montant(j.journal.refundsTtc)}` : "—"), tri: (j) => j.journal?.refundsTtc ?? null },
    {
      cle: "deverse",
      libelle: "Déversé",
      secondaire: true,
      rendu: (j) => <span className="tabular text-[13px]">{horodatage(j.derniereTransmission?.sentAt ?? null)}</span>,
      tri: (j) => j.derniereTransmission?.sentAt ?? null,
    },
    {
      cle: "etat",
      libelle: "État",
      rendu: (j) =>
        j.status === "ouverte" ? (
          <TagJournee statut="ouverte" />
        ) : (
          <span className="flex flex-wrap items-center gap-1.5">
            <TagDeversement etat={j.exportStatus} journal={Boolean(j.journal)} />
            {j.derniereTransmission?.rejected ? <span className="text-[12.5px] text-danger-ink">{j.derniereTransmission.rejected} pièce(s)</span> : null}
          </span>
        ),
      tri: (j) => (j.exportStatus === "echec" ? 0 : j.status === "ouverte" ? 3 : j.journal ? (j.exportStatus === "integre" ? 4 : 1) : 2),
      export: (j) => (j.status === "ouverte" ? "Ouverte" : !j.journal ? "Journal à engendrer" : j.exportStatus === "echec" ? "Rejeté" : j.exportStatus === "integre" ? "Intégré" : "En file"),
    },
  ]

  return (
    <CadrePilotage lectureSeule={lectureSeule}>
      <EnTetePage
        surtitre="Finances · interface SAGE X3 V12"
        titre="Comptabilité"
        description="Chaque journée comptable clôturée produit le journal des ventes (état V65), déversé dans SAGE X3. Une pièce rejetée se corrige ici, puis se rejoue ; le journal n’est jamais régénéré."
      />

      {rejetees.length > 0 ? (
        <InlineMessage tone="danger" title={`${rejetees.length} déversement(s) rejeté(s) par SAGE.`}>
          <span className="flex flex-wrap items-center gap-3">
            <span>
              {rejetees
                .slice(0, 3)
                .map((j) => `${jourNumerique(j.date)} : ${j.exportError ?? j.event?.lastError ?? "motif non transmis"}`)
                .join(" · ")}
            </span>
            {rejetees[0] && rejetees[0]._id !== journee?._id ? (
              <Button type="button" variant="secondary" onClick={() => choisir({ journee: rejetees[0]!._id })}>
                Voir le {jourNumerique(rejetees[0].date)}
              </Button>
            ) : null}
          </span>
        </InlineMessage>
      ) : null}

      <InlineMessage tone="info" title="SAGE X3 n’est pas encore raccordé : ses réponses sont simulées.">
        Le simulateur applique les règles d’import de SAGE (compte analytique du plan, point de vente actif ou centre de coût
        de rattachement). Les accusés et rejets sont tracés comme simulés ; aucune écriture ne quitte la plateforme.
      </InlineMessage>

      {journees === undefined ? (
        <SkeletonLines />
      ) : journees.length === 0 ? (
        <EmptyState title="Aucune journée comptable" description="Les journées apparaissent à l’ouverture de la première caisse." />
      ) : (
        <>
          <ListeEtDossier
            liste={
              <Panneau titre="Déversements" icone={Database} plein>
                <div className="p-4">
                  <TableauDonnees
                    colonnes={colonnes}
                    lignes={journees}
                    cle={(j) => j._id}
                    libelle="Journées comptables et déversements"
                    surLigne={(j) => choisir({ journee: j._id })}
                    selection={journee?._id ?? ""}
                    exportNom="setrag-deversements-sage"
                    parPage={12}
                    triInitial={{ cle: "date", sens: "desc" }}
                    vide={{ titre: "Aucune journée" }}
                  />
                </div>
              </Panneau>
            }
            dossier={
              journee ? (
                <DossierJournee journee={journee} detail={detail} peutEcrire={peutEcrire} peutEngendrer={peutEngendrer} />
              ) : (
                <Panneau titre="Journée comptable" icone={FileCheck}>
                  <p className="text-small text-ink-muted">Aucune journée clôturée : le journal V65 se produit après la clôture.</p>
                  {pilotage.voit("journee_comptable") ? <LienBouton href="/gestion/recettes">Contrôle des recettes</LienBouton> : null}
                </Panneau>
              )
            }
          />
          {journee && detail ? <Journal detail={detail} /> : null}
        </>
      )}
    </CadrePilotage>
  )
}

function DossierJournee({
  journee,
  detail,
  peutEcrire,
  peutEngendrer,
}: {
  journee: Journee
  detail: Detail | null | undefined
  peutEcrire: boolean
  peutEngendrer: boolean
}) {
  const execution = useExecution()
  const engendrer = useMutation(api.functions.accounting.generateJournal)
  const transmettre = useMutation(api.functions.pilotage.transmettreSage)
  const rejouer = useMutation(api.functions.accounting.retryExport)
  const corriger = useMutation(api.functions.pilotage.corrigerEtRejouer)
  const accuser = useMutation(api.functions.accounting.acknowledgeExport)
  const [pieces, setPieces] = useState<string[] | null>(null)
  const [centre, setCentre] = useState("")
  const [motif, setMotif] = useState("")
  const [accuse, setAccuse] = useState(false)

  if (detail === undefined) {
    return (
      <Panneau titre={`Journée du ${jourNumerique(journee.date)}`} icone={FileCheck}>
        <SkeletonLines />
      </Panneau>
    )
  }
  if (detail === null) return null

  const derniere = detail.transmissions[0]
  const rejets = detail.day.exportStatus === "echec" && derniere?.result === "rejete" ? derniere.rejectedPieces : []
  const choisies = pieces ?? rejets.map((p) => p.pieceNumber)
  const aJournal = detail.entries.length > 0
  const libelleJour = jourNumerique(detail.day.date)

  return (
    <>
      <Panneau
        titre={`Journée du ${libelleJour}`}
        icone={FileCheck}
        sousTitre={jourLong(detail.day.date)}
        actions={detail.day.status === "ouverte" ? <TagJournee statut="ouverte" /> : <TagDeversement etat={detail.day.exportStatus} journal={aJournal} />}
      >
        <Fiche
          elements={[
            ["Recette de la journée", <Chiffre key="t">{montant(detail.day.totalTtc)} XAF</Chiffre>],
            ["Pièces au journal", aJournal ? <Chiffre key="p">{nombre(detail.entries.length)}</Chiffre> : "—"],
            ["Clôturée le", horodatage(detail.day.closedAt)],
            detail.event ? ["Tentatives d’envoi", <Chiffre key="a">{nombre(detail.event.attempts)}</Chiffre>] : null,
            derniere ? ["Dernier accusé", <span key="r" className="tabular">{derniere.receiptNumber}</span>] : null,
          ]}
        />

        {execution.retour}

        {detail.day.status === "ouverte" ? (
          <InlineMessage tone="info" title="Journée encore ouverte : le journal se produit après la clôture.">
            <LienBouton href={`/gestion/recettes?journee=${detail.day._id}`}>Aller au contrôle des recettes</LienBouton>
          </InlineMessage>
        ) : !aJournal ? (
          <>
            {detail.caisses.nonVisees > 0 ? (
              <InlineMessage tone="warning" title={`${detail.caisses.nonVisees} écart(s) de caisse à viser avant le déversement.`}>
                <LienBouton href={`/gestion/recettes?journee=${detail.day._id}`}>Viser les écarts</LienBouton>
              </InlineMessage>
            ) : null}
            {peutEngendrer ? (
              <Button
                type="button"
                block
                disabled={detail.caisses.nonVisees > 0}
                loading={execution.enCours === "journal"}
                loadingLabel="Production du journal…"
                onClick={() =>
                  execution.executer("journal", () => engendrer({ accountingDayId: detail.day._id }), (r) => ({
                    titre: `Journal V65 du ${libelleJour} engendré.`,
                    detail: `${nombre(r.entries)} pièce(s), ${montant(r.totalTtc)} XAF TTC, mis en file d’envoi vers SAGE.`,
                  }))
                }
              >
                <FileSpreadsheet />
                Engendrer le journal V65
              </Button>
            ) : (
              <p className="text-small text-ink-muted">Le journal n’est pas encore engendré ; le comptable le produit.</p>
            )}
          </>
        ) : detail.event?.status === "en_attente" && peutEcrire ? (
          <Button
            type="button"
            block
            loading={execution.enCours === "envoi"}
            loadingLabel="Transmission…"
            onClick={() =>
              execution.executer("envoi", () => transmettre({ accountingDayId: detail.day._id }), (r) =>
                r.result === "integre"
                  ? { titre: `Journal du ${libelleJour} intégré par SAGE (simulé).`, detail: `Accusé ${r.receiptNumber} · ${nombre(r.pieces)} pièce(s).` }
                  : { titre: `SAGE a rejeté ${nombre(r.rejected)} pièce(s) (simulé).`, detail: "Corrigez les pièces ci-dessous, puis rejouez." }
              )
            }
          >
            <Send />
            Transmettre à SAGE X3
          </Button>
        ) : null}

        {rejets.length > 0 ? (
          <div className="grid gap-3">
            <InlineMessage tone="danger" title={`${rejets.length} pièce(s) rejetée(s)`}>
              {derniere?.sentAt ? `Envoi du ${horodatage(derniere.sentAt)} · accusé ${derniere.receiptNumber}` : null}
            </InlineMessage>
            <ul className="grid gap-2">
              {rejets.map((p) => (
                <li key={p.pieceNumber} className="grid gap-1 rounded-md border border-line p-3">
                  {peutEcrire ? (
                    <Checkbox
                      label={p.pieceNumber}
                      checked={choisies.includes(p.pieceNumber)}
                      onCheckedChange={(coche) =>
                        setPieces(coche ? [...choisies, p.pieceNumber] : choisies.filter((n) => n !== p.pieceNumber))
                      }
                    />
                  ) : (
                    <b className="tabular">{p.pieceNumber}</b>
                  )}
                  <Fiche
                    elements={[
                      ["Point de vente", p.pointOfSaleCode],
                      ["Compte analytique", <span key="c" className="tabular">{p.analyticAccount}</span>],
                      p.costCenter ? ["Centre de coût", <span key="cc" className="tabular">{p.costCenter}</span>] : null,
                      ["Montant TTC", <Chiffre key="m">{montant(p.ttc)}</Chiffre>],
                    ]}
                  />
                  <p className="flex items-start gap-1.5 text-[13px] text-danger-ink">
                    <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                    {p.reason}
                  </p>
                </li>
              ))}
            </ul>
            {peutEcrire ? (
              <form
                className="grid gap-3"
                onSubmit={async (event) => {
                  event.preventDefault()
                  const r = await execution.executer(
                    "corriger",
                    () =>
                      corriger({
                        accountingDayId: detail.day._id,
                        pieceNumbers: choisies,
                        costCenter: centre,
                        motif,
                      }),
                    (r) =>
                      r.result === "integre"
                        ? { titre: `Déversement du ${libelleJour} rejoué et intégré (simulé).`, detail: `Accusé ${r.receiptNumber} · ${nombre(r.pieces)} pièce(s).` }
                        : { titre: `Rejoué, mais ${nombre(r.rejected)} pièce(s) restent rejetées.`, detail: "Voyez les motifs ci-dessus." }
                  )
                  if (r) {
                    setPieces(null)
                    setMotif("")
                  }
                }}
              >
                <Field label="Rattacher au centre de coût" hint="Correction tracée au journal d’audit, avec l’ancienne valeur.">
                  <SelectNative value={centre} onChange={(event) => setCentre(event.target.value)} required>
                    <option value="">Choisir un centre de coût…</option>
                    {detail.centresDeCout.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code} · {c.label}
                      </option>
                    ))}
                  </SelectNative>
                </Field>
                <Field label="Motif de la correction">
                  <Textarea rows={2} value={motif} onChange={(event) => setMotif(event.target.value)} minLength={5} required />
                </Field>
                <Button type="submit" block disabled={!centre || choisies.length === 0 || motif.trim().length < 5} loading={execution.enCours === "corriger"} loadingLabel="Correction et rejeu…">
                  <RefreshCw />
                  Corriger et rejouer le {libelleJour}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  block
                  loading={execution.enCours === "rejouer"}
                  onClick={() =>
                    execution.executer("rejouer", () => rejouer({ accountingDayId: detail.day._id }), () => ({
                      titre: "Déversement remis en file, sans correction.",
                      detail: "À utiliser quand le référentiel SAGE a été corrigé de son côté.",
                    }))
                  }
                >
                  Remettre en file sans corriger
                </Button>
              </form>
            ) : null}
          </div>
        ) : null}

        {aJournal && peutEcrire && detail.event && detail.event.status !== "envoye" ? (
          <Button type="button" variant="ghost" block onClick={() => setAccuse(true)}>
            <BadgeCheck />
            Saisir un accusé de SAGE
          </Button>
        ) : null}
      </Panneau>

      {detail.transmissions.length > 0 ? (
        <Panneau titre="Échanges avec SAGE X3" icone={History}>
          <Chronologie
            evenements={detail.transmissions.map((t) => ({
              cle: t._id,
              heure: horodatage(t.sentAt).slice(6),
              titre: t.result === "integre" ? `Intégré · accusé ${t.receiptNumber}` : `Rejeté · ${t.rejectedPieces.length} pièce(s)`,
              detail: `Tentative ${t.attempt} · ${dateNumerique(t.sentAt)} · ${t.sentBy}${t.simulated ? " · simulé" : ""}`,
            }))}
          />
        </Panneau>
      ) : null}

      <DialogueAccuse
        ouvert={accuse}
        surFermeture={() => setAccuse(false)}
        enCours={execution.enCours === "accuse"}
        surConfirmation={async (integre, erreur) => {
          const r = await execution.executer(
            "accuse",
            () => accuser({ accountingDayId: detail.day._id, integrated: integre, error: integre ? undefined : erreur }),
            () => (integre ? "Accusé d’intégration enregistré." : "Rejet enregistré : la journée passe en échec.")
          )
          if (r !== undefined) setAccuse(false)
        }}
      />
    </>
  )
}

function DialogueAccuse({
  ouvert,
  surFermeture,
  enCours,
  surConfirmation,
}: {
  ouvert: boolean
  surFermeture: () => void
  enCours: boolean
  surConfirmation: (integre: boolean, erreur: string) => void
}) {
  const [resultat, setResultat] = useState<"integre" | "rejete">("integre")
  const [erreur, setErreur] = useState("")
  return (
    <Dialog open={ouvert} onOpenChange={(open) => (!open ? surFermeture() : undefined)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-h3">Accusé de SAGE X3</DialogTitle>
          <DialogDescription>
            Pour une transmission faite hors de la plateforme : reportez ici la réponse de SAGE. Saisie tracée au journal d’audit.
          </DialogDescription>
        </DialogHeader>
        <RadioGroup value={resultat} onValueChange={(v) => setResultat(v as "integre" | "rejete")} className="grid gap-1">
          <Radio value="integre" label="Journal intégré par SAGE" />
          <Radio value="rejete" label="Journal rejeté par SAGE" />
        </RadioGroup>
        {resultat === "rejete" ? (
          <Field label="Motif du rejet">
            <Textarea rows={2} value={erreur} onChange={(event) => setErreur(event.target.value)} />
          </Field>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={surFermeture}>
            <X />
            Annuler
          </Button>
          <Button type="button" variant="secondary" loading={enCours} disabled={resultat === "rejete" && erreur.trim().length < 5} onClick={() => surConfirmation(resultat === "integre", erreur.trim())}>
            Enregistrer l’accusé
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Journal V65 d’une journée : pièces, équilibre, taxes, export au format SAGE. */
function Journal({ detail }: { detail: Detail }) {
  const convex = useConvex()
  const execution = useExecution()
  const t = detail.totaux
  const libelleJour = jourNumerique(detail.day.date)
  const ttc = montantCompact(t.ttc)
  const colonnes: ColonneTableau<Ecriture>[] = [
    { cle: "journal", libelle: "Journal", secondaire: true, rendu: (e) => <span className="tabular">{e.journalCode}</span>, tri: (e) => e.journalCode },
    { cle: "piece", libelle: "N° pièce", rendu: (e) => <span className="tabular">{e.pieceNumber}</span>, tri: (e) => e.pieceNumber },
    { cle: "date", libelle: "Date", secondaire: true, rendu: (e) => <span className="tabular">{jourNumerique(e.saleDate)}</span>, tri: (e) => e.saleDate },
    { cle: "site", libelle: "Site", secondaire: true, rendu: (e) => e.financialSite, tri: (e) => e.financialSite },
    { cle: "pos", libelle: "Point de vente", rendu: (e) => e.pointOfSaleCode, tri: (e) => e.pointOfSaleCode },
    { cle: "compte", libelle: "Compte", rendu: (e) => <span className="tabular">{e.analyticAccount}</span>, tri: (e) => e.analyticAccount },
    { cle: "cc", libelle: "Centre de coût", secondaire: true, rendu: (e) => (e.costCenter ? <span className="tabular">{e.costCenter}</span> : "—"), tri: (e) => e.costCenter ?? "" },
    { cle: "ht", libelle: "HT", numerique: true, rendu: (e) => montant(e.ht), tri: (e) => e.ht },
    { cle: "tva", libelle: "TVA", numerique: true, secondaire: true, rendu: (e) => montant(e.vat), tri: (e) => e.vat },
    { cle: "css", libelle: "CSS", numerique: true, secondaire: true, rendu: (e) => montant(e.css), tri: (e) => e.css },
    { cle: "ttc", libelle: "TTC", numerique: true, rendu: (e) => montant(e.ttc), tri: (e) => e.ttc },
  ]

  async function telechargerV65() {
    await execution.executer(
      "v65",
      () => convex.query(api.functions.accounting.previewExport, { accountingDayId: detail.day._id }),
      (contenu) => {
        if (!contenu) throw new Error("Aucune écriture pour cette journée.")
        const nom = `setrag-journal-v65-${detail.day.date}.csv`
        telechargerTexte(nom, contenu)
        return `${nom} téléchargé · ${nombre(contenu.split(/\r?\n/).length - 1)} pièce(s).`
      }
    )
  }

  if (detail.entries.length === 0) return null
  return (
    <>
      <Indicateurs colonnes={4}>
        <Indicateur libelle="Chiffre d’affaires HT" valeur={montant(t.ht)} unite="XAF" />
        <Indicateur libelle="TVA collectée" valeur={montant(t.vat)} unite="XAF" />
        <Indicateur libelle="CSS" valeur={montant(t.css)} unite="XAF" />
        <Indicateur fort libelle={`Total TTC · ${libelleJour}`} valeur={ttc.chiffre} unite={ttc.unite} evolution={{ sens: "neutre", texte: `${montant(t.ventesTtc)} de ventes, −${montant(t.sortiesTtc)} rendus` }} />
      </Indicateurs>

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-5 xl:grid-cols-2">
        <Panneau titre="Équilibre de l’écriture" icone={Scale}>
          <Fiche
            elements={[
              ["Débit · encaissements TTC", <Chiffre key="d">{montant(detail.equilibre.debit)}</Chiffre>],
              ["Crédit · produits HT + TVA + CSS", <Chiffre key="c">{montant(detail.equilibre.credit)}</Chiffre>],
              ["Écart débit − crédit", <Chiffre key="e">{montant(detail.equilibre.ecart)}</Chiffre>],
              ["Recette de la journée (caisse)", <Chiffre key="j">{montant(detail.equilibre.attendu)}</Chiffre>],
            ]}
          />
          {detail.equilibre.ecart === 0 && detail.equilibre.ecartJournee === 0 ? (
            <Tag tone="success">
              <BadgeCheck aria-hidden />
              Journal équilibré, conforme à la recette
            </Tag>
          ) : (
            <Tag tone="danger">
              <TriangleAlert aria-hidden />
              Déséquilibre de {montant(Math.abs(detail.equilibre.ecart || detail.equilibre.ecartJournee))} XAF
            </Tag>
          )}
        </Panneau>
        <Panneau titre="Par compte analytique" icone={FileSpreadsheet} plein>
          <table className="w-full text-[13.5px]">
            <caption className="sr-only">Récapitulatif par compte analytique</caption>
            <thead>
              <tr className="bg-surface-sunk text-left text-[11.5px] tracking-[0.05em] text-ink-muted uppercase">
                <th scope="col" className="px-3.5 py-2">Compte</th>
                <th scope="col" className="px-3.5 py-2 text-right">Pièces</th>
                <th scope="col" className="px-3.5 py-2 text-right">HT</th>
                <th scope="col" className="px-3.5 py-2 text-right">TTC</th>
              </tr>
            </thead>
            <tbody>
              {detail.byAccount.map((c) => (
                <tr key={c.analyticAccount} className="border-t border-line">
                  <td className="px-3.5 py-2 font-mono">{c.analyticAccount}</td>
                  <td className="px-3.5 py-2 text-right font-mono tabular-nums">{nombre(c.count)}</td>
                  <td className="px-3.5 py-2 text-right font-mono tabular-nums">{montant(c.ht)}</td>
                  <td className="px-3.5 py-2 text-right font-mono tabular-nums">{montant(c.ttc)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panneau>
      </div>

      {execution.retour}
      <Panneau
        titre={`Journal des ventes V65 · ${libelleJour}`}
        icone={FileSpreadsheet}
        sousTitre={`${nombre(detail.entries.length)} pièce(s)`}
        actions={
          <Button type="button" variant="secondary" onClick={telechargerV65} loading={execution.enCours === "v65"}>
            <Download />
            Télécharger au format V65
          </Button>
        }
      >
        <TableauDonnees
          colonnes={colonnes}
          lignes={detail.entries}
          cle={(e) => e._id}
          libelle={`Journal des ventes du ${libelleJour}`}
          recherche={{ placeholder: "N° de pièce, point de vente, compte", texte: (e) => `${e.pieceNumber} ${e.pointOfSaleCode} ${e.analyticAccount} ${e.costCenter ?? ""}` }}
          exportNom={`setrag-journal-${detail.day.date}`}
          imprimable
          parPage={20}
          vide={{ titre: "Aucune pièce" }}
        />
      </Panneau>
    </>
  )
}
