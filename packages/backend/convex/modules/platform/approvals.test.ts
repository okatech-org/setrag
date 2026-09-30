import { makeFunctionReference } from "convex/server"
import { convexTest } from "convex-test"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { Id } from "../../_generated/dataModel"
import type { AppRole } from "../../model/permissions"
import schema from "../../schema"
import { modules } from "../../test.setup"
import {
  canTransitionApprovalInstance,
  resolveApprovalCancellation,
  resolveApprovalDecision,
} from "./approvalModel"

type StepInput = { label: string; assignedUserId?: Id<"users"> }

type RequestArgs = {
  moduleCode: "fret"
  entityType: string
  entityId: string
  siteId?: Id<"sites">
  workflowCode: string
  reason: string
  correlationId: string
  causationId?: string
  steps: StepInput[]
}

const requestApproval = makeFunctionReference<
  "mutation",
  RequestArgs,
  { instanceId: Id<"approvalInstances">; duplicate: boolean }
>("modules/platform/approvals:requestApproval")

const decideApproval = makeFunctionReference<
  "mutation",
  {
    instanceId: Id<"approvalInstances">
    decision: "approuver" | "rejeter"
    comment?: string
    correlationId: string
    causationId?: string
  },
  {
    instanceId: Id<"approvalInstances">
    status: "en_attente" | "approuve" | "rejete"
    currentStep: number
    terminal: boolean
  }
>("modules/platform/approvals:decideApproval")

const cancelApproval = makeFunctionReference<
  "mutation",
  {
    instanceId: Id<"approvalInstances">
    reason: string
    correlationId: string
    causationId?: string
  },
  { instanceId: Id<"approvalInstances">; status: "annule" }
>("modules/platform/approvals:cancelApproval")

const getApproval = makeFunctionReference<
  "query",
  { instanceId: Id<"approvalInstances"> }
>("modules/platform/approvals:getApproval")

const listPending = makeFunctionReference<
  "query",
  { moduleCode: "fret"; siteId?: Id<"sites">; limit?: number }
>("modules/platform/approvals:listPending")

async function seedUser(
  t: ReturnType<typeof convexTest>,
  authId: string,
  role: AppRole = "admin_fonctionnel",
  isActive = true
) {
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", {
      authId,
      role,
      identitySource: "local",
      isActive,
    })
  )
  return { userId, client: t.withIdentity({ subject: authId }) }
}

function requestArgs(
  entityId: string,
  correlationId: string,
  steps: StepInput[],
  siteId?: Id<"sites">
): RequestArgs {
  return {
    moduleCode: "fret",
    entityType: "freightOrder",
    entityId,
    siteId,
    workflowCode: "FREIGHT.ORDER.APPROVAL",
    reason: "Validation opérationnelle de la commande",
    correlationId,
    causationId: `CAUSE-${correlationId}`,
    steps,
  }
}

async function seedSite(
  t: ReturnType<typeof convexTest>,
  actorId: Id<"users">,
  code: string
) {
  return await t.run(async (ctx) => {
    const now = Date.now()
    const organizationId = await ctx.db.insert("organizations", {
      code: `ORG-${code}`,
      name: `Organisation ${code}`,
      type: "direction",
      isActive: true,
      createdBy: actorId,
      createdAt: now,
      updatedAt: now,
    })
    const siteId = await ctx.db.insert("sites", {
      code,
      name: `Site ${code}`,
      type: "gare",
      organizationId,
      isActive: true,
      createdBy: actorId,
      createdAt: now,
      updatedAt: now,
    })
    return siteId
  })
}

async function assignAtSite(
  t: ReturnType<typeof convexTest>,
  params: {
    userId: Id<"users">
    siteId: Id<"sites">
    createdBy: Id<"users">
  }
) {
  return await t.run((ctx) => {
    const now = Date.now()
    return ctx.db.insert("userAssignments", {
      userId: params.userId,
      role: "admin_fonctionnel",
      siteId: params.siteId,
      validFrom: now - 1_000,
      isActive: true,
      createdBy: params.createdBy,
      createdAt: now,
      updatedAt: now,
    })
  })
}

