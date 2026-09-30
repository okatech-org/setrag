# Billetterie web

`apps/billetterie-web` — recherche, réservation, paiement, billets, suivi des
trains et l'assistant Ruban, pour le voyageur du Transgabonais. Next.js 16
(App Router), port 3000.

```bash
bun run dev:billetterie   # depuis la racine du monorepo
# ou : cd apps/billetterie-web && bun run dev
```

Pour le mode installable et hors réseau, voir
[billetterie-pwa.md](billetterie-pwa.md). Pour la charte graphique, voir
[design-system.md](design-system.md) et la référence vivante `/charte`.

## Un seul arbre pour tous les écrans

`src/coquille/coquille.tsx` rend la même arborescence quel que soit l'écran —
pas de rendu séparé bureau / mobile. Sous 768 px, l'en-tête (`EnTete`) et le
pied (`Pied`) du site s'effacent ; chaque écran porte alors sa propre barre
d'app (`BarreApp`), et les écrans racines gagnent en plus la barre d'onglets
(`Onglets`), comme dans une application native. Au-delà de 768 px, c'est
l'inverse : `EnTete`/`Pied` reviennent, `BarreApp` et `Onglets` se masquent
(`md:hidden`).

`Coquille` empile, dans l'ordre : le lien d'évitement, `FiletNavigation` (le
ruban qui traverse le haut de l'écran pendant un chargement), `Demarrage`
(l'écran de démarrage de l'app installée), `BandeauReseau`, `InviteInstallation`
(écrans racines seulement), `EnTete`, le contenu de la page, `Pied`, `Onglets`
(écrans racines), `Ruban` (le bouton flottant et sa fenêtre/feuille) et
`ServiceWorker`. Montée dans `src/app/layout.tsx`, sous `Fournisseurs`
(`src/coquille/fournisseurs.tsx`), qui pose le thème (`next-themes`, attribut
`data-theme`), le client Convex, `DonneesLocalesProvider` (copie locale des
billets, voir `billetterie-pwa.md`) et `RubanProvider` — Ruban survit donc aux
changements de page, jusqu'à `/assistant`.

## Expérience mobile native

`src/coquille/navigation.ts` distingue deux navigations et un ensemble de
racines :

- `ONGLETS` (3) : Accueil (`/`), Billets (`/billets`), Compte (`/compte` —
  regroupe aussi `/notifications` et `/connexion`). Rendus par `Onglets`
  (barre fixe en bas, `md:hidden`), le ruban se pose sur l'onglet courant et
  glisse vers le suivant.
- `NAVIGATION_BUREAU` (5) : Réserver, Mes billets, Suivi des trains, Tarifs,
  Aide — uniquement dans `EnTete`, à partir de 768 px.
- `RACINES = new Set(["/", "/billets", "/compte"])` : sur ces trois écrans,
  `BarreApp` porte le logo (`<BarreApp logo />`) à la place d'un retour, et la
  barre d'onglets est visible. Partout ailleurs — tunnel d'achat, détail d'un
  billet, pages d'information, `/suivi`, `/assistant` — l'écran porte un retour
  (`BarreApp retour`) et, dans le tunnel, sa propre barre d'action collée en
  bas (`BarreAction`) plutôt que les onglets.

Le bouton flottant de Ruban ne flotte au-dessus des onglets que sur les écrans
racines ; ailleurs il se masque sur mobile (la barre d'action occupe le bas) et
reste visible en bas à droite sur grand écran.

## `src/app` — routes minces

Chaque `page.tsx` déclare des métadonnées (`title`, `description`, parfois
`robots`) et rend un seul composant de fonctionnalité, sous un éventuel
`Suspense` (pages qui lisent `useSearchParams`). Les pages d'information
(`tarifs`, `bagages`, `aide`, `conditions`, `presentation`) posent `BarreApp`
directement dans `page.tsx`, avec un titre et un sous-titre fixes ; les autres
laissent ce soin au composant de fonctionnalité, qui choisit son propre titre,
ses actions et son retour.

## `src/coquille` — la coquille commune

| Fichier | Exporte | Rôle |
| --- | --- | --- |
| `navigation.ts` | `NAVIGATION_BUREAU`, `ONGLETS`, `estActif`, `estRacine` | la carte de navigation, voir plus haut |
| `coquille.tsx` | `Coquille` | l'arbre commun à tous les écrans |
| `fournisseurs.tsx` | `Fournisseurs` | thème, client Convex, copie locale, `RubanProvider`, `Toaster` (sonner) |
| `barre-app.tsx` | `BarreApp`, `GrandTitre` | barre d'app mobile (`md:hidden`) : retour ou logo, titre/sous-titre sur deux lignes, actions à droite |
| `barre-action.tsx` | `BarreAction` | barre collée en bas du tunnel d'achat : info à gauche, total, un seul bouton primaire |
| `onglets.tsx` | `Onglets`, `HAUTEUR_ONGLETS` | barre d'onglets mobile des écrans racines |
| `en-tete.tsx` | `EnTete` | en-tête du site à partir de 768 px : logo fixe, navigation, `CompteRapide` |
| `pied.tsx` | `Pied` | pied du site à partir de 768 px ; sur mobile ces liens vivent dans « Compte » |
| `filet-navigation.tsx` | `FiletNavigation`, `useNaviguer`, `signalerNavigation` | le ruban de chargement en haut de l'écran ; `useNaviguer()` encapsule `router.push`/`replace` en le déclenchant |
| `demarrage.tsx` | `Demarrage` | logo animé au lancement de l'app installée, une fois par ouverture, jamais dans un onglet de navigateur |
| `compte-rapide.tsx` | `CompteRapide`, `Cloche`, `nomAffiche` | coin droit de l'en-tête bureau : connexion ou cloche + avatar |

`FiletNavigation` déduit le début d'une navigation d'un clic sur un lien
interne ou d'un appel à `useNaviguer()` (le routeur de Next n'annonce rien), et
la considère terminée quand l'adresse a changé ; le ruban n'apparaît qu'après
150 ms (`marque.css`), pour ne jamais clignoter sur une page servie depuis le
cache.

## `src/fonctionnalites/<domaine>`

| Domaine | Contenu |
| --- | --- |
| `accueil` | `Accueil` — recherche, prochain voyage, départs de la gare choisie, schéma de ligne |
| `recherche` | choix de gare, de date, de voyageurs ; `FormulaireRecherche` |
| `reference` | `useGares`, `useReductions` — référentiel (gares, réductions publiques) mis en cache par Convex |
| `tunnel` | le tunnel d'achat : `resultats/` (étape 1), `reservation/` (étape 2), `paiement/` (étape 3, + `attente`), `etapes.tsx` (`ETAPES`, `EnTeteTunnel`, `Page`, `EcranMessage`, `SqueletteTunnel`), `adresses.ts` (construit les adresses du tunnel), `limite-erreur.tsx` |
| `billets` | `MesBillets`, `DetailDossier`, `Confirmation` (étape 4 du tunnel), et leurs briques : `dossier.ts`, `calendrier.ts`, `horloge.ts`, `actions-billets.tsx`, `feuilles.tsx`, `retrouver-reservation.tsx` (accès invité) |
| `suivi` | `Suivi` — trains du jour, position estimée (`position.ts`), `use-parcours-local.ts` (parcours hors ligne, voir `billetterie-pwa.md`) |
| `compte` | `Compte` et ses sous-pages : `profil` (nom, civilité, coordonnées), `donnees` (consentements, export, suppression), `preferences` (alertes, thème), `voyageurs` (« Vous » puis les personnes enregistrées), `ruban` (« Ce que Ruban retient »), `messageries` (dont « Relier Telegram »), `deconnexion.tsx` |
| `connexion` | `Connexion` — code OTP par SMS ou e-mail, sans mot de passe ; à la première connexion, nom et civilité (`choix-civilite.tsx`) ; `identifiant.ts`, `champ-telephone.tsx` |
| `notifications` | `Notifications` — centre de notifications du compte |
| `infos` | pages éditoriales : `tarifs`, `bagages`, `aide`, `conditions`, `presentation` (dossier commercial), `regles.ts` (`VERSION_CGV`) |
| `assistant` | Ruban côté web : fenêtre, feuille, page `/assistant`, cartes d'action, voix — détaillé plus bas |
| `charte` | `Charte` — la référence vivante `/charte` |
| `hors-ligne` | copie locale, bandeau réseau, installation, service worker — voir `billetterie-pwa.md` |

## `src/lib`

| Fichier | Rôle |
| --- | --- |
| `recherche.ts` | la recherche dans l'adresse — détaillé plus bas |
| `acces-reservation.ts` | l'accès invité — détaillé plus bas |
| `format.ts` | dates, heures et montants tels que le voyageur les lit (fuseau de Libreville) |
| `voyage.ts` | vocabulaire du voyage : classes, types de train, gares repères, `VOYAGEURS_MAX` (9), `SEUIL_PLACES` (10) |
| `cgv.ts` | `CGV_VERSION` — lue dans le paquet backend (`@workspace/backend/cgv`, `CURRENT_CGV_VERSION`), source unique |
| `consentements.ts` | consentements révocables (`donnees`, `marketing`), versionnés indépendamment des CGV |
| `telephone.ts` | lecture et validation d'un numéro saisi (national ou étranger) |
| `stockage-session.ts` | petit magasin réactif sur `sessionStorage` (`lireSession`, `ecrireSession`, `useValeurSession`) |
| `traveler-onboarding.ts` | prénom/nom/téléphone saisis avant la connexion, réappliqués une fois le compte créé |
| `titulaire.ts` | le voyageur « Moi » (`voyageurMoi`, `estLeTitulaire`, `CIVILITES`) : le titulaire du compte tiré du profil, règles de `@workspace/backend/titulaire` |
| `reseau.ts` | vérifie qu'il y a du réseau avant une action qui l'exige, et le dit sinon |
| `wallet-platform.ts` | détecte iOS/Android/bureau pour proposer le bon fournisseur de portefeuille |
| `offline/*` | base IndexedDB locale — voir `billetterie-pwa.md` |

## `src/hooks`

| Fichier | Exporte | Rôle |
| --- | --- | --- |
| `use-today.ts` | `useToday` | horodatage figé au chargement, `null` pendant le rendu serveur/l'hydratation |
| `use-maintenant.ts` | `useMaintenant`, `useRequeteMedia` | heure courante arrondie à un pas (défaut 15 s) ; requête média réactive |
| `use-online.ts` | `useOnline` | état réseau signalé par le navigateur (sert à expliquer, jamais à juger une donnée fraîche) |
| `use-traveler-auth.ts` | `useTravelerAuth` | garantit un profil applicatif pour toute session Better Auth ; expose `isProfileReady` |

## Les routes

| Route | Composant | Rôle |
| --- | --- | --- |
| `/` | `Accueil` | racine — recherche, prochain voyage, départs, schéma de ligne |
| `/resultats` | `Resultats` (tunnel, étape 1) | trains d'un jour pour une recherche lue dans l'adresse |
| `/reservation` | `Reservation` (tunnel, étape 2) | voyageurs et classe |
| `/paiement` | `Paiement` (tunnel, étape 3) | choix du moyen de paiement |
| `/paiement/attente` | `Attente` | attente de validation Mobile Money, suit le statut de la réservation en direct |
| `/confirmation` | `Confirmation` (tunnel, étape 4) | billets émis |
| `/billets` | `MesBillets` | racine — dossiers à venir / passés, retrouver une réservation en invité |
| `/billets/[reference]` | `DetailDossier` | détail d'un dossier : billets, codes de contrôle, suivi du train |
| `/suivi` | `Suivi` | trains du jour : arrêts, heures, retard, position estimée |
| `/connexion` | `Connexion` | code reçu par SMS ou e-mail, sans mot de passe ; `?retour=` ramène à l'écran d'origine |
| `/compte` | `Compte` | racine — profil, liens vers les sous-pages |
| `/compte/profil` | `Profil` | nom, civilité et coordonnées |
| `/compte/donnees` | `Donnees` | consentements, export des données, suppression du compte |
| `/compte/preferences` | `Preferences` | alertes/notifications et affichage (thème) |
| `/compte/voyageurs` | `Voyageurs` | « Vous » (le titulaire, tiré du profil) puis les voyageurs enregistrés |
| `/compte/ruban` | `CeQueRubanRetient` | ce que Ruban retient du compte : chaque note se lit en entier et s'oublie une à une, ou toutes |
| `/compte/messageries` | `Messageries` | messageries reliées à Ruban ; « Relier Telegram » émet le lien de liaison |
| `/notifications` | `Notifications` | centre de notifications |
| `/tarifs` | `Tarifs` | classes, calcul au kilomètre, réductions, groupes |
| `/bagages` | `Bagages` | bagages, colis, véhicules, transport funéraire (au guichet) |
| `/aide` | `Aide` | questions fréquentes |
| `/conditions` | `Conditions` | conditions générales de vente en vigueur |
| `/presentation` | `Presentation` | dossier commercial NTSAGUI DIGITAL, non indexé (`robots: noindex`) |
| `/assistant` | `PageAssistant` | Ruban en grand : historique, conversation, contexte de réservation |
| `/charte` | `Charte` | référence vivante du design system |

## La recherche dans l'adresse — `src/lib/recherche.ts`

Une recherche vit entièrement dans l'adresse :
`/resultats?de=OWE&a=FCV&le=2026-10-02&adultes=1&enfants=0`. Les gares sont
désignées par leur code (lisible, stable), jamais par un identifiant interne :
une adresse se partage, se recharge, revient au bouton retour.

- `Recherche = { de, a, le, adultes, enfants }`.
- `lireRecherche(parametres)` — lit une recherche complète depuis
  `URLSearchParams` (ou tout objet avec un `get`) ; renvoie `null` si elle est
  incomplète, si `de === a`, si la date n'est pas `AAAA-MM-JJ`, ou si le total
  de voyageurs dépasse `VOYAGEURS_MAX` (9).
- `parametresRecherche(recherche)` — l'inverse, pour construire une adresse.
- `memoriserRecherche` / `derniereRecherche` / `derniereRechercheBrute` — la
  dernière recherche est gardée dans `localStorage`
  (`setrag:derniere-recherche`) pour préremplir l'accueil, comme dans une app.
- `codesReduction(recherche, codeEnfant)` — un tableau de codes de réduction,
  un par voyageur, adultes d'abord : l'ordre attendu par le devis du backend et
  par le formulaire des voyageurs.

## L'accès invité — `src/lib/acces-reservation.ts`

Sans compte, le serveur ne rend une réservation qu'à qui fournit sa référence
**et** le téléphone de contact (`bookings.getByReference`, `bookings.confirm`,
`bookings.cancelHold`). `getByReference` répond `null` aussi bien à une
référence inconnue qu'à un téléphone qui ne lui correspond pas, et `confirm`
comme `cancelHold` lèvent le même « Référence ou téléphone incorrect » : les
écrans (`AvecReservation` du tunnel, `Confirmation`, `DetailDossier`)
affichent « Référence ou téléphone incorrect » et redemandent le téléphone,
sans dire lequel des deux est faux. Le paiement envoie le téléphone mémorisé
(`lireContact`) avec `bookings.confirm`. Un téléphone de contact compte au
moins 8 chiffres significatifs (`bookings.create` refuse en deçà). Le tunnel mémorise donc ce téléphone par référence,
dans `sessionStorage` (`setrag:contact-reservation`, 12 références au plus) —
jamais dans l'adresse, jamais `localStorage` (donnée personnelle, effacée avec
l'onglet).

- `memoriserContact(reference, telephone)` — retenu après une réservation ou un
  paiement réussi (forme envoyée au serveur).
- `lireContact(reference)` — lecture synchrone.
- `useContact(reference)` — version réactive ; `undefined` tant que le
  navigateur n'a pas lu le stockage (rendu serveur, hydratation), `null` s'il
  n'y est pas.

## Ruban côté web — `src/fonctionnalites/assistant`

Le contrat backend (fonctions Convex, outils, profils) est décrit dans
[assistant-ia-frontend.md](assistant-ia-frontend.md) — non répété ici.

- **`RubanProvider`** (`contexte-ruban.tsx`) — l'état commun à la fenêtre, à la
  feuille et à `/assistant`, monté dans `Fournisseurs` : il survit aux
  changements de page. Garde la conversation et le fil en mémoire
  (`sessionStorage:setrag:ruban`, 80 entrées au plus), expose `envoyer`,
  `renvoyer` (après échec), `confirmer`/`refuser` (une action en attente),
  `nouvelleConversation`, `assurerConversation` (créée à la demande) et
  `reprendre` (relit une conversation passée depuis `/assistant`).
- **Rattachement par claim** — `cle-invite.ts` (`cleInvite()`) génère un secret
  de session invitée (`sessionStorage`, jamais dans une adresse), qui prouve
  qu'une conversation appartient à l'onglet. À la connexion,
  `RubanProvider` appelle `api.ai.conversations.claim` pour rattacher la
  conversation en cours au compte ; à la déconnexion, une nouvelle conversation
  repart de zéro (la précédente appartient au compte quitté).
- **Fenêtre** (`ruban.tsx`, `Fenetre`) — grand écran (≥ 768 px) : 404 × 640,
  ancrée au-dessus du bouton flottant, laisse la page utilisable.
- **Feuille à trois hauteurs** (`ruban.tsx`, `Feuille`) — mobile : `moyenne`
  (défaut, question rapide), `haute` (dès que la conversation est engagée, ou
  tirée vers le haut), `plein` (à la demande). Se tire au doigt pour changer de
  hauteur ou se fermer (glissé > 90 px), sans rebond.
- **Bouton flottant** (`Ruban`) — toujours fond encre ; ne flotte au-dessus des
  onglets que sur les écrans racines ; masqué sur `/assistant` et si Ruban
  n'est pas configuré côté serveur (`disponible === false`).
- **Page `/assistant`** (`page-assistant.tsx`, `PageAssistant`) — la
  conversation au centre, l'historique des conversations du compte à gauche
  (`Historique`, ≥ 1024 px), ce que Ruban prépare à droite (`Contexte` : la
  dernière réservation en cours, les voyageurs enregistrés, ≥ 1280 px). Plein
  écran sur mobile.
- **Cartes d'action** (`cartes.tsx`) — `CarteDuFil` rend une carte selon
  `carte.type` : `show_trip_results` (trajets), `show_quote` (devis),
  `show_booking`/`show_payment_confirmation`/`show_cancellation` (réservation),
  `show_my_bookings`, `show_my_tickets`, `download_ticket`, `request_sign_in`.
  `CarteApprobation` rend une action qui attend une confirmation explicite
  (`create_booking`, `pay_booking`, `cancel_booking`, ou une carte générique) :
  le bouton dit exactement ce qu'il fait, les arguments viennent du serveur et
  ne sont pas modifiables ici.
- **Voix Realtime** (`voix/use-session-vocale.ts`, `useSessionVocale`) —
  connexion WebRTC à OpenAI Realtime : jeton éphémère
  (`ai.realtime.mintVoiceToken`), exécution des appels d'outils reçus sur le
  DataChannel (`ai.realtime.executeVoiceTool`, même registre que le texte),
  état de session tenu à jour (`ai.realtime.updateVoiceSession`). Le niveau
  sonore du micro et de la voix de Ruban est lissé (~80 ms) et pilote
  l'épaisseur du signe de Ruban (`SigneRuban niveau=`). Ce qui se dit s'écrit
  aussi dans le fil, avec ses cartes.

## Le voyageur « Moi »

Le compte porte son voyageur par défaut : le titulaire, tiré du profil
(`src/lib/titulaire.ts`, règles partagées avec le backend). Il n'y a pas de
fiche à créer pour soi.

- **Fin d'inscription** (`connexion.tsx`, `EtapeNom`) : prénom, nom et
  civilité (Madame, Monsieur), une fois. Un compte plus ancien qui a déjà un
  nom n'est pas interrompu : sa civilité se complète dans le profil, ou à sa
  première réservation.
- **Tunnel** (`tunnel/reservation`) : le premier voyageur est prérempli avec
  « Moi », civilité comprise ; « Moi » est proposé à chaque bloc, et une
  fiche que le titulaire avait créée pour lui-même n'est pas proposée en
  double.
- **Voyageurs enregistrés** : « Vous » en tête, lien vers le profil ; une
  fiche au même nom est signalée comme faisant double emploi.
- **Ruban** : la page `/assistant` montre « Vous » parmi les voyageurs et les
  dernières notes de Ruban, avec un lien vers `/compte/ruban`. La carte de
  réservation écrit la civilité (« Mme Élise Ndong ») ; la carte
  `show_memory` montre ce que Ruban vient de noter ou d'oublier.

`RubanProvider` s'appuie sur `attachedToAccount` (réponse de
`ai.conversations.create`) pour savoir s'il reste à rattacher la
conversation : une session ouverte avant que son profil existe crée une
conversation invitée, qui est rattachée (`claim`) dès que le profil est prêt.

