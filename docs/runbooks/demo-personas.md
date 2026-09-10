# Profils de démonstration SETRAG

> **Danger — environnements éphémères uniquement.** Ne jamais activer ces
> comptes sur un environnement contenant des utilisateurs ou des données
> réels. Le catalogue transmet volontairement les mots de passe au navigateur
> pour permettre la connexion rapide.

## Activation

Le catalogue est fermé par défaut. Il n'est exposé que lorsque la variable
suivante vaut exactement `true` :

```text
DEMO_ACCOUNTS_ENABLED=true
```

Pour les 45 profils de la cartographie SETRAG — 35 fonctions internes et 10
parties prenantes externes — configurer :

```text
DEMO_PERSONAS_PASSWORD=<mot-de-passe-de-demo-robuste>
DEMO_PERSONAS_EMAIL_DOMAIN=demo.setrag.ga
```

`DEMO_PERSONAS_EMAIL_DOMAIN` est facultatif et vaut `demo.setrag.ga` par
défaut. Les adresses sont dérivées de la clé du profil, par exemple
`atelier@demo.setrag.ga`. Le mot de passe partagé doit respecter la politique
Better Auth et ne doit être réutilisé nulle part ailleurs.

Le profil interne `dsi` représente l’**Administrateur système** rattaché à la
**Direction des Systèmes d’Information & Projets Métiers**. Il ouvre l’espace
`/administration`, sans conférer automatiquement des droits d’écriture métier
sur les modules sensibles.

Les trois couples historiques restent pris en charge :

```text
DEMO_AGENT_EMAIL=...
DEMO_AGENT_PASSWORD=...
DEMO_MANAGEMENT_EMAIL=...
DEMO_MANAGEMENT_PASSWORD=...
DEMO_CONTROL_EMAIL=...
DEMO_CONTROL_PASSWORD=...
```

Un couple historique complet a priorité sur le compte dérivé correspondant
(`agent`, `gestion` ou `controle`). Sans `DEMO_PERSONAS_PASSWORD`, seuls les
couples historiques complets sont exposés et provisionnés.

## Provisionnement

Exécuter d'abord `seeds/referential:run` si le référentiel n'existe pas : le
profil `agent` sera alors automatiquement rattaché au point de vente
`OWE-PV`. Vérifier aussi la configuration habituelle de Better Auth, notamment
un `BETTER_AUTH_SECRET` valide, puis exécuter explicitement l'action interne :

```sh
bunx convex run seeds/demoAccounts:provisionPersonas
```

L'action :

1. refuse de s'exécuter si `DEMO_ACCOUNTS_ENABLED` n'est pas armé ;
2. crée chaque identité Better Auth ou valide le mot de passe par connexion si
   elle existe déjà ;
3. crée ou met à jour le profil applicatif avec son rôle métier ;
4. écrit, pour chacun des dix modules, une activation utilisateur explicite
   `true` ou `false` dans l'environnement `SETRAG_ENV` courant.

L'opération est idempotente : une relance réaligne les profils et les dix
activations sans créer de doublons. Le seed historique
`seeds/demoAccounts:provision`, qui peuple l'activité commerciale du compte
agent, reste disponible séparément.

## Contrôles de sécurité

- Couper `DEMO_ACCOUNTS_ENABLED` dès la démonstration terminée. La requête de
  catalogue retourne alors strictement une liste vide.
- Ne jamais enregistrer les mots de passe dans Git, des captures, des tickets
  ou des journaux.
- Utiliser un domaine et un mot de passe propres à chaque environnement
  éphémère.
- Ne pas exposer une URL de démonstration sur Internet sans protection d'accès
  supplémentaire.
- Les parties prenantes externes disposent uniquement de droits de lecture sur
  leurs modules ; les activations de modules ne remplacent jamais le RBAC.
- Ne jamais lancer ce provisionnement en production ou sur un environnement
  réel, même temporairement.
