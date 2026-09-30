# Runbook — documents et approbations

## Dépôt documentaire

1. Générer une URL d’envoi avec le module et le site cibles.
2. Envoyer le fichier directement au stockage.
3. Créer le dossier ou sa nouvelle version avec le même module, la même entité et
   le même site, un motif précis et une corrélation unique.
4. Conserver l’identifiant du dossier retourné. Une reprise strictement identique
   avec la même corrélation est sans effet ; toute incohérence est rejetée.

Le serveur refuse les fichiers vides, supérieurs à 25 Mio, les types non autorisés,
une taille déclarée différente et une empreinte déclarée différente de celle du
stockage. Un contrôle antivirus reste obligatoire avant une activation partagée.

## Archivage et incident documentaire

L’archivage masque logiquement le dossier sans supprimer ses versions ni ses blobs.
Ne jamais supprimer directement une version ou un blob : relever le dossier, la
corrélation et l’acteur dans l’audit, puis appliquer la politique de rétention
validée. En cas de fichier suspect, désactiver son usage dans le module concerné et
préserver les preuves avant toute intervention.

## Circuit d’approbation

- Le demandeur fournit les étapes dans leur ordre définitif.
- Seul l’approbateur affecté à l’étape courante peut décider.
- Un rejet termine immédiatement le circuit ; la dernière approbation le clôt.
- Le demandeur ne peut pas être approbateur et ne peut annuler que son propre
  circuit. Un administrateur peut aussi l’annuler avec un motif.
- Une corrélation rejouée doit porter exactement la même intention ; sinon
  l’opération échoue pour éviter de masquer un conflit.

Quand un circuit reste en attente, vérifier l’étape courante, l’utilisateur affecté,
son compte actif et sa portée de site. Ne pas modifier les lignes en base. Si une
suppléance est requise, annuler avec un motif puis recréer un circuit conforme aux
règles métier validées.

Une approbation terminale ne change pas automatiquement l’entité métier. Vérifier
le traitement propre au module avant de considérer l’opération achevée.
