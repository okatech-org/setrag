"use client"

import type { FunctionReturnType } from "convex/server"
import { RefreshCw, ShieldCheck, UserPlus } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { accessibleResources, permissionsFor, type AppRole } from "@workspace/backend/permissions"
import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Avatar } from "@workspace/ui/components/avatar"
import { Button } from "@workspace/ui/components/button"
import { Field, Input, SelectNative } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import { CelluleDouble, TableauDonnees, type ColonneTableau } from "@/components/charte"
import { portalForRole } from "@/lib/portal-access"
import { ROLE_LABELS } from "@/lib/roles"

import { CadreGestion, mentionLectureSeule } from "./cadre"
import { useDroitsGestion } from "./droits"
import { MatriceDroits, ROLES_INTERNES } from "./droits-matrice"
import { Onglets, RetourOperation, SelectFiltre, useOperation } from "./elements"
import { dateHeure, nombre } from "./format"
import { FenetreFormulaire, texte } from "./formulaire"
import { ETATS_COMPTE, Pastille, TagCompte } from "./statuts"

type Vue = FunctionReturnType<typeof api.functions.referentiels.comptes>
type Compte = Vue["comptes"][number]

export const SECOND_FACTEUR = {
  application: { libelle: "Application", ton: "success" },
  fido2: { libelle: "Clé FIDO2", ton: "success" },
  sms: { libelle: "SMS", ton: "success" },
  aucun: { libelle: "Non enrôlé", ton: "warning" },
} as const

export function TagSecondFacteur({ valeur }: { valeur: keyof typeof SECOND_FACTEUR | null }) {
  if (!valeur) return <span className="text-[13px] text-ink-muted">Non synchronisé</span>
  const def = SECOND_FACTEUR[valeur]
  return <Pastille ton={def.ton}>{def.libelle}</Pastille>
}

const libelleRole = (role: AppRole) => ROLE_LABELS[role].split(" — ")[0]!

const colonnes: ColonneTableau<Compte>[] = [
  {
    cle: "utilisateur",
    libelle: "Utilisateur",
    rendu: (c) => (
      <span className="flex min-w-0 items-center gap-2.5">
        <Avatar name={c.nom} size="sm" />
        <CelluleDouble haut={c.nom} bas={[c.matricule, c.email].filter(Boolean).join(" · ") || "—"} />
      </span>
    ),
    tri: (c) => c.nom,
    export: (c) => `${c.nom}${c.matricule ? ` (${c.matricule})` : ""}${c.email ? ` <${c.email}>` : ""}`,
  },
  { cle: "role", libelle: "Rôle", rendu: (c) => libelleRole(c.role), tri: (c) => libelleRole(c.role) },
  { cle: "rattachement", libelle: "Rattachement", rendu: (c) => (c.pointOfSale ? `${c.pointOfSale.code} · ${c.pointOfSale.name}` : "Réseau"), tri: (c) => c.pointOfSale?.code ?? "", secondaire: true },
  { cle: "mfa", libelle: "Second facteur", rendu: (c) => <TagSecondFacteur valeur={c.secondFactor} />, tri: (c) => c.secondFactor ?? "", export: (c) => (c.secondFactor ? SECOND_FACTEUR[c.secondFactor].libelle : "Non synchronisé"), secondaire: true },
  { cle: "acces", libelle: "Dernier accès", rendu: (c) => <span className="tabular">{dateHeure(c.lastSeenAt)}</span>, tri: (c) => c.lastSeenAt ?? 0, secondaire: true },
  { cle: "etat", libelle: "État", rendu: (c) => <TagCompte etat={c.etat} />, tri: (c) => ["actif", "invite", "suspendu"].indexOf(c.etat), export: (c) => ETATS_COMPTE[c.etat].libelle },
]

