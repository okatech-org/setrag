"use client"

import type { FunctionReturnType } from "convex/server"
import { Printer } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { Logo } from "@workspace/ui/marque"

import { Chronologie, Fiche, LienBouton, Panneau } from "@/components/charte"
import { messageErreur } from "@/components/gestion/referentiels/format"

import { CadreRh, useAccesRh } from "./cadre-rh"
import { AccesRestreint, Chargement, Introuvable, LienDossier, Montant, TableSimple, chronologie, dateIso, xaf, type Id } from "./commun"
import { CATEGORIES, CONTRATS, MODES_PAIEMENT, SITUATIONS } from "./libelles"

type DossierBulletinDto = NonNullable<FunctionReturnType<typeof api.modules.rh.paie.bulletin>>
type Ligne = DossierBulletinDto["bulletin"]["lignes"][number]

const RETOUR = { href: "/rh/paie", libelle: "Paie et déclarations" }

const quantite = (l: Ligne) => (l.quantite !== undefined ? String(l.quantite).replace(".", ",") : "")
const base = (l: Ligne) => (l.base !== undefined ? xaf(l.base) : "")
const taux = (l: Ligne) => (l.taux !== undefined ? `${String(l.taux).replace(".", ",")} %` : "")

/** Corps du bulletin, commun à l'écran et à l'impression. */
function CorpsBulletin({ dossier }: { dossier: DossierBulletinDto }) {
  const { bulletin } = dossier
  const t = bulletin.totaux
  const gains = bulletin.lignes.filter((l) => l.sens === "gain" || l.sens === "gain_non_soumis")
  const retenues = bulletin.lignes.filter((l) => l.sens === "retenue")
  const patronales = bulletin.lignes.filter((l) => l.sens === "patronal")
  const colonnes = [{ libelle: "Rubrique" }, { libelle: "Quantité", numerique: true }, { libelle: "Base", numerique: true }, { libelle: "Taux", numerique: true }, { libelle: "Montant", numerique: true }]
  const ligne = (l: Ligne) => [`${l.code} · ${l.libelle}`, quantite(l), base(l), taux(l), <Montant key="m" valeur={l.montant} />]
  return (
    <div className="grid gap-4">
      <TableSimple libelle="Gains" colonnes={colonnes} lignes={gains.map(ligne)} pied={["Salaire brut", "", "", "", <Montant key="b" valeur={t.brut} />]} />
      <TableSimple libelle="Retenues salariales" colonnes={colonnes} lignes={retenues.map(ligne)} pied={["Total des retenues", "", "", "", <Montant key="r" valeur={t.totalRetenues} />]} />
      <div className="flex flex-wrap items-baseline justify-between gap-3 rounded-md border-2 border-line-strong bg-surface px-4 py-3">
        <span className="text-[15px] font-bold">Net à payer</span>
        <span className="tabular text-[24px] font-bold">{xaf(t.net)}</span>
      </div>
      <TableSimple
        libelle="Charges patronales"
        colonnes={colonnes}
        lignes={patronales.map(ligne)}
        pied={["Total des charges patronales", "", "", "", <Montant key="p" valeur={t.chargesPatronales} />]}
      />
      <Fiche
        elements={[
          ["Brut soumis à cotisations", <Montant key="s" valeur={t.brutSoumis} />],
          ["Revenu imposable (après cotisations)", <Montant key="i" valeur={t.revenuImposable} />],
          ["Parts du quotient familial", String(t.parts).replace(".", ",")],
          ["Coût employeur", <Montant key="c" valeur={t.coutEmployeur} />],
        ]}
      />
    </div>
  )
}

