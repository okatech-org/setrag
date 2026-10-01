/**
 * Bibliothèque des études et plan d'actions d'audit de démonstration.
 *
 * Commande (depuis `packages/backend`, déploiement où
 * `DEMO_ACCOUNTS_ENABLED=true`) :
 *
 *   bunx convex run modules/etudes/seed:run '{}'
 *   bunx convex run modules/etudes/seed:run '{"reset": true}'
 *
 * Les études (texte de `corpus.ts`, généré depuis les fichiers Markdown du
 * dépôt par `scripts/generer-corpus-etudes.mjs`) sont toujours resynchronisées :
 * une étude dont l'empreinte a changé est rechargée, ses sections recalculées.
 * Les annotations et constats d'exemple (origine `demo`) ne sont créés qu'une
 * fois ; `reset` les supprime puis les recrée. Les saisies réelles ne sont
 * jamais touchées.
 */

import { v } from "convex/values"

import type { Id } from "../../_generated/dataModel"
import { internalMutation, type MutationCtx } from "../../_generated/server"
import { isInternalRole, type AppRole } from "../../model/permissions"
import { CORPUS_ETUDES } from "./corpus"
import { compterMots, decouperSections, referenceConstat } from "./model"
import { jourLibreville } from "./outils"

const JOUR = 86_400_000

async function premierCompte(ctx: MutationCtx, roles: readonly AppRole[]): Promise<Id<"users"> | null> {
  for (const role of roles) {
    const users = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", role))
      .collect()
    const actif = users
      .filter((user) => user.isActive && isInternalRole(user.role))
      .sort((a, b) => a._creationTime - b._creationTime)[0]
    if (actif) return actif._id
  }
  return null
}

/** Charge ou recharge les études dont le contenu a changé. */
async function synchroniserEtudes(ctx: MutationCtx, maintenant: number) {
  let chargees = 0
  const codes = new Set<string>()
  for (const entree of CORPUS_ETUDES) {
    codes.add(entree.code)
    const existante = await ctx.db
      .query("etudesDocuments")
      .withIndex("by_code", (q) => q.eq("code", entree.code))
      .unique()
    const sections = decouperSections(entree.contenu)
    const valeurs = {
      code: entree.code,
      numero: entree.numero,
      titre: entree.titre,
      categorie: entree.categorie,
      resume: entree.resume,
      contenu: entree.contenu,
      fichierMd: entree.fichierMd,
      fichierPdf: entree.fichierPdf ?? undefined,
      empreinte: entree.empreinte,
      mots: compterMots(sections.map((section) => section.texte).join(" ")),
      ordre: entree.ordre,
    }
    if (existante && existante.empreinte === entree.empreinte) {
      await ctx.db.patch(existante._id, {
        numero: valeurs.numero,
        titre: valeurs.titre,
        categorie: valeurs.categorie,
        resume: valeurs.resume,
        ordre: valeurs.ordre,
        fichierPdf: valeurs.fichierPdf,
      })
      continue
    }
    const documentId = existante
      ? existante._id
      : await ctx.db.insert("etudesDocuments", { ...valeurs, publieLe: maintenant, updatedAt: maintenant })
    if (existante) {
      await ctx.db.patch(existante._id, { ...valeurs, updatedAt: maintenant })
      const anciennes = await ctx.db
        .query("etudesSections")
        .withIndex("by_document_rang", (q) => q.eq("documentId", existante._id))
        .collect()
      for (const ancienne of anciennes) await ctx.db.delete(ancienne._id)
    }
    for (const section of sections) {
      await ctx.db.insert("etudesSections", {
        documentId,
        rang: section.rang,
        ancre: section.ancre,
        titre: section.titre,
        niveau: section.niveau,
        texte: section.texte,
      })
    }
    chargees += 1
  }
  return { chargees, total: codes.size }
}

