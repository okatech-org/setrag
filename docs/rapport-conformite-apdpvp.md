# Rapport de conformité APDPVP — site et application mobile SETRAG

Date de recherche et de revue du code : **30 septembre 2026**. Périmètre : billetterie du Transgabonais, application voyageur iOS/Android, services partagés, contrôle à bord et interfaces agents lorsqu’ils utilisent les mêmes données.

Ce rapport prépare les décisions et les travaux de mise en conformité. Il rapproche les textes publics des fonctions présentes dans le dépôt. Il ne vaut ni avis juridique signé, ni audit de sécurité en production, ni attestation de conformité délivrée par l’APDPVP. Les qualifications signalées « à valider » demandent une réponse du conseil juridique ou de l’autorité compétente avant activation de la fonction concernée.

## 1. Décisions à prendre avant l’ouverture au public

**Le projet possède déjà plusieurs mécanismes utiles, mais les éléments examinés ne permettent pas de conclure à sa conformité.** Le web propose des consentements versionnés, un export JSON et une suppression de compte. Le backend contrôle les droits, journalise des opérations et programme certaines purges. Il reste à traiter des obligations administratives, des choix d’hébergement et des écarts fonctionnels.

Les priorités sont les suivantes :

1. **Faire qualifier les traitements et obtenir les actes APDPVP requis**, au nom du responsable de traitement. Inclure les comptes, les billets nominatifs, les mineurs, l’assistant IA, les messageries et les transferts. Un dossier envoyé ne suffit pas à autoriser tous les traitements.
2. **Documenter les pays de traitement et organiser la copie des données au Gabon.** Convex, l’hébergement web, les fournisseurs d’IA et les canaux externes doivent être examinés séparément. Une région européenne ne dispense pas d’autorisation gabonaise de transfert.
3. **Remplacer les mentions générales par une information complète**, au moment de chaque collecte, sur le web et dans l’application. Revoir le consentement générique « Utilisation de mes données de compte ».
4. **Créer le parcours des voyageurs mineurs et des voyageurs tiers.** L’acheteur d’un billet n’est pas nécessairement son passager, ni le titulaire de l’autorité parentale.
5. **Compléter l’exercice des droits**, en particulier l’export, la limitation, la suppression distribuée et les fonctions mobiles. Une modification du nom dans `users` n’anonymise pas les billets nominatifs conservés ailleurs.
6. **Adopter des durées de conservation par catégorie.** Prévoir les dix ans imposés aux données de connexion et de trafic, sans étendre cette durée à toutes les données du client.
7. **Encadrer l’IA, les accès aux billets et les copies hors ligne**, puis éprouver la réponse aux incidents et les restaurations.
8. **Faire arrêter les CGV et les règles de rétractation/remboursement.** Le droit français du billet de transport ne doit pas être transposé sans vérification au Gabon.

Fondements principaux : loi n°025/2023, notamment art. 70–89, 98–104, 113–147 et 171–190 ; loi n°025/2021, art. 55–60 et 138 ; loi n°027/2023, art. 28–36. [Protection des données][L23] · [Transactions électroniques][TE21] · [Cybersécurité][CY23].

## 2. Méthode et limites de la revue

L’URL transmise désigne l’autorité de protection des données du Gabon. Le site et l’application concernés ont été interprétés comme ceux du projet SETRAG ouvert dans le dossier de travail.

La revue a porté sur les textes de l’APDPVP, le Journal officiel, les textes connexes et les politiques officielles des boutiques mobiles. Le code a été examiné dans l’arbre de travail existant, dont le commit de base était `c4e3a99`. Cet arbre contient des modifications en cours : les constats décrivent les fichiers consultés, pas une version certifiée ni un déploiement identifié.

N’ont pas été fournis ou vérifiés : les récépissés et autorisations déjà détenus par SETRAG, les contrats fournisseurs, les pays effectivement configurés en production, les sauvegardes, les journaux réels, les effectifs/volumes, la concession ferroviaire, les éventuelles classifications de sécurité et les échanges avec l’APDPVP. **« Non trouvé dans le dépôt » ne signifie pas « inexistant dans l’entreprise ».** Aucun dépôt administratif, test intrusif ou changement de production n’a été effectué.

Les constats de code figurent en section 10. Les références juridiques renvoient à des sources consultées en ligne, listées en section 14. La recherche publique n’établit pas l’absence de textes ou de décisions non indexés ; une confirmation des textes d’application et des décisions propres à SETRAG reste nécessaire.

## 3. Textes applicables et textes à qualifier

| Texte | Application à SETRAG | Conséquence pour le projet |
| --- | --- | --- |
| Loi n°001/2011, modifiée par la loi n°025/2023 du 12 juillet 2023 | Directe pour les données personnelles, en ligne et hors ligne | Référence centrale. Utiliser les dispositions de 2023, pas seulement les anciennes fiches CNPDCP. Art. 4 et 221. [Texte][L23] |
| Décret n°166/PR du 12 juillet 2023 | Promulgation de la loi de 2023 | Confirme sa promulgation. Le titre HTML du Journal officiel affiche une autre date ; le texte signé et le décret portent le 12 juillet. [Décret][PROM23] |
| Règlement intérieur CNPDCP de 2018, encore proposé par l’APDPVP | Procédures, à rapprocher des textes plus récents | Obtenir les modalités actuelles de dépôt, de délivrance, de renouvellement et les frais. Ne pas déduire une validité uniforme à partir d’un ancien formulaire. [Page officielle][RI] |
| Délibérations et normes APDPVP/CNPDCP | Selon les traitements concernés | Les autorisations accordées à une banque ou une compagnie aérienne ne couvrent pas SETRAG. Aucune norme générale dédiée à la billetterie ferroviaire n’a été identifiée dans les publications examinées. [Répertoire][DELIB] |
| Norme simplifiée n°003/2019, délibération n°016 du 23 mai 2019 | Si géolocalisation de véhicules/personnels | Dossier technique, information des salariés, accès limités et conservation spécifique. Ne pas la transformer en règle générale pour le GPS des voyageurs. [Norme][GEO] |
| Norme vidéosurveillance/télésurveillance de 2019 | Si caméras en gare, dans les trains ou intégration au système | Traitement distinct à qualifier. Une photo ponctuelle d’incident n’est pas automatiquement un système de vidéosurveillance. [Répertoire][DELIB] |
| Normes n°003/2025 et n°004/2025, observatoire des élections | Pas de fondement identifié pour la billetterie | Les publications de février/mars 2025 concernent partis, associations ou activités électorales ; ne pas utiliser leur régime simplifié pour SETRAG. [Normes][NORMES] |
| Loi n°025/2021 du 28 décembre 2021 sur les transactions électroniques | Directe pour la vente web/mobile | Informations avant commande, preuve du contrat, prospection, droits du consommateur et copie nationale des données. [Texte][TE21] |
| Loi n°027/2023 du 12 juillet 2023 sur la cybersécurité | Directe comme exploitant de système d’information ; régime renforcé conditionnel | Gestion des risques, visa de conformité, audits, journaux et hébergement. Faire vérifier l’éventuelle classification d’infrastructure critique et la portée des dispositions sur les systèmes sensibles. [Texte][CY23] |
| Ordonnance n°0006/PR/2025 du 12 août 2025 sur la digitalisation | Champ annoncé couvrant organismes publics et privés | Sécurité, accessibilité, interopérabilité ; qualifier les règles supplémentaires si marché public. Vérifier ratification et textes d’application. [Texte][DIG25] |
| Ordonnance n°0011/PR/2026 du 26 février 2026 sur les réseaux sociaux et plateformes numériques | À qualifier pour SETRAG ; particulièrement pertinente pour pages publiques et futures fonctions communautaires | Examiner les définitions, les comptes mineurs et les contenus IA. Ne pas assimiler sans analyse une billetterie vendant ses propres services à un réseau social. [Texte][SOC26] |
| Redevance pour la protection des données ; CGI publié par la DGI et loi de finances 2026 | Assujettissement et calcul à faire confirmer par la DAF | Prévoir un poste budgétaire, obtenir une qualification écrite et le circuit déclaratif applicable. [CGI][CGI25] · [LF 2026][LF26] |
| AUDCIF OHADA, art. 24 | Comptabilité et pièces justificatives | Conservation comptable de dix ans ; déterminer exactement les champs et documents concernés. [Texte et accès officiel][OHADA] |
| RGPD européen | Conditionnel, et éventuellement contractuel | Analyser établissement européen, ciblage de personnes dans l’UE ou suivi de leur comportement. La nationalité européenne d’un voyageur ou l’accès mondial au site ne suffit pas. [Art. 3][RGPD] |
| Politiques Apple et Google Play | Contractuelles pour la publication dans les boutiques | Confidentialité, déclarations sur les données, permissions et suppression de compte. Ce ne sont pas des règlements APDPVP. [Apple][APPLE] · [Google][GOOGLE] |

