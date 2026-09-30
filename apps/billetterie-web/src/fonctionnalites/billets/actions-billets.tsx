"use client"

import {
  CalendarPlusIcon,
  DownloadIcon,
  MailIcon,
  WalletIcon,
} from "lucide-react"
import { useState, useSyncExternalStore } from "react"
import { toast } from "sonner"

import { useAction } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { Feuille } from "@workspace/ui/components/feuille"
import { Field, Input } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { cn } from "@workspace/ui/lib/utils"

import { messageServeur } from "@/fonctionnalites/tunnel/outils"
import { useOnline } from "@/hooks/use-online"
import { nomTrain } from "@/lib/voyage"
import {
  detectWalletPlatform,
  providersForPlatform,
  type WalletPlatform,
  type WalletProvider,
} from "@/lib/wallet-platform"

import { creerCalendrier } from "./calendrier"
import { nomVoyageur, placeDe, type Dossier, type Titre } from "./dossier"
import { enregistrerDistant, enregistrerFichier } from "./fichiers"
import type { Horaires } from "./use-horaires"

export type Message = {
  ton: "info" | "success" | "warning" | "danger"
  titre: string
  corps?: string
}

/** La phrase de la charte hors réseau : l'action attend, le billet non. */
export const RAPPEL_CONTROLE =
  "Le code affiché sur cet écran suffit au contrôle à bord."

const HORS_RESEAU: Message = {
  ton: "info",
  titre: "Cette action demande une connexion.",
  corps: RAPPEL_CONTROLE,
}

const NOM_WALLET: Record<WalletProvider, string> = {
  apple: "Apple Wallet",
  google: "Google Wallet",
}

/**
 * Les actions réseau d'un dossier payé : PDF, Wallet, e-mail — et l'agenda,
 * qui se fabrique sur l'appareil.
 *
 * Hors réseau, elles ne sont pas masquées : elles répondent qu'elles
 * demandent une connexion et rappellent que le code affiché suffit
 * (docs/billetterie-pwa.md). Tenues ici une fois, pour la confirmation comme
 * pour le détail.
 */
