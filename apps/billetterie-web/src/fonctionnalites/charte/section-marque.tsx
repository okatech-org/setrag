"use client"

import { useState } from "react"
import {
  ArmchairIcon,
  BabyIcon,
  BellIcon,
  CircleCheckIcon,
  CircleXIcon,
  ClockAlertIcon,
  ClockIcon,
  CreditCardIcon,
  DogIcon,
  LuggageIcon,
  MapPinIcon,
  PackageIcon,
  RotateCcwIcon,
  RouteIcon,
  SmartphoneIcon,
  TicketIcon,
  TrainFrontIcon,
  TriangleAlertIcon,
  UsersIcon,
  WalletIcon,
  WifiOffIcon,
} from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { SAttente } from "@workspace/ui/components/empty-state"
import { Voie } from "@workspace/ui/components/voie"
import { Logo, LogoAnime, type LogoTheme } from "@workspace/ui/marque"
import { cn } from "@workspace/ui/lib/utils"

import { Planche, Regles, Section, SousTitre } from "./elements"

export function SectionConcept() {
  return (
    <Section
      id="concept"
      numero="01"
      titre="Le concept"
      intro="Trois éléments, trois rôles. On ne les mélange pas : la voie ne bouge pas, le ruban ne structure rien, le S n'apparaît qu'aux grands moments."
    >
      <div className="grid gap-4 md:grid-cols-3">
        {[
          {
            titre: "La voie",
            vis: <Voie className="w-full max-w-[220px] flex-none" />,
            texte:
              "Deux rails, des traverses. Elle relie deux informations : une heure de départ et une heure d'arrivée, deux étapes, deux moitiés de billet. Neutre, en gris de ligne, elle ne se voit que si on la cherche.",
          },
          {
            titre: "Le ruban",
            vis: <Voie etat="attente" className="w-full max-w-[220px] flex-none" />,
            texte:
              "Vert, jaune, bleu : le drapeau, toujours dans ce sens, le bleu en tête. Il glisse sur la voie pour dire « vous êtes ici », « ça avance », « c'est choisi ». C'est la seule couleur vive qui bouge à l'écran.",
          },
          {
            titre: "Le S",
            vis: <Logo variante="symbole" theme="couleur" title="" className="h-[84px] w-auto" />,
            texte:
              "La voie entière, en orange. Il signe : logo, icône d'app, démarrage, états vides. Dans l'interface, on n'en montre que des tronçons droits.",
          },
        ].map((carte) => (
          <div key={carte.titre} className="grid content-start gap-3 rounded-lg border border-line bg-surface p-5">
            <div className="grid h-[104px] place-items-center rounded-md bg-canvas">{carte.vis}</div>
            <h3 className="text-h4">{carte.titre}</h3>
            <p className="text-small text-ink-muted">{carte.texte}</p>
          </div>
        ))}
      </div>
    </Section>
  )
}

const TEMPS = [
  ["0,0 – 0,8 s", "La voie se pose", "Les traverses, puis les rails, d'un bout à l'autre du S."],
  ["0,6 – 1,6 s", "Le ruban la parcourt", "Il entre par le haut, du gabarit d'un train, et suit les rails en accélérant."],
  ["1,6 – 2,4 s", "Il sort et se couche", "Au pied du S, il s'affine, fait demi-tour et file sous le nom."],
  ["1,8 – 2,6 s", "Les lettres se lèvent", "Chacune apparaît quand le ruban passe sous elle."],
  ["2,5 – 2,9 s", "La signature", "Société d'Exploitation du Transgabonais, en fondu."],
] as const

const FONDS: { fond: "blanc" | "encre" | "bleu" | "photo"; theme: LogoTheme; etiquette: string }[] = [
  { fond: "blanc", theme: "couleur", etiquette: "Couleur · fond clair" },
  { fond: "encre", theme: "negatif", etiquette: "Négatif · fond encre" },
  { fond: "bleu", theme: "sur-bleu", etiquette: "Sur le bleu SETRAG" },
  { fond: "blanc", theme: "mono-encre", etiquette: "Une couleur · impression, tampons" },
  { fond: "photo", theme: "mono-blanc", etiquette: "Blanc · sur photo sombre" },
]

