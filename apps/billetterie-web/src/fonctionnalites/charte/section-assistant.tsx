"use client"

import { useEffect, useState } from "react"

import { SigneRuban, type SigneEtat } from "@workspace/ui/marque"

import { Regles, Section, SousTitre } from "./elements"

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
      numero="10"
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
      <p className="text-small text-ink-muted">
        Le nom et la voix restent à valider avec SETRAG. Ruban n’a ni visage ni âge et ne se présente jamais comme une personne. Son signe reprend
        le tracé du S, sans les rails ni l’orange du logo.
      </p>
      <SousTitre>Placement et façon de parler</SousTitre>
      <Regles
        oui={{
          titre: "À faire",
          items: [
            "Web : bouton en bas à droite, à 24 px des bords. Mobile : au-dessus de la barre d’onglets ; un appui long ouvre la voix.",
            "Masquer le bouton pendant le paiement, sur le billet plein écran et quand le clavier est ouvert.",
            "Dire l’heure, le prix ou le quai, puis ce que cela change. Deux phrases, puis une carte ; détailler sur demande.",
            "Citer la source d’une information de trafic et dire quand l’information manque. Vouvoyer le voyageur.",
          ],
        }}
        non={{
          titre: "À éviter",
          items: [
            "Animer le bouton au repos, le faire rebondir ou le colorer en bleu SETRAG.",
            "Remplacer le signe par une bulle de discussion ou des étincelles.",
            "Plaisanter sur un retard ou ajouter des émojis à une réponse.",
          ],
        }}
      />
      <SousTitre>La conversation et ses cartes</SousTitre>
      <div className="grid gap-3 md:grid-cols-2">
        {[
          ["Fenêtre web", "400 × 640 px, ancrée au bouton. Elle connaît la page et le trajet consultés ; la page /assistant donne accès à l’historique."],
          ["Feuille mobile", "Elle s’ouvre au-dessus de la page, puis peut occuper tout l’écran. Le fil et les actions restent les mêmes."],
          ["Cartes d’action", "Trajets, récapitulatif, paiement, billet ou modification : les composants de l’app dans le fil. Trois trajets au plus, deux boutons par carte."],
          ["Après une action", "La carte traitée se replie en une ligne de résumé. Seule la dernière carte du fil reste active."],
        ].map(([titre, texte]) => (
          <div key={titre} className="rounded-lg border border-line bg-surface p-4">
            <h4 className="font-semibold">{titre}</h4>
            <p className="mt-1 text-small text-ink-muted">{texte}</p>
          </div>
        ))}
      </div>
      <SousTitre>La voix</SousTitre>
      <p className="text-small text-ink-muted">
        Le micro du champ dicte un message ; le bouton au signe lance la conversation orale. Tout ce que Ruban dit s’écrit aussi à l’écran,
        avec les mêmes cartes que dans le fil écrit.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Écoute", "Les mots s’écrivent pendant que le voyageur parle. Une pause de 1 s termine la phrase."],
          ["Recherche", "Ruban annonce ce qu’il cherche. Pas plus de 3 s sans indication."],
          ["Réponse", "Trois phrases au plus ; les heures se disent en toutes lettres. Le texte suit à l’écran."],
          ["Interruption", "Le voyageur peut parler pendant la réponse : Ruban s’arrête et écoute."],
        ].map(([titre, texte]) => (
          <div key={titre} className="rounded-lg border border-line bg-surface p-4">
            <h4 className="font-semibold">{titre}</h4>
            <p className="mt-1 text-small text-ink-muted">{texte}</p>
          </div>
        ))}
      </div>
      <p className="text-small text-ink-muted">
        Une réservation, une modification ou une annulation se confirme par un toucher ou par un « oui » après la relecture du récapitulatif.
        Le paiement Mobile Money se valide sur le téléphone. Aucun code secret, code SMS ou numéro de carte n’est demandé à voix haute.
      </p>
      <SousTitre>Actions et confirmation</SousTitre>
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full min-w-[560px] text-left text-small">
          <thead className="bg-surface-sunk"><tr><th className="p-3">Action</th><th className="p-3">Ce qui la déclenche</th></tr></thead>
          <tbody className="divide-y divide-line">
            {[
              ["Chercher, répondre, suivre", "La question du voyageur."],
              ["Tenir des places", "Le choix d’un trajet ; les places se libèrent après 15 min."],
              ["Payer en Mobile Money", "Le bouton « Payer », puis la validation sur le téléphone."],
              ["Payer par carte", "Un formulaire sécurisé ouvert hors du fil."],
              ["Modifier", "La confirmation sur la carte avant / après."],
              ["Annuler, rembourser", "Un bouton qui nomme le billet concerné."],
            ].map(([action, declencheur]) => <tr key={action}><th scope="row" className="p-3 font-medium">{action}</th><td className="p-3 text-ink-muted">{declencheur}</td></tr>)}
          </tbody>
        </table>
      </div>
      <SousTitre>Le mouvement de Ruban</SousTitre>
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full min-w-[620px] text-left text-small">
          <thead className="bg-surface-sunk"><tr><th className="p-3">Moment</th><th className="p-3">Mouvement</th><th className="p-3">Durée</th></tr></thead>
          <tbody className="divide-y divide-line">
            {[
              ["Ouverture", "Montée depuis le bouton, sans rebond ; voile en fondu", "320 ms"],
              ["Première ouverture", "Le signe se trace une fois", "700 ms"],
              ["Réflexion", "Une rame parcourt le S après 400 ms d’attente", "1 600 ms, boucle"],
              ["Réponse", "Le texte s’écrit ; la carte monte de 6 px", "14 mots/s · 200 ms"],
              ["Écoute et parole", "L’épaisseur du ruban suit la voix", "Lissage 80 ms"],
              ["Carte traitée", "Elle se replie en une ligne", "200 ms"],
              ["Alerte", "Un point jaune apparaît, sans rebond", "200 ms"],
            ].map(([moment, mouvement, duree]) => <tr key={moment}><th scope="row" className="p-3 font-medium">{moment}</th><td className="p-3 text-ink-muted">{mouvement}</td><td className="tabular p-3">{duree}</td></tr>)}
          </tbody>
        </table>
      </div>
      <p className="text-small text-ink-muted">
        Ruban utilise les mêmes fonctions et la même session que l’interface. Une action sensible passe par un brouillon, puis par la
        confirmation du voyageur ; elle est inscrite au journal d’audit.
      </p>
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
