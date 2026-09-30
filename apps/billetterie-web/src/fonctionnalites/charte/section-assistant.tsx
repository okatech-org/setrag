"use client"

import { useEffect, useState } from "react"

import { SigneRuban, type SigneEtat } from "@workspace/ui/marque"

import { Regles, Section } from "./elements"

const ETATS: { etat: SigneEtat; titre: string; texte: string }[] = [
  { etat: "repos", titre: "Repos", texte: "Bouton flottant, avatar des réponses. Rien ne bouge." },
  { etat: "reflexion", titre: "Réflexion", texte: "Une rame parcourt le S, seulement si la réponse tarde plus de 400 ms." },
  { etat: "ecoute", titre: "Écoute", texte: "L'épaisseur suit la voix du voyageur, lissée." },
  { etat: "parole", titre: "Parole", texte: "L'épaisseur suit la voix de Ruban." },
  { etat: "hors-ligne", titre: "Hors ligne", texte: "Le ruban devient gris : Ruban a besoin du réseau." },
]

/** Un niveau de voix simulé, lissé : il respire sans jamais sauter. */
function useVoixSimulee() {
  const [niveau, setNiveau] = useState(0.4)
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    let t = 0
    const minuteur = window.setInterval(() => {
      t += 1
      setNiveau(0.45 + 0.35 * Math.sin(t / 3) * Math.sin(t / 7))
    }, 90)
    return () => window.clearInterval(minuteur)
  }, [])
  return niveau
}

export function SectionAssistant() {
  const niveau = useVoixSimulee()
  const [trace, setTrace] = useState(0)

  return (
    <Section
      id="ruban"
      numero="09"
      titre="Ruban, l'assistant"
      intro="SETRAG pose la voie, Ruban roule dessus. Son signe est le ruban lui-même, posé en S, sans les rails : reconnaissable au premier coup d'œil, et toujours à sa place dans l'identité. Ruban répond aux questions, cherche un train, réserve et fait payer dans la conversation, sur le site, dans l'app et bientôt sur WhatsApp et Telegram."
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {ETATS.map(({ etat, titre, texte }) => (
          <figure key={etat} className="grid content-start gap-3 rounded-lg border border-line bg-surface p-4">
            <div className="grid h-28 place-items-center rounded-md bg-canvas">
              <SigneRuban
                key={etat === "repos" ? trace : undefined}
                etat={etat}
                trace={etat === "repos" && trace > 0}
                niveau={etat === "ecoute" || etat === "parole" ? niveau : undefined}
                className="h-20 w-auto text-ink"
              />
            </div>
            <figcaption className="grid gap-1 text-small">
              <b>{titre}</b>
              <span className="text-ink-muted">{texte}</span>
            </figcaption>
          </figure>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid grid-cols-[auto_1fr] items-center gap-5 rounded-lg bg-brand-encre p-5 text-white">
          <SigneRuban fond="sombre" className="h-16 w-auto" />
          <p className="text-small text-white/80">Sur fond encre, la tête du ruban s’éclaircit : le bleu reste lisible.</p>
        </div>
        <div className="grid grid-cols-[auto_1fr] items-center gap-5 rounded-lg border border-line bg-surface p-5">
          <button
            type="button"
            onClick={() => setTrace((n) => n + 1)}
            aria-label="Ouvrir Ruban"
            className="grid size-[60px] place-items-center rounded-pill bg-brand-encre text-white shadow-[0_10px_28px_oklch(0.2_0.03_257/0.3)] transition-transform active:scale-95 dark:bg-[oklch(0.34_0.03_257)]"
          >
            <SigneRuban key={trace} trace={trace > 0} fond="sombre" className="h-[35px] w-auto" />
          </button>
          <p className="text-small text-ink-muted">
            Le bouton flottant : 60 px sur le web, 56 sur mobile, toujours encre — c’est ce qui le rend reconnaissable sur n’importe quelle page. À la
            première ouverture de la session, le ruban se trace une fois (700 ms). Touchez-le.
          </p>
        </div>
      </div>
      <Regles
        oui={{
          titre: "Ce que fait Ruban",
          items: [
            "Il montre des cartes : trajets, récapitulatif, paiement, billet. Le voyageur agit sur la carte.",
            "Il demande une confirmation avant toute réservation, tout paiement, toute annulation.",
            "Il dit quand il ne sait pas, et renvoie vers le guichet ou l'aide.",
          ],
        }}
        non={{
          titre: "Ce qu'il ne fait jamais",
          items: [
            "Demander un code secret, un code reçu par SMS ou un numéro de carte.",
            "Payer sans un geste du voyageur : la validation se fait sur son téléphone.",
            "Parler à la place d'une information officielle de trafic : il la cite.",
          ],
        }}
      />
    </Section>
  )
}
