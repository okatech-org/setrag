"use client"

import type { FunctionReturnType } from "convex/server"
import {
  Layers,
  MapPin,
  Radio,
  ShieldAlert,
  ShieldPlus,
  TriangleAlert,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useId, useState, type ReactNode } from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import {
  Field,
  Input,
  SelectNative,
  Textarea,
} from "@workspace/ui/components/field"
import { Tag } from "@workspace/ui/components/tag"

import {
  CelluleDouble,
  Panneau,
  TableauDonnees,
  type ColonneTableau,
} from "@/components/charte"
import {
  RetourOperation,
  SelectFiltre,
  useOperation,
} from "@/components/gestion/referentiels/elements"
import {
  FenetreFormulaire,
  nombreSaisi,
  texte,
} from "@/components/gestion/referentiels/formulaire"
import {
  AccesRestreint,
  aujourdhui,
  champDateIso,
  champHeure,
  instantLibreville,
} from "@/components/modules/rh/commun"
import { GARES } from "@/components/modules/rh/libelles"

import {
  CadreSecurite,
  TagArtf,
  TagEvenement,
  TagGravite,
  TagRetard,
  dateHeureComplete,
  useAccesSecurite,
} from "./cadre-securite"
import {
  CATEGORIES_INCIDENT,
  FAMILLES,
  GRAVITES,
  GRAVITES_INCIDENT,
  RANG_GRAVITE,
  STATUTS_ARTF,
  STATUTS_ENQUETE,
  STATUTS_EVENEMENT,
  TYPES_EVENEMENT,
  familleDe,
  libelleType,
  lieuEtPk,
  maintenant,
  type Famille,
  type Gravite,
  type TypeEvenement,
} from "./libelles"

export type LigneRegistre = FunctionReturnType<
  typeof api.modules.securite.evenements.lister
>[number]
type IncidentTerrain = FunctionReturnType<
  typeof api.modules.securite.evenements.incidentsAQualifier
>[number]

function notificationTexte(e: LigneRegistre, instant: number) {
  if (!e.notificationRequise) return "Non requise"
  if (!e.notification) return "Requise"
  const retard =
    (e.notification.statut === "a_preparer" ||
      e.notification.statut === "prete") &&
    e.notification.echeance < instant
  return `${STATUTS_ARTF[e.notification.statut]}${retard ? " · en retard" : ""}`
}

