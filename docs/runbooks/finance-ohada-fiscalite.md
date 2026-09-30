# Runbook — Finance OHADA et fiscalité gabonaise

Ce runbook couvre le socle Finance de phase 2. Il organise la configuration et les
preuves ; il ne remplace pas le visa de la DFC, du fiscaliste ou de la DGI.

## Activer un plan de comptes

1. Importer uniquement des comptes validés par la DFC, avec code, libellé, classe
   SYSCOHADA et période de validité.
2. Contrôler les comptes collectifs, auxiliaires et analytiques attendus par SAGE
   X3 avant de rendre le plan actif.
3. Ne jamais réutiliser un code pour une autre nature comptable. Créer une nouvelle
   version et conserver l'ancienne pour relire les pièces historiques.

## Activer un jeu fiscal

1. Relever le texte applicable depuis la DGI ou le Journal officiel, sa date
   d'effet, les bases, exclusions, précomptes et conventions éventuelles.
2. Enregistrer la source et les taux en points de base. Un taux de 18 % est saisi
   `1800`, un taux de 1 % est saisi `100`.
3. Faire contrôler la configuration par un utilisateur distinct du créateur.
4. Vérifier qu'aucun autre jeu actif ne chevauche la même période et le même champ.
5. Tester au minimum une opération taxable, une opération exonérée, un avoir et un
   cas de précompte avant activation opérationnelle.

Sources de contrôle :

- OHADA/AUDCIF : <https://www.ohada.org/pt-pt/publicacao-do-novo-acto-uniforme-sobre-o-direito-da-contabilidade-e-da-informacao-financeira/>
- DGI Gabon : <https://dgi.ga/textes-specifiques/>
- Journal officiel gabonais : <https://journal-officiel.ga/>

## Valider un lot comptable

- Le lot doit porter une référence, une date, une période et une corrélation.
- Chaque ligne débite ou crédite un montant entier de FCFA ; une ligne n'utilise
  jamais simultanément débit et crédit.
- Le total des débits doit être strictement égal au total des crédits.
- Le valideur doit être distinct du créateur.
- Après validation, ne modifier ni lot ni ligne. Passer une pièce de correction ou
  d'extourne avec sa propre corrélation et la référence de causalité.

## Tableau de bord bloqué

Le tableau de bord reste volontairement en état « préparation impossible » si :

- aucun jeu fiscal approuvé n'est applicable à la date courante ;
- aucun compte actif n'est disponible ;
- la source légale ou sa date d'effet est absente ;
- le mapping SAGE/e-tax n'a pas été homologué.

Ne pas contourner ces blocages en injectant des chiffres d'exemple. Corriger le
référentiel, conserver le motif dans l'audit, puis recharger la synthèse.

## Incident ou règle erronée

1. Suspendre l'utilisation du jeu concerné sans supprimer son historique.
2. Identifier les lots produits pendant sa période d'application.
3. Faire qualifier l'impact par la DFC/fiscaliste.
4. Créer une version corrigée avec nouvelle source, nouvelle corrélation et
   validation séparée.
5. Corriger les écritures par pièces dédiées ; ne jamais réécrire un lot validé.

Un calcul interne ne doit pas être présenté comme une déclaration transmise tant
qu'aucun reçu e-tax ou acquittement DGI n'est conservé par l'outbox plateforme.
