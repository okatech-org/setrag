# Billetterie voyageur — application installable et hors réseau

`apps/billetterie-web` s'installe sur l'écran d'accueil et reste utilisable sans
couverture réseau. Ce document décrit ce qui fonctionne hors ligne, ce qui ne le
peut pas, et pourquoi.

## Le principe : consulter hors ligne, agir en ligne

Le contrôleur à bord ÉCRIT hors réseau — ses contrôles partent dans une file
d'envoi (voir [controleur-web.md](controleur-web.md)). Le voyageur, lui, ne fait
que LIRE : il n'achète pas, n'annule pas et ne paie pas sans réseau, parce que
ces gestes engagent un inventaire de places partagé que seul le serveur arbitre.

Il n'y a donc, côté voyageur, ni file d'attente ni conflit à résoudre. La base
locale n'est qu'une copie datée de ce que le serveur a renvoyé, et le serveur
reprend la main dès qu'il répond.

| Hors réseau | En ligne seulement |
| --- | --- |
| Ouvrir l'application | Rechercher et réserver |
| Voir ses billets et leur code de contrôle | Payer |
| Voir le parcours du train de son billet | Annuler une option |
| Consulter l'aide | Télécharger un PDF, ajouter au portefeuille, renvoyer par courriel |

Les actions de la seconde colonne ne sont pas masquées hors réseau : elles
répondent par un message expliquant qu'elles demandent une connexion, et
rappellent que le code affiché à l'écran suffit au contrôle à bord.

## Installation

- **Manifeste** : `public/manifest.webmanifest` — `start_url` sur l'accueil,
  affichage `standalone`, raccourcis « Mes billets » et « Suivre un train ».
