"use client"

import {
  CalendarRange,
  Camera,
  CircleCheck,
  CircleX,
  Gauge,
  HardHat,
  History,
  ImagePlus,
  Link2,
  Tags,
  TriangleAlert,
  Wrench,
} from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import { useState, type ReactNode } from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { Button } from "@workspace/ui/components/button"
import { Field, SelectNative, Textarea } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import { Chronologie, Fiche, Panneau } from "@/components/charte"
import { RetourOperation, useOperation } from "@/components/gestion/referentiels/elements"
import { dateHeure } from "@/components/gestion/referentiels/format"
import { FenetreFormulaire } from "@/components/gestion/referentiels/formulaire"

import {
  CadreInfra,
  DossierEnChargement,
  DossierIntrouvable,
  infraApi,
  kmh,
  pk,
  plagePk,
  TagEtat,
  TagRetard,
  useDroitsInfra,
  type CapaciteInfra,
  type DossierAnomalie,
} from "../commun"
import { CATEGORIES_ANOMALIE, chronologieInfra, GRAVITES, ORDRE_GRAVITES, type CategorieAnomalie, type Gravite } from "../accueil/partage"
import { DialoguePoseLtv } from "../ltv/poser-ltv"
import { DialoguePlageTravaux } from "./demander-plage"
import { ChoixPhotos, MAX_PHOTOS, useTeleversement } from "./photos"

const RETOUR = { href: "/infrastructures/anomalies", libelle: "Registre des anomalies" }

export type ActionAnomalie = "prendre" | "traiter" | "clore" | "rejeter" | "requalifier" | "ltv" | "plage" | "photos"

/**
 * Actions offertes selon le statut et les capacités. La première est l'étape
 * suivante du cycle (bouton principal) ; les autres restent secondaires.
 */
export function actionsAnomalie(
  anomalie: Pick<DossierAnomalie["anomalie"], "statut" | "ouverte" | "ltvId" | "interventionId" | "nbPhotos">,
  peut: (capacite: CapaciteInfra) => boolean
): { principale: ActionAnomalie | null; secondaires: ActionAnomalie[] } {
  const { statut } = anomalie
  const principale: ActionAnomalie | null =
    statut === "signalee" && peut("anomalie_traiter")
      ? "prendre"
      : statut === "prise_en_charge" && peut("anomalie_traiter")
        ? "traiter"
        : statut === "traitee" && peut("anomalie_clore")
          ? "clore"
          : null
  const secondaires: ActionAnomalie[] = []
  if (!anomalie.ouverte) return { principale: null, secondaires }
  const enAmont = statut === "signalee" || statut === "prise_en_charge"
  if (enAmont && peut("anomalie_traiter")) secondaires.push("requalifier")
  if (!anomalie.ltvId && peut("ltv_gerer")) secondaires.push("ltv")
  if (!anomalie.interventionId && peut("intervention_demander")) secondaires.push("plage")
  if (anomalie.nbPhotos < MAX_PHOTOS && peut("anomalie_signaler")) secondaires.push("photos")
  if (enAmont && peut("anomalie_traiter")) secondaires.push("rejeter")
  return { principale, secondaires }
}

const LIBELLES_ACTION: Record<ActionAnomalie, { libelle: string; icone: typeof Wrench }> = {
  prendre: { libelle: "Prendre en charge", icone: HardHat },
  traiter: { libelle: "Déclarer traitée", icone: Wrench },
  clore: { libelle: "Clore l'anomalie", icone: CircleCheck },
  rejeter: { libelle: "Rejeter", icone: CircleX },
  requalifier: { libelle: "Requalifier", icone: Tags },
  ltv: { libelle: "Poser une LTV", icone: Gauge },
  plage: { libelle: "Demander une plage travaux", icone: CalendarRange },
  photos: { libelle: "Ajouter des photos", icone: ImagePlus },
}

function LienDossier({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href as Route} className="inline-flex min-h-11 items-center font-semibold text-accent-ink underline-offset-2 hover:underline">
      {children}
    </Link>
  )
}

export function DossierAnomalieEcran({ anomalieId }: { anomalieId: string }) {
  const dossier = useQuery(infraApi.queries.anomalie, { anomalieId: anomalieId as never })
  if (dossier === undefined) {
    return (
      <CadreInfra titre="Anomalie" retour={RETOUR}>
        <DossierEnChargement />
      </CadreInfra>
    )
  }
  if (dossier === null) {
    return (
      <CadreInfra titre="Anomalie introuvable" retour={RETOUR}>
        <DossierIntrouvable quoi="Anomalie" retour={RETOUR} />
      </CadreInfra>
    )
  }
  return <DossierAnomalieVue dossier={dossier} />
}

