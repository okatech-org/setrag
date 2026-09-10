import { v } from "convex/values"

import { mutation, query } from "../../_generated/server"
import type { Doc, Id } from "../../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../../_generated/server"
import { audit } from "../../lib/auth"
import { moduleManifestEntry, type ModuleCode } from "./catalog"
import {
  boundedDocumentLimit,
  MAX_DOCUMENT_SIZE_BYTES,
  MAX_DOCUMENT_VERSIONS_PER_READ,
  MAX_DOCUMENTS_PER_LIST,
  normalizedEntityId,
  normalizedEntityType,
  normalizedFileName,
  normalizedMimeType,
  normalizedSha256,
  normalizedStoredSha256,
  requiredDocumentText,
  validDocumentSize,
} from "./documentModel"
import { assertCan } from "./model"
import { moduleCodeValidator } from "./validators"

const classificationValidator = v.union(
  v.literal("public"),
  v.literal("interne"),
  v.literal("confidentiel"),
  v.literal("restreint")
)

type DocumentClassification = Doc<"documentRecords">["classification"]
type DatabaseCtx = MutationCtx | QueryCtx

function normalizedCorrelationId(value: string): string {
  return requiredDocumentText(value, "L'identifiant de corrélation", 120)
}

function normalizedReason(value: string): string {
  return requiredDocumentText(value, "Le motif", 500)
}

async function authorize(
  ctx: DatabaseCtx,
  input: {
    moduleCode: ModuleCode
    permission: "consulter" | "creer" | "modifier"
    siteId?: Id<"sites">
  }
) {
  const module = moduleManifestEntry(input.moduleCode)
  return await assertCan(ctx, {
    moduleCode: input.moduleCode,
    resource: module.resource,
    permission: input.permission,
    siteId: input.siteId,
  })
}

function assertRecordIdentity(
  record: Doc<"documentRecords">,
  input: {
    moduleCode: ModuleCode
    entityType: string
    entityId: string
  }
): void {
  if (
    record.moduleCode !== input.moduleCode ||
    record.entityType !== input.entityType ||
    record.entityId !== input.entityId
  ) {
    throw new Error(
      "Le document ne correspond pas au module ou à l'entité demandée."
    )
  }
}

function assertRecordSite(
  record: Doc<"documentRecords">,
  siteId: Id<"sites"> | undefined,
  hasGlobalScope: boolean
): void {
  if (!hasGlobalScope && record.siteId !== siteId) {
    throw new Error("Le document n'appartient pas au site autorisé.")
  }
  if (siteId !== undefined && record.siteId !== siteId) {
    throw new Error("Le document ne correspond pas au site demandé.")
  }
}

async function assertStoredFile(
  ctx: MutationCtx,
  input: {
    storageId: Id<"_storage">
    mimeType: string
    sizeBytes: number
    checksumSha256?: string
  }
): Promise<string> {
  const metadata = await ctx.db.system.get("_storage", input.storageId)
  if (!metadata) throw new Error("Le fichier stocké est introuvable.")
  if (metadata.size !== input.sizeBytes) {
    throw new Error("La taille déclarée ne correspond pas au fichier stocké.")
  }
  if (metadata.size > MAX_DOCUMENT_SIZE_BYTES) {
    throw new Error("Le fichier stocké dépasse la taille maximale de 25 Mio.")
  }
  if (
    metadata.contentType !== undefined &&
    metadata.contentType.toLowerCase() !== input.mimeType
  ) {
    throw new Error("Le type MIME déclaré ne correspond pas au fichier stocké.")
  }
  const checksumSha256 = normalizedStoredSha256(metadata.sha256)
  if (
    input.checksumSha256 !== undefined &&
    input.checksumSha256 !== checksumSha256
  ) {
    throw new Error(
      "L'empreinte SHA-256 déclarée ne correspond pas au fichier stocké."
    )
  }
  return checksumSha256
}

function sameVersionPayload(
  existing: Doc<"documentVersions">,
  input: {
    storageId: Id<"_storage">
    fileName: string
    mimeType: string
    sizeBytes: number
    checksumSha256?: string
  }
): boolean {
  return (
    existing.storageId === input.storageId &&
    existing.fileName === input.fileName &&
    existing.mimeType === input.mimeType &&
    existing.sizeBytes === input.sizeBytes &&
    existing.checksumSha256 === input.checksumSha256
  )
}

async function versionWithUrl(ctx: QueryCtx, version: Doc<"documentVersions">) {
  return {
    ...version,
    downloadUrl: await ctx.storage.getUrl(version.storageId),
  }
}