Le dépôt mentionne une exigence RGPD du cahier des charges/groupe. Cette indication doit être vérifiée dans le contrat signé. Une exigence contractuelle peut s’ajouter au droit gabonais sans que l’ensemble du RGPD soit automatiquement applicable à tous les traitements.

## 4. Traitements à inscrire au registre

Hypothèse à confirmer : SETRAG décide des finalités et des moyens essentiels de la billetterie et agit comme responsable de traitement. Le prestataire de développement/exploitation agit comme sous-traitant lorsqu’il traite les données sur instruction. Un fournisseur de paiement peut avoir ses propres obligations et agir comme responsable distinct pour certaines opérations. Les accès du groupe, des agences et des partenaires demandent une qualification propre.

| Traitement | Données et personnes | Base juridique à documenter | Points particuliers |
| --- | --- | --- | --- |
| Compte et connexion OTP | Identité, téléphone, e-mail, sessions, IP | Exécution du service de compte ; sécurité selon obligation/intérêt légitime documenté | Ne pas fonder tout le compte sur un consentement facultatif révocable sans effet réel |
| Recherche, réservation, billet, contrôle | Passager, trajet, dates, place, tarif, scans | Contrat/mesures précontractuelles ; préciser le cas du passager distinct de l’acheteur | Mineurs, minimisation, accès au manifeste, copies locales |
| Voyageurs enregistrés et contact d’urgence | Identité de tiers, date de naissance, téléphone, genre | Base distincte selon utilité et relation avec la personne | Information indirecte ; accord parental pour mineurs ; usage du contact limité à l’urgence |
| Paiement et remboursement | Référence PSP, montant, statut, coordonnées nécessaires | Contrat et obligations financières applicables | Ne pas stocker code secret Mobile Money, cryptogramme ou copie de carte |
| Comptabilité et preuve de vente | Écritures, justificatifs, factures, version des CGV | Obligation légale et défense de droits, selon les documents | Archive séparée ; accès comptable ; durée justifiée par pièce |
| Assistance et réclamations | Demandes, pièces jointes, historique de résolution | Exécution du service ; défense de droits si litige | Informations sensibles libres, droits de tiers, durée après clôture |
| Assistant IA texte et voix | Messages, contexte de page, résultats d’outils, transcription/audio selon parcours | Base à fixer par finalité ; accord distinct si captation/conservation le requiert | Formalité IA, transferts, contrôle humain, pas d’apprentissage secondaire non autorisé |
| Messageries externes | Identifiants Telegram et autres canaux, messages, liaison de compte | Service demandé et base propre aux autres usages | Telegram implémenté ; autres canaux prévus dans l’architecture à inventorier s’ils sont activés |
| Alertes de trajet et notifications | Coordonnées, préférences, jetons push | Contrat pour les messages nécessaires ; choix séparé pour les services facultatifs | Distinguer permission OS, abonnement aux alertes et consentement commercial |
| Prospection | Coordonnées, préférence marketing, preuve d’accord | Consentement spécifique | Arrêt effectif de l’envoi après retrait, y compris messages déjà en file |
| Sécurité et audit | Connexions, trafic, accès agents, événements sensibles | Obligations de cybersécurité et sécurité documentée | Séparer contenu métier, logs de connexion et traces de diagnostic |
| Incidents et procès-verbaux | Identité, faits, photos, agent, lieu | Base et habilitation à qualifier selon la nature des faits | Distinguer irrégularité commerciale et infraction pénale ; art. 77 et 81 |
| Statistiques et suivi des trains | Données agrégées ou trajets identifiables | Base selon méthode ; anonymisation effective pour sortir du champ | La position d’un train peut révéler celle de son personnel ; pas de GPS passager nécessaire par défaut |

Le registre doit préciser aussi les destinataires, pays, durées, mesures de sécurité et responsable interne. Le registre de sous-traitant du prestataire complète celui de SETRAG. L’exemption des très petites structures n’est pas utilisable pour dispenser une activité régulière de billetterie : art. 119–123. Les bases ci-dessus sont des propositions de qualification, à arrêter au titre de l’art. 71. [Loi de 2023][L23].

## 5. Démarches auprès de l’APDPVP et gouvernance

### 5.1 Dossier initial et actes à obtenir

Préparer un dossier par ensemble cohérent de finalités, avec un tableau de correspondance entre traitements, applications et fournisseurs. L’art. 79 permet une déclaration unique pour des finalités identiques ou liées sous un même responsable ; cela ne signifie pas qu’une déclaration couvre automatiquement toutes les fonctions futures.

| Régime | Application envisagée | Pièce attendue avant activation |
| --- | --- | --- |
| Déclaration de droit commun, art. 78–79 et plateformes art. 175/187 | Billetterie, comptes et services courants, sous réserve des régimes spéciaux | Récépissé correspondant au périmètre réel |
| Autorisation, art. 81 | Mineurs visés par le renvoi à l’art. 74, données sensibles/biométriques selon le traitement, infractions, certaines interconnexions ou exclusions automatisées | Qualification avec l’APDPVP, puis autorisation requise ; ne pas se contenter d’une case de consentement |
| Transfert, art. 171–174 | Hébergement, support ou traitement de données à l’étranger | Autorisation couvrant destinataires, pays, finalités et garanties |
| IA, art. 177–178 | Assistant texte, assistant vocal et éventuels modèles de profilage | Avis ou déclaration et clarification de la norme applicable |
| Identité numérique/identifiant sectoriel, art. 179/186 | Identités de compte et rapprochements, selon interprétation de l’autorité | Qualification écrite et formalité appropriée |
| Interconnexion, art. 81 et 168–170 | Rapprochement de fichiers de finalités différentes, partenaires ou systèmes publics | Autorisation si les conditions sont réunies ; un simple appel technique interne ne suffit pas à qualifier le régime |

La dispense liée à un DPO prévue à l’art. 89 ne concerne que certaines formalités des art. 78–79, avec exclusion en cas de transfert à l’étranger. Elle ne doit pas être invoquée pour écarter les autorisations spéciales ou les dispositions propres aux plateformes/à l’IA. Les renvois internes du texte de 2023 présentent des incohérences ; faire confirmer notamment le régime des mineurs, des données sensibles et des identifiants. [Loi de 2023][L23].

Pour les demandes privées d’autorisation, le texte prévoit deux mois, renouvelables une fois par décision motivée, et un rejet implicite en l’absence de réponse dans les délais concernés : art. 81/85. **Le calendrier de développement ne remplace pas ce délai administratif.** Le dépôt ne doit pas être présenté comme une autorisation.

Pièces à réunir conformément à l’art. 87 : identité juridique de SETRAG et signataire, finalités, catégories de personnes/données, origine des données, destinataires, habilitations, durées, transferts, contrats de sous-traitance, mesures de sécurité, procédure de droits et description des interconnexions. Ajouter un schéma des flux, le registre, les notices et l’analyse des risques pour rendre le dossier vérifiable.