const CONSTATS_DEMO = [
  {
    code: "01_AUDIT_PORTAIL_AGENT_EXISTANT",
    titre: "Traçabilité incomplète des consultations de données voyageurs",
    constat:
      "Les consultations de fiches voyageurs ne sont pas toutes journalisées avec leur motif ; le contrôle a posteriori reste partiel.",
    recommandation:
      "Journaliser chaque consultation avec son motif et produire un état mensuel des accès pour le contrôle interne.",
    gravite: "majeure" as const,
    direction: "DSI",
    responsable: ["admin_it", "admin_fonctionnel"] as AppRole[],
    jours: -12,
    statut: "en_cours" as const,
    avancement: 60,
  },
  {
    code: "05_CONFORMITE_OHADA_FISCALITE_DROIT_GABON",
    titre: "Référentiel fiscal non homologué par la DFC",
    constat:
      "Les taux et assiettes utilisés dans les études ne sont pas encore validés par la Direction finance ; aucune déclaration ne peut en être tirée.",
    recommandation:
      "Faire valider par la DFC un référentiel fiscal daté et sourcé, puis l'activer dans le module Finances avant toute déclaration.",
    gravite: "majeure" as const,
    direction: "DFC",
    responsable: ["fiscaliste_tresorier", "comptable", "fiscaliste"] as AppRole[],
    jours: 20,
    statut: "a_lancer" as const,
    avancement: 0,
  },
  {
    code: "04_ARCHITECTURE_SYSTEME_EXPLOITATION_MODULES",
    titre: "Durées de conservation de la GED à confirmer",
    constat:
      "Plusieurs séries du plan de classement portent une durée de conservation retenue par la politique interne, sans texte légal identifié.",
    recommandation:
      "Faire arrêter par la Direction juridique les durées de conservation de chaque série et leur base légale.",
    gravite: "moderee" as const,
    direction: "DJ",
    responsable: ["juriste"] as AppRole[],
    jours: 30,
    statut: "en_cours" as const,
    avancement: 40,
  },
  {
    code: "RECETTE_ESPACE_DIRECTION_GENERALE",
    titre: "Convention de longueur de ligne à homologuer",
    constat:
      "Le référentiel des gares affiche 669 km quand la communication publique cite 648 km ; la convention n'est pas tranchée.",
    recommandation: "Arrêter la convention de mesure et l'appliquer à tous les affichages et rapports.",
    gravite: "mineure" as const,
    direction: "DEF",
    responsable: ["direction_generale"] as AppRole[],
    jours: -3,
    statut: "realisee" as const,
    avancement: 100,
  },
  {
    code: "06_FEUILLE_DE_ROUTE_ET_PLAN_IMPLEMENTATION",
    titre: "Plan de continuité non exercé sur la billetterie",
    constat:
      "Le plan de continuité décrit une reprise en mode dégradé, mais aucun exercice n'a été mené sur les guichets.",
    recommandation: "Programmer un exercice semestriel de bascule en mode dégradé et en consigner le retour d'expérience.",
    gravite: "moderee" as const,
    direction: "DSI",
    responsable: ["admin_fonctionnel", "admin_it"] as AppRole[],
    jours: 45,
    statut: "a_lancer" as const,
    avancement: 0,
  },
  {
    code: "03_CARTOGRAPHIE_ACTEURS_INTERNES_EXTERNES",
    titre: "Accès des partenaires externes à revoir trimestriellement",
    constat:
      "Les habilitations des parties prenantes externes ne font pas l'objet d'une revue périodique formalisée.",
    recommandation: "Instaurer une revue trimestrielle des accès externes, signée par chaque direction propriétaire.",
    gravite: "moderee" as const,
    direction: "DSI",
    responsable: ["admin_it", "admin_fonctionnel"] as AppRole[],
    jours: -40,
    statut: "verifiee" as const,
    avancement: 100,
  },
]

const ANNOTATIONS_DEMO = [
  {
    code: "RECETTE_ESPACE_DIRECTION_GENERALE",
    nature: "question" as const,
    texte: "La période par défaut de 30 jours convient-elle au comité de direction mensuel ?",
    roles: ["direction_generale"] as AppRole[],
    traitee: false,
  },
  {
    code: "05_CONFORMITE_OHADA_FISCALITE_DROIT_GABON",
    nature: "reserve" as const,
    texte: "Les taux cités sont indicatifs : ne pas les reprendre dans un paramétrage sans validation DFC.",
    roles: ["audit_risques"] as AppRole[],
    traitee: true,
  },
  {
    code: "04_ARCHITECTURE_SYSTEME_EXPLOITATION_MODULES",
    nature: "commentaire" as const,
    texte: "La messagerie chiffrée et la visioconférence relèvent d'un choix d'hébergement à arbitrer avant tout développement.",
    roles: ["juriste"] as AppRole[],
    traitee: false,
  },
]

