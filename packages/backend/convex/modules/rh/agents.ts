import { v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import { mutation, query, type MutationCtx } from "../../_generated/server"
import { accesRh, chronologieRh, prochainNumero, tracerRh } from "./acces"
import { aujourdhuiLibreville, dernieresAptitudes, resumeAptitude } from "./lecture"
import {
  METIERS,
  MOTIFS_SORTIE,
  TYPES_HABILITATION,
  TYPES_MOUVEMENT,
  ajouterMois,
  ancienneteAnnees,
  dateIso,
  droitsCongeAnnuel,
  entierPositif,
  estGareConnue,
  etatAptitude,
  etatHabilitation,
  nomComplet,
  nomGare,
  texteFacultatif,
  texteRequis,
  type TypeMouvement,
} from "./model"
import {
  categorieValidator,
  contratValidator,
  directionValidator,
  metierValidator,
  modePaiementValidator,
  motifSortieValidator,
  situationFamilialeValidator,
  statutHabilitationValidator,
  typeHabilitationValidator,
} from "./tables"

/* ═════════════════════════════ Lecture ══════════════════════════════════ */

function remuneration(agent: Doc<"rhAgents">) {
  return {
    salaireBaseFcfa: agent.salaireBaseFcfa,
    primeFonctionFcfa: agent.primeFonctionFcfa,
    primeSujetionFcfa: agent.primeSujetionFcfa,
    modePaiement: agent.modePaiement,
    comptePaiement: agent.comptePaiement,
    numeroCnss: agent.numeroCnss,
    numeroCnamgs: agent.numeroCnamgs,
  }
}

/** Fiche d'annuaire : ce que tout lecteur des dossiers peut voir. */
function fichePublique(agent: Doc<"rhAgents">, aujourdhui: string) {
  return {
    _id: agent._id,
    matricule: agent.matricule,
    nom: agent.nom,
    prenom: agent.prenom,
    nomComplet: nomComplet(agent),
    sexe: agent.sexe,
    direction: agent.direction,
    metier: agent.metier,
    poste: agent.poste,
    gareCode: agent.gareCode,
    gareNom: nomGare(agent.gareCode),
    categorie: agent.categorie,
    echelon: agent.echelon,
    contrat: agent.contrat,
    dateEmbauche: agent.dateEmbauche,
    dateFinContrat: agent.dateFinContrat,
    ancienneteAnnees: ancienneteAnnees(agent.dateEmbauche, aujourdhui),
    statut: agent.statut,
    dateSortie: agent.dateSortie,
    motifSortie: agent.motifSortie,
    aCompte: agent.userId !== undefined,
  }
}

export const lister = query({
  args: {},
  handler: async (ctx) => {
    const acces = await accesRh(ctx, "consulter", "dossiers.lire")
    const aujourdhui = aujourdhuiLibreville()
    const agents = await ctx.db.query("rhAgents").take(5000)
    const voitAptitude = acces.capacites.has("aptitude.lire")
    const aptitudes = voitAptitude ? await dernieresAptitudes(ctx) : new Map()
    const habilitations = await ctx.db.query("rhHabilitations").collect()
    const alertes = new Map<string, number>()
    for (const habilitation of habilitations) {
      const etat = etatHabilitation(habilitation, aujourdhui)
      if (etat === "expiree" || etat === "a_renouveler") {
        alertes.set(habilitation.agentId, (alertes.get(habilitation.agentId) ?? 0) + 1)
      }
    }
    return agents
      .map((agent) => ({
        ...fichePublique(agent, aujourdhui),
        aptitude: voitAptitude ? etatAptitude(aptitudes.get(agent._id) ?? null, aujourdhui) : null,
        habilitationsEnAlerte: alertes.get(agent._id) ?? 0,
      }))
      .sort((a, b) => a.nom.localeCompare(b.nom, "fr") || a.prenom.localeCompare(b.prenom, "fr"))
  },
})

export const dossier = query({
  args: { agentId: v.id("rhAgents") },
  handler: async (ctx, { agentId }) => {
    const acces = await accesRh(ctx, "consulter", "dossiers.lire")
    const agent = await ctx.db.get(agentId)
    if (!agent) return null
    const aujourdhui = aujourdhuiLibreville()
    const voitPaie = acces.capacites.has("paie.lire") || acces.capacites.has("dossiers.gerer")
    const voitMedical = acces.capacites.has("medical.detail")

    const [habilitations, mouvements, visites, conges, bulletins, services] = await Promise.all([
      ctx.db.query("rhHabilitations").withIndex("by_agent", (q) => q.eq("agentId", agentId)).collect(),
      ctx.db.query("rhMouvements").withIndex("by_agent", (q) => q.eq("agentId", agentId)).collect(),
      acces.capacites.has("aptitude.lire")
        ? ctx.db.query("rhVisitesMedicales").withIndex("by_agent", (q) => q.eq("agentId", agentId)).collect()
        : Promise.resolve(null),
      acces.capacites.has("conges.lire")
        ? ctx.db.query("rhConges").withIndex("by_agent", (q) => q.eq("agentId", agentId)).collect()
        : Promise.resolve(null),
      acces.capacites.has("paie.lire")
        ? ctx.db.query("rhBulletins").withIndex("by_agent", (q) => q.eq("agentId", agentId)).collect()
        : Promise.resolve(null),
      acces.capacites.has("roulements.lire")
        ? ctx.db
            .query("rhServices")
            .withIndex("by_agent_debut", (q) => q.eq("agentId", agentId).gte("debut", Date.now() - 7 * 86_400_000))
            .take(60)
        : Promise.resolve(null),
    ])

    const derniere =
      visites
        ?.filter((visite) => visite.statut === "realisee" && visite.resultat)
        .sort((a, b) => (b.realiseeLe ?? 0) - (a.realiseeLe ?? 0))[0] ?? null
    const annee = Number(aujourdhui.slice(0, 4))
    const pris = (conges ?? [])
      .filter((conge) => conge.type === "annuel" && conge.statut === "valide" && conge.du.startsWith(String(annee)))
      .reduce((total, conge) => total + conge.jours, 0)
    const enAttente = (conges ?? [])
      .filter((conge) => conge.type === "annuel" && conge.statut === "demande" && conge.du.startsWith(String(annee)))
      .reduce((total, conge) => total + conge.jours, 0)
    const periodes = bulletins ? await Promise.all(bulletins.map((bulletin) => ctx.db.get(bulletin.periodeId))) : []

    return {
      agent: {
        ...fichePublique(agent, aujourdhui),
        dateNaissance: agent.dateNaissance,
        lieuNaissance: agent.lieuNaissance,
        telephone: agent.telephone,
        email: agent.email,
        adresse: agent.adresse,
        situationFamiliale: agent.situationFamiliale,
        enfantsACharge: agent.enfantsACharge,
        remuneration: voitPaie ? remuneration(agent) : null,
      },
      habilitations: habilitations
        .map((habilitation) => ({ ...habilitation, etat: etatHabilitation(habilitation, aujourdhui) }))
        .sort((a, b) => a.expireLe.localeCompare(b.expireLe)),
      mouvements: mouvements.sort((a, b) => b.dateEffet.localeCompare(a.dateEffet) || b.createdAt - a.createdAt),
      aptitude: visites ? resumeAptitude(derniere, aujourdhui) : null,
      visites: visites
        ? visites
            .sort((a, b) => b.dateProgrammee.localeCompare(a.dateProgrammee))
            .map((visite) => ({
              _id: visite._id,
              numero: visite.numero,
              type: visite.type,
              statut: visite.statut,
              dateProgrammee: visite.dateProgrammee,
              resultat: visite.resultat,
              valideJusquau: visite.valideJusquau,
              restrictionFonctionnelle: visite.restrictionFonctionnelle,
            }))
        : null,
      conges: conges ? conges.sort((a, b) => b.du.localeCompare(a.du)) : null,
      soldeConges: conges
        ? { annee, droits: droitsCongeAnnuel(agent.dateEmbauche, annee), pris, enAttente }
        : null,
      bulletins: bulletins
        ? bulletins
            .map((bulletin, index) => ({
              _id: bulletin._id,
              numero: bulletin.numero,
              periodeCode: periodes[index]?.code ?? "",
              periodeLibelle: periodes[index]?.libelle ?? "",
              brut: bulletin.totaux.brut,
              net: bulletin.totaux.net,
              statut: bulletin.statut,
            }))
            .sort((a, b) => b.periodeCode.localeCompare(a.periodeCode))
        : null,
      services: services ? services.sort((a, b) => a.debut - b.debut) : null,
      chronologie: await chronologieRh(ctx, { agentId }, voitMedical),
    }
  },
})

/* ════════════════════════════ Écriture ══════════════════════════════════ */

function montant(valeur: number, libelle: string) {
  return entierPositif(valeur, libelle, 100_000_000)
}

function controlerGare(code: string) {
  const gare = code.trim().toUpperCase()
  if (!estGareConnue(gare)) throw new Error(`Gare inconnue : ${code}.`)
  return gare
}

function controlerEchelon(echelon: number) {
  if (!Number.isInteger(echelon) || echelon < 1 || echelon > 20) {
    throw new Error("L'échelon doit être un entier entre 1 et 20.")
  }
  return echelon
}

function telephone(valeur: string | undefined) {
  const texte = texteFacultatif(valeur, "Le téléphone", 30)
  if (texte && !/^\+?[0-9 ]{8,20}$/.test(texte)) {
    throw new Error("Le téléphone ne doit contenir que des chiffres (ex. +241 77 12 34 56).")
  }
  return texte
}

function courriel(valeur: string | undefined) {
  const texte = texteFacultatif(valeur, "Le courriel", 120)
  if (texte && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texte)) {
    throw new Error("Le courriel n'est pas valide.")
  }
  return texte?.toLowerCase()
}