La [page Formulaires][FORM] indique que les exemplaires en ligne sont des modèles sans valeur juridique et renvoie au bureau d’enregistrement. Comme certaines pages conservent l’ancien nom CNPDCP, confirmer le canal actuellement accepté. Demander les frais, les dates de validité, les modalités de renouvellement et conserver les preuves de dépôt/réception. Aucun tarif administratif précis n’a été établi par cette revue.

Le règlement de 2018, art. 68, prévoit aussi des démarches électroniques, par recommandé ou au bureau d’enregistrement. Son art. 71 traite les dossiers incomplets et le départ du délai de décision ; son art. 114 renvoie les frais à une délibération. Cette différence avec la page Formulaires justifie de confirmer le circuit actuel. Les modifications ou suppressions de traitements doivent être signalées ; inscrire cette obligation dans la gestion des changements, conformément à l’art. 87 de la loi de 2023 et à l’art. 69 du règlement. [Règlement, PDF officiel][RIPDF].

### 5.2 DPO, contrats et organisation

- Désigner immédiatement un responsable interne du chantier. Examiner le caractère obligatoire d’un DPO au titre de l’art. 125 : statut de l’organisme, suivi régulier et systématique à grande échelle, traitements sensibles à grande échelle. Le volume réel et le statut juridique manquent pour conclure définitivement.
- Si un DPO est désigné, vérifier agrément/liste d’aptitude selon l’art. 124, notifier sa désignation à l’APDPVP (art. 131), prévoir ressources, accès à la direction et absence de conflit d’intérêts. Un DPO externe personne morale doit remplir les conditions locales de l’art. 124.
- Signer les contrats de sous-traitance : instructions, objet/durée, sécurité, sous-traitants ultérieurs, pays, soutien aux droits et incidents, restitution/effacement, audit et réversibilité. Obtenir l’autorisation écrite de la sous-traitance ultérieure selon le dispositif choisi.
- Faire signer les engagements de confidentialité, former agents, contrôleurs et support, organiser les entrées/sorties d’habilitation.
- Réaliser une analyse d’impact avant d’activer les traitements susceptibles de présenter un risque élevé : mineurs, déplacements, IA/voix, incidents et croisements de fichiers. Documenter le seuil de risque, l’avis du DPO et la nécessité d’une consultation préalable. L’art. 6 définit l’AIPD ; les art. 116 et 138 la reprennent. Cette analyse ne se réduit pas à une obligation automatique attachée à chaque page web.

Fondements : art. 111–141 de la [loi de 2023][L23].

## 6. Hébergement, transferts et fournisseurs

### 6.1 Deux exigences distinctes

**Autoriser les transferts.** L’art. 171 soumet le transfert vers un autre État à l’autorisation de l’APDPVP. Les exceptions et garanties de l’art. 173 demandent une qualification ; ni un consentement général, ni un contrat européen standard ne constituent à eux seuls une autorisation gabonaise. Recenser aussi sauvegardes, assistance à distance, sous-traitants ultérieurs et journaux. [Loi n°025/2023][L23].

**Disposer d’une copie au Gabon.** L’art. 138 de la loi sur les transactions électroniques impose une copie nationale des données des transactions ayant une implication au Gabon. L’art. 36 de la loi sur la cybersécurité prévoit aussi une copie nationale selon les modalités réglementaires. La fréquence, le périmètre et les modalités de cette copie restent à faire préciser ; ne pas affirmer qu’un export annuel suffit. [Loi sur les transactions électroniques][TE21] · [Loi cybersécurité][CY23].

Une copie locale ne régularise pas un transfert non autorisé. Inversement, une autorisation de transfert ne dispense pas de la copie nationale. L’hébergement exclusif au Gabon prévu pour certaines données/systèmes sensibles constitue un régime supplémentaire à qualifier au regard des art. 23–27 de la loi cybersécurité et du statut de SETRAG.

### 6.2 Inventaire à compléter avant choix définitif d’architecture

| Acteur/service identifié | Données susceptibles de transiter | Preuves à obtenir |
| --- | --- | --- |
| Convex, base, fonctions et fichiers | Profils, billets, conversations, pièces, logs | Région réelle, sauvegardes, support, liste des sous-traitants, contrat, export/restauration et garanties de suppression |
| Vercel, cité dans les instructions du projet | Requêtes web, adresses IP, éventuels journaux/contenus serveur | Pays et fonctions réellement utilisés, CDN, logs, contrat et paramètres de collecte |
| Better Auth | Identifiants, sessions, OTP | Localisation du composant réellement hébergé, politique des sessions et des preuves d’authentification ; ne pas inventer un service distant autonome |
| OpenAI, Anthropic, Google Gemini | Messages et données fournies aux assistants selon fournisseur actif | Prestataire réellement autorisé, pays, données transmises, stockage, sous-traitants, réutilisation, procédure de droits et incidents |
| Telegram et futurs canaux | Identifiants externes, messages, liaisons de compte | Conditions du canal, transferts, périmètre de suppression possible, restrictions sur les informations envoyées |
| PSP/Mobile Money et envoi OTP/SMS/e-mail | Paiement, téléphone, messages de service | Prestataires réellement retenus, rôles juridiques, pays, contrats et limites de conservation |
| Resend, intégré pour les e-mails/OTP | Adresse e-mail, message, billet joint selon fonction, événements de livraison | Activation réelle, contrat, pays, sous-traitants, durée des messages/événements et gestion des retraits/effacements |
| Notifications, Wallet, observabilité | Jetons, billets, erreurs et métadonnées selon activation | Inventaire du binaire et des flux déployés ; contrats et déclarations correspondants |

Pour chaque ligne, consigner l’identité juridique du fournisseur, ses sous-traitants, les pays de stockage et d’accès, les finalités, la durée et l’acte APDPVP qui couvre le flux. La présence d’une bibliothèque ou d’un adaptateur ne prouve pas son activation en production.

Choix proposé : prévoir une archive chiffrée au Gabon, avec collecte contrôlée des données nécessaires, clés maîtrisées, journal de livraison et test de restauration. Faire approuver le périmètre de copie ; éviter d’y dupliquer sans discernement les historiques IA ou les diagnostics contenant des données inutiles. Les contraintes des systèmes classifiés peuvent imposer un autre choix d’hébergement.

## 7. Ce qu’il faut ajouter au site et à l’application

### 7.1 Information et consentements

Créer une politique de confidentialité accessible avant connexion, depuis les formulaires, le pied de page web et les réglages mobiles. Elle doit identifier SETRAG et le contact données/DPO, décrire finalités et bases légales, données obligatoires/facultatives, destinataires, pays et garanties, durées, droits, retrait, réclamation APDPVP et éventuelles décisions automatisées. Ajouter des mentions courtes au moment de la réservation, de l’enregistrement d’un voyageur, du contact d’urgence, du chat et de l’activation du micro. Pour les données reçues d’un tiers, prévoir l’information indirecte dans les conditions des art. 100–101. [Art. 91–104][L23].

Séparer dans les parcours et dans les preuves : acceptation contractuelle des CGV, information sur les traitements nécessaires, consentements facultatifs, accord parental, captation vocale et éventuelle prospection par canal. Les art. 72–73 distinguent consentement et CGV. Le retrait d’un consentement doit arrêter les traitements qui en dépendent ; il ne supprime pas automatiquement les archives légalement nécessaires.

Pour chaque accord, enregistrer finalité, version et texte présenté, date, mode de recueil, auteur concerné, portée et retrait. Le champ `channel` existant décrit le canal de collecte ; vérifier qu’un choix marketing « SMS », « e-mail » ou « push » a sa propre portée. Faire respecter le choix côté serveur avant chaque envoi, y compris lors du traitement d’une file différée.

### 7.2 Cookies, stockage local et SDK

L’art. 104 concerne l’accès et l’écriture dans le terminal ; l’examen doit donc couvrir cookies, `localStorage`, IndexedDB et SDK mobiles. Inventorier chaque usage, sa finalité, sa durée et son éventuelle exemption pour le service expressément demandé. [Loi de 2023][L23].

