/// <reference types="vite/client" />

import { convexTest } from "convex-test"
import { afterEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import type { AppRole } from "../../model/permissions"
import schema from "../../schema"
import { modules } from "../../test.setup"

type Test = ReturnType<typeof convexTest>

afterEach(() => {
  vi.unstubAllEnvs()
})

async function compte(t: Test, authId: string, role: AppRole) {
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", {
      authId,
      role,
      firstName: authId,
      lastName: "Test",
      identitySource: "local",
      isActive: true,
    })
  )
  return { userId, client: t.withIdentity({ subject: authId }) }
}

async function activerGed(t: Test, changedBy: Id<"users">) {
  await t.run((ctx) =>
    ctx.db.insert("moduleActivations", {
      moduleCode: "ged",
      environment: "test",
      isEnabled: true,
      reason: "Tests GED",
      correlationId: "ACT-GED",
      changedBy,
      updatedAt: Date.now(),
    })
  )
}

async function serie(t: Test, conservationAnnees: number | null = 10) {
  return await t.run((ctx) =>
    ctx.db.insert("gedClassement", {
      code: "DJ.CTR",
      libelle: "Contrats",
      direction: "DJ",
      processus: "Contrats",
      description: "Contrats et conventions",
      conservationAnnees,
      baseConservation: "Test",
      aValider: false,
      sortFinal: "tri",
      classificationParDefaut: "interne",
      actif: true,
      origine: "reel",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  )
}

async function fichier(t: Test, contenu = "%PDF-1.4 contenu de test") {
  const blob = new Blob([contenu], { type: "application/pdf" })
  const storageId = await t.run((ctx) => ctx.storage.store(blob))
  return { storageId, nomFichier: "piece.pdf", typeMime: "application/pdf", taille: blob.size }
}

async function scene() {
  const t = convexTest(schema, modules)
  const juriste = await compte(t, "juriste", "juriste")
  const audit = await compte(t, "audit", "audit_risques")
  const dg = await compte(t, "dg", "direction_generale")
  const gare = await compte(t, "gare", "chef_gare")
  const admin = await compte(t, "admin", "admin_fonctionnel")
  await activerGed(t, admin.userId)
  const classementId = await serie(t)
  return { t, juriste, audit, dg, gare, admin, classementId }
}

describe("GED — dépôt, versions et droits", () => {
  it("dépose une pièce avec fichier, la versionne et la fige une fois validée", async () => {
    const { t, juriste, audit, dg, classementId } = await scene()
    const { documentId, reference } = await juriste.client.mutation(api.modules.ged.mutations.deposerDocument, {
      titre: "Avenant à la convention de transport",
      type: "contrat",
      classementId,
      motsCles: ["Minerai", "avenant"],
      classification: "interne",
      dateDocument: "2026-09-01",
      fichier: await fichier(t),
    })
    expect(reference).toMatch(/^GED-\d{4}-000001$/)

    const v2 = await juriste.client.mutation(api.modules.ged.mutations.ajouterVersion, {
      documentId,
      fichier: await fichier(t, "%PDF-1.4 version corrigée"),
      commentaire: "Article 2 corrigé",
    })
    expect(v2.numero).toBe(2)

    // Un lecteur ne peut pas versionner la pièce d'autrui.
    await expect(
      audit.client.mutation(api.modules.ged.mutations.ajouterVersion, {
        documentId,
        fichier: await fichier(t, "autre"),
      })
    ).rejects.toThrow()

    const { circuitId } = await juriste.client.mutation(api.modules.ged.mutations.soumettreCircuit, {
      documentId,
      etapes: [
        { nature: "visa", libelle: "Visa audit", assigneId: audit.userId },
        { nature: "signature", libelle: "Signature DG", assigneId: dg.userId },
      ],
    })
    expect(circuitId).toBeDefined()
    // En circuit, la pièce n'est plus modifiable.
    await expect(
      juriste.client.mutation(api.modules.ged.mutations.ajouterVersion, {
        documentId,
        fichier: await fichier(t, "trop tard"),
      })
    ).rejects.toThrow("n'est plus modifiable")

    const dossier = await juriste.client.query(api.modules.ged.queries.document, { documentId })
    expect(dossier.etat).toBe("ok")
    if (dossier.etat !== "ok") return
    expect(dossier.versions.map((version) => version.numero)).toEqual([2, 1])
    expect(dossier.document.motsCles).toEqual(["minerai", "avenant"])
  })

  it("applique les classifications confidentielle et restreinte", async () => {
    const { t, juriste, gare, admin, dg, classementId } = await scene()
    const restreint = await juriste.client.mutation(api.modules.ged.mutations.deposerDocument, {
      titre: "Dossier de contentieux",
      type: "rapport",
      classementId,
      motsCles: [],
      classification: "restreint",
      dateDocument: "2026-09-01",
      acces: [{ userId: dg.userId, droit: "lecture" }],
    })
    const confidentiel = await juriste.client.mutation(api.modules.ged.mutations.deposerDocument, {
      titre: "Balance de clôture",
      type: "rapport",
      classementId,
      motsCles: [],
      classification: "confidentiel",
      dateDocument: "2026-09-01",
      acces: [{ role: "chef_gare", droit: "lecture" }],
    })

    const vuParGare = await gare.client.query(api.modules.ged.queries.document, {
      documentId: restreint.documentId,
    })
    expect(vuParGare.etat).toBe("inaccessible")
    // Même le gestionnaire documentaire n'entre pas dans le restreint.
    const vuParAdmin = await admin.client.query(api.modules.ged.queries.document, {
      documentId: restreint.documentId,
    })
    expect(vuParAdmin.etat).toBe("inaccessible")
    const vuParDg = await dg.client.query(api.modules.ged.queries.document, {
      documentId: restreint.documentId,
    })
    expect(vuParDg.etat).toBe("ok")

    const confidentielGare = await gare.client.query(api.modules.ged.queries.document, {
      documentId: confidentiel.documentId,
    })
    expect(confidentielGare.etat).toBe("ok")
    const confidentielDg = await dg.client.query(api.modules.ged.queries.document, {
      documentId: confidentiel.documentId,
    })
    expect(confidentielDg.etat).toBe("inaccessible")

    const liste = await gare.client.query(api.modules.ged.queries.listerDocuments, {})
    expect(liste.lignes.map((ligne) => ligne.titre)).toEqual(["Balance de clôture"])
    expect(liste.masques).toBe(1)

    // Ouvrir un fichier fermé est refusé et rien n'est journalisé.
    await expect(
      gare.client.mutation(api.modules.ged.mutations.ouvrirFichier, {
        documentId: restreint.documentId,
        nature: "telechargement",
      })
    ).rejects.toThrow("réservé")
    void t
  })

  it("refuse le dépôt à un compte en lecture seule", async () => {
    const { audit, classementId } = await scene()
    await expect(
      audit.client.mutation(api.modules.ged.mutations.deposerDocument, {
        titre: "Pièce interdite",
        type: "autre",
        classementId,
        motsCles: [],
        classification: "interne",
        dateDocument: "2026-09-01",
      })
    ).rejects.toThrow("lecture seule")
  })
})

describe("GED — circuit de validation", () => {
  it("vise, signe, diffuse, puis recueille les accusés de lecture", async () => {
    const { t, juriste, audit, dg, gare, admin, classementId } = await scene()
    const { documentId } = await juriste.client.mutation(api.modules.ged.mutations.deposerDocument, {
      titre: "Note de service — horaires d'été",
      type: "note_service",
      classementId,
      motsCles: ["horaires"],
      classification: "interne",
      dateDocument: "2026-09-01",
      fichier: await fichier(t),
    })
    await juriste.client.mutation(api.modules.ged.mutations.soumettreCircuit, {
      documentId,
      etapes: [
        { nature: "visa", libelle: "Visa audit", assigneId: audit.userId },
        { nature: "signature", libelle: "Signature DG", assigneId: dg.userId },
        { nature: "diffusion", libelle: "Diffusion", assigneId: admin.userId },
      ],
    })

    const parapheurAudit = await audit.client.query(api.modules.ged.queries.listerCircuits, {
      portee: "a_traiter",
    })
    expect(parapheurAudit).toHaveLength(1)
    const etapeVisa = parapheurAudit[0]!.actuelle!

    // Le signataire ne peut pas viser à la place de l'auditeur.
    await expect(
      dg.client.mutation(api.modules.ged.mutations.deciderEtape, {
        etapeId: etapeVisa._id,
        decision: "viser",
      })
    ).rejects.toThrow("intervenant désigné")
    await audit.client.mutation(api.modules.ged.mutations.deciderEtape, {
      etapeId: etapeVisa._id,
      decision: "viser",
      commentaire: "Conforme",
    })

    const parapheurDg = await dg.client.query(api.modules.ged.queries.listerCircuits, { portee: "a_traiter" })
    const etapeSignature = parapheurDg[0]!.actuelle!
    expect(etapeSignature.nature).toBe("signature")
    await expect(
      dg.client.mutation(api.modules.ged.mutations.deciderEtape, {
        etapeId: etapeSignature._id,
        decision: "viser",
      })
    ).rejects.toThrow("nature de l'étape")
    await dg.client.mutation(api.modules.ged.mutations.deciderEtape, {
      etapeId: etapeSignature._id,
      decision: "signer",
    })

    const parapheurAdmin = await admin.client.query(api.modules.ged.queries.listerCircuits, {
      portee: "a_traiter",
    })
    await expect(
      admin.client.mutation(api.modules.ged.mutations.diffuser, {
        etapeId: parapheurAdmin[0]!.actuelle!._id,
        tousLesAgents: false,
        roles: [],
      })
    ).rejects.toThrow("audience")
    await admin.client.mutation(api.modules.ged.mutations.diffuser, {
      etapeId: parapheurAdmin[0]!.actuelle!._id,
      tousLesAgents: false,
      roles: ["chef_gare"],
    })

    const dossier = await gare.client.query(api.modules.ged.queries.document, { documentId })
    expect(dossier.etat).toBe("ok")
    if (dossier.etat !== "ok") return
    expect(dossier.document.statut).toBe("diffuse")
    expect(dossier.circuits[0]!.statut).toBe("termine")
    expect(dossier.actions.peutAccuser).toBe(true)
    expect(dossier.accuses).toMatchObject({ destinataires: 1, lus: 0 })

    await gare.client.mutation(api.modules.ged.mutations.accuserLecture, { documentId })
    const repetition = await gare.client.mutation(api.modules.ged.mutations.accuserLecture, { documentId })
    expect(repetition.deja).toBe(true)
    await expect(
      audit.client.mutation(api.modules.ged.mutations.accuserLecture, { documentId })
    ).rejects.toThrow("ne vous est pas adressée")

    const notes = await gare.client.query(api.modules.ged.queries.listerNotes, {})
    expect(notes[0]).toMatchObject({ lus: 1, destinataires: 1, concerne: true })
    expect(notes[0]!.luLe).not.toBeNull()

    const journal = await t.run((ctx) =>
      ctx.db
        .query("auditLogs")
        .withIndex("by_entity", (q) => q.eq("entityTable", "gedDocuments").eq("entityId", documentId))
        .collect()
    )
    expect(journal.map((log) => log.action)).toEqual(
      expect.arrayContaining([
        "ged.document.deposer",
        "ged.circuit.soumettre",
        "ged.circuit.viser",
        "ged.circuit.signer",
        "ged.circuit.diffuser",
        "ged.note.accuser_lecture",
      ])
    )
  })

  it("exige un motif de refus, renvoie la pièce à l'auteur, interdit l'auto-signature", async () => {
    const { t, juriste, audit, dg, classementId } = await scene()
    const { documentId } = await juriste.client.mutation(api.modules.ged.mutations.deposerDocument, {
      titre: "Contrat de maintenance",
      type: "contrat",
      classementId,
      motsCles: [],
      classification: "interne",
      dateDocument: "2026-09-01",
      fichier: await fichier(t),
    })
    await expect(
      juriste.client.mutation(api.modules.ged.mutations.soumettreCircuit, {
        documentId,
        etapes: [{ nature: "signature", libelle: "Signature", assigneId: juriste.userId }],
      })
    ).rejects.toThrow("Séparation des tâches")

    await juriste.client.mutation(api.modules.ged.mutations.soumettreCircuit, {
      documentId,
      etapes: [
        { nature: "visa", libelle: "Visa audit", assigneId: audit.userId },
        { nature: "signature", libelle: "Signature DG", assigneId: dg.userId },
      ],
    })
    const [ligne] = await audit.client.query(api.modules.ged.queries.listerCircuits, { portee: "a_traiter" })
    await expect(
      audit.client.mutation(api.modules.ged.mutations.deciderEtape, {
        etapeId: ligne!.actuelle!._id,
        decision: "refuser",
      })
    ).rejects.toThrow("motif")
    await audit.client.mutation(api.modules.ged.mutations.deciderEtape, {
      etapeId: ligne!.actuelle!._id,
      decision: "refuser",
      commentaire: "Annexe tarifaire manquante",
    })
    const dossier = await juriste.client.query(api.modules.ged.queries.document, { documentId })
    if (dossier.etat !== "ok") throw new Error("dossier attendu")
    expect(dossier.document.statut).toBe("refuse")
    expect(dossier.circuits[0]).toMatchObject({ statut: "refuse", motifCloture: "Annexe tarifaire manquante" })
    expect(dossier.circuits[0]!.etapes.map((etape) => etape.statut)).toEqual(["refuse", "annule"])
    expect(dossier.actions.peutModifier).toBe(true)
    // Le DG n'a plus rien à signer.
    expect(await dg.client.query(api.modules.ged.queries.listerCircuits, { portee: "a_traiter" })).toHaveLength(0)
  })
})

describe("GED — courrier et conservation", () => {
  it("numérote le courrier dans l'ordre et rattache la réponse", async () => {
    const { juriste } = await scene()
    const premier = await juriste.client.mutation(api.modules.ged.mutations.enregistrerCourrier, {
      sens: "arrivee",
      dateCourrier: "2026-09-01",
      correspondant: "ARTF",
      objet: "Demande de rapport",
      directionAffectee: "DSED",
      priorite: "normale",
      echeanceReponse: "2026-09-10",
    })
    const second = await juriste.client.mutation(api.modules.ged.mutations.enregistrerCourrier, {
      sens: "arrivee",
      dateCourrier: "2026-09-02",
      correspondant: "COMILOG",
      objet: "Programmation",
      directionAffectee: "DCFV",
      priorite: "urgente",
    })
    expect(Number(second.numero.slice(-5))).toBe(Number(premier.numero.slice(-5)) + 1)
    const reponse = await juriste.client.mutation(api.modules.ged.mutations.enregistrerCourrier, {
      sens: "depart",
      dateCourrier: "2026-09-05",
      correspondant: "ARTF",
      objet: "Transmission du rapport",
      directionAffectee: "DSED",
      priorite: "normale",
      reponseACourrierId: premier.courrierId,
    })
    expect(reponse.numero).toMatch(/^D-\d{4}-00001$/)
    const fiche = await juriste.client.query(api.modules.ged.queries.courrier, { courrierId: premier.courrierId })
    expect(fiche?.statut).toBe("repondu")
    expect(fiche?.reponse?.numero).toBe(reponse.numero)
    expect(fiche?.enRetard).toBe(false)
    await expect(
      juriste.client.mutation(api.modules.ged.mutations.enregistrerCourrier, {
        sens: "arrivee",
        dateCourrier: "2026-09-01",
        correspondant: "ARTF",
        objet: "Échéance incohérente",
        directionAffectee: "DG",
        priorite: "normale",
        echeanceReponse: "2026-08-01",
      })
    ).rejects.toThrow("précède")
  })

  it("n'élimine qu'une pièce archivée dont la conservation est échue", async () => {
    const { t, juriste, admin, classementId } = await scene()
    const { documentId } = await juriste.client.mutation(api.modules.ged.mutations.deposerDocument, {
      titre: "Facture ancienne",
      type: "piece_comptable",
      classementId,
      motsCles: [],
      classification: "interne",
      dateDocument: "2012-01-15",
      fichier: await fichier(t),
    })
    await t.run((ctx) => ctx.db.patch(documentId, { statut: "valide" }))
    await expect(
      admin.client.mutation(api.modules.ged.mutations.eliminerDocument, { documentId, motif: "Fin de durée" })
    ).rejects.toThrow("archivée")
    const archive = await admin.client.mutation(api.modules.ged.mutations.archiverDocument, { documentId })
    expect(archive.conservationJusquau).toBe("2022-01-15")
    await expect(
      juriste.client.mutation(api.modules.ged.mutations.eliminerDocument, { documentId, motif: "Fin de durée" })
    ).rejects.toThrow("droit de suppression")
    const resultat = await admin.client.mutation(api.modules.ged.mutations.eliminerDocument, {
      documentId,
      motif: "Fin de la durée légale",
    })
    expect(resultat.fichiersDetruits).toBe(1)
    await expect(
      admin.client.mutation(api.modules.ged.mutations.ouvrirFichier, { documentId, nature: "apercu" })
    ).rejects.toThrow("éliminée")
  })
})

describe("GED — jeu de démonstration", () => {
  it("refuse de tourner sans DEMO_ACCOUNTS_ENABLED", async () => {
    const t = convexTest(schema, modules)
    vi.stubEnv("DEMO_ACCOUNTS_ENABLED", "false")
    await expect(t.action(internal.modules.ged.seed.run, {})).rejects.toThrow("DEMO_ACCOUNTS_ENABLED")
  })

  it("peuple une fois, ne duplique rien, et se régénère avec reset", async () => {
    vi.stubEnv("DEMO_ACCOUNTS_ENABLED", "true")
    const { t, juriste } = await scene()
    const premier = await t.action(internal.modules.ged.seed.run, {})
    expect(premier.statut).toBe("peuple")
    const compter = () =>
      t.run(async (ctx) => ({
        documents: (await ctx.db.query("gedDocuments").collect()).length,
        courriers: (await ctx.db.query("gedCourriers").collect()).length,
        classement: (await ctx.db.query("gedClassement").collect()).length,
        versions: (await ctx.db.query("gedVersions").collect()).length,
        circuits: (await ctx.db.query("gedCircuits").collect()).length,
      }))
    const apres = await compter()
    expect(apres.documents).toBeGreaterThanOrEqual(120)
    expect(apres.courriers).toBeGreaterThan(60)
    expect(apres.classement).toBe(17)
    expect(apres.versions).toBeGreaterThan(20)
    expect(apres.circuits).toBeGreaterThan(10)

    const second = await t.action(internal.modules.ged.seed.run, {})
    expect(second.statut).toBe("deja_peuple")
    expect(await compter()).toEqual(apres)

    // Une pièce réelle survit au reset.
    await juriste.client.mutation(api.modules.ged.mutations.enregistrerCourrier, {
      sens: "arrivee",
      dateCourrier: "2026-09-01",
      correspondant: "Courrier réel",
      objet: "Ne pas effacer",
      directionAffectee: "DG",
      priorite: "normale",
    })
    const troisieme = await t.action(internal.modules.ged.seed.run, { reset: true })
    expect(troisieme.statut).toBe("peuple")
    const final = await compter()
    expect(final.documents).toBe(apres.documents)
    expect(final.courriers).toBe(apres.courriers + 1)

    // Le registre reste chronologique : aucun numéro en double.
    const numeros = await t.run(async (ctx) => (await ctx.db.query("gedCourriers").collect()).map((c) => c.numero))
    expect(new Set(numeros).size).toBe(numeros.length)
  }, 120_000)
})
