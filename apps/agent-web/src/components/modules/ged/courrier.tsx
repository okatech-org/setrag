"use client"

import type { FunctionReturnType } from "convex/server"
import { MailPlus } from "lucide-react"
import type { Route } from "next"
import { useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { Field, Input, SelectNative } from "@workspace/ui/components/field"

import { CelluleDouble, TableauDonnees, type ColonneTableau } from "@/components/charte"
import { Onglets, SelectFiltre, useOperation } from "@/components/gestion/referentiels/elements"
import { dateCourte, dateHeure } from "@/components/gestion/referentiels/format"
import { FenetreFormulaire } from "@/components/gestion/referentiels/formulaire"

import { CadreGed, MENTION_LECTURE_GED } from "./cadre"
import { DIRECTIONS, STATUTS_COURRIER, TagCourrier, TagDemo, libelleDirection, type StatutCourrier } from "./statuts"
import type { Id } from "./types"

type Registre = FunctionReturnType<typeof api.modules.ged.queries.listerCourriers>
type Ligne = Registre["lignes"][number]
type Sens = "tous" | "arrivee" | "depart"

const jour = (date: string | null) => (date ? dateCourte(Date.parse(`${date}T12:00:00Z`)) : "—")
const aujourdhui = () => new Intl.DateTimeFormat("fr-CA", { timeZone: "Africa/Libreville" }).format(new Date())

const colonnes: ColonneTableau<Ligne>[] = [
  {
    cle: "numero",
    libelle: "N° d'ordre",
    rendu: (ligne) => <CelluleDouble mono haut={ligne.numero} bas={ligne.sens === "arrivee" ? "Arrivée" : "Départ"} />,
    tri: (ligne) => ligne.numero,
  },
  {
    cle: "enregistre",
    libelle: "Enregistré",
    rendu: (ligne) => <span className="tabular">{dateHeure(ligne.enregistreLe)}</span>,
    tri: (ligne) => ligne.enregistreLe,
    export: (ligne) => new Date(ligne.enregistreLe),
  },
  {
    cle: "date",
    libelle: "Date du courrier",
    rendu: (ligne) => <span className="tabular">{jour(ligne.dateCourrier)}</span>,
    tri: (ligne) => ligne.dateCourrier,
    secondaire: true,
  },
  {
    cle: "correspondant",
    libelle: "Correspondant",
    rendu: (ligne) => <CelluleDouble haut={ligne.correspondant} bas={ligne.referenceExterne ?? undefined} />,
    tri: (ligne) => ligne.correspondant,
  },
  {
    cle: "objet",
    libelle: "Objet",
    rendu: (ligne) => (
      <span className="grid gap-1">
        <span>
          {ligne.priorite === "urgente" ? <b className="mr-1.5 text-danger-ink">Urgent ·</b> : null}
          {ligne.objet}
        </span>
        <TagDemo origine={ligne.origine} />
      </span>
    ),
    tri: (ligne) => ligne.objet,
    export: (ligne) => ligne.objet,
  },
  {
    cle: "direction",
    libelle: "Affecté à",
    rendu: (ligne) => libelleDirection(ligne.directionAffectee),
    tri: (ligne) => ligne.directionAffectee,
    secondaire: true,
  },
  {
    cle: "echeance",
    libelle: "Échéance",
    rendu: (ligne) => <span className={ligne.enRetard ? "tabular font-semibold text-danger-ink" : "tabular"}>{jour(ligne.echeanceReponse)}</span>,
    tri: (ligne) => ligne.echeanceReponse ?? "9999",
    export: (ligne) => ligne.echeanceReponse ?? "",
  },
  {
    cle: "priorite",
    libelle: "Priorité",
    rendu: (ligne) => (ligne.priorite === "urgente" ? "Urgente" : "Normale"),
    tri: (ligne) => ligne.priorite,
    secondaire: true,
  },
  {
    cle: "statut",
    libelle: "État",
    rendu: (ligne) => <TagCourrier statut={ligne.statut} enRetard={ligne.enRetard} />,
    tri: (ligne) => (ligne.enRetard ? -1 : Object.keys(STATUTS_COURRIER).indexOf(ligne.statut)),
    export: (ligne) => (ligne.enRetard ? "En retard" : STATUTS_COURRIER[ligne.statut].libelle),
  },
  {
    cle: "agent",
    libelle: "Enregistré par",
    rendu: (ligne) => ligne.enregistrePar,
    tri: (ligne) => ligne.enregistrePar,
    secondaire: true,
  },
]

/** Fenêtre d'enregistrement d'un courrier, aussi utilisée pour répondre. */
export function FenetreCourrier({
  open,
  onOpenChange,
  reponseA,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Courrier arrivé auquel ce départ répond. */
  reponseA?: { _id: Id<"gedCourriers">; numero: string; correspondant: string; objet: string; directionAffectee: string }
}) {
  const router = useRouter()
  const enregistrer = useMutation(api.modules.ged.mutations.enregistrerCourrier)
  const pieces = useQuery(api.modules.ged.queries.listerDocuments, open ? {} : "skip")
  const operation = useOperation()
  const [sens, setSens] = useState<"arrivee" | "depart">(reponseA ? "depart" : "arrivee")
  const piecesCourrier = (pieces?.lignes ?? []).filter((piece) =>
    sens === "arrivee" ? piece.type === "courrier_entrant" : piece.type === "courrier_sortant"
  )
  return (
    <FenetreFormulaire
      open={open}
      onOpenChange={onOpenChange}
      large
      titre={reponseA ? `Répondre au ${reponseA.numero}` : "Enregistrer un courrier"}
      description="Le numéro d'ordre est attribué à l'enregistrement, dans l'ordre chronologique, sans trou ni doublon."
      libelleValider={
        <>
          <MailPlus />
          Enregistrer
        </>
      }
      enCours={operation.enCours === "courrier"}
      erreur={operation.retour?.ton === "danger" ? operation.retour.detail : null}
      onSubmit={async (donnees) => {
        const valeur = (cle: string) => String(donnees.get(cle) ?? "").trim()
        const resultat = await operation.executer("courrier", () =>
          enregistrer({
            sens,
            dateCourrier: valeur("dateCourrier"),
            correspondant: valeur("correspondant"),
            objet: valeur("objet"),
            referenceExterne: valeur("referenceExterne") || undefined,
            directionAffectee: valeur("directionAffectee"),
            priorite: valeur("priorite") === "urgente" ? "urgente" : "normale",
            echeanceReponse: sens === "arrivee" && valeur("echeanceReponse") ? valeur("echeanceReponse") : undefined,
            documentId: (valeur("documentId") || undefined) as Id<"gedDocuments"> | undefined,
            reponseACourrierId: reponseA?._id,
          })
        )
        if (resultat) {
          onOpenChange(false)
          router.push(`/bureautique/courrier/${resultat.courrierId}` as Route)
        }
      }}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Sens" htmlFor="courrier-sens">
          <SelectNative
            id="courrier-sens"
            value={sens}
            disabled={Boolean(reponseA)}
            onChange={(event) => setSens(event.target.value as "arrivee" | "depart")}
          >
            <option value="arrivee">Arrivée</option>
            <option value="depart">Départ</option>
          </SelectNative>
        </Field>
        <Field label="Date du courrier" htmlFor="courrier-date">
          <Input id="courrier-date" name="dateCourrier" type="date" defaultValue={aujourdhui()} className="tabular" required />
        </Field>
        <Field label={sens === "arrivee" ? "Expéditeur" : "Destinataire"} htmlFor="courrier-correspondant">
          <Input id="courrier-correspondant" name="correspondant" defaultValue={reponseA?.correspondant ?? ""} required minLength={2} maxLength={200} />
        </Field>
        <Field label="Référence externe (facultative)" htmlFor="courrier-reference">
          <Input id="courrier-reference" name="referenceExterne" maxLength={80} />
        </Field>
        <Field label="Objet" htmlFor="courrier-objet" className="md:col-span-2">
          <Input
            id="courrier-objet"
            name="objet"
            defaultValue={reponseA ? `Réponse : ${reponseA.objet}` : ""}
            required
            minLength={3}
            maxLength={300}
          />
        </Field>
        <Field label="Direction affectée" htmlFor="courrier-direction">
          <SelectNative id="courrier-direction" name="directionAffectee" defaultValue={reponseA?.directionAffectee ?? "BOC"}>
            {Object.entries(DIRECTIONS).map(([cle, libelle]) => (
              <option key={cle} value={cle}>
                {libelle}
              </option>
            ))}
          </SelectNative>
        </Field>
        <Field label="Priorité" htmlFor="courrier-priorite">
          <SelectNative id="courrier-priorite" name="priorite" defaultValue="normale">
            <option value="normale">Normale</option>
            <option value="urgente">Urgente</option>
          </SelectNative>
        </Field>
        {sens === "arrivee" ? (
          <Field label="Échéance de réponse (facultative)" htmlFor="courrier-echeance" hint="Au-delà, le courrier apparaît en retard.">
            <Input id="courrier-echeance" name="echeanceReponse" type="date" className="tabular" />
          </Field>
        ) : null}
        <Field label="Pièce numérisée (facultative)" htmlFor="courrier-piece" hint="Déposez d'abord la pièce dans la GED.">
          <SelectNative id="courrier-piece" name="documentId" defaultValue="">
            <option value="">Aucune</option>
            {piecesCourrier.map((piece) => (
              <option key={piece._id} value={piece._id}>
                {piece.reference} — {piece.titre}
              </option>
            ))}
          </SelectNative>
        </Field>
      </div>
    </FenetreFormulaire>
  )
}

/** Registre chronologique du courrier : arrivées et départs. */
export function RegistreCourrier() {
  const parametres = useSearchParams()
  const [sens, setSens] = useState<Sens>("tous")
  const [statut, setStatut] = useState("tous")
  const [nouveau, setNouveau] = useState(parametres.get("nouveau") === "1")
  const registre = useQuery(api.modules.ged.queries.listerCourriers, {})
  const lignes = registre?.lignes.filter(
    (ligne) =>
      (sens === "tous" || ligne.sens === sens) &&
      (statut === "tous" || (statut === "retard" ? ligne.enRetard : ligne.statut === statut))
  )
  const retards = registre?.lignes.filter((ligne) => ligne.enRetard).length

  return (
    <CadreGed
      titre="Registre du courrier"
      description="Courrier officiel arrivé et parti, numéroté dans l'ordre d'enregistrement. Un courrier arrivé sans réponse après son échéance apparaît en retard."
      lectureSeule={registre && !registre.peutEnregistrer ? MENTION_LECTURE_GED : undefined}
      actions={
        registre?.peutEnregistrer ? (
          <Button type="button" onClick={() => setNouveau(true)}>
            <MailPlus />
            Enregistrer un courrier
          </Button>
        ) : null
      }
    >
      <Onglets
        libelle="Sens"
        valeur={sens}
        onChange={setSens}
        onglets={[
          { cle: "tous", libelle: "Tout le registre", compte: registre?.lignes.length },
          { cle: "arrivee", libelle: "Arrivée", compte: registre?.lignes.filter((ligne) => ligne.sens === "arrivee").length },
          { cle: "depart", libelle: "Départ", compte: registre?.lignes.filter((ligne) => ligne.sens === "depart").length },
        ]}
      />
      <div role="tabpanel">
        <TableauDonnees
          libelle="Registre du courrier"
          colonnes={colonnes}
          lignes={lignes}
          cle={(ligne) => ligne._id}
          lien={(ligne) => `/bureautique/courrier/${ligne._id}`}
          recherche={{
            placeholder: "Numéro, correspondant, objet, référence…",
            texte: (ligne) => `${ligne.numero} ${ligne.correspondant} ${ligne.objet} ${ligne.referenceExterne ?? ""} ${libelleDirection(ligne.directionAffectee)}`,
          }}
          filtres={
            <SelectFiltre libelle="État" value={statut} onChange={setStatut}>
              <option value="tous">Tous les états</option>
              <option value="retard">En retard{retards ? ` (${retards})` : ""}</option>
              {(Object.keys(STATUTS_COURRIER) as StatutCourrier[]).map((cle) => (
                <option key={cle} value={cle}>
                  {STATUTS_COURRIER[cle].libelle}
                </option>
              ))}
            </SelectFiltre>
          }
          exportNom={`registre-courrier-${sens}`}
          imprimable
          triInitial={{ cle: "enregistre", sens: "desc" }}
          vide={{ titre: "Registre vide", description: "Aucun courrier n'a encore été enregistré." }}
        />
      </div>
      {nouveau ? <FenetreCourrier open onOpenChange={setNouveau} /> : null}
    </CadreGed>
  )
}
