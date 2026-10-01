"use client"

import type { FunctionReturnType } from "convex/server"
import { Building2, MapPin, UserPlus } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { Field, Input, SelectNative } from "@workspace/ui/components/field"
import { Tag } from "@workspace/ui/components/tag"

import { CelluleDouble, TableauDonnees, type ColonneTableau } from "@/components/charte"
import { SelectFiltre, useOperation } from "@/components/gestion/referentiels/elements"
import { FenetreFormulaire, nombreSaisi, texte } from "@/components/gestion/referentiels/formulaire"

import { CadreRh, TagAgent, TagAptitude, useAccesRh } from "./cadre-rh"
import { AccesRestreint, aujourdhui } from "./commun"
import {
  CATEGORIES,
  CONTRATS,
  DIRECTIONS,
  ETATS_APTITUDE,
  GARES,
  METIERS,
  MODES_PAIEMENT,
  SITUATIONS,
  STATUTS_AGENT,
  type Categorie,
  type Contrat,
  type Direction,
  type Metier,
  type ModePaiement,
  type Situation,
} from "./libelles"

type Agent = FunctionReturnType<typeof api.modules.rh.agents.lister>[number]

const colonnes: ColonneTableau<Agent>[] = [
  { cle: "matricule", libelle: "Matricule", rendu: (a) => <span className="tabular font-semibold">{a.matricule}</span>, tri: (a) => a.matricule },
  { cle: "nom", libelle: "Agent", rendu: (a) => <CelluleDouble haut={a.nomComplet} bas={a.poste} />, tri: (a) => `${a.nom} ${a.prenom}`, export: (a) => a.nomComplet },
  { cle: "metier", libelle: "Métier", rendu: (a) => METIERS[a.metier], tri: (a) => METIERS[a.metier], secondaire: true },
  { cle: "direction", libelle: "Direction", rendu: (a) => <span title={DIRECTIONS[a.direction]}>{a.direction}</span>, tri: (a) => a.direction, export: (a) => DIRECTIONS[a.direction], secondaire: true },
  { cle: "gare", libelle: "Gare", rendu: (a) => a.gareNom, tri: (a) => a.gareNom },
  { cle: "contrat", libelle: "Contrat", rendu: (a) => CONTRATS[a.contrat], tri: (a) => a.contrat, export: (a) => CONTRATS[a.contrat], secondaire: true },
  { cle: "anciennete", libelle: "Ancienneté", rendu: (a) => <span className="tabular">{a.ancienneteAnnees} an{a.ancienneteAnnees > 1 ? "s" : ""}</span>, tri: (a) => a.ancienneteAnnees, numerique: true, secondaire: true },
  {
    cle: "aptitude",
    libelle: "Aptitude",
    rendu: (a) => (a.aptitude ? <TagAptitude etat={a.aptitude.etat} /> : "—"),
    tri: (a) => (a.aptitude ? Object.keys(ETATS_APTITUDE).indexOf(a.aptitude.etat) : null),
    export: (a) => (a.aptitude ? ETATS_APTITUDE[a.aptitude.etat] : ""),
  },
  {
    cle: "habilitations",
    libelle: "Habilitations",
    rendu: (a) => (a.habilitationsEnAlerte > 0 ? <Tag tone="warning">{a.habilitationsEnAlerte} à échéance</Tag> : <span className="text-ink-muted">À jour</span>),
    tri: (a) => a.habilitationsEnAlerte,
    secondaire: true,
  },
  { cle: "statut", libelle: "Statut", rendu: (a) => <TagAgent statut={a.statut} />, tri: (a) => a.statut, export: (a) => STATUTS_AGENT[a.statut] },
]