function DialogueInvitation({ open, onOpenChange, roleActeur }: { open: boolean; onOpenChange: (open: boolean) => void; roleActeur?: AppRole }) {
  const router = useRouter()
  const points = useQuery(api.functions.management.listPointsOfSale, open ? {} : "skip")
  const inviter = useMutation(api.functions.referentiels.inviterUtilisateur)
  const operation = useOperation()
  const roles = ROLES_INTERNES.filter((role) => role !== "admin_it" || roleActeur === "admin_it")
  return (
    <FenetreFormulaire
      open={open}
      onOpenChange={onOpenChange}
      titre="Inviter un utilisateur"
      description="Le profil (rôle, rattachement) est prêt dès l'invitation ; l'agent s'y connecte avec son identité de l'annuaire Eramet. Les droits découlent du rôle."
      libelleValider={
        <>
          <UserPlus />
          Inviter
        </>
      }
      enCours={operation.enCours === "inviter"}
      erreur={operation.retour?.ton === "danger" ? operation.retour.detail : null}
      onSubmit={async (donnees) => {
        const id = await operation.executer("inviter", () =>
          inviter({
            email: String(donnees.get("email") ?? ""),
            firstName: String(donnees.get("firstName") ?? ""),
            lastName: String(donnees.get("lastName") ?? ""),
            phone: texte(donnees, "phone"),
            matricule: texte(donnees, "matricule"),
            role: String(donnees.get("role")),
            pointOfSaleId: texte(donnees, "pointOfSaleId") as never,
          })
        )
        if (id) {
          onOpenChange(false)
          router.push(`/gestion/utilisateurs/${id}`)
        }
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Prénom" htmlFor="inv-prenom">
          <Input id="inv-prenom" name="firstName" required autoComplete="off" />
        </Field>
        <Field label="Nom" htmlFor="inv-nom">
          <Input id="inv-nom" name="lastName" required autoComplete="off" />
        </Field>
      </div>
      <Field label="Adresse e-mail professionnelle" htmlFor="inv-email">
        <Input id="inv-email" name="email" type="email" required placeholder="prenom.nom@setrag.ga" autoComplete="off" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Matricule" htmlFor="inv-matricule">
          <Input id="inv-matricule" name="matricule" placeholder="V-133" className="tabular uppercase" />
        </Field>
        <Field label="Téléphone (facultatif)" htmlFor="inv-tel">
          <Input id="inv-tel" name="phone" type="tel" className="tabular" />
        </Field>
      </div>
      <Field label="Rôle" htmlFor="inv-role">
        <SelectNative id="inv-role" name="role" defaultValue="vendeur_guichet">
          {roles.map((role) => (
            <option key={role} value={role}>
              {ROLE_LABELS[role]}
            </option>
          ))}
        </SelectNative>
      </Field>
      <Field label="Point de vente" hint="Obligatoire pour un vendeur." htmlFor="inv-pdv">
        <SelectNative id="inv-pdv" name="pointOfSaleId" defaultValue="">
          <option value="">Aucun (réseau)</option>
          {points?.map(({ pointOfSale }) => (
            <option key={pointOfSale._id} value={pointOfSale._id} disabled={!pointOfSale.isActive}>
              {pointOfSale.code} · {pointOfSale.name}
              {pointOfSale.isActive ? "" : " · suspendu"}
            </option>
          ))}
        </SelectNative>
      </Field>
    </FenetreFormulaire>
  )
}

interface LigneRole {
  role: AppRole
  comptes: number
  ressources: number
  ecriture: number
}

export function UtilisateursDroits() {
  const droits = useDroitsGestion()
  const vue = useQuery(api.functions.referentiels.comptes, droits.may("utilisateurs") ? {} : "skip")
  const synchroniser = useMutation(api.functions.referentiels.synchroniserAnnuaire)
  const operation = useOperation()
  const [onglet, setOnglet] = useState<"comptes" | "matrice" | "roles">("comptes")
  const [role, setRole] = useState("tous")
  const [etat, setEtat] = useState("tous")
  const [invitation, setInvitation] = useState(false)
  const [rolesMatrice, setRolesMatrice] = useState<AppRole[] | null>(null)

  const comptes = vue?.comptes.filter((c) => (role === "tous" || c.role === role) && (etat === "tous" || c.etat === etat))
  const lignesRoles: LigneRole[] = ROLES_INTERNES.map((r) => ({
    role: r,
    comptes: vue?.comptes.filter((c) => c.role === r).length ?? 0,
    ressources: accessibleResources(r).length,
    ecriture: accessibleResources(r).filter((res) => permissionsFor(r, res).some((p) => p !== "consulter")).length,
  }))
  const derniere = vue?.annuaire.derniereSynchronisation

  return (
    <CadreGestion
      surtitre="Supervision · habilitations"
      titre="Utilisateurs et droits"
      description="Les comptes viennent de l'annuaire Eramet (Entra ID). Ici, on attribue un rôle et un point de vente ; les droits découlent du rôle, séparés en consulter, créer, modifier, supprimer, valider."
      lectureSeule={!droits.chargement && !droits.may("utilisateurs", "modifier") ? mentionLectureSeule(droits.role, "les comptes") : undefined}
      actions={
        <>
          {droits.may("utilisateurs", "modifier") ? (
            <Button
              type="button"
              variant="secondary"
              loading={operation.enCours === "synchroniser"}
              loadingLabel="Synchronisation…"
              onClick={() =>
                void operation.executer(
                  "synchroniser",
                  () => synchroniser({}),
                  (r) => `Annuaire ${r.simule ? "simulé" : ""} : ${r.synchronises} compte(s) synchronisé(s), ${r.sansSecondFacteur} sans second facteur, ${r.locaux} compte(s) local(aux) non concerné(s).`
                )
              }
            >
              <RefreshCw />
              Synchroniser l’annuaire
            </Button>
          ) : null}
          {droits.may("utilisateurs", "creer") ? (
            <Button type="button" onClick={() => setInvitation(true)}>
              <UserPlus />
              Inviter un utilisateur
            </Button>
          ) : null}
        </>
      }
    >
      {vue?.annuaire.simule ? (
        <InlineMessage tone="info" title="Annuaire Entra ID simulé.">
          L’annuaire Eramet n’est pas encore raccordé (URL, jeton et contrat de données attendus de la DSI) : la synchronisation est simulée et le dit dans le journal.
          {derniere ? ` Dernière synchronisation le ${dateHeure(derniere.at)}${derniere.par ? ` par ${derniere.par.court}` : ""}.` : " Aucune synchronisation à ce jour."}
        </InlineMessage>
      ) : null}
      <RetourOperation retour={operation.retour} />
      <Onglets
        libelle="Habilitations"
        valeur={onglet}
        onChange={setOnglet}
        onglets={[
          { cle: "comptes", libelle: "Comptes", compte: vue?.comptes.length },
          { cle: "matrice", libelle: "Matrice des droits" },
          { cle: "roles", libelle: "Rôles", compte: ROLES_INTERNES.length },
        ]}
      />
      <div role="tabpanel">
        {onglet === "comptes" ? (
          <TableauDonnees
            libelle="Comptes du personnel"
            colonnes={colonnes}
            lignes={comptes}
            cle={(c) => c._id}
            lien={(c) => `/gestion/utilisateurs/${c._id}`}
            recherche={{ placeholder: "Nom, matricule, e-mail…", texte: (c) => `${c.nom} ${c.matricule ?? ""} ${c.email ?? ""} ${c.pointOfSale?.code ?? ""}` }}
            filtres={
              <>
                <SelectFiltre libelle="Rôle" value={role} onChange={setRole} className="max-w-[260px]">
                  <option value="tous">Tous les rôles</option>
                  {ROLES_INTERNES.map((r) => (
                    <option key={r} value={r}>
                      {libelleRole(r)}
                    </option>
                  ))}
                </SelectFiltre>
                <SelectFiltre libelle="État" value={etat} onChange={setEtat}>
                  <option value="tous">Tous les états</option>
                  {Object.entries(ETATS_COMPTE).map(([cle, def]) => (
                    <option key={cle} value={cle}>
                      {def.libelle}
                    </option>
                  ))}
                </SelectFiltre>
              </>
            }
            exportNom="comptes"
            triInitial={{ cle: "utilisateur", sens: "asc" }}
            vide={{ titre: "Aucun compte", description: "Invitez un agent ou synchronisez l'annuaire." }}
          />
        ) : onglet === "matrice" ? (
          <MatriceDroits key={rolesMatrice?.join() ?? "defaut"} rolesInitiaux={rolesMatrice ?? undefined} />
        ) : (
          <TableauDonnees
            libelle="Rôles"
            colonnes={[
              { cle: "role", libelle: "Rôle", rendu: (l: LigneRole) => <CelluleDouble haut={libelleRole(l.role)} bas={<span className="tabular">{l.role}</span>} />, tri: (l) => libelleRole(l.role) },
              { cle: "portail", libelle: "Portail", rendu: (l) => (portalForRole(l.role) === "vente" ? "Vente" : "Gestion"), tri: (l) => portalForRole(l.role) ?? "", secondaire: true },
              { cle: "comptes", libelle: "Comptes", rendu: (l) => nombre(l.comptes), tri: (l) => l.comptes, numerique: true },
              { cle: "ressources", libelle: "Ressources", rendu: (l) => l.ressources, tri: (l) => l.ressources, numerique: true, secondaire: true },
              { cle: "ecriture", libelle: "Dont en écriture", rendu: (l) => l.ecriture, tri: (l) => l.ecriture, numerique: true },
            ]}
            lignes={lignesRoles}
            cle={(l) => l.role}
            surLigne={(l) => {
              setRolesMatrice([l.role])
              setOnglet("matrice")
            }}
            recherche={{ placeholder: "Rôle…", texte: (l) => `${ROLE_LABELS[l.role]} ${l.role}` }}
            exportNom="roles"
            triInitial={{ cle: "comptes", sens: "desc" }}
            vide={{ titre: "Aucun rôle" }}
          />
        )}
      </div>
      {onglet === "roles" ? (
        <p className="flex items-center gap-1.5 text-[12.5px] text-ink-muted">
          <ShieldCheck aria-hidden className="size-4" />
          Choisissez un rôle pour afficher ses droits dans la matrice.
        </p>
      ) : null}
      <DialogueInvitation open={invitation} onOpenChange={setInvitation} roleActeur={droits.role} />
    </CadreGestion>
  )
}
