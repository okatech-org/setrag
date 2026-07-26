/// <reference types="vite/client" />

/**
 * Chargement des modules de fonctions pour `convex-test`.
 *
 * `convexTest(schema, modules)` importe dynamiquement le code des fonctions —
 * il a notamment besoin du dossier `_generated` pour localiser la racine du
 * projet, et des modules de fonctions pour exécuter les tâches planifiées.
 *
 * Note d'implémentation : la documentation Convex propose le motif
 * `"./**\/!(*.*.*)*.*s"`, qui repose sur la syntaxe extglob. Elle ne résout
 * plus rien avec le moteur de glob de Vite 7 (tinyglobby) utilisé par
 * Vitest 4 — le glob renvoyait zéro module. On utilise donc la forme à
 * motifs négatifs, équivalente et supportée.
 */
export const modules = import.meta.glob([
  "./**/*.ts",
  "./**/*.js",
  "!./**/*.d.ts",
  "!./**/*.test.ts",
  "!./**/*.setup.ts",
])
