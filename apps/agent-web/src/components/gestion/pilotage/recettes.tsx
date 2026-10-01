"use client"

import { BadgeCheck, CalendarDays, Coins, HandCoins, History, Lock, Receipt, RotateCcw, X } from "lucide-react"
import type { FunctionReturnType } from "convex/server"
import { useState } from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
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
import { SegmentedControl } from "@workspace/ui/components/segmented-control"

import {
  CelluleDouble,
  Chronologie,
  EnTetePage,
  Fiche,
  Indicateur,
  Indicateurs,
  Panneau,
  TableauDonnees,
  type ColonneTableau,
} from "@/components/charte"

import { CadrePilotage, messageLectureSeule, usePilotage } from "./cadre"
import {
  BandeauEcart,
  CelluleEcart,
  Chiffre,
  DialogueMotif,
  ETATS_CAISSE,
  ListeEtDossier,
  TagCaisse,
  TagDeversement,
  TagJournee,
  useExecution,
} from "./elements"
import {
  LIBELLE_MOYEN,
  LIBELLE_OPERATION,
  LIBELLE_PRODUIT,
  ajouterJours,
  ecart,
  heureDe,
  horodatage,
  jourDeService,
  jourLong,
  jourNumerique,
  montant,
  montantCompact,
  nombre,
} from "./format"
import { useSelectionUrl } from "./url"

type Journees = FunctionReturnType<typeof api.functions.pilotage.journeesRecettes>
type Journee = Journees[number]
type Caisses = FunctionReturnType<typeof api.functions.pilotage.caissesJournee>
type Caisse = Caisses["caisses"][number]