export function ListeAgents() {
  const router = useRouter()
  const { peut, acces } = useAccesRh()
  const autorise = peut("dossiers.lire")
  const agents = useQuery(api.modules.rh.agents.lister, autorise ? {} : "skip")
  const [statut, setStatut] = useState("actif")
  const [direction, setDirection] = useState("toutes")
  const [gare, setGare] = useState("toutes")
  const [metier, setMetier] = useState("tous")
  const [embauche, setEmbauche] = useState(false)

  const filtres = agents?.filter(
    (a) =>
      (statut === "tous" || a.statut === statut) &&
      (direction === "toutes" || a.direction === direction) &&
      (gare === "toutes" || a.gareCode === gare) &&
      (metier === "tous" || a.metier === metier)
  )

  return (
    <CadreRh
      titre="Dossiers du personnel"
      description="Identité, poste, affectation, contrat, ancienneté, habilitations ferroviaires et aptitude de chaque agent."
      actions={
        peut("dossiers.gerer") ? (
          <Button type="button" onClick={() => setEmbauche(true)}>
            <UserPlus />
            Enregistrer une embauche
          </Button>
        ) : null
      }
    >
      {acces && !autorise ? (
        <AccesRestreint>Votre profil ne consulte pas les dossiers individuels du personnel.</AccesRestreint>
      ) : (
        <TableauDonnees
          libelle="Dossiers du personnel"
          colonnes={colonnes}
          lignes={filtres}
          cle={(a) => a._id}
          lien={(a) => `/rh/agents/${a._id}`}
          recherche={{ placeholder: "Nom, matricule, poste…", texte: (a) => `${a.nomComplet} ${a.matricule} ${a.poste} ${a.gareNom}` }}
          filtres={
            <>
              <SelectFiltre libelle="Statut" value={statut} onChange={setStatut}>
                <option value="tous">Tous les statuts</option>
                {Object.entries(STATUTS_AGENT).map(([cle, lib]) => (
                  <option key={cle} value={cle}>
                    {lib}
                  </option>
                ))}
              </SelectFiltre>
              <SelectFiltre libelle="Direction" icone={Building2} value={direction} onChange={setDirection}>
                <option value="toutes">Toutes directions</option>
                {Object.entries(DIRECTIONS).map(([cle, lib]) => (
                  <option key={cle} value={cle}>
                    {cle} · {lib}
                  </option>
                ))}
              </SelectFiltre>
              <SelectFiltre libelle="Métier" value={metier} onChange={setMetier}>
                <option value="tous">Tous métiers</option>
                {Object.entries(METIERS).map(([cle, lib]) => (
                  <option key={cle} value={cle}>
                    {lib}
                  </option>
                ))}
              </SelectFiltre>
              <SelectFiltre libelle="Gare" icone={MapPin} value={gare} onChange={setGare}>
                <option value="toutes">Toutes les gares</option>
                {GARES.map(([code, nom]) => (
                  <option key={code} value={code}>
                    {nom}
                  </option>
                ))}
              </SelectFiltre>
            </>
          }
          exportNom="personnel-setrag"
          imprimable
          triInitial={{ cle: "nom", sens: "asc" }}
          vide={{ titre: "Aucun agent", description: "Aucun dossier ne correspond à ces filtres." }}
        />
      )}
      <DialogueEmbauche open={embauche} onOpenChange={setEmbauche} onCree={(id) => router.push(`/rh/agents/${id}`)} />
    </CadreRh>
  )
}

