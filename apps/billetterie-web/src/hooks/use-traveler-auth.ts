"use client"

import { useEffect, useRef } from "react"

import { useAuth, useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"

import {
  clearPendingTravelerOnboarding,
  readPendingTravelerOnboarding,
} from "@/lib/traveler-onboarding"
import { IS_E2E } from "@/lib/ticketing"

function profileParts(name?: string | null) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return {}
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" ") || undefined,
  }
}

/**
 * Une session Better Auth ne suffit pas à interroger les données métier :
 * chaque voyageur doit aussi posséder un profil dans la table applicative.
 * Ce hook crée ce profil une seule fois puis expose un état prêt à l'emploi.
 */
function useLiveTravelerAuth() {
  const auth = useAuth()
  const { isAuthenticated, user } = auth
  const profile = useQuery(
    api.functions.customers.me,
    isAuthenticated ? {} : "skip"
  )
  const ensureProfile = useMutation(api.functions.customers.ensureProfile)
  const provisioning = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (!isAuthenticated || !user) return
    if (profile !== null) {
      if (profile) clearPendingTravelerOnboarding()
      return
    }
    if (provisioning.current === user.id) return
    provisioning.current = user.id

    const extendedUser = user as typeof user & {
      phoneNumber?: string | null
    }
    const pendingOnboarding = readPendingTravelerOnboarding()
    const onboardingMatchesSession =
      pendingOnboarding?.identifier === user.email?.trim().toLowerCase() ||
      pendingOnboarding?.identifier === extendedUser.phoneNumber
    const onboarding = onboardingMatchesSession ? pendingOnboarding : undefined
    if (pendingOnboarding && !onboardingMatchesSession) {
      clearPendingTravelerOnboarding()
    }
    const names =
      extendedUser.phoneNumber && user.name === extendedUser.phoneNumber
        ? {}
        : profileParts(user.name)
    void ensureProfile({
      firstName: onboarding?.firstName ?? names.firstName,
      lastName: onboarding?.lastName ?? names.lastName,
      phone: onboarding?.phone ?? extendedUser.phoneNumber ?? undefined,
      email: user.email?.endsWith("@auth.setrag.local")
        ? undefined
        : user.email,
    })
      .then(() => clearPendingTravelerOnboarding())
      .catch(() => {
        provisioning.current = undefined
      })
  }, [ensureProfile, isAuthenticated, profile, user])

  return {
    ...auth,
    profile,
    isProfileReady:
      !isAuthenticated || (profile !== undefined && profile !== null),
  }
}

function useE2ETravelerAuth() {
  return {
    isLoading: false,
    isAuthenticated: false,
    user: null,
    session: null,
    profile: undefined,
    isProfileReady: true,
  }
}

/**
 * Le mode navigateur local ne doit jamais contacter Better Auth : son origine
 * locale n'est volontairement pas autorisée en production et l'erreur CORS
 * ouvrirait l'overlay Next.js au milieu des parcours Playwright.
 */
export const useTravelerAuth =
  IS_E2E && process.env.NODE_ENV !== "test"
    ? useE2ETravelerAuth
    : useLiveTravelerAuth
