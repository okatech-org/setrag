"use client"

import type { FunctionReturnType } from "convex/server"
import { ExternalLinkIcon, MessageCircleIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { useAction, useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { EmptyState, SkeletonLines } from "@workspace/ui/components/empty-state"
import { Feuille } from "@workspace/ui/components/feuille"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import { useMaintenant } from "@/hooks/use-maintenant"
import { dateCourte, dateDeService, heure } from "@/lib/format"

import { Carte, EnTeteSousPage, ExigeConnexion, Ligne, Page, Section, messageServeur } from "./elements"

const CANAUX: Record<string, string> = { telegram: "Telegram", whatsapp: "WhatsApp", messenger: "Messenger", apple_messages: "Messages" }

type Liaisons = FunctionReturnType<typeof api.messaging.linking.listMine>

/**
 * Les messageries où Ruban agit pour ce compte. Délier est immédiat : la
 * conversation repart en invitée, et Ruban le dit dans le fil.
 */
function Liste({ liaisons }: { liaisons: Liaisons | undefined }) {
  const delier = useMutation(api.messaging.linking.unlink)
  const [cible, setCible] = useState<Liaisons[number] | null>(null)
  const [enCours, setEnCours] = useState(false)

  if (liaisons === undefined) return <SkeletonLines />
  if (liaisons.length === 0) {
    return (
      <EmptyState
        title="Aucune messagerie reliée"
        description="Reliez Telegram ci-dessous : Ruban y retrouvera vos réservations et vos billets."
      />
    )
  }
  return (
    <>
      <Section>
        {liaisons.map((liaison) => (
          <Ligne
            key={liaison.identityId}
            icone={MessageCircleIcon}
            libelle={CANAUX[liaison.canal] ?? liaison.canal}
            detail={[liaison.nomAffiche, liaison.linkedAt ? `reliée le ${dateCourte(dateDeService(liaison.linkedAt))}` : null].filter(Boolean).join(" · ")}
            fin="Délier"
            onClick={() => setCible(liaison)}
          />
        ))}
      </Section>
      <Feuille
        open={cible !== null}
        onOpenChange={(ouverte) => !ouverte && setCible(null)}
        titre={`Délier ${cible ? (CANAUX[cible.canal] ?? cible.canal) : ""}`}
        description="Ruban ne pourra plus retrouver vos billets depuis cette conversation. Vous pourrez la relier de nouveau."
        pied={
          <div className="grid gap-2 md:flex md:justify-end">
            <Button variant="ghost" onClick={() => setCible(null)}>
              Garder
            </Button>
            <Button
              variant="danger"
              loading={enCours}
              onClick={async () => {
                if (!cible) return
                setEnCours(true)
                try {
                  await delier({ identityId: cible.identityId })
                  toast.success(`${CANAUX[cible.canal] ?? cible.canal} n'est plus relié à votre compte.`)
                  setCible(null)
                } catch (cause) {
                  toast.error(messageServeur(cause, "La liaison n'a pas pu être retirée."))
                } finally {
                  setEnCours(false)
                }
              }}
            >
              Délier
            </Button>
          </div>
        }
      >
        <span />
      </Feuille>
    </>
  )
}

type Demande =
  | { etat: "repos" }
  | { etat: "indisponible" }
  /** `reliees` : messageries déjà reliées quand le lien a été demandé. */
  | { etat: "lien"; url: string; expiresAt: number; reliees: number }

/**
 * Relier Telegram : le site demande un lien au serveur pour le compte
 * connecté ; la personne l'ouvre dans SON Telegram et appuie sur Démarrer.
 * Le lien ne sert qu'une fois et expire au bout de dix minutes. La liste
 * au-dessus, réactive, montre la liaison dès qu'elle aboutit.
 */
function RelierTelegram({ liaisons }: { liaisons: Liaisons | undefined }) {
  const demarrer = useAction(api.messaging.linking.startFromSite)
  const [demande, setDemande] = useState<Demande>({ etat: "repos" })
  const [envoi, setEnvoi] = useState(false)
  const maintenant = useMaintenant(1_000)

  const nombre = liaisons?.length
  const reliee = demande.etat === "lien" && nombre !== undefined && nombre > demande.reliees
  const expiree = demande.etat === "lien" && !reliee && maintenant !== null && maintenant >= demande.expiresAt

  const relier = async () => {
    setEnvoi(true)
    try {
      const resultat = await demarrer({ canal: "telegram" })
      setDemande(resultat.disponible ? { etat: "lien", url: resultat.url, expiresAt: resultat.expiresAt, reliees: nombre ?? 0 } : { etat: "indisponible" })
    } catch (cause) {
      toast.error(messageServeur(cause, "Le lien vers Telegram n'a pas pu être préparé. Réessayez."))
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <Carte>
      <div className="grid gap-1">
        <h2 className="text-[17px] font-bold">Relier Telegram</h2>
        <p className="text-small text-ink-muted">
          Ouvrez le lien vous-même, sur le téléphone où vous utilisez Telegram, et ne le partagez pas : il relie à votre compte la conversation qui l&apos;ouvre.
        </p>
      </div>

      {demande.etat === "indisponible" && (
        <InlineMessage tone="warning" title="La liaison avec Telegram n'est pas encore ouverte.">
          Le bot Ruban n&apos;est pas encore configuré sur ce site. Réessayez plus tard.
        </InlineMessage>
      )}

      {demande.etat === "lien" && reliee && <InlineMessage tone="success" title="Telegram est relié à votre compte." />}

      {demande.etat === "lien" && expiree && (
        <InlineMessage tone="warning" title="Ce lien a expiré.">
          Appuyez de nouveau sur « Relier Telegram » pour en obtenir un autre.
        </InlineMessage>
      )}

      {demande.etat === "lien" && !reliee && !expiree && (
        <div className="grid gap-3">
          <p className="text-[15px]">Dans Telegram, appuyez sur Démarrer.</p>
          <Button asChild className="justify-self-start">
            <a href={demande.url} target="_blank" rel="noreferrer">
              <ExternalLinkIcon aria-hidden />
              Ouvrir Telegram
              <span className="sr-only"> (nouvel onglet)</span>
            </a>
          </Button>
          <p className="text-caption text-ink-muted">
            Lien valable une fois, jusqu&apos;à <span className="tabular">{heure(demande.expiresAt)}</span>.
          </p>
        </div>
      )}

      <Button variant="secondary" className="justify-self-start" loading={envoi} onClick={relier}>
        <MessageCircleIcon aria-hidden />
        Relier Telegram
      </Button>
    </Carte>
  )
}

function Contenu() {
  const liaisons = useQuery(api.messaging.linking.listMine, {})
  return (
    <>
      <Liste liaisons={liaisons} />
      <RelierTelegram liaisons={liaisons} />
      <Carte>
        <p className="text-small text-ink-muted">
          Une messagerie reliée permet à Ruban d&apos;y retrouver vos réservations et vos billets. Il ne réserve ni ne paie rien sans votre confirmation, et ne vous
          demandera jamais votre code secret.
        </p>
      </Carte>
    </>
  )
}

export function Messageries() {
  return (
    <>
      <EnTeteSousPage titre="Messageries reliées" sousTitre="Ruban sur Telegram, WhatsApp…" />
      <Page>
        <ExigeConnexion invitation={{ titre: "Connectez-vous pour gérer vos messageries" }}>{() => <Contenu />}</ExigeConnexion>
      </Page>
    </>
  )
}