async function agentModifiable(ctx: MutationCtx, agentId: Id<"rhAgents">) {
  const agent = await ctx.db.get(agentId)
  if (!agent) throw new Error("Dossier introuvable.")
  return agent
}

export const embaucher = mutation({
  args: {
    nom: v.string(),
    prenom: v.string(),
    sexe: v.union(v.literal("F"), v.literal("M")),
    dateNaissance: v.string(),
    lieuNaissance: v.optional(v.string()),
    telephone: v.optional(v.string()),
    email: v.optional(v.string()),
    situationFamiliale: situationFamilialeValidator,
    enfantsACharge: v.number(),
    direction: directionValidator,
    metier: metierValidator,
    poste: v.string(),
    gareCode: v.string(),
    categorie: categorieValidator,
    echelon: v.number(),
    contrat: contratValidator,
    dateEmbauche: v.string(),
    dateFinContrat: v.optional(v.string()),
    salaireBaseFcfa: v.number(),
    primeFonctionFcfa: v.number(),
    primeSujetionFcfa: v.number(),
    modePaiement: modePaiementValidator,
    comptePaiement: v.optional(v.string()),
    numeroCnss: v.optional(v.string()),
    numeroCnamgs: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const acces = await accesRh(ctx, "creer", "dossiers.gerer")
    const dateEmbauche = dateIso(args.dateEmbauche, "La date d'embauche")
    const dateNaissance = dateIso(args.dateNaissance, "La date de naissance")
    if (ancienneteAnnees(dateNaissance, dateEmbauche) < 16) {
      throw new Error("L'agent doit avoir au moins 16 ans à l'embauche (Code du travail).")
    }
    let dateFinContrat: string | undefined
    if (args.contrat === "cdd" || args.contrat === "apprentissage") {
      if (!args.dateFinContrat) throw new Error("Un CDD ou un apprentissage exige une date de fin.")
      dateFinContrat = dateIso(args.dateFinContrat, "La date de fin de contrat")
      if (dateFinContrat <= dateEmbauche) throw new Error("La fin du contrat doit suivre l'embauche.")
      if (args.contrat === "cdd" && dateFinContrat > ajouterMois(dateEmbauche, 24)) {
        throw new Error("Un CDD ne peut excéder deux ans (Code du travail).")
      }
    }
    const salaireBaseFcfa = montant(args.salaireBaseFcfa, "Le salaire de base")
    if (salaireBaseFcfa < 150_000) {
      throw new Error("Le salaire de base est inférieur au SMIG gabonais (150 000 XAF).")
    }
    const matricule = await prochainNumero(ctx, "SET", 5)
    const now = Date.now()
    const agentId = await ctx.db.insert("rhAgents", {
      matricule,
      nom: texteRequis(args.nom, "Le nom", 80).toUpperCase(),
      prenom: texteRequis(args.prenom, "Le prénom", 80),
      sexe: args.sexe,
      dateNaissance,
      lieuNaissance: texteFacultatif(args.lieuNaissance, "Le lieu de naissance", 80),
      telephone: telephone(args.telephone),
      email: courriel(args.email),
      situationFamiliale: args.situationFamiliale,
      enfantsACharge: entierPositif(args.enfantsACharge, "Le nombre d'enfants", 20),
      direction: args.direction,
      metier: args.metier,
      poste: texteRequis(args.poste, "Le poste", 120),
      gareCode: controlerGare(args.gareCode),
      categorie: args.categorie,
      echelon: controlerEchelon(args.echelon),
      contrat: args.contrat,
      dateEmbauche,
      dateFinContrat,
      salaireBaseFcfa,
      primeFonctionFcfa: montant(args.primeFonctionFcfa, "La prime de fonction"),
      primeSujetionFcfa: montant(args.primeSujetionFcfa, "La prime de sujétion"),
      modePaiement: args.modePaiement,
      comptePaiement: texteFacultatif(args.comptePaiement, "Le compte de paiement", 40),
      numeroCnss: texteFacultatif(args.numeroCnss, "Le numéro CNSS", 30),
      numeroCnamgs: texteFacultatif(args.numeroCnamgs, "Le numéro CNAMGS", 30),
      statut: "actif",
      origine: "saisie",
      createdAt: now,
      updatedAt: now,
    })
    await ctx.db.insert("rhMouvements", {
      agentId,
      type: "embauche",
      dateEffet: dateEmbauche,
      apres: {
        direction: args.direction,
        metier: args.metier,
        poste: args.poste.trim(),
        gareCode: args.gareCode.trim().toUpperCase(),
        categorie: args.categorie,
        echelon: args.echelon,
        salaireBaseFcfa,
        statut: "actif",
      },
      motif: `Embauche en ${args.contrat.toUpperCase()}`,
      acteurId: acces.user._id,
      acteurNom: acces.nom,
      createdAt: now,
    })
    await tracerRh(ctx, acces, {
      entite: "agent",
      entiteId: agentId,
      agentId,
      action: "rh.agent.embaucher",
      libelle: "Embauche et ouverture du dossier",
      detail: `${matricule} · ${METIERS[args.metier].libelle} · ${nomGare(args.gareCode)}`,
      permission: "creer",
      table: "rhAgents",
      apres: { matricule, metier: args.metier, gareCode: args.gareCode, contrat: args.contrat },
    })
    return { agentId, matricule }
  },
})

