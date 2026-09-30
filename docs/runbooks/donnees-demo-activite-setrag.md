# Données de démonstration — activité ferroviaire SETRAG

Ce jeu alimente les applications avec des situations cohérentes entre la
billetterie, le contrôle embarqué, le fret industriel, la Finance et le
registre PCA/PRA. Toutes les valeurs sont synthétiques : elles illustrent le
fonctionnement du SI et ne doivent jamais être présentées comme des données
d'exploitation, contractuelles, sociales ou comptables de la SETRAG.

## Périmètre

- Billetterie et contrôle : dessertes Owendo–Franceville, ventes, paiements,
  contrôles et incidents fictifs déjà fournis par `seeds/demo`.
- Fret : quatre convois fictifs couvrant manganèse, filière bois,
  hydrocarbures/TMD et conteneurs, avec alertes et documents de transport.
- Finance : plan minimal, règles fiscales illustratives et trois lots
  équilibrés dont toutes les références commencent par `DEMO-`.
- PCA/PRA : billettique, contrôle hors ligne, télécommunications le long de la
  voie et Finance, avec des preuves volontairement complètes et incomplètes.

Les ordres de grandeur Fret sont calibrés sur les informations publiques de la
SETRAG : corridor de 648 km, activité marchandises/minerai proche de 8,9 Mt en
2024 et familles de wagons adaptées aux flux miniers, bois et hydrocarbures.
Cette calibration ne transforme pas les scénarios en chiffres officiels.

## Préconditions de sécurité

Le peuplement est fermé tant que la variable suivante ne vaut pas exactement
`true` :

```text
DEMO_ACCOUNTS_ENABLED=true
```

Ne jamais lancer ces seeds dans une base contenant des utilisateurs ou des
données réels. Le seed Finance/PCA refuse atomiquement toute base contenant
déjà une racine non préfixée `DEMO-`. Les utilisateurs techniques qu'il crée
sont désactivés, sans courriel ni téléphone et ne peuvent pas se connecter.

## Peuplement

Depuis `packages/backend`, exécuter les lots nécessaires :

```sh
bunx convex run seeds/referential:run
bunx convex run seeds/demo:run '{"days":62,"withActivity":true}'
bunx convex run seeds/fretDemo:provision
bunx convex run seeds/enterpriseDemo:run
```

Le premier lot pose le référentiel voyageurs. Le second crée les dessertes et
l'activité commerciale ; les jours futurs sont complétés en arrière-plan. Les
deux derniers sont idempotents et peuvent être rejoués sans duplication.

Les identités Better Auth de la cartographie des acteurs restent un lot
séparé, documenté dans `docs/runbooks/demo-personas.md`.

## Contrôles après exécution

- `/fret` affiche le bandeau `Données synthétiques de démonstration`, quatre
  flux et leurs alertes.
- `/finances` affiche les références `DEMO-`, des lots équilibrés, et maintient
  la production OHADA/e-tax bloquée faute d'homologation SAGE X3/e-tax.
- `/securite` affiche la préparation PCA/PRA, dont au moins une politique prête
  et une politique à renforcer.
- Les écrans statiques COTRAF, GMAO, RH, GED, infrastructures et Copilot portent
  la mention `SYNTHÉTIQUE · NON OFFICIEL`.

## Sources de calibration

- [SETRAG — chiffres clés](https://setrag.eramet.com/setrag/la-setrag-en-un-clin-doeil/chiffres-cles/)
- [SETRAG — activité fret](https://setrag.eramet.com/setrag/notre-chemin-de-fer/fret/)
- [SETRAG — gares du Transgabonais](https://mobile.setrag.ga/pages/gares)
- [DGI Gabon — TVA](https://dgi.ga/imposition-des-personnes-morales/taxes-sur-le-chiffre-daffaires/tva/)
- [DGI Gabon — CSS](https://dgi.ga/imposition-des-personnes-morales/taxes-sur-le-chiffre-daffaires/la-contribution-speciale-de-solidarite-css/)

Les sources fiscales servent uniquement à rattacher le scénario à un
référentiel consultable. Les taux doivent être revalidés à leur date d'effet
avant toute utilisation métier.