export function SectionLogo() {
  const [rejouer, setRejouer] = useState(0)
  return (
    <Section
      id="logo"
      numero="02"
      titre="Le logo"
      intro="La voie épurée : le logo historique redessiné en aplats, dans les couleurs du site setrag.eramet.com. Le mot est dessiné dans la police de l'interface, Schibsted Grotesk 800 italique. Le ruban souligne tout le nom, S compris : c'est la position où il se pose à la fin de l'animation."
    >
      <SousTitre>Le logo animé</SousTitre>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Planche className="min-h-[260px] p-8">
          <LogoAnime rejouer={rejouer} className="w-full max-w-[420px]" />
          <Button variant="ghost" size="sm" className="absolute right-3 bottom-3" onClick={() => setRejouer((n) => n + 1)}>
            <RotateCcwIcon />
            Rejouer
          </Button>
        </Planche>
        <ol className="grid content-center gap-3">
          {TEMPS.map(([temps, titre, texte]) => (
            <li key={titre} className="grid grid-cols-[92px_1fr] gap-x-3 text-small">
              <span className="tabular pt-0.5 text-[12.5px] text-ink-muted">{temps}</span>
              <span>
                <b className="block">{titre}</b>
                <span className="text-ink-muted">{texte}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
      <Regles
        oui={{
          titre: "Où il joue",
          items: [
            "Au démarrage à froid de l'app voyageur, une fois. Pas au retour au premier plan.",
            "À l'ouverture de la billetterie installée (PWA), sur l'écran de démarrage.",
            "Vidéos, écrans en gare, ouverture des présentations.",
          ],
        }}
        non={{
          titre: "Où il ne joue pas",
          items: [
            "En boucle, ou à chaque changement de page.",
            "Dans l'en-tête d'un site : le logo y est fixe.",
            "Si l'utilisateur a demandé moins d'animations : on affiche l'image finale.",
          ],
        }}
      />

      <SousTitre>Construction</SousTitre>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Planche className="min-h-[220px] p-10">
          <div className="outline-2 outline-offset-[18px] outline-accent-line outline-dashed">
            <Logo variante="complet" theme="couleur" title="" className="h-auto w-full max-w-[380px]" />
          </div>
        </Planche>
        <dl className="grid content-center gap-3 text-small">
          {[
            ["Module x", "Hauteur des capitales de ETRAG. Tout se mesure en x."],
            ["Le S", "2,5 x de haut. Son pied repose sur la ligne de base du mot."],
            ["Le ruban", "0,1 x d'épaisseur, 0,2 x sous la ligne de base, du pied du S à la fin du G."],
            ["La signature", "Même longueur que le ruban, 0,12 x sous lui."],
            ["Zone de protection", "0,5 x tout autour (pointillés). Rien n'y entre, pas même un autre logo."],
          ].map(([terme, def]) => (
            <div key={terme} className="grid grid-cols-[132px_1fr] gap-3">
              <dt className="font-semibold">{terme}</dt>
              <dd className="text-ink-muted">{def}</dd>
            </div>
          ))}
        </dl>
      </div>

      <SousTitre>Déclinaisons</SousTitre>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { vis: <Logo variante="complet" theme="couleur" title="" className="h-auto w-full max-w-[200px]" />, titre: "Complet", texte: "Documents, site, e-mails. 200 px de large au moins.", fichier: "setrag-logo.svg" },
          { vis: <Logo variante="compact" theme="couleur" title="" className="h-12 w-auto" />, titre: "Compact", texte: "En-têtes d'app et de site. 96 px au moins.", fichier: "setrag-logo-compact.svg" },
          { vis: <Logo variante="symbole-ruban" theme="couleur" title="" className="h-20 w-auto" />, titre: "Symbole et ruban", texte: "Formats carrés, avatar de réseau social.", fichier: "setrag-symbole-ruban.svg" },
          {
            vis: (
              // eslint-disable-next-line @next/next/no-img-element -- fichier livré tel quel, sans optimisation
              <img src="/marque/setrag-icone-app.svg" alt="" className="size-20 rounded-[22%] shadow-md" />
            ),
            titre: "Icône d'app",
            texte: "Symbole épaissi : tient à 29 pt.",
            fichier: "setrag-icone-app.svg",
          },
        ].map((d) => (
          <figure key={d.titre} className="grid gap-2">
            <Planche fond={d.titre === "Icône d'app" ? "creux" : "blanc"} className="min-h-[140px]">
              {d.vis}
            </Planche>
            <figcaption className="text-small">
              <b className="block">{d.titre}</b>
              <span className="text-ink-muted">{d.texte} </span>
              <a href={`/marque/${d.fichier}`} download className="font-semibold text-accent-ink underline underline-offset-2">
                SVG
              </a>
            </figcaption>
          </figure>
        ))}
      </div>

      <SousTitre>Sur chaque fond</SousTitre>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FONDS.map((f) => (
          <Planche key={f.etiquette} fond={f.fond} etiquette={f.etiquette} className="pt-10">
            <Logo variante="complet" theme={f.theme} title="" className="h-auto w-full max-w-[220px]" />
          </Planche>
        ))}
        <Planche fond="creux" etiquette="Jamais sur orange" className="pt-10">
          <div className="grid w-full place-items-center rounded-sm bg-brand-orange py-4">
            <Logo variante="complet" theme="mono-blanc" title="" className="h-auto w-full max-w-[180px] opacity-90" />
          </div>
          <span aria-hidden className="absolute inset-x-6 top-1/2 h-[3px] -rotate-12 rounded-pill bg-danger" />
        </Planche>
      </div>

      <SousTitre>À ne pas faire</SousTitre>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { classe: "scale-x-150", texte: "Déformer ou étirer." },
          { classe: "rotate-[-8deg]", texte: "Faire pivoter, ajouter une ombre ou un contour." },
          { classe: "[&_path[stroke]]:stroke-danger!", texte: "Remettre le S en rouge : c'est la couleur des erreurs." },
          { classe: "opacity-40 blur-[0.6px]", texte: "L'éclaircir ou le flouter sur une photo chargée." },
        ].map((d) => (
          <figure key={d.texte} className="grid gap-2">
            <Planche className="min-h-[120px]">
              <Logo variante="compact" theme="couleur" title="" className={cn("h-10 w-auto", d.classe)} />
              <span aria-hidden className="absolute top-2 right-3 font-bold text-danger-ink">
                ✕
              </span>
            </Planche>
            <figcaption className="text-small text-ink-muted">{d.texte}</figcaption>
          </figure>
        ))}
      </div>
    </Section>
  )
}