Les sessions, préférences et billets hors ligne doivent avoir une justification propre. Si des traceurs facultatifs existent, empêcher leur activation avant le choix, permettre de refuser aussi simplement que d’accepter et offrir un retrait accessible. Ces choix d’interface sont des moyens proposés pour rendre le consentement effectif. **Ne pas ajouter un bandeau vide si l’inventaire confirme uniquement des usages strictement nécessaires.** L’absence de Google Analytics dans une recherche textuelle ne suffit pas à valider tous les flux du site déployé.

### 7.3 Mineurs et réservations pour autrui

Les art. 74 et 188–193 imposent un traitement particulier des données des moins de 18 ans, avec accord du titulaire de l’autorité parentale, information adaptée et interdiction de principe du profilage des enfants. Faire confirmer la formalité d’autorisation liée au renvoi de l’art. 81. [Loi n°025/2023][L23].

Prévoir un parcours où le parent ou représentant identifié réserve pour le mineur : déclaration de qualité, preuve proportionnée, lien avec le passager, version du texte et date. Un accompagnateur ou acheteur doit pouvoir justifier son habilitation si nécessaire. Recueillir le minimum utile pour établir l’âge et le droit d’agir ; ne pas demander systématiquement une copie de pièce d’identité.

L’ordonnance de 2026 fixe une majorité numérique à 16 ans et contient des dispositions sur la création de comptes et les fonctionnalités sociales. Son champ, ses définitions et l’articulation entre ses art. 17/22 et la loi de 2023 doivent être analysés pour SETRAG. **Ce texte ne permet pas de remplacer automatiquement l’accord parental des moins de 18 ans par un seuil de 16 ans dans la billetterie.** Proposition de lancement : comptes acheteurs adultes et profils passagers mineurs rattachés à une autorité parentale, jusqu’à validation d’un parcours autonome. [Art. 2–3 et 16–24][SOC26].

Prévoir aussi une procédure de droits pour le passager qui n’a pas de compte et pour le contact d’urgence. Protéger les données de tiers dans l’export du compte acheteur.

### 7.4 Accès, correction, effacement, limitation et portabilité

Mettre en place un point de contact accessible sans compte, un suivi des demandes et un contrôle d’identité proportionné. Le délai général de réponse prévu à l’art. 93 est d’un mois ; une prolongation motivée de deux mois est encadrée et doit être annoncée dans le premier mois. Prévoir réponse, refus motivé le cas échéant et voie de réclamation. [Art. 43–69 et 91–96][L23].

Travaux nécessaires :

- Compléter l’export : profil, données de réservation/contrôle relatives au demandeur, paiements utiles, communications, préférences, conversations et données de messagerie dans la mesure applicable. Fournir aussi les informations sur finalités, destinataires, origine, durées et transferts. Filtrer secrets et informations de tiers.
- Proposer une portabilité structurée pour les données relevant de ce droit ; l’accès a un périmètre plus large. Un JSON partiel n’est pas la preuve que les deux droits sont satisfaits.
- Créer la limitation : empêcher l’usage opérationnel non autorisé des données concernées, conserver le minimum et notifier la levée de la limitation.
- Corriger les données tout en préservant les pièces de preuve qui doivent rester intègres, par une écriture rectificative lorsque nécessaire.
- Faire de l’effacement un traitement suivi : identité d’authentification, profils, fiches voyageurs, conversations, messageries, notifications, jetons push, fichiers, caches, prestataires et sauvegardes. Prévoir reprises sur échec et preuve de fin.
- Identifier séparément les archives légalement conservées, limiter les accès et annoncer les catégories, motifs et échéances. Traiter les réservations en cours sans obliger une personne à payer pour pouvoir exercer un droit ; prévoir une prise en charge humaine si le parcours automatique bloque.

### 7.5 Application mobile et boutiques

Avant diffusion, ajouter les mêmes fonctions de droits et d’information dans le mobile. Apple impose d’initier la suppression depuis l’application lorsqu’elle permet la création d’un compte. Google Play demande un parcours dans l’application et un moyen externe accessible par une URL pour les applications concernées. Compléter les fiches de confidentialité/Data Safety d’après les flux réels et les SDK, y compris IA et diagnostics. [Suppression Apple][APPLEDEL] · [Suppression Google][GOOGLEDEL].

Demander micro, caméra, notifications et localisation au moment utile, avec explication précise ; le refus doit laisser fonctionner les services qui n’en ont pas besoin. Vérifier les permissions finales du binaire, les déclarations iOS requises par les SDK et la cohérence avec les fiches boutiques. Aucune permission GPS passager n’est nécessaire pour simplement afficher la progression d’un train.

`expo-secure-store` protège les secrets qui y sont effectivement placés ; sa présence ne chiffre pas automatiquement tous les billets ou caches. Une déclaration Face ID dans `app.json` ne prouve pas une collecte biométrique par SETRAG : distinguer un déverrouillage local géré par le système et le traitement de gabarits biométriques par l’entreprise.

### 7.6 Assistant IA et messageries

Présenter clairement l’assistant, ses fournisseurs et les données transmises avant usage. Prévoir un accès aux fonctions de billetterie sans assistant. Utiliser une liste approuvée de fournisseurs et empêcher un changement non validé de fournisseur/pays. Maintenir les confirmations serveur pour achats, annulations et modifications. Exclure toute décision significative défavorable purement automatisée sans les garanties applicables et un recours humain. [Art. 66–69 et 177–179][L23].

Pour la voix, prévoir un déclenchement explicite, un témoin de capture et un arrêt immédiat. Décrire séparément transport du son, transcription et conservation. L’accord du navigateur pour le micro ne remplace pas l’information sur le fournisseur et la conservation. Vérifier aussi les art. 37–39 de la loi cybersécurité sur la confidentialité/enregistrement des communications. [Loi cybersécurité][CY23].

Limiter les données fournies au modèle ; masquer téléphones, identifiants et pièces inutiles. Interdire l’usage secondaire des conversations pour entraîner/améliorer un modèle sans qualification et accord appropriés. Le paramètre `store: false` observé pour un fournisseur ne prouve pas une absence de conservation chez tous les intervenants.

La déliaison Telegram doit couper effectivement l’accès au compte ; la purge locale ne garantit pas l’effacement chez Telegram ou sur le téléphone du destinataire. Préférer un lien vers un espace authentifié à l’envoi d’un billet nominatif complet dans un canal externe. Prévoir le signalement d’une réponse problématique et son examen humain. Les règles de 2026 sur les contenus publics/IA seront à appliquer selon le périmètre juridiquement retenu pour les canaux SETRAG. [Ordonnance de 2026][SOC26].

### 7.7 Mentions légales et vente en ligne

Publier une page d’identification de l’éditeur avec les coordonnées officielles de SETRAG et du service de réclamation. Faire compléter les mentions requises par sa forme juridique et le régime applicable, notamment RCCM, siège, capital, responsable de publication et hébergeur selon les textes retenus. Les art. 23 et 31 de la loi transactions électroniques imposent l’identification accessible ; l’art. 25 de l’ordonnance de 2026 apporte une liste détaillée pour les éditeurs relevant de son champ. [Transactions électroniques][TE21] · [Ordonnance de 2026][SOC26].

Sur le web et le mobile, afficher avant engagement le service acheté, le prix total et les frais, les règles de modification/remboursement, les modalités de paiement, l’assistance et les recours. Permettre de corriger les données avant validation, conserver la version des conditions acceptées et remettre une confirmation durable du contrat. Prévoir un exemplaire téléchargeable des conditions, un reçu/récapitulatif et une preuve horodatée de confirmation. Qualifier juridiquement les signatures de billets et la preuve électronique sans présenter une signature Ed25519 interne comme un certificat qualifié. [Art. 32, 39–56 et 61 de la loi de 2021][TE21].

## 8. Sécurité, contrôle hors ligne et incidents

