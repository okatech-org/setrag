"use client"

import type { FunctionReturnType } from "convex/server"
import { CalendarPlus, ClipboardCheck } from "lucide-react"
import { useRouter } from "next/navigation"
import { useId, useState } from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { Field, Input, SelectNative } from "@workspace/ui/components/field"
import { Tag } from "@workspace/ui/components/tag"

import {
  CelluleDouble,
  TableauDonnees,
  type ColonneTableau,
} from "@/components/charte"
import {
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
  dateIso,
} from "@/components/modules/rh/commun"
import { GARES } from "@/components/modules/rh/libelles"

import {
  CadreSecurite,
  TagInspection,
  TagResultat,
  TagRetard,
  useAccesSecurite,
} from "./cadre-securite"
import {
  RESULTATS_INSPECTION,
  STATUTS_INSPECTION,
  TYPES_INSPECTION,
  lieuEtPk,
  type TypeInspection,
} from "./libelles"

type Inspection = FunctionReturnType<
  typeof api.modules.securite.inspections.lister
>[number]

export const colonnesInspections: ColonneTableau<Inspection>[] = [
  {
    cle: "numero",
    libelle: "N°",
    rendu: (i) => <span className="tabular font-semibold">{i.numero}</span>,
    tri: (i) => i.numero,
  },
  {
    cle: "type",
    libelle: "Inspection",
    rendu: (i) => (
      <CelluleDouble haut={i.objet} bas={TYPES_INSPECTION[i.type]} />
    ),
    tri: (i) => TYPES_INSPECTION[i.type],
    export: (i) => `${TYPES_INSPECTION[i.type]} — ${i.objet}`,
  },
  {
    cle: "lieu",
    libelle: "Lieu",
    rendu: (i) => (
      <span className="grid">
        <span>{lieuEtPk(i)}</span>
        {i.zoneLope ? (
          <small className="text-[12px] text-ink-muted">
            Parc national de la Lopé
          </small>
        ) : null}
      </span>
    ),
    tri: (i) => i.pk ?? i.lieu,
    export: (i) => lieuEtPk(i),
    secondaire: true,
  },
  {
    cle: "date",
    libelle: "Date",
    rendu: (i) => (
      <span className="flex flex-wrap items-center gap-1">
        <span className="tabular whitespace-nowrap">
          {dateIso(i.dateProgrammee)}
        </span>
        {i.enRetard ? <TagRetard libelle="Résultat en retard" /> : null}
      </span>
    ),
    tri: (i) => i.dateProgrammee,
    export: (i) =>
      `${i.dateProgrammee}${i.enRetard ? " (résultat en retard)" : ""}`,
  },
  {
    cle: "inspecteur",
    libelle: "Inspecteur",
    rendu: (i) => i.inspecteurNom,
    tri: (i) => i.inspecteurNom,
    secondaire: true,
  },
  {
    cle: "resultat",
    libelle: "Résultat",
    rendu: (i) =>
      i.resultat ? (
        <TagResultat resultat={i.resultat} />
      ) : (
        <span className="text-ink-muted">—</span>
      ),
    tri: (i) => i.resultat ?? "",
    export: (i) => (i.resultat ? RESULTATS_INSPECTION[i.resultat] : ""),
  },
  {
    cle: "nc",
    libelle: "Non-conformités",
    rendu: (i) => (
      <span className="tabular">
        {i.nonConformites}
        {i.ncSansAction > 0 ? (
          <small className="ml-1 text-warning-ink">
            dont {i.ncSansAction} sans action
          </small>
        ) : null}
      </span>
    ),
    tri: (i) => i.nonConformites,
    export: (i) => `${i.nonConformites} (${i.ncSansAction} sans action)`,
    numerique: true,
  },
  {
    cle: "statut",
    libelle: "Statut",
    rendu: (i) => <TagInspection statut={i.statut} />,
    tri: (i) => i.statut,
    export: (i) => STATUTS_INSPECTION[i.statut],
  },
]

