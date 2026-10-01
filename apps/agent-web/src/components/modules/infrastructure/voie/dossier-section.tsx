"use client"

import { ClipboardCheck, History, Spline } from "lucide-react"
import { useState } from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { Button } from "@workspace/ui/components/button"
import { Field, Input, SelectNative, Textarea } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import { CelluleDouble, Chronologie, Fiche, Panneau, TableauDonnees, type ColonneTableau } from "@/components/charte"
import { Onglets, RetourOperation, useOperation } from "@/components/gestion/referentiels/elements"
import { aujourdhuiService, champDate, dateCourte, dateHeure, debutJour } from "@/components/gestion/referentiels/format"
import { FenetreFormulaire, nombreSaisi, texte } from "@/components/gestion/referentiels/formulaire"

import {
  CadreInfra,
  DossierEnChargement,
  DossierIntrouvable,
  infraApi,
  kmh,
  pct,
  pk,
  plagePk,
  TagCotation,
  TagEtat,
  TagRetard,
  useDroitsInfra,
  xafCompact,
  type DossierSection,
} from "../commun"
import { SchemaVoie, type ZoneVoie } from "../schema-voie"
import { chronologieInfra, ETATS_VOIE, useLigne, zonesLtv, type EtatVoie } from "../accueil/partage"
import { colonnesAnomalies } from "../anomalies/registre-anomalies"
import { colonnesLtv } from "../ltv/liste-ltv"

const RETOUR = { href: "/infrastructures/voie", libelle: "Voie et sections" }
const fmtKm = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 })

type Ouvrage = DossierSection["ouvrages"][number]
type Equipement = DossierSection["equipements"][number]
type Intervention = DossierSection["interventions"][number]
type Chantier = DossierSection["chantiers"][number]

const colonnesOuvrages: ColonneTableau<Ouvrage>[] = [
  { cle: "code", libelle: "Code", rendu: (o) => <span className="tabular font-semibold">{o.code}</span>, tri: (o) => o.code },
  { cle: "nom", libelle: "Ouvrage", rendu: (o) => <CelluleDouble haut={o.nom} bas={`${o.typeLibelle} · ${o.materiau}`} />, tri: (o) => o.nom },
  { cle: "pk", libelle: "PK", rendu: (o) => <span className="tabular">{pk(o.pk)}</span>, tri: (o) => o.pk, numerique: true },
  { cle: "cotation", libelle: "Cotation", rendu: (o) => <TagCotation cotation={o.cotation} />, tri: (o) => o.cotation, export: (o) => o.cotationLibelle },
  {
    cle: "inspection",
    libelle: "Prochaine inspection",
    rendu: (o) => (
      <span className="grid justify-items-start gap-1">
        <span className="tabular">{dateCourte(o.prochaineInspectionLe)}</span>
        {o.inspectionEnRetard ? <TagRetard /> : null}
      </span>
    ),
    tri: (o) => o.prochaineInspectionLe,
    export: (o) => `${dateCourte(o.prochaineInspectionLe)}${o.inspectionEnRetard ? " (en retard)" : ""}`,
  },
  { cle: "anomalies", libelle: "Anomalies ouvertes", rendu: (o) => <span className="tabular">{o.anomaliesOuvertes}</span>, tri: (o) => o.anomaliesOuvertes, numerique: true, secondaire: true },
]