Les art. 113–117 de la loi données personnelles exigent des mesures adaptées au risque. Les art. 28 et 34 de la loi cybersécurité prévoient respectivement un visa de conformité et un régime d’audit périodique, dont les modalités opérationnelles doivent être obtenues auprès de l’autorité compétente. Un test de sécurité interne ne remplace pas ces actes. [Loi n°025/2023][L23] · [Loi cybersécurité][CY23].

Mesures proposées pour le projet :

- Contrôler chaque accès à un dossier, billet, PDF et export côté serveur. Tester changement d’identifiant, référence devinée, compte différent et profil agent hors périmètre. Une référence de réservation ne doit pas constituer seule un secret d’accès durable.
- Protéger les liens de téléchargement nominatifs : autorisation à l’émission, durée limitée ou accès authentifié, maîtrise du cache, révocation et absence de référencement. Les appels `storage.getUrl()` observés nécessitent une revue spécifique des garanties réelles de stockage et de diffusion.
- Renforcer les comptes agents/administrateurs, limiter les rôles au besoin du poste et retirer immédiatement les accès sortants. Prévoir MFA pour les accès privilégiés comme mesure de sécurité proposée, revue des habilitations et alertes d’export massif.
- Vérifier TLS, chiffrement au repos et des sauvegardes, gestion des clés, rotation des secrets, limitation des OTP et protection des sessions. Fermer les modes démonstration/connexion de développement dans la configuration de production.
- Réduire les données du manifeste contrôleur à sa mission et à son train. Distinguer son besoin de validation du billet des données de contact ou de paiement inutiles au contrôle.
- Protéger le terminal contrôleur : verrouillage, chiffrement adapté, inventaire des appareils, révocation et effacement à la réaffectation. Pour une PWA, documenter les limites de protection du navigateur et prévoir la gestion des terminaux d’entreprise.
- Purger les copies locales après synchronisation et fin d’utilité ; prévoir une échéance locale même si l’appareil ne revient pas en ligne. Ne pas détruire des opérations terrain non synchronisées : les conserver de façon protégée et organiser leur récupération.
- Le billet signé Ed25519 empêche la falsification dans les conditions de vérification prévues ; **une signature ne chiffre pas le contenu du code**. Limiter les données présentes dans le QR/Aztec et expliquer les conséquences du partage d’un billet/PDF/Wallet.
- Séparer développement, recette et production ; utiliser des données fictives ou effectivement anonymisées pour les démonstrations. Encadrer l’accès du support aux données réelles.
- Tester restauration, révocation de session et reprise après panne ; vérifier que restaurer une sauvegarde ne réactive pas un compte supprimé ou un consentement retiré.

Pour les incidents, définir une chaîne courte : détection, confinement, préservation des preuves, analyse, notification et correction. **L’art. 142 impose d’informer l’APDPVP sans délai** ; il ne faut pas appliquer par défaut une attente de 72 heures issue du RGPD. Le sous-traitant alerte SETRAG sans délai (art. 144). Les personnes concernées sont informées dans les meilleurs délais si le risque est élevé, sous les conditions des art. 145–147. Tenir un registre des violations, préparer les informations de notification et tester la procédure. [Loi n°025/2023][L23].

Fixer contractuellement un délai interne très court d’alerte fournisseur et une astreinte avec suppléant. Ce délai interne est un objectif d’organisation, pas un délai légal supplémentaire. Examiner séparément les déclarations cybersécurité requises selon le statut/classification du système.

## 9. Conservation et suppression : matrice à approuver

Le principe est de conserver les données pendant la durée nécessaire, puis de les supprimer ou de les anonymiser réellement, sous réserve des obligations d’archive. Les art. 70 et 118 ne donnent pas une durée universelle pour tous les fichiers. [Loi n°025/2023][L23].

**Distinguer les délais légaux des propositions ci-dessous.** Les valeurs proposées servent à chiffrer et concevoir les purges ; la direction juridique, la DAF et le responsable métier doivent arrêter les durées définitives, le point de départ et les suspensions en cas de litige.

| Catégorie | Durée/règle à appliquer ou à décider | Travail à réaliser |
| --- | --- | --- |
| Livres et pièces justificatives comptables | Dix ans, AUDCIF art. 24 ; vérifier les obligations fiscales supplémentaires et le point de départ | Définir les pièces justificatives, isoler l’archive et les champs nécessaires. Ce délai ne couvre pas indistinctement tout `tickets.passenger`. [OHADA][OHADA] |
| Données de connexion et de trafic du SI | Dix ans, loi n°027/2023 art. 31 | Définir les événements/champs couverts et une archive intègre, protégée et consultable sur habilitation. Ne pas les confondre avec le contenu des messages ou les traces de débogage. [Loi cybersécurité][CY23] |
| Compte actif | Durée de fourniture du service, puis règle d’inactivité à justifier | Fixer la date d’inactivité, prévenir avant clôture et purger les attributs devenus inutiles |
| Réservations abandonnées et essais de paiement | Durée courte à fixer selon paiement, fraude et réclamation | La libération d’une place après expiration n’est pas une suppression des données ; dissocier les deux opérations |
| Billets/passagers et scans | Voyage, traitement des réclamations et délais de preuve applicables ; archivage limité des pièces nécessaires | Séparer historique de confort, exploitation et preuve ; justifier conservation de nom, téléphone, date de naissance et contact d’urgence |
| Voyageurs enregistrés | Jusqu’au retrait de la fiche ou fin d’usage ; règle d’inactivité à définir | Effacement indépendant de la vente déjà réalisée ; contrôle des profils mineurs |
| Historique IA et transcriptions | Proposition : trente jours par défaut, à confirmer selon service et preuve nécessaire | Purge par date même si le compte reste actif ; suppression des résultats d’outils et sessions associées |
| Audio brut | Proposition : aucune conservation durable si inutile au service | Vérifier tous les fournisseurs ; la conservation d’une transcription doit être annoncée séparément |
| Support et réclamations | Proposition : douze mois après clôture pour les échanges ordinaires ; autre durée documentée en cas de contentieux | Retirer pièces sensibles inutiles ; suspension ciblée de purge pour litige |
| Copie voyageur hors ligne | Proposition : échéance liée au voyage, par exemple sept jours après arrivée, avec téléchargement volontaire distinct | Purge à la déconnexion/changement d’utilisateur déjà prévue ; ajouter maîtrise de l’expiration hors ligne et information de l’utilisateur |
| Manifeste contrôleur, photos et file locale | Mission et synchronisation confirmée, puis purge locale selon délai approuvé | Ne pas garder tous les voyageurs de toutes les missions sur le terminal ; tracer les exceptions pour incident de synchronisation |
| Preuves de consentement et liste d’opposition | Durée justifiée par preuve et respect de l’opposition | Conserver la preuve minimale, sans maintenir une fiche marketing complète ; empêcher la réinscription involontaire |
| Sauvegardes | Proposition : cycle de trente jours pour copies courantes, à adapter au plan de reprise et aux archives légales | Expiration contrôlée, accès restreint, liste de suppressions à réappliquer avant remise en service |
| Géolocalisation des personnels/véhicules, si activée | Norme 2019 : trois mois en principe, exceptions encadrées ; horaires de travail distincts | Valider l’applicabilité au dispositif ferroviaire et les exceptions avant paramétrage. [Norme de géolocalisation][GEO] |

Prévoir un tableau technique `catégorie → finalité → base → début du délai → durée → archive → purge → preuve`. Les métiers ne doivent pas pouvoir prolonger indéfiniment un délai sans motif, approbation et échéance. La copie nationale et les prestataires suivent la même politique, sauf obligation propre documentée.

## 10. État du projet : acquis et écarts observés

Les références ci-dessous désignent les fichiers examinés dans le dépôt. « Présent » signifie qu’un mécanisme existe dans le code ; son fonctionnement en production n’a pas été certifié.

