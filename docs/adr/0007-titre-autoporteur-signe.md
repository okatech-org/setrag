# ADR-0007 — Titre auto-porteur signé Ed25519, CBOR canonique, sans compression

**Statut :** accepté
**Date :** 2026-07-26
**Portée :** `convex/model/barcode.ts`, `convex/lib/signature.ts`

## Contexte

Le contrôle a lieu dans un train, sur 648 km de voie où la couverture réseau
est discontinue. Le contrôleur doit pouvoir établir qu'un titre est
**authentique** sans appeler le serveur. Le CDC relève par ailleurs que les
billets papier actuels sont « facilement imitables ».

Deux propriétés à obtenir séparément :

- **authenticité** — le titre a bien été émis par SETRAG. Vérifiable hors
  ligne, par cryptographie.
- **statut** — annulé, remboursé, déjà contrôlé. Vient du manifeste
  embarqué ; un code-barres ne peut pas savoir qu'il a été remboursé après
  son impression.

## Décision

Le code-barres porte une charge utile **CBOR canonique** signée en
**Ed25519**, encodée en **Base45**, préfixée `SETRAG1:`.

- Clés triées lexicographiquement — l'encodage est déterministe.
- **Aucune donnée personnelle** : le nom vient du manifeste, pas du symbole.
- **Pas de compression.**
- Clé privée en variable d'environnement (`BARCODE_SIGNING_KEY_V1`), clé
  publique distribuée par le manifeste.

## Options considérées

### Signature — Ed25519 vs ECDSA vs HMAC

| | Ed25519 | ECDSA P-256 | HMAC-SHA256 |
|---|---|---|---|
| Taille | 64 o | ~72 o (DER) | 32 o |
| Déterministe | **oui** | non (nonce) | oui |
| Vérif. hors ligne sans secret | oui | oui | **non** |

**HMAC est éliminé** : vérifier exigerait de mettre la clé *secrète* sur
chaque terminal contrôleur. Un terminal perdu, et n'importe qui fabrique des
titres.

**ECDSA est éliminé sur le déterminisme.** Ce n'est pas un détail de
confort : une mutation Convex peut être **rejouée** après conflit de
concurrence, et doit alors reproduire exactement le même résultat. Une
signature à nonce aléatoire produirait un code-barres différent à chaque
rejeu. S'ajoute le mode d'échec historique de DSA — un nonce mal tiré révèle
la clé privée.

### Sérialisation — CBOR canonique vs JSON

JSON n'a pas d'ordre de clés garanti. Deux sérialisations du même contenu
donneraient deux signatures différentes, donc des vérifications qui échouent
sans raison apparente. Le déterminisme est ici une **exigence de sécurité**,
pas une préférence — c'est pourquoi l'encodeur CBOR est écrit à la main
(~130 lignes lisibles) plutôt que délégué à une bibliothèque généraliste dont
le mode canonique serait à vérifier.

### Encodage — Base45 vs Base64

Base45 est l'alphabet du **mode alphanumérique** des codes 2D, nettement plus
dense que le mode octet dans lequel Base64 ferait basculer le symbole. C'est
le choix du certificat sanitaire européen, pour la même raison.

### Compression — écart assumé au plan initial

Le plan prévoyait `CBOR → zlib → Base45`, sur le modèle européen. **Abandonné
à l'implémentation** : la charge utile mesurée fait moins de 120 octets. À
cette taille, l'en-tête zlib coûte plus qu'il ne rapporte, et ajoute un
format de plus à faire vérifier par un terminal hors ligne.

Le certificat européen compressait des charges de plusieurs centaines
d'octets. Reprendre la recette sans reprendre la mesure aurait été du
cargo-cult.

## Rotation de clé

Un titre signé sous une clé retirée est refusé pour **« clé hors service »**,
jamais pour contrefaçon. Sans cette distinction, une rotation ferait passer
d'un coup tous les titres en circulation pour des faux, et le terrain n'aurait
aucun moyen de comprendre ce qui se passe.

La reprise (`documents:resignTickets`) re-signe ce qui ne se vérifie plus. Le
critère est la **vérification effective**, pas la comparaison des numéros de
version — première version écrite ainsi, elle a raté un titre sur trois parce
que la clé avait changé sans que sa version bouge. Un critère qui repose sur
la discipline n'est pas un critère.

## Vérification apportée

La chaîne complète est prouvée de bout en bout, pas seulement testée contre
elle-même :

1. la clé publique dérivée correspond au **vecteur RFC 8032 §7.1** — c'est
   bien de l'Ed25519 conforme ;
2. Base45 reproduit les **vecteurs de la RFC 9285** ;
3. le symbole encodé puis rastérisé est **relu par ZXing**, le lecteur que
   fait tourner un terminal de contrôle — chaîne identique ;
4. la même relecture réussit sur le PDF **produit par le déploiement réel**,
   téléchargé et rastérisé.

## Conséquences

**Devient plus facile**
- Contrôle hors ligne réellement sûr : sans clé publique, un terminal ne
  pourrait que comparer à une liste embarquée, et accepterait donc toute
  contrefaçon recopiant un code aperçu ailleurs.
- Un titre perdu ne révèle rien de son porteur.

**Devient plus difficile**
- La clé privée devient un actif à protéger et à faire tourner. Faute de clé
  configurée, une clé de démonstration prend le relais et le billet porte la
  mention **SPÉCIMEN** — une démonstration ne doit jamais pouvoir circuler
  pour un vrai titre.

**À revoir**
- Le terminal ne connaît qu'une clé publique à la fois. Une vraie rotation
  sans rupture demandera qu'il en embarque plusieurs, indexées par `k` — le
  champ existe déjà dans la charge utile.
- Le code statique d'un PDF reste rejouable par photo. Le plan prévoit un
  code dynamique dans l'application voyageur ; compromis identique au rail
  européen.