function Entete({ dossier }: { dossier: DossierBulletinDto }) {
  const { bulletin, periode, employeur } = dossier
  const a = bulletin.agent
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Fiche
        elements={[
          ["Employeur", employeur.raisonSociale],
          ["Adresse", employeur.adresse],
          ["N° employeur CNSS", employeur.numeroEmployeurCnss],
          ["Période", periode ? `${periode.libelle} (du ${dateIso(periode.debut)} au ${dateIso(periode.fin)})` : "—"],
          ["Bulletin", <span key="n" className="tabular">{bulletin.numero}</span>],
          ["Paramètres", bulletin.parametres],
        ]}
      />
      <Fiche
        elements={[
          ["Salarié", `${a.nomComplet} · ${a.matricule}`],
          ["Poste", `${a.poste} · ${a.gareNom}`],
          ["Classification", `${CATEGORIES[a.categorie]} · échelon ${a.echelon} · ${CONTRATS[a.contrat]}`],
          ["Embauche · ancienneté", `${dateIso(a.dateEmbauche)} · ${bulletin.ancienneteAnnees} an(s)`],
          ["Situation", `${SITUATIONS[a.situationFamiliale]} · ${a.enfantsACharge} enfant(s)`],
          ["CNSS · CNAMGS", `${a.numeroCnss ?? "—"} · ${a.numeroCnamgs ?? "—"}`],
          ["Jours payés", `${bulletin.joursPayes}${bulletin.joursAbsenceNonPayee > 0 ? ` (${bulletin.joursAbsenceNonPayee} j d'absence non payée)` : ""}`],
          ["Paiement", `${MODES_PAIEMENT[a.modePaiement]}${a.comptePaiement ? ` · ${a.comptePaiement}` : ""}`],
        ]}
      />
    </div>
  )
}

export function DossierBulletin({ bulletinId }: { bulletinId: string }) {
  const { peut, acces } = useAccesRh()
  const dossier = useQuery(api.modules.rh.paie.bulletin, peut("paie.lire") ? { bulletinId: bulletinId as Id<"rhBulletins"> } : "skip")
  if (acces && !peut("paie.lire")) {
    return (
      <CadreRh titre="Bulletin de paie" retour={RETOUR}>
        <AccesRestreint>Les bulletins individuels ne sont consultables que par le service paie.</AccesRestreint>
      </CadreRh>
    )
  }
  if (dossier === undefined) {
    return (
      <CadreRh titre="Bulletin de paie" retour={RETOUR}>
        <Chargement />
      </CadreRh>
    )
  }
  if (dossier === null) {
    return (
      <CadreRh titre="Bulletin introuvable" retour={RETOUR}>
        <Introuvable titre="Ce bulletin n'existe pas" retour={RETOUR} />
      </CadreRh>
    )
  }
  const { bulletin, periode } = dossier
  return (
    <CadreRh
      titre={`Bulletin de ${bulletin.agent.nomComplet}`}
      description={`${bulletin.numero} · ${periode?.libelle ?? ""} · ${bulletin.statut === "valide" ? "validé" : "calculé, non validé"}`}
      retour={periode ? { href: `/rh/paie/${periode._id}`, libelle: `Paie de ${periode.libelle.toLowerCase()}` } : RETOUR}
      actions={
        <LienBouton href={`/rh/paie/bulletins/${bulletin._id}/imprimer`} variante="primary">
          <Printer />
          Imprimer le bulletin
        </LienBouton>
      }
    >
      {bulletin.statut !== "valide" ? (
        <InlineMessage tone="warning" title="Bulletin provisoire">
          La paie de la période n&apos;est pas encore validée : ce bulletin peut changer.
        </InlineMessage>
      ) : null}
      <Panneau titre="En-tête">
        <Entete dossier={dossier} />
        <p className="text-small">
          Dossier de l&apos;agent : <LienDossier href={`/rh/agents/${bulletin.agentId}`}>{bulletin.agent.nomComplet}</LienDossier>
        </p>
      </Panneau>
      <Panneau titre="Rubriques de paie">
        <CorpsBulletin dossier={dossier} />
      </Panneau>
      <Panneau titre="Historique du bulletin" sousTitre="Impressions tracées">
        <Chronologie evenements={chronologie(dossier.chronologie)} vide="Ce bulletin n'a pas encore été imprimé." />
      </Panneau>
    </CadreRh>
  )
}

/**
 * Bulletin à imprimer (ou enregistrer en PDF) : une page sans coquille.
 * L'impression d'un document nominatif est inscrite au journal.
 */
export function BulletinImprimable({ bulletinId }: { bulletinId: string }) {
  const { peut, acces } = useAccesRh()
  const dossier = useQuery(api.modules.rh.paie.bulletin, peut("paie.lire") ? { bulletinId: bulletinId as Id<"rhBulletins"> } : "skip")
  const tracer = useMutation(api.modules.rh.paie.tracerDocument)
  const [erreur, setErreur] = useState<string | null>(null)
  const lance = useRef(false)

  useEffect(() => {
    if (!dossier || lance.current) return
    lance.current = true
    void tracer({ objet: "bulletin", bulletinId: dossier.bulletin._id, format: "impression" })
      .then(() => window.setTimeout(() => window.print(), 400))
      .catch((cause) => setErreur(messageErreur(cause, "Impression refusée.")))
  }, [dossier, tracer])

  if (acces && !peut("paie.lire")) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <AccesRestreint>Les bulletins individuels ne sont consultables que par le service paie.</AccesRestreint>
      </main>
    )
  }
  return (
    <main className="mx-auto grid max-w-[900px] gap-4 bg-surface p-6 text-ink print:max-w-none print:p-0">
      <header className="flex flex-wrap items-center gap-4 border-b border-line-strong pb-3">
        <Logo variante="compact" title="SETRAG" className="h-10" />
        <div className="grid flex-1">
          <h1 className="text-[22px] font-bold">Bulletin de paie</h1>
          <span className="text-small text-ink-muted">{dossier?.periode?.libelle ?? ""}</span>
        </div>
        <Button type="button" variant="secondary" size="sm" className="print:hidden" onClick={() => window.print()} disabled={!dossier}>
          <Printer />
          Imprimer
        </Button>
      </header>
      {erreur ? <InlineMessage tone="danger" title="Impression refusée">{erreur}</InlineMessage> : null}
      {dossier === undefined ? <Chargement /> : dossier === null ? <p>Bulletin introuvable.</p> : (
        <>
          <Entete dossier={dossier} />
          <CorpsBulletin dossier={dossier} />
          <footer className="grid gap-1 border-t border-line pt-3 text-[12px] text-ink-muted">
            <p>Pour vous aider à faire valoir vos droits, conservez ce bulletin sans limitation de durée.</p>
            <p>
              Cotisations CNSS plafonnées à 1 500 000 XAF par mois, CNAMGS à 2 500 000 XAF ; IRPP au barème progressif avec quotient familial ; TCS 5 %.
            </p>
          </footer>
        </>
      )}
    </main>
  )
}
