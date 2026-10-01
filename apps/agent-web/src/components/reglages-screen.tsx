"use client"

import { Keyboard, LayoutGrid, LogOut, UserRound } from "lucide-react"

import { useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { MODULE_ACCESS_LEVEL_LABELS } from "@workspace/backend/modules"
import { Button } from "@workspace/ui/components/button"
import { Tag } from "@workspace/ui/components/tag"

import { EnTetePage, Fiche, Panneau } from "@/components/charte"
import { useModuleNavigationAccesses } from "@/components/module-access-navigation"
import { usePortalSession } from "@/components/portal-guard"
import { CoquilleAgent } from "@/coquille/coquille-agent"
import { ICONES_MODULES } from "@/coquille/navigation"
import { ReglagesRaccourcis } from "@/coquille/raccourcis"
import { dateHeure } from "@/lib/agent-data"
import { asAppRole, SELLER_ROLES } from "@/lib/portal-access"
import { ROLE_LABELS } from "@/lib/roles"

const E2E_MODE =
  process.env.NODE_ENV !== "production" &&
  process.env.NEXT_PUBLIC_E2E_MODE === "1"

const SECOND_FACTEUR = {
  application: "Application d'authentification",
  fido2: "Clé de sécurité FIDO2",
  sms: "Code par SMS",
  aucun: "Aucun",
} as const

/** Point de vente de rattachement, pour le personnel de vente. */
function PointDeVente({ vendeur }: { vendeur: boolean }) {
  const contexte = useQuery(
    api.functions.guichet.contexte,
    vendeur && !E2E_MODE ? {} : "skip"
  )
  if (!vendeur) return null
  if (contexte === undefined) return <>…</>
  return <>{contexte.pointOfSale.name}</>
}

/**
 * Réglages de l'agent : son profil tel que le portail le connaît, les modules
 * qui lui sont ouverts, ses raccourcis clavier et sa session. Commune aux deux
 * portails : chacun y arrive par le bloc de son compte, en haut à droite.
 */
export function ReglagesScreen() {
  const session = usePortalSession()
  const utilisateur = session?.profile.user
  const role = asAppRole(utilisateur?.role)
  const vendeur = Boolean(role && SELLER_ROLES.includes(role))
  const { accesses, loading } = useModuleNavigationAccesses(role)
  const nom = [utilisateur?.firstName, utilisateur?.lastName]
    .filter(Boolean)
    .join(" ")

  return (
    <CoquilleAgent titre="Réglages">
      <div className="grid gap-6">
        <EnTetePage
          surtitre="Votre compte"
          titre="Réglages"
          description="Votre profil, les modules qui vous sont ouverts et vos raccourcis clavier. Ces réglages ne valent que pour votre compte."
        />

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <Panneau
            id="raccourcis"
            titre="Raccourcis clavier"
            icone={Keyboard}
            sousTitre="Une touche ouvre une rubrique du menu, hors saisie ; « ? » ramène ici."
            className="scroll-mt-24"
          >
            <ReglagesRaccourcis />
          </Panneau>

          <div className="order-first grid content-start gap-6 xl:order-none">
            <Panneau
              titre="Profil"
              icone={UserRound}
              pied={
                utilisateur?.identitySource === "annuaire"
                  ? "Identité tenue par l'annuaire ERAMET : une correction se demande à la DSI."
                  : "Compte local de repli : l'administration fonctionnelle le tient à jour."
              }
            >
              <Fiche
                elements={[
                  ["Nom", nom || "—"],
                  ["Matricule", utilisateur?.matricule],
                  ["Fonction", role ? ROLE_LABELS[role] : undefined],
                  vendeur && [
                    "Point de vente",
                    <PointDeVente key="pdv" vendeur={vendeur} />,
                  ],
                  ["Courriel", utilisateur?.email],
                  ["Téléphone", utilisateur?.phone],
                  [
                    "Identité",
                    utilisateur?.identitySource === "annuaire"
                      ? "Annuaire ERAMET"
                      : utilisateur
                        ? "Compte local"
                        : undefined,
                  ],
                  [
                    "Second facteur",
                    utilisateur?.secondFactor
                      ? SECOND_FACTEUR[utilisateur.secondFactor]
                      : "Non déclaré",
                  ],
                ]}
              />
            </Panneau>

            <Panneau titre="Modules ouverts" icone={LayoutGrid}>
              {loading ? (
                <p className="text-small text-ink-muted">Lecture des accès…</p>
              ) : accesses.length === 0 ? (
                <p className="text-small text-ink-muted">
                  Aucun module activé pour ce compte.
                </p>
              ) : (
                <ul className="grid">
                  {accesses.map((acces) => {
                    const Icone = ICONES_MODULES[acces.code]
                    return (
                      <li
                        key={acces.code}
                        className="flex min-h-11 items-center gap-3 border-b border-line py-1.5 last:border-b-0"
                      >
                        <Icone
                          aria-hidden
                          className="size-[18px] text-ink-muted"
                        />
                        <span className="min-w-0 flex-1 truncate text-[14px] font-medium">
                          {acces.label}
                        </span>
                        {acces.accessLevel ? (
                          <Tag
                            tone={
                              acces.accessLevel === "lecture"
                                ? "neutral"
                                : "second"
                            }
                          >
                            {MODULE_ACCESS_LEVEL_LABELS[acces.accessLevel]}
                          </Tag>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              )}
            </Panneau>

            <Panneau titre="Session" icone={LogOut}>
              <p className="text-small text-ink-muted">
                {utilisateur?.lastSeenAt
                  ? `Dernière activité enregistrée : ${dateHeure(utilisateur.lastSeenAt)}.`
                  : "Session ouverte sur ce poste."}{" "}
                Sur un poste partagé, déconnectez-vous avant de le quitter.
              </p>
              {session ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="w-fit"
                  disabled={session.signingOut}
                  onClick={() => void session.signOut()}
                >
                  <LogOut />
                  Se déconnecter
                </Button>
              ) : null}
            </Panneau>
          </div>
        </div>
      </div>
    </CoquilleAgent>
  )
}