export function useActionsBillets(
  dossier: Dossier,
  contact: string | null,
  horaires: Horaires
) {
  const enLigne = useOnline()
  const ticketPdf = useAction(api.functions.documents.ticketPdf)
  const bookingPdf = useAction(api.functions.documents.bookingPdf)
  const createPass = useAction(api.functions.wallet.createPass)
  const emailTickets = useAction(api.functions.notifications.emailTickets)

  const [occupe, setOccupe] = useState<string | null>(null)
  const [message, setMessage] = useState<Message | null>(null)
  const reference = dossier.sale.number
  const contactPhone = contact ?? undefined

  /** L'état du réseau est relu au geste : c'est à ce moment qu'il compte. */
  function exigeReseau(): boolean {
    if (enLigne && navigator.onLine) return true
    setMessage(HORS_RESEAU)
    return false
  }

  async function executer(
    cle: string,
    action: () => Promise<void>,
    echec: (cause: unknown) => Message
  ) {
    if (!exigeReseau()) return
    setOccupe(cle)
    setMessage(null)
    try {
      await action()
    } catch (cause) {
      setMessage(echec(cause))
    } finally {
      setOccupe(null)
    }
  }

  const telechargerBillet = (titre: Titre) =>
    executer(
      `pdf-${titre._id}`,
      async () => {
        const resultat = await ticketPdf({ ticketId: titre._id, contactPhone })
        await enregistrerDistant(resultat.url, `billet-${titre.number}.pdf`)
      },
      (cause) => ({
        ton: "danger",
        titre: `Le billet de ${nomVoyageur(titre)} n'a pas pu être préparé.`,
        corps:
          messageServeur(cause) ??
          `Réessayez dans un instant. ${RAPPEL_CONTROLE}`,
      })
    )

  const telechargerDossier = () =>
    executer(
      "pdf-dossier",
      async () => {
        const resultat = await bookingPdf({ reference, contactPhone })
        await enregistrerDistant(resultat.url, resultat.filename)
      },
      (cause) => ({
        ton: "danger",
        titre: "Les billets n'ont pas pu être préparés en PDF.",
        corps:
          messageServeur(cause) ??
          `Réessayez dans un instant. ${RAPPEL_CONTROLE}`,
      })
    )

  const ajouterWallet = (titre: Titre, fournisseur: WalletProvider) =>
    executer(
      `wallet-${titre._id}-${fournisseur}`,
      async () => {
        const carte = await createPass({
          ticketId: titre._id,
          provider: fournisseur,
          contactPhone,
        })
        if (carte.provider === "google") {
          window.location.assign(carte.url)
          return
        }
        enregistrerFichier(
          carte.bytes,
          "application/vnd.apple.pkpass",
          carte.filename
        )
      },
      (cause) => {
        const texte = messageServeur(cause)
        if (texte && /pas configuré/.test(texte)) {
          return {
            ton: "info",
            titre: `L'ajout à ${NOM_WALLET[fournisseur]} n'est pas encore disponible.`,
            corps:
              fournisseur === "apple"
                ? `SETRAG n'a pas encore ses certificats Apple Wallet. ${RAPPEL_CONTROLE} Le PDF reste disponible.`
                : `SETRAG n'a pas encore son compte émetteur Google Wallet. ${RAPPEL_CONTROLE} Le PDF reste disponible.`,
          }
        }
        return {
          ton: "danger",
          titre: `Le billet de ${nomVoyageur(titre)} n'a pas pu être ajouté à ${NOM_WALLET[fournisseur]}.`,
          corps: texte ?? `${RAPPEL_CONTROLE} Le PDF reste disponible.`,
        }
      }
    )

  /** Rend le compte rendu de l'envoi, affiché dans la feuille de saisie. */
  async function envoyerEmail(email: string): Promise<Message | null> {
    if (!enLigne || !navigator.onLine) return HORS_RESEAU
    setOccupe("email")
    try {
      const resultat = await emailTickets({
        reference,
        contactPhone,
        email: email.trim() || undefined,
      })
      if (resultat.sent) {
        toast(`Billets envoyés à ${resultat.recipient}.`)
        return null
      }
      if (resultat.reason === "missing_email")
        return { ton: "warning", titre: "Indiquez une adresse e-mail." }
      if (resultat.reason === "rate_limited") {
        return {
          ton: "warning",
          titre: "Ces billets viennent déjà d'être envoyés plusieurs fois.",
          corps: "Réessayez dans une heure environ.",
        }
      }
      return {
        ton: "info",
        titre: "L'envoi par e-mail n'est pas encore activé.",
        corps:
          "Le service d'envoi de SETRAG n'est pas encore branché. Téléchargez le PDF pour garder une copie de vos billets.",
      }
    } catch (cause) {
      return {
        ton: "danger",
        titre: "L'e-mail n'a pas pu être envoyé.",
        corps: messageServeur(cause) ?? "Réessayez dans un instant.",
      }
    } finally {
      setOccupe(null)
    }
  }

  function ajouterCalendrier() {
    const trip = dossier.trip
    if (!trip) return
    const contenu = creerCalendrier({
      reference,
      train: nomTrain(trip.trainType, trip.trainNumber),
      origine: dossier.origin?.name ?? "départ",
      destination: dossier.destination?.name ?? "arrivée",
      departAt: horaires.departAt ?? trip.departureAt,
      arriveeAt: horaires.arriveeAt ?? trip.arrivalAt,
      billets: dossier.tickets.length,
      maintenant: Date.now(),
    })
    enregistrerFichier(
      contenu,
      "text/calendar;charset=utf-8",
      `voyage-${reference}.ics`
    )
    toast("Ouvrez le fichier pour ajouter le voyage à votre agenda.")
  }

  return {
    occupe,
    message,
    effacerMessage: () => setMessage(null),
    exigeReseau,
    telechargerBillet,
    telechargerDossier,
    ajouterWallet,
    envoyerEmail,
    ajouterCalendrier,
  }
}

