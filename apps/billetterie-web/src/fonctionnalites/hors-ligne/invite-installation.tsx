"use client"

import { ShareIcon, XIcon } from "lucide-react"
import * as React from "react"

import { Button } from "@workspace/ui/components/button"

/**
 * Événement d'installation, absent des types du DOM.
 *
 * Il n'est pas standardisé : Chrome et les navigateurs qui en dérivent le
 * proposent, Safari non. D'où le double chemin de ce composant.
 */
type PromptInstallation = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

const CLE_REFUS = "setrag:installation-refusee"

/** Le refus du bandeau se retient : le reproposer à chaque écran serait du harcèlement. */
function refusEnregistre(): boolean {
  try {
    return window.localStorage.getItem(CLE_REFUS) === "1"
  } catch {
    return false
  }
}

function estInstallee(): boolean {
  if (window.matchMedia("(display-mode: standalone)").matches) return true
  // Safari sur iOS ne renseigne pas `display-mode` : il pose ce drapeau non
  // standard sur `navigator`.
  return (navigator as Navigator & { standalone?: boolean }).standalone === true
}

type Environnement = { installee: boolean; refusee: boolean; ios: boolean }

/**
 * Contexte d'installation, relevé une fois au chargement.
 *
 * Une constante de module, et non un appel par rendu : `getSnapshot` doit
 * renvoyer la même valeur d'un rendu à l'autre, sinon React boucle. Aucune de
 * ces trois réponses ne change pendant la visite — une installation ouvre une
 * nouvelle fenêtre, et le refus est traité par un état local.
 */
const ENVIRONNEMENT: Environnement | null =
  typeof window === "undefined"
    ? null
    : {
        installee: estInstallee(),
        refusee: refusEnregistre(),
        ios: /iphone|ipad|ipod/i.test(navigator.userAgent),
      }

const souscrire = () => () => {}

/**
 * Propose d'installer l'application sur l'écran d'accueil.
 *
 * L'installation n'est pas un confort : c'est elle qui déclenche la mise en
 * cache durable et qui donne au voyageur une icône à ouvrir sur le quai, sans
 * chercher une adresse ni un onglet. Le bandeau reste dans le flux plutôt que
 * flottant — il ne doit recouvrir ni la barre d'onglets, ni un billet.
 *
 * Sur iOS, aucun événement n'existe : Safari réserve l'ajout à l'écran
 * d'accueil au menu de partage. Le bandeau explique alors le geste au lieu de
 * proposer un bouton qui ne ferait rien.
 */
export function InviteInstallation() {
  // Le relevé n'est lu qu'après l'hydratation : rendu côté serveur, le
  // bandeau ferait un écart entre le HTML envoyé et le premier rendu.
  const environnement = React.useSyncExternalStore(
    souscrire,
    () => ENVIRONNEMENT,
    () => null
  )
  const [prompt, setPrompt] = React.useState<PromptInstallation | null>(null)
  const [ecartee, setEcartee] = React.useState(false)

  const proposable =
    environnement !== null && !environnement.installee && !environnement.refusee

  React.useEffect(() => {
    if (!proposable) return
    const capter = (event: Event) => {
      // Sans cela, le navigateur affiche sa propre invite, au moment qu'il
      // choisit — souvent au milieu d'un paiement.
      event.preventDefault()
      setPrompt(event as PromptInstallation)
    }
    const installee = () => setEcartee(true)
    window.addEventListener("beforeinstallprompt", capter)
    window.addEventListener("appinstalled", installee)
    return () => {
      window.removeEventListener("beforeinstallprompt", capter)
      window.removeEventListener("appinstalled", installee)
    }
  }, [proposable])

  function refuser() {
    setEcartee(true)
    try {
      window.localStorage.setItem(CLE_REFUS, "1")
    } catch {
      // Stockage refusé : l'invite reviendra, faute de mémoire pour le refus.
    }
  }

  async function installer() {
    if (!prompt) return
    await prompt.prompt()
    const { outcome } = await prompt.userChoice
    setPrompt(null)
    if (outcome === "dismissed") refuser()
    else setEcartee(true)
  }

  const manuelIOS = Boolean(environnement?.ios) && prompt === null
  if (!proposable || ecartee || (prompt === null && !manuelIOS)) return null

  return (
    <div role="region" aria-label="Installer l'application" className="border-b border-line bg-surface">
      <div className="mx-auto flex w-full max-w-[1240px] items-center gap-3 px-4 py-2.5 md:px-8">
        {/* eslint-disable-next-line @next/next/no-img-element -- icône SVG livrée telle quelle */}
        <img src="/marque/setrag-icone-app.svg" alt="" className="size-10 shrink-0 rounded-[22%] shadow-sm" />
        <p className="min-w-0 flex-1 text-small">
          <b className="font-semibold">Installez SETRAG</b> — vos billets restent consultables sans réseau.
          {manuelIOS && (
            <>
              {" "}
              Touchez <ShareIcon className="inline size-4 align-text-bottom" aria-label="Partager" /> puis « Sur l’écran d’accueil ».
            </>
          )}
        </p>
        {prompt && (
          <Button variant="secondary" size="sm" onClick={() => void installer()}>
            Installer
          </Button>
        )}
        <Button variant="ghost" size="icon" aria-label="Masquer la proposition d'installation" onClick={refuser}>
          <XIcon />
        </Button>
      </div>
    </div>
  )
}