| Réf. | Constat | Conséquence et travail restant | Preuve dans le dépôt |
| --- | --- | --- | --- |
| C01 | Le schéma contient passagers, genre, contacts, naissance, scans, incidents, procès-verbaux, conversations et messageries | La conformité doit couvrir les traitements partagés et pas seulement le formulaire d’achat ; justifier chaque champ, notamment le genre obligatoire et le contact d’urgence | [Schéma](../packages/backend/convex/schema.ts) |
| C02 | Accords versionnés/horodatés et révocation présents ; écran web de gestion existant | Conserver ces fonctions ; ajouter portée précise, preuve du texte, canaux de prospection et application effective des retraits | [Backend clients](../packages/backend/convex/functions/customers.ts), `grantConsent`/`revokeConsent` ; [écran données](../apps/billetterie-web/src/fonctionnalites/compte/donnees.tsx) |
| C03 | Consentement générique `donnees` pour identité, coordonnées et voyageurs enregistrés | Revoir la base légale et la formulation. Une case générale ne couvre pas toutes les finalités, et un retrait sans conséquence sur l’usage facultatif serait insuffisant | [Textes de consentement](../apps/billetterie-web/src/lib/consentements.ts) |
| C04 | Export de profil, résumé des ventes, billets, accords, fiches voyageurs ; notifications renvoyées seulement sous forme de nombre | Export partiel au regard des tables présentes : qualifier et ajouter conversations, messageries, préférences, informations de paiement/contrôle et métadonnées du droit d’accès | [Backend clients](../packages/backend/convex/functions/customers.ts), `exportMyData` |
| C05 | Suppression : neutralisation du profil, retrait des accords, suppression des fiches, déliaison des messageries et purge IA programmée | Travail déjà engagé. Vérifier la couverture des billets/PDF nominatifs, photos, notifications, push, événements de messagerie, journaux, archives et prestataires ; ne pas annoncer une anonymisation globale | [Backend clients](../packages/backend/convex/functions/customers.ts), `deleteMyAccount` ; [liaison](../packages/backend/convex/messaging/linking.ts) ; [purge IA](../packages/backend/convex/ai/conversations.ts) |
| C06 | Effacement Better Auth programmé ; suppression par lots limitée à 200 pour sessions/comptes dans le code lu | Vérifier la pagination, les erreurs et les reprises ; prouver que toutes les sessions restent inutilisables même avant la fin du traitement | [Effacement authentification](../packages/backend/convex/betterAuth/effacement.ts) |
| C07 | Le mobile comporte surtout des écrans de démarrage ; compte avec connexion/déconnexion | Les fonctions de droits et notices du web ne sont pas encore portées sur cet écran mobile | [Compte mobile](../apps/voyageur-mobile/src/app/(tabs)/compte.tsx), [configuration](../apps/voyageur-mobile/app.json) |
| C08 | Les conditions publiques disent que l’export fournit tout ce que le système garde, et présentent l’effacement du profil comme une anonymisation | Corriger ces affirmations à partir du périmètre réel. Les notices examinées ne constituent pas une politique complète au sens de l’art. 98 | [Conditions](../apps/billetterie-web/src/fonctionnalites/infos/conditions.tsx) |
| C09 | Copies voyageur IndexedDB et purge de changement de propriétaire/déconnexion ; purge contrôleur protégée contre pertes non synchronisées | Préserver ces garde-fous. Ajouter politique d’expiration locale, protection des appareils et preuve de purge. Aucun chiffrement applicatif des enregistrements n’a été identifié dans les deux fichiers de base locale examinés | [Base voyageur](../apps/billetterie-web/src/lib/offline/db.ts), [fournisseur local](../apps/billetterie-web/src/fonctionnalites/hors-ligne/donnees-locales.tsx), [base contrôleur](../apps/controleur-web/src/lib/offline/db.ts) |
| C10 | Crons d’exploitation et purge des demandes de liaison ; pas de purge générale par durée dans ce fichier | Concevoir des règles d’archivage/purge par catégorie et surveiller leur exécution ; les suppressions à la demande existantes ne règlent pas l’inactivité | [Tâches planifiées](../packages/backend/convex/crons.ts) |
| C11 | Trois fournisseurs IA texte possibles, voix OpenAI, Telegram implémenté | Inventorier les fournisseurs effectivement actifs et les formalités correspondantes ; limiter les données, la conservation et les changements de fournisseur | [IA texte](../packages/backend/convex/ai/providers.ts), [voix](../packages/backend/convex/ai/realtime.ts), [Telegram](../packages/backend/convex/messaging/telegram.ts) |
| C12 | Le modèle contient la naissance et des catégories tarifaires, sans preuve d’autorité parentale identifiée dans les parcours examinés | Ajouter contrôle de l’âge, autorisation parentale et traitement des tiers avant de collecter les données des mineurs concernés | [Réservation](../packages/backend/convex/functions/bookings.ts), [fiches voyageurs](../apps/billetterie-web/src/fonctionnalites/compte/voyageurs.tsx) |
| C13 | Contrôles de rôle/permission et journal d’audit présents | Vérifier effectivement l’isolement voyageur/agent, les accès aux PDF, les téléchargements massifs et la durée des journaux ; ne pas déduire la sécurité d’une seule fonction utilitaire | [Authentification](../packages/backend/convex/lib/auth.ts), [documents](../packages/backend/convex/functions/documents.ts) |
| C14 | Envoi de billets et OTP par Resend intégré, sous conditions de configuration | Ajouter Resend au registre fournisseurs, aux flux transfrontaliers et à la purge des métadonnées ; déterminer si les pièces jointes sont nécessaires pour chaque canal | [Notifications](../packages/backend/convex/functions/notifications.ts), [composant e-mail](../packages/backend/convex/lib/resend.ts) |

Aucun récépissé, autorisation de transfert, registre juridique validé, contrat fournisseur signé ou preuve d’hébergement au Gabon n’a été établi à partir des fichiers examinés. Ces documents peuvent être détenus hors du dépôt : les demander avant de conclure à une absence de formalité.

## 11. Liste des travaux à lancer

**P0** : condition à résoudre avant de mettre en production le traitement concerné. **P1** : à livrer avant ouverture du parcours correspondant. **P2** : contrôles récurrents après une ouverture autorisée et sécurisée. Une fonction facultative peut rester désactivée tant que ses conditions P0/P1 ne sont pas remplies.

