/**
 * Jeu de démonstration du module Sécurité ferroviaire, sûreté et ARTF.
 *
 * Commande (depuis `packages/backend`, déploiement de démonstration) :
 *
 *   bunx convex run modules/securite/seed:peupler '{}'
 *   bunx convex run modules/securite/seed:peupler '{"reset": true}'
 *
 * - Refuse de tourner si `DEMO_ACCOUNTS_ENABLED` ne vaut pas « true ».
 * - Idempotent : relancé sans `reset`, il ne modifie rien (marqueur
 *   `demo:securite` dans `securiteSequences`).
 * - `reset: true` vide TOUTES les tables du module Sécurité (saisies du
 *   portail comprises) puis reconstruit le jeu.
 *
 * Contenu, daté par rapport au jour du peuplement : vingt événements de
 * sécurité sur douze mois (circulation, travail, environnement, sûreté), des
 * enquêtes à tous les stades, leur plan d'actions correctives, douze
 * inspections, et les déclarations ARTF correspondantes (transmises,
 * accusées, en retard). Les transmissions sont simulées. Les incidents
 * d'exploitation réels du terrain ne sont pas modifiés : ils restent à
 * qualifier depuis le registre. Faits et personnes sont fictifs.
 */

import { v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import { internalMutation, type MutationCtx } from "../../_generated/server"
import { GARES } from "../rh/model"
import { prochainNumeroSecurite } from "./acces"
import { composerRapport } from "./enquetes"
import { synchroniserNotification } from "./evenements"
import { composerBilan } from "./artf"
import {
  bornesTrimestre,
  dansZoneLope,
  dateLibreville,
  ajouterJours,
  echeanceRapportEnquete,
  trimestreDe,
  trimestrePrecedent,
  type CategorieCause,
  type DirectionResponsable,
  type Gravite,
  type GraviteNc,
  type ResultatInspection,
  type StatutAction,
  type StatutArtf,
  type StatutEnquete,
  type StatutEvenement,
  type TypeEvenement,
  type TypeInspection,
} from "./model"

const MARQUEUR = "demo:securite"
const TABLES = [
  "securiteJournal",
  "securiteDeclarationsArtf",
  "securiteActions",
  "securiteEnquetes",
  "securiteInspections",
  "securiteEvenements",
  "securiteSequences",
] as const
const JOUR = 86_400_000
const HEURE = 3_600_000

interface ActionDemo {
  libelle: string
  responsable: string
  direction: DirectionResponsable
  /** Échéance relative à aujourd'hui (négatif : passée). */
  echeance: number
  statut: StatutAction
  avancement: number
  preuve?: string
  priorite?: "haute"
}

interface EnqueteDemo {
  statut: StatutEnquete
  /** Échéance du rapport relative à aujourd'hui. */
  echeance: number
  constats?: string
  causes?: { categorie: CategorieCause; description: string; racine: boolean }[]
  recommandations?: string[]
  conclusion?: string
}

interface EvenementDemo {
  joursAvant: number
  heure: number
  type: TypeEvenement
  gravite: Gravite
  gare?: string
  pk?: number
  lieu?: string
  train?: string
  declarant: string
  description: string
  mesures?: string
  blesses?: number
  deces?: number
  degats?: string
  interruption?: number
  statut: StatutEvenement
  /** État de la notification ARTF quand elle est due ; « retard » : jamais transmise. */
  notification?: StatutArtf | "hors_delai"
  enquete?: EnqueteDemo
  actions?: ActionDemo[]
  note?: string
}

const EVENEMENTS: readonly EvenementDemo[] = [
  {
    joursAvant: 340, heure: 4.5, type: "deraillement", gravite: "significatif", gare: "BOO", lieu: "Faisceau marchandises de Booué, voie 7", train: "MIN-702",
    declarant: "Hervé MBOUMBA, chef de manœuvre", description: "Déraillement d'un bogie du wagon minéralier n° 31 lors de la formation du train, à vitesse réduite. Aucune victime.",
    mesures: "Voie 7 neutralisée, wagon relevé par la grue de secours de Booué.", degats: "Bogie et deux traverses endommagés", interruption: 0,
    statut: "cloture", notification: "accusee",
    enquete: {
      statut: "cloturee", echeance: -270,
      constats: "Écartement hors tolérance (+9 mm) sur l'aiguillage 7b, attaches manquantes relevées sur six traverses consécutives.",
      causes: [
        { categorie: "infrastructure", description: "Dégradation des attaches de l'aiguillage 7b non détectée", racine: true },
        { categorie: "organisation", description: "Tournée de surveillance du faisceau espacée à six semaines", racine: false },
      ],
      recommandations: ["Remplacer les attaches de l'aiguillage 7b et contrôler l'écartement", "Porter la tournée du faisceau de Booué à quinze jours"],
      conclusion: "Événement d'origine infrastructure ; les mesures correctives ont été vérifiées sur le terrain.",
    },
    actions: [
      { libelle: "Remplacer les attaches et régler l'écartement de l'aiguillage 7b", responsable: "Chef de district voie de Booué", direction: "DINFRA", echeance: -300, statut: "verifiee", avancement: 100, preuve: "Procès-verbal de travaux n° V-BOO-114" },
      { libelle: "Passer la tournée du faisceau de Booué à quinze jours", responsable: "Chef de district voie de Booué", direction: "DINFRA", echeance: -260, statut: "verifiee", avancement: 100, preuve: "Programme de surveillance révisé" },
    ],
  },
  {
    joursAvant: 296, heure: 22.2, type: "heurt_animal", gravite: "grave", pk: 276, lieu: "PK 276, entre Ayem et Lopé", train: "TR-202",
    declarant: "Serge OBAME, conducteur de ligne", description: "Heurt d'un éléphant de forêt à 70 km/h, de nuit. L'animal est mort ; la locomotive CC 2205 a subi des dégâts au chasse-obstacle et aux conduites de frein.",
    mesures: "Train arrêté, voyageurs maintenus à bord, locomotive de secours envoyée de Booué. ANPN prévenue.", degats: "Chasse-obstacle et conduite générale de la CC 2205", interruption: 310,
    statut: "cloture", notification: "accusee",
    enquete: {
      statut: "cloturee", echeance: -230,
      constats: "Passage connu de pachydermes entre PK 270 et 282 ; signalisation de vigilance absente, consigne de vitesse de nuit non formalisée.",
      causes: [
        { categorie: "environnement", description: "Traversée de faune dans un corridor non signalé", racine: true },
        { categorie: "organisation", description: "Absence de limitation de vitesse nocturne dans la traversée du parc", racine: false },
      ],
      recommandations: ["Limiter la vitesse de nuit à 50 km/h entre PK 270 et 282", "Poser des panneaux de vigilance faune et une clôture de guidage", "Former les conducteurs à la conduite en zone de faune"],
      conclusion: "La traversée du parc impose des règles de circulation propres ; elles sont désormais au livret de ligne.",
    },
    actions: [
      { libelle: "Inscrire la limitation de vitesse nocturne PK 270–282 au livret de ligne", responsable: "Chef du service de la sécurité des circulations", direction: "DSED", echeance: -250, statut: "verifiee", avancement: 100, preuve: "Avis de modification du livret n° 2025-14" },
      { libelle: "Installer la clôture de guidage des éléphants PK 274–279", responsable: "Responsable environnement & Lopé", direction: "DSED", echeance: 20, statut: "en_cours", avancement: 60, priorite: "haute" },
      { libelle: "Former les conducteurs de Booué et Franceville à la conduite en zone de faune", responsable: "Centre de formation SETRAG", direction: "DRH", echeance: -40, statut: "en_cours", avancement: 70 },
    ],
  },
  {
    joursAvant: 120, heure: 6.8, type: "franchissement_signal", gravite: "grave", gare: "NDJ", lieu: "Gare de Ndjolé, carré d'entrée côté Owendo", train: "MIN-704",
    declarant: "Carine MOUSSAVOU, régulatrice COTRAF", description: "Le train MIN-704 a franchi de 140 m le carré d'entrée fermé de Ndjolé alors qu'un croisement était prévu. Arrêt avant le point de conflit.",
    mesures: "Conducteur relevé, enregistreur de bord extrait et scellé, dépistages réalisés (négatifs).",
    statut: "en_enquete", notification: "hors_delai",
    enquete: {
      statut: "rapport_soumis", echeance: 10,
      constats: "Le signal était bien fermé. Lecture tardive du signal d'avertissement par brouillard dense ; freinage engagé 6 s trop tard selon l'enregistreur.",
      causes: [
        { categorie: "humaine", description: "Perception tardive du signal d'avertissement par visibilité réduite", racine: false },
        { categorie: "organisation", description: "Pas de consigne de marche à vue par brouillard sur cette section", racine: true },
      ],
      recommandations: ["Instaurer une consigne de marche à vue par brouillard entre Abanga et Ndjolé", "Équiper le signal d'avertissement d'un répéteur sonore"],
      conclusion: "Franchissement par défaut d'adaptation de la conduite aux conditions de visibilité, faute de consigne.",
    },
    actions: [
      { libelle: "Rédiger et diffuser la consigne de marche à vue par brouillard (Abanga–Ndjolé)", responsable: "Chef du service de la sécurité des circulations", direction: "DSED", echeance: -15, statut: "realisee", avancement: 100, preuve: "Consigne CS-2026-07 diffusée le 2 août" },
      { libelle: "Étudier le répéteur sonore du signal d'avertissement de Ndjolé", responsable: "Chef du service signalisation", direction: "DINFRA", echeance: -5, statut: "en_cours", avancement: 40 },
    ],
  },
  {
    joursAvant: 52, heure: 14.3, type: "passage_niveau", gravite: "majeur", pk: 118.4, gare: "OYA", lieu: "Passage à niveau n° 41, Oyan", train: "TR-201",
    declarant: "Brice NDONG, chef de train", description: "Collision entre le TR-201 et un grumier engagé sur le passage à niveau gardé n° 41. Le chauffeur du grumier est décédé ; deux voyageurs légèrement blessés.",
    mesures: "Secours et gendarmerie de Ndjolé alertés, transbordement des voyageurs par autocar, constat d'huissier.", blesses: 2, deces: 1, degats: "Locomotive BB 1502 et voiture V2 endommagées", interruption: 720,
    statut: "en_enquete", notification: "accusee",
    enquete: {
      statut: "instruction", echeance: 8,
      constats: "La barrière était ouverte au passage du train ; le garde-barrière n'avait pas reçu l'annonce téléphonique du départ d'Abanga.",
      causes: [{ categorie: "organisation", description: "Annonce des trains au PN 41 dépendante d'un seul téléphone, hors service ce jour-là", racine: true }],
      recommandations: ["Doubler l'annonce des trains au PN 41 par radio"],
    },
    actions: [{ libelle: "Équiper le PN 41 d'un poste radio d'annonce des trains", responsable: "Chef du service télécoms", direction: "DINFRA", echeance: 12, statut: "en_cours", avancement: 30, priorite: "haute" }],
  },
  {
    joursAvant: 18, heure: 2.1, type: "rupture_attelage", gravite: "significatif", pk: 455, lieu: "PK 455, rampe de Milolé", train: "MIN-704",
    declarant: "Ulrich ESSONO, conducteur de ligne", description: "Rupture de l'attelage entre les wagons 42 et 43 dans la rampe de Milolé ; arrêt d'urgence automatique, rame immobilisée.",
    mesures: "Rame réunie par la locomotive de renfort, attelage expédié au laboratoire matériel.", interruption: 185,
    statut: "en_enquete",
    enquete: { statut: "ouverte", echeance: 42 },
  },
  {
    joursAvant: 64, heure: 10.5, type: "accident_travail", gravite: "significatif", gare: "LOP", lieu: "PK 289, chantier de renouvellement de Lopé",
    declarant: "Fabrice MINTSA, chef de chantier voie", description: "Chute d'un agent de la voie depuis le wagon de ballast lors du déchargement ; fracture du poignet.",
    mesures: "Premiers soins par le sauveteur du chantier, évacuation sur l'antenne médicale de Booué.", blesses: 1,
    statut: "en_enquete", notification: "accusee",
    enquete: {
      statut: "instruction", echeance: -4,
      constats: "Marchepied du wagon de ballast détérioré, harnais non porté lors du déchargement.",
      causes: [
        { categorie: "materiel", description: "Marchepied du wagon de ballast WB-12 fissuré", racine: true },
        { categorie: "humaine", description: "Équipement de protection non porté", racine: false },
      ],
    },
    actions: [{ libelle: "Remplacer les marchepieds des wagons de ballast WB-10 à WB-14", responsable: "Chef d'atelier wagons d'Owendo", direction: "DMAT", echeance: -10, statut: "en_cours", avancement: 50 }],
  },
  {
    joursAvant: 33, heure: 15.6, type: "feu_brousse", gravite: "significatif", pk: 262, lieu: "PK 262, abords de la voie entre Bissouma et Ayem",
    declarant: "Flore MOUSSAVOU, responsable environnement", description: "Feu de brousse sur 3 ha au contact de l'emprise ferroviaire, propagé depuis un brûlis agricole ; circulation suspendue deux heures.",
    mesures: "Circulation interrompue, équipe voie et éco-gardes de l'ANPN mobilisés, coupe-feu ouvert.", interruption: 125,
    statut: "qualifie", notification: "accusee",
    actions: [
      { libelle: "Débroussailler une bande coupe-feu de 10 m entre PK 255 et 270", responsable: "Chef de district voie de Lopé", direction: "DINFRA", echeance: 25, statut: "en_cours", avancement: 35 },
      { libelle: "Sensibiliser les villages riverains de Bissouma et Ayem aux brûlis", responsable: "Responsable environnement & Lopé", direction: "DSED", echeance: -3, statut: "planifiee", avancement: 0 },
    ],
  },
  {
    joursAvant: 210, heure: 9.2, type: "atteinte_environnement", gravite: "grave", gare: "OWE", lieu: "Dépôt carburant d'Owendo",
    declarant: "Anicet KOUMBA, chef du dépôt", description: "Déversement de 1 800 litres de gazole lors du dépotage d'un wagon-citerne ; écoulement vers le caniveau pluvial.",
    mesures: "Vanne fermée, barrages absorbants posés, entreprise de dépollution agréée mobilisée.", degats: "Sol souillé sur 120 m²",
    statut: "cloture", notification: "accusee",
    enquete: {
      statut: "cloturee", echeance: -150,
      constats: "Flexible de dépotage hors d'âge rompu ; aucun bac de rétention sous le poste de dépotage.",
      causes: [
        { categorie: "materiel", description: "Flexible de dépotage non remplacé à échéance", racine: true },
        { categorie: "infrastructure", description: "Absence de rétention sous le poste de dépotage", racine: false },
      ],
      recommandations: ["Construire une aire de dépotage étanche avec rétention", "Tenir un registre de remplacement des flexibles"],
      conclusion: "Pollution accidentelle maîtrisée ; l'aire étanche est en service.",
    },
    actions: [
      { libelle: "Construire l'aire de dépotage étanche du dépôt d'Owendo", responsable: "Chef du service bâtiments", direction: "DINFRA", echeance: -90, statut: "verifiee", avancement: 100, preuve: "Réception des travaux du 14 mai" },
      { libelle: "Mettre en place le registre de remplacement des flexibles", responsable: "Chef du dépôt d'Owendo", direction: "DMAT", echeance: -140, statut: "verifiee", avancement: 100, preuve: "Registre visé par l'inspection" },
    ],
  },
  {
    joursAvant: 150, heure: 7.4, type: "passage_niveau", gravite: "mineur", gare: "NTM", lieu: "Passage à niveau n° 3, Ntoum",
    declarant: "Patrice NGOMA, garde-barrière", description: "Barrière automatique restée levée à l'annonce d'un train ; protection assurée manuellement par le garde.",
    mesures: "Protection manuelle, dépannage de l'automatisme dans l'heure.",
    statut: "cloture", note: "Défaut de relais remplacé ; aucun risque résiduel.",
  },
  {
    joursAvant: 80, heure: 3.2, type: "malveillance", gravite: "significatif", pk: 201, lieu: "PK 201, Alembé",
    declarant: "Christian NZE, technicien signalisation", description: "Vol de 300 m de câble de signalisation ; signaux de la section passés au rouge, circulation en marche à vue pendant six heures.",
    mesures: "Marche à vue prescrite par le régulateur, plainte déposée à la gendarmerie de Ndjolé.", interruption: 360,
    statut: "qualifie",
    actions: [{ libelle: "Protéger les chambres de câbles de la section Alembé par des tampons verrouillés", responsable: "Chef du service signalisation", direction: "DINFRA", echeance: 30, statut: "en_cours", avancement: 20 }],
  },
  {
    joursAvant: 250, heure: 18.4, type: "heurt_animal", gravite: "mineur", pk: 52, lieu: "PK 52, entre Ntoum et Andem", train: "TR-202",
    declarant: "Rufin OVONO, conducteur de ligne", description: "Heurt d'une chèvre errante ; aucun dégât au matériel.",
    statut: "classe", note: "Sans conséquence ; information transmise à la mairie d'Andem pour la divagation des animaux.",
  },
  {
    joursAvant: 180, heure: 13.1, type: "incendie", gravite: "significatif", pk: 380, lieu: "PK 380, Ivindo", train: "MIN-705",
    declarant: "Davy NGUEMA, conducteur de ligne", description: "Départ de feu sur le compresseur de la locomotive CC 2210, maîtrisé par l'équipe avec les extincteurs de bord.",
    mesures: "Locomotive isolée et remorquée vers Booué.", degats: "Compresseur principal détruit", interruption: 240,
    statut: "cloture",
    enquete: {
      statut: "cloturee", echeance: -120,
      constats: "Fuite d'huile sur le carter du compresseur au contact du collecteur d'échappement.",
      causes: [{ categorie: "materiel", description: "Joint de carter dégradé non détecté à la visite de 30 000 km", racine: true }],
      recommandations: ["Ajouter le contrôle des joints de compresseur à la visite de 30 000 km"],
      conclusion: "Défaut de maintenance préventive ; la gamme de visite est corrigée.",
    },
    actions: [{ libelle: "Réviser la gamme de visite 30 000 km des CC 2200 (joints de compresseur)", responsable: "Ingénieur matériel roulant", direction: "DMAT", echeance: -100, statut: "verifiee", avancement: 100, preuve: "Gamme GV-CC2200 indice C" }],
  },
  {
    joursAvant: 6, heure: 11.3, type: "franchissement_signal", gravite: "significatif", gare: "OWE", lieu: "Faisceau d'Owendo, signal de manœuvre M14",
    declarant: "Landry ELLA, chef de manœuvre", description: "Franchissement du signal de manœuvre M14 fermé par une rame de 12 wagons vides ; arrêt après 20 m sans conséquence.",
    mesures: "Agent de manœuvre relevé de son poste en attendant l'analyse.",
    statut: "qualifie", notification: "a_preparer",
  },
  {
    joursAvant: 2, heure: 19.7, type: "malveillance", gravite: "significatif", train: "TR-201", gare: "LTV", lieu: "Voiture V3 du TR-201, en gare de Lastourville",
    declarant: "Judith ENGONE, contrôleuse à bord", description: "Agression d'une contrôleuse par un voyageur sans titre lors d'une régularisation ; contusions au bras.",
    mesures: "Voyageur remis à la police de Lastourville, contrôleuse relayée à Moanda.", blesses: 1,
    statut: "declare",
  },
  {
    joursAvant: 100, heure: 16.0, type: "deraillement", gravite: "mineur", gare: "FCV", lieu: "Voie de garage n° 3 de Franceville",
    declarant: "Steeve MABIKA, agent de manœuvre", description: "Déraillement à l'arrêt d'un essieu d'une voiture garée, à la mise en mouvement.",
    mesures: "Voiture relevée par vérinage.",
    statut: "cloture", notification: "accusee", note: "Butée de voie de garage déplacée ; remise en place et contrôlée.",
  },
  {
    joursAvant: 140, heure: 5.5, type: "obstacle_voie", gravite: "grave", pk: 214, lieu: "PK 214, tranchée d'Alembé",
    declarant: "Euloge BEKALE, agent de la voie", description: "Éboulement de la tranchée après 48 h de pluies ; 300 m³ de terre sur la voie, détecté par la patrouille avant le passage du TR-201.",
    mesures: "Circulation interrompue, déblaiement par engins, limitation à 30 km/h pendant dix jours.", interruption: 1_440,
    statut: "cloture", notification: "accusee",
    enquete: {
      statut: "cloturee", echeance: -80,
      constats: "Talus saturé, fossé de crête obstrué par la végétation depuis plusieurs mois.",
      causes: [
        { categorie: "environnement", description: "Pluies exceptionnelles sur un talus argileux", racine: false },
        { categorie: "infrastructure", description: "Fossé de crête non entretenu", racine: true },
      ],
      recommandations: ["Curer les fossés de crête des tranchées sensibles avant chaque saison des pluies", "Instrumenter la tranchée d'Alembé"],
      conclusion: "La patrouille a évité l'accident ; l'entretien des fossés devient programmé.",
    },
    actions: [
      { libelle: "Programmer le curage des fossés de crête avant chaque saison des pluies", responsable: "Chef du district voie de Ndjolé", direction: "DINFRA", echeance: -60, statut: "verifiee", avancement: 100, preuve: "Programme d'entretien 2026" },
      { libelle: "Poser des inclinomètres sur la tranchée d'Alembé", responsable: "Chef du service ouvrages d'art", direction: "DINFRA", echeance: -20, statut: "realisee", avancement: 100, preuve: "Rapport de pose du bureau d'études" },
    ],
  },
  {
    joursAvant: 9, heure: 6.4, type: "heurt_personne", gravite: "majeur", pk: 3.2, gare: "OWE", lieu: "PK 3,2, quartier Akournam (Owendo)", train: "TR-202",
    declarant: "Guy-Roger OBAME, conducteur de ligne", description: "Heurt mortel d'un piéton qui traversait les voies hors passage autorisé, à l'arrivée sur Owendo.",
    mesures: "Train arrêté, police judiciaire saisie, conducteur pris en charge par la cellule d'écoute.", deces: 1, interruption: 210,
    statut: "en_enquete", notification: "accusee",
    enquete: { statut: "instruction", echeance: 50, constats: "Traversée sauvage récurrente signalée par les riverains ; clôture de l'emprise interrompue sur 80 m." },
  },
  {
    joursAvant: 1, heure: 21.4, type: "heurt_animal", gravite: "mineur", pk: 285, lieu: "PK 285, approche de Lopé", train: "MIN-705",
    declarant: "Martial OGANDAGA, conducteur de ligne", description: "Troupeau d'éléphants sur la voie ; freinage d'urgence, contact léger avec un éléphanteau qui s'est relevé et a rejoint le groupe.",
    mesures: "Marche à vue jusqu'à Lopé, ANPN informée.",
    statut: "declare",
  },
  {
    joursAvant: 45, heure: 11.0, type: "atteinte_environnement", gravite: "mineur", gare: "OWE", lieu: "Atelier matériel d'Owendo",
    declarant: "Rachel MBINA, technicienne d'atelier", description: "Fuite d'huile hydraulique d'un vérin de levage, contenue dans la fosse de visite.",
    mesures: "Absorbants posés, huile récupérée par le prestataire agréé.",
    statut: "cloture", note: "Pollution contenue sur site ; vérin remplacé.",
  },
  {
    joursAvant: 75, heure: 8.2, type: "collision", gravite: "significatif", gare: "MOA", lieu: "Terminal minéralier de Moanda",
    declarant: "Wilfried BIYOGHE, chef de manœuvre", description: "Tamponnement à 8 km/h d'une rame en stationnement lors d'une manœuvre de refoulement ; tampons endommagés.",
    mesures: "Manœuvres suspendues, rame inspectée par le visiteur.", degats: "Tampons de deux wagons",
    statut: "en_enquete", notification: "accusee",
    enquete: { statut: "ouverte", echeance: -15 },
  },
]

interface InspectionDemo {
  type: TypeInspection
  objet: string
  gare?: string
  pk?: number
  lieu?: string
  jours: number
  statut: "programmee" | "realisee"
  resultat?: ResultatInspection
  constats?: string
  nc?: { description: string; gravite: GraviteNc; action?: ActionDemo }[]
}

const INSPECTIONS: readonly InspectionDemo[] = [
  { type: "inspection_voie", objet: "Tournée de géométrie de la voie Ndjolé — Alembé", gare: "NDJ", jours: -60, statut: "realisee", resultat: "conforme_reserves", constats: "Géométrie conforme sur 38 km ; nivellement à reprendre sur 400 m.", nc: [{ description: "Défaut de nivellement PK 190,2 à 190,6", gravite: "mineure", action: { libelle: "Bourrer la voie PK 190,2 à 190,6", responsable: "Chef du district voie de Ndjolé", direction: "DINFRA", echeance: -10, statut: "verifiee", avancement: 100, preuve: "Relevé de géométrie après travaux" } }] },
  { type: "audit_securite", objet: "Audit du système de gestion de la sécurité — exploitation d'Owendo", gare: "OWE", jours: -38, statut: "realisee", resultat: "non_conforme", constats: "Le retour d'expérience n'est pas formalisé ; les habilitations de trois chefs de manœuvre ne sont pas à jour.", nc: [
    { description: "Retour d'expérience des presque-accidents non formalisé", gravite: "majeure", action: { libelle: "Mettre en place le registre des presque-accidents et sa revue mensuelle", responsable: "Chef du service de la sécurité des circulations", direction: "DSED", echeance: 15, statut: "en_cours", avancement: 50 } },
    { description: "Habilitations de trois chefs de manœuvre échues", gravite: "majeure" },
  ] },
  { type: "controle_materiel", objet: "Contrôle des organes de freinage des voitures voyageurs", gare: "OWE", jours: -25, statut: "realisee", resultat: "conforme", constats: "Douze voitures contrôlées, freinage conforme." },
  { type: "exercice_secours", objet: "Exercice d'évacuation d'un train en ligne avec les sapeurs-pompiers", gare: "BOO", jours: -90, statut: "realisee", resultat: "conforme_reserves", constats: "Évacuation en 23 min ; radio du chef de train inaudible dans la voiture V4.", nc: [{ description: "Couverture radio insuffisante en queue de train", gravite: "mineure", action: { libelle: "Doter les chefs de train d'un répéteur radio portatif", responsable: "Chef du service télécoms", direction: "DINFRA", echeance: -30, statut: "en_cours", avancement: 80 } }] },
  { type: "inspection_environnementale", objet: "Corridor de passage des éléphants et clôtures de guidage", pk: 276, jours: -20, statut: "realisee", resultat: "non_conforme", constats: "Clôture de guidage arrachée sur 60 m au PK 277 ; traces de passage récentes sur la voie.", nc: [{ description: "Clôture de guidage arrachée PK 277", gravite: "majeure", action: { libelle: "Réparer la clôture de guidage au PK 277", responsable: "Responsable environnement & Lopé", direction: "DSED", echeance: -2, statut: "en_cours", avancement: 60, priorite: "haute" } }] },
  { type: "controle_conduite", objet: "Accompagnement en cabine du TR-201 Owendo — Booué", gare: "OWE", jours: -12, statut: "realisee", resultat: "conforme", constats: "Respect des vitesses limites et de la consigne brouillard." },
  { type: "controle_documentaire", objet: "Registres des passages à niveau gardés de la section Ntoum — Oyan", gare: "NTM", jours: -48, statut: "realisee", resultat: "conforme", constats: "Registres tenus et visés." },
  { type: "controle_materiel", objet: "Contrôle des extincteurs des locomotives de Franceville", gare: "FCV", jours: -4, statut: "programmee" },
  { type: "inspection_voie", objet: "Tournée de la voie dans la traversée de la Lopé", gare: "LOP", jours: 5, statut: "programmee" },
  { type: "inspection_environnementale", objet: "Prévention des feux de brousse — bandes coupe-feu PK 255 à 270", pk: 262, jours: 12, statut: "programmee" },
  { type: "audit_securite", objet: "Audit du système de gestion de la sécurité — exploitation de Franceville", gare: "FCV", jours: 20, statut: "programmee" },
  { type: "exercice_secours", objet: "Exercice matières dangereuses au terminal de Moanda", gare: "MOA", jours: 28, statut: "programmee" },
]

/* ════════════════════════════ Peuplement ════════════════════════════════ */

interface Personnes {
  enqueteur: { id?: Id<"users">; nom: string }
  inspecteur: { id?: Id<"users">; nom: string }
}

async function journal(
  ctx: MutationCtx,
  entree: Omit<Doc<"securiteJournal">, "_id" | "_creationTime">
) {
  await ctx.db.insert("securiteJournal", entree)
}

async function creerAction(
  ctx: MutationCtx,
  a: ActionDemo,
  aujourdhui: string,
  liens: { enqueteId?: Id<"securiteEnquetes">; evenementId?: Id<"securiteEvenements">; inspectionId?: Id<"securiteInspections"> },
  creeLe: number,
  personnes: Personnes
) {
  const numero = await prochainNumeroSecurite(ctx, `ACT-${dateLibreville(creeLe).slice(0, 4)}`, 3)
  const echeance = ajouterJours(aujourdhui, a.echeance)
  const realiseeLe = a.statut === "realisee" || a.statut === "verifiee" ? Math.min(Date.now() - JOUR, Date.parse(`${echeance}T10:00:00+01:00`) - 2 * JOUR) : undefined
  const actionId = await ctx.db.insert("securiteActions", {
    numero,
    libelle: a.libelle,
    ...liens,
    responsableNom: a.responsable,
    responsableDirection: a.direction,
    echeance,
    priorite: a.priorite ?? "normale",
    statut: a.statut,
    avancement: a.avancement,
    preuve: a.preuve,
    realiseeLe,
    verifieeLe: a.statut === "verifiee" ? (realiseeLe ?? creeLe) + 5 * JOUR : undefined,
    verifieeParNom: a.statut === "verifiee" ? personnes.inspecteur.nom : undefined,
    createdAt: creeLe,
    updatedAt: Date.now(),
    origine: "demo",
  })
  const evenementId = liens.evenementId
  await journal(ctx, { entite: "action", entiteId: actionId, evenementId, action: "securite.action.creer", libelle: `Action corrective ${numero} inscrite au plan`, detail: `${a.libelle} · ${a.responsable}`, acteurNom: personnes.enqueteur.nom, at: creeLe })
  if (realiseeLe) await journal(ctx, { entite: "action", entiteId: actionId, evenementId, action: "securite.action.realiser", libelle: "Action déclarée réalisée", detail: a.preuve ? `Preuve : ${a.preuve}` : undefined, acteurNom: a.responsable, at: realiseeLe })
  if (a.statut === "verifiee") await journal(ctx, { entite: "action", entiteId: actionId, evenementId, action: "securite.action.verifier", libelle: "Efficacité vérifiée — action soldée", acteurNom: personnes.inspecteur.nom, at: (realiseeLe ?? creeLe) + 5 * JOUR })
  return actionId
}

async function creerEvenement(ctx: MutationCtx, e: EvenementDemo, now: number, aujourdhui: string, personnes: Personnes) {
  const survenuLe = Date.parse(`${ajouterJours(aujourdhui, -e.joursAvant)}T00:00:00+01:00`) + Math.round(e.heure * HEURE)
  const pk = e.pk ?? (e.gare ? GARES.find((g) => g.code === e.gare)?.pk : undefined)
  const numero = await prochainNumeroSecurite(ctx, `EVS-${dateLibreville(survenuLe).slice(0, 4)}`)
  const declareLe = survenuLe + 45 * 60_000
  const qualifieLe = e.statut === "declare" ? undefined : declareLe + 6 * HEURE
  const evenementId = await ctx.db.insert("securiteEvenements", {
    numero,
    type: e.type,
    gravite: e.gravite,
    survenuLe,
    declareLe,
    declarantNom: e.declarant,
    gareCode: e.gare,
    pk,
    lieu: e.lieu ?? `PK ${pk}`,
    zoneLope: dansZoneLope(pk),
    trainNumber: e.train,
    description: e.description,
    mesuresImmediates: e.mesures,
    blesses: e.blesses ?? 0,
    deces: e.deces ?? 0,
    degats: e.degats,
    interruptionMinutes: e.interruption,
    statut: "declare",
    notificationRequise: false,
    qualifieLe,
    qualifieParNom: qualifieLe ? personnes.inspecteur.nom : undefined,
    origine: "demo",
  })
  await journal(ctx, { entite: "evenement", entiteId: evenementId, evenementId, action: "securite.evenement.declarer", libelle: "Déclaration de l'événement", detail: e.declarant, acteurNom: e.declarant, at: declareLe })
  if (qualifieLe) await journal(ctx, { entite: "evenement", entiteId: evenementId, evenementId, action: "securite.evenement.qualifier", libelle: "Qualification de l'événement", acteurNom: personnes.inspecteur.nom, at: qualifieLe })

  const evenement = (await ctx.db.get(evenementId))!
  await synchroniserNotification(ctx, null, evenement)
  const notification = (await ctx.db.query("securiteDeclarationsArtf").withIndex("by_evenement", (q) => q.eq("evenementId", evenementId)).collect())[0]
  if (notification && e.notification && e.notification !== "a_preparer") {
    const horsDelai = e.notification === "hors_delai"
    const transmiseLe = horsDelai ? notification.echeance + 20 * HEURE : survenuLe + 5 * HEURE
    const statut: StatutArtf = e.notification === "prete" ? "prete" : e.notification === "transmise" ? "transmise" : "accusee"
    await ctx.db.patch(notification._id, {
      contenu: `Notification de l'événement ${numero} : ${e.description}`,
      statut,
      prepareeLe: transmiseLe - HEURE,
      prepareeParNom: personnes.inspecteur.nom,
      transmiseLe: statut === "prete" ? undefined : transmiseLe,
      transmiseParNom: statut === "prete" ? undefined : personnes.inspecteur.nom,
      referenceTransmission: statut === "prete" ? undefined : `ARTF-SIM-${String(transmiseLe).slice(-8)}`,
      accuseLe: statut === "accusee" ? transmiseLe + 2 * HEURE : undefined,
      referenceAccuse: statut === "accusee" ? `AR-ARTF-${String(transmiseLe).slice(-6)}` : undefined,
    })
    if (statut !== "prete") await journal(ctx, { entite: "declaration", entiteId: notification._id, evenementId, action: "securite.artf.transmettre", libelle: `Notification transmise à l'ARTF (simulation)${horsDelai ? " — hors délai" : ""}`, acteurNom: personnes.inspecteur.nom, at: transmiseLe })
    if (statut === "accusee") await journal(ctx, { entite: "declaration", entiteId: notification._id, evenementId, action: "securite.artf.accuser", libelle: "Accusé de réception de l'ARTF (simulation)", acteurNom: "ARTF — portail simulé", at: transmiseLe + 2 * HEURE })
  }

  let enqueteId: Id<"securiteEnquetes"> | undefined
  let clotureEnquete: number | undefined
  if (e.enquete) {
    const ouverteLe = (qualifieLe ?? declareLe) + 2 * HEURE
    const numeroEnquete = await prochainNumeroSecurite(ctx, `ENQ-${dateLibreville(ouverteLe).slice(0, 4)}`, 3)
    const statut = e.enquete.statut
    const soumiseLe = statut === "rapport_soumis" || statut === "cloturee" ? Math.min(now - 3 * JOUR, ouverteLe + 40 * JOUR) : undefined
    const clotureeLe = statut === "cloturee" ? (soumiseLe ?? ouverteLe) + 4 * JOUR : undefined
    clotureEnquete = clotureeLe
    enqueteId = await ctx.db.insert("securiteEnquetes", {
      numero: numeroEnquete,
      evenementId,
      enqueteurId: personnes.enqueteur.id,
      enqueteurNom: personnes.enqueteur.nom,
      ouverteLe,
      ouverteParNom: personnes.inspecteur.nom,
      echeanceRapport: ajouterJours(aujourdhui, e.enquete.echeance),
      statut,
      constats: e.enquete.constats,
      causes: e.enquete.causes ?? [],
      recommandations: (e.enquete.recommandations ?? []).map((texte) => ({ texte })),
      conclusion: e.enquete.conclusion,
      soumiseLe,
      clotureeLe,
      clotureeParNom: clotureeLe ? personnes.inspecteur.nom : undefined,
      origine: "demo",
    })
    await journal(ctx, { entite: "enquete", entiteId: enqueteId, evenementId, action: "securite.enquete.ouvrir", libelle: `Ouverture de l'enquête ${numeroEnquete}`, detail: `Enquêteur : ${personnes.enqueteur.nom}`, acteurNom: personnes.inspecteur.nom, at: ouverteLe })
    if (statut !== "ouverte") await journal(ctx, { entite: "enquete", entiteId: enqueteId, evenementId, action: "securite.enquete.instruire", libelle: "Début de l'instruction", acteurNom: personnes.enqueteur.nom, at: ouverteLe + 3 * JOUR })
    if (soumiseLe) await journal(ctx, { entite: "enquete", entiteId: enqueteId, evenementId, action: "securite.enquete.soumettre", libelle: "Rapport soumis pour clôture", acteurNom: personnes.enqueteur.nom, at: soumiseLe })
    if (clotureeLe) await journal(ctx, { entite: "enquete", entiteId: enqueteId, evenementId, action: "securite.enquete.cloturer", libelle: `Clôture de l'enquête ${numeroEnquete}`, acteurNom: personnes.inspecteur.nom, at: clotureeLe })

    if ((await ctx.db.get(evenementId))!.notificationRequise) {
      const enquete = (await ctx.db.get(enqueteId))!
      const numeroArtf = await prochainNumeroSecurite(ctx, `ARTF-${dateLibreville(ouverteLe).slice(0, 4)}`, 3)
      const echeance = echeanceRapportEnquete(survenuLe)
      const transmis = statut === "cloturee"
      const transmiseLe = transmis ? Math.min(now - JOUR, (clotureeLe ?? now) + 2 * JOUR) : undefined
      const rapportId = await ctx.db.insert("securiteDeclarationsArtf", {
        numero: numeroArtf,
        nature: "rapport_enquete",
        evenementId,
        enqueteId,
        objet: `Rapport d'enquête ${numeroEnquete} (${numero})`,
        contenu: transmis ? composerRapport(enquete, (await ctx.db.get(evenementId))!) : undefined,
        echeance,
        statut: transmis ? "accusee" : "a_preparer",
        prepareeLe: transmiseLe ? transmiseLe - HEURE : undefined,
        prepareeParNom: transmis ? personnes.inspecteur.nom : undefined,
        transmiseLe,
        transmiseParNom: transmis ? personnes.inspecteur.nom : undefined,
        referenceTransmission: transmiseLe ? `ARTF-SIM-${String(transmiseLe).slice(-8)}` : undefined,
        accuseLe: transmiseLe ? transmiseLe + 3 * HEURE : undefined,
        referenceAccuse: transmiseLe ? `AR-ARTF-${String(transmiseLe).slice(-6)}` : undefined,
        mode: "simulation",
        createdAt: ouverteLe,
        origine: "demo",
      })
      if (transmiseLe) await journal(ctx, { entite: "declaration", entiteId: rapportId, evenementId, action: "securite.artf.transmettre", libelle: "Rapport d'enquête transmis à l'ARTF (simulation)", acteurNom: personnes.inspecteur.nom, at: transmiseLe })
    }
  }

  // Statut final et clôture éventuelle.
  const clotureLe =
    e.statut === "cloture" || e.statut === "classe" ? clotureEnquete ?? Math.min(now - JOUR, survenuLe + 10 * JOUR) : undefined
  await ctx.db.patch(evenementId, {
    statut: e.statut,
    clotureLe,
    clotureParNom: clotureLe ? personnes.inspecteur.nom : undefined,
    noteCloture: e.note,
  })
  if (clotureLe && !e.enquete) {
    await journal(ctx, { entite: "evenement", entiteId: evenementId, evenementId, action: e.statut === "classe" ? "securite.evenement.classer" : "securite.evenement.cloturer", libelle: e.statut === "classe" ? "Classement sans suite" : "Clôture sans enquête", detail: e.note, acteurNom: personnes.inspecteur.nom, at: clotureLe })
  }

  let actions = 0
  for (const a of e.actions ?? []) {
    await creerAction(ctx, a, aujourdhui, { enqueteId, evenementId }, (qualifieLe ?? declareLe) + 5 * JOUR, personnes)
    actions += 1
  }
  return actions
}

async function creerInspection(ctx: MutationCtx, i: InspectionDemo, aujourdhui: string, personnes: Personnes) {
  const date = ajouterJours(aujourdhui, i.jours)
  const pk = i.pk ?? (i.gare ? GARES.find((g) => g.code === i.gare)?.pk : undefined)
  const numero = await prochainNumeroSecurite(ctx, `INS-${date.slice(0, 4)}`, 3)
  const creeLe = Date.parse(`${date}T08:00:00+01:00`) - 30 * JOUR
  const realiseeLe = i.statut === "realisee" ? Date.parse(`${date}T16:00:00+01:00`) : undefined
  const env = i.type === "inspection_environnementale"
  const inspecteurNom = env ? "Flore MOUSSAVOU" : personnes.inspecteur.nom
  const inspectionId = await ctx.db.insert("securiteInspections", {
    numero,
    type: i.type,
    objet: i.objet,
    gareCode: i.gare,
    pk,
    lieu: i.lieu ?? (i.gare ? `Gare de ${GARES.find((g) => g.code === i.gare)?.nom}` : `PK ${pk}`),
    zoneLope: dansZoneLope(pk),
    dateProgrammee: date,
    inspecteurId: env ? undefined : personnes.inspecteur.id,
    inspecteurNom,
    statut: i.statut,
    realiseeLe,
    resultat: i.resultat,
    constats: i.constats,
    nonConformites: [],
    createdAt: creeLe,
    updatedAt: Date.now(),
    origine: "demo",
  })
  await journal(ctx, { entite: "inspection", entiteId: inspectionId, action: "securite.inspection.programmer", libelle: `Inspection programmée le ${date}`, acteurNom: inspecteurNom, at: creeLe })
  if (realiseeLe) {
    const nonConformites: Doc<"securiteInspections">["nonConformites"] = []
    for (const [index, nc] of (i.nc ?? []).entries()) {
      const code = `${numero}-NC${index + 1}`
      const actionId = nc.action ? await creerAction(ctx, nc.action, aujourdhui, { inspectionId }, realiseeLe + JOUR, personnes) : undefined
      nonConformites.push({ code, description: nc.description, gravite: nc.gravite, actionId })
    }
    await ctx.db.patch(inspectionId, { nonConformites })
    await journal(ctx, { entite: "inspection", entiteId: inspectionId, action: "securite.inspection.resultat", libelle: `Résultat saisi : ${i.resultat}`, detail: nonConformites.map((nc) => nc.code).join(", ") || "Aucune non-conformité", acteurNom: inspecteurNom, at: realiseeLe })
  }
}

async function creerBilans(ctx: MutationCtx, now: number, personnes: Personnes) {
  // Les deux bilans trimestriels précédant le dernier trimestre clos sont transmis.
  const dernier = trimestrePrecedent(trimestreDe(now))
  for (const trimestre of [trimestrePrecedent(trimestrePrecedent(dernier)), trimestrePrecedent(dernier)]) {
    const { bornes, contenu } = await composerBilan(ctx, trimestre)
    const transmiseLe = bornes.fin + 21 * JOUR
    if (transmiseLe > now) continue
    const numero = await prochainNumeroSecurite(ctx, `ARTF-${dateLibreville(transmiseLe).slice(0, 4)}`, 3)
    const declarationId = await ctx.db.insert("securiteDeclarationsArtf", {
      numero,
      nature: "bilan_trimestriel",
      periode: bornes.code,
      objet: `Bilan de sécurité — ${bornes.libelle}`,
      contenu,
      echeance: bornes.echeance,
      statut: "accusee",
      prepareeLe: transmiseLe - JOUR,
      prepareeParNom: personnes.inspecteur.nom,
      transmiseLe,
      transmiseParNom: personnes.inspecteur.nom,
      referenceTransmission: `ARTF-SIM-${String(transmiseLe).slice(-8)}`,
      accuseLe: transmiseLe + 4 * HEURE,
      referenceAccuse: `AR-ARTF-${String(transmiseLe).slice(-6)}`,
      mode: "simulation",
      createdAt: transmiseLe - JOUR,
      origine: "demo",
    })
    await journal(ctx, { entite: "declaration", entiteId: declarationId, action: "securite.artf.transmettre", libelle: `Bilan du ${bornes.libelle} transmis à l'ARTF (simulation)`, acteurNom: personnes.inspecteur.nom, at: transmiseLe })
  }
  return bornesTrimestre(dernier).code
}

async function personne(ctx: MutationCtx, role: "enqueteur_accidents" | "inspecteur_securite", repli: string) {
  const user = await ctx.db.query("users").withIndex("by_role", (q) => q.eq("role", role)).first()
  const nom = user ? [user.firstName, user.lastName].filter(Boolean).join(" ").trim() : ""
  return { id: user?._id, nom: nom || repli }
}

async function compter(ctx: MutationCtx) {
  return {
    evenements: (await ctx.db.query("securiteEvenements").collect()).length,
    enquetes: (await ctx.db.query("securiteEnquetes").collect()).length,
    actions: (await ctx.db.query("securiteActions").collect()).length,
    inspections: (await ctx.db.query("securiteInspections").collect()).length,
    declarations: (await ctx.db.query("securiteDeclarationsArtf").collect()).length,
  }
}

export const peupler = internalMutation({
  args: { reset: v.optional(v.boolean()) },
  handler: async (ctx, { reset }) => {
    if (process.env.DEMO_ACCOUNTS_ENABLED !== "true") {
      throw new Error("Peuplement refusé : DEMO_ACCOUNTS_ENABLED doit valoir true.")
    }
    let supprimes = 0
    if (reset) {
      for (const table of TABLES) {
        for (const ligne of await ctx.db.query(table).collect()) {
          await ctx.db.delete(ligne._id)
          supprimes += 1
        }
      }
    } else {
      const marqueur = await ctx.db.query("securiteSequences").withIndex("by_cle", (q) => q.eq("cle", MARQUEUR)).unique()
      if (marqueur) return { cree: false, supprimes, ...(await compter(ctx)) }
    }
    const now = Date.now()
    const aujourdhui = dateLibreville(now)
    const personnes: Personnes = {
      enqueteur: await personne(ctx, "enqueteur_accidents", "Landry ESSONO"),
      inspecteur: await personne(ctx, "inspecteur_securite", "Rodrigue NGUEMA"),
    }
    for (const evenement of [...EVENEMENTS].sort((a, b) => b.joursAvant - a.joursAvant)) {
      await creerEvenement(ctx, evenement, now, aujourdhui, personnes)
    }
    for (const inspection of INSPECTIONS) await creerInspection(ctx, inspection, aujourdhui, personnes)
    const bilanAttendu = await creerBilans(ctx, now, personnes)
    await ctx.db.insert("securiteSequences", { cle: MARQUEUR, valeur: now })
    return { cree: true, supprimes, ...(await compter(ctx)), bilanAttendu }
  },
})