/** Embauche : ouvre le dossier, attribue le matricule, trace le mouvement. */
function DialogueEmbauche({ open, onOpenChange, onCree }: { open: boolean; onOpenChange: (o: boolean) => void; onCree: (id: string) => void }) {
  const embaucher = useMutation(api.modules.rh.agents.embaucher)
  const operation = useOperation()
  const [contrat, setContrat] = useState<Contrat>("cdi")
  return (
    <FenetreFormulaire
      open={open}
      onOpenChange={onOpenChange}
      large
      titre="Enregistrer une embauche"
      description="Le matricule est attribué à l'enregistrement. Le salaire de base ne peut être inférieur au SMIG (150 000 XAF)."
      libelleValider={
        <>
          <UserPlus />
          Ouvrir le dossier
        </>
      }
      enCours={operation.enCours === "embauche"}
      erreur={operation.retour?.ton === "danger" ? operation.retour.detail : null}
      onSubmit={async (d) => {
        const resultat = await operation.executer("embauche", () =>
          embaucher({
            nom: String(d.get("nom") ?? ""),
            prenom: String(d.get("prenom") ?? ""),
            sexe: String(d.get("sexe")) as "F" | "M",
            dateNaissance: String(d.get("dateNaissance") ?? ""),
            lieuNaissance: texte(d, "lieuNaissance"),
            telephone: texte(d, "telephone"),
            email: texte(d, "email"),
            situationFamiliale: String(d.get("situationFamiliale")) as Situation,
            enfantsACharge: nombreSaisi(d, "enfants") ?? 0,
            direction: String(d.get("direction")) as Direction,
            metier: String(d.get("metier")) as Metier,
            poste: String(d.get("poste") ?? ""),
            gareCode: String(d.get("gareCode")),
            categorie: String(d.get("categorie")) as Categorie,
            echelon: nombreSaisi(d, "echelon") ?? 1,
            contrat,
            dateEmbauche: String(d.get("dateEmbauche") ?? ""),
            dateFinContrat: texte(d, "dateFinContrat"),
            salaireBaseFcfa: nombreSaisi(d, "salaire") ?? 0,
            primeFonctionFcfa: nombreSaisi(d, "primeFonction") ?? 0,
            primeSujetionFcfa: nombreSaisi(d, "primeSujetion") ?? 0,
            modePaiement: String(d.get("modePaiement")) as ModePaiement,
            comptePaiement: texte(d, "comptePaiement"),
            numeroCnss: texte(d, "numeroCnss"),
            numeroCnamgs: texte(d, "numeroCnamgs"),
          })
        )
        if (resultat) {
          onOpenChange(false)
          onCree(resultat.agentId)
        }
      }}
    >
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-1 text-[14px] font-bold">Identité</legend>
        <Field label="Nom" htmlFor="emb-nom">
          <Input id="emb-nom" name="nom" required autoComplete="off" />
        </Field>
        <Field label="Prénom" htmlFor="emb-prenom">
          <Input id="emb-prenom" name="prenom" required autoComplete="off" />
        </Field>
        <Field label="Sexe" htmlFor="emb-sexe">
          <SelectNative id="emb-sexe" name="sexe" defaultValue="M">
            <option value="M">Masculin</option>
            <option value="F">Féminin</option>
          </SelectNative>
        </Field>
        <Field label="Date de naissance" htmlFor="emb-naissance">
          <Input id="emb-naissance" name="dateNaissance" type="date" required />
        </Field>
        <Field label="Lieu de naissance" htmlFor="emb-lieu">
          <Input id="emb-lieu" name="lieuNaissance" />
        </Field>
        <Field label="Téléphone" htmlFor="emb-tel" hint="Ex. +241 77 12 34 56">
          <Input id="emb-tel" name="telephone" type="tel" inputMode="tel" />
        </Field>
        <Field label="Courriel" htmlFor="emb-mail">
          <Input id="emb-mail" name="email" type="email" />
        </Field>
        <Field label="Situation familiale" htmlFor="emb-situation">
          <SelectNative id="emb-situation" name="situationFamiliale" defaultValue="celibataire">
            {Object.entries(SITUATIONS).map(([cle, lib]) => (
              <option key={cle} value={cle}>
                {lib}
              </option>
            ))}
          </SelectNative>
        </Field>
        <Field label="Enfants à charge" htmlFor="emb-enfants" hint="Une demi-part fiscale par enfant.">
          <Input id="emb-enfants" name="enfants" type="number" min={0} max={20} defaultValue={0} inputMode="numeric" />
        </Field>
      </fieldset>
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-1 text-[14px] font-bold">Poste et affectation</legend>
        <Field label="Direction" htmlFor="emb-direction">
          <SelectNative id="emb-direction" name="direction" defaultValue="DEF">
            {Object.entries(DIRECTIONS).map(([cle, lib]) => (
              <option key={cle} value={cle}>
                {cle} · {lib}
              </option>
            ))}
          </SelectNative>
        </Field>
        <Field label="Métier" htmlFor="emb-metier">
          <SelectNative id="emb-metier" name="metier" defaultValue="agent_gare">
            {Object.entries(METIERS).map(([cle, lib]) => (
              <option key={cle} value={cle}>
                {lib}
              </option>
            ))}
          </SelectNative>
        </Field>
        <Field label="Intitulé du poste" htmlFor="emb-poste">
          <Input id="emb-poste" name="poste" required placeholder="Agent de gare" />
        </Field>
        <Field label="Gare d'affectation" htmlFor="emb-gare">
          <SelectNative id="emb-gare" name="gareCode" defaultValue="OWE">
            {GARES.map(([code, nom]) => (
              <option key={code} value={code}>
                {nom}
              </option>
            ))}
          </SelectNative>
        </Field>
        <Field label="Catégorie" htmlFor="emb-categorie">
          <SelectNative id="emb-categorie" name="categorie" defaultValue="execution">
            {Object.entries(CATEGORIES).map(([cle, lib]) => (
              <option key={cle} value={cle}>
                {lib}
              </option>
            ))}
          </SelectNative>
        </Field>
        <Field label="Échelon" htmlFor="emb-echelon">
          <Input id="emb-echelon" name="echelon" type="number" min={1} max={20} defaultValue={1} inputMode="numeric" />
        </Field>
      </fieldset>
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-1 text-[14px] font-bold">Contrat et rémunération</legend>
        <Field label="Contrat" htmlFor="emb-contrat">
          <SelectNative id="emb-contrat" value={contrat} onChange={(e) => setContrat(e.target.value as Contrat)}>
            {Object.entries(CONTRATS).map(([cle, lib]) => (
              <option key={cle} value={cle}>
                {lib}
              </option>
            ))}
          </SelectNative>
        </Field>
        <Field label="Date d'embauche" htmlFor="emb-date">
          <Input id="emb-date" name="dateEmbauche" type="date" required defaultValue={aujourdhui()} />
        </Field>
        {contrat !== "cdi" ? (
          <Field label="Fin du contrat" htmlFor="emb-fin" hint="Un CDD n'excède pas deux ans.">
            <Input id="emb-fin" name="dateFinContrat" type="date" required />
          </Field>
        ) : null}
        <Field label="Salaire de base mensuel (XAF)" htmlFor="emb-salaire">
          <Input id="emb-salaire" name="salaire" required inputMode="numeric" placeholder="250000" />
        </Field>
        <Field label="Prime de fonction (XAF)" htmlFor="emb-fonction">
          <Input id="emb-fonction" name="primeFonction" inputMode="numeric" defaultValue="0" />
        </Field>
        <Field label="Prime de sujétion (XAF)" htmlFor="emb-sujetion" hint="Nuit, brousse, découché régulier.">
          <Input id="emb-sujetion" name="primeSujetion" inputMode="numeric" defaultValue="0" />
        </Field>
        <Field label="Mode de paiement" htmlFor="emb-paiement">
          <SelectNative id="emb-paiement" name="modePaiement" defaultValue="virement">
            {Object.entries(MODES_PAIEMENT).map(([cle, lib]) => (
              <option key={cle} value={cle}>
                {lib}
              </option>
            ))}
          </SelectNative>
        </Field>
        <Field label="Compte ou numéro (masqué)" htmlFor="emb-compte" hint="Ex. GA21 •••• 4471">
          <Input id="emb-compte" name="comptePaiement" />
        </Field>
        <Field label="N° CNSS" htmlFor="emb-cnss">
          <Input id="emb-cnss" name="numeroCnss" inputMode="numeric" />
        </Field>
        <Field label="N° CNAMGS" htmlFor="emb-cnamgs">
          <Input id="emb-cnamgs" name="numeroCnamgs" inputMode="numeric" />
        </Field>
      </fieldset>
    </FenetreFormulaire>
  )
}