| ID | Priorité | Travail | Responsable proposé | Critère de clôture |
| --- | --- | --- | --- | --- |
| A01 | P0 | Qualifier responsable/sous-traitants, périmètre SETRAG, contrats groupe/agences et applicabilité RGPD | Direction juridique | Note signée avec répartition des obligations |
| A02 | P0 | Registre des traitements et carte des flux | Référent données + métiers + technique | Toutes les catégories de la section 4 et tous les destinataires ont une fiche |
| A03 | P0 | Dossiers APDPVP, récépissés et autorisations spéciales | SETRAG + conseil/DPO | Actes obtenus et périmètre comparé aux fonctions activées |
| A04 | P0 | Autorisations de transfert et contrats fournisseurs | Juridique + achats + technique | Pays, sous-traitants et flux autorisés documentés pour chaque service actif |
| A05 | P0 | Copie nationale et éventuel hébergement exclusif | DSI + juridique | Architecture approuvée, fournisseur local identifié, copie et restauration démontrées |
| A06 | P0 | Qualification DPO et organisation | Direction | DPO désigné/notifié si requis, ou justification documentée ; moyens et suppléance fixés |
| A07 | P0 | Analyse des risques/AIPD des traitements à risque | DPO/référent + sécurité | Risques traités, risque résiduel accepté et consultation préalable réalisée si requise |
| A08 | P0 | Régime cybersécurité : visa, audits et classification | DSI + sécurité + juridique | Modalités obtenues auprès de l’autorité ; formalités applicables accomplies |
| A09 | P0 | Politique de conservation, dont connexions/trafic dix ans | DAF + juridique + sécurité | Tableau approuvé avec catégories, événements de départ et exceptions |
| A10 | P0 | Réponse aux violations | Sécurité + DPO + exploitation | Contacts opérationnels, modèles prêts et simulation réussie sans attente arbitraire de 72 h |
| A11 | P0 | Politique de confidentialité et mentions de collecte | Juridique + produit | Textes validés, coordonnées réelles, accessibles sur tous les parcours actifs |
| A12 | P0 | Parcours mineurs et tiers | Produit + juridique + backend | Preuve parentale adaptée ; information des tiers ; aucun contournement par API/assistant |
| A13 | P0 | Sécurité accès billets/PDF/manifeste | Backend + sécurité | Tests d’accès croisé négatifs ; liens et copies maîtrisés ; défauts critiques corrigés |
| A14 | P1 | Refonte des consentements et CGV | Produit + backend | Pas de consentement global contraint ; version/portée prouvables ; retrait effectivement respecté |
| A15 | P1 | Export et réponse aux droits | Backend + support | Jeu de données couvrant les catégories applicables ; identité contrôlée et tiers protégés |
| A16 | P1 | Limitation et correction | Backend + support | Suspension d’usage ciblée et corrections propagées sans altérer les pièces de preuve |
| A17 | P1 | Effacement distribué avec état de suivi | Backend + exploitation | Fin de purge vérifiable ; erreurs reprises ; archives justifiées, sessions révoquées |
| A18 | P1 | Purges par échéance et sauvegardes | Backend + DSI | Exécution mesurée, alerte d’échec, absence de résurrection après restauration |
| A19 | P1 | Inventaire terminal, cookies et SDK | Frontend + mobile + sécurité | Flux observés conformes au choix ; aucun stockage/traceur facultatif avant accord |
| A20 | P1 | Protection et expiration hors ligne | Web/PWA + exploitation terrain | Scénarios appareil perdu, partagé, hors réseau et réaffecté validés |
| A21 | P1 | Portage mobile des droits et notices | Équipe mobile | Politique, préférences et suppression accessibles dans l’application ; URL externe Google prête |
| A22 | P0 avant IA | Dossier et contrôle des fournisseurs IA/voix | Juridique + équipe IA | Formalité, transferts, conservation, information et contrôle humain validés |
| A23 | P1 avant canaux | Messageries, OTP, e-mails et push | Backend + produit | Finalités séparées, envois limités, déliaison et retrait testés, fournisseurs recensés |
| A24 | P1 | CGV, confirmation durable, rétractation et remboursement | Juridique + commercial + produit | Règles locales arrêtées et parcours cohérents, y compris après paiement |
| A25 | P0 qualification | Redevance, frais et budget | DAF + juridique | Note fiscale, échéancier et budget approuvés ; aucune taxe ajoutée au billet sans fondement confirmé |
| A26 | P1 avant publication | Fiches Apple/Google et permissions | Mobile + responsable publication | Déclarations conformes aux flux du binaire et liens publics fonctionnels |
| A27 | P1 | Formation et engagements de confidentialité | RH + DPO + métiers | Agents, contrôleurs, support et administrateurs formés, engagements archivés |
| A28 | P2 | Revue régulière de conformité | Direction + DPO + sécurité | Revue des accès, fournisseurs, incidents, durées, textes et renouvellements tracée |

## 12. Ordre de réalisation et recette de conformité

Le séquencement ci-dessous exprime des dépendances ; il ne promet pas un délai d’autorisation administrative ni un chiffrage de développement.

1. **Cadrer et déposer.** Réunir actes existants, contrats, volumes et pays ; qualifier les traitements ; arrêter responsable/DPO ; préparer registres et dossiers. Décider quels services facultatifs seront proposés au lancement.
2. **Arrêter l’architecture et les règles.** Copie au Gabon, transferts, stockage classifié éventuel, archives, durées, clauses fournisseurs, parcours mineurs et bases juridiques. Les choix doivent précéder les purges et les notices définitives.
3. **Livrer les parcours et les procédures.** Notices, droits, consentements, mobile, contrôle hors ligne, IA/canaux autorisés, gestion d’incidents et formation.
4. **Vérifier sur une préproduction représentative.** Établir les preuves ci-dessous, corriger les écarts puis autoriser explicitement l’ouverture de chaque traitement dans le périmètre administratif obtenu.

Scénarios de recette à conserver dans le dossier de conformité :

| Scénario | Résultat attendu |
| --- | --- |
| Visiteur refuse les usages facultatifs | Achat possible ; absence de requêtes/SDK facultatifs identifiants avant accord |
| Retrait marketing après mise en file d’un message | Message commercial annulé ; alertes nécessaires au voyage gérées séparément |
| Réservation pour un enfant par un tiers | Qualité parentale/mandat traité selon procédure ; refus si conditions non satisfaites |
| Demande de droits d’un passager sans compte | Demande reçue, identité vérifiée proportionnellement, réponse suivie dans les délais |
| Export d’un compte avec IA, paiements et voyageurs tiers | Catégories applicables couvertes ; aucun secret ou contenu indu d’un tiers |
| Suppression avec historique, nombreuses sessions et messagerie liée | Accès révoqué, purges terminées/reprises, éléments conservés justifiés ; bot incapable d’agir pour le compte |
| Suppression depuis un appareil, puis connexion sur un autre | Ancienne session inutilisable, caches effacés à la reconnexion ; limites hors ligne documentées |
| Contrôleur perd ou réaffecte son terminal | Accès protégé, périmètre du manifeste réduit, révocation et procédure de récupération opérationnelles |
| Accès au PDF d’un autre voyageur ou via ancien lien | Absence d’accès indu selon le dispositif retenu ; preuve de durée/révocation des liens |
| Fin de durée d’une conversation ou d’un manifeste | Purge automatique et preuve d’exécution, sans détruire une archive encore obligatoire |
| Restauration d’une sauvegarde antérieure à un effacement | Compte et consentements retirés non réactivés ; suppressions réappliquées |
| Incident simulé avec données exposées | Alerte interne, dossier de notification APDPVP sans délai, décision documentée sur l’information des personnes |
| Changement de fournisseur IA ou de région cloud | Activation bloquée tant que contrats, notices et actes administratifs ne couvrent pas le nouveau flux |

Le dossier de livraison doit réunir actes APDPVP, registre, contrats, notices versionnées, analyse de risques, plan d’archivage, preuves de recette, rapports d’audit, procédure d’incident et calendrier de renouvellement. Le présent rapport ne certifie pas que ces scénarios ont été exécutés.

## 13. Questions juridiques et budgétaires restant à fermer

### 13.1 Points à faire confirmer par SETRAG et les autorités

| Question | Pourquoi elle change le travail |
| --- | --- |
| Quels traitements et transferts sont déjà déclarés/autorisés, sous quel responsable et jusqu’à quelle date ? | Évite de redéposer inutilement ou de croire qu’un ancien acte couvre l’IA/mobile |
| Quels volumes, utilisateurs mineurs, effectifs et rôles groupe/prestataires ? | Qualification DPO, AIPD, responsabilités et accès |
| Quels pays, contrats, destinataires et fournisseurs sont réellement actifs ? | Décide des dossiers de transfert et des éventuels changements d’architecture |
| Quelle copie nationale et quelles modalités réglementaires sont attendues ? | Détermine hébergeur, fréquence, contenu, sécurité et coût |
| SETRAG ou ce système sont-ils classifiés critiques/sensibles ? | Peut imposer des exigences supplémentaires, un hébergement exclusif ou une dérogation écrite |
| Quel régime APDPVP pour mineurs, identité numérique, IA et identifiants sectoriels ? | Les renvois internes du texte demandent une qualification formelle ; les formalités peuvent se cumuler |
| Quelles données constituent « connexion et trafic » pour ce système, et quelles preuves d’audit/visa fournir ? | Définit l’archive dix ans et évite une collecte excessive de contenu |
| Quelles obligations propres aux PV et agents de contrôle ? | L’habilitation à traiter des infractions pénales ne découle pas du simple rôle informatique « contrôleur » |
| Quel champ retenir pour l’ordonnance de 2026 et quels textes de ratification/application sont en vigueur ? | Âge des comptes, fonctions sociales, signalements et contenus publics IA |
| Quelles obligations de rétractation et remboursement pour le transport ferroviaire de voyageurs ? | Les art. 57–60 de la loi de 2021 prévoient une rétractation ; l’exception consultée vise notamment le transport de biens, pas explicitement celui des voyageurs |
| Quels champs sont indispensables sur le billet et dans l’archive ? | Justification du genre, naissance, téléphone, urgence ; minimisation et coût de conservation |
| Quelle redevance s’applique réellement à SETRAG ? | Assiette, redevable, collecte éventuelle, périodicité et budget à fixer avec DAF/conseil fiscal |

