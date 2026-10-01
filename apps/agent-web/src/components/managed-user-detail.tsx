"use client"

import { History, KeyRound, Power, Save, ShieldCheck, UserRound } from "lucide-react"

import { permissionsFor, type AppRole } from "@workspace/backend/permissions"
import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { SkeletonLines } from "@workspace/ui/components/empty-state"
import { Field, Input, SelectNative } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import { Fiche, LienBouton, Panneau } from "@/components/charte"
import { ROLE_LABELS } from "@/lib/roles"
import { useDroitsGestion } from "./gestion/referentiels/droits"
import { CelluleDroits, LIBELLES_RESSOURCES, RESSOURCES_METIER, ROLES_INTERNES } from "./gestion/referentiels/droits-matrice"
import { Historique, RetourOperation, useOperation } from "./gestion/referentiels/elements"
import { agent, dateHeure } from "./gestion/referentiels/format"
import { texte } from "./gestion/referentiels/formulaire"
import { libelleAction } from "./gestion/referentiels/libelles-audit"
import { TagCompte } from "./gestion/referentiels/statuts"
import { TagSecondFacteur } from "./gestion/referentiels/utilisateurs"
import { ManagementDetailShell } from "./management-detail-shell"

export function ManagedUserDetail({ userId }: { userId: string }) {
  const droits = useDroitsGestion()
  const dossier = useQuery(api.functions.referentiels.compte, { userId: userId as never })
  const points = useQuery(api.functions.management.listPointsOfSale, droits.may("referentiel") ? {} : "skip")
  const modifier = useMutation(api.functions.administration.updateManagedUser)
  const changerEtat = useMutation(api.functions.administration.setManagedUserStatus)
  const operation = useOperation()

  if (dossier === undefined || dossier === null) {
    return (
      <ManagementDetailShell title={dossier === null ? "Compte introuvable" : "Utilisateur"} eyebrow="Supervision · habilitations" backHref="/gestion/utilisateurs" verrouillage="aucun" gouvernance>
        {dossier === null ? <InlineMessage tone="danger" title="Ce compte n'existe plus." /> : <SkeletonLines />}
      </ManagementDetailShell>
    )
  }
  const { user, dependances } = dossier
  const nom = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email || user.matricule || "Agent"
  const peutModifier = droits.may("utilisateurs", "modifier")
  const peutChangerEtat = user.isActive ? droits.may("utilisateurs", "supprimer") && !dossier.estSoiMeme : peutModifier
  const roles = ROLES_INTERNES.filter((r) => r !== "admin_it" || droits.role === "admin_it" || user.role === "admin_it")
  const ressources = RESSOURCES_METIER.filter((r) => permissionsFor(user.role as AppRole, r).length > 0)

  return (
    <ManagementDetailShell
      title={nom}
      eyebrow={`Supervision · ${ROLE_LABELS[user.role].split(" — ")[0]}`}
      backHref="/gestion/utilisateurs"
      verrouillage="aucun"
      gouvernance
      lectureSeule={!droits.chargement && !peutModifier}
      description={[user.matricule, user.email].filter(Boolean).join(" · ")}
      actions={
        peutChangerEtat ? (
          <Button
            type="button"
            variant={user.isActive ? "danger" : "secondary"}
            disabled={user.isActive && dependances.caissesOuvertes > 0}
            loading={operation.enCours === "etat"}
            onClick={() => {
              if (user.isActive && !window.confirm(`Suspendre le compte de ${nom} ? Son historique est conservé.`)) return
              void operation.executer("etat", () => changerEtat({ userId: user._id, isActive: !user.isActive }), user.isActive ? "Compte suspendu : l'historique reste attaché." : "Compte réactivé.")
            }}
          >
            <Power />
            {user.isActive ? "Suspendre" : "Réactiver"}
          </Button>
        ) : null
      }
    >
      <div className="flex flex-wrap gap-2">
        <TagCompte etat={dossier.etat} />
      </div>
      <RetourOperation retour={operation.retour} />
      {user.isActive && dependances.caissesOuvertes > 0 ? (
        <InlineMessage tone="info" title="Suspension protégée.">
          {dependances.caissesOuvertes} caisse(s) ouverte(s) : elles doivent être clôturées avant la suspension du compte.
        </InlineMessage>
      ) : null}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(300px,0.7fr)]">
        <div className="grid content-start gap-5">
          <Panneau titre="Rôle et rattachement" icone={UserRound}>
            <form
              className="grid gap-4"
              onSubmit={async (event) => {
                event.preventDefault()
                const donnees = new FormData(event.currentTarget)
                await operation.executer(
                  "enregistrer",
                  () =>
                    modifier({
                      userId: user._id,
                      firstName: texte(donnees, "firstName"),
                      lastName: texte(donnees, "lastName"),
                      email: texte(donnees, "email"),
                      phone: texte(donnees, "phone"),
                      matricule: texte(donnees, "matricule"),
                      role: String(donnees.get("role") ?? user.role) as AppRole,
                      pointOfSaleId: texte(donnees, "pointOfSaleId") as never,
                    }),
                  "Compte enregistré. Les droits du nouveau rôle s'appliquent à la prochaine action de l'agent."
                )
              }}
            >
              <fieldset disabled={!peutModifier} className="grid gap-4 sm:grid-cols-2">
                <Field label="Prénom" htmlFor="compte-prenom">
                  <Input id="compte-prenom" name="firstName" defaultValue={user.firstName} />
                </Field>
                <Field label="Nom" htmlFor="compte-nom">
                  <Input id="compte-nom" name="lastName" defaultValue={user.lastName} />
                </Field>
                <Field label="Adresse e-mail" htmlFor="compte-email">
                  <Input id="compte-email" name="email" type="email" defaultValue={user.email} />
                </Field>
                <Field label="Téléphone" htmlFor="compte-tel">
                  <Input id="compte-tel" name="phone" type="tel" defaultValue={user.phone} className="tabular" />
                </Field>
                <Field label="Matricule" htmlFor="compte-matricule">
                  <Input id="compte-matricule" name="matricule" defaultValue={user.matricule} className="tabular uppercase" />
                </Field>
                <Field label="Rôle" hint={dossier.estSoiMeme ? "Votre propre rôle ne se modifie pas ici." : undefined} htmlFor="compte-role" disabled={dossier.estSoiMeme || !peutModifier}>
                  <SelectNative id="compte-role" name="role" defaultValue={user.role}>
                    {roles.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </SelectNative>
                </Field>
                <Field label="Point de vente" hint="Obligatoire pour un vendeur." htmlFor="compte-pdv" className="sm:col-span-2">
                  <SelectNative id="compte-pdv" name="pointOfSaleId" defaultValue={user.pointOfSaleId ?? ""}>
                    <option value="">Aucun (réseau)</option>
                    {(points ?? []).map(({ pointOfSale }) => (
                      <option key={pointOfSale._id} value={pointOfSale._id} disabled={!pointOfSale.isActive && pointOfSale._id !== user.pointOfSaleId}>
                        {pointOfSale.code} · {pointOfSale.name}
                        {pointOfSale.isActive ? "" : " · suspendu"}
                      </option>
                    ))}
                    {!points && dossier.pointOfSale ? <option value={dossier.pointOfSale.id}>{dossier.pointOfSale.code} · {dossier.pointOfSale.name}</option> : null}
                  </SelectNative>
                </Field>
              </fieldset>
              {peutModifier ? (
                <div>
                  <Button type="submit" loading={operation.enCours === "enregistrer"} loadingLabel="Enregistrement…">
                    <Save />
                    Enregistrer le compte
                  </Button>
                </div>
              ) : null}
            </form>
          </Panneau>
          <Panneau titre={`Droits du rôle « ${ROLE_LABELS[user.role].split(" — ")[0]} »`} icone={ShieldCheck} plein>
            {ressources.length === 0 ? (
              <p className="text-small p-4 text-ink-muted">Ce rôle n’a aucun droit sur la billetterie ; ses accès passent par les modules.</p>
            ) : (
              <ul className="divide-y divide-line">
                {ressources.map((r) => (
                  <li key={r} className="flex items-center justify-between gap-3 px-4 py-2 text-[14px]">
                    <span>{LIBELLES_RESSOURCES[r]}</span>
                    <CelluleDroits droits={permissionsFor(user.role as AppRole, r)} />
                  </li>
                ))}
              </ul>
            )}
          </Panneau>
        </div>
        <div className="grid content-start gap-4">
          <Panneau titre="Identité et sécurité" icone={KeyRound}>
            <Fiche
              elements={[
                ["Source", user.identitySource === "annuaire" ? "Annuaire Eramet (Entra ID)" : "Compte local de repli"],
                ["Second facteur", <TagSecondFacteur key="m" valeur={user.secondFactor ?? null} />],
                ["Dernier accès", <span key="a" className="tabular">{dateHeure(user.lastSeenAt)}</span>],
                ["Synchronisé le", <span key="s" className="tabular">{dateHeure(user.directorySyncedAt)}</span>],
                user.invitedAt ? ["Invité le", `${dateHeure(user.invitedAt)} · ${agent(dossier.invitePar)}`] : null,
                ["Rattachement", dossier.pointOfSale ? `${dossier.pointOfSale.code} · ${dossier.pointOfSale.name}` : "Réseau"],
                ["Ventes réalisées", <span key="v" className="tabular">{dependances.ventes}</span>],
              ]}
            />
          </Panneau>
          <Panneau titre="Historique du compte" icone={History}>
            <Historique historique={dossier.historique} />
          </Panneau>
          <Panneau
            titre="Dernières actions de l'agent"
            icone={History}
            plein
            actions={
              <LienBouton href={`/gestion/audit?agent=${user._id}`} variante="ghost" taille="sm">
                Journal complet
              </LienBouton>
            }
          >
            {dossier.dernieresActions.length === 0 ? (
              <p className="text-small p-4 text-ink-muted">Aucune action tracée.</p>
            ) : (
              <ul className="divide-y divide-line">
                {dossier.dernieresActions.map((action) => (
                  <li key={action.id} className="grid gap-0.5 px-4 py-2 text-[13.5px]">
                    <span className="font-semibold">{libelleAction(action.action)}</span>
                    <small className="text-ink-muted">
                      <span className="tabular">{dateHeure(action.createdAt)}</span> · {action.entityTable}
                      {action.result && action.result !== "succes" ? ` · ${action.result}` : ""}
                    </small>
                  </li>
                ))}
              </ul>
            )}
          </Panneau>
        </div>
      </div>
    </ManagementDetailShell>
  )
}