const colonnesEquipements: ColonneTableau<Equipement>[] = [
  { cle: "code", libelle: "Code", rendu: (e) => <span className="tabular font-semibold">{e.code}</span>, tri: (e) => e.code },
  { cle: "libelle", libelle: "Équipement", rendu: (e) => <CelluleDouble haut={e.libelle} bas={`${e.categorieLibelle} · ${e.type}`} />, tri: (e) => e.libelle },
  { cle: "pk", libelle: "PK", rendu: (e) => <span className="tabular">{e.pkFin !== null ? plagePk(e.pk, e.pkFin) : pk(e.pk)}</span>, tri: (e) => e.pk, numerique: true },
  { cle: "etat", libelle: "État", rendu: (e) => <TagEtat valeur={e.etat} libelle={e.etatLibelle} />, tri: (e) => e.etat, export: (e) => e.etatLibelle },
  {
    cle: "maintenance",
    libelle: "Prochaine maintenance",
    rendu: (e) => (
      <span className="grid justify-items-start gap-1">
        <span className="tabular">{dateCourte(e.prochaineMaintenanceLe)}</span>
        {e.maintenanceEnRetard ? <TagRetard /> : null}
      </span>
    ),
    tri: (e) => e.prochaineMaintenanceLe,
    export: (e) => `${dateCourte(e.prochaineMaintenanceLe)}${e.maintenanceEnRetard ? " (en retard)" : ""}`,
    secondaire: true,
  },
]

const colonnesInterventions: ColonneTableau<Intervention>[] = [
  { cle: "numero", libelle: "Numéro", rendu: (i) => <span className="tabular font-semibold">{i.numero}</span>, tri: (i) => i.numero },
  { cle: "libelle", libelle: "Plage travaux", rendu: (i) => <CelluleDouble haut={i.libelle} bas={`${i.typeLibelle} · ${i.interruption ? "coupure de voie" : "sous circulation"}`} />, tri: (i) => i.libelle },
  { cle: "pk", libelle: "PK", rendu: (i) => <span className="tabular whitespace-nowrap">{plagePk(i.pkDebut, i.pkFin)}</span>, tri: (i) => i.pkDebut, export: (i) => plagePk(i.pkDebut, i.pkFin) },
  { cle: "creneau", libelle: "Créneau", rendu: (i) => <span className="tabular">{dateHeure(i.debutLe)} → {dateHeure(i.finLe)}</span>, tri: (i) => i.debutLe, export: (i) => `${dateHeure(i.debutLe)} → ${dateHeure(i.finLe)}` },
  { cle: "statut", libelle: "Statut", rendu: (i) => <TagEtat valeur={i.statut} libelle={i.statutLibelle} />, tri: (i) => i.statut, export: (i) => i.statutLibelle },
]

const colonnesChantiers: ColonneTableau<Chantier>[] = [
  { cle: "code", libelle: "Code", rendu: (c) => <span className="tabular font-semibold">{c.code}</span>, tri: (c) => c.code },
  { cle: "libelle", libelle: "Chantier", rendu: (c) => <CelluleDouble haut={c.libelle} bas={`${c.natureLibelle} · ${c.entreprise}`} />, tri: (c) => c.libelle },
  { cle: "pk", libelle: "PK", rendu: (c) => <span className="tabular whitespace-nowrap">{plagePk(c.pkDebut, c.pkFin)}</span>, tri: (c) => c.pkDebut, export: (c) => plagePk(c.pkDebut, c.pkFin) },
  { cle: "budget", libelle: "Budget", rendu: (c) => <span className="tabular">{xafCompact(c.budgetFcfa)}</span>, tri: (c) => c.budgetFcfa, numerique: true },
  { cle: "physique", libelle: "Avancement physique", rendu: (c) => <span className="tabular">{pct(c.avancementPhysiquePct)}</span>, tri: (c) => c.avancementPhysiquePct, numerique: true },
  { cle: "statut", libelle: "Statut", rendu: (c) => <TagEtat valeur={c.statut} libelle={c.statutLibelle} />, tri: (c) => c.statut, export: (c) => c.statutLibelle },
]

/** Zones de la section : LTV actives, anomalies ouvertes, plages travaux en cours. */
export function zonesSection(dossier: DossierSection): ZoneVoie[] {
  const ltv = zonesLtv(dossier.ltv.filter((l) => l.statut === "active"))
  const anomalies: ZoneVoie[] = dossier.anomalies
    .filter((a) => a.ouverte)
    .map((a) => ({ id: a.id, libelle: a.numero, pkDebut: a.pk, pkFin: a.pk, detail: `Anomalie ${a.graviteLibelle.toLowerCase()}`, href: `/infrastructures/anomalies/${a.id}`, nature: "anomalie" }))
  const travaux: ZoneVoie[] = dossier.interventions
    .filter((i) => i.statut === "accordee" || i.statut === "en_cours")
    .map((i) => ({ id: i.id, libelle: i.numero, pkDebut: i.pkDebut, pkFin: i.pkFin, detail: i.interruption ? "Coupure de voie" : "Travaux sous circulation", href: `/infrastructures/interventions/${i.id}`, nature: "travaux" }))
  return [...ltv, ...anomalies, ...travaux]
}