const MARQUE = [
  { nom: "Orange SETRAG", token: "--brand-orange", fond: "bg-brand-orange", valeur: "#FA6414 · oklch(0.686 0.199 42.3)", usage: "Le S uniquement. Jamais pour un statut." },
  { nom: "Bleu SETRAG", token: "--c-accent", fond: "bg-brand-bleu", valeur: "#0F50A0 · oklch(0.441 0.144 257)", usage: "Le mot, l'interface, le bouton principal." },
  { nom: "Ruban", token: "--brand-ruban", fond: "bg-ruban", valeur: "vert → jaune → bleu, interpolé en oklch", usage: "Ce qui glisse. Décor, jamais une information seule." },
  { nom: "Jaune", token: "--brand-jaune", fond: "bg-brand-jaune", valeur: "#FCDF49 · oklch(0.902 0.164 97.9)", usage: "Ruban ; texte sur bleu (5,9:1) ; pastilles." },
  { nom: "Vert Gabon", token: "--brand-vert", fond: "bg-brand-vert", valeur: "#009E60 · oklch(0.615 0.146 157)", usage: "Ruban seulement : le succès garde son propre vert." },
  { nom: "Indigo", token: "--brand-indigo", fond: "bg-brand-indigo", valeur: "#1A003B · oklch(0.189 0.103 295.7)", usage: "Titres éditoriaux : e-mails, PDF, pages institutionnelles." },
]