export function ControleRecettes() {
  const pilotage = usePilotage()
  const [selection, choisir] = useSelectionUrl(["journee", "caisse"] as const)
  const execution = useExecution()
  const [clotureOuverte, setClotureOuverte] = useState(false)

  const journees = useQuery(api.functions.pilotage.journeesRecettes, pilotage.voit("journee_comptable") ? { limit: 60 } : "skip")
  const aujourdhui = jourDeService()
  const journeeDuJour = journees?.find((j) => j.date === aujourdhui)
  const journee: Journee | undefined =
    journees?.find((j) => j._id === selection.journee) ?? journeeDuJour ?? journees?.[0]
  const caisses = useQuery(api.functions.pilotage.caissesJournee, journee ? { accountingDayId: journee._id } : "skip")
  const caisseChoisie = caisses?.caisses.find((c) => c._id === selection.caisse)

  const ouvrirJournee = useMutation(api.functions.cash.openAccountingDay)
  const cloturer = useMutation(api.functions.cash.closeAccountingDay)

  const peutViser = pilotage.peut("caisse", "valider")
  const peutCloturer = pilotage.peut("journee_comptable", "valider")
  const lectureSeule =
    pilotage.pret && pilotage.enLigne && !peutViser && !peutCloturer
      ? messageLectureSeule(pilotage.role, "le contrôle des recettes")
      : false

  const hier = ajouterJours(aujourdhui, -1)
  const raccourci = journee?.date === aujourdhui ? "jour" : journee?.date === hier ? "hier" : "autre"

  const colonnes: ColonneTableau<Caisse>[] = [
    {
      cle: "poste",
      libelle: "Point de vente · poste",
      rendu: (c) => <CelluleDouble haut={`${c.pointOfSale.code} · ${c.pointOfSale.name}`} bas={`Ouverte à ${heureDe(c.openedAt)}${c.closedAt ? ` · close à ${heureDe(c.closedAt)}` : ""}`} />,
      tri: (c) => `${c.pointOfSale.code} ${c.openedAt}`,
      export: (c) => `${c.pointOfSale.code} · ${c.pointOfSale.name}`,
    },
    { cle: "vendeur", libelle: "Vendeur", rendu: (c) => c.seller, tri: (c) => c.seller, secondaire: true },
    { cle: "operations", libelle: "Opérations", numerique: true, secondaire: true, rendu: (c) => nombre(c.operations), tri: (c) => c.operations },
    { cle: "attendu", libelle: "Attendu", numerique: true, rendu: (c) => montant(c.expectedXaf), tri: (c) => c.expectedXaf },
    { cle: "constate", libelle: "Constaté", numerique: true, rendu: (c) => montant(c.countedXaf), tri: (c) => c.countedXaf },
    { cle: "ecart", libelle: "Écart", numerique: true, rendu: (c) => <CelluleEcart valeur={c.varianceXaf} />, tri: (c) => c.varianceXaf },
    {
      cle: "etat",
      libelle: "État",
      rendu: (c) => <TagCaisse etat={c.etat} />,
      tri: (c) => ["a_justifier", "a_viser", "recomptage", "ouverte", "juste", "visee"].indexOf(c.etat),
      export: (c) => ETATS_CAISSE[c.etat].libelle,
    },
  ]

  const colonnesJournees: ColonneTableau<Journee>[] = [
    { cle: "date", libelle: "Journée", rendu: (j) => <b className="tabular font-semibold">{jourNumerique(j.date)}</b>, tri: (j) => j.date, export: (j) => j.date },
    { cle: "statut", libelle: "État", rendu: (j) => <TagJournee statut={j.status} />, tri: (j) => j.status, export: (j) => (j.status === "cloturee" ? "Clôturée" : "Ouverte") },
    { cle: "caisses", libelle: "Caisses", numerique: true, rendu: (j) => nombre(j.caisses), tri: (j) => j.caisses },
    {
      cle: "attente",
      libelle: "À traiter",
      numerique: true,
      rendu: (j) =>
        j.ouvertes + j.aViser + j.aJustifier === 0 ? (
          <span className="text-ink-muted">Aucune</span>
        ) : (
          <span className="font-mono tabular-nums">
            {[j.ouvertes ? `${j.ouvertes} ouv.` : null, j.aViser ? `${j.aViser} à viser` : null, j.aJustifier ? `${j.aJustifier} à justifier` : null]
              .filter(Boolean)
              .join(" · ")}
          </span>
        ),
      tri: (j) => j.ouvertes + j.aViser + j.aJustifier,
    },
    { cle: "ecart", libelle: "Écart net", numerique: true, rendu: (j) => <CelluleEcart valeur={j.ecartNet} />, tri: (j) => j.ecartNet },
    { cle: "ttc", libelle: "Recette TTC", numerique: true, rendu: (j) => montant(j.totalTtc), tri: (j) => j.totalTtc },
    {
      cle: "deversement",
      libelle: "Déversement",
      secondaire: true,
      rendu: (j) => (j.status === "cloturee" ? <TagDeversement etat={j.exportStatus} journal={j.exportStatus !== undefined && j.exportStatus !== null} /> : <span className="text-ink-muted">—</span>),
      tri: (j) => j.exportStatus ?? "",
    },
  ]

  const recette = caisses ? montantCompact(caisses.totals.netTtc) : null
  const cloturees = caisses?.caisses.filter((c) => c.etat !== "ouverte").length ?? 0
  const aViser = caisses?.caisses.filter((c) => c.etat === "a_viser" || c.etat === "recomptage") ?? []
  const aJustifier = caisses?.caisses.filter((c) => c.etat === "a_justifier") ?? []
  const ouvertes = caisses?.caisses.filter((c) => c.etat === "ouverte") ?? []

  async function confirmerCloture() {
    if (!journee) return
    const r = await execution.executer(
      "cloture",
      () => cloturer({ accountingDayId: journee._id }),
      (r) => ({
        titre: `Journée du ${jourNumerique(journee.date)} clôturée.`,
        detail: `${nombre(r.sessions)} caisse(s), ${montant(r.totalTtc)} XAF TTC. Les indicateurs et le journal V65 peuvent être produits.`,
      })
    )
    if (r) setClotureOuverte(false)
  }

  return (
    <CadrePilotage lectureSeule={lectureSeule}>
      <EnTetePage
        surtitre={journee ? `Finances · journée du ${jourLong(journee.date)}` : "Finances"}
        titre="Contrôle des recettes"
        description="Chaque caisse clôturée remonte ici : attendu, constaté, écart. Un écart se justifie par le vendeur et se vise par le contrôle des recettes avant le déversement comptable."
        actions={
          journees && journees.length > 0 ? (
            <>
              <SegmentedControl
                label="Journée"
                size="touch"
                options={[
                  { value: "jour", label: "Aujourd’hui" },
                  { value: "hier", label: "Hier" },
                ]}
                value={raccourci === "autre" ? undefined : raccourci}
                onValueChange={(valeur) => {
                  const cible = journees.find((j) => j.date === (valeur === "jour" ? aujourdhui : hier))
                  if (cible) choisir({ journee: cible._id, caisse: undefined })
                  else execution.effacer()
                }}
              />
              <label className="flex min-h-11 items-center gap-2 text-[13px] font-medium">
                <CalendarDays aria-hidden className="size-4 text-ink-muted" />
                <span className="sr-only">Autre journée</span>
                <SelectNative
                  className="h-11 w-44"
                  value={journee?._id ?? ""}
                  onChange={(event) => choisir({ journee: event.target.value, caisse: undefined })}
                >
                  {journees.map((j) => (
                    <option key={j._id} value={j._id}>
                      {jourNumerique(j.date)}/{j.date.slice(0, 4)} · {j.status === "cloturee" ? "clôturée" : "ouverte"}
                    </option>
                  ))}
                </SelectNative>
              </label>
            </>
          ) : null
        }
      />

      {execution.retour}

      {journees === undefined ? (
        <SkeletonLines />
      ) : journees.length === 0 ? (
        <EmptyState
          title="Aucune journée comptable"
          description="La journée du jour s’ouvre à la première caisse ouverte, ou ici."
          action={
            pilotage.voit("journee_comptable") && pilotage.enLigne ? (
              <Button
                type="button"
                variant="secondary"
                loading={execution.enCours === "ouvrir"}
                onClick={() => execution.executer("ouvrir", () => ouvrirJournee({}), () => "Journée du jour ouverte.")}
              >
                Ouvrir la journée du jour
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <Indicateurs colonnes={4}>
            <Indicateur fort icone={Coins} libelle={journee?.date === aujourdhui ? "Recette du jour" : "Recette de la journée"} valeur={recette?.chiffre ?? "—"} unite={recette?.unite} evolution={caisses ? { sens: "neutre", texte: `${nombre(caisses.totals.ventes)} vente(s) · dont ${montant(caisses.totals.horsCaisseTtc)} XAF hors caisse` } : undefined} />
            <Indicateur icone={Lock} libelle="Caisses clôturées" valeur={caisses ? nombre(cloturees) : "—"} unite={caisses ? `/ ${nombre(caisses.caisses.length)}` : undefined} remplissage={caisses && caisses.caisses.length > 0 ? cloturees / caisses.caisses.length : undefined} />
            <Indicateur
              icone={HandCoins}
              libelle="Écarts à viser"
              valeur={caisses ? nombre(aViser.length + aJustifier.length) : "—"}
              evolution={
                caisses
                  ? aViser.length + aJustifier.length > 0
                    ? { sens: "vigilance", texte: `${ecart([...aViser, ...aJustifier].reduce((t, c) => t + (c.varianceXaf ?? 0), 0))} XAF` }
                    : { sens: "neutre", texte: "aucun écart en attente" }
                  : undefined
              }
            />
            <Indicateur icone={RotateCcw} libelle="Remboursements et annulations" valeur={caisses ? nombre(caisses.totals.remboursements) : "—"} evolution={caisses ? { sens: "neutre", texte: `−${montant(caisses.totals.remboursementsTtc)} XAF` } : undefined} />
          </Indicateurs>

          {journee?.status === "ouverte" ? (
            <InlineMessage
              tone={ouvertes.length + aJustifier.length > 0 ? "warning" : "info"}
              title={
                ouvertes.length + aJustifier.length > 0
                  ? `Clôture de la journée bloquée : ${ouvertes.length} caisse(s) ouverte(s), ${aJustifier.length} écart(s) non justifié(s).`
                  : "Toutes les caisses sont clôturées et justifiées : la journée peut être clôturée."
              }
            >
              <span className="flex flex-wrap items-center gap-3">
                <span>La clôture fige la recette, calcule les indicateurs et ouvre le déversement comptable.</span>
                {peutCloturer ? (
                  <Button type="button" variant="secondary" disabled={!caisses} onClick={() => setClotureOuverte(true)}>
                    <Lock />
                    Clôturer la journée
                  </Button>
                ) : null}
              </span>
            </InlineMessage>
          ) : journee ? (
            <InlineMessage tone="success" title={`Journée clôturée${journee.closedAt ? ` le ${horodatage(journee.closedAt)}` : ""}${journee.closedBy ? ` par ${journee.closedBy}` : ""}.`}>
              Les caisses restent consultables ; les écarts se visent jusqu’au déversement comptable.
            </InlineMessage>
          ) : null}

          <ListeEtDossier
            liste={
              <TableauDonnees
                colonnes={colonnes}
                lignes={caisses?.caisses}
                cle={(c) => c._id}
                libelle={`Caisses de la journée du ${journee ? jourNumerique(journee.date) : ""}`}
                surLigne={(c) => choisir({ caisse: c._id === selection.caisse ? undefined : c._id })}
                selection={selection.caisse ?? ""}
                recherche={{ placeholder: "Point de vente, vendeur, matricule", texte: (c) => `${c.pointOfSale.code} ${c.pointOfSale.name} ${c.seller}` }}
                exportNom={`setrag-caisses-${journee?.date ?? ""}`}
                imprimable
                triInitial={{ cle: "etat", sens: "asc" }}
                vide={{ titre: "Aucune caisse ouverte ce jour-là", description: "Les ventes en ligne n’ont pas de caisse : elles comptent dans la recette hors caisse." }}
              />
            }
            dossier={
              caisseChoisie ? (
                <DossierCaisse
                  sessionId={caisseChoisie._id}
                  peutViser={peutViser}
                  surFermeture={() => choisir({ caisse: undefined })}
                />
              ) : (
                <Panneau titre="Dossier de caisse" icone={HandCoins}>
                  <p className="text-small text-ink-muted">
                    Choisissez une caisse dans la liste pour voir son billetage, la justification du vendeur, ses opérations et
                    viser l’écart.
                  </p>
                  {aViser.length > 0 ? (
                    <Button type="button" variant="secondary" onClick={() => choisir({ caisse: aViser[0]!._id })}>
                      Ouvrir la première caisse à viser
                    </Button>
                  ) : null}
                </Panneau>
              )
            }
          />

          <Panneau titre="Historique des journées" icone={History} sousTitre={`${nombre(journees.length)} dernières journées`}>
            <TableauDonnees
              colonnes={colonnesJournees}
              lignes={journees}
              cle={(j) => j._id}
              libelle="Journées comptables"
              surLigne={(j) => choisir({ journee: j._id, caisse: undefined })}
              selection={journee?._id}
              exportNom="setrag-journees-comptables"
              parPage={10}
              vide={{ titre: "Aucune journée" }}
            />
          </Panneau>
        </>
      )}

      <Dialog open={clotureOuverte} onOpenChange={setClotureOuverte}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-h3">Clôturer la journée du {journee ? jourNumerique(journee.date) : ""} ?</DialogTitle>
            <DialogDescription>
              La recette de la journée est figée ; plus aucune caisse ne peut s’y ouvrir. Action tracée au journal d’audit.
            </DialogDescription>
          </DialogHeader>
          {caisses ? (
            <Fiche
              elements={[
                ["Caisses", nombre(caisses.caisses.length)],
                ["Encore ouvertes", nombre(ouvertes.length)],
                ["Écarts non justifiés", nombre(aJustifier.length)],
                ["Écarts à viser", nombre(aViser.length)],
                ["Recette nette TTC", <Chiffre key="r">{montant(caisses.totals.netTtc)} XAF</Chiffre>],
              ]}
            />
          ) : null}
          {ouvertes.length + aJustifier.length > 0 ? (
            <InlineMessage tone="warning" title="Le serveur refusera la clôture tant qu’une caisse est ouverte ou un écart non justifié." />
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setClotureOuverte(false)}>
              <X />
              Annuler
            </Button>
            <Button type="button" variant="secondary" loading={execution.enCours === "cloture"} onClick={confirmerCloture}>
              <Lock />
              Clôturer la journée
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CadrePilotage>
  )
}

/** Dossier d’une caisse : écart, justification, billetage, opérations, visa. */
function DossierCaisse({ sessionId, peutViser, surFermeture }: { sessionId: Caisse["_id"]; peutViser: boolean; surFermeture: () => void }) {
  const dossier = useQuery(api.functions.pilotage.caisse, { sessionId })
  const viser = useMutation(api.functions.pilotage.viserCaisse)
  const recompter = useMutation(api.functions.pilotage.demanderRecomptage)
  const execution = useExecution()
  const [commentaire, setCommentaire] = useState("")
  const [recomptage, setRecomptage] = useState(false)

  if (dossier === undefined) {
    return (
      <Panneau titre="Dossier de caisse" icone={HandCoins}>
        <SkeletonLines />
      </Panneau>
    )
  }
  if (dossier === null) {
    return (
      <Panneau titre="Dossier de caisse" icone={HandCoins}>
        <EmptyState title="Caisse introuvable" description="Elle a peut-être été supprimée d’un environnement de test." />
      </Panneau>
    )
  }
  const { session } = dossier
  const encaisse = dossier.operations.filter((o) => o.kind === "vente").reduce((t, o) => t + o.received, 0)
  const rembourse = dossier.operations.filter((o) => o.kind !== "vente").reduce((t, o) => t + o.received, 0)
  const visable = session.status === "cloturee" && (session.varianceXaf === 0 || Boolean(session.varianceReason))

  return (
    <>
      <Panneau
        titre={`${dossier.pointOfSale.code} · ${dossier.seller}`}
        icone={HandCoins}
        sousTitre={session.closedAt ? `clôturée à ${heureDe(session.closedAt)}` : `ouverte à ${heureDe(session.openedAt)}`}
        actions={
          <Button type="button" variant="ghost" size="icon" aria-label="Fermer le dossier" onClick={surFermeture}>
            <X />
          </Button>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <TagCaisse etat={session.etat} />
          {dossier.day ? <span className="text-[13px] text-ink-muted">Journée du {jourNumerique(dossier.day.date)}</span> : null}
        </div>
        {session.varianceXaf !== null ? (
          <BandeauEcart valeur={session.varianceXaf} sousTitre={<span className="text-[13px]">Tous moyens de paiement</span>} />
        ) : (
          <InlineMessage tone="info" title="Caisse encore ouverte : le constaté et l’écart viendront à la clôture." />
        )}
        {session.varianceReason ? (
          <div className="grid gap-1">
            <span className="text-[13px] font-medium">Justification du vendeur</span>
            <p className="text-small rounded-md bg-surface-sunk px-3 py-2 text-ink">« {session.varianceReason} »</p>
          </div>
        ) : session.varianceXaf ? (
          <InlineMessage tone="danger" title="Écart non justifié : le vendeur doit l’expliquer avant tout visa." />
        ) : null}
        {session.recountRequestedAt ? (
          <InlineMessage tone="info" title={`Recomptage demandé le ${horodatage(session.recountRequestedAt)}${session.recountRequestedBy ? ` par ${session.recountRequestedBy}` : ""}.`}>
            {session.recountReason}
          </InlineMessage>
        ) : null}
        <Fiche
          elements={[
            ["Fond d’ouverture", <Chiffre key="f">{montant(session.openingFloatXaf)}</Chiffre>],
            ["Encaissé", <Chiffre key="e">{montant(encaisse)}</Chiffre>],
            ["Remboursé", <Chiffre key="r">{ecart(rembourse)}</Chiffre>],
            ["Attendu", <Chiffre key="a">{montant(session.expectedXaf)}</Chiffre>],
            ["Constaté (remis)", <Chiffre key="c">{montant(session.countedXaf)}</Chiffre>],
            session.validatedAt ? ["Visée", `${horodatage(session.validatedAt)} · ${session.validatedBy ?? ""}`] : null,
            session.visaComment ? ["Commentaire du visa", session.visaComment] : null,
          ]}
        />

        {execution.retour}

        {session.status === "cloturee" && peutViser ? (
          <>
            <Field label="Commentaire du visa (facultatif)" hint="Repris au journal d’audit.">
              <Textarea rows={2} maxLength={500} value={commentaire} onChange={(event) => setCommentaire(event.target.value)} />
            </Field>
            <Button
              type="button"
              block
              disabled={!visable}
              loading={execution.enCours === "viser"}
              loadingLabel="Visa…"
              onClick={() =>
                execution.executer(
                  "viser",
                  () => viser({ sessionId, commentaire: commentaire.trim() || undefined }),
                  () => {
                    setCommentaire("")
                    return session.varianceXaf ? "Écart visé : la caisse part au déversement comptable." : "Caisse visée."
                  }
                )
              }
            >
              <BadgeCheck />
              {session.varianceXaf ? "Viser l’écart" : "Viser la caisse"}
            </Button>
            <Button type="button" variant="ghost" block onClick={() => setRecomptage(true)}>
              <RotateCcw />
              Demander un recomptage
            </Button>
          </>
        ) : null}
      </Panneau>

      <Panneau titre="Billetage" icone={Coins} plein>
        <table className="w-full text-[13.5px]">
          <caption className="sr-only">Billetage par moyen de paiement</caption>
          <thead>
            <tr className="bg-surface-sunk text-left text-[11.5px] tracking-[0.05em] text-ink-muted uppercase">
              <th scope="col" className="px-3.5 py-2">Moyen</th>
              <th scope="col" className="px-3.5 py-2 text-right">Attendu</th>
              <th scope="col" className="px-3.5 py-2 text-right">Constaté</th>
              <th scope="col" className="px-3.5 py-2 text-right">Écart</th>
            </tr>
          </thead>
          <tbody>
            {dossier.billetage.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3.5 py-3 text-ink-muted">
                  Aucun encaissement enregistré.
                </td>
              </tr>
            ) : (
              dossier.billetage.map((b) => (
                <tr key={b.method} className="border-t border-line">
                  <td className="px-3.5 py-2">{LIBELLE_MOYEN[b.method] ?? b.method}</td>
                  <td className="px-3.5 py-2 text-right font-mono tabular-nums">{montant(b.expectedXaf)}</td>
                  <td className="px-3.5 py-2 text-right font-mono tabular-nums">{montant(b.countedXaf)}</td>
                  <td className="px-3.5 py-2 text-right">
                    <CelluleEcart valeur={b.varianceXaf} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Panneau>

      <Panneau titre="Opérations" icone={Receipt} sousTitre={`${nombre(dossier.operations.length)} opération(s)`}>
        <TableauDonnees
          colonnes={[
            { cle: "n", libelle: "N°", rendu: (o) => <CelluleDouble mono haut={o.number} bas={`${heureDe(o.soldAt)} · ${LIBELLE_PRODUIT[o.product] ?? o.product}`} />, tri: (o) => o.soldAt, export: (o) => o.number },
            { cle: "op", libelle: "Opération", rendu: (o) => LIBELLE_OPERATION[o.kind] ?? o.kind, tri: (o) => o.kind, secondaire: true },
            { cle: "moyen", libelle: "Moyen", rendu: (o) => LIBELLE_MOYEN[o.method] ?? o.method, tri: (o) => o.method, secondaire: true },
            { cle: "montant", libelle: "Encaissé", numerique: true, rendu: (o) => ecart(o.received).replace(/^\+/, ""), tri: (o) => o.received },
          ]}
          lignes={dossier.operations}
          cle={(o) => o._id}
          libelle="Opérations de la caisse"
          exportNom={`setrag-caisse-${dossier.pointOfSale.code}-${dossier.day?.date ?? ""}`}
          parPage={8}
          triInitial={{ cle: "n", sens: "desc" }}
          vide={{ titre: "Aucune opération", description: "La caisse a été ouverte puis close sans vente." }}
        />
      </Panneau>

      <Panneau titre="Journal de la caisse" icone={History}>
        <Chronologie
          evenements={dossier.journal.map((e) => ({
            cle: e._id,
            heure: heureDe(e.at),
            titre: e.action,
            detail: [e.actor, e.reason].filter(Boolean).join(" · "),
          }))}
        />
      </Panneau>

      <DialogueMotif
        ouvert={recomptage}
        surFermeture={() => setRecomptage(false)}
        titre="Demander un recomptage"
        description={`Le vendeur (${dossier.seller}) est prévenu ; la caisse reste clôturée et le visa reste possible après recomptage.`}
        libelleMotif="Motif de la demande"
        libelleAction="Envoyer la demande"
        enCours={execution.enCours === "recomptage"}
        surConfirmation={async (motif) => {
          const r = await execution.executer("recomptage", () => recompter({ sessionId, motif }), () => "Demande de recomptage envoyée au vendeur.")
          if (r) setRecomptage(false)
        }}
      />
    </>
  )
}
