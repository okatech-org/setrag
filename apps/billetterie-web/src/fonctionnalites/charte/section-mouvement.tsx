"use client"

import { useState } from "react"
import { CircleCheckIcon, RotateCcwIcon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { Feuille } from "@workspace/ui/components/feuille"
import { ToastBar } from "@workspace/ui/components/inline-message"
import { LigneArrets } from "@workspace/ui/components/ligne-arrets"
import { NavRuban } from "@workspace/ui/components/indicateur"
import { Stepper } from "@workspace/ui/components/stepper"
import { Chargeur, Voie } from "@workspace/ui/components/voie"
import { BandeauTrafic } from "@workspace/ui/voyage/bandeau-trafic"
import { Billet } from "@workspace/ui/voyage/billet"
import { CarteTrajet } from "@workspace/ui/voyage/carte-trajet"
import { PastilleDesserte } from "@workspace/ui/voyage/statut"
import { LogoAnime } from "@workspace/ui/marque"
import { cn } from "@workspace/ui/lib/utils"

import { Demo, Fiche, Regles, Section, SousTitre } from "./elements"

const DUREES = [
  ["--dur-micro", "90 ms", "Réponse au doigt : pression d'un bouton."],
  ["--dur-fast", "120 ms", "Survol, fondu d'un contenu d'onglet."],
  ["--dur-base", "200 ms", "Bordure, bandeau, toast, cascade des résultats."],
  ["--dur-slow", "320 ms", "Feuille, choix segmenté."],
  ["--dur-glisse", "480 ms", "Le ruban se déplace : onglet, jour, trajet, étape."],
  ["--dur-boucle", "1 600 ms", "Un passage de rame, pendant une attente réelle."],
] as const

const COURBES = [
  ["--ease", "cubic-bezier(0.2, 0.8, 0.2, 1)", "Réponse : part vite, se pose doucement."],
  ["--ease-glisse", "cubic-bezier(0.45, 0, 0.2, 1)", "Glissement : départ progressif, arrivée douce, comme un train."],
  ["--ease-sortie", "cubic-bezier(0.4, 0, 1, 1)", "Sortie : ce qui part accélère, et part plus vite qu'il n'est venu."],
] as const

const ARRETS = [
  { nom: "Lopé", heure: "12:14", passe: true },
  { nom: "Booué", heure: "13:07", majeur: true },
  { nom: "Ivindo", heure: "14:02" },
  { nom: "Lastourville", heure: "15:50", majeur: true },
]

const LOTTIE = [
  ["logo-anime", "3,3 s", "Démarrage de l’app"],
  ["logo-anime-negatif", "3,3 s", "Démarrage en thème sombre"],
  ["logo-anime-compact", "3,3 s", "Petits écrans, sans signature"],
  ["symbole-anime", "2,8 s", "Formats carrés et vidéos courtes"],
  ["chargement-voie", "1,6 s · boucle", "Attente longue sur mobile"],
  ["chargement-s", "2,2 s · boucle", "Premier chargement plein écran"],
  ["ruban-apparition", "700 ms", "Première ouverture de Ruban"],
  ["ruban-reflexion", "1,6 s · boucle", "Réflexion de Ruban"],
] as const

function Rejouer({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" size="sm" onClick={onClick}>
      <RotateCcwIcon />
      Jouer
    </Button>
  )
}

export function SectionMouvement() {
  const [onglet, setOnglet] = useState("reserver")
  const [trajetChoisi, setTrajetChoisi] = useState(false)
  const [etape, setEtape] = useState(1)
  const [enCours, setEnCours] = useState(false)
  const [filet, setFilet] = useState(false)
  const [liste, setListe] = useState(0)
  const [billet, setBillet] = useState(0)
  const [retard, setRetard] = useState(12)
  const [rame, setRame] = useState(0.4)
  const [messages, setMessages] = useState(0)
  const [feuille, setFeuille] = useState(false)
  const [logo, setLogo] = useState(0)
  const [actualiser, setActualiser] = useState(0)

  const payer = () => {
    setEnCours(true)
    window.setTimeout(() => setEnCours(false), 2600)
  }
  const naviguer = () => {
    setFilet(true)
    window.setTimeout(() => setFilet(false), 2200)
  }

  return (
    <Section
      id="mouvement"
      numero="07"
      titre="Le mouvement"
      intro="Des animations qu'on ne remarque pas. Une seule chose bouge à la fois ; la réponse au doigt est immédiate ; l'information s'affiche tout de suite, l'animation l'accompagne sans la retenir ; les boucles sont réservées aux attentes réelles, toujours avec une phrase."
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          ["Une chose à la fois", "Si le ruban glisse, le contenu attend ou se contente d’un fondu."],
          ["Au doigt, tout de suite", "Une pression répond en 90 ms ; l’écran reste utilisable pendant toute l’animation."],
          ["L’information d’abord", "Le prix, l’heure et le statut s’affichent sans attendre la fin du mouvement."],
          ["Une boucle pour attendre", "La rame tourne seulement pendant une attente réelle, avec une phrase qui dit ce qu’on attend."],
        ].map(([titre, texte]) => (
          <div key={titre} className="rounded-lg border border-line bg-surface p-4">
            <h3 className="font-semibold">{titre}</h3>
            <p className="mt-1 text-small text-ink-muted">{texte}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="overflow-hidden rounded-lg border border-line bg-surface">
          <h3 className="border-b border-line px-5 py-3 text-[15px] font-bold">Durées</h3>
          <dl className="divide-y divide-line">
            {DUREES.map(([token, duree, usage]) => (
              <div key={token} className="grid grid-cols-[118px_76px_1fr] items-baseline gap-3 px-5 py-2.5 text-small max-sm:grid-cols-[1fr_auto]">
                <dt>
                  <code className="font-mono text-[12.5px] text-accent-ink">{token}</code>
                </dt>
                <dd className="tabular text-right font-semibold sm:text-left">{duree}</dd>
                <dd className="text-ink-muted max-sm:col-span-2">{usage}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="overflow-hidden rounded-lg border border-line bg-surface">
          <h3 className="border-b border-line px-5 py-3 text-[15px] font-bold">Courbes</h3>
          <dl className="divide-y divide-line">
            {COURBES.map(([token, valeur, usage]) => (
              <div key={token} className="grid gap-1 px-5 py-3 text-small">
                <dt className="flex flex-wrap items-baseline gap-x-3">
                  <code className="font-mono text-[12.5px] text-accent-ink">{token}</code>
                  <span className="tabular text-[12px] text-ink-muted">{valeur}</span>
                </dt>
                <dd>{usage}</dd>
                <dd aria-hidden className="relative mt-1 h-2 overflow-hidden rounded-pill bg-surface-sunk">
                  <span
                    className="bg-ruban absolute inset-y-0 left-0 w-1/4 rounded-pill"
                    style={{ animation: `st-rame 1800ms var(${token}) infinite` }}
                  />
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <SousTitre>Le catalogue</SousTitre>
      <div className="grid gap-4">
        <Demo
          scene={
            <Button size="lg" className="active:scale-[0.98]">
              Rechercher
            </Button>
          }
          fiche={
            <Fiche titre="Pression" regles={[["Durée", "90 ms · retour 160 ms"], ["Effet", "échelle 0,98"]]}>
              Le bouton s’enfonce sous le doigt. Appuyez.
            </Fiche>
          }
        />
        <Demo
          scene={
            <NavRuban actif={onglet} aria-label="Démonstration d'onglets" className="flex gap-1 border-b border-line">
              {[
                ["reserver", "Réserver"],
                ["billets", "Billets"],
                ["suivi", "Suivi"],
              ].map(([cle, libelle]) => (
                <button
                  key={cle}
                  type="button"
                  data-actif={onglet === cle}
                  aria-pressed={onglet === cle}
                  onClick={() => setOnglet(cle!)}
                  className={cn("h-11 px-4 text-[15px] font-semibold", onglet === cle ? "text-ink" : "text-ink-muted hover:text-ink")}
                >
                  {libelle}
                </button>
              ))}
            </NavRuban>
          }
          fiche={
            <Fiche titre="Onglet" chemin="NavRuban" regles={[["Durée", "480 ms · --ease-glisse"], ["Contenu", "fondu 120 ms, sans glissement"]]}>
              Le ruban glisse vers l’onglet choisi. Cliquez les onglets.
            </Fiche>
          }
        />
        <Demo
          sceneClassName="place-items-stretch"
          scene={
            <CarteTrajet
              depart={{ heure: "07:40", gare: "Owendo" }}
              arrivee={{ heure: "19:25", gare: "Franceville" }}
              duree="11 h 45"
              train="Express 201"
              prix={{ montant: "24 500", avant: "dès", apres: "XAF" }}
              etat={trajetChoisi ? "choisi" : "defaut"}
              onChoisir={() => setTrajetChoisi((v) => !v)}
            />
          }
          fiche={
            <Fiche titre="Trajet choisi" regles={[["Durée", "480 ms · --ease-glisse"], ["Avec", "bordure accent, 200 ms"]]}>
              Le ruban remplit la voie entre les heures. Touchez la carte.
            </Fiche>
          }
        />
        <Demo
          sceneClassName="place-items-stretch content-center"
          scene={<Stepper steps={[{ label: "Trajet" }, { label: "Voyageurs" }, { label: "Paiement" }, { label: "Billet" }]} current={etape} />}
          fiche={
            <Fiche titre="Étape suivante" chemin="Stepper" regles={[["Durée", "480 ms · --ease-glisse"]]}>
              Le ruban avance jusqu’à la gare suivante, qui s’allume à l’arrivée.{" "}
              <Button variant="ghost" size="sm" onClick={() => setEtape((e) => (e + 1) % 4)}>
                Étape suivante
              </Button>
            </Fiche>
          }
        />
        <Demo
          scene={
            <Button size="lg" loading={enCours} onClick={payer}>
              Payer 48 750 XAF
            </Button>
          }
          fiche={
            <Fiche titre="Bouton en attente" regles={[["Boucle", "1 600 ms · --ease-glisse"], ["Seuil", "après 300 ms seulement"]]}>
              Le libellé ne change pas ; une rame passe sous le texte tant que l’action tourne. Cliquez le bouton.
            </Fiche>
          }
        />
        <Demo
          sceneClassName="place-items-stretch content-center"
          scene={<Chargeur>Recherche des trains…</Chargeur>}
          fiche={
            <Fiche titre="Attente longue" chemin="Chargeur" regles={[["Boucle", "1 600 ms"], ["Seuil", "au-delà de 1 s ; avant, squelettes"]]}>
              Recherche, validation Mobile Money : une rame passe, avec une phrase.
            </Fiche>
          }
        />
        <Demo
          sceneClassName="place-items-stretch"
          scene={
            <div className="relative h-28 overflow-hidden rounded-md border border-line bg-surface">
              <span data-actif={filet || undefined} className="filet-ruban absolute!" />
              <div className="flex gap-2 border-b border-line p-3">
                <i className="h-2.5 w-16 rounded-pill bg-surface-sunk" />
                <i className="h-2.5 w-10 rounded-pill bg-surface-sunk" />
                <i className="h-2.5 w-12 rounded-pill bg-surface-sunk" />
              </div>
            </div>
          }
          fiche={
            <Fiche titre="Changement de page" regles={[["Seuil", "après 150 ms de chargement"], ["Boucle", "1 600 ms"]]}>
              Le ruban traverse le filet du haut pendant le chargement de la page suivante. <Rejouer onClick={naviguer} />
            </Fiche>
          }
        />
        <Demo
          sceneClassName="place-items-stretch"
          scene={
            <div key={liste} className="st-apparait grid gap-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} style={{ "--i": i } as React.CSSProperties} className="h-9 rounded-sm border border-line bg-surface" />
              ))}
            </div>
          }
          fiche={
            <Fiche titre="Arrivée des résultats" regles={[["Durée", "200 ms · décalage 28 ms"]]}>
              Les cartes montent de 6 px en cascade courte. Au-delà de la sixième, elles sont déjà là. <Rejouer onClick={() => setListe((n) => n + 1)} />
            </Fiche>
          }
        />
        <Demo
          sceneClassName="bg-surface-sunk"
          scene={
            <Billet
              key={billet}
              emis={billet > 0}
              fondDecoupe="var(--c-surface-sunk)"
              className="w-full max-w-[420px]"
              depart={{ heure: "07:40", gare: "Owendo" }}
              arrivee={{ heure: "19:25", gare: "Franceville" }}
              milieu="11 h 45"
              train="Express 201 · ven. 2 oct."
              cases={[
                { libelle: "Voiture", valeur: "4" },
                { libelle: "Place", valeur: "32" },
                { libelle: "Classe", valeur: "2e" },
              ]}
            />
          }
          fiche={
            <Fiche titre="Billet émis" regles={[["Durée", "720 ms · --ease-glisse"], ["Haptique", "impact léger, à l'arrivée (mobile)"]]}>
              Le ruban traverse la découpe, une fois. <Rejouer onClick={() => setBillet((n) => n + 1)} />
            </Fiche>
          }
        />
        <Demo
          scene={<PastilleDesserte statut="retarde" retard={retard} />}
          fiche={
            <Fiche titre="Retard mis à jour" regles={[["Durée", "240 ms · --ease"]]}>
              Le nouveau chiffre remplace l’ancien en montant. Pas de clignotement, pas de secousse.{" "}
              <Rejouer onClick={() => setRetard((r) => (r >= 25 ? 12 : r + 3))} />
            </Fiche>
          }
        />
        <Demo
          sceneClassName="place-items-stretch"
          scene={<LigneArrets arrets={ARRETS} rame={rame} pas={40} />}
          fiche={
            <Fiche titre="Rame du suivi" chemin="LigneArrets" regles={[["Durée", "1 200 ms · --ease-glisse"], ["Rythme", "à la mise à jour, jamais en continu"]]}>
              La rame avance d’un cran à chaque mise à jour du statut, puis s’arrête.{" "}
              <Rejouer onClick={() => setRame((r) => (r >= 2.4 ? 0.4 : r + 0.5))} />
            </Fiche>
          }
        />
        <Demo
          sceneClassName="place-items-stretch content-between"
          scene={
            <div key={messages} className="grid gap-6">
              <BandeauTrafic titre="Travaux" arrondi className="animate-[st-descend_200ms_var(--ease)_both]">
                samedi : départs +25 min. Vos places sont conservées.
              </BandeauTrafic>
              <ToastBar className="animate-[st-monte_200ms_var(--ease)_both]">
                <span className="inline-flex items-center gap-2">
                  <CircleCheckIcon className="size-[18px]" aria-hidden />
                  Billets ajoutés à Wallet
                </span>
              </ToastBar>
            </div>
          }
          fiche={
            <Fiche titre="Bandeau et toast" regles={[["Entrée", "200 ms · --ease"], ["Sortie", "160 ms · --ease-sortie"]]}>
              Le bandeau descend du haut, le toast monte du bas. Ils partent plus vite qu’ils n’arrivent.{" "}
              <Rejouer onClick={() => setMessages((n) => n + 1)} />
            </Fiche>
          }
        />
        <Demo
          scene={
            <>
              <Button variant="secondary" onClick={() => setFeuille(true)}>
                Ouvrir la feuille
              </Button>
              <Feuille
                open={feuille}
                onOpenChange={setFeuille}
                titre="Gare de départ"
                description="Sur mobile, tirez la poignée vers le bas pour fermer."
                pied={
                  <Button block onClick={() => setFeuille(false)}>
                    Valider
                  </Button>
                }
              >
                <ul className="grid divide-y divide-line">
                  {["Owendo", "Ntoum", "Ndjolé", "Booué", "Lastourville", "Franceville"].map((gare) => (
                    <li key={gare} className="py-3 text-body">
                      {gare}
                    </li>
                  ))}
                </ul>
              </Feuille>
            </>
          }
          fiche={
            <Fiche titre="Feuille" chemin="Feuille" regles={[["Durée", "320 ms · --ease"], ["Voile", "fondu 200 ms"], ["Grand écran", "fenêtre centrée"]]}>
              Choix de la gare, filtres : la feuille monte et se pose, sans rebond.
            </Fiche>
          }
        />
        <Demo
          scene={
            <div key={actualiser} className="grid w-full max-w-[280px] justify-items-center gap-4 rounded-md border border-line bg-surface p-6">
              <div className="relative w-full animate-[st-monte_620ms_var(--ease)_both]">
                <Voie etat={actualiser > 0 ? "attente" : "vide"} className="w-full flex-none" />
              </div>
              <span className="text-small text-ink-muted">Tirez pour actualiser</span>
            </div>
          }
          fiche={
            <Fiche titre="Tirer pour actualiser" regles={[["Geste", "la voie suit le doigt, sans durée imposée"], ["Après le geste", "rame de 1 600 ms jusqu’à la réponse"]]}>
              Le ruban prend le relais pendant l’actualisation. <Rejouer onClick={() => setActualiser((n) => n + 1)} />
            </Fiche>
          }
        />
        <Demo
          sceneClassName="bg-[var(--c-surface)]"
          scene={<LogoAnime variante="compact" rejouer={logo} className="w-full max-w-[300px]" />}
          fiche={
            <Fiche titre="Logo animé" chemin="LogoAnime" regles={[["Durée", "3,3 s · Lottie"], ["Sortie", "dès 2,4 s si l'app est prête"]]}>
              À l’ouverture de l’app installée, une fois. <Rejouer onClick={() => setLogo((n) => n + 1)} />
            </Fiche>
          }
        />
      </div>

      <SousTitre>Fichiers Lottie</SousTitre>
      <p className="text-small text-ink-muted">
        Ces fichiers reprennent la géométrie du logo et du signe. Les calques du logo sont nommés (traverses, rails, ruban, mot,
        signature) pour adapter leur couleur dans l’app mobile. Les animations de chargement ne tournent que pendant une attente.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {LOTTIE.map(([nom, duree, usage]) => (
          <div key={nom} className="flex min-w-0 items-start justify-between gap-3 rounded-lg border border-line bg-surface p-4">
            <div className="min-w-0">
              <h3 className="break-all font-mono text-[13px] font-semibold">{nom}</h3>
              <p className="mt-1 text-small text-ink-muted">{usage}</p>
              <p className="tabular mt-1 text-caption">{duree}</p>
            </div>
            <a href={`/charte/lottie/${nom}.json`} download className="shrink-0 text-small font-semibold text-accent-ink underline underline-offset-2">JSON</a>
          </div>
        ))}
      </div>

      <SousTitre>Moins d’animations</SousTitre>
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full min-w-[570px] text-left text-small">
          <thead className="bg-surface-sunk"><tr><th className="p-3">Animation</th><th className="p-3">Si le système réduit les animations</th></tr></thead>
          <tbody className="divide-y divide-line">
            {[
              ["Logo animé", "Image finale affichée directement"],
              ["Ruban : onglets, jours, trajet, étapes", "Il apparaît à sa place, en fondu de 120 ms"],
              ["Rame et bouton en attente", "Ruban fixe au milieu de la voie ; la phrase reste"],
              ["Billet émis", "Découpe remplie d’emblée ; vibration légère conservée"],
              ["Résultats, bandeau, toast, feuille", "Fondu seul, sans déplacement"],
              ["Rame du suivi", "Elle passe directement à sa nouvelle position"],
            ].map(([animation, reduite]) => <tr key={animation}><th scope="row" className="p-3 font-medium">{animation}</th><td className="p-3 text-ink-muted">{reduite}</td></tr>)}
          </tbody>
        </table>
      </div>
      <Regles
        oui={{
          titre: "Ce qui reste",
          items: [
            "Les états finaux : ruban posé sous l'onglet, voie remplie, étape atteinte.",
            "La rame d'attente, immobile au centre de la voie, avec sa phrase.",
            "Le logo fixe à la place du logo animé.",
          ],
        }}
        non={{
          titre: "Ce qui s'arrête",
          items: [
            "Tout glissement, toute cascade, toute boucle décorative.",
            "L'animation du logo et le tracé du signe de Ruban.",
            "Le mouvement de la feuille : elle apparaît en fondu.",
          ],
        }}
      />
      <SousTitre>Mise en œuvre</SousTitre>
      <div className="grid gap-3 md:grid-cols-3">
        {[
          ["Web", "Animer transform et opacity ; utiliser la propriété --p pour le remplissage du ruban. Charger le logo animé à la demande."],
          ["Mobile", "Reanimated suit la courbe de glissement, Lottie joue le logo et les attentes, une vibration légère suit l’émission du billet."],
          ["Hors de l’app", "Widgets et activités en direct n’ont pas d’animation propre. Le système anime le changement de valeur publié."],
        ].map(([titre, texte]) => <div key={titre} className="rounded-lg border border-line bg-surface p-4"><h3 className="font-semibold">{titre}</h3><p className="mt-1 text-small text-ink-muted">{texte}</p></div>)}
      </div>
      <Regles
        oui={{ titre: "Toujours", items: ["Animer transform et opacity à 60 images par seconde.", "Laisser l’écran utilisable pendant l’animation.", "Vérifier le mode « moins d’animations » avant une livraison."] }}
        non={{ titre: "Jamais", items: ["Rebond, élastique ou secousse sur une erreur.", "Parallaxe, animation au défilement ou confettis.", "Roue qui tourne : l’attente est montrée par la voie."] }}
      />
    </Section>
  )
}
