import { BellIcon, Clock3Icon, MapPinIcon, TrainFrontIcon } from "lucide-react"

import { Voie } from "@workspace/ui/components/voie"
import { CodeAztec } from "@workspace/ui/components/code-aztec"
import { Logo } from "@workspace/ui/marque"

import { Regles, Section, SousTitre } from "./elements"

const INFOS = [
  ["Quai", "1"],
  ["Voiture", "4"],
  ["Place", "32"],
  ["Embarq.", "07:10"],
] as const

const NOTIFICATIONS = [
  {
    type: "Retard ou suppression",
    titre: "Express 201 · 12 min de retard",
    texte: "Arrivée prévue à Franceville à 19:37. Votre place est conservée.",
    quand: "Dès le changement de statut",
    canal: "Push ; SMS sans app",
  },
  {
    type: "Rappel",
    titre: "Embarquement à 07:10, quai 1",
    texte:
      "Express 201 pour Franceville. Votre billet est prêt, même sans réseau.",
    quand: "30 min avant l’embarquement",
    canal: "Push",
  },
  {
    type: "Achat",
    titre: "2 billets émis",
    texte: "Owendo → Franceville, vendredi 2 octobre. Réf. STG-7K4Q2P.",
    quand: "Paiement reçu, billets émis",
    canal: "Push ; reçu par SMS",
  },
  {
    type: "Remboursement",
    titre: "Omnibus 405 supprimé",
    texte: "Remboursement de 12 000 XAF lancé sur votre compte Airtel Money.",
    quand: "Lancé, puis effectué",
    canal: "Push ; e-mail",
  },
] as const

function Symbole({ inverse = false }: { inverse?: boolean }) {
  return (
    <Logo
      variante="symbole"
      theme={inverse ? "mono-blanc" : "couleur"}
      title=""
      className="h-7 w-auto shrink-0"
    />
  )
}

function DonneesVoyage({
  depart = "07:40",
  arrivee = "19:25",
  rempli = 1,
}: {
  depart?: string
  arrivee?: string
  rempli?: number
}) {
  return (
    <div className="text-small flex items-center gap-2">
      <span className="tabular font-semibold">
        {depart}
        <small className="block font-sans font-normal text-ink-muted">
          Owendo
        </small>
      </span>
      <Voie
        etat={rempli === 1 ? "pleine" : "vide"}
        rempli={rempli}
        className="min-w-6"
      />
      <span className="tabular text-right font-semibold">
        {arrivee}
        <small className="block font-sans font-normal text-ink-muted">
          Franceville
        </small>
      </span>
    </div>
  )
}

function Infos({ wallet = false }: { wallet?: boolean }) {
  const infos = wallet
    ? [
        ["Date", "2 oct."],
        ["Voiture", "4"],
        ["Place", "32"],
        ["Quai", "1"],
      ]
    : INFOS
  return (
    <dl className="grid grid-cols-4 gap-2 border-t border-line pt-3 text-[12px]">
      {infos.map(([nom, valeur]) => (
        <div key={nom}>
          <dt className="text-ink-muted">{nom}</dt>
          <dd className="tabular mt-0.5 font-semibold">{valeur}</dd>
        </div>
      ))}
    </dl>
  )
}