export const modifierIdentite = mutation({
  args: {
    agentId: v.id("rhAgents"),
    nom: v.string(),
    prenom: v.string(),
    sexe: v.union(v.literal("F"), v.literal("M")),
    dateNaissance: v.string(),
    lieuNaissance: v.optional(v.string()),
    telephone: v.optional(v.string()),
    email: v.optional(v.string()),
    adresse: v.optional(v.string()),
    situationFamiliale: situationFamilialeValidator,
    enfantsACharge: v.number(),
    modePaiement: modePaiementValidator,
    comptePaiement: v.optional(v.string()),
    numeroCnss: v.optional(v.string()),
    numeroCnamgs: v.optional(v.string()),
  },
  handler: async (ctx, { agentId, ...args }) => {
    const acces = await accesRh(ctx, "modifier", "dossiers.gerer")
    const agent = await agentModifiable(ctx, agentId)
    const modification = {
      nom: texteRequis(args.nom, "Le nom", 80).toUpperCase(),
      prenom: texteRequis(args.prenom, "Le prénom", 80),
      sexe: args.sexe,
      dateNaissance: dateIso(args.dateNaissance, "La date de naissance"),
      lieuNaissance: texteFacultatif(args.lieuNaissance, "Le lieu de naissance", 80),
      telephone: telephone(args.telephone),
      email: courriel(args.email),
      adresse: texteFacultatif(args.adresse, "L'adresse", 200),
      situationFamiliale: args.situationFamiliale,
      enfantsACharge: entierPositif(args.enfantsACharge, "Le nombre d'enfants", 20),
      modePaiement: args.modePaiement,
      comptePaiement: texteFacultatif(args.comptePaiement, "Le compte de paiement", 40),
      numeroCnss: texteFacultatif(args.numeroCnss, "Le numéro CNSS", 30),
      numeroCnamgs: texteFacultatif(args.numeroCnamgs, "Le numéro CNAMGS", 30),
    }
    const champs = (Object.keys(modification) as (keyof typeof modification)[]).filter(
      (cle) => agent[cle] !== modification[cle]
    )
    if (champs.length === 0) return { modifie: false }
    await ctx.db.patch(agentId, { ...modification, updatedAt: Date.now() })
    await tracerRh(ctx, acces, {
      entite: "agent",
      entiteId: agentId,
      agentId,
      action: "rh.agent.modifier",
      libelle: "Mise à jour de l'état civil et des coordonnées",
      detail: `Champs modifiés : ${champs.join(", ")}`,
      permission: "modifier",
      table: "rhAgents",
      avant: Object.fromEntries(champs.map((cle) => [cle, agent[cle]])),
      apres: Object.fromEntries(champs.map((cle) => [cle, modification[cle]])),
    })
    return { modifie: true }
  },
})