const INTERFACE = [
  { nom: "Fond", token: "--c-canvas", fond: "bg-canvas border-b border-line" },
  { nom: "Surface", token: "--c-surface", fond: "bg-surface border-b border-line" },
  { nom: "Ligne · rails", token: "--c-line-strong", fond: "bg-line-strong" },
  { nom: "Encre", token: "--c-ink", fond: "bg-ink" },
  { nom: "À l'heure, validé", token: "--c-success", fond: "bg-success" },
  { nom: "Retard", token: "--c-warning", fond: "bg-warning" },
  { nom: "Annulé, erreur", token: "--c-danger", fond: "bg-danger" },
  { nom: "Information", token: "--c-info", fond: "bg-info" },
]

export function SectionCouleurs() {
  return (
    <Section
      id="couleurs"
      numero="03"
      titre="Couleurs"
      intro="Deux familles. Celle de l'interface porte les écrans et les statuts. Celle de la marque est réservée au logo, au ruban et à deux usages repris du site : le bandeau d'information, jaune sur bleu, et les pastilles de mise en avant, bleu sur jaune."
    >
      <div>
        <div className="flex h-12 overflow-hidden rounded-md border border-line text-[12.5px] font-semibold" aria-label="Proportions des couleurs à l'écran">
          <span className="flex flex-[60] items-center bg-canvas px-3">Neutres · 60 %</span>
          <span className="flex flex-[22] items-center bg-accent-base px-3 text-ink-inverse">Bleu · 22 %</span>
          <span className="flex flex-[10] items-center bg-brand-encre px-3 text-white max-sm:text-[0px]">Encre · 10 %</span>
          <span className="flex-[5] bg-ruban" />
          <span className="flex-[3] bg-brand-orange" />
        </div>
        <p className="mt-2 text-caption text-ink-muted">Sur un écran type : le ruban et l’orange ne dépassent jamais 8 % de la surface.</p>
      </div>

      <SousTitre>Marque</SousTitre>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MARQUE.map((c) => (
          <figure key={c.nom} className="overflow-hidden rounded-md border border-line bg-surface">
            <span className={cn("block h-20", c.fond)} />
            <figcaption className="grid gap-0.5 p-4 text-small">
              <b>{c.nom}</b>
              <code className="font-mono text-[12.5px] text-accent-ink">{c.token}</code>
              <span className="tabular text-[12.5px] text-ink-muted">{c.valeur}</span>
              <em className="mt-1 text-ink-muted not-italic">{c.usage}</em>
            </figcaption>
          </figure>
        ))}
      </div>

      <SousTitre>Interface</SousTitre>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {INTERFACE.map((c) => (
          <figure key={c.nom} className="overflow-hidden rounded-md border border-line bg-surface">
            <span className={cn("block h-12", c.fond)} />
            <figcaption className="grid p-3 text-[13px]">
              <b>{c.nom}</b>
              <code className="font-mono text-[12px] text-ink-muted">{c.token}</code>
            </figcaption>
          </figure>
        ))}
      </div>
      <Regles
        oui={{
          titre: "Associations sûres",
          items: [
            "Jaune sur bleu SETRAG : 5,9:1, tout texte (bandeau d'information).",
            "Bleu sur jaune : pastille « Meilleur prix », « Promo ».",
            "Orange sur encre : 5,7:1, le S du billet et des écrans sombres.",
          ],
        }}
        non={{
          titre: "À proscrire",
          items: [
            "Texte orange sur blanc (3:1) sous 24 px.",
            "Texte sur le ruban, ou ruban en fond de bouton.",
            "Une couleur seule pour dire un statut : toujours une icône et un mot.",
          ],
        }}
      />
    </Section>
  )
}

const ECHELLE = [
  ["Display · 49", "text-display", "Owendo → Franceville"],
  ["Titre 1 · 39", "text-h1", "Vos billets"],
  ["Titre 2 · 31", "text-h2", "Choisissez votre classe"],
  ["Titre 3 · 25", "text-h3", "Express 201"],
  ["Titre 4 · 20", "text-h4", "Moyen de paiement"],
  ["Texte · 16", "text-body", "Votre train partira 12 min plus tard. Votre place est conservée."],
  ["Petit · 14", "text-small", "Places tenues 15 minutes pendant le paiement."],
  ["Légende · 12", "text-caption", "PK 338 · Booué"],
  ["Heure · mono 25", "text-time tabular", "07:40 → 19:25"],
] as const