export function ListeInspections() {
  const router = useRouter()
  const { peut, acces } = useAccesSecurite()
  const lecture = peut("registre.lire") || peut("environnement.lire")
  const inspections = useQuery(
    api.modules.securite.inspections.lister,
    lecture ? {} : "skip"
  )
  const [statut, setStatut] = useState("tous")
  const [type, setType] = useState("tous")
  const [programmer, setProgrammer] = useState(false)
  const filtres = inspections?.filter(
    (i) =>
      (statut === "tous" || i.statut === statut) &&
      (type === "tous" || i.type === type)
  )
  return (
    <CadreSecurite
      titre="Inspections et audits"
      description="Inspections de la voie, audits du système de gestion de la sécurité, contrôles du matériel et de la conduite, exercices et inspections environnementales."
      actions={
        peut("inspections.gerer") ? (
          <Button type="button" onClick={() => setProgrammer(true)}>
            <CalendarPlus />
            Programmer une inspection
          </Button>
        ) : null
      }
    >
      {acces && !lecture ? (
        <AccesRestreint>
          Votre profil ne consulte pas les inspections de sécurité.
        </AccesRestreint>
      ) : (
        <>
          {acces && !peut("registre.lire") ? (
            <p className="text-small text-ink-muted">
              <Tag tone="neutral">Environnement</Tag> Votre profil voit les
              seules inspections environnementales.
            </p>
          ) : null}
          <TableauDonnees
            libelle="Inspections et audits"
            colonnes={colonnesInspections}
            lignes={filtres}
            cle={(i) => i._id}
            lien={(i) => `/securite/inspections/${i._id}`}
            recherche={{
              placeholder: "N°, objet, lieu, inspecteur…",
              texte: (i) =>
                `${i.numero} ${i.objet} ${i.lieu} ${i.inspecteurNom} ${TYPES_INSPECTION[i.type]}`,
            }}
            filtres={
              <>
                <SelectFiltre
                  libelle="Statut"
                  value={statut}
                  onChange={setStatut}
                >
                  <option value="tous">Tous les statuts</option>
                  {Object.entries(STATUTS_INSPECTION).map(([cle, lib]) => (
                    <option key={cle} value={cle}>
                      {lib}
                    </option>
                  ))}
                </SelectFiltre>
                <SelectFiltre
                  libelle="Type d'inspection"
                  icone={ClipboardCheck}
                  value={type}
                  onChange={setType}
                >
                  <option value="tous">Tous les types</option>
                  {Object.entries(TYPES_INSPECTION).map(([cle, lib]) => (
                    <option key={cle} value={cle}>
                      {lib}
                    </option>
                  ))}
                </SelectFiltre>
              </>
            }
            exportNom="inspections-securite"
            imprimable
            triInitial={{ cle: "date", sens: "desc" }}
            vide={{
              titre: "Aucune inspection",
              description: "Aucune inspection ne correspond à ces filtres.",
            }}
          />
        </>
      )}
      {peut("inspections.gerer") ? (
        <DialogueProgrammer
          open={programmer}
          onOpenChange={setProgrammer}
          onProgrammee={(id) => router.push(`/securite/inspections/${id}`)}
        />
      ) : null}
    </CadreSecurite>
  )
}

export function DialogueProgrammer({
  open,
  onOpenChange,
  typeInitial = "inspection_voie",
  onProgrammee,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  typeInitial?: TypeInspection
  onProgrammee: (inspectionId: string) => void
}) {
  const programmer = useMutation(api.modules.securite.inspections.programmer)
  const operation = useOperation()
  const base = useId()
  return (
    <FenetreFormulaire
      open={open}
      onOpenChange={onOpenChange}
      large
      titre="Programmer une inspection"
      description="Indiquez une gare, un point kilométrique ou un lieu. Entre les PK 240 et 315, l'inspection est rattachée au parc national de la Lopé."
      libelleValider={
        <>
          <CalendarPlus />
          Programmer
        </>
      }
      enCours={operation.enCours === "programmer"}
      erreur={
        operation.retour?.ton === "danger" ? operation.retour.detail : null
      }
      onSubmit={async (d) => {
        const resultat = await operation.executer("programmer", () =>
          programmer({
            type: String(d.get("type")) as TypeInspection,
            objet: String(d.get("objet") ?? ""),
            gareCode: texte(d, "gareCode"),
            pk: nombreSaisi(d, "pk"),
            lieu: texte(d, "lieu"),
            dateProgrammee: String(d.get("date") ?? ""),
            inspecteurNom: texte(d, "inspecteur"),
          })
        )
        if (resultat) {
          onOpenChange(false)
          onProgrammee(resultat.inspectionId)
        }
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Type d'inspection" htmlFor={`${base}-type`}>
          <SelectNative
            id={`${base}-type`}
            name="type"
            defaultValue={typeInitial}
          >
            {Object.entries(TYPES_INSPECTION).map(([cle, lib]) => (
              <option key={cle} value={cle}>
                {lib}
              </option>
            ))}
          </SelectNative>
        </Field>
        <Field label="Date" htmlFor={`${base}-date`}>
          <Input
            id={`${base}-date`}
            name="date"
            type="date"
            required
            min={aujourdhui()}
            defaultValue={aujourdhui(7)}
          />
        </Field>
        <Field
          label="Objet"
          htmlFor={`${base}-objet`}
          className="sm:col-span-2"
        >
          <Input
            id={`${base}-objet`}
            name="objet"
            required
            autoComplete="off"
            placeholder="Tournée de voie Ndjolé — Booué"
          />
        </Field>
        <Field label="Gare" htmlFor={`${base}-gare`}>
          <SelectNative id={`${base}-gare`} name="gareCode" defaultValue="">
            <option value="">— En ligne —</option>
            {GARES.map(([code, nom]) => (
              <option key={code} value={code}>
                {nom}
              </option>
            ))}
          </SelectNative>
        </Field>
        <Field label="Point kilométrique" htmlFor={`${base}-pk`}>
          <Input
            id={`${base}-pk`}
            name="pk"
            inputMode="decimal"
            autoComplete="off"
          />
        </Field>
        <Field label="Lieu" htmlFor={`${base}-lieu`}>
          <Input id={`${base}-lieu`} name="lieu" autoComplete="off" />
        </Field>
        <Field
          label="Inspecteur"
          htmlFor={`${base}-inspecteur`}
          hint="Par défaut, vous-même."
        >
          <Input
            id={`${base}-inspecteur`}
            name="inspecteur"
            autoComplete="off"
          />
        </Field>
      </div>
    </FenetreFormulaire>
  )
}