type OngletSection = "anomalies" | "ltv" | "ouvrages" | "equipements" | "interventions" | "chantiers"

export function DossierSectionEcran({ sectionId }: { sectionId: string }) {
  const dossier = useQuery(infraApi.queries.section, { sectionId: sectionId as never })
  if (dossier === undefined) {
    return (
      <CadreInfra titre="Section de voie" retour={RETOUR}>
        <DossierEnChargement />
      </CadreInfra>
    )
  }
  if (dossier === null) {
    return (
      <CadreInfra titre="Section introuvable" retour={RETOUR}>
        <DossierIntrouvable quoi="Section de voie" retour={RETOUR} />
      </CadreInfra>
    )
  }
  return <DossierSectionVue dossier={dossier} />
}

export function DossierSectionVue({ dossier }: { dossier: DossierSection }) {
  const { section } = dossier
  const droits = useDroitsInfra()
  const ligne = useLigne()
  const operation = useOperation()
  const majEtat = useMutation(infraApi.mutations.majEtatSection)
  const [fenetre, setFenetre] = useState(false)
  const [onglet, setOnglet] = useState<OngletSection>("anomalies")
  const peutGerer = !droits.chargement && droits.peut("voie_gerer")

  const nom = section.code
  return (
    <CadreInfra
      titre={`${section.code} · ${section.libelle}`}
      description={`${plagePk(section.pkDebut, section.pkFin)} · ${fmtKm.format(section.longueurKm)} km · ${section.district} · ${section.brigade}`}
      retour={RETOUR}
      actions={
        peutGerer ? (
          <Button
            type="button"
            onClick={() => {
              operation.effacer()
              setFenetre(true)
            }}
          >
            <ClipboardCheck />
            Mettre à jour l&apos;état
          </Button>
        ) : undefined
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <TagEtat valeur={section.etat} libelle={`Voie en état ${section.etatLibelle.toLowerCase()}`} />
        {section.vitesseLimiteKmh < section.vitesseNominaleKmh ? (
          <TagEtat valeur="active" libelle={`Limitée à ${kmh(section.vitesseLimiteKmh)}`} />
        ) : null}
      </div>
      <RetourOperation retour={fenetre ? null : operation.retour} />

      <Panneau titre="La section sur la ligne" icone={Spline} sousTitre={plagePk(section.pkDebut, section.pkFin)}>
        {ligne === undefined ? (
          <p className="text-small text-ink-muted" role="status">
            Chargement du schéma de ligne…
          </p>
        ) : (
          <SchemaVoie gares={ligne.gares} zones={zonesSection(dossier)} segment={[section.pkDebut, section.pkFin]} />
        )}
      </Panneau>

      <div className="grid gap-5 lg:grid-cols-[minmax(300px,0.8fr)_minmax(0,1.2fr)]">
        <div className="grid content-start gap-5">
          <Panneau titre="Fiche de la section" icone={ClipboardCheck}>
            <Fiche
              elements={[
                ["Code", <span key="c" className="tabular">{section.code}</span>],
                ["Plage", <span key="p" className="tabular">{plagePk(section.pkDebut, section.pkFin)}</span>],
                ["Longueur", <span key="l" className="tabular">{fmtKm.format(section.longueurKm)} km</span>],
                ["District", section.district],
                ["Brigade", section.brigade],
                ["Armement", section.armement],
                ["Traverses", `${section.typeTraverseLibelle} · ${pct(section.partBetonPct)} béton`],
                ["Vitesse nominale", <span key="vn" className="tabular">{kmh(section.vitesseNominaleKmh)}</span>],
                ["Vitesse limite", <span key="vl" className="tabular">{kmh(section.vitesseLimiteKmh)}</span>],
                ["État", section.etatLibelle],
                ["Dernière auscultation", <span key="a" className="tabular">{section.derniereAuscultationLe ? dateCourte(section.derniereAuscultationLe) : "Non renseignée"}</span>],
                ["Mise à jour", <span key="m" className="tabular">{dateHeure(section.majLe)}</span>],
              ]}
            />
            {section.noteEtat ? (
              <InlineMessage tone="info" title="Note d'état">
                {section.noteEtat}
              </InlineMessage>
            ) : null}
          </Panneau>
          <Panneau titre="Chronologie" icone={History}>
            <Chronologie evenements={chronologieInfra(dossier.chronologie)} vide="Aucun relevé tracé sur cette section." />
          </Panneau>
        </div>

        <div className="grid content-start gap-3">
          <Onglets
            libelle="Éléments de la section"
            valeur={onglet}
            onChange={setOnglet}
            onglets={[
              { cle: "anomalies", libelle: "Anomalies", compte: dossier.anomalies.length },
              { cle: "ltv", libelle: "LTV", compte: dossier.ltv.length },
              { cle: "ouvrages", libelle: "Ouvrages", compte: dossier.ouvrages.length },
              { cle: "equipements", libelle: "Équipements", compte: dossier.equipements.length },
              { cle: "interventions", libelle: "Plages travaux", compte: dossier.interventions.length },
              { cle: "chantiers", libelle: "Chantiers PRN", compte: dossier.chantiers.length },
            ]}
          />
          {onglet === "anomalies" ? (
            <TableauDonnees
              libelle={`Anomalies de la section ${nom}`}
              colonnes={colonnesAnomalies.filter((c) => c.cle !== "section" && c.cle !== "categorie")}
              lignes={dossier.anomalies}
              cle={(a) => a.id}
              lien={(a) => `/infrastructures/anomalies/${a.id}`}
              exportNom={`anomalies-${nom}`}
              parPage={10}
              vide={{ titre: "Aucune anomalie sur cette section", description: "Les signalements des brigades rattachés à cette plage PK apparaîtront ici." }}
            />
          ) : null}
          {onglet === "ltv" ? (
            <TableauDonnees
              libelle={`LTV de la section ${nom}`}
              colonnes={colonnesLtv.filter((c) => c.cle !== "section")}
              lignes={dossier.ltv}
              cle={(l) => l.id}
              lien={(l) => `/infrastructures/ltv/${l.id}`}
              exportNom={`ltv-${nom}`}
              parPage={10}
              vide={{ titre: "Aucune LTV sur cette section", description: "La section circule à sa vitesse nominale." }}
            />
          ) : null}
          {onglet === "ouvrages" ? (
            <TableauDonnees
              libelle={`Ouvrages de la section ${nom}`}
              colonnes={colonnesOuvrages}
              lignes={dossier.ouvrages}
              cle={(o) => o.id}
              lien={(o) => `/infrastructures/ouvrages/${o.id}`}
              exportNom={`ouvrages-${nom}`}
              parPage={10}
              vide={{ titre: "Aucun ouvrage d'art inventorié", description: "Ponts, buses et dalots de la plage apparaîtront ici une fois inventoriés." }}
            />
          ) : null}
          {onglet === "equipements" ? (
            <TableauDonnees
              libelle={`Équipements de la section ${nom}`}
              colonnes={colonnesEquipements}
              lignes={dossier.equipements}
              cle={(e) => e.id}
              lien={(e) => `/infrastructures/equipements/${e.id}`}
              exportNom={`equipements-${nom}`}
              parPage={10}
              vide={{ titre: "Aucun équipement sur cette section", description: "Signalisation, passages à niveau et télécoms de la plage apparaîtront ici." }}
            />
          ) : null}
          {onglet === "interventions" ? (
            <TableauDonnees
              libelle={`Plages travaux de la section ${nom}`}
              colonnes={colonnesInterventions}
              lignes={dossier.interventions}
              cle={(i) => i.id}
              lien={(i) => `/infrastructures/interventions/${i.id}`}
              exportNom={`plages-travaux-${nom}`}
              parPage={10}
              vide={{ titre: "Aucune plage travaux sur cette section", description: "Les demandes et accords de plages recoupant la section apparaîtront ici." }}
            />
          ) : null}
          {onglet === "chantiers" ? (
            <TableauDonnees
              libelle={`Chantiers PRN de la section ${nom}`}
              colonnes={colonnesChantiers}
              lignes={dossier.chantiers}
              cle={(c) => c.id}
              lien={(c) => `/infrastructures/prn/${c.id}`}
              exportNom={`chantiers-${nom}`}
              parPage={10}
              vide={{ titre: "Aucun chantier PRN sur cette section", description: "Les chantiers du programme qui recoupent la plage apparaîtront ici." }}
            />
          ) : null}
        </div>
      </div>

      <FenetreFormulaire
        open={fenetre}
        onOpenChange={setFenetre}
        titre={`Mettre à jour l'état de ${section.code}`}
        description="Le relevé est inscrit à la chronologie de la section et au journal d'audit."
        libelleValider="Enregistrer le relevé"
        enCours={operation.enCours === "etat"}
        erreur={fenetre && operation.retour?.ton === "danger" ? operation.retour.detail : null}
        onSubmit={async (donnees) => {
          const partBetonPct = nombreSaisi(donnees, "partBeton")
          if (partBetonPct !== undefined && (Number.isNaN(partBetonPct) || partBetonPct < 0 || partBetonPct > 100)) {
            operation.signaler({ ton: "danger", titre: "Action refusée", detail: "La part de traverses béton doit être comprise entre 0 et 100 %." })
            return
          }
          const auscultation = texte(donnees, "auscultation")
          const ok = await operation.executer(
            "etat",
            () =>
              majEtat({
                sectionId: section.id as never,
                etat: String(donnees.get("etat")) as EtatVoie,
                noteEtat: texte(donnees, "note"),
                partBetonPct: partBetonPct !== undefined && partBetonPct !== section.partBetonPct ? partBetonPct : undefined,
                auscultationLe: auscultation && auscultation !== champDate(section.derniereAuscultationLe) ? (auscultation === aujourdhuiService() ? Date.now() : debutJour(auscultation) + 12 * 3_600_000) : undefined,
              }),
            `État de ${section.code} enregistré.`
          )
          if (ok) setFenetre(false)
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="État de la voie" htmlFor="section-etat">
            <SelectNative id="section-etat" name="etat" defaultValue={section.etat}>
              {Object.entries(ETATS_VOIE).map(([valeur, libelle]) => (
                <option key={valeur} value={valeur}>
                  {libelle}
                </option>
              ))}
            </SelectNative>
          </Field>
          <Field label="Part de traverses béton (%)" htmlFor="section-beton" hint={`Actuellement ${pct(section.partBetonPct)}.`}>
            <Input id="section-beton" name="partBeton" inputMode="decimal" className="tabular" defaultValue={String(section.partBetonPct).replace(".", ",")} />
          </Field>
          <Field label="Date d'auscultation (facultatif)" htmlFor="section-auscultation" hint="Passage de l'engin de mesure ou relevé de géométrie.">
            <Input id="section-auscultation" name="auscultation" type="date" max={aujourdhuiService()} className="tabular" defaultValue={champDate(section.derniereAuscultationLe)} />
          </Field>
        </div>
        <Field label="Note d'état (facultatif)" htmlFor="section-note">
          <Textarea id="section-note" name="note" maxLength={1000} defaultValue={section.noteEtat ?? ""} placeholder="Nivellement à reprendre entre PK 212 et 214 ; ballast pollué." />
        </Field>
      </FenetreFormulaire>
    </CadreInfra>
  )
}
