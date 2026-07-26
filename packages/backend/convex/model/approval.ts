/**
 * Cycle de validation — logique pure.
 *
 * Le CDC impose le même circuit d'approbation aux livrets horaires (§7.9.1)
 * et aux grilles tarifaires (§7.9.2) : « Valider / Rejeter / Activé /
 * Expiré ». Cette machine à états est donc partagée, ce qui garantit que les
 * deux objets se comportent identiquement.
 *
 * Le point important est qu'un objet ACTIF n'est plus modifiable : c'est ce
 * qui rend un prix ou un horaire opposable. Toute évolution passe par une
 * nouvelle version.
 */

export const APPROVAL_STATUSES = [
  "brouillon",
  "a_valider",
  "actif",
  "rejete",
  "expire",
] as const
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number]

export const APPROVAL_ACTIONS = [
  "soumettre",
  "valider",
  "rejeter",
  "reprendre",
  "expirer",
] as const
export type ApprovalAction = (typeof APPROVAL_ACTIONS)[number]

/** Transitions autorisées. Toute combinaison absente est interdite. */
const TRANSITIONS: Readonly<
  Record<ApprovalStatus, Partial<Record<ApprovalAction, ApprovalStatus>>>
> = {
  brouillon: { soumettre: "a_valider" },
  a_valider: { valider: "actif", rejeter: "rejete" },
  // Un rejet renvoie l'auteur au brouillon pour correction.
  rejete: { reprendre: "brouillon" },
  actif: { expirer: "expire" },
  // Un objet expiré est définitif : il reste consultable pour l'historique.
  expire: {},
}

/** Vrai si l'action est possible depuis l'état courant. */
export function canTransition(
  from: ApprovalStatus,
  action: ApprovalAction,
): boolean {
  return TRANSITIONS[from][action] !== undefined
}

/** État résultant d'une action, ou erreur explicite si elle est interdite. */
export function applyTransition(
  from: ApprovalStatus,
  action: ApprovalAction,
): ApprovalStatus {
  const next = TRANSITIONS[from][action]
  if (next === undefined) {
    const possibles = allowedActions(from)
    throw new Error(
      `Transition impossible : « ${action} » depuis l'état « ${from} ». ` +
        (possibles.length > 0
          ? `Actions possibles : ${possibles.join(", ")}.`
          : `Aucune action n'est possible depuis cet état.`),
    )
  }
  return next
}

/** Actions possibles depuis un état donné. */
export function allowedActions(from: ApprovalStatus): ApprovalAction[] {
  return APPROVAL_ACTIONS.filter((action) => canTransition(from, action))
}

/**
 * Vrai si l'objet est modifiable.
 * Seuls le brouillon et le rejet le sont : dès la soumission, le contenu est
 * gelé pour que le validateur approuve exactement ce qu'il a lu.
 */
export function isEditable(status: ApprovalStatus): boolean {
  return status === "brouillon" || status === "rejete"
}

/** Vrai si l'objet fait foi pour la vente à cet instant. */
export function isEffective(
  status: ApprovalStatus,
  validFrom: number,
  validUntil: number,
  now: number,
): boolean {
  return status === "actif" && now >= validFrom && now <= validUntil
}

/**
 * Vérifie qu'une période de validité est cohérente.
 * Une borne de fin antérieure au début produirait une version jamais
 * applicable, ce qui passerait inaperçu jusqu'à la première vente refusée.
 */
export function assertValidityWindow(
  validFrom: number,
  validUntil: number,
): void {
  if (!Number.isFinite(validFrom) || !Number.isFinite(validUntil)) {
    throw new RangeError(
      `Période de validité invalide : ${validFrom} → ${validUntil}`,
    )
  }
  if (validUntil <= validFrom) {
    throw new Error(
      `Période de validité invalide : la fin doit être postérieure au début`,
    )
  }
}

/**
 * Vrai si deux périodes se chevauchent.
 *
 * Deux livrets horaires actifs sur une même période produiraient des
 * dessertes concurrentes pour le même train : le chevauchement doit être
 * refusé à l'activation.
 */
export function periodsOverlap(
  aFrom: number,
  aUntil: number,
  bFrom: number,
  bUntil: number,
): boolean {
  return aFrom <= bUntil && bFrom <= aUntil
}