export function colonnesRegistre(
  instant: number
): ColonneTableau<LigneRegistre>[] {
  return [
    {
      cle: "numero",
      libelle: "N°",
      rendu: (e) => <span className="tabular font-semibold">{e.numero}</span>,
      tri: (e) => e.numero,
    },
    {
      cle: "date",
      libelle: "Survenu le",
      rendu: (e) => (
        <span className="tabular whitespace-nowrap">
          {dateHeureComplete(e.survenuLe)}
        </span>
      ),
      tri: (e) => e.survenuLe,
      export: (e) => dateHeureComplete(e.survenuLe),
    },
    {
      cle: "type",
      libelle: "Type",
      rendu: (e) => (
        <CelluleDouble haut={libelleType(e.type)} bas={FAMILLES[e.famille]} />
      ),
      tri: (e) => libelleType(e.type),
      export: (e) => libelleType(e.type),
    },
    {
      cle: "gravite",
      libelle: "Gravité",
      rendu: (e) => <TagGravite gravite={e.gravite} />,
      tri: (e) => RANG_GRAVITE[e.gravite],
      export: (e) => GRAVITES[e.gravite],
    },
    {
      cle: "lieu",
      libelle: "Lieu / PK",
      rendu: (e) => (
        <span className="grid">
          <span>{lieuEtPk(e)}</span>
          {e.zoneLope ? (
            <small className="text-[12px] text-ink-muted">
              Parc national de la Lopé
            </small>
          ) : null}
        </span>
      ),
      tri: (e) => e.pk ?? e.lieu,
      export: (e) => lieuEtPk(e),
    },
    {
      cle: "train",
      libelle: "Train",
      rendu: (e) =>
        e.trainNumber ? <span className="tabular">{e.trainNumber}</span> : "—",
      tri: (e) => e.trainNumber ?? "",
      secondaire: true,
    },
    {
      cle: "statut",
      libelle: "Statut",
      rendu: (e) => <TagEvenement statut={e.statut} />,
      tri: (e) => e.statut,
      export: (e) => STATUTS_EVENEMENT[e.statut],
    },
    {
      cle: "enquete",
      libelle: "Enquête",
      rendu: (e) =>
        e.enquete ? (
          <CelluleDouble
            haut={e.enquete.numero}
            bas={STATUTS_ENQUETE[e.enquete.statut]}
          />
        ) : (
          "—"
        ),
      tri: (e) => e.enquete?.numero ?? "",
      export: (e) =>
        e.enquete
          ? `${e.enquete.numero} (${STATUTS_ENQUETE[e.enquete.statut]})`
          : "",
      secondaire: true,
    },
    {
      cle: "artf",
      libelle: "Notification ARTF",
      rendu: (e) => {
        if (!e.notificationRequise)
          return <span className="text-ink-muted">Non requise</span>
        if (!e.notification) return <Tag tone="warning">Requise</Tag>
        const retard =
          (e.notification.statut === "a_preparer" ||
            e.notification.statut === "prete") &&
          e.notification.echeance < instant
        return (
          <span className="flex flex-wrap gap-1">
            <TagArtf statut={e.notification.statut} />
            {retard ? <TagRetard /> : null}
          </span>
        )
      },
      tri: (e) => notificationTexte(e, instant),
      export: (e) => notificationTexte(e, instant),
    },
  ]
}

