"use client"

import type { FunctionReturnType } from "convex/server"
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Ban,
  CheckCheck,
  Eye,
  FileText,
  FileUp,
  History,
  KeyRound,
  Megaphone,
  MessageSquare,
  PenLine,
  Plus,
  Send,
  Stamp,
  Trash2,
  Workflow,
  X,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { isInternalRole, type AppRole } from "@workspace/backend/permissions"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/choice"
import { SkeletonLines } from "@workspace/ui/components/empty-state"
import { Field, Input, SelectNative, Textarea } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import { Chronologie, Fiche, Panneau, TableauDonnees, type ColonneTableau } from "@/components/charte"
import { Encart, RetourOperation, useOperation } from "@/components/gestion/referentiels/elements"
import { dateCourte, dateHeure, horodatage } from "@/components/gestion/referentiels/format"
import { FenetreFormulaire } from "@/components/gestion/referentiels/formulaire"
import { ROLE_LABELS } from "@/lib/roles"

import { CadreGed } from "./cadre"
import { EditeurAcces, type Acces } from "./depot"
import { BoutonTelecharger, FenetreApercu, TYPES_ACCEPTES, useOuvertureFichier, useTeleversement } from "./fichiers"
import {
  CLASSIFICATIONS,
  NATURES_ETAPE,
  ROLES_DIFFUSION,
  TYPES_DOCUMENT,
  TagCircuit,
  TagClassification,
  TagDemo,
  TagEtape,
  TagStatutDocument,
  libelleDirection,
  taille,
  type Classification,
  type NatureEtape,
  type TypeDocument,
} from "./statuts"
import type { Id } from "./types"

type Reponse = FunctionReturnType<typeof api.modules.ged.queries.document>
type Dossier = Extract<Reponse, { etat: "ok" }>
type Version = Dossier["versions"][number]
type Consultation = NonNullable<Dossier["consultations"]>[number]

const jour = (date: string | null) => (date ? dateCourte(Date.parse(`${date}T12:00:00Z`)) : "—")

const NATURES_CONSULTATION = { fiche: "Fiche ouverte", apercu: "Aperçu", telechargement: "Téléchargement" } as const

/* ═══════════════════════════════════════════════ Décision ═══ */