export const generateDocumentUploadUrl = mutation({
  args: {
    moduleCode: moduleCodeValidator,
    siteId: v.optional(v.id("sites")),
  },
  handler: async (ctx, args) => {
    await authorize(ctx, {
      moduleCode: args.moduleCode,
      permission: "creer",
      siteId: args.siteId,
    })
    return await ctx.storage.generateUploadUrl()
  },
})

/**
 * Crée un dossier documentaire ou ajoute une version immuable. Une reprise
 * avec la même corrélation et le même dossier est idempotente.
 */
export const createDocumentVersion = mutation({
  args: {
    documentId: v.optional(v.id("documentRecords")),
    moduleCode: moduleCodeValidator,
    entityType: v.string(),
    entityId: v.string(),
    title: v.optional(v.string()),
    classification: v.optional(classificationValidator),
    storageId: v.id("_storage"),
    fileName: v.string(),
    mimeType: v.string(),
    sizeBytes: v.number(),
    checksumSha256: v.optional(v.string()),
    siteId: v.optional(v.id("sites")),
    reason: v.string(),
    correlationId: v.string(),
  },
  handler: async (ctx, args) => {
    const entityType = normalizedEntityType(args.entityType)
    const entityId = normalizedEntityId(args.entityId)
    const fileName = normalizedFileName(args.fileName)
    const mimeType = normalizedMimeType(args.mimeType)
    const sizeBytes = validDocumentSize(args.sizeBytes)
    const declaredChecksumSha256 = normalizedSha256(args.checksumSha256)
    const reason = normalizedReason(args.reason)
    const correlationId = normalizedCorrelationId(args.correlationId)
    const permission = args.documentId ? "modifier" : "creer"
    const access = await authorize(ctx, {
      moduleCode: args.moduleCode,
      permission,
      siteId: args.siteId,
    })
    const checksumSha256 = await assertStoredFile(ctx, {
      storageId: args.storageId,
      mimeType,
      sizeBytes,
      checksumSha256: declaredChecksumSha256,
    })
    const existing = args.documentId ? await ctx.db.get(args.documentId) : null
    if (args.documentId && !existing) {
      throw new Error("Document introuvable.")
    }
    const requestedTitle = existing
      ? args.title === undefined
        ? existing.title
        : requiredDocumentText(args.title, "Le titre", 200)
      : requiredDocumentText(args.title ?? "", "Le titre", 200)
    const requestedClassification: DocumentClassification = existing
      ? (args.classification ?? existing.classification)
      : (args.classification ??
        (() => {
          throw new Error("La classification est obligatoire.")
        })())
    if (existing) {
      assertRecordIdentity(existing, {
        moduleCode: args.moduleCode,
        entityType,
        entityId,
      })
      assertRecordSite(existing, args.siteId, access.hasGlobalScope)
      if (args.title !== undefined && requestedTitle !== existing.title) {
        throw new Error("Le titre du dossier documentaire est incohérent.")
      }
      if (
        args.classification !== undefined &&
        args.classification !== existing.classification
      ) {
        throw new Error("La classification du dossier est incohérente.")
      }

      const replay = await ctx.db
        .query("documentVersions")
        .withIndex("by_document_correlation", (builder) =>
          builder
            .eq("documentId", existing._id)
            .eq("correlationId", correlationId)
        )
        .unique()
      if (replay) {
        if (
          !sameVersionPayload(replay, {
            storageId: args.storageId,
            fileName,
            mimeType,
            sizeBytes,
            checksumSha256,
          })
        ) {
          throw new Error(
            "Cette corrélation désigne déjà une version avec des métadonnées différentes."
          )
        }
        return {
          documentId: existing._id,
          versionId: replay._id,
          version: replay.version,
          duplicate: true,
        }
      }
      if (existing.status !== "actif") {
        throw new Error("Un document archivé ne peut pas recevoir de version.")
      }
    } else {
      const replayedDocument = await ctx.db
        .query("documentRecords")
        .withIndex("by_correlation", (builder) =>
          builder.eq("correlationId", correlationId)
        )
        .unique()
      if (replayedDocument) {
        assertRecordIdentity(replayedDocument, {
          moduleCode: args.moduleCode,
          entityType,
          entityId,
        })
        assertRecordSite(replayedDocument, args.siteId, access.hasGlobalScope)
        if (
          replayedDocument.siteId !== args.siteId ||
          replayedDocument.title !== requestedTitle ||
          replayedDocument.classification !== requestedClassification
        ) {
          throw new Error(
            "Cette corrélation désigne déjà un document avec des métadonnées différentes."
          )
        }
        const replayedVersion = await ctx.db
          .query("documentVersions")
          .withIndex("by_document_correlation", (builder) =>
            builder
              .eq("documentId", replayedDocument._id)
              .eq("correlationId", correlationId)
          )
          .unique()
        if (
          !replayedVersion ||
          !sameVersionPayload(replayedVersion, {
            storageId: args.storageId,
            fileName,
            mimeType,
            sizeBytes,
            checksumSha256,
          })
        ) {
          throw new Error(
            "Cette corrélation désigne déjà un document avec un fichier différent."
          )
        }
        return {
          documentId: replayedDocument._id,
          versionId: replayedVersion._id,
          version: replayedVersion.version,
          duplicate: true,
        }
      }
    }

    const now = Date.now()
    const title = existing ? existing.title : requestedTitle
    const classification = existing
      ? existing.classification
      : requestedClassification
    const documentId = existing
      ? existing._id
      : await ctx.db.insert("documentRecords", {
          moduleCode: args.moduleCode,
          entityType,
          entityId,
          siteId: args.siteId,
          title,
          classification,
          status: "actif",
          currentVersion: 1,
          correlationId,
          createdBy: access.user._id,
          updatedBy: access.user._id,
          createdAt: now,
          updatedAt: now,
        })
    const version = existing ? existing.currentVersion + 1 : 1
    const versionId = await ctx.db.insert("documentVersions", {
      documentId,
      version,
      storageId: args.storageId,
      fileName,
      mimeType,
      sizeBytes,
      checksumSha256,
      correlationId,
      createdBy: access.user._id,
      createdAt: now,
    })
    if (existing) {
      await ctx.db.patch(existing._id, {
        currentVersion: version,
        updatedBy: access.user._id,
        updatedAt: now,
      })
    }

    await audit(ctx, {
      actorId: access.user._id,
      action: existing
        ? "plateforme.document.version.creer"
        : "plateforme.document.creer",
      entityTable: "documentRecords",
      entityId: documentId,
      permission,
      reason,
      correlationId,
      classification,
      before: existing
        ? {
            status: existing.status,
            currentVersion: existing.currentVersion,
            updatedAt: existing.updatedAt,
          }
        : undefined,
      after: {
        status: "actif",
        currentVersion: version,
        updatedAt: now,
      },
      metadata: {
        moduleCode: args.moduleCode,
        entityType,
        entityId,
        versionId,
        fileName,
        mimeType,
        sizeBytes,
        checksumSha256,
      },
      context: {
        permissionSource: access.permissionSource,
        activationSource: access.activationSource,
        siteId: args.siteId,
      },
    })

    return { documentId, versionId, version, duplicate: false }
  },
})

