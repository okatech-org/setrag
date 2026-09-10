import { makeFunctionReference } from "convex/server"
import { convexTest } from "convex-test"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { Id } from "../../_generated/dataModel"
import type { AppRole } from "../../model/permissions"
import schema from "../../schema"
import { modules } from "../../test.setup"
import {
  MAX_DOCUMENT_SIZE_BYTES,
  normalizedStoredSha256,
} from "./documentModel"

type ModuleCode =
  | "voyageurs"
  | "fret"
  | "cotraf"
  | "gmao"
  | "infrastructure"
  | "finance"
  | "rh"
  | "ged"
  | "securite"
  | "copilot"
type Classification = "public" | "interne" | "confidentiel" | "restreint"

type CreateDocumentArgs = {
  documentId?: Id<"documentRecords">
  moduleCode: ModuleCode
  entityType: string
  entityId: string
  title?: string
  classification?: Classification
  storageId: Id<"_storage">
  fileName: string
  mimeType: string
  sizeBytes: number
  checksumSha256?: string
  siteId?: Id<"sites">
  reason: string
  correlationId: string
}

type CreateDocumentResult = {
  documentId: Id<"documentRecords">
  versionId: Id<"documentVersions">
  version: number
  duplicate: boolean
}

const generateUploadUrl = makeFunctionReference<
  "mutation",
  { moduleCode: ModuleCode; siteId?: Id<"sites"> },
  string
>("modules/platform/documents:generateDocumentUploadUrl")

const createDocumentVersion = makeFunctionReference<
  "mutation",
  CreateDocumentArgs,
  CreateDocumentResult
>("modules/platform/documents:createDocumentVersion")

const archiveDocument = makeFunctionReference<
  "mutation",
  {
    documentId: Id<"documentRecords">
    moduleCode: ModuleCode
    entityType: string
    entityId: string
    siteId?: Id<"sites">
    reason: string
    correlationId: string
  },
  Id<"documentRecords">
>("modules/platform/documents:archiveDocument")

const listEntityDocuments = makeFunctionReference<
  "query",
  {
    moduleCode: ModuleCode
    entityType: string
    entityId: string
    siteId?: Id<"sites">
    includeArchived?: boolean
    limit?: number
  }
>("modules/platform/documents:listEntityDocuments")

const getDocument = makeFunctionReference<
  "query",
  {
    documentId: Id<"documentRecords">
    moduleCode: ModuleCode
    siteId?: Id<"sites">
    versionLimit?: number
  }
>("modules/platform/documents:getDocument")

async function seedUser(
  t: ReturnType<typeof convexTest>,
  authId: string,
  role: AppRole
) {
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", {
      authId,
      role,
      identitySource: "local",
      isActive: true,
    })
  )
  return { userId, client: t.withIdentity({ subject: authId }) }
}

async function storeFile(
  t: ReturnType<typeof convexTest>,
  content: string,
  mimeType = "application/pdf"
) {
  const blob = new Blob([content], { type: mimeType })
  const storageId = await t.run((ctx) => ctx.storage.store(blob))
  const metadata = await t.run((ctx) =>
    ctx.db.system.get("_storage", storageId)
  )
  if (!metadata) throw new Error("Fichier de test introuvable")
  return {
    storageId,
    sizeBytes: blob.size,
    checksumSha256: normalizedStoredSha256(metadata.sha256),
  }
}

function initialDocumentArgs(
  file: Awaited<ReturnType<typeof storeFile>>,
  overrides: Partial<CreateDocumentArgs> = {}
): CreateDocumentArgs {
  return {
    moduleCode: "fret",
    entityType: "freightOrder",
    entityId: "FRT-001",
    title: "Bon de transport FRT-001",
    classification: "confidentiel",
    storageId: file.storageId,
    fileName: "bon-transport.pdf",
    mimeType: "application/pdf",
    sizeBytes: file.sizeBytes,
    checksumSha256: file.checksumSha256,
    reason: "Dépôt du bon de transport",
    correlationId: "DOC-FRT-001-V1",
    ...overrides,
  }
}