describe("Machine d'état des approbations", () => {
  it("n'autorise que les sorties terminales prévues", () => {
    expect(canTransitionApprovalInstance("en_attente", "approuve")).toBe(true)
    expect(canTransitionApprovalInstance("approuve", "annule")).toBe(false)
    expect(
      resolveApprovalDecision({
        status: "en_attente",
        currentStep: 1,
        totalSteps: 2,
        decision: "approuver",
      })
    ).toEqual({
      stepStatus: "approuve",
      instanceStatus: "en_attente",
      currentStep: 2,
      terminal: false,
      ignoreRemaining: false,
    })
    expect(
      resolveApprovalDecision({
        status: "en_attente",
        currentStep: 2,
        totalSteps: 2,
        decision: "rejeter",
      })
    ).toMatchObject({
      instanceStatus: "rejete",
      terminal: true,
      ignoreRemaining: true,
    })
    expect(() => resolveApprovalCancellation("approuve")).toThrow(
      "Seule une approbation en attente"
    )
  })
})

describe("Workflow d'approbation plateforme", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("exécute deux étapes dans l'ordre, déduplique et notifie au terminal", async () => {
    const t = convexTest(schema, modules)
    const requester = await seedUser(t, "approval-requester")
    const approverOne = await seedUser(t, "approval-approver-one")
    const approverTwo = await seedUser(t, "approval-approver-two")
    const args = requestArgs("ORDER-001", "APPROVAL-001", [
      { label: "Validation exploitation", assignedUserId: approverOne.userId },
      { label: "Validation direction", assignedUserId: approverTwo.userId },
    ])

    const created = await requester.client.mutation(requestApproval, args)
    expect(created.duplicate).toBe(false)
    await expect(
      requester.client.mutation(requestApproval, args)
    ).resolves.toEqual({ instanceId: created.instanceId, duplicate: true })
    await expect(
      requester.client.mutation(requestApproval, {
        ...args,
        entityId: "ORDER-COLLISION",
      })
    ).rejects.toThrow("Collision de corrélation")
    await expect(
      requester.client.mutation(requestApproval, {
        ...args,
        steps: [{ label: "Étape modifiée" }],
      })
    ).rejects.toThrow("Collision de corrélation")
    await expect(
      requester.client.mutation(requestApproval, {
        ...args,
        correlationId: "APPROVAL-OTHER",
      })
    ).rejects.toThrow("déjà en attente")
    await expect(
      requester.client.mutation(decideApproval, {
        instanceId: created.instanceId,
        decision: "approuver",
        correlationId: "DECISION-SELF",
      })
    ).rejects.toThrow("propre approbation")

    const firstDecision = await approverOne.client.mutation(decideApproval, {
      instanceId: created.instanceId,
      decision: "approuver",
      comment: "Conforme aux capacités",
      correlationId: "DECISION-001",
    })
    expect(firstDecision).toMatchObject({
      status: "en_attente",
      currentStep: 2,
      terminal: false,
      duplicate: false,
    })
    await expect(
      approverOne.client.mutation(decideApproval, {
        instanceId: created.instanceId,
        decision: "approuver",
        comment: "Conforme aux capacités",
        correlationId: "DECISION-001",
      })
    ).resolves.toMatchObject({
      status: "en_attente",
      currentStep: 2,
      terminal: false,
      duplicate: true,
    })
    await expect(
      approverOne.client.mutation(decideApproval, {
        instanceId: created.instanceId,
        decision: "approuver",
        comment: "Commentaire contradictoire",
        correlationId: "DECISION-001",
      })
    ).rejects.toThrow("Collision de corrélation")
    expect(
      await t.run((ctx) => ctx.db.query("notifications").collect())
    ).toHaveLength(0)

    const pending = await approverTwo.client.query(listPending, {
      moduleCode: "fret",
      limit: 10,
    })
    expect(pending).toHaveLength(1)
    expect(pending[0]).toMatchObject({
      _id: created.instanceId,
      currentStep: 2,
      step: { sequence: 2, assignedUserId: approverTwo.userId },
    })

    await expect(
      approverTwo.client.mutation(decideApproval, {
        instanceId: created.instanceId,
        decision: "approuver",
        correlationId: "DECISION-002",
      })
    ).resolves.toMatchObject({ status: "approuve", terminal: true })

    const approval = await requester.client.query(getApproval, {
      instanceId: created.instanceId,
    })
    expect(approval).toMatchObject({
      status: "approuve",
      currentStep: 2,
      steps: [{ status: "approuve" }, { status: "approuve" }],
    })
    const state = await t.run(async (ctx) => ({
      notifications: await ctx.db.query("notifications").collect(),
      audits: await ctx.db.query("auditLogs").collect(),
    }))
    expect(state.notifications).toHaveLength(1)
    expect(state.notifications[0]).toMatchObject({
      userId: requester.userId,
      channel: "in_app",
      title: "Demande approuvée",
    })
    expect(state.audits).toHaveLength(3)
    expect(state.audits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          permission: "modifier",
          correlationId: "APPROVAL-001",
          causationId: "CAUSE-APPROVAL-001",
          classification: "interne",
          result: "succes",
        }),
        expect.objectContaining({
          permission: "valider",
          correlationId: "DECISION-002",
          causationId: "APPROVAL-001",
        }),
      ])
    )
  })

  it("respecte l'affectation nominative et exige un motif de rejet", async () => {
    const t = convexTest(schema, modules)
    const requester = await seedUser(t, "approval-reject-requester")
    const assigned = await seedUser(t, "approval-reject-assigned")
    const other = await seedUser(t, "approval-reject-other")
    const { instanceId } = await requester.client.mutation(
      requestApproval,
      requestArgs("ORDER-REJECT", "APPROVAL-REJECT", [
        { label: "Contrôle commercial", assignedUserId: assigned.userId },
        { label: "Contrôle financier" },
        { label: "Direction" },
      ])
    )

    await expect(
      other.client.mutation(decideApproval, {
        instanceId,
        decision: "approuver",
        correlationId: "WRONG-ASSIGNEE",
      })
    ).rejects.toThrow("autre approbateur")
    await expect(
      assigned.client.mutation(decideApproval, {
        instanceId,
        decision: "rejeter",
        correlationId: "REJECT-NO-COMMENT",
      })
    ).rejects.toThrow("commentaire est obligatoire")
    await assigned.client.mutation(decideApproval, {
      instanceId,
      decision: "rejeter",
      comment: "Pièces contractuelles incomplètes",
      correlationId: "REJECT-001",
    })

    const state = await t.run(async (ctx) => ({
      instance: await ctx.db.get(instanceId),
      steps: await ctx.db
        .query("approvalSteps")
        .withIndex("by_instance_sequence", (builder) =>
          builder.eq("instanceId", instanceId)
        )
        .order("asc")
        .collect(),
      notifications: await ctx.db.query("notifications").collect(),
    }))
    expect(state.instance?.status).toBe("rejete")
    expect(state.steps.map((step) => step.status)).toEqual([
      "rejete",
      "ignore",
      "ignore",
    ])
    expect(state.notifications[0]).toMatchObject({
      userId: requester.userId,
      title: "Demande d'approbation rejetée",
    })
    await expect(
      other.client.mutation(decideApproval, {
        instanceId,
        decision: "approuver",
        correlationId: "AFTER-TERMINAL",
      })
    ).rejects.toThrow("déjà terminée")
  })

  it("borne la décision au site de l'affectation effective", async () => {
    vi.stubEnv("SETRAG_ENV", "test")
    const t = convexTest(schema, modules)
    const requester = await seedUser(
      t,
      "approval-scoped-requester",
      "vendeur_guichet"
    )
    const approver = await seedUser(
      t,
      "approval-scoped-approver",
      "vendeur_guichet"
    )
    const wrongSiteApprover = await seedUser(
      t,
      "approval-wrong-site",
      "vendeur_guichet"
    )
    const siteA = await seedSite(t, requester.userId, "OWE")
    const siteB = await seedSite(t, requester.userId, "NTO")
    const requesterAssignmentId = await assignAtSite(t, {
      userId: requester.userId,
      siteId: siteA,
      createdBy: requester.userId,
    })
    const decisionAssignmentId = await assignAtSite(t, {
      userId: approver.userId,
      siteId: siteA,
      createdBy: requester.userId,
    })
    await assignAtSite(t, {
      userId: wrongSiteApprover.userId,
      siteId: siteB,
      createdBy: requester.userId,
    })
    const { instanceId } = await requester.client.mutation(
      requestApproval,
      requestArgs(
        "ORDER-SITE",
        "APPROVAL-SITE",
        [{ label: "Validation locale" }],
        siteA
      )
    )

    await expect(
      wrongSiteApprover.client.mutation(decideApproval, {
        instanceId,
        decision: "approuver",
        correlationId: "WRONG-SITE",
      })
    ).rejects.toThrow("aucune affectation")
    await expect(
      approver.client.query(listPending, {
        moduleCode: "fret",
      })
    ).resolves.toHaveLength(1)
    await approver.client.mutation(decideApproval, {
      instanceId,
      decision: "approuver",
      correlationId: "RIGHT-SITE",
    })

    const state = await t.run(async (ctx) => ({
      instance: await ctx.db.get(instanceId),
      step: await ctx.db
        .query("approvalSteps")
        .withIndex("by_instance_sequence", (builder) =>
          builder.eq("instanceId", instanceId).eq("sequence", 1)
        )
        .unique(),
    }))
    expect(state.instance?.requesterAssignmentId).toBe(requesterAssignmentId)
    expect(state.step?.decisionAssignmentId).toBe(decisionAssignmentId)
  })

  it("autorise le demandeur ou un administrateur à annuler un circuit en attente", async () => {
    const t = convexTest(schema, modules)
    const requester = await seedUser(t, "approval-cancel-requester")
    const administrator = await seedUser(t, "approval-cancel-admin")
    const { instanceId } = await requester.client.mutation(
      requestApproval,
      requestArgs("ORDER-CANCEL", "APPROVAL-CANCEL", [
        { label: "Étape une" },
        { label: "Étape deux" },
      ])
    )

    await expect(
      administrator.client.mutation(cancelApproval, {
        instanceId,
        reason: "Annulation administrative justifiée",
        correlationId: "CANCEL-ADMIN",
      })
    ).resolves.toEqual({ instanceId, status: "annule", duplicate: false })

    const requesterFlow = await requester.client.mutation(
      requestApproval,
      requestArgs("ORDER-CANCEL-REQUESTER", "APPROVAL-CANCEL-REQUESTER", [
        { label: "Étape une" },
        { label: "Étape deux" },
      ])
    )
    await expect(
      requester.client.mutation(cancelApproval, {
        instanceId: requesterFlow.instanceId,
        reason: "Commande retirée par le client",
        correlationId: "CANCEL-001",
      })
    ).resolves.toEqual({
      instanceId: requesterFlow.instanceId,
      status: "annule",
      duplicate: false,
    })
    await expect(
      requester.client.mutation(cancelApproval, {
        instanceId: requesterFlow.instanceId,
        reason: "Commande retirée par le client",
        correlationId: "CANCEL-001",
      })
    ).resolves.toEqual({
      instanceId: requesterFlow.instanceId,
      status: "annule",
      duplicate: true,
    })

    const state = await t.run(async (ctx) => ({
      instance: await ctx.db.get(requesterFlow.instanceId),
      steps: await ctx.db
        .query("approvalSteps")
        .withIndex("by_instance_sequence", (builder) =>
          builder.eq("instanceId", requesterFlow.instanceId)
        )
        .collect(),
      audits: await ctx.db
        .query("auditLogs")
        .withIndex("by_action", (builder) =>
          builder.eq("action", "plateforme.approbation.annuler")
        )
        .collect(),
    }))
    expect(state.instance?.status).toBe("annule")
    expect(state.steps.every((step) => step.status === "ignore")).toBe(true)
    expect(state.audits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          permission: "modifier",
          reason: "Annulation administrative justifiée",
          correlationId: "CANCEL-ADMIN",
          classification: "interne",
          result: "succes",
        }),
        expect.objectContaining({
          permission: "modifier",
          reason: "Commande retirée par le client",
          correlationId: "CANCEL-001",
          classification: "interne",
          result: "succes",
        }),
      ])
    )
    await expect(
      requester.client.mutation(cancelApproval, {
        instanceId: requesterFlow.instanceId,
        reason: "Deuxième annulation",
        correlationId: "CANCEL-002",
      })
    ).rejects.toThrow("Seule une approbation en attente")
  })

  it("refuse permissions insuffisantes, module désactivé et approbateur inactif", async () => {
    vi.stubEnv("SETRAG_ENV", "test")
    const t = convexTest(schema, modules)
    const reader = await seedUser(t, "approval-reader", "responsable_kpi")
    const requester = await seedUser(t, "approval-disabled-requester")
    const inactive = await seedUser(
      t,
      "approval-inactive-assignee",
      "admin_fonctionnel",
      false
    )

    await expect(
      reader.client.mutation(
        requestApproval,
        requestArgs("ORDER-NO-RIGHT", "APPROVAL-NO-RIGHT", [
          { label: "Validation" },
        ])
      )
    ).rejects.toThrow("aucune affectation")
    await expect(
      requester.client.mutation(
        requestApproval,
        requestArgs("ORDER-INACTIVE", "APPROVAL-INACTIVE", [
          { label: "Validation", assignedUserId: inactive.userId },
        ])
      )
    ).rejects.toThrow("introuvable ou inactif")

    await t.run((ctx) =>
      ctx.db.insert("moduleActivations", {
        moduleCode: "fret",
        environment: "test",
        isEnabled: false,
        reason: "Maintenance",
        correlationId: "DISABLE-FRET",
        changedBy: requester.userId,
        updatedAt: Date.now(),
      })
    )
    await expect(
      requester.client.mutation(
        requestApproval,
        requestArgs("ORDER-DISABLED", "APPROVAL-DISABLED", [
          { label: "Validation" },
        ])
      )
    ).rejects.toThrow("Module désactivé")
  })
})