export function SectionTypographie() {
  return (
    <Section
      id="typographie"
      numero="04"
      titre="Typographie"
      intro="Deux familles, servies en local. Le mot-symbole est dessiné dans la police de l'interface : le logo et les écrans parlent la même langue."
    >
      <div className="grid gap-4 md:grid-cols-3">
        {[
          { nom: "Schibsted Grotesk", specimen: "Aa", classe: "font-sans font-bold", texte: "Tout le texte d'interface, du titre à la légende. Graisses 400, 500, 600, 700." },
          { nom: "Schibsted Grotesk 800 italique", specimen: "ETRAG", classe: "font-sans font-extrabold italic text-brand-bleu dark:text-accent-base", texte: "Réservée au mot-symbole. Jamais pour un titre d'écran : l'italique n'existe pas ailleurs." },
          { nom: "IBM Plex Mono", specimen: "07:40", classe: "font-mono font-semibold", texte: "Heures, durées, points kilométriques, références de billet. Les chiffres s'alignent d'une ligne à l'autre." },
        ].map((f) => (
          <div key={f.nom} className="grid content-start gap-2 rounded-lg border border-line bg-surface p-5">
            <p className="text-caption text-ink-muted">{f.nom}</p>
            <p className={cn("text-[56px] leading-none", f.classe)}>{f.specimen}</p>
            <p className="text-small text-ink-muted">{f.texte}</p>
          </div>
        ))}
      </div>
      <div className="grid divide-y divide-line rounded-lg border border-line bg-surface">
        {ECHELLE.map(([nom, classe, texte]) => (
          <div key={nom} className="grid items-baseline gap-1 px-5 py-3 md:grid-cols-[150px_1fr] md:gap-4">
            <span className="text-caption text-ink-muted">{nom}</span>
            <p className={cn(classe, "min-w-0 max-md:text-[min(1em,9vw)] md:truncate")}>{texte}</p>
          </div>
        ))}
      </div>
    </Section>
  )
}

const ICONES = [
  [TrainFrontIcon, "Train"],
  [TicketIcon, "Billet"],
  [RouteIcon, "Trajet"],
  [MapPinIcon, "Gare"],
  [ClockIcon, "Horaire"],
  [ClockAlertIcon, "Retard"],
  [CircleXIcon, "Annulé"],
  [CircleCheckIcon, "À l'heure"],
  [ArmchairIcon, "Classe"],
  [UsersIcon, "Voyageurs"],
  [BabyIcon, "Enfant"],
  [LuggageIcon, "Bagage"],
  [DogIcon, "Animal"],
  [PackageIcon, "Colis"],
  [SmartphoneIcon, "Mobile Money"],
  [CreditCardIcon, "Carte"],
  [WalletIcon, "Wallet"],
  [WifiOffIcon, "Hors réseau"],
  [BellIcon, "Alerte"],
  [TriangleAlertIcon, "Info trafic"],
] as const

export function SectionIcones() {
  return (
    <Section
      id="icones"
      numero="05"
      titre="Icônes"
      intro="Lucide : trait de 2 px sur une grille de 24, extrémités arrondies. Une icône accompagne un mot ; elle ne le remplace que dans la barre d'onglets, où le libellé reste affiché."
    >
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 lg:grid-cols-10">
        {ICONES.map(([Icone, nom]) => (
          <figure key={nom} className="grid justify-items-center gap-2 rounded-md border border-line bg-surface px-1 py-4 text-center">
            <Icone className="size-6" aria-hidden />
            <figcaption className="text-[11.5px] leading-tight text-ink-muted">{nom}</figcaption>
          </figure>
        ))}
      </div>
    </Section>
  )
}