export function RegistreEvenements() {
  const router = useRouter()
  const { peut, acces } = useAccesSecurite()
  const lecture = peut("registre.lire")
  const declarer = peut("evenement.declarer")
  const evenements = useQuery(
    api.modules.securite.evenements.lister,
    lecture ? {} : "skip"
  )
  const incidents = useQuery(
    api.modules.securite.evenements.incidentsAQualifier,
    declarer ? {} : "skip"
  )
  const operation = useOperation()
  const [statut, setStatut] = useState("tous")
  const [famille, setFamille] = useState("toutes")
  const [gravite, setGravite] = useState("toutes")
  const [declaration, setDeclaration] = useState<{
    incident?: IncidentTerrain
  } | null>(null)
  const [instant] = useState(maintenant)

  const filtres = evenements?.filter(
    (e) =>
      (statut === "tous" || e.statut === statut) &&
      (famille === "toutes" || e.famille === famille) &&
      (gravite === "toutes" || e.gravite === gravite)
  )

  return (
    <CadreSecurite
      titre="Registre des événements de sécurité"
      description="Accidents, incidents et presque-accidents de la ligne, qualifiés, instruits et déclarés à l'ARTF quand les seuils sont atteints."
      actions={
        declarer ? (
          <Button type="button" onClick={() => setDeclaration({})}>
            <ShieldPlus />
            Déclarer un événement
          </Button>
        ) : null
      }
    >
      <RetourOperation retour={operation.retour} />
      {declarer && incidents && incidents.length > 0 ? (
        <Panneau
          titre="Incidents du terrain à qualifier"
          icone={Radio}
          sousTitre={`${incidents.length} incident(s) d'exploitation remonté(s) des trains et des gares`}
        >
          <ul className="grid divide-y divide-line">
            {incidents.map((incident) => (
              <li
                key={incident._id}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5"
              >
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="text-[14px] font-semibold">
                    {incident.numero ? (
                      <span className="tabular">{incident.numero} · </span>
                    ) : null}
                    {incident.description}
                  </span>
                  <small className="text-[12.5px] text-ink-muted">
                    <span className="tabular">
                      {dateHeureComplete(incident.reportedAt)}
                    </span>
                    {" · "}
                    {CATEGORIES_INCIDENT[incident.category]}
                    {incident.gareNom ? ` · ${incident.gareNom}` : ""}
                    {incident.location ? ` · ${incident.location}` : ""}
                    {incident.trainNumber
                      ? ` · train ${incident.trainNumber}`
                      : ""}
                  </small>
                </span>
                <Tag
                  tone={
                    incident.severity === "critique"
                      ? "danger"
                      : incident.severity === "important"
                        ? "warning"
                        : "neutral"
                  }
                >
                  {incident.severity === "critique" ? (
                    <TriangleAlert aria-hidden />
                  ) : null}
                  {GRAVITES_INCIDENT[incident.severity]}
                </Tag>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setDeclaration({ incident })}
                >
                  <ShieldAlert />
                  Qualifier
                </Button>
              </li>
            ))}
          </ul>
        </Panneau>
      ) : null}

      {acces && !lecture ? (
        <AccesRestreint>
          Votre profil ne consulte pas le registre des événements de sécurité.
        </AccesRestreint>
      ) : (
        <TableauEvenements
          lignes={filtres}
          instant={instant}
          filtres={
            <>
              <SelectFiltre
                libelle="Statut"
                value={statut}
                onChange={setStatut}
              >
                <option value="tous">Tous les statuts</option>
                {Object.entries(STATUTS_EVENEMENT).map(([cle, lib]) => (
                  <option key={cle} value={cle}>
                    {lib}
                  </option>
                ))}
              </SelectFiltre>
              <SelectFiltre
                libelle="Famille"
                icone={Layers}
                value={famille}
                onChange={setFamille}
              >
                <option value="toutes">Toutes les familles</option>
                {Object.entries(FAMILLES).map(([cle, lib]) => (
                  <option key={cle} value={cle}>
                    {lib}
                  </option>
                ))}
              </SelectFiltre>
              <SelectFiltre
                libelle="Gravité"
                icone={TriangleAlert}
                value={gravite}
                onChange={setGravite}
              >
                <option value="toutes">Toutes gravités</option>
                {Object.entries(GRAVITES).map(([cle, lib]) => (
                  <option key={cle} value={cle}>
                    {lib}
                  </option>
                ))}
              </SelectFiltre>
            </>
          }
        />
      )}

      {declarer ? (
        <DialogueDeclaration
          key={declaration?.incident?._id ?? "libre"}
          open={declaration !== null}
          onOpenChange={(o) => setDeclaration(o ? (declaration ?? {}) : null)}
          incident={declaration?.incident}
          onDeclare={(resultat) => {
            if (lecture)
              router.push(`/securite/evenements/${resultat.evenementId}`)
            else
              operation.signaler({
                ton: "success",
                titre: `Événement ${resultat.numero} déclaré`,
                detail: "Le service sécurité le qualifiera.",
              })
          }}
        />
      ) : null}
    </CadreSecurite>
  )
}

/** Tableau du registre, sans requête : rendu et testé à part. */
export function TableauEvenements({
  lignes,
  instant,
  filtres,
}: {
  lignes: readonly LigneRegistre[] | undefined
  instant: number
  filtres?: ReactNode
}) {
  return (
    <TableauDonnees
      libelle="Registre des événements de sécurité"
      colonnes={colonnesRegistre(instant)}
      lignes={lignes}
      cle={(e) => e._id}
      lien={(e) => `/securite/evenements/${e._id}`}
      recherche={{
        placeholder: "N°, type, lieu, train…",
        texte: (e) =>
          `${e.numero} ${libelleType(e.type)} ${e.lieu} ${e.trainNumber ?? ""} ${e.gareNom ?? ""}`,
      }}
      filtres={filtres}
      exportNom="registre-securite"
      imprimable
      triInitial={{ cle: "date", sens: "desc" }}
      vide={{
        titre: "Aucun événement",
        description: "Aucun événement ne correspond à ces filtres.",
      }}
    />
  )
}

