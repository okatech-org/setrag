# ADR-0008 — Rastérisation du symbole Aztec écrite à la main

**Statut :** accepté
**Date :** 2026-07-26
**Portée :** `convex/model/aztec.ts`, `convex/lib/aztecRender.ts`

## Contexte

Le billet PDF doit porter un symbole **Aztec** — standard de fait du
ferroviaire (UIC), pas de marge blanche obligatoire, meilleure lecture sur
papier froissé ou écran fissuré.

`bwip-js` (portage de BWIPP) encode l'Aztec correctement : il n'y avait aucune
raison de réimplémenter une spécification aussi fournie. Mais il ne **rend**
que vers un canvas ou vers du SVG, et ni l'un ni l'autre ne s'embarque dans
un PDF produit par `pdf-lib` :

- le canvas n'existe pas dans le runtime Convex ;
- le chemin SVG se remplit en **`fill-rule="evenodd"`**, règle que `pdf-lib`
  ne sait pas appliquer. Dessiné en remplissage non nul, le symbole aurait ses
  trous bouchés — illisible, et **silencieusement** : rien n'aurait échoué,
  le billet aurait simplement été refusé au contrôle.

## Décision

`bwip-js` encode ; on lui retire sa sortie graphique. Un objet de dessin
capte les **polygones** qu'il émet, et `model/aztec.ts` en reconstitue la
**grille de modules** par lancer de rayon à parité — exactement la règle
`evenodd`. Les modules encrés sont ensuite fusionnés en segments horizontaux
et dessinés en rectangles dans le PDF.

Repère conservé : celui de bwip-js, hérité de PostScript, origine en bas à
gauche — c'est aussi celui du PDF, donc aucune inversion à faire.

## Options considérées

### Option A — Rastériser les polygones (retenue)

**Pour :** vectoriel et exact, aucune dépendance graphique, entièrement
testable en logique pure. La fusion en segments divise par trois le nombre
d'opérateurs PDF et évite les liserés blancs que le lissage d'un lecteur PDF
fait apparaître entre rectangles jointifs.

**Contre :** ~90 lignes à écrire et à tester. Dépend de la forme de sortie de
`bwip-js` (polygones), qui n'est pas un contrat public.

### Option B — Passer le chemin SVG à `pdf-lib.drawSvgPath`

**Pour :** trois lignes.

**Contre :** faux, pour cause de règle de remplissage. Et faux sans rien
signaler — le pire mode d'échec possible pour un titre de transport.

### Option C — Rendre en PNG et embarquer l'image

**Pour :** chemin balisé.

**Contre :** exige un encodeur PNG (ou un canvas, absent du runtime), et
transforme un symbole vectoriel en bitmap dont la netteté dépend de la
résolution choisie.

### Option D — Écrire les opérateurs PDF à la main avec `f*` (even-odd)

**Pour :** conserve le chemin vectoriel d'origine.

**Contre :** API de bas niveau de `pdf-lib`, code fragile, et il faudrait
quand même analyser la chaîne du chemin SVG.

## Analyse

Le point délicat n'est pas la difficulté mais la **détectabilité de
l'erreur**. Un symbole aux trous bouchés se voit à l'œil si on le regarde,
mais aucun test structurel ne l'attrape : le PDF est valide, sa taille est
plausible, le chemin est présent.

D'où la contre-mesure : la boucle est fermée par un **décodage ZXing** du
symbole rastérisé, puis du PDF réellement produit par le déploiement. Sans
cette relecture, on vérifierait seulement que le code est d'accord avec
lui-même.

Le taux de correction d'erreur est porté à **30 %** (défaut 23 %). Mesuré :
pour nos charges utiles, le symbole reste à 45 modules de côté — le
dimensionnement Aztec étant quantifié par couches, la correction
supplémentaire est ici obtenue sans agrandir le symbole. Un billet vit dans
une poche ; un contrôle raté coûte plus cher que des modules.

## Conséquences

**Devient plus facile**
- Le symbole est vectoriel : net à toute échelle d'impression.
- La rastérisation est de la logique pure, testable sans PDF ni image.

**Devient plus difficile**
- Une montée de version majeure de `bwip-js` pourrait changer la forme des
  appels de dessin. Le test de décodage ZXing le détecterait immédiatement —
  c'est sa raison d'être autant que la vérification initiale.

**À revoir**
- L'option `eclevel` n'est pas dans les typages de `bwip-js` (ils ne couvrent
  que les options communes) ; elle est déclarée localement dans
  `aztecRender.ts`. À vérifier à chaque montée de version.