export type ActionsBillets = ReturnType<typeof useActionsBillets>

const sansAbonnement = () => () => {}

/** La plateforme n'est connue qu'au navigateur : le serveur rend « bureau ». */
function usePlateforme(): WalletPlatform {
  return useSyncExternalStore(
    sansAbonnement,
    () => detectWalletPlatform(navigator.userAgent),
    () => "desktop" as const
  )
}

function Avis({ message }: { message: Message | null }) {
  if (!message) return null
  return (
    <InlineMessage tone={message.ton} title={message.titre}>
      {message.corps}
    </InlineMessage>
  )
}

/**
 * Actions d'un dossier payé : Wallet, PDF, agenda, e-mail.
 *
 * `principal` : sur la confirmation, le PDF est le bouton principal de
 * l'écran (maquette web). Ailleurs, l'écran a déjà le sien.
 */
export function ActionsDossier({
  dossier,
  actions,
  principal = false,
  className,
}: {
  dossier: Dossier
  actions: ActionsBillets
  principal?: boolean
  className?: string
}) {
  const plateforme = usePlateforme()
  const fournisseurs = providersForPlatform(plateforme)
  const [feuille, setFeuille] = useState<
    null | "pdf" | "email" | WalletProvider
  >(null)
  const [email, setEmail] = useState(dossier.sale.contactEmail ?? "")
  const [compteRendu, setCompteRendu] = useState<Message | null>(null)

  if (dossier.sale.status !== "confirmee" || !dossier.trip) return null
  const titres = dossier.tickets
  const valides = titres.filter((titre) => titre.status === "valide")
  const plusieurs = titres.length > 1

  // Hors réseau, pas de feuille de choix : la réponse vient tout de suite.
  const ouvrir = (quoi: typeof feuille) => {
    if (!actions.exigeReseau()) return
    actions.effacerMessage()
    setCompteRendu(null)
    setFeuille(quoi)
  }

  const wallet = (fournisseur: WalletProvider) => {
    if (valides.length === 1)
      void actions.ajouterWallet(valides[0]!, fournisseur)
    else ouvrir(fournisseur)
  }

  const pdf = () => {
    if (plusieurs) ouvrir("pdf")
    else void actions.telechargerBillet(titres[0]!)
  }

  // Une fois l'envoi réussi, la feuille se referme : le toast le confirme.
  const envoyerPuisFermer = async () => {
    const resultat = await actions.envoyerEmail(email)
    setCompteRendu(resultat)
    if (resultat === null) setFeuille(null)
  }

  const libelleWallet = (fournisseur: WalletProvider) =>
    plateforme === "desktop"
      ? NOM_WALLET[fournisseur]
      : `Ajouter à ${NOM_WALLET[fournisseur]}`

  return (
    <section
      aria-label="Emporter vos billets"
      className={cn("@container grid gap-3", className)}
    >
      {feuille === null && <Avis message={actions.message} />}
      <div className="grid gap-2 @xl:flex @xl:flex-wrap @xl:items-center @xl:gap-3">
        {valides.length > 0 && (
          <div
            className={cn(
              "grid gap-2 @xl:flex @xl:gap-3",
              fournisseurs.length > 1 && "@[20rem]:grid-cols-2"
            )}
          >
            {fournisseurs.map((fournisseur) => (
              <Button
                key={fournisseur}
                variant="noir"
                size="lg"
                loading={actions.occupe?.endsWith(`-${fournisseur}`) ?? false}
                onClick={() => wallet(fournisseur)}
              >
                <WalletIcon aria-hidden />
                {libelleWallet(fournisseur)}
              </Button>
            ))}
          </div>
        )}
        <Button
          variant={principal ? "primary" : "secondary"}
          size="lg"
          loading={
            actions.occupe === "pdf-dossier" ||
            (!plusieurs && actions.occupe === `pdf-${titres[0]?._id}`)
          }
          onClick={pdf}
        >
          <DownloadIcon aria-hidden />
          {plusieurs
            ? "Télécharger les billets (PDF)"
            : "Télécharger le billet (PDF)"}
        </Button>
        <Button variant="ghost" size="lg" onClick={actions.ajouterCalendrier}>
          <CalendarPlusIcon aria-hidden />
          Ajouter au calendrier
        </Button>
        <Button variant="ghost" size="lg" onClick={() => ouvrir("email")}>
          <MailIcon aria-hidden />
          Recevoir par e-mail
        </Button>
      </div>

      <Feuille
        open={feuille === "pdf"}
        onOpenChange={(ouvert) => !ouvert && setFeuille(null)}
        titre="Télécharger en PDF"
        description="Un fichier pour tout le dossier, ou un billet à la fois."
      >
        <div className="grid gap-3">
          <Avis message={actions.message} />
          <Button
            variant="secondary"
            size="lg"
            block
            loading={actions.occupe === "pdf-dossier"}
            onClick={() => void actions.telechargerDossier()}
          >
            <DownloadIcon aria-hidden />
            Les {titres.length} billets, en un fichier
          </Button>
          <ul className="grid divide-y divide-line rounded-md border border-line bg-surface">
            {titres.map((titre) => (
              <li
                key={titre._id}
                className="flex min-h-14 items-center gap-3 px-4 py-1"
              >
                <span className="grid min-w-0 flex-1">
                  <b className="truncate text-[15px]">{nomVoyageur(titre)}</b>
                  <span className="truncate text-[13px] text-ink-muted">
                    {placeDe(titre) ?? "place attribuée à bord"}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  loading={actions.occupe === `pdf-${titre._id}`}
                  onClick={() => void actions.telechargerBillet(titre)}
                >
                  <DownloadIcon aria-hidden />
                  PDF
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </Feuille>

      {fournisseurs.map((fournisseur) => (
        <Feuille
          key={fournisseur}
          open={feuille === fournisseur}
          onOpenChange={(ouvert) => !ouvert && setFeuille(null)}
          titre={`Ajouter à ${NOM_WALLET[fournisseur]}`}
          description="Une carte par voyageur : chacun présente la sienne au contrôle."
        >
          <div className="grid gap-3">
            <Avis message={actions.message} />
            <ul className="grid divide-y divide-line rounded-md border border-line bg-surface">
              {valides.map((titre) => (
                <li
                  key={titre._id}
                  className="flex min-h-14 items-center gap-3 px-4 py-2"
                >
                  <span className="grid min-w-0 flex-1">
                    <b className="truncate text-[15px]">{nomVoyageur(titre)}</b>
                    <span className="truncate text-[13px] text-ink-muted">
                      {placeDe(titre) ?? "place attribuée à bord"}
                    </span>
                  </span>
                  <Button
                    variant="noir"
                    loading={
                      actions.occupe === `wallet-${titre._id}-${fournisseur}`
                    }
                    onClick={() =>
                      void actions.ajouterWallet(titre, fournisseur)
                    }
                  >
                    <WalletIcon aria-hidden />
                    Ajouter
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        </Feuille>
      ))}

      <Feuille
        open={feuille === "email"}
        onOpenChange={(ouvert) => !ouvert && setFeuille(null)}
        titre="Recevoir les billets par e-mail"
        description="Le PDF de tous les billets du dossier, en pièce jointe."
        pied={
          <Button
            block
            size="lg"
            loading={actions.occupe === "email"}
            onClick={() => void envoyerPuisFermer()}
          >
            Envoyer les billets
          </Button>
        }
      >
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            void envoyerPuisFermer()
          }}
        >
          <Field label="Adresse e-mail" htmlFor="billets-email">
            <Input
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
          <Avis message={compteRendu} />
        </form>
      </Feuille>
    </section>
  )
}