## Liaison de messagerie

Le modèle de données et le flux d'un message sont décrits dans
[messagerie-multicanale.md](messagerie-multicanale.md) — non répété ici.

Le lien de liaison naît sur le site, jamais dans le fil : le fil
(`/connexion`, `request_sign_in`) ne fait que renvoyer vers
`/compte/messageries`. Il n'y a plus de page `/lier`.

- **`/compte/messageries`** (`messageries.tsx`, `Messageries`) — liste les
  messageries reliées (`api.messaging.linking.listMine`, réactive) et permet
  de délier (`api.messaging.linking.unlink`) via une `Feuille` de
  confirmation. Délier est immédiat ; la conversation repart en invitée.
- **« Relier Telegram »** (bouton secondaire, même écran) — appelle
  `api.messaging.linking.startFromSite({ canal: "telegram" })`. Avec
  `{ disponible: true, url, expiresAt }`, affiche « Ouvrir Telegram »
  (`target="_blank"`, `rel="noreferrer"`), la consigne « Dans Telegram,
  appuyez sur Démarrer. » et l'échéance en mono ; passé l'échéance, invite à
  redemander un lien. Quand la liaison aboutit, la liste se met à jour seule
  et l'écran affiche « Telegram est relié à votre compte. ». Avec
  `{ disponible: false }` (bot non configuré), il le dit. Le lien vaut une
  fois, 10 minutes, et relie à ce compte la messagerie qui l'ouvre : il ne se
  partage pas.

## Vérifications avant livraison

```bash
bun run typecheck && bun run lint && bun run --filter=billetterie-web test:once
```

Build de production et vérification du hors-ligne : voir
[billetterie-pwa.md](billetterie-pwa.md#vérifier-le-hors-ligne).