export const archiveDocument = mutation({
  args: {
    documentId: v.id("documentRecords"),
    moduleCode: moduleCodeValidator,
    entityType: v.string(),
    entityId: v.string(),
    siteId: v.optional(v.id("sites")),
    reason: v.string(),
    correlationId: v.string(),
  },
  handler: async (ctx, args) => {
    const entityType = normalizedEntityType(args.entityType)
    const entityId = normalizedEntityId(args.entityId)
    const reason = normalizedReason(args.reason)
    const correlationId = normalizedCorrelationId(args.correlationId)
    const access = await authorize(ctx, {
      moduleCode: args.moduleCode,
      permission: "modifier",
      siteId: args.siteId,
    })
    const document = await ctx.db.get(args.documentId)
    if (!document) throw new Error("Document introuvable.")
    assertRecordIdentity(document, {
      moduleCode: args.moduleCode,
      entityType,
      entityId,
    })
    assertRecordSite(document, args.siteId, access.hasGlobalScope)
    if (document.status !== "actif") {
      if (document.archiveCorrelationId === correlationId) {
        const replayAudit = (
          await ctx.db
            .query("auditLogs")
            .withIndex("by_correlation", (builder) =>
              builder.eq("correlationId", correlationId)
            )
            .collect()
        ).find(
          (log) =>
            log.entityTable === "documentRecords" &&
            log.entityId === document._id &&
            log.action === "plateforme.document.archiver"
        )
        if (!replayAudit || replayAudit.reason !== reason) {
          throw new Error(
            "Cette corrélation désigne un archivage avec un motif différent."
          )
        }
        return document._id
      }
      throw new Error("Le document est déjà archivé.")
    }

    const now = Date.now()
    await ctx.db.patch(document._id, {
      status: "archive",
      archiveCorrelationId: correlationId,
      updatedBy: access.user._id,
      updatedAt: now,
    })
    await audit(ctx, {
      actorId: access.user._id,
      action: "plateforme.document.archiver",
      entityTable: "documentRecords",
      entityId: document._id,
      permission: "modifier",
      reason,
      correlationId,
      classification: document.classification,
      before: { status: document.status, updatedAt: document.updatedAt },
      after: { status: "archive", updatedAt: now },
      metadata: {
        moduleCode: document.moduleCode,
        entityType: document.entityType,
        entityId: document.entityId,
        currentVersion: document.currentVersion,
      },
      context: {
        permissionSource: access.permissionSource,
        activationSource: access.activationSource,
        siteId: args.siteId,
      },
    })
    return document._id
  },
})