- **Icônes** : `public/icons/`, fabriquées depuis le logo par
  `scripts/generer-icones.mjs` (`bun run icones` dans l'application). Le script
  isole le « S » ferroviaire du logo — le nom et la baseline sont illisibles
  dans un carré de 48 px — et le pose sur une pastille blanche au bleu SETRAG.
  À relancer après toute modification de `public/setrag-logo.png`.
- **Invite** : `src/components/offline/invite-installation.tsx`. Le bandeau
  reste dans le flux plutôt que flottant, capte `beforeinstallprompt` pour que
  le navigateur ne choisisse pas lui-même son moment, et explique le geste du
  menu de partage sur iOS, où aucun événement n'existe. Un refus est retenu.

## Base locale

`src/lib/offline/db.ts` — IndexedDB `setrag-voyageur`, trois stores :

| Store | Clé | Contenu |
| --- | --- | --- |
| `dossiers` | `reference` (numéro de vente) | Dossier complet : vente, billets et leurs codes, trajet, gares |
| `parcours` | `tripId` | Arrêts, heures et retard au dernier relevé ; index `by_train` sur `[trainNumber, serviceDate]` |
| `etat` | — | Propriétaire des données et date de la dernière réception |

Deux règles tiennent cette base :

- **Le remplacement des dossiers est intégral**, dans une seule transaction. Un
  dossier annulé depuis un autre appareil doit disparaître du téléphone ; une
  fusion enregistrement par enregistrement le laisserait en place.
- **Les données sont nominatives.** La base porte l'identifiant de son
  propriétaire : un autre voyageur qui se connecte efface tout avant d'écrire, et
  la déconnexion efface également (`src/lib/offline/deconnexion.ts` — toujours
  passer par `seDeconnecter()`, jamais par `authClient.signOut()` seul).

## Le piège de la session hors réseau

Sans réseau, la session ne peut pas être revalidée : le voyageur **paraît
déconnecté** alors qu'il tient son téléphone en gare. Deux conséquences, qui
sont les points les plus délicats de cette fonctionnalité :

1. Les écrans ne se fient pas à l'état de session pour décider quoi afficher.
   Dès qu'un billet est enregistré sur l'appareil, il s'affiche — sans quoi on
   présenterait un écran de connexion à quelqu'un qui a déjà payé son billet.
2. L'effacement automatique n'a lieu **qu'en ligne**, et l'état du réseau est
   relu au moment d'agir, pas capturé au rendu : le premier rendu se fait
   toujours sous l'hypothèse « en ligne », et effacer sur cette hypothèse
   détruirait les billets à l'instant précis où ils sont la seule ressource du
   voyageur. Ce comportement est verrouillé par
   `src/components/offline/donnees-locales.test.tsx`.

## Ce qui alimente la base

`src/components/offline/donnees-locales.tsx` est monté dans le shell, au-dessus
de tous les écrans : il doit enregistrer les billets même si le voyageur n'ouvre
jamais « Mes billets » avec du réseau — le cas courant, puisqu'on réserve chez
soi et qu'on ouvre son billet sur le quai.

Il enregistre les dossiers reçus de `bookings.listMine`, puis télécharge le
parcours (`trips.get`) des cinq prochains trajets de ces dossiers. Les parcours
dont plus aucun dossier ne dépend sont élagués. Il n'expose **jamais** la copie
locale par-dessus une réponse du serveur.

L'écran de suivi retrouve un parcours par numéro de train et date de
circulation (`src/features/suivi/use-parcours-local.ts`). Hors réseau, seuls les
trains des billets du voyageur sont consultables : c'est le périmètre utile, et
le seul qui puisse être téléchargé d'avance.

## Datation

Tout affichage issu de la base locale porte sa date, en clair et jamais en
« il y a un moment » : l'écart entre un retard relevé il y a dix minutes et un
retard de la veille change la décision du voyageur, et lui seul peut en juger.
Voir `src/components/offline/bandeau-hors-ligne.tsx`.

Un billet, lui, reste valable sans réseau : son code est émis à l'achat et le
contrôleur le vérifie hors ligne.

## Service worker

`public/sw.js`, écrit à la main, même philosophie que celui du contrôle : en
ligne, il ne s'interpose sur aucune navigation. Il ne prend la parole que hors
réseau, ou pour les ressources dont le nom contient déjà l'empreinte du contenu.

- Précache à l'installation : `/`, `/connexion`, `/mes-reservations`, `/suivi`,
  `/aide`. Les écrans de réservation et de paiement en sont exclus : ils
  supposent un serveur, et les précacher n'offrirait qu'un formulaire qui échoue
  à l'envoi.
- `/_next/static/`, `/icons/` : cache d'abord. `/_next/` : réseau d'abord, avec
  copie — c'est ce cache qui permet d'ouvrir le détail d'un billet depuis la
  liste sans réseau.
- Les appels à Convex ne sont **jamais** mis en cache : une réponse servie
  depuis un cache muet ferait croire à des informations du jour.
- Ni `skipWaiting` ni `clients.claim()` : un worker qui prend le contrôle d'une
  page ouverte l'interrompt, et un voyageur en cours de paiement perdrait son
  écran. Conséquence assumée : après un déploiement, le nouveau worker attend la
  fermeture des onglets, et son cache d'installation coexiste avec l'ancien
  jusque-là.
- Le nom des caches dérive de l'empreinte du build
  (`src/components/service-worker.tsx`) : un déploiement chasse le précédent.
- `NEXT_PUBLIC_DISABLE_SW=1` neutralise le tout par simple redéploiement.

## Vérifier le hors-ligne

Le service worker se neutralise en développement — sinon il sert les fragments
de code en cache et l'on croit déboguer l'application alors qu'on débogue un
cache. Il faut donc un build de production :

```bash
bun run build --filter=billetterie-web
```

```bash
bun run --filter=billetterie-web start:verif
```

L'application écoute alors sur le port 3005, ce qui laisse un serveur de
développement en place sur le 3000. Basculer ensuite l'onglet en mode hors ligne
dans les outils du navigateur.

## Vérifications avant livraison

```bash
bun run typecheck && bun run lint && bun run --filter=billetterie-web test:once
```