La rétractation mérite une validation avant de publier une règle générale « billet payé, remboursement uniquement au guichet ». La loi de 2021 prévoit quatorze jours et des exceptions, dont le service pleinement exécuté sous conditions. Il faut identifier les règles sectorielles applicables et expliquer exactement les droits dans les CGV, sans promettre ou exclure automatiquement un remboursement. [Art. 55–60][TE21].

Le CGI 2025 publié par la DGI reproduit un régime de redevance, avec un montant annuel par personne et une formule par activité, et cite notamment banques, microfinances et téléphonie. La loi de finances 2026 comporte une recette APDPVP, mais une prévision budgétaire ne suffit pas à déterminer le montant dû par SETRAG. Faire confirmer le régime consolidé applicable en 2026 ; ne pas appliquer mécaniquement un montant à chaque billet. [CGI, dispositions relatives à la RPDPVP][CGI25] · [LF 2026][LF26].

Les postes à budgéter sont : conseil juridique/DPO, formalités et redevances confirmées, hébergement/copie nationale, archivage des journaux, adaptations web/mobile/backend, sécurité des terminaux, audits et exploitation des demandes de droits. Aucun montant n’est avancé sans volumes, fournisseurs et décision d’architecture.

### 13.2 Sanctions et décision d’ouverture

La loi de 2023 prévoit avertissements, mises en demeure, amendes et suspension/interdiction de traitements. Les art. 206–207 mentionnent notamment des amendes de **1 à 100 millions de FCFA**, selon la situation. L’art. 204 contient plusieurs plafonds et règles de récidive qui doivent être lus ensemble ; il serait trompeur de résumer tout le régime par un unique pourcentage du chiffre d’affaires. L’entrave à l’autorité peut aussi être pénalement sanctionnée. [Art. 203–213][L23].

La décision d’ouverture doit être prise sur des preuves : périmètre administratif couvert, fournisseurs autorisés, architecture conforme, droits accessibles, sécurité vérifiée et responsables opérationnels nommés. La documentation actuelle et les fonctions déjà écrites sont des points de départ ; elles ne permettent pas encore d’afficher une conformité générale comme acquise.

## 14. Sources et éléments de traçabilité

Sources consultées le 30 septembre 2026. Les numéros d’articles du rapport se rapportent au texte indiqué, pas à une numérotation importée du RGPD. Les pages publiques de l’autorité peuvent conserver l’ancienne dénomination CNPDCP ou une formulation historique ; les textes publiés et les actes applicables au traitement priment.

1. **Loi n°025/2023** : [Journal officiel, texte intégral][L23] ; [reproduction sur le site APDPVP][APDPTEXTE] ; [fac-similé du JO n°218 bis][PDF23]. Le PDF contient aussi d’autres textes, dont la loi cybersécurité.
2. **Promulgation** : [décret n°166/PR du 12 juillet 2023][PROM23].
3. **Formalités** : [formulaires officiels et avertissement sur leur usage][FORM] ; [règlement intérieur][RI] ; [délibérations][DELIB] ; [normes][NORMES].
4. **Norme de géolocalisation** : [délibération n°016/CNPDCP, norme n°003/2019][GEO].
5. **Transactions électroniques** : [loi n°025/2021][TE21].
6. **Cybersécurité** : [loi n°027/2023][CY23], également présente dans le fac-similé du JO n°218 bis. Le titre HTML affiche le 11 juillet ; le texte signé porte le 12 juillet 2023.
7. **Textes récents connexes** : [digitalisation, ordonnance n°0006/PR/2025][DIG25] ; [réseaux sociaux/plateformes, ordonnance n°0011/PR/2026][SOC26]. Ratification et dispositions d’application à confirmer avec le conseil juridique.
8. **Fiscalité** : [CGI 2025 publié par la DGI][CGI25] ; [loi n°041/2025, finances pour 2026][LF26].
9. **Comptabilité** : [AUDCIF, notice et accès officiel OHADA][OHADA] ; [texte intégral consulté, art. 24][OHADAPDF] ; [bibliothèque officielle][OHADABIB]. Faire annexer au dossier juridique la copie applicable et la liste des justificatifs retenus par la DAF.
10. **RGPD conditionnel** : [article 3 reproduit par la CNIL][RGPD] ; [lignes directrices du CEPD sur le champ territorial][RGPDCHAMP].
11. **Boutiques mobiles** : [Apple, App Review Guidelines][APPLE] ; [Apple, suppression de compte][APPLEDEL] ; [Google Play, données utilisateur][GOOGLE] ; [Google Play, suppression de compte][GOOGLEDEL].

Recherches complémentaires à actualiser avant lancement : nouvelles normes APDPVP, liste des pays reconnus protecteurs, modalités d’agrément DPO, barèmes/frais, textes cybersécurité d’application, qualification fiscale SETRAG, droit sectoriel ferroviaire et versions courantes des politiques boutiques.

[L23]: https://journal-officiel.ga/20085-025-2023-/
[APDPTEXTE]: https://www.apdpvp.ga/textes-et-decisions/
[PDF23]: https://www.apdpvp.ga/wp-content/uploads/2025/01/Gabon-Loi-025-2023-du-12-juillet-2023-portant-modification-de-la-loi-001-2011-du-25-septembre-relative-a-la-protection-des-donnees-a-caractere-personnel.pdf
[PROM23]: https://journal-officiel.ga/20089-166-pr-/
[FORM]: https://www.apdpvp.ga/formulaires/
[RI]: https://www.apdpvp.ga/reglement-interieur/
[RIPDF]: https://www.apdpvp.ga/wp-content/uploads/2019/05/Reglement-Interieur-de-la-CNPDCP.pdf
[DELIB]: https://www.apdpvp.ga/deliberation/
[NORMES]: https://www.apdpvp.ga/normes/
[GEO]: https://www.apdpvp.ga/wp-content/uploads/2022/06/NORME-SUR-LA-GEOLOCALISATION-2019.pdf
[TE21]: https://journal-officiel.ga/18190-025-2021-/
[CY23]: https://journal-officiel.ga/20087-027-2023-/
[DIG25]: https://journal-officiel.ga/21995-0006-pr-2025-/
[SOC26]: https://journal-officiel.ga/22404-0011-pr-2026-/
[CGI25]: https://dgi.ga/wp-content/uploads/2025/12/Gabon-CGI-2025.pdf
[LF26]: https://journal-officiel.ga/22265-041-2025-/
[OHADA]: https://www.ohada.org/acte-uniforme-relatif-au-droit-comptable-et-a-linformation-financiere-audcif/
[OHADABIB]: https://biblio.ohada.org/index.php?id=4847&lvl=notice_display
[OHADAPDF]: https://biblio.ohada.org/doc_num.php?explnum_id=2061
[RGPD]: https://www.cnil.fr/fr/reglement-europeen-protection-donnees/chapitre1
[RGPDCHAMP]: https://www.cnil.fr/sites/default/files/atoms/files/lignes_directrices_du_cepd_sur_le_champ_dapplication_territorial_du_rgpd.pdf
[APPLE]: https://developer.apple.com/app-store/review/guidelines/
[APPLEDEL]: https://developer.apple.com/support/offering-account-deletion-in-your-app/
[GOOGLE]: https://support.google.com/googleplay/android-developer/answer/10144311?hl=fr
[GOOGLEDEL]: https://support.google.com/googleplay/android-developer/answer/13327111?hl=fr
