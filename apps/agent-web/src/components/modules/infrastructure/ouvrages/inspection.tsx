"use client"

import { CheckCheck, ClipboardCheck, FileWarning, Lightbulb, PencilLine, Printer, ShieldAlert } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { Button } from "@workspace/ui/components/button"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { Logo } from "@workspace/ui/marque"

import { Fiche, LienBouton, Panneau, TableauDonnees, type ColonneTableau } from "@/components/charte"
import { RetourOperation, useOperation } from "@/components/gestion/referentiels/elements"
import { dateCourte } from "@/components/gestion/referentiels/format"
import { FenetreFormulaire } from "@/components/gestion/referentiels/formulaire"

import { CadreInfra, DossierEnChargement, DossierIntrouvable, TagCotation, TagEtat, infraApi, pk, useDroitsInfra, type DossierInspection } from "../commun"
import { PanneauChronologie, dateEtHeure, useAgentConnecte } from "../interventions/partage"
import { FenetreInspection } from "./formulaires"

type Desordre = DossierInspection["inspection"]["desordres"][number]
type IdInspection = DossierInspection["inspection"]["id"]

const RETOUR_LISTE = { href: "/infrastructures/ouvrages", libelle: "Ouvrages d'art" }

const colonnesDesordres: ColonneTableau<Desordre & { rang: number }>[] = [
  { cle: "rang", libelle: "N°", rendu: (d) => <span className="tabular">{d.rang}</span>, tri: (d) => d.rang, numerique: true },
  { cle: "partie", libelle: "Partie d'ouvrage", rendu: (d) => <span className="font-semibold">{d.partie}</span>, tri: (d) => d.partie },
  { cle: "description", libelle: "Description", rendu: (d) => d.description, tri: (d) => d.description },
  { cle: "gravite", libelle: "Gravité", rendu: (d) => <TagEtat valeur={d.gravite} libelle={d.graviteLibelle} />, tri: (d) => ["faible", "moyenne", "elevee", "critique"].indexOf(d.gravite), export: (d) => d.graviteLibelle },
]

function Cotations({ inspection }: { inspection: DossierInspection["inspection"] }) {
  const change = inspection.cotationAvant !== inspection.cotationProposee
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <TagCotation cotation={inspection.cotationAvant} />
        <span aria-hidden>→</span>
        <TagCotation cotation={inspection.cotationProposee} />
        <span className="text-small text-ink-muted">{change ? "Changement de cotation proposé" : "Cotation confirmée"}</span>
      </div>
      <Fiche
        elements={[
          ["Avant l'inspection", inspection.cotationAvantLibelle],
          ["Proposée", inspection.cotationProposeeLibelle],
          ["Surveillance proposée", inspection.surveillanceRenforceeProposee ? "Renforcée" : "Courante"],
          ["Prochaine inspection", <span key="p" className="tabular">sous {inspection.periodiciteProposeeMois} mois</span>],
        ]}
      />
    </div>
  )
}