describe("Service documentaire plateforme", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("crée un dossier puis une version 2 sans dupliquer les reprises", async () => {
    vi.stubEnv("SETRAG_ENV", "test")
    const t = convexTest(schema, modules)
    const admin = await seedUser(
      t,
      "documents-admin-versions",
      "admin_fonctionnel"
    )
    const firstFile = await storeFile(t, "version 1")
    const firstArgs = initialDocumentArgs(firstFile)

    const first = await admin.client.mutation(createDocumentVersion, firstArgs)
    const initialReplay = await admin.client.mutation(
      createDocumentVersion,
      firstArgs
    )
    expect(first).toMatchObject({ version: 1, duplicate: false })
    expect(initialReplay).toEqual({ ...first, duplicate: true })

    const secondFile = await storeFile(t, "version 2")
    const secondArgs: CreateDocumentArgs = {
      documentId: first.documentId,
      moduleCode: "fret",
      entityType: "freightOrder",
      entityId: "FRT-001",
      storageId: secondFile.storageId,
      fileName: "bon-transport-v2.pdf",
      mimeType: "application/pdf",
      sizeBytes: secondFile.sizeBytes,
      checksumSha256: secondFile.checksumSha256,
      reason: "Correction du bon de transport",
      correlationId: "DOC-FRT-001-V2",
    }
    const second = await admin.client.mutation(
      createDocumentVersion,
      secondArgs
    )
    const secondReplay = await admin.client.mutation(
      createDocumentVersion,
      secondArgs
    )
    expect(second).toMatchObject({
      documentId: first.documentId,
      version: 2,
      duplicate: false,
    })
    expect(secondReplay).toEqual({ ...second, duplicate: true })
    await expect(
      admin.client.mutation(createDocumentVersion, {
        ...secondArgs,
        fileName: "fichier-incoherent.pdf",
      })
    ).rejects.toThrow("métadonnées différentes")

    const state = await t.run(async (ctx) => ({
      record: await ctx.db.get(first.documentId),
      versions: await ctx.db
        .query("documentVersions")
        .withIndex("by_document_version", (builder) =>
          builder.eq("documentId", first.documentId)
        )
        .collect(),
      logs: await ctx.db
        .query("auditLogs")
        .withIndex("by_entity", (builder) =>
          builder
            .eq("entityTable", "documentRecords")
            .eq("entityId", first.documentId)
        )
        .collect(),
    }))
    expect(state.record).toMatchObject({
      currentVersion: 2,
      correlationId: "DOC-FRT-001-V1",
    })
    expect(state.versions.map(({ version }) => version)).toEqual([1, 2])
    expect(state.logs).toHaveLength(2)
    expect(state.logs[1]).toMatchObject({
      permission: "modifier",
      classification: "confidentiel",
      correlationId: "DOC-FRT-001-V2",
      result: "succes",
    })
  })

  it("refuse toute incohérence d'entité ou de module", async () => {
    vi.stubEnv("SETRAG_ENV", "test")
    const t = convexTest(schema, modules)
    const admin = await seedUser(
      t,
      "documents-admin-coherence",
      "admin_fonctionnel"
    )
    const firstFile = await storeFile(t, "original")
    const first = await admin.client.mutation(
      createDocumentVersion,
      initialDocumentArgs(firstFile)
    )
    const nextFile = await storeFile(t, "next")

    await expect(
      admin.client.mutation(createDocumentVersion, {
        ...initialDocumentArgs(nextFile, {
          documentId: first.documentId,
          correlationId: "DOC-FRT-001-BAD-ENTITY",
        }),
        entityId: "FRT-999",
      })
    ).rejects.toThrow("ne correspond pas")

    await t.run((ctx) =>
      ctx.db.insert("moduleActivations", {
        moduleCode: "cotraf",
        environment: "test",
        isEnabled: true,
        reason: "Test de cohérence documentaire",
        correlationId: "ACT-COTRAF-DOC",
        changedBy: admin.userId,
        updatedAt: Date.now(),
      })
    )
    await expect(
      admin.client.mutation(createDocumentVersion, {
        ...initialDocumentArgs(nextFile, {
          documentId: first.documentId,
          moduleCode: "cotraf",
          correlationId: "DOC-FRT-001-BAD-MODULE",
        }),
      })
    ).rejects.toThrow("ne correspond pas")
  })

  it("archive logiquement le dossier et conserve toutes ses versions et blobs", async () => {
    vi.stubEnv("SETRAG_ENV", "test")
    const t = convexTest(schema, modules)
    const admin = await seedUser(
      t,
      "documents-admin-archive",
      "admin_fonctionnel"
    )
    const file = await storeFile(t, "archive-moi")
    const created = await admin.client.mutation(
      createDocumentVersion,
      initialDocumentArgs(file)
    )

    await expect(
      admin.client.mutation(archiveDocument, {
        documentId: created.documentId,
        moduleCode: "fret",
        entityType: "freightOrder",
        entityId: "FRT-001",
        reason: "Fin de validité contractuelle",
        correlationId: "ARCHIVE-FRT-001",
      })
    ).resolves.toBe(created.documentId)
    await expect(
      admin.client.mutation(archiveDocument, {
        documentId: created.documentId,
        moduleCode: "fret",
        entityType: "freightOrder",
        entityId: "FRT-001",
        reason: "Motif contradictoire",
        correlationId: "ARCHIVE-FRT-001",
      })
    ).rejects.toThrow("motif différent")
    await expect(
      admin.client.mutation(archiveDocument, {
        documentId: created.documentId,
        moduleCode: "fret",
        entityType: "freightOrder",
        entityId: "FRT-001",
        reason: "Fin de validité contractuelle",
        correlationId: "ARCHIVE-FRT-001",
      })
    ).resolves.toBe(created.documentId)

    const state = await t.run(async (ctx) => ({
      record: await ctx.db.get(created.documentId),
      versions: await ctx.db
        .query("documentVersions")
        .withIndex("by_document_version", (builder) =>
          builder.eq("documentId", created.documentId)
        )
        .collect(),
      blob: await ctx.db.system.get("_storage", file.storageId),
    }))
    expect(state.record?.status).toBe("archive")
    expect(state.versions).toHaveLength(1)
    expect(state.blob?.size).toBe(file.sizeBytes)
    await expect(
      admin.client.mutation(createDocumentVersion, initialDocumentArgs(file))
    ).resolves.toMatchObject({
      documentId: created.documentId,
      version: 1,
      duplicate: true,
    })
    await expect(
      admin.client.mutation(createDocumentVersion, {
        ...initialDocumentArgs(file, {
          documentId: created.documentId,
          correlationId: "DOC-FRT-001-AFTER-ARCHIVE",
        }),
      })
    ).rejects.toThrow("archivé")
    await expect(
      admin.client.query(listEntityDocuments, {
        moduleCode: "fret",
        entityType: "freightOrder",
        entityId: "FRT-001",
      })
    ).resolves.toEqual([])
    const archived = await admin.client.query(listEntityDocuments, {
      moduleCode: "fret",
      entityType: "freightOrder",
      entityId: "FRT-001",
      includeArchived: true,
    })
    expect(archived).toMatchObject([
      { _id: created.documentId, status: "archive", current: { version: 1 } },
    ])
  })

  it("applique permission et activation avant l'émission d'une URL d'upload", async () => {
    vi.stubEnv("SETRAG_ENV", "test")
    const t = convexTest(schema, modules)
    const reader = await seedUser(t, "documents-reader", "responsable_kpi")
    await expect(
      reader.client.mutation(generateUploadUrl, { moduleCode: "fret" })
    ).rejects.toThrow("aucune affectation")

    const admin = await seedUser(
      t,
      "documents-admin-disabled",
      "admin_fonctionnel"
    )
    await t.run((ctx) =>
      ctx.db.insert("moduleActivations", {
        moduleCode: "fret",
        environment: "test",
        isEnabled: false,
        reason: "Maintenance du module",
        correlationId: "DISABLE-FRET-DOC",
        changedBy: admin.userId,
        updatedAt: Date.now(),
      })
    )
    await expect(
      admin.client.mutation(generateUploadUrl, { moduleCode: "fret" })
    ).rejects.toThrow("Module désactivé")
  })

  it("empêche une affectation locale de lire le document d'un autre site", async () => {
    vi.stubEnv("SETRAG_ENV", "test")
    const t = convexTest(schema, modules)
    const admin = await seedUser(t, "documents-site-admin", "admin_fonctionnel")
    const scoped = await seedUser(t, "documents-site-reader", "vendeur_guichet")
    const { siteA, siteB } = await t.run(async (ctx) => {
      const now = Date.now()
      const organizationId = await ctx.db.insert("organizations", {
        code: "DOC-SITES",
        name: "Sites documentaires",
        type: "direction",
        isActive: true,
        createdBy: admin.userId,
        createdAt: now,
        updatedAt: now,
      })
      const siteA = await ctx.db.insert("sites", {
        code: "DOC-A",
        name: "Site documentaire A",
        type: "site",
        organizationId,
        isActive: true,
        createdBy: admin.userId,
        createdAt: now,
        updatedAt: now,
      })
      const siteB = await ctx.db.insert("sites", {
        code: "DOC-B",
        name: "Site documentaire B",
        type: "site",
        organizationId,
        isActive: true,
        createdBy: admin.userId,
        createdAt: now,
        updatedAt: now,
      })
      await ctx.db.insert("userAssignments", {
        userId: scoped.userId,
        role: "admin_fonctionnel",
        siteId: siteA,
        validFrom: now - 1_000,
        isActive: true,
        createdBy: admin.userId,
        createdAt: now,
        updatedAt: now,
      })
      return { siteA, siteB }
    })
    const file = await storeFile(t, "document du site B")
    const created = await admin.client.mutation(
      createDocumentVersion,
      initialDocumentArgs(file, {
        siteId: siteB,
        correlationId: "DOC-SITE-B",
      })
    )

    await expect(
      scoped.client.query(getDocument, {
        documentId: created.documentId,
        moduleCode: "fret",
        siteId: siteA,
      })
    ).rejects.toThrow("site")
    await expect(
      scoped.client.query(listEntityDocuments, {
        moduleCode: "fret",
        entityType: "freightOrder",
        entityId: "FRT-001",
        siteId: siteA,
      })
    ).resolves.toEqual([])
  })

  it("valide taille et empreinte puis restitue des URLs signées côté serveur", async () => {
    vi.stubEnv("SETRAG_ENV", "test")
    const t = convexTest(schema, modules)
    const admin = await seedUser(
      t,
      "documents-admin-validation",
      "admin_fonctionnel"
    )
    const reader = await seedUser(
      t,
      "documents-reader-validation",
      "responsable_kpi"
    )
    const file = await storeFile(t, "contenu lisible")

    await expect(
      admin.client.mutation(createDocumentVersion, {
        ...initialDocumentArgs(file),
        sizeBytes: MAX_DOCUMENT_SIZE_BYTES + 1,
      })
    ).rejects.toThrow("taille")
    await expect(
      admin.client.mutation(createDocumentVersion, {
        ...initialDocumentArgs(file),
        checksumSha256: "pas-un-sha256",
      })
    ).rejects.toThrow("SHA-256")
    await expect(
      admin.client.mutation(createDocumentVersion, {
        ...initialDocumentArgs(file),
        checksumSha256: "f".repeat(64),
      })
    ).rejects.toThrow("ne correspond pas au fichier")
    await expect(
      admin.client.mutation(createDocumentVersion, {
        ...initialDocumentArgs(file),
        mimeType: "text/html",
      })
    ).rejects.toThrow("n'est pas autorisé")

    const created = await admin.client.mutation(
      createDocumentVersion,
      initialDocumentArgs(file)
    )
    const read = await reader.client.query(getDocument, {
      documentId: created.documentId,
      moduleCode: "fret",
      versionLimit: 10,
    })
    expect(read).toMatchObject({
      _id: created.documentId,
      currentVersion: 1,
      versions: [
        {
          version: 1,
          fileName: "bon-transport.pdf",
          mimeType: "application/pdf",
        },
      ],
    })
    expect(read.versions[0].downloadUrl).toMatch(/^https?:\/\//)

    await expect(
      reader.client.query(getDocument, {
        documentId: created.documentId,
        moduleCode: "fret",
        versionLimit: 101,
      })
    ).rejects.toThrow("limite")
  })
})
