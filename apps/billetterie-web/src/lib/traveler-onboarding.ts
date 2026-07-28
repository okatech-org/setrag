export type PendingTravelerOnboarding = {
  firstName: string
  lastName: string
  phone: string
  identifier: string
  createdAt: number
}

const STORAGE_KEY = "setrag:traveler-onboarding"
const MAX_AGE_MS = 30 * 60_000

export function savePendingTravelerOnboarding(
  value: Omit<PendingTravelerOnboarding, "createdAt">
) {
  if (typeof window === "undefined") return
  window.sessionStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ ...value, createdAt: Date.now() })
  )
}

export function readPendingTravelerOnboarding() {
  if (typeof window === "undefined") return undefined
  const raw = window.sessionStorage.getItem(STORAGE_KEY)
  if (!raw) return undefined
  try {
    const value = JSON.parse(raw) as PendingTravelerOnboarding
    if (
      !value.firstName?.trim() ||
      !value.lastName?.trim() ||
      !value.phone?.trim() ||
      !value.identifier?.trim() ||
      !Number.isFinite(value.createdAt) ||
      Date.now() - value.createdAt > MAX_AGE_MS
    ) {
      clearPendingTravelerOnboarding()
      return undefined
    }
    return value
  } catch {
    clearPendingTravelerOnboarding()
    return undefined
  }
}

export function clearPendingTravelerOnboarding() {
  if (typeof window !== "undefined") {
    window.sessionStorage.removeItem(STORAGE_KEY)
  }
}