export function SectionWidgets() {
  return (
    <Section
      id="widgets"
      numero="09"
      titre="Widgets & Live"
      intro="Le prochain voyage reste lisible sans ouvrir l’app : widgets, écran verrouillé, activité en direct, notifications et Wallet. La voie relie les gares ; le ruban n’avance que lorsqu’une nouvelle position estimée est publiée. Les données ci-dessous sont fictives."
    >
      <div className="text-small rounded-lg border border-line bg-surface p-5">
        <h3 className="font-semibold">D’où viennent les informations</h3>
        <p className="mt-1 text-ink-muted">
          Le statut de desserte publié par le backend (planifié, à l’heure,
          retardé, supprimé ou terminé) alimente ces surfaces par notification.
          La position du train est estimée d’après l’horaire et le retard
          annoncé, sans GPS. Dès qu’on montre cette position, on indique l’heure
          de sa dernière mise à jour.
        </p>
      </div>

      <SousTitre>Widgets de l’écran d’accueil</SousTitre>
      <p className="text-small text-ink-muted">
        Petit : l’heure et le quai. Moyen : le trajet et la place. Grand : le
        voyage en cours, gare par gare. Toucher un widget ouvre le billet
        correspondant.
      </p>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <figure className="grid gap-2">
          <div className="grid min-h-40 content-between rounded-[20px] border border-line bg-surface p-4 shadow-sm">
            <div className="text-small flex items-center gap-2 font-semibold">
              <Symbole /> Express 201
            </div>
            <div className="tabular text-[32px] leading-none font-semibold">
              07:40
            </div>
            <div className="text-caption text-ink-muted">
              Owendo → Franceville
            </div>
            <div className="text-small flex justify-between border-t border-line pt-2">
              <span>
                Quai <b>1</b>
              </span>
              <span>
                dans <b>48 min</b>
              </span>
            </div>
          </div>
          <figcaption className="text-caption text-ink-muted">
            Petit · l’heure domine, en chiffres mono.
          </figcaption>
        </figure>
        <figure className="grid gap-2">
          <div className="grid min-h-40 content-between gap-4 rounded-[20px] border border-line bg-surface p-4 shadow-sm">
            <div className="text-small flex flex-wrap items-center gap-2 font-semibold">
              <Symbole /> Prochain train · ven. 2 oct.
              <span className="text-caption ml-auto rounded-pill bg-success-soft px-2 py-1 text-success-ink">
                À l’heure
              </span>
            </div>
            <DonneesVoyage />
            <Infos />
          </div>
          <figcaption className="text-caption text-ink-muted">
            Moyen · trajet, statut, quai, voiture et place.
          </figcaption>
        </figure>
      </div>
      <figure className="grid gap-2">
        <div className="grid gap-4 rounded-[20px] border border-line bg-surface p-4 shadow-sm sm:p-5">
          <div className="text-small flex flex-wrap items-center gap-2 font-semibold">
            <Symbole /> Express 201 · en route{" "}
            <span className="text-caption ml-auto rounded-pill bg-warning-soft px-2 py-1 text-warning-ink">
              +12 min
            </span>
          </div>
          <div className="flex flex-wrap justify-between gap-3">
            <div>
              <span className="text-caption block text-ink-muted">
                Prochain arrêt
              </span>
              <b className="tabular text-h4">Booué · 13:07</b>
            </div>
            <div>
              <span className="text-caption block text-ink-muted">
                Arrivée à Franceville
              </span>
              <b className="tabular">19:37</b>
            </div>
          </div>
          <Voie rempli={0.46} className="w-full flex-none" />
          <ol className="text-caption flex flex-wrap justify-between gap-2">
            <li className="text-ink-muted">Lopé · 12:14</li>
            <li className="font-semibold text-accent-ink">Booué · 13:07</li>
            <li>Lastourville · 15:50</li>
            <li>Franceville · 19:37</li>
          </ol>
          <p className="text-caption text-ink-muted">
            Position estimée · mise à jour à 12:16
          </p>
        </div>
        <figcaption className="text-caption text-ink-muted">
          Grand · le prochain arrêt et la progression pendant le voyage.
        </figcaption>
      </figure>
      <Regles
        oui={{
          titre: "Dans un widget",
          items: [
            "L’heure de départ est l’information la plus grande, toujours en chiffres mono.",
            "Un retard est chiffré en minutes et l’heure montrée est l’heure réelle.",
            "Le widget ouvre le billet, directement.",
          ],
        }}
        non={{
          titre: "À éviter",
          items: [
            "Le logo complet : le symbole suffit quand le nom de l’app est déjà affiché.",
            "Une animation continue : le widget ne change qu’à sa mise à jour.",
          ],
        }}
      />

      <SousTitre>Écran verrouillé et activité en direct</SousTitre>
      <p className="text-small text-ink-muted">
        L’activité démarre 2 h avant le départ et s’arrête à l’arrivée. Avant le
        départ, elle montre le compte à rebours, le quai et la place. Pendant le
        trajet, elle montre le prochain arrêt et la position estimée. Le ruban
        rejoint sa nouvelle position en 1,2 s à chaque mise à jour ; il ne roule
        jamais en continu.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <figure className="grid gap-2">
          <div className="grid gap-4 rounded-[20px] bg-brand-encre p-5 text-white">
            <div className="text-small flex flex-wrap items-center gap-2 font-semibold">
              <Symbole inverse /> Express 201 · Owendo → Franceville{" "}
              <span className="text-caption ml-auto rounded-pill bg-success px-2 py-1">
                À l’heure
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <div>
                <small className="block text-white/70">Départ dans</small>
                <b className="tabular text-h3">48 min</b>
              </div>
              <div className="text-right">
                <small className="block text-white/70">
                  Quai 1 · voiture 4
                </small>
                <b>Place 32</b>
              </div>
            </div>
            <Voie rempli={0.02} fond="encre" className="w-full flex-none" />
            <div className="text-caption flex justify-between">
              <span>Owendo 07:40</span>
              <span>Booué</span>
              <span>Franceville 19:25</span>
            </div>
          </div>
          <figcaption className="text-caption text-ink-muted">
            Avant le départ · seules les minutes du compte à rebours changent.
          </figcaption>
        </figure>
        <figure className="grid gap-2">
          <div className="grid gap-4 rounded-[20px] bg-brand-encre p-5 text-white">
            <div className="text-small flex flex-wrap items-center gap-2 font-semibold">
              <Symbole inverse /> Express 201 · en route{" "}
              <span className="text-caption ml-auto rounded-pill bg-warning px-2 py-1 text-ink">
                +12 min
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <div>
                <small className="block text-white/70">Prochain arrêt</small>
                <b className="tabular text-h4">Booué 13:07</b>
              </div>
              <div className="text-right">
                <small className="block text-white/70">
                  Arrivée à Franceville
                </small>
                <b className="tabular">19:37</b>
              </div>
            </div>
            <Voie rempli={0.46} fond="encre" className="w-full flex-none" />
            <div className="text-caption flex justify-between">
              <span>Owendo</span>
              <span>Booué</span>
              <span>Franceville</span>
            </div>
            <small className="text-white/70">
              Position estimée · mise à jour à 12:16
            </small>
          </div>
          <figcaption className="text-caption text-ink-muted">
            Pendant le voyage · nouvelle position après chaque changement de
            statut.
          </figcaption>
        </figure>
      </div>
      <div className="grid gap-3 rounded-lg border border-line bg-surface p-4 sm:grid-cols-3">
        <div>
          <h4 className="font-semibold">Écran verrouillé</h4>
          <p className="text-small mt-1 text-ink-muted">
            Le cercle indique le temps avant le départ, puis la part du trajet.
            La ligne courte donne le quai ou le prochain arrêt.
          </p>
        </div>
        <div>
          <h4 className="font-semibold">Dynamic Island</h4>
          <p className="text-small mt-1 text-ink-muted">
            Compacte : symbole, prochain arrêt et retard. Minimale : symbole
            seul. Étendue : trajet et position du ruban. Le système anime les
            transitions.
          </p>
        </div>
        <div>
          <h4 className="font-semibold">Android</h4>
          <p className="text-small mt-1 text-ink-muted">
            Widget aux grands rayons. La notification de progression d’Android
            16 marque les gares majeures par des segments et place le train à la
            position estimée.
          </p>
        </div>
      </div>

      <SousTitre>Notifications</SousTitre>
      <p className="text-small text-ink-muted">
        Chaque titre nomme le train ou la gare. Le message annonce le fait, puis
        ce qui reste acquis pour le voyageur.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {NOTIFICATIONS.map((notification) => (
          <article
            key={notification.type}
            className="grid gap-2 rounded-lg border border-line bg-surface p-4"
          >
            <span className="text-caption flex items-center gap-2 text-ink-muted">
              <BellIcon className="size-4" aria-hidden />
              {notification.type}
            </span>
            <h4 className="font-semibold">{notification.titre}</h4>
            <p className="text-small text-ink-muted">{notification.texte}</p>
            <p className="text-caption border-t border-line pt-2">
              <b>{notification.quand}</b> · {notification.canal}
            </p>
          </article>
        ))}
      </div>

      <SousTitre>Cartes Wallet</SousTitre>
      <p className="text-small text-ink-muted">
        Apple Wallet garde le fond encre du billet, avec des libellés orange
        lisibles sur ce fond. Google Wallet reprend la voie et le ruban en
        liseré. Les deux utilisent un code Aztec sur fond blanc ; le nom du
        voyageur, la voiture, la place et le quai restent écrits à côté du code.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <figure className="grid gap-2">
          <div className="grid gap-4 rounded-[20px] bg-brand-encre p-5 text-white">
            <div className="flex justify-between gap-3">
              <Logo
                variante="compact"
                theme="negatif"
                title=""
                className="h-8 w-auto"
              />
              <span className="text-caption">Ven. 2 oct.</span>
            </div>
            <div className="flex justify-between gap-3">
              <div>
                <span className="text-caption block text-brand-orange">
                  OWENDO
                </span>
                <b className="tabular text-h3">07:40</b>
                <small className="block">Quai 1</small>
              </div>
              <div className="text-right">
                <span className="text-caption block text-brand-orange">
                  FRANCEVILLE
                </span>
                <b className="tabular text-h3">19:25</b>
                <small className="block">Express 201</small>
              </div>
            </div>
            <div className="text-caption grid grid-cols-4 gap-2 border-t border-white/20 pt-3">
              <span>
                Voyageur<b className="block">N. Mboumba</b>
              </span>
              <span>
                Voiture<b className="block">4</b>
              </span>
              <span>
                Place<b className="block">32</b>
              </span>
              <span>
                Classe<b className="block">2e</b>
              </span>
            </div>
            <div className="text-caption grid justify-items-center gap-1 rounded-sm bg-white p-3 text-ink">
              <CodeAztec
                valeur="SETRAG-EXEMPLE-WALLET-NON-VALABLE"
                label="Exemple de code Aztec non valable"
                className="w-24"
              />
              <span>STG-7K4Q2P · exemple</span>
            </div>
          </div>
          <figcaption className="text-caption text-ink-muted">
            Apple Wallet · même fond encre que le billet.
          </figcaption>
        </figure>
        <figure className="grid gap-2">
          <div className="grid gap-4 rounded-[20px] border border-line bg-surface p-5">
            <div className="flex items-center gap-2 font-semibold">
              <Symbole /> SETRAG · Express 201
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <b className="text-h4 block">OWE</b>
                <small>Owendo · 07:40</small>
              </div>
              <Voie etat="pleine" />
              <div className="text-right">
                <b className="text-h4 block">FCV</b>
                <small>Franceville · 19:25</small>
              </div>
            </div>
            <Infos wallet />
            <div className="text-caption grid justify-items-center gap-1 rounded-sm border border-line bg-white p-3 text-ink">
              <CodeAztec
                valeur="SETRAG-EXEMPLE-WALLET-NON-VALABLE"
                label="Exemple de code Aztec non valable"
                className="w-24"
              />
              <span>STG-7K4Q2P · exemple</span>
            </div>
          </div>
          <figcaption className="text-caption text-ink-muted">
            Google Wallet · voie et ruban entre les gares.
          </figcaption>
        </figure>
      </div>
      <Regles
        oui={{
          titre: "Toujours",
          items: [
            "Afficher l’heure de mise à jour dès qu’une position est estimée.",
            "Afficher l’heure réelle en premier ; l’heure prévue seulement si elle diffère.",
            "Utiliser les codes OWE et FCV là où la place manque, le nom complet ailleurs.",
            "Employer le symbole seul sous 48 pt et chiffrer chaque retard.",
          ],
        }}
        non={{
          titre: "Jamais",
          items: [
            "Présenter une position comme actuelle si son statut a plus de 15 min : le retard de mise à jour doit être écrit.",
            "Faire porter un retard par la couleur seule.",
            "Faire bouger ces surfaces en dehors d’une mise à jour réelle.",
          ],
        }}
      />
      <div className="text-caption flex flex-wrap gap-4 text-ink-muted">
        <span className="inline-flex items-center gap-1">
          <Clock3Icon className="size-4" aria-hidden /> Heures en mono
        </span>
        <span className="inline-flex items-center gap-1">
          <MapPinIcon className="size-4" aria-hidden /> Position estimée
          signalée
        </span>
        <span className="inline-flex items-center gap-1">
          <TrainFrontIcon className="size-4" aria-hidden /> Retard chiffré
        </span>
      </div>
    </Section>
  )
}