/**
 * Mouvement de carrière : mutation, promotion, révision de salaire,
 * suspension, réintégration ou sortie. Le dossier est mis à jour et
 * l'historique garde la situation avant / après.
 */
export const enregistrerMouvement = mutation({
  args: {
    agentId: v.id("rhAgents"),
    type: v.union(
      v.literal("mutation"),
      v.literal("promotion"),
      v.literal("revision_salaire"),
      v.literal("suspension"),
      v.literal("reintegration"),
      v.literal("sortie")
    ),
    dateEffet: v.string(),
    motif: v.string(),
    direction: v.optional(directionValidator),
    metier: v.optional(metierValidator),
    poste: v.optional(v.string()),
    gareCode: v.optional(v.string()),
    categorie: v.optional(categorieValidator),
    echelon: v.optional(v.number()),
    salaireBaseFcfa: v.optional(v.number()),
    primeFonctionFcfa: v.optional(v.number()),
    motifSortie: v.optional(motifSortieValidator),
  },
  handler: async (ctx, args) => {
    const acces = await accesRh(ctx, "modifier", "dossiers.gerer")
    const agent = await agentModifiable(ctx, args.agentId)
    const dateEffet = dateIso(args.dateEffet, "La date d'effet")
    const motif = texteRequis(args.motif, "Le motif", 500)
    if (dateEffet < agent.dateEmbauche) {
      throw new Error("La date d'effet précède l'embauche de l'agent.")
    }
    if (agent.statut === "sorti") {
      throw new Error("L'agent est sorti des effectifs : aucun mouvement n'est possible.")
    }

    const avant = {
      direction: agent.direction,
      metier: agent.metier,
      poste: agent.poste,
      gareCode: agent.gareCode,
      categorie: agent.categorie,
      echelon: agent.echelon,
      salaireBaseFcfa: agent.salaireBaseFcfa,
      statut: agent.statut,
    }
    const patch: Partial<Doc<"rhAgents">> = {}
    switch (args.type) {
      case "mutation": {
        if (!args.gareCode && !args.direction && !args.poste && !args.metier) {
          throw new Error("Une mutation change au moins la gare, la direction, le métier ou le poste.")
        }
        if (args.gareCode) patch.gareCode = controlerGare(args.gareCode)
        if (args.direction) patch.direction = args.direction
        if (args.metier) patch.metier = args.metier
        if (args.poste) patch.poste = texteRequis(args.poste, "Le poste", 120)
        break
      }
      case "promotion": {
        if (!args.categorie && args.echelon === undefined) {
          throw new Error("Une promotion change la catégorie ou l'échelon.")
        }
        if (args.categorie) patch.categorie = args.categorie
        if (args.echelon !== undefined) patch.echelon = controlerEchelon(args.echelon)
        if (args.poste) patch.poste = texteRequis(args.poste, "Le poste", 120)
        if (args.salaireBaseFcfa !== undefined) patch.salaireBaseFcfa = montant(args.salaireBaseFcfa, "Le salaire de base")
        break
      }
      case "revision_salaire": {
        if (args.salaireBaseFcfa === undefined && args.primeFonctionFcfa === undefined) {
          throw new Error("Indiquez le nouveau salaire de base ou la nouvelle prime de fonction.")
        }
        if (args.salaireBaseFcfa !== undefined) {
          const salaire = montant(args.salaireBaseFcfa, "Le salaire de base")
          if (salaire < 150_000) throw new Error("Le salaire de base est inférieur au SMIG gabonais (150 000 XAF).")
          patch.salaireBaseFcfa = salaire
        }
        if (args.primeFonctionFcfa !== undefined) patch.primeFonctionFcfa = montant(args.primeFonctionFcfa, "La prime de fonction")
        break
      }
      case "suspension": {
        if (agent.statut !== "actif") throw new Error("Seul un agent en activité peut être suspendu.")
        patch.statut = "suspendu"
        break
      }
      case "reintegration": {
        if (agent.statut !== "suspendu") throw new Error("Seul un agent suspendu peut être réintégré.")
        patch.statut = "actif"
        break
      }
      case "sortie": {
        if (!args.motifSortie) throw new Error("Le motif de sortie est obligatoire.")
        patch.statut = "sorti"
        patch.dateSortie = dateEffet
        patch.motifSortie = args.motifSortie
        break
      }
    }
    await ctx.db.patch(agent._id, { ...patch, updatedAt: Date.now() })
    const apres = { ...avant, ...Object.fromEntries(Object.entries(patch).filter(([cle]) => cle in avant)) }
    await ctx.db.insert("rhMouvements", {
      agentId: agent._id,
      type: args.type,
      dateEffet,
      avant,
      apres,
      motif,
      acteurId: acces.user._id,
      acteurNom: acces.nom,
      createdAt: Date.now(),
    })

    let servicesAnnules = 0
    let congesAnnules = 0
    if (args.type === "sortie" || args.type === "suspension") {
      const effet = Date.parse(`${dateEffet}T00:00:00+01:00`)
      const services = await ctx.db
        .query("rhServices")
        .withIndex("by_agent_debut", (q) => q.eq("agentId", agent._id).gte("debut", effet))
        .collect()
      for (const service of services.filter((s) => s.statut !== "annule")) {
        await ctx.db.patch(service._id, {
          statut: "annule",
          motifAnnulation: `${TYPES_MOUVEMENT[args.type]} de l'agent au ${dateEffet}`,
          updatedAt: Date.now(),
        })
        servicesAnnules += 1
      }
      if (args.type === "sortie") {
        const conges = await ctx.db
          .query("rhConges")
          .withIndex("by_agent", (q) => q.eq("agentId", agent._id).gte("du", dateEffet))
          .collect()
        for (const conge of conges.filter((c) => c.statut === "demande" || c.statut === "valide")) {
          await ctx.db.patch(conge._id, {
            statut: "annule",
            decisionLe: Date.now(),
            decisionParNom: acces.nom,
            decisionNote: "Annulé à la sortie des effectifs.",
          })
          congesAnnules += 1
        }
      }
    }

    await tracerRh(ctx, acces, {
      entite: "agent",
      entiteId: agent._id,
      agentId: agent._id,
      action: `rh.agent.mouvement.${args.type}`,
      libelle: TYPES_MOUVEMENT[args.type as TypeMouvement],
      detail: [
        motif,
        args.type === "sortie" && args.motifSortie ? MOTIFS_SORTIE[args.motifSortie] : null,
        servicesAnnules > 0 ? `${servicesAnnules} service(s) annulé(s)` : null,
        congesAnnules > 0 ? `${congesAnnules} congé(s) annulé(s)` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      permission: "modifier",
      table: "rhAgents",
      avant,
      apres,
    })
    return { servicesAnnules, congesAnnules, statut: patch.statut ?? agent.statut }
  },
})

/* ═════════════════════════ Habilitations ════════════════════════════════ */

export const ajouterHabilitation = mutation({
  args: {
    agentId: v.id("rhAgents"),
    type: typeHabilitationValidator,
    numero: v.string(),
    delivreeLe: v.string(),
    expireLe: v.optional(v.string()),
    organisme: v.string(),
  },
  handler: async (ctx, args) => {
    const acces = await accesRh(ctx, "creer", "dossiers.gerer")
    const agent = await agentModifiable(ctx, args.agentId)
    if (agent.statut === "sorti") throw new Error("L'agent est sorti des effectifs.")
    const delivreeLe = dateIso(args.delivreeLe, "La date de délivrance")
    const expireLe = args.expireLe
      ? dateIso(args.expireLe, "La date d'expiration")
      : ajouterMois(delivreeLe, TYPES_HABILITATION[args.type].dureeMois)
    if (expireLe <= delivreeLe) throw new Error("L'expiration doit suivre la délivrance.")
    const existantes = await ctx.db
      .query("rhHabilitations")
      .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
      .collect()
    if (existantes.some((h) => h.type === args.type && h.statut === "valide" && h.expireLe >= aujourdhuiLibreville())) {
      throw new Error("Cette habilitation est déjà valide : renouvelez-la plutôt que d'en créer une seconde.")
    }
    const now = Date.now()
    const habilitationId = await ctx.db.insert("rhHabilitations", {
      agentId: args.agentId,
      type: args.type,
      numero: texteRequis(args.numero, "Le numéro", 40),
      delivreeLe,
      expireLe,
      organisme: texteRequis(args.organisme, "L'organisme", 120),
      statut: "valide",
      createdAt: now,
      updatedAt: now,
    })
    await tracerRh(ctx, acces, {
      entite: "agent",
      entiteId: args.agentId,
      agentId: args.agentId,
      action: "rh.habilitation.ajouter",
      libelle: `Habilitation « ${TYPES_HABILITATION[args.type].libelle} » délivrée`,
      detail: `Valide jusqu'au ${expireLe}`,
      permission: "creer",
      table: "rhHabilitations",
      apres: { type: args.type, delivreeLe, expireLe },
    })
    return { habilitationId, expireLe }
  },
})

export const renouvelerHabilitation = mutation({
  args: {
    habilitationId: v.id("rhHabilitations"),
    numero: v.string(),
    delivreeLe: v.string(),
    expireLe: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const acces = await accesRh(ctx, "modifier", "dossiers.gerer")
    const habilitation = await ctx.db.get(args.habilitationId)
    if (!habilitation) throw new Error("Habilitation introuvable.")
    if (habilitation.statut === "retiree") throw new Error("Une habilitation retirée ne se renouvelle pas : délivrez-en une nouvelle.")
    const delivreeLe = dateIso(args.delivreeLe, "La date de délivrance")
    const expireLe = args.expireLe
      ? dateIso(args.expireLe, "La date d'expiration")
      : ajouterMois(delivreeLe, TYPES_HABILITATION[habilitation.type].dureeMois)
    if (expireLe <= habilitation.expireLe && habilitation.statut === "valide") {
      throw new Error("Le renouvellement doit prolonger l'échéance actuelle.")
    }
    await ctx.db.patch(habilitation._id, {
      numero: texteRequis(args.numero, "Le numéro", 40),
      delivreeLe,
      expireLe,
      statut: "valide",
      updatedAt: Date.now(),
    })
    await tracerRh(ctx, acces, {
      entite: "agent",
      entiteId: habilitation.agentId,
      agentId: habilitation.agentId,
      action: "rh.habilitation.renouveler",
      libelle: `Habilitation « ${TYPES_HABILITATION[habilitation.type].libelle} » renouvelée`,
      detail: `Échéance ${habilitation.expireLe} → ${expireLe}`,
      permission: "modifier",
      table: "rhHabilitations",
      avant: { expireLe: habilitation.expireLe, statut: habilitation.statut },
      apres: { expireLe, statut: "valide" },
    })
    return { expireLe }
  },
})

export const changerStatutHabilitation = mutation({
  args: {
    habilitationId: v.id("rhHabilitations"),
    statut: statutHabilitationValidator,
    motif: v.string(),
  },
  handler: async (ctx, args) => {
    const acces = await accesRh(ctx, "modifier", "dossiers.gerer")
    const habilitation = await ctx.db.get(args.habilitationId)
    if (!habilitation) throw new Error("Habilitation introuvable.")
    if (habilitation.statut === args.statut) throw new Error("L'habilitation est déjà dans cet état.")
    if (habilitation.statut === "retiree") throw new Error("Une habilitation retirée est définitive.")
    const motif = texteRequis(args.motif, "Le motif", 500)
    await ctx.db.patch(habilitation._id, { statut: args.statut, note: motif, updatedAt: Date.now() })
    const verbe = { valide: "rétablie", suspendue: "suspendue", retiree: "retirée" }[args.statut]
    await tracerRh(ctx, acces, {
      entite: "agent",
      entiteId: habilitation.agentId,
      agentId: habilitation.agentId,
      action: "rh.habilitation.statut",
      libelle: `Habilitation « ${TYPES_HABILITATION[habilitation.type].libelle} » ${verbe}`,
      detail: motif,
      permission: "modifier",
      table: "rhHabilitations",
      avant: { statut: habilitation.statut },
      apres: { statut: args.statut },
    })
    return { statut: args.statut }
  },
})