/* ═══════════════════════════ Déclaration ════════════════════════════════ */

/**
 * Déclaration d'un événement de sécurité, libre ou issue d'un incident du
 * terrain (pré-remplie). L'obligation de notification ARTF est calculée par
 * le serveur.
 */
export function DialogueDeclaration({
  open,
  onOpenChange,
  incident,
  onDeclare,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  incident?: IncidentTerrain
  onDeclare: (resultat: { evenementId: string; numero: string }) => void
}) {
  const declarer = useMutation(api.modules.securite.evenements.declarer)
  const operation = useOperation()
  const base = useId()
  const gareConnue =
    incident?.gareCode && GARES.some(([code]) => code === incident.gareCode)
      ? incident.gareCode
      : ""
  return (
    <FenetreFormulaire
      open={open}
      onOpenChange={onOpenChange}
      large
      titre={
        incident
          ? "Qualifier un incident du terrain"
          : "Déclarer un événement de sécurité"
      }
      description={
        incident
          ? `Incident ${incident.numero ?? ""} remonté le ${dateHeureComplete(incident.reportedAt)} : il restera lié à l'événement déclaré.`
          : "Le numéro est attribué à l'enregistrement. Si l'événement atteint un seuil de déclaration, la notification ARTF est créée avec son échéance."
      }
      libelleValider={
        <>
          <ShieldPlus />
          Déclarer
        </>
      }
      enCours={operation.enCours === "declarer"}
      erreur={
        operation.retour?.ton === "danger" ? operation.retour.detail : null
      }
      onSubmit={async (d) => {
        const date = String(d.get("date") ?? "")
        const heureMinute = String(d.get("heure") ?? "")
        const survenuLe = instantLibreville(date, heureMinute)
        const resultat = await operation.executer("declarer", () =>
          declarer({
            type: String(d.get("type")) as TypeEvenement,
            gravite: String(d.get("gravite")) as Gravite,
            survenuLe,
            gareCode: texte(d, "gareCode"),
            pk: nombreSaisi(d, "pk"),
            lieu: texte(d, "lieu"),
            trainNumber: texte(d, "trainNumber"),
            tripId: incident?.tripId ?? undefined,
            incidentId: incident?._id,
            description: String(d.get("description") ?? ""),
            mesuresImmediates: texte(d, "mesures"),
            blesses: nombreSaisi(d, "blesses") ?? 0,
            deces: nombreSaisi(d, "deces") ?? 0,
            degats: texte(d, "degats"),
            interruptionMinutes: nombreSaisi(d, "interruption"),
          })
        )
        if (resultat) {
          onOpenChange(false)
          onDeclare(resultat)
        }
      }}
    >
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-1 text-[14px] font-bold">Nature</legend>
        <Field label="Type d'événement" htmlFor={`${base}-type`}>
          <SelectNative
            id={`${base}-type`}
            name="type"
            defaultValue={
              incident?.category === "medical"
                ? "accident_travail"
                : "obstacle_voie"
            }
          >
            {(Object.keys(FAMILLES) as Famille[]).map((f) => (
              <optgroup key={f} label={FAMILLES[f]}>
                {(Object.keys(TYPES_EVENEMENT) as TypeEvenement[])
                  .filter((t) => familleDe(t) === f)
                  .map((t) => (
                    <option key={t} value={t}>
                      {libelleType(t)}
                    </option>
                  ))}
              </optgroup>
            ))}
          </SelectNative>
        </Field>
        <Field label="Gravité" htmlFor={`${base}-gravite`}>
          <SelectNative
            id={`${base}-gravite`}
            name="gravite"
            defaultValue={
              incident?.severity === "critique"
                ? "grave"
                : incident?.severity === "important"
                  ? "significatif"
                  : "mineur"
            }
          >
            {(Object.keys(GRAVITES) as Gravite[]).map((g) => (
              <option key={g} value={g}>
                {GRAVITES[g]}
              </option>
            ))}
          </SelectNative>
        </Field>
        <Field label="Date de survenue" htmlFor={`${base}-date`}>
          <Input
            id={`${base}-date`}
            name="date"
            type="date"
            required
            max={aujourdhui()}
            defaultValue={
              incident ? champDateIso(incident.reportedAt) : aujourdhui()
            }
          />
        </Field>
        <Field label="Heure (Libreville)" htmlFor={`${base}-heure`}>
          <Input
            id={`${base}-heure`}
            name="heure"
            type="time"
            required
            defaultValue={
              incident
                ? champHeure(incident.reportedAt)
                : champHeure(maintenant())
            }
          />
        </Field>
      </fieldset>
      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="mb-1 text-[14px] font-bold">
          Localisation · une gare, un PK ou un lieu
        </legend>
        <Field label="Gare" htmlFor={`${base}-gare`}>
          <SelectNative
            id={`${base}-gare`}
            name="gareCode"
            defaultValue={gareConnue}
          >
            <option value="">— En ligne —</option>
            {GARES.map(([code, nom]) => (
              <option key={code} value={code}>
                {nom}
              </option>
            ))}
          </SelectNative>
        </Field>
        <Field
          label="Point kilométrique"
          htmlFor={`${base}-pk`}
          hint="De 0 (Owendo) à 669 (Franceville)."
        >
          <Input
            id={`${base}-pk`}
            name="pk"
            inputMode="decimal"
            placeholder="258,4"
            autoComplete="off"
          />
        </Field>
        <Field label="Lieu" htmlFor={`${base}-lieu`}>
          <Input
            id={`${base}-lieu`}
            name="lieu"
            defaultValue={incident?.location ?? undefined}
            placeholder="Tranchée de Ndjolé"
            autoComplete="off"
          />
        </Field>
        <Field label="Train" htmlFor={`${base}-train`}>
          <Input
            id={`${base}-train`}
            name="trainNumber"
            defaultValue={incident?.trainNumber ?? undefined}
            placeholder="V3"
            autoComplete="off"
          />
        </Field>
      </fieldset>
      <Field label="Description des faits" htmlFor={`${base}-description`}>
        <Textarea
          id={`${base}-description`}
          name="description"
          required
          rows={4}
          defaultValue={incident?.description}
        />
      </Field>
      <Field
        label="Mesures immédiates"
        htmlFor={`${base}-mesures`}
        hint="Protection, alerte, secours, restrictions de circulation."
      >
        <Textarea id={`${base}-mesures`} name="mesures" rows={2} />
      </Field>
      <fieldset className="grid gap-3 sm:grid-cols-4">
        <legend className="mb-1 text-[14px] font-bold">Conséquences</legend>
        <Field label="Blessés" htmlFor={`${base}-blesses`}>
          <Input
            id={`${base}-blesses`}
            name="blesses"
            type="number"
            min={0}
            max={1000}
            defaultValue={0}
            inputMode="numeric"
          />
        </Field>
        <Field label="Décès" htmlFor={`${base}-deces`}>
          <Input
            id={`${base}-deces`}
            name="deces"
            type="number"
            min={0}
            max={1000}
            defaultValue={0}
            inputMode="numeric"
          />
        </Field>
        <Field label="Interruption (min)" htmlFor={`${base}-interruption`}>
          <Input
            id={`${base}-interruption`}
            name="interruption"
            type="number"
            min={0}
            inputMode="numeric"
          />
        </Field>
        <Field label="Dégâts" htmlFor={`${base}-degats`}>
          <Input id={`${base}-degats`} name="degats" autoComplete="off" />
        </Field>
      </fieldset>
      <p className="text-small flex items-center gap-1.5 text-ink-muted">
        <MapPin aria-hidden className="size-4" />
        Entre les PK 240 et 315, l&apos;événement est rattaché au parc national
        de la Lopé.
      </p>
    </FenetreFormulaire>
  )
}
