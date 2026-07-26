# Décisions d'architecture — SETRAG

Un ADR par décision structurante : ce qui a été décidé, ce qui a été écarté,
et ce que le choix coûte. On y trouve les alternatives rejetées et les limites
connues, pas seulement le résultat.

Les plans dans [`docs/plans/`](../plans/) décrivent **ce que fait** le
système, pour le client. Ces ADR expliquent **pourquoi il est fait ainsi**,
pour qui le maintiendra.

Un ADR ne se réécrit pas quand la décision change : on en ajoute un nouveau
qui remplace le précédent, et l'ancien passe en `remplacé par`.

| # | Décision | Statut |
|---|---|---|
| [0001](0001-convex-comme-socle.md) | Convex comme socle applicatif | accepté |
| [0002](0002-logique-metier-pure-isolee.md) | Logique métier pure isolée dans `convex/model/` | accepté |
| [0003](0003-inventaire-par-masques-de-bits.md) | Inventaire des places par masques de bits sur les segments | accepté |
| [0004](0004-vente-en-une-mutation.md) | Toute la vente dans une seule mutation | accepté |
| [0005](0005-matrice-de-droits-declarative.md) | Matrice de droits déclarative plutôt que rôles en dur | accepté |
| [0006](0006-authentification-decouplee.md) | Identité lue via `ctx.auth`, découplée de Better Auth | accepté |
| [0007](0007-titre-autoporteur-signe.md) | Titre auto-porteur signé Ed25519, CBOR canonique, sans compression | accepté |
| [0008](0008-rasterisation-aztec-maison.md) | Rastérisation du symbole Aztec écrite à la main | accepté |
| [0009](0009-pdf-en-action-hors-transaction.md) | Le billet PDF est produit par une action, hors de la vente | accepté |
| [0010](0010-strategie-de-test-a-deux-etages.md) | Stratégie de test à deux étages : `convex-test` et backend réel | accepté |
| [0011](0011-dates-de-service-en-arithmetique-fixe.md) | Dates de service en arithmétique fixe UTC+1 | accepté |
| [0012](0012-tarification-conforme-au-cdc.md) | La tarification suit le CDC, pas les pratiques du secteur | accepté |
| [0013](0013-comptabilite-en-outbox.md) | Interface comptable SAGE X3 en outbox | accepté |

## Fils conducteurs

Trois principes reviennent d'un ADR à l'autre ; ils expliquent la plupart des
arbitrages.

**La garantie doit découler de la forme du code, pas de la vigilance.**
L'absence de survente vient de l'atomicité d'une mutation (0004), pas d'une
discipline de verrouillage. Le moindre privilège vient d'une matrice qui
refuse par défaut (0005), pas d'une revue attentive. La reprise des
signatures teste la vérification effective (0007), pas un numéro de version
qu'on pourrait oublier de changer — c'est d'ailleurs l'erreur qui a été
commise puis corrigée.

**Un échec doit être bruyant.** Le dépassement de 30 segments lève (0003).
Un billet sans code-barres refuse de s'imprimer (0009). Une clé mal formée
lève au lieu de signer avec n'importe quoi (0007). Le cas redouté est le
symbole aux trous bouchés (0008) : valide en apparence, refusé au contrôle —
d'où la relecture par un décodeur indépendant.

**Vérifier contre une référence extérieure, pas contre soi-même.** RFC 8032
pour Ed25519, RFC 9285 pour Base45, ZXing pour le symbole Aztec, un backend
Convex réel pour la concurrence (0010). Une suite de tests qui n'interroge que
son propre code confirme surtout sa propre cohérence.