export const run = internalMutation({
  args: { reset: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    if (process.env.DEMO_ACCOUNTS_ENABLED !== "true") {
      throw new Error("Peuplement refusé : DEMO_ACCOUNTS_ENABLED doit valoir true.")
    }
    const maintenant = Date.now()
    const etudes = await synchroniserEtudes(ctx, maintenant)

    let purges = 0
    if (args.reset) {
      const constats = await ctx.db
        .query("etudesConstats")
        .withIndex("by_origine", (q) => q.eq("origine", "demo"))
        .collect()
      for (const constat of constats) {
        const suivis = await ctx.db
          .query("etudesSuivis")
          .withIndex("by_constat", (q) => q.eq("constatId", constat._id))
          .collect()
        for (const suivi of suivis) await ctx.db.delete(suivi._id)
        await ctx.db.delete(constat._id)
        purges += 1
      }
      const annotations = (await ctx.db.query("etudesAnnotations").collect()).filter(
        (annotation) => annotation.origine === "demo"
      )
      for (const annotation of annotations) {
        await ctx.db.delete(annotation._id)
        purges += 1
      }
    }

    const dejaPeuple = await ctx.db
      .query("etudesConstats")
      .withIndex("by_origine", (q) => q.eq("origine", "demo"))
      .first()
    if (dejaPeuple) {
      return { etudes, purges, constats: 0, annotations: 0, message: "Exemples déjà présents : seules les études ont été resynchronisées." }
    }

    const auditeur =
      (await premierCompte(ctx, ["audit_risques"])) ??
      (await premierCompte(ctx, ["admin_fonctionnel", "direction_generale", "juriste"]))
    if (!auditeur) {
      return { etudes, purges, constats: 0, annotations: 0, message: "Aucun compte interne : exemples non créés." }
    }

    const documents = new Map(
      (await ctx.db.query("etudesDocuments").collect()).map((document) => [document.code, document])
    )
    const annee = new Date(maintenant).getUTCFullYear()
    // Les références d'exemple ont leur propre série (AUD-DEMO-…) : elles ne
    // consomment pas la numérotation réelle du plan d'actions.
    let constats = 0
    for (const [rang, exemple] of CONSTATS_DEMO.entries()) {
      const document = documents.get(exemple.code)
      const responsable = (await premierCompte(ctx, exemple.responsable)) ?? auditeur
      const creeLe = maintenant - (60 - rang * 7) * JOUR
      const constatId = await ctx.db.insert("etudesConstats", {
        reference: referenceConstat(annee, rang + 1).replace("AUD-", "AUD-DEMO-"),
        titre: exemple.titre,
        constat: exemple.constat,
        recommandation: exemple.recommandation,
        gravite: exemple.gravite,
        documentId: document?._id,
        direction: exemple.direction,
        responsableId: responsable,
        echeance: jourLibreville(maintenant + exemple.jours * JOUR),
        statut: exemple.statut,
        avancement: exemple.avancement,
        creePar: auditeur,
        origine: "demo",
        createdAt: creeLe,
        updatedAt: maintenant - rang * JOUR,
      })
      constats += 1
      await ctx.db.insert("etudesSuivis", {
        constatId,
        auteurId: auditeur,
        nature: "creation",
        texte: "Constat d'exemple inscrit au plan d'actions (jeu de démonstration).",
        at: creeLe,
      })
      if (exemple.statut !== "a_lancer") {
        await ctx.db.insert("etudesSuivis", {
          constatId,
          auteurId: responsable,
          nature: "statut",
          avant: "a_lancer",
          apres: exemple.statut === "verifiee" ? "realisee" : exemple.statut,
          texte: "Démarrage de l'action (exemple).",
          at: creeLe + 5 * JOUR,
        })
      }
      if (exemple.statut === "verifiee") {
        await ctx.db.insert("etudesSuivis", {
          constatId,
          auteurId: auditeur,
          nature: "statut",
          avant: "realisee",
          apres: "verifiee",
          texte: "Preuves examinées : revue des accès signée (exemple).",
          at: creeLe + 20 * JOUR,
        })
      }
    }

    let annotations = 0
    for (const [rang, exemple] of ANNOTATIONS_DEMO.entries()) {
      const document = documents.get(exemple.code)
      if (!document) continue
      const auteur = (await premierCompte(ctx, exemple.roles)) ?? auditeur
      const premiereSection = decouperSections(document.contenu)[1]
      await ctx.db.insert("etudesAnnotations", {
        documentId: document._id,
        ancre: premiereSection?.ancre,
        auteurId: auteur,
        nature: exemple.nature,
        texte: exemple.texte,
        statut: exemple.traitee ? "traitee" : "ouverte",
        ...(exemple.traitee
          ? {
              reponse: "Pris en compte : la réserve figure désormais au plan d'actions.",
              traitePar: auditeur,
              traiteLe: maintenant - rang * JOUR,
            }
          : {}),
        origine: "demo",
        createdAt: maintenant - (10 - rang) * JOUR,
      })
      annotations += 1
    }

    return { etudes, purges, constats, annotations, message: "Exemples créés." }
  },
})