export function DossierAnomalieVue({ dossier }: { dossier: DossierAnomalie }) {
  const { anomalie, photos } = dossier
  const droits = useDroitsInfra()
  const operation = useOperation()
  const [ouverte, setOuverte] = useState<ActionAnomalie | null>(null)
  const prendre = useMutation(infraApi.mutations.prendreEnChargeAnomalie)
  const traiter = useMutation(infraApi.mutations.traiterAnomalie)
  const clore = useMutation(infraApi.mutations.cloreAnomalie)
  const rejeter = useMutation(infraApi.mutations.rejeterAnomalie)
  const requalifier = useMutation(infraApi.mutations.requalifierAnomalie)
  const ajouterPhotos = useMutation(infraApi.mutations.ajouterPhotosAnomalie)
  const { televerser, progression } = useTeleversement()
  const [nouvellesPhotos, setNouvellesPhotos] = useState<File[]>([])

  const { principale, secondaires } = droits.chargement ? { principale: null, secondaires: [] } : actionsAnomalie(anomalie, droits.peut)
  /* L'ajout de photos se fait depuis le panneau Photos, pas depuis l'en-tête. */
  const enTete = secondaires.filter((action) => action !== "photos")
  const id = anomalie.id as never
  const fermer = () => {
    setOuverte(null)
    setNouvellesPhotos([])
  }
  const erreurFenetre = operation.retour?.ton === "danger" ? operation.retour.detail : null

  const declencher = (action: ActionAnomalie) => {
    operation.effacer()
    if (action === "prendre") {
      void operation.executer("prendre", () => prendre({ anomalieId: id }), `${anomalie.numero} prise en charge.`)
      return
    }
    setOuverte(action)
  }

  const bouton = (action: ActionAnomalie, principal: boolean) => {
    const { libelle, icone: Icone } = LIBELLES_ACTION[action]
    return (
      <Button
        key={action}
        type="button"
        variant={principal ? "primary" : action === "rejeter" ? "danger" : "secondary"}
        loading={operation.enCours === action}
        onClick={() => declencher(action)}
      >
        <Icone />
        {libelle}
      </Button>
    )
  }

  const descriptionPhoto = (index: number) =>
    `Photo ${index + 1} sur ${photos.length} de l'anomalie ${anomalie.numero} : ${anomalie.categorieLibelle.toLowerCase()} au ${pk(anomalie.pk)}`

  return (
    <CadreInfra
      titre={`Anomalie ${anomalie.numero}`}
      description={`${anomalie.categorieLibelle} · ${pk(anomalie.pk)}${anomalie.sectionLibelle ? ` · ${anomalie.sectionLibelle}` : ""}`}
      retour={RETOUR}
      actions={enTete.length > 0 || principale ? <>{[...enTete.map((a) => bouton(a, false)), principale ? bouton(principale, true) : null]}</> : undefined}
    >
      <div className="flex flex-wrap items-center gap-2">
        <TagEtat valeur={anomalie.statut} libelle={anomalie.statutLibelle} />
        <TagEtat valeur={anomalie.gravite} libelle={`Gravité ${anomalie.graviteLibelle.toLowerCase()}`} />
        {anomalie.enRetard ? <TagRetard texte="En retard sur l'échéance" /> : null}
        {anomalie.ouverte ? (
          <span className="text-small text-ink-muted">
            Échéance <span className="tabular font-semibold text-ink">{dateHeure(anomalie.echeanceLe)}</span>
          </span>
        ) : null}
      </div>
      <RetourOperation retour={ouverte ? null : operation.retour} />
      {anomalie.statut === "traitee" && !droits.chargement && !droits.peut("anomalie_clore") ? (
        <InlineMessage tone="info" title="Traitée, en attente de clôture.">
          La clôture revient à un chef de district ou au responsable PRN, autre que l&apos;agent qui a traité.
        </InlineMessage>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
        <div className="grid content-start gap-5">
          <Panneau titre="Signalement" icone={TriangleAlert}>
            <p className="text-[15px] whitespace-pre-line">{anomalie.description}</p>
            <Fiche
              elements={[
                ["Point kilométrique", <span key="pk" className="tabular">{pk(anomalie.pk)}</span>],
                ["Section", anomalie.sectionId ? <LienDossier key="s" href={`/infrastructures/voie/${anomalie.sectionId}`}>{anomalie.sectionLibelle ?? "Voir la section"}</LienDossier> : "Hors section"],
                ["Catégorie", anomalie.categorieLibelle],
                ["Gravité", anomalie.graviteLibelle],
                ["Brigade", anomalie.brigade ?? "Non précisée"],
                ["Signalée", <span key="sig"><span className="tabular">{dateHeure(anomalie.signaleLe)}</span> · {anomalie.signaleParNom ?? "Agent inconnu"}</span>],
                ["Échéance", <span key="ech" className="tabular">{dateHeure(anomalie.echeanceLe)}</span>],
                anomalie.priseEnChargeLe ? ["Prise en charge", <span key="pec"><span className="tabular">{dateHeure(anomalie.priseEnChargeLe)}</span> · {anomalie.priseEnChargeParNom ?? "—"}</span>] : null,
                anomalie.traiteLe ? ["Traitée", <span key="tr"><span className="tabular">{dateHeure(anomalie.traiteLe)}</span> · {anomalie.traiteParNom ?? "—"}</span>] : null,
                anomalie.closLe ? ["Close", <span key="cl"><span className="tabular">{dateHeure(anomalie.closLe)}</span> · {anomalie.closParNom ?? "—"}</span>] : null,
              ]}
            />
            {anomalie.traitement ? (
              <InlineMessage tone={anomalie.statut === "close" ? "success" : "info"} title="Compte rendu de traitement">
                {anomalie.traitement}
              </InlineMessage>
            ) : null}
            {anomalie.motifRejet ? (
              <InlineMessage tone="warning" title="Motif du rejet">
                {anomalie.motifRejet}
              </InlineMessage>
            ) : null}
          </Panneau>

          <Panneau titre="Photos" icone={Camera} sousTitre={`${photos.length} sur ${MAX_PHOTOS} au plus`} actions={secondaires.includes("photos") ? bouton("photos", false) : undefined}>
            {photos.length === 0 ? (
              <p className="text-small text-ink-muted">Aucune photo jointe à ce signalement.</p>
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label={`Photos de l'anomalie ${anomalie.numero}`}>
                {photos.map((photo, index) => (
                  <li key={photo.id} className="grid gap-1">
                    {photo.url ? (
                      <a href={photo.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-md border border-line hover:border-accent-base">
                        {/* eslint-disable-next-line @next/next/no-img-element -- fichier du stockage Convex, adresse signée */}
                        <img src={photo.url} alt={descriptionPhoto(index)} loading="lazy" className="aspect-[4/3] w-full object-cover" />
                      </a>
                    ) : (
                      <span className="grid aspect-[4/3] place-items-center rounded-md border border-dashed border-line-strong text-[12.5px] text-ink-muted">
                        Photo indisponible
                      </span>
                    )}
                    <small className="text-[12px] text-ink-muted">
                      Photo {index + 1}
                      {photo.url ? " · ouvrir en grand" : ""}
                    </small>
                  </li>
                ))}
              </ul>
            )}
          </Panneau>

          <Panneau titre="Chronologie" icone={History}>
            <Chronologie evenements={chronologieInfra(dossier.chronologie)} vide="Aucun événement tracé sur cette anomalie." />
          </Panneau>
        </div>

        <div className="grid content-start gap-5">
          <Panneau titre="Limitation de vitesse" icone={Gauge}>
            {dossier.ltv ? (
              <div className="grid gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <LienDossier href={`/infrastructures/ltv/${dossier.ltv.id}`}>
                    <span className="tabular">{dossier.ltv.numero}</span>
                  </LienDossier>
                  <TagEtat valeur={dossier.ltv.statut} libelle={dossier.ltv.statutLibelle} />
                </div>
                <Fiche
                  elements={[
                    ["Plage", <span key="p" className="tabular">{plagePk(dossier.ltv.pkDebut, dossier.ltv.pkFin)}</span>],
                    ["Vitesse", <span key="v" className="tabular">{kmh(dossier.ltv.vitesseKmh)} au lieu de {kmh(dossier.ltv.vitesseNominaleKmh)}</span>],
                  ]}
                />
              </div>
            ) : (
              <p className="text-small text-ink-muted">Aucune LTV ne couvre cette anomalie.</p>
            )}
          </Panneau>
          <Panneau titre="Plage travaux" icone={CalendarRange}>
            {dossier.intervention ? (
              <div className="grid gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <LienDossier href={`/infrastructures/interventions/${dossier.intervention.id}`}>
                    <span className="tabular">{dossier.intervention.numero}</span>
                  </LienDossier>
                  <TagEtat valeur={dossier.intervention.statut} libelle={dossier.intervention.statutLibelle} />
                </div>
                <Fiche
                  elements={[
                    ["Créneau", <span key="c" className="tabular">{dateHeure(dossier.intervention.debutLe)} → {dateHeure(dossier.intervention.finLe)}</span>],
                    ["Plage", <span key="p" className="tabular">{plagePk(dossier.intervention.pkDebut, dossier.intervention.pkFin)}</span>],
                    ["Circulation", dossier.intervention.interruption ? "Coupure de voie" : "Sous circulation"],
                  ]}
                />
              </div>
            ) : (
              <p className="text-small text-ink-muted">Aucune plage travaux demandée pour cette anomalie.</p>
            )}
          </Panneau>
          {dossier.ouvrage || dossier.equipement || dossier.incident ? (
            <Panneau titre="Rattachements" icone={Link2}>
              <Fiche
                elements={[
                  dossier.ouvrage ? ["Ouvrage", <LienDossier key="o" href={`/infrastructures/ouvrages/${dossier.ouvrage.id}`}>{dossier.ouvrage.code} · {dossier.ouvrage.nom}</LienDossier>] : null,
                  dossier.equipement ? ["Équipement", <LienDossier key="e" href={`/infrastructures/equipements/${dossier.equipement.id}`}>{dossier.equipement.code} · {dossier.equipement.libelle}</LienDossier>] : null,
                  dossier.incident ? ["Incident", <LienDossier key="i" href={`/gestion/incidents/${dossier.incident.id}`}>{dossier.incident.number ?? "Incident d'exploitation"}</LienDossier>] : null,
                ]}
              />
            </Panneau>
          ) : null}
        </div>
      </div>

      {/* ------------------------------------------------------------ Fenêtres */}
      <FenetreFormulaire
        open={ouverte === "traiter"}
        onOpenChange={(o) => !o && fermer()}
        titre={`Déclarer ${anomalie.numero} traitée`}
        description="Le compte rendu est inscrit au dossier. Un autre agent prononcera la clôture."
        libelleValider="Déclarer traitée"
        enCours={operation.enCours === "traiter"}
        erreur={ouverte === "traiter" ? erreurFenetre : null}
        onSubmit={async (donnees) => {
          const ok = await operation.executer("traiter", () => traiter({ anomalieId: id, traitement: String(donnees.get("traitement") ?? "") }), `${anomalie.numero} déclarée traitée.`)
          if (ok) fermer()
        }}
      >
        <Field label="Compte rendu de traitement" htmlFor="anomalie-traitement">
          <Textarea id="anomalie-traitement" name="traitement" required minLength={5} maxLength={2000} placeholder="Coupon de rail remplacé, soudure aluminothermique contrôlée." />
        </Field>
      </FenetreFormulaire>

      <FenetreFormulaire
        open={ouverte === "clore"}
        onOpenChange={(o) => !o && fermer()}
        titre={`Clore ${anomalie.numero}`}
        description="La clôture atteste que le traitement est conforme. Elle est réservée à un autre agent que celui qui a traité."
        libelleValider="Clore l'anomalie"
        enCours={operation.enCours === "clore"}
        erreur={ouverte === "clore" ? erreurFenetre : null}
        onSubmit={async () => {
          const ok = await operation.executer("clore", () => clore({ anomalieId: id }), `${anomalie.numero} close.`)
          if (ok) fermer()
        }}
      >
        <Fiche
          elements={[
            ["Traitée par", anomalie.traiteParNom ?? "—"],
            ["Le", <span key="le" className="tabular">{dateHeure(anomalie.traiteLe)}</span>],
          ]}
        />
        {anomalie.traitement ? (
          <InlineMessage tone="info" title="Compte rendu">
            {anomalie.traitement}
          </InlineMessage>
        ) : null}
      </FenetreFormulaire>

      <FenetreFormulaire
        open={ouverte === "rejeter"}
        onOpenChange={(o) => !o && fermer()}
        titre={`Rejeter ${anomalie.numero}`}
        description="Un signalement rejeté sort de la file de traitement. Le motif est conservé au dossier et au journal."
        libelleValider="Rejeter le signalement"
        variante="danger"
        enCours={operation.enCours === "rejeter"}
        erreur={ouverte === "rejeter" ? erreurFenetre : null}
        onSubmit={async (donnees) => {
          const ok = await operation.executer("rejeter", () => rejeter({ anomalieId: id, motif: String(donnees.get("motif") ?? "") }), `${anomalie.numero} rejetée.`)
          if (ok) fermer()
        }}
      >
        <Field label="Motif du rejet" htmlFor="anomalie-motif-rejet">
          <Textarea id="anomalie-motif-rejet" name="motif" required minLength={5} maxLength={500} placeholder="Doublon de AN-2026-0041, même rail au même PK." />
        </Field>
      </FenetreFormulaire>

      <FenetreFormulaire
        open={ouverte === "requalifier"}
        onOpenChange={(o) => !o && fermer()}
        titre={`Requalifier ${anomalie.numero}`}
        description="L'échéance est recalculée depuis la date du signalement, selon la nouvelle gravité."
        libelleValider="Requalifier"
        enCours={operation.enCours === "requalifier"}
        erreur={ouverte === "requalifier" ? erreurFenetre : null}
        onSubmit={async (donnees) => {
          const ok = await operation.executer(
            "requalifier",
            () =>
              requalifier({
                anomalieId: id,
                gravite: String(donnees.get("gravite")) as Gravite,
                categorie: String(donnees.get("categorie")) as CategorieAnomalie,
              }),
            (r) => `${anomalie.numero} requalifiée · nouvelle échéance ${dateHeure(r.echeanceLe)}.`
          )
          if (ok) fermer()
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Gravité" htmlFor="requalifier-gravite">
            <SelectNative id="requalifier-gravite" name="gravite" defaultValue={anomalie.gravite}>
              {ORDRE_GRAVITES.map((valeur) => (
                <option key={valeur} value={valeur}>
                  {GRAVITES[valeur].libelle} — {GRAVITES[valeur].delai}
                </option>
              ))}
            </SelectNative>
          </Field>
          <Field label="Catégorie" htmlFor="requalifier-categorie">
            <SelectNative id="requalifier-categorie" name="categorie" defaultValue={anomalie.categorie}>
              {Object.entries(CATEGORIES_ANOMALIE).map(([valeur, libelle]) => (
                <option key={valeur} value={valeur}>
                  {libelle}
                </option>
              ))}
            </SelectNative>
          </Field>
        </div>
      </FenetreFormulaire>

      <FenetreFormulaire
        open={ouverte === "photos"}
        onOpenChange={(o) => !o && fermer()}
        large
        titre={`Ajouter des photos à ${anomalie.numero}`}
        description={`Le dossier compte ${photos.length} photo${photos.length > 1 ? "s" : ""} ; ${MAX_PHOTOS} au plus.`}
        libelleValider="Joindre les photos"
        enCours={operation.enCours === "photos"}
        erreur={ouverte === "photos" ? erreurFenetre : null}
        onSubmit={async () => {
          if (nouvellesPhotos.length === 0) {
            operation.signaler({ ton: "danger", titre: "Action refusée", detail: "Choisissez au moins une photo." })
            return
          }
          const ok = await operation.executer(
            "photos",
            async () => ajouterPhotos({ anomalieId: id, photoIds: await televerser(nouvellesPhotos) }),
            (r) => `Photos jointes : le dossier en compte ${r.nbPhotos}.`
          )
          if (ok) fermer()
        }}
      >
        <ChoixPhotos fichiers={nouvellesPhotos} onChange={setNouvellesPhotos} dejaPresentes={photos.length} desactive={operation.enCours === "photos"} />
        {progression ? (
          <p role="status" className="text-small tabular text-ink-muted">
            Envoi des photos : {progression.fait} sur {progression.total}…
          </p>
        ) : null}
      </FenetreFormulaire>

      {ouverte === "ltv" ? (
        <DialoguePoseLtv
          open
          onOpenChange={(o) => !o && fermer()}
          anomalie={{ id: anomalie.id, numero: anomalie.numero, pk: anomalie.pk, description: anomalie.description }}
          onPosee={() => operation.signaler({ ton: "success", titre: `LTV posée et liée à ${anomalie.numero}.` })}
        />
      ) : null}
      {ouverte === "plage" ? (
        <DialoguePlageTravaux
          open
          onOpenChange={(o) => !o && fermer()}
          anomalie={{ id: anomalie.id, numero: anomalie.numero, pk: anomalie.pk, categorie: anomalie.categorie, brigade: anomalie.brigade }}
          onDemandee={(numero) => operation.signaler({ ton: "success", titre: `Plage travaux ${numero} demandée, en attente d'accord.` })}
        />
      ) : null}
    </CadreInfra>
  )
}
