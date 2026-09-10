export const APPROVAL_INSTANCE_TRANSITIONS = {
  en_attente: ["approuve", "rejete", "annule"],
  approuve: [],
  rejete: [],
  annule: [],
} as const

export type ApprovalInstanceStatus = keyof typeof APPROVAL_INSTANCE_TRANSITIONS
export type ApprovalDecision = "approuver" | "rejeter"
export type ApprovalStepStatus = "en_attente" | "approuve" | "rejete" | "ignore"

export interface ApprovalDecisionTransition {
  readonly stepStatus: Extract<ApprovalStepStatus, "approuve" | "rejete">
  readonly instanceStatus: ApprovalInstanceStatus
  readonly currentStep: number
  readonly terminal: boolean
  readonly ignoreRemaining: boolean
}

export function canTransitionApprovalInstance(
  from: ApprovalInstanceStatus,
  to: ApprovalInstanceStatus
): boolean {
  return (APPROVAL_INSTANCE_TRANSITIONS[from] as readonly string[]).includes(to)
}

function assertStepRange(currentStep: number, totalSteps: number): void {
  if (
    !Number.isInteger(currentStep) ||
    !Number.isInteger(totalSteps) ||
    totalSteps < 1 ||
    currentStep < 1 ||
    currentStep > totalSteps
  ) {
    throw new Error("Position d'étape d'approbation invalide.")
  }
}

/** Calcule la seule transition autorisée depuis l'étape courante. */
export function resolveApprovalDecision(input: {
  readonly status: ApprovalInstanceStatus
  readonly currentStep: number
  readonly totalSteps: number
  readonly decision: ApprovalDecision
}): ApprovalDecisionTransition {
  if (input.status !== "en_attente") {
    throw new Error("Cette approbation est déjà terminée.")
  }
  assertStepRange(input.currentStep, input.totalSteps)

  if (input.decision === "rejeter") {
    if (!canTransitionApprovalInstance(input.status, "rejete")) {
      throw new Error("Transition d'approbation invalide.")
    }
    return {
      stepStatus: "rejete",
      instanceStatus: "rejete",
      currentStep: input.currentStep,
      terminal: true,
      ignoreRemaining: true,
    }
  }

  const terminal = input.currentStep === input.totalSteps
  const instanceStatus = terminal ? "approuve" : "en_attente"
  if (
    terminal &&
    !canTransitionApprovalInstance(input.status, instanceStatus)
  ) {
    throw new Error("Transition d'approbation invalide.")
  }
  return {
    stepStatus: "approuve",
    instanceStatus,
    currentStep: terminal ? input.currentStep : input.currentStep + 1,
    terminal,
    ignoreRemaining: false,
  }
}

/** Valide la transition d'annulation d'une demande encore ouverte. */
export function resolveApprovalCancellation(
  status: ApprovalInstanceStatus
): Extract<ApprovalInstanceStatus, "annule"> {
  if (!canTransitionApprovalInstance(status, "annule")) {
    throw new Error("Seule une approbation en attente peut être annulée.")
  }
  return "annule"
}