/** Rapport d'inspection : brouillon modifiable par son inspecteur, validé par un autre agent. */
export function InspectionRapport({ inspectionId }: { inspectionId: string }) {
  const droits = useDroitsInfra()
  const moi = useAgentConnecte()
  const dossier = useQuery(infraApi.queries.inspection, { inspectionId: inspectionId as IdInspection })
  const valider = useMutation(infraApi.mutations.validerInspection)
  const operation = useOperation()
  const [mode, setMode] = useState<"modifier" | "valider" | null>(null)
  const [cleFenetre, setCleFenetre] = useState(0)

  if (dossier === undefined) {
    return (
      <CadreInfra titre="Rapport d'inspection" retour={RETOUR_LISTE}>
        <DossierEnChargement />
      </CadreInfra>
    )
  }
  if (dossier === null) {
    return (
      <CadreInfra titre="Inspection introuvable" retour={RETOUR_LISTE}>
        <DossierIntrouvable quoi="Inspection" retour={RETOUR_LISTE} />
      </CadreInfra>
    )
  }

  const { inspection, ouvrage } = dossier
  const retour = ouvrage ? { href: `/infrastructures/ouvrages/${ouvrage.id}`, libelle: `${ouvrage.code} · ${ouvrage.nom}` } : RETOUR_LISTE
  const brouillon = inspection.statut === "brouillon"
  const auteur = Boolean(moi && inspection.inspecteurId === moi)
  const peutModifier = brouillon && droits.peut("ouvrage_inspecter") && (!inspection.inspecteurId || auteur || !moi)
  const peutValider = brouillon && droits.peut("inspection_valider")
  const ouvrir = (m: "modifier" | "valider") => {
    setCleFenetre((c) => c + 1)
    operation.effacer()
    setMode(m)
  }

  return (
    <CadreInfra
      titre={`Inspection ${inspection.numero}`}
      description={`${inspection.typeLibelle} du ${dateCourte(inspection.dateInspection)}${ouvrage ? `, ${ouvrage.code} · ${ouvrage.nom} (${pk(ouvrage.pk)})` : ""}.`}
      retour={retour}
      actions={
        <>
          {peutModifier ? (
            <Button type="button" variant="secondary" onClick={() => ouvrir("modifier")}>
              <PencilLine />
              Modifier
            </Button>
          ) : null}
          {peutValider ? (
            <Button type="button" onClick={() => ouvrir("valider")}>
              <CheckCheck />
              Valider l&apos;inspection
            </Button>
          ) : null}
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <TagEtat valeur={inspection.statut} libelle={inspection.statutLibelle} />
        <TagCotation cotation={inspection.cotationProposee} libelle="proposée" />
        <span className="ml-auto">
          <LienBouton href={`/infrastructures/ouvrages/inspections/${inspection.id}/impression`} variante="ghost">
            <Printer />
            Imprimer le rapport
          </LienBouton>
        </span>
      </div>
      <RetourOperation retour={operation.retour} />
      {brouillon && peutValider && auteur ? (
        <InlineMessage tone="info" title="Vous êtes l'inspecteur de ce rapport.">
          La validation revient à un autre agent habilité : le serveur refusera la vôtre.
        </InlineMessage>
      ) : null}
      {brouillon && !peutValider ? (
        <InlineMessage tone="info" title="Inspection en brouillon">
          La cotation de l&apos;ouvrage ne change qu&apos;à la validation du rapport par un agent habilité, autre que l&apos;inspecteur.
        </InlineMessage>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
        <div className="grid content-start gap-5">
          <Panneau titre="En-tête du rapport" icone={ClipboardCheck}>
            <Fiche
              elements={[
                ["Numéro", <span key="n" className="tabular">{inspection.numero}</span>],
                ["Ouvrage", ouvrage ? `${ouvrage.code} · ${ouvrage.nom}` : "Ouvrage supprimé"],
                ["Type", inspection.typeLibelle],
                ["Date de l'inspection", <span key="d" className="tabular">{dateCourte(inspection.dateInspection)}</span>],
                ["Inspecteur", inspection.inspecteurNom],
                ["Rédigée le", <span key="r" className="tabular">{dateEtHeure(inspection.creeLe)}</span>],
                ["Statut", inspection.statutLibelle],
                ["Validée par", inspection.valideParNom ? `${inspection.valideParNom} · ${dateEtHeure(inspection.valideLe)}` : "En attente de validation"],
              ]}
            />
          </Panneau>
          <Panneau titre="Constats" icone={FileWarning}>
            <p className="text-[14.5px] whitespace-pre-line">{inspection.constats}</p>
          </Panneau>
          <Panneau titre="Désordres relevés" icone={ShieldAlert} sousTitre={`${inspection.desordres.length} désordre${inspection.desordres.length > 1 ? "s" : ""}`}>
            <TableauDonnees
              libelle={`Désordres de l'inspection ${inspection.numero}`}
              colonnes={colonnesDesordres}
              lignes={inspection.desordres.map((d, index) => ({ ...d, rang: index + 1 }))}
              cle={(d) => String(d.rang)}
              exportNom={`desordres-${inspection.numero}`}
              vide={{ titre: "Aucun désordre relevé", description: "L'inspecteur n'a noté aucun désordre sur l'ouvrage." }}
            />
          </Panneau>
        </div>
        <div className="grid content-start gap-5">
          <Panneau titre="Cotation IQOA" icone={ShieldAlert}>
            <Cotations inspection={inspection} />
          </Panneau>
          <Panneau titre="Recommandations" icone={Lightbulb}>
            <p className="text-[14.5px] whitespace-pre-line">{inspection.recommandations ?? "Aucune recommandation."}</p>
          </Panneau>
          <PanneauChronologie evenements={dossier.chronologie} />
        </div>
      </div>

      {peutModifier && ouvrage ? (
        <FenetreInspection
          key={`m-${cleFenetre}`}
          open={mode === "modifier"}
          onOpenChange={(o) => !o && setMode(null)}
          operation={operation}
          ouvrage={{ id: ouvrage.id, code: ouvrage.code, nom: ouvrage.nom, cotation: inspection.cotationAvant }}
          inspection={inspection}
        />
      ) : null}
      {peutValider ? (
        <FenetreFormulaire
          open={mode === "valider"}
          onOpenChange={(o) => !o && setMode(null)}
          titre={`Valider l'inspection ${inspection.numero}`}
          description="La validation est définitive. Elle applique la cotation proposée à l'ouvrage et recalcule le calendrier des inspections."
          libelleValider={
            <>
              <CheckCheck />
              Valider l&apos;inspection
            </>
          }
          enCours={operation.enCours === "valider"}
          erreur={operation.retour?.ton === "danger" ? (operation.retour.detail ?? null) : null}
          onSubmit={async () => {
            const resultat = await operation.executer(
              "valider",
              () => valider({ inspectionId: inspection.id }),
              (r) => `Inspection validée : l'ouvrage est coté ${r.cotation}, prochaine inspection le ${dateCourte(r.prochaineInspectionLe)}.`
            )
            if (resultat) setMode(null)
          }}
        >
          <Cotations inspection={inspection} />
        </FenetreFormulaire>
      ) : null}
    </CadreInfra>
  )
}

/* ============================================================ Impression */

/**
 * Rapport d'inspection à imprimer (ou enregistrer en PDF) : une page sans
 * coquille, datée, avec la provenance des données.
 */
export function InspectionImprimable({ inspectionId }: { inspectionId: string }) {
  const dossier = useQuery(infraApi.queries.inspection, { inspectionId: inspectionId as IdInspection })
  const [imprimeLe] = useState(() => Date.now())
  const lance = useRef(false)

  useEffect(() => {
    if (!dossier || lance.current) return
    lance.current = true
    const minuterie = window.setTimeout(() => window.print(), 400)
    return () => window.clearTimeout(minuterie)
  }, [dossier])

  if (dossier === undefined) {
    return (
      <main className="mx-auto max-w-[900px] p-6">
        <p role="status" className="text-small text-ink-muted">
          Préparation du rapport…
        </p>
      </main>
    )
  }
  if (dossier === null) {
    return (
      <main className="mx-auto grid max-w-[900px] gap-4 p-6">
        <InlineMessage tone="danger" title="Inspection introuvable">
          Le lien est peut-être ancien.
        </InlineMessage>
        <LienBouton href="/infrastructures/ouvrages">Retour aux ouvrages</LienBouton>
      </main>
    )
  }
  const { inspection, ouvrage } = dossier
  return (
    <main className="mx-auto grid max-w-[900px] gap-4 bg-surface p-6 text-ink print:max-w-none print:p-0">
      <header className="flex flex-wrap items-start gap-4 border-b border-line-strong pb-3">
        <Logo variante="compact" title="SETRAG" className="h-8" />
        <div className="grid flex-1 gap-0.5">
          <h1 className="text-[20px] font-bold">Rapport d&apos;inspection {inspection.numero}</h1>
          <p className="text-[13px] text-ink-muted">
            {inspection.typeLibelle} · {ouvrage ? `${ouvrage.code} · ${ouvrage.nom} · ${pk(ouvrage.pk)}` : "ouvrage supprimé"}
          </p>
        </div>
        <div className="text-right text-[12px] text-ink-muted">
          <p>
            Imprimé le <span className="tabular">{dateEtHeure(imprimeLe)}</span>
          </p>
          <p>Statut : {inspection.statutLibelle}</p>
        </div>
        <div className="flex gap-2 print:hidden">
          <LienBouton href={`/infrastructures/ouvrages/inspections/${inspection.id}`} variante="ghost" taille="sm">
            Retour au rapport
          </LienBouton>
          <Button type="button" variant="secondary" size="sm" onClick={() => window.print()}>
            <Printer />
            Imprimer
          </Button>
        </div>
      </header>
      <section className="grid gap-1 text-[13px]">
        <h2 className="text-[15px] font-bold">Identification</h2>
        <Fiche
          className="max-w-[560px]"
          elements={[
            ["Ouvrage", ouvrage ? `${ouvrage.code} · ${ouvrage.nom}` : "—"],
            ["Type d'ouvrage", ouvrage?.typeLibelle ?? "—"],
            ["Point kilométrique", <span key="p" className="tabular">{pk(ouvrage?.pk)}</span>],
            ["Section", ouvrage?.sectionLibelle ?? "—"],
            ["Date de l'inspection", <span key="d" className="tabular">{dateCourte(inspection.dateInspection)}</span>],
            ["Inspecteur", inspection.inspecteurNom],
            ["Valideur", inspection.valideParNom ? `${inspection.valideParNom} · ${dateEtHeure(inspection.valideLe)}` : "Non validée (brouillon)"],
          ]}
        />
      </section>
      <section className="grid gap-1">
        <h2 className="text-[15px] font-bold">Constats</h2>
        <p className="text-[13px] whitespace-pre-line">{inspection.constats}</p>
      </section>
      <section className="grid gap-1">
        <h2 className="text-[15px] font-bold">Désordres relevés</h2>
        {inspection.desordres.length === 0 ? (
          <p className="text-[13px]">Aucun désordre relevé.</p>
        ) : (
          <table className="w-full border-collapse text-[12px]">
            <caption className="sr-only">Désordres relevés</caption>
            <thead>
              <tr className="border-b border-line-strong text-left">
                <th scope="col" className="py-1 pr-2">N°</th>
                <th scope="col" className="py-1 pr-2">Partie d&apos;ouvrage</th>
                <th scope="col" className="py-1 pr-2">Description</th>
                <th scope="col" className="py-1">Gravité</th>
              </tr>
            </thead>
            <tbody>
              {inspection.desordres.map((d, index) => (
                <tr key={index} className="break-inside-avoid border-b border-line">
                  <td className="tabular py-1 pr-2">{index + 1}</td>
                  <td className="py-1 pr-2 font-semibold">{d.partie}</td>
                  <td className="py-1 pr-2">{d.description}</td>
                  <td className="py-1">{d.graviteLibelle}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <section className="grid gap-1 text-[13px]">
        <h2 className="text-[15px] font-bold">Cotation IQOA</h2>
        <p>
          Avant : <b>{inspection.cotationAvantLibelle}</b>
        </p>
        <p>
          Proposée : <b>{inspection.cotationProposeeLibelle}</b> — surveillance {inspection.surveillanceRenforceeProposee ? "renforcée" : "courante"}, prochaine inspection sous{" "}
          <span className="tabular">{inspection.periodiciteProposeeMois}</span> mois.
        </p>
      </section>
      <section className="grid gap-1">
        <h2 className="text-[15px] font-bold">Recommandations</h2>
        <p className="text-[13px] whitespace-pre-line">{inspection.recommandations ?? "Aucune recommandation."}</p>
      </section>
      <footer className="border-t border-line pt-2 text-[11px] text-ink-muted">
        Données issues du registre des infrastructures SETRAG (module Infrastructures ferroviaires et travaux PRN), état au{" "}
        <span className="tabular">{dateEtHeure(imprimeLe)}</span>.{" "}
        {inspection.statut === "validee" ? "Rapport validé : la cotation proposée s'applique à l'ouvrage." : "Brouillon non validé : la cotation proposée ne s'applique pas encore."}
      </footer>
    </main>
  )
}