export function SectionVoie() {
  return (
    <Section
      id="voie"
      numero="06"
      titre="La voie et le ruban dans l'interface"
      intro="Dans les écrans, la voie est droite, grise et fine ; le ruban y glisse pour un état précis. Chaque usage est un composant, construit une fois dans packages/ui et porté dans packages/mobile-ui."
    >
      <div className="grid gap-4 md:grid-cols-3">
        <div className="grid content-start gap-3 rounded-lg border border-line bg-surface p-5">
          <div className="grid h-[104px] place-items-center gap-1 rounded-md bg-canvas px-5">
            <div className="flex w-full items-center gap-3 font-mono text-[18px] font-semibold">
              07:40
              <Voie etat="pleine" />
              19:25
            </div>
          </div>
          <h3 className="text-h4">Trajet</h3>
          <p className="text-small text-ink-muted">La voie relie départ et arrivée. Le ruban la remplit quand le trajet est choisi.</p>
        </div>
        <div className="grid content-start gap-3 rounded-lg border border-line bg-surface p-5">
          <div className="grid h-[104px] place-items-center rounded-md bg-canvas px-5">
            <Voie etat="attente" className="w-full max-w-[220px] flex-none" />
          </div>
          <h3 className="text-h4">Attente</h3>
          <p className="text-small text-ink-muted">Une rame passe, 1,6 s, sans fin. Seulement pour une attente de plus d’une seconde, toujours avec une phrase.</p>
        </div>
        <div className="grid content-start gap-3 rounded-lg border border-line bg-surface p-5">
          <div className="grid h-[104px] place-items-center rounded-md bg-canvas">
            <SAttente className="h-[84px] w-auto" />
          </div>
          <h3 className="text-h4">État vide</h3>
          <p className="text-small text-ink-muted">Le S en gris, la rame à quai en haut : rien ne roule encore. Jamais animé.</p>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full min-w-[560px] text-small">
          <thead className="bg-surface-sunk text-left text-caption text-ink-muted">
            <tr>
              <th className="px-4 py-2.5">Élément</th>
              <th className="px-4 py-2.5">Web</th>
              <th className="px-4 py-2.5">Mobile</th>
              <th className="px-4 py-2.5">Couleur</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {[
              ["Rails", "2 × 1,5 px, entraxe 6,5 px", "2 × 1,5 pt", "--c-line-strong"],
              ["Traverses", "2 px tous les 7 px, 14 px de long", "idem en pt", "--c-line"],
              ["Ruban sur la voie", "8 px de haut, rayon 4", "8 pt", "--brand-ruban"],
              ["Ruban indicateur", "3 px, sous l'onglet", "3 pt, au-dessus de l'onglet", "--brand-ruban"],
              ["Rame d'attente", "34 % de la voie", "34 %", "ruban, bleu en tête"],
            ].map(([el, web, mobile, couleur]) => (
              <tr key={el}>
                <td className="px-4 py-2.5 font-semibold">{el}</td>
                <td className="tabular px-4 py-2.5">{web}</td>
                <td className="tabular px-4 py-2.5">{mobile}</td>
                <td className="px-4 py-2.5">
                  <code className="font-mono text-[12.5px] text-accent-ink">{couleur}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  )
}

export function SectionTon() {
  return (
    <Section
      id="ton"
      numero="10"
      titre="Le ton"
      intro="Ce qu'on écrit compte autant que ce qu'on montre. Des phrases courtes, un fait, puis ce que ça change pour le voyageur."
    >
      <div className="grid gap-4 md:grid-cols-2">
        {[
          ["Incident d'exploitation", "Votre train partira 12 min plus tard. Votre place est conservée."],
          ["Transaction en cours de traitement", "Validez le paiement sur votre téléphone. Vos places sont tenues 15 minutes."],
          ["Erreur 503", "Pas de réseau. Vos billets restent consultables."],
          ["Aucun résultat", "Pas de train ce jour-là. Le prochain part samedi à 07:40."],
        ].map(([non, oui]) => (
          <div key={non} className="grid gap-2 rounded-lg border border-line bg-surface p-5">
            <p className="text-small text-ink-muted line-through decoration-danger">« {non} »</p>
            <p className="text-body font-semibold">« {oui} »</p>
          </div>
        ))}
      </div>
    </Section>
  )
}