function PanneauDecision({ dossier }: { dossier: Dossier }) {
  const etape = dossier.actions.etapeAMoi!
  const decider = useMutation(api.modules.ged.mutations.deciderEtape)
  const diffuser = useMutation(api.modules.ged.mutations.diffuser)
  const operation = useOperation()
  const [commentaire, setCommentaire] = useState("")
  const [tous, setTous] = useState(dossier.document.type === "note_service")
  const [roles, setRoles] = useState<AppRole[]>([])
  const note = dossier.document.type === "note_service"

  const agir = (decision: "viser" | "signer" | "refuser") =>
    void operation.executer(
      decision,
      () => decider({ etapeId: etape._id, decision, commentaire: commentaire || undefined }),
      decision === "refuser" ? "Refus enregistré : la pièce retourne à son auteur." : decision === "viser" ? "Visa enregistré." : "Signature enregistrée."
    )

  return (
    <Panneau titre="Votre décision" icone={Stamp} sousTitre={`${NATURES_ETAPE[etape.nature]} · ${etape.libelle}`} className="border-accent-line">
      {etape.nature === "diffusion" ? (
        <div className="grid gap-3">
          <p className="text-small text-ink-muted">
            {note
              ? "Choisissez l'audience de la note : elle apparaîtra dans leurs notes à lire, avec accusé de lecture."
              : "Confirmez l'expédition de la pièce ; une diffusion interne est facultative."}
          </p>
          <Checkbox
            label="Tout le personnel interne"
            checked={tous}
            onCheckedChange={(valeur) => setTous(valeur === true)}
          />
          {!tous ? (
            <fieldset className="grid gap-1 sm:grid-cols-2">
              <legend className="mb-1 text-[13px] font-medium">Fonctions destinataires</legend>
              {ROLES_DIFFUSION.map(([role, libelle]) => (
                <Checkbox
                  key={role}
                  label={libelle}
                  checked={roles.includes(role)}
                  onCheckedChange={(valeur) =>
                    setRoles((actuels) => (valeur === true ? [...actuels, role] : actuels.filter((autre) => autre !== role)))
                  }
                />
              ))}
            </fieldset>
          ) : null}
          <Field label="Commentaire (facultatif)">
            <Input value={commentaire} onChange={(event) => setCommentaire(event.target.value)} maxLength={500} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              loading={operation.enCours === "diffuser"}
              onClick={() =>
                void operation.executer(
                  "diffuser",
                  () => diffuser({ etapeId: etape._id, tousLesAgents: tous, roles: tous ? [] : roles, commentaire: commentaire || undefined }),
                  note ? "Note diffusée : les accusés de lecture sont attendus." : "Expédition enregistrée."
                )
              }
            >
              <Megaphone />
              {note ? "Diffuser la note" : "Confirmer l'expédition"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-3">
          <Field label="Commentaire" hint="Obligatoire pour un refus : il est transmis à l'auteur.">
            <Textarea value={commentaire} onChange={(event) => setCommentaire(event.target.value)} maxLength={1000} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              loading={operation.enCours === (etape.nature === "visa" ? "viser" : "signer")}
              onClick={() => agir(etape.nature === "visa" ? "viser" : "signer")}
            >
              {etape.nature === "visa" ? <Stamp /> : <PenLine />}
              {etape.nature === "visa" ? "Viser la pièce" : "Signer la pièce"}
            </Button>
            <Button
              type="button"
              variant="danger"
              loading={operation.enCours === "refuser"}
              disabled={commentaire.trim().length < 5}
              onClick={() => agir("refuser")}
            >
              <X />
              Refuser
            </Button>
          </div>
          {commentaire.trim().length < 5 ? (
            <small className="text-[12.5px] text-ink-muted">Pour refuser, écrivez le motif (5 caractères au moins).</small>
          ) : null}
        </div>
      )}
      <RetourOperation retour={operation.retour} />
    </Panneau>
  )
}

/* ═══════════════════════════════════════════════ Circuit ═══ */

type EtapeSaisie = { nature: NatureEtape; libelle: string; assigneId: string }

function modeleCircuit(type: TypeDocument): EtapeSaisie[] {
  if (type === "note_service") {
    return [
      { nature: "visa", libelle: "Visa juridique", assigneId: "" },
      { nature: "signature", libelle: "Signature de la Direction générale", assigneId: "" },
      { nature: "diffusion", libelle: "Diffusion au personnel", assigneId: "" },
    ]
  }
  if (type === "courrier_sortant") {
    return [
      { nature: "visa", libelle: "Visa du service", assigneId: "" },
      { nature: "signature", libelle: "Signature", assigneId: "" },
      { nature: "diffusion", libelle: "Expédition", assigneId: "" },
    ]
  }
  return [
    { nature: "visa", libelle: "Visa juridique", assigneId: "" },
    { nature: "signature", libelle: "Signature", assigneId: "" },
  ]
}

function FenetreCircuit({ dossier, open, onOpenChange }: { dossier: Dossier; open: boolean; onOpenChange: (open: boolean) => void }) {
  const signataires = useQuery(api.modules.ged.queries.signataires, open ? {} : "skip")
  const soumettre = useMutation(api.modules.ged.mutations.soumettreCircuit)
  const operation = useOperation()
  const [etapes, setEtapes] = useState<EtapeSaisie[]>(() => modeleCircuit(dossier.document.type))
  const modifier = (index: number, valeur: Partial<EtapeSaisie>) =>
    setEtapes((actuelles) => actuelles.map((etape, rang) => (rang === index ? { ...etape, ...valeur } : etape)))
  const deplacer = (index: number, sens: -1 | 1) =>
    setEtapes((actuelles) => {
      const copie = [...actuelles]
      const cible = index + sens
      if (cible < 0 || cible >= copie.length) return actuelles
      ;[copie[index], copie[cible]] = [copie[cible]!, copie[index]!]
      return copie
    })
  return (
    <FenetreFormulaire
      open={open}
      onOpenChange={onOpenChange}
      large
      titre="Lancer le circuit de validation"
      description="Les étapes s'enchaînent dans l'ordre : visas, puis signature, puis diffusion. Chaque intervenant reçoit la pièce dans son parapheur ; un refus la renvoie à l'auteur."
      libelleValider={
        <>
          <Send />
          Lancer le circuit
        </>
      }
      enCours={operation.enCours === "circuit"}
      erreur={operation.retour?.ton === "danger" ? operation.retour.detail : null}
      onSubmit={async () => {
        const resultat = await operation.executer("circuit", () =>
          soumettre({
            documentId: dossier.document._id,
            etapes: etapes.map((etape) => ({
              nature: etape.nature,
              libelle: etape.libelle,
              assigneId: etape.assigneId as Id<"users">,
            })),
          })
        )
        if (resultat) onOpenChange(false)
      }}
    >
      <ol className="grid gap-3">
        {etapes.map((etape, index) => (
          <li key={index} className="grid gap-3 rounded-md border border-line p-3 md:grid-cols-[150px_minmax(0,1fr)_minmax(0,1fr)_auto]">
            <Field label={`Étape ${index + 1}`}>
              <SelectNative value={etape.nature} onChange={(event) => modifier(index, { nature: event.target.value as NatureEtape })}>
                {Object.entries(NATURES_ETAPE).map(([cle, libelle]) => (
                  <option key={cle} value={cle}>
                    {libelle}
                  </option>
                ))}
              </SelectNative>
            </Field>
            <Field label="Libellé">
              <Input value={etape.libelle} onChange={(event) => modifier(index, { libelle: event.target.value })} maxLength={120} />
            </Field>
            <Field label="Intervenant">
              <SelectNative value={etape.assigneId} onChange={(event) => modifier(index, { assigneId: event.target.value })} required>
                <option value="">Choisir…</option>
                {(signataires ?? []).map((signataire) => (
                  <option key={signataire._id} value={signataire._id}>
                    {signataire.nom} — {ROLE_LABELS[signataire.role] ?? signataire.role}
                  </option>
                ))}
              </SelectNative>
            </Field>
            <div className="flex items-end gap-1">
              <Button type="button" variant="ghost" size="icon" aria-label="Monter l'étape" disabled={index === 0} onClick={() => deplacer(index, -1)}>
                <ArrowUp />
              </Button>
              <Button type="button" variant="ghost" size="icon" aria-label="Descendre l'étape" disabled={index === etapes.length - 1} onClick={() => deplacer(index, 1)}>
                <ArrowDown />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Retirer l'étape"
                disabled={etapes.length === 1}
                onClick={() => setEtapes((actuelles) => actuelles.filter((_etape, rang) => rang !== index))}
              >
                <X />
              </Button>
            </div>
          </li>
        ))}
      </ol>
      <div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={etapes.length >= 8}
          onClick={() => setEtapes((actuelles) => [...actuelles, { nature: "visa", libelle: "Visa", assigneId: "" }])}
        >
          <Plus />
          Ajouter une étape
        </Button>
      </div>
    </FenetreFormulaire>
  )
}

function SectionCircuit({ dossier }: { dossier: Dossier }) {
  const annuler = useMutation(api.modules.ged.mutations.annulerCircuit)
  const operation = useOperation()
  const [annulation, setAnnulation] = useState(false)
  const circuit = dossier.circuits[0]
  if (!circuit) {
    return (
      <p className="text-small text-ink-muted">
        Aucun circuit lancé.{" "}
        {dossier.actions.peutSoumettre
          ? "Lancez le circuit pour faire viser, signer puis diffuser la pièce."
          : dossier.document.versionCourante === 0
            ? "Un fichier doit être déposé avant tout circuit."
            : ""}
      </p>
    )
  }
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <TagCircuit statut={circuit.statut} />
        <small className="text-[12.5px] text-ink-muted">
          Lancé par {circuit.initiePar} le <span className="tabular">{dateHeure(circuit.initieLe)}</span>
          {circuit.termineLe ? (
            <>
              {" "}· clos le <span className="tabular">{dateHeure(circuit.termineLe)}</span>
            </>
          ) : null}
        </small>
      </div>
      {circuit.motifCloture ? (
        <InlineMessage tone={circuit.statut === "refuse" ? "danger" : "info"} title={circuit.statut === "refuse" ? "Motif du refus :" : "Motif :"}>
          {circuit.motifCloture}
        </InlineMessage>
      ) : null}
      <ol className="grid gap-2">
        {circuit.etapes.map((etape) => (
          <li key={etape._id} className="grid grid-cols-[32px_minmax(0,1fr)] gap-3 rounded-md border border-line px-3 py-2.5">
            <span className="tabular grid size-8 place-items-center rounded-pill bg-surface-sunk text-[13px] font-bold">{etape.rang}</span>
            <span className="grid gap-1">
              <span className="flex flex-wrap items-center gap-2">
                <b className="text-[14px] font-semibold">{etape.libelle}</b>
                <TagEtape statut={etape.statut} />
              </span>
              <small className="text-[12.5px] text-ink-muted">
                {NATURES_ETAPE[etape.nature]} · {etape.assigne}
                {etape.decideLe ? <> · <span className="tabular">{dateHeure(etape.decideLe)}</span></> : null}
              </small>
              {etape.commentaire ? <p className="text-[13.5px]">« {etape.commentaire} »</p> : null}
            </span>
          </li>
        ))}
      </ol>
      {dossier.actions.peutAnnulerCircuit ? (
        <div>
          <Button type="button" variant="ghost" size="sm" onClick={() => setAnnulation(true)}>
            <Ban />
            Annuler le circuit
          </Button>
        </div>
      ) : null}
      {dossier.circuits.length > 1 ? (
        <details className="text-small text-ink-muted">
          <summary className="min-h-11 cursor-pointer content-center font-semibold">Circuits précédents ({dossier.circuits.length - 1})</summary>
          <ul className="grid gap-1 pt-2">
            {dossier.circuits.slice(1).map((ancien) => (
              <li key={ancien._id}>
                <span className="tabular">{dateHeure(ancien.initieLe)}</span> · {ancien.statut} · {ancien.etapes.map((etape) => `${etape.libelle} (${etape.statut})`).join(" → ")}
                {ancien.motifCloture ? ` — ${ancien.motifCloture}` : ""}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <FenetreFormulaire
        open={annulation}
        onOpenChange={setAnnulation}
        titre="Annuler le circuit"
        description="Les étapes en attente sont annulées et la pièce redevient un brouillon modifiable."
        variante="danger"
        libelleValider="Annuler le circuit"
        enCours={operation.enCours === "annuler"}
        erreur={operation.retour?.ton === "danger" ? operation.retour.detail : null}
        onSubmit={async (donnees) => {
          const resultat = await operation.executer("annuler", () =>
            annuler({ circuitId: circuit._id, motif: String(donnees.get("motif") ?? "") })
          )
          if (resultat) setAnnulation(false)
        }}
      >
        <Field label="Motif" htmlFor="annulation-motif">
          <Textarea id="annulation-motif" name="motif" required minLength={5} maxLength={500} />
        </Field>
      </FenetreFormulaire>
    </div>
  )
}

/* ═══════════════════════════════════════════════ Fenêtres ═══ */

function FenetreVersion({ dossier, open, onOpenChange }: { dossier: Dossier; open: boolean; onOpenChange: (open: boolean) => void }) {
  const ajouter = useMutation(api.modules.ged.mutations.ajouterVersion)
  const televerser = useTeleversement()
  const operation = useOperation()
  return (
    <FenetreFormulaire
      open={open}
      onOpenChange={onOpenChange}
      titre="Déposer une nouvelle version"
      description="La version actuelle reste consultable : rien n'est écrasé."
      libelleValider={
        <>
          <FileUp />
          Déposer la version
        </>
      }
      enCours={operation.enCours === "version"}
      erreur={operation.retour?.ton === "danger" ? operation.retour.detail : null}
      onSubmit={async (donnees) => {
        const fichier = donnees.get("fichier")
        if (!(fichier instanceof File) || fichier.size === 0) {
          operation.signaler({ ton: "danger", titre: "Fichier manquant", detail: "Choisissez le fichier de la nouvelle version." })
          return
        }
        const resultat = await operation.executer("version", async () =>
          ajouter({
            documentId: dossier.document._id,
            fichier: await televerser(fichier),
            commentaire: String(donnees.get("commentaire") ?? "") || undefined,
          })
        )
        if (resultat) onOpenChange(false)
      }}
    >
      <Field label="Fichier" htmlFor="version-fichier">
        <Input id="version-fichier" name="fichier" type="file" accept={TYPES_ACCEPTES.join(",")} className="h-auto py-3" required />
      </Field>
      <Field label="Ce qui change (facultatif)" htmlFor="version-commentaire">
        <Input id="version-commentaire" name="commentaire" maxLength={500} placeholder="Article 2 corrigé après visa juridique" />
      </Field>
    </FenetreFormulaire>
  )
}

function FenetreMetadonnees({ dossier, open, onOpenChange }: { dossier: Dossier; open: boolean; onOpenChange: (open: boolean) => void }) {
  const plan = useQuery(api.modules.ged.queries.planClassement, open ? {} : "skip")
  const modifier = useMutation(api.modules.ged.mutations.modifierMetadonnees)
  const operation = useOperation()
  const d = dossier.document
  return (
    <FenetreFormulaire
      open={open}
      onOpenChange={onOpenChange}
      large
      titre="Modifier les métadonnées"
      libelleValider="Enregistrer"
      enCours={operation.enCours === "metadonnees"}
      erreur={operation.retour?.ton === "danger" ? operation.retour.detail : null}
      onSubmit={async (donnees) => {
        const resultat = await operation.executer("metadonnees", () =>
          modifier({
            documentId: d._id,
            titre: String(donnees.get("titre") ?? ""),
            description: String(donnees.get("description") ?? "") || undefined,
            type: String(donnees.get("type")) as TypeDocument,
            classementId: String(donnees.get("classementId")) as Id<"gedClassement">,
            motsCles: String(donnees.get("motsCles") ?? "").split(/[,;]/).map((mot) => mot.trim()).filter(Boolean),
            classification: String(donnees.get("classification")) as Classification,
            dateDocument: String(donnees.get("dateDocument") ?? ""),
            correspondant: String(donnees.get("correspondant") ?? "") || undefined,
          })
        )
        if (resultat) onOpenChange(false)
      }}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Titre" htmlFor="meta-titre" className="md:col-span-2">
          <Input id="meta-titre" name="titre" defaultValue={d.titre} required minLength={3} maxLength={200} />
        </Field>
        <Field label="Type" htmlFor="meta-type">
          <SelectNative id="meta-type" name="type" defaultValue={d.type}>
            {Object.entries(TYPES_DOCUMENT).map(([cle, libelle]) => (
              <option key={cle} value={cle}>
                {libelle}
              </option>
            ))}
          </SelectNative>
        </Field>
        <Field label="Date de la pièce" htmlFor="meta-date">
          <Input id="meta-date" name="dateDocument" type="date" defaultValue={d.dateDocument} className="tabular" required />
        </Field>
        <Field label="Série" htmlFor="meta-serie" className="md:col-span-2">
          <SelectNative id="meta-serie" name="classementId" defaultValue={dossier.classement?._id ?? ""} required>
            {(plan?.series ?? (dossier.classement ? [{ _id: dossier.classement._id, code: dossier.classement.code, libelle: dossier.classement.libelle, actif: true }] : []))
              .filter((serie) => serie.actif)
              .map((serie) => (
                <option key={serie._id} value={serie._id}>
                  {serie.code} — {serie.libelle}
                </option>
              ))}
          </SelectNative>
        </Field>
        <Field label="Classification" htmlFor="meta-classification">
          <SelectNative id="meta-classification" name="classification" defaultValue={d.classification}>
            {Object.entries(CLASSIFICATIONS).map(([cle, definition]) => (
              <option key={cle} value={cle}>
                {definition.libelle}
              </option>
            ))}
          </SelectNative>
        </Field>
        <Field label="Correspondant" htmlFor="meta-correspondant">
          <Input id="meta-correspondant" name="correspondant" defaultValue={d.correspondant ?? ""} maxLength={200} />
        </Field>
        <Field label="Mots-clés" htmlFor="meta-mots" className="md:col-span-2">
          <Input id="meta-mots" name="motsCles" defaultValue={d.motsCles.join(", ")} />
        </Field>
        <Field label="Description" htmlFor="meta-description" className="md:col-span-2">
          <Textarea id="meta-description" name="description" defaultValue={d.description ?? ""} maxLength={2000} />
        </Field>
      </div>
    </FenetreFormulaire>
  )
}

function FenetreAcces({ dossier, open, onOpenChange }: { dossier: Dossier; open: boolean; onOpenChange: (open: boolean) => void }) {
  const definir = useMutation(api.modules.ged.mutations.definirAcces)
  const operation = useOperation()
  const [acces, setAcces] = useState<Acces[]>(() =>
    (dossier.acces ?? []).map((entree) => ({
      userId: entree.userId ?? undefined,
      role: entree.role ?? undefined,
      droit: entree.droit,
      libelle: entree.nom ?? (entree.role ? (ROLE_LABELS[entree.role] ?? entree.role) : "—"),
    }))
  )
  return (
    <FenetreFormulaire
      open={open}
      onOpenChange={onOpenChange}
      large
      titre="Accès à la pièce"
      description={`Classification : ${CLASSIFICATIONS[dossier.document.classification].libelle}. Les accès ci-dessous s'ajoutent à la règle de classification.`}
      libelleValider={
        <>
          <KeyRound />
          Enregistrer les accès
        </>
      }
      enCours={operation.enCours === "acces"}
      erreur={operation.retour?.ton === "danger" ? operation.retour.detail : null}
      onSubmit={async () => {
        const resultat = await operation.executer("acces", () =>
          definir({
            documentId: dossier.document._id,
            acces: acces.map((entree) => ({
              ...(entree.userId ? { userId: entree.userId } : { role: entree.role as AppRole }),
              droit: entree.droit,
            })),
          })
        )
        if (resultat) onOpenChange(false)
      }}
    >
      <EditeurAcces acces={acces} onChange={setAcces} />
      {acces.some((entree) => entree.role && !isInternalRole(entree.role as AppRole)) ? (
        <InlineMessage tone="warning" title="Fonction externe.">
          Seules les fonctions internes peuvent recevoir un accès.
        </InlineMessage>
      ) : null}
    </FenetreFormulaire>
  )
}

/* ═══════════════════════════════════════════════ Écran ═══ */

const colonnesVersions = (ouvrir: ReturnType<typeof useOuvertureFichier>, actif: boolean): ColonneTableau<Version>[] => [
  { cle: "numero", libelle: "Version", rendu: (v) => <span className="tabular font-semibold">v{v.numero}</span>, tri: (v) => v.numero, numerique: true },
  { cle: "fichier", libelle: "Fichier", rendu: (v) => <span className="break-all">{v.nomFichier}</span>, tri: (v) => v.nomFichier },
  { cle: "taille", libelle: "Taille", rendu: (v) => <span className="tabular">{taille(v.taille)}</span>, tri: (v) => v.taille, numerique: true, secondaire: true },
  { cle: "depot", libelle: "Déposée", rendu: (v) => <span className="tabular">{dateHeure(v.deposeLe)}</span>, tri: (v) => v.deposeLe },
  { cle: "par", libelle: "Par", rendu: (v) => v.deposePar, tri: (v) => v.deposePar, secondaire: true },
  { cle: "empreinte", libelle: "Empreinte SHA-256", rendu: (v) => <span className="tabular text-[12px] break-all text-ink-muted">{v.sha256.slice(0, 16)}…</span>, export: (v) => v.sha256, secondaire: true },
  {
    cle: "actions",
    libelle: "Ouvrir",
    rendu: (v) =>
      actif ? (
        <span className="flex gap-1">
          {v.apercu ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => void ouvrir.lancer("apercu", v.numero)} loading={ouvrir.enCours === `apercu-${v.numero}`}>
              <Eye />
              Aperçu
            </Button>
          ) : null}
          <BoutonTelecharger onClick={() => void ouvrir.lancer("telechargement", v.numero)} enCours={ouvrir.enCours === `telechargement-${v.numero}`} />
        </span>
      ) : (
        <span className="text-small text-ink-muted">Détruit</span>
      ),
    export: false,
  },
]

const colonnesConsultations: ColonneTableau<Consultation>[] = [
  { cle: "at", libelle: "Quand", rendu: (c) => <span className="tabular">{horodatage(c.at)}</span>, tri: (c) => c.at },
  { cle: "qui", libelle: "Qui", rendu: (c) => c.nom, tri: (c) => c.nom },
  {
    cle: "nature",
    libelle: "Consultation",
    rendu: (c) => `${NATURES_CONSULTATION[c.nature]}${c.versionNumero ? ` · v${c.versionNumero}` : ""}`,
    tri: (c) => c.nature,
    export: (c) => NATURES_CONSULTATION[c.nature],
  },
]

export function DocumentDetail({ documentId }: { documentId: string }) {
  const reponse = useQuery(api.modules.ged.queries.document, { documentId: documentId as Id<"gedDocuments"> })
  const journaliser = useMutation(api.modules.ged.mutations.journaliserConsultation)
  const dejaJournalise = useRef(false)
  useEffect(() => {
    if (reponse?.etat === "ok" && !dejaJournalise.current) {
      dejaJournalise.current = true
      void journaliser({ documentId: reponse.document._id }).catch(() => undefined)
    }
  }, [reponse, journaliser])

  if (reponse === undefined) {
    return (
      <CadreGed titre="Pièce" retour={{ href: "/bureautique/documents", libelle: "Documents" }}>
        <SkeletonLines />
      </CadreGed>
    )
  }
  if (reponse.etat !== "ok") {
    return (
      <CadreGed titre="Pièce" retour={{ href: "/bureautique/documents", libelle: "Documents" }}>
        <InlineMessage tone="warning" title={reponse.etat === "introuvable" ? "Cette pièce n'existe pas." : "Accès refusé."}>
          {reponse.etat === "introuvable"
            ? "Le lien est peut-être erroné, ou la pièce a été supprimée du jeu de démonstration."
            : "Cette pièce est confidentielle ou restreinte : demandez à son auteur de vous y donner accès."}
        </InlineMessage>
      </CadreGed>
    )
  }
  return <FicheDocument dossier={reponse} />
}

function FicheDocument({ dossier }: { dossier: Dossier }) {
  const d = dossier.document
  const ouvrir = useOuvertureFichier(d._id)
  const operation = useOperation()
  const accuser = useMutation(api.modules.ged.mutations.accuserLecture)
  const commenter = useMutation(api.modules.ged.mutations.commenter)
  const archiver = useMutation(api.modules.ged.mutations.archiverDocument)
  const eliminer = useMutation(api.modules.ged.mutations.eliminerDocument)
  const [fenetre, setFenetre] = useState<null | "circuit" | "version" | "metadonnees" | "acces" | "archiver" | "eliminer">(null)
  const [commentaire, setCommentaire] = useState("")
  const a = dossier.actions
  const versionCourante = dossier.versions[0]
  const fichierActif = d.statut !== "elimine"
  // Un seul bouton principal : la décision attendue d'abord, puis l'accusé, puis le circuit.
  const principal = a.etapeAMoi ? "decision" : a.peutAccuser ? "accuser" : a.peutSoumettre ? "circuit" : null

  return (
    <CadreGed
      titre={d.titre}
      titreDossier={d.reference}
      retour={{ href: "/bureautique/documents", libelle: "Documents" }}
      description={
        <span className="flex flex-wrap items-center gap-2">
          <span className="tabular font-semibold text-ink">{d.reference}</span>
          <span>· {TYPES_DOCUMENT[d.type]}</span>
          {dossier.classement ? <span>· {dossier.classement.code} — {dossier.classement.libelle}</span> : null}
        </span>
      }
      actions={
        <>
          {a.peutModifier ? (
            <Button type="button" variant="secondary" onClick={() => setFenetre("metadonnees")}>
              <PenLine />
              Modifier
            </Button>
          ) : null}
          {a.peutModifier ? (
            <Button type="button" variant="secondary" onClick={() => setFenetre("version")}>
              <FileUp />
              Nouvelle version
            </Button>
          ) : null}
          {a.peutSoumettre ? (
            <Button type="button" variant={principal === "circuit" ? "primary" : "secondary"} onClick={() => setFenetre("circuit")}>
              <Workflow />
              Lancer le circuit
            </Button>
          ) : null}
          {a.peutAccuser ? (
            <Button
              type="button"
              variant={principal === "accuser" ? "primary" : "secondary"}
              loading={operation.enCours === "accuser"}
              onClick={() => void operation.executer("accuser", () => accuser({ documentId: d._id }), "Lecture enregistrée.")}
            >
              <CheckCheck />
              J’ai lu cette note
            </Button>
          ) : null}
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <TagStatutDocument statut={d.statut} />
        <TagClassification classification={d.classification} />
        <TagDemo origine={d.origine} />
        {dossier.monAccuse ? (
          <small className="text-[12.5px] text-success-ink">
            Lu le <span className="tabular">{dateHeure(dossier.monAccuse)}</span>
          </small>
        ) : null}
      </div>
      <RetourOperation retour={operation.retour} />
      {d.statut === "refuse" && a.peutModifier ? (
        <InlineMessage tone="warning" title="Pièce refusée.">
          Corrigez-la (nouvelle version ou métadonnées), puis relancez le circuit.
        </InlineMessage>
      ) : null}

      {a.etapeAMoi ? <PanneauDecision dossier={dossier} /> : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.6fr)]">
        <div className="grid content-start gap-5">
          <Panneau
            titre="Fichier"
            icone={FileText}
            sousTitre={versionCourante ? `Version ${versionCourante.numero} · ${taille(versionCourante.taille)}` : "Aucun fichier"}
            actions={
              versionCourante && fichierActif ? (
                <>
                  {versionCourante.apercu ? (
                    <Button type="button" variant="secondary" size="sm" onClick={() => void ouvrir.lancer("apercu")} loading={ouvrir.enCours === "apercu-courante"}>
                      <Eye />
                      Aperçu
                    </Button>
                  ) : null}
                  <BoutonTelecharger onClick={() => void ouvrir.lancer("telechargement")} enCours={ouvrir.enCours === "telechargement-courante"} />
                </>
              ) : null
            }
          >
            {ouvrir.erreur ? <InlineMessage tone="danger" title="Ouverture refusée.">{ouvrir.erreur}</InlineMessage> : null}
            {!versionCourante ? (
              <p className="text-small text-ink-muted">
                Aucun fichier déposé{d.origine === "demo" ? " : pièce de démonstration décrite par ses seules métadonnées." : "."}
                {a.peutModifier ? " Déposez une version pour pouvoir lancer un circuit." : ""}
              </p>
            ) : !fichierActif ? (
              <p className="text-small text-ink-muted">Fichiers détruits en fin de conservation ; les empreintes restent comme preuve.</p>
            ) : (
              <p className="text-small text-ink-muted">
                {versionCourante.nomFichier}, déposé par {versionCourante.deposePar} le <span className="tabular">{dateHeure(versionCourante.deposeLe)}</span>.
                Chaque ouverture est inscrite au journal de consultation.
              </p>
            )}
            {dossier.versions.length > 0 ? (
              <TableauDonnees
                libelle="Versions"
                colonnes={colonnesVersions(ouvrir, fichierActif)}
                lignes={dossier.versions}
                cle={(v) => String(v.numero)}
                exportNom={`${d.reference}-versions`}
                parPage={10}
                vide={{ titre: "Aucune version" }}
              />
            ) : null}
          </Panneau>

          <Panneau titre="Circuit de validation" icone={Workflow} id="circuit">
            <SectionCircuit dossier={dossier} />
          </Panneau>

          <Panneau titre="Échanges sur la pièce" icone={MessageSquare} sousTitre={`${dossier.commentaires.length} message(s)`}>
            {dossier.commentaires.length === 0 ? (
              <p className="text-small text-ink-muted">Aucun échange. Les commentaires sont visibles de tous ceux qui ont accès à la pièce.</p>
            ) : (
              <ul className="grid gap-3">
                {dossier.commentaires.map((message) => (
                  <li key={message._id} className="grid gap-1 rounded-md border border-line px-3 py-2.5">
                    <small className="text-[12.5px] text-ink-muted">
                      <b className="font-semibold text-ink">{message.auteur}</b> · <span className="tabular">{dateHeure(message.createdAt)}</span>
                    </small>
                    <p className="text-[14px] whitespace-pre-wrap">{message.texte}</p>
                  </li>
                ))}
              </ul>
            )}
            {a.peutCommenter ? (
              <form
                className="grid gap-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  void operation
                    .executer("commenter", () => commenter({ documentId: d._id, texte: commentaire }))
                    .then((resultat) => {
                      if (resultat) setCommentaire("")
                    })
                }}
              >
                <Field label="Votre message">
                  <Textarea value={commentaire} onChange={(event) => setCommentaire(event.target.value)} maxLength={2000} />
                </Field>
                <div>
                  <Button type="submit" variant="secondary" size="sm" disabled={commentaire.trim().length < 2} loading={operation.enCours === "commenter"}>
                    <Send />
                    Publier
                  </Button>
                </div>
              </form>
            ) : null}
          </Panneau>
        </div>

        <div className="grid content-start gap-5">
          <Panneau titre="Fiche">
            <Fiche
              elements={[
                ["Référence", <span key="r" className="tabular">{d.reference}</span>],
                ["Type", TYPES_DOCUMENT[d.type]],
                ["Direction", libelleDirection(d.direction)],
                ["Date de la pièce", <span key="d" className="tabular">{jour(d.dateDocument)}</span>],
                d.correspondant ? ["Correspondant", d.correspondant] : null,
                ["Auteur", d.auteur],
                ["Version", <span key="v" className="tabular">v{d.versionCourante}</span>],
                ["Enregistrée", <span key="c" className="tabular">{dateHeure(d.createdAt)}</span>],
                d.motsCles.length ? ["Mots-clés", d.motsCles.join(", ")] : null,
              ]}
            />
            {d.description ? <p className="text-[14px] text-ink-muted">{d.description}</p> : null}
          </Panneau>

          <Panneau titre="Conservation" icone={Archive}>
            <Fiche
              elements={[
                [
                  "Durée",
                  dossier.classement
                    ? dossier.classement.conservationAnnees === null
                      ? "Définitive"
                      : `${dossier.classement.conservationAnnees} ans`
                    : "—",
                ],
                ["Jusqu'au", dossier.conservation.jusquau ? <span key="j" className="tabular">{jour(dossier.conservation.jusquau)}</span> : "Sans limite"],
                ["Sort final", dossier.classement ? { destruction: "Destruction", conservation_definitive: "Conservation définitive", tri: "Tri" }[dossier.classement.sortFinal] : "—"],
              ]}
            />
            {dossier.classement ? (
              <p className="text-[12.5px] text-ink-muted">
                Base : {dossier.classement.baseConservation}
                {dossier.classement.aValider ? " — durée à confirmer par la Direction juridique." : ""}
              </p>
            ) : null}
            {dossier.conservation.echue ? (
              <Encart icone={Trash2} titre="Conservation échue" ton="vigilance">
                La pièce peut être éliminée par un gestionnaire habilité ; la fiche et les empreintes restent.
              </Encart>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {a.peutArchiver ? (
                <Button type="button" variant="secondary" size="sm" onClick={() => setFenetre("archiver")}>
                  <Archive />
                  Archiver
                </Button>
              ) : null}
              {a.peutEliminer ? (
                <Button type="button" variant="danger" size="sm" onClick={() => setFenetre("eliminer")}>
                  <Trash2 />
                  Éliminer
                </Button>
              ) : null}
            </div>
          </Panneau>

          <Panneau
            titre="Accès"
            icone={KeyRound}
            actions={
              a.peutGererAcces ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => setFenetre("acces")}>
                  Gérer
                </Button>
              ) : null
            }
          >
            <p className="text-small text-ink-muted">
              {CLASSIFICATIONS[d.classification].libelle} :{" "}
              {d.classification === "public" || d.classification === "interne"
                ? "tout lecteur du module."
                : d.classification === "confidentiel"
                  ? "auteur, intervenants, accès désignés et gestionnaires documentaires."
                  : "auteur, intervenants et personnes nommées seulement."}
            </p>
            {dossier.acces === null ? null : dossier.acces.length === 0 ? (
              <p className="text-small text-ink-muted">Aucun accès particulier.</p>
            ) : (
              <ul className="grid gap-1 text-[14px]">
                {dossier.acces.map((entree) => (
                  <li key={entree._id}>
                    <b className="font-semibold">{entree.nom ?? (entree.role ? (ROLE_LABELS[entree.role] ?? entree.role) : "—")}</b>{" "}
                    <small className="text-ink-muted">{entree.droit === "edition" ? "édition" : "lecture"}</small>
                  </li>
                ))}
              </ul>
            )}
          </Panneau>

          {dossier.accuses ? (
            <Panneau titre="Diffusion et lectures" icone={Megaphone}>
              <Fiche
                elements={[
                  ["Audience", dossier.accuses.audience],
                  ["Diffusée", d.diffusion ? <span key="dl" className="tabular">{dateHeure(d.diffusion.diffuseLe)}</span> : "—"],
                  ["Par", d.diffusion?.diffusePar ?? "—"],
                  ["Lectures", <span key="lu" className="tabular">{dossier.accuses.lus} / {dossier.accuses.destinataires}</span>],
                ]}
              />
              {d.diffusion && !d.diffusion.tousLesAgents && d.diffusion.roles.length > 0 ? (
                <p className="text-[12.5px] text-ink-muted">{d.diffusion.roles.map((role) => ROLE_LABELS[role] ?? role).join(", ")}</p>
              ) : null}
              {dossier.accuses.liste ? (
                <TableauDonnees
                  libelle="Accusés de lecture"
                  colonnes={[
                    { cle: "nom", libelle: "Agent", rendu: (l) => l.nom, tri: (l) => l.nom },
                    { cle: "lu", libelle: "Lu le", rendu: (l) => <span className="tabular">{dateHeure(l.luLe)}</span>, tri: (l) => l.luLe },
                  ]}
                  lignes={dossier.accuses.liste}
                  cle={(l) => `${l.nom}-${l.luLe}`}
                  exportNom={`${d.reference}-accuses`}
                  parPage={8}
                  vide={{ titre: "Aucune lecture", description: "Personne n'a encore accusé lecture." }}
                />
              ) : null}
            </Panneau>
          ) : null}

          {dossier.consultations ? (
            <Panneau titre="Journal de consultation" icone={History}>
              <TableauDonnees
                libelle="Journal de consultation"
                colonnes={colonnesConsultations}
                lignes={dossier.consultations}
                cle={(c) => c._id}
                exportNom={`${d.reference}-consultations`}
                parPage={8}
                vide={{ titre: "Aucune consultation" }}
              />
            </Panneau>
          ) : null}

          <Panneau titre="Chronologie" icone={History}>
            <Chronologie
              evenements={dossier.chronologie.map((evenement) => ({
                cle: evenement.cle,
                heure: dateHeure(evenement.at),
                titre: evenement.titre,
                detail: evenement.detail,
              }))}
            />
          </Panneau>
        </div>
      </div>

      <FenetreApercu apercu={ouvrir.apercu} onClose={ouvrir.fermer} />
      {fenetre === "circuit" ? <FenetreCircuit dossier={dossier} open onOpenChange={(ouvert) => setFenetre(ouvert ? "circuit" : null)} /> : null}
      {fenetre === "version" ? <FenetreVersion dossier={dossier} open onOpenChange={(ouvert) => setFenetre(ouvert ? "version" : null)} /> : null}
      {fenetre === "metadonnees" ? (
        <FenetreMetadonnees dossier={dossier} open onOpenChange={(ouvert) => setFenetre(ouvert ? "metadonnees" : null)} />
      ) : null}
      {fenetre === "acces" ? <FenetreAcces dossier={dossier} open onOpenChange={(ouvert) => setFenetre(ouvert ? "acces" : null)} /> : null}
      <FenetreFormulaire
        open={fenetre === "archiver"}
        onOpenChange={(ouvert) => setFenetre(ouvert ? "archiver" : null)}
        titre="Verser aux archives"
        description="La pièce devient immuable jusqu'à la fin de sa durée de conservation."
        libelleValider={
          <>
            <Archive />
            Archiver
          </>
        }
        enCours={operation.enCours === "archiver"}
        erreur={operation.retour?.ton === "danger" ? operation.retour.detail : null}
        onSubmit={async (donnees) => {
          const resultat = await operation.executer(
            "archiver",
            () => archiver({ documentId: d._id, motif: String(donnees.get("motif") ?? "") || undefined }),
            "Pièce archivée."
          )
          if (resultat) setFenetre(null)
        }}
      >
        <Field label="Motif (facultatif)" htmlFor="archive-motif">
          <Input id="archive-motif" name="motif" maxLength={500} />
        </Field>
      </FenetreFormulaire>
      <FenetreFormulaire
        open={fenetre === "eliminer"}
        onOpenChange={(ouvert) => setFenetre(ouvert ? "eliminer" : null)}
        titre="Éliminer la pièce"
        description="Les fichiers sont détruits définitivement. La fiche, l'empreinte de chaque version et le motif restent au registre."
        variante="danger"
        libelleValider="Éliminer définitivement"
        enCours={operation.enCours === "eliminer"}
        erreur={operation.retour?.ton === "danger" ? operation.retour.detail : null}
        onSubmit={async (donnees) => {
          const resultat = await operation.executer(
            "eliminer",
            () => eliminer({ documentId: d._id, motif: String(donnees.get("motif") ?? "") }),
            "Pièce éliminée : fichiers détruits."
          )
          if (resultat) setFenetre(null)
        }}
      >
        <Field label="Motif et référence du bordereau d'élimination" htmlFor="elimination-motif">
          <Textarea id="elimination-motif" name="motif" required minLength={5} maxLength={500} />
        </Field>
      </FenetreFormulaire>
    </CadreGed>
  )
}