export const listEntityDocuments = query({
  args: {
    moduleCode: moduleCodeValidator,
    entityType: v.string(),
    entityId: v.string(),
    siteId: v.optional(v.id("sites")),
    includeArchived: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const entityType = normalizedEntityType(args.entityType)
    const entityId = normalizedEntityId(args.entityId)
    const limit = boundedDocumentLimit(args.limit, MAX_DOCUMENTS_PER_LIST, 50)
    const access = await authorize(ctx, {
      moduleCode: args.moduleCode,
      permission: "consulter",
      siteId: args.siteId,
    })
    const siteId = args.siteId
    if (!access.hasGlobalScope && siteId === undefined) {
      throw new Error("Précisez un site pour consulter les documents.")
    }
    const records = siteId
      ? args.includeArchived
        ? await ctx.db
            .query("documentRecords")
            .withIndex("by_entity_site", (builder) =>
              builder
                .eq("moduleCode", args.moduleCode)
                .eq("entityType", entityType)
                .eq("entityId", entityId)
                .eq("siteId", siteId)
            )
            .order("desc")
            .take(limit)
        : await ctx.db
            .query("documentRecords")
            .withIndex("by_entity_site_status", (builder) =>
              builder
                .eq("moduleCode", args.moduleCode)
                .eq("entityType", entityType)
                .eq("entityId", entityId)
                .eq("siteId", siteId)
                .eq("status", "actif")
            )
            .order("desc")
            .take(limit)
      : args.includeArchived
        ? await ctx.db
            .query("documentRecords")
            .withIndex("by_entity", (builder) =>
              builder
                .eq("moduleCode", args.moduleCode)
                .eq("entityType", entityType)
                .eq("entityId", entityId)
            )
            .order("desc")
            .take(limit)
        : await ctx.db
            .query("documentRecords")
            .withIndex("by_entity_status", (builder) =>
              builder
                .eq("moduleCode", args.moduleCode)
                .eq("entityType", entityType)
                .eq("entityId", entityId)
                .eq("status", "actif")
            )
            .order("desc")
            .take(limit)
    const selected = records

    return await Promise.all(
      selected.map(async (record) => {
        const version = await ctx.db
          .query("documentVersions")
          .withIndex("by_document_version", (builder) =>
            builder
              .eq("documentId", record._id)
              .eq("version", record.currentVersion)
          )
          .unique()
        return {
          ...record,
          current: version ? await versionWithUrl(ctx, version) : null,
        }
      })
    )
  },
})

export const getDocument = query({
  args: {
    documentId: v.id("documentRecords"),
    moduleCode: moduleCodeValidator,
    siteId: v.optional(v.id("sites")),
    versionLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const versionLimit = boundedDocumentLimit(
      args.versionLimit,
      MAX_DOCUMENT_VERSIONS_PER_READ,
      50
    )
    const access = await authorize(ctx, {
      moduleCode: args.moduleCode,
      permission: "consulter",
      siteId: args.siteId,
    })
    const document = await ctx.db.get(args.documentId)
    if (!document || document.moduleCode !== args.moduleCode) {
      throw new Error("Document introuvable.")
    }
    assertRecordSite(document, args.siteId, access.hasGlobalScope)
    const versions = await ctx.db
      .query("documentVersions")
      .withIndex("by_document_version", (builder) =>
        builder.eq("documentId", document._id)
      )
      .order("desc")
      .take(versionLimit)
    return {
      ...document,
      versions: await Promise.all(
        versions.map((version) => versionWithUrl(ctx, version))
      ),
    }
  },
})
