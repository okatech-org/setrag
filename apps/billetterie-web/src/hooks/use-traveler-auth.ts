"use client"

import { useEffect, useRef } from "react"

import { useAuth, useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"

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
export function useTravelerAuth() {
  const auth = useAuth()
  const { isAuthenticated, user } = auth
  const profile = useQuery(
    api.functions.customers.me,
    isAuthenticated ? {} : "skip"
  )
  const ensureProfile = useMutation(api.functions.customers.ensureProfile)
  const provisioning = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (!isAuthenticated || !user || profile !== null) return
    if (provisioning.current === user.id) return
    provisioning.current = user.id

    const extendedUser = user as typeof user & {
      phoneNumber?: string | null
    }
    const names =
      extendedUser.phoneNumber && user.name === extendedUser.phoneNumber
        ? {}
        : profileParts(user.name)
    void ensureProfile({
      ...names,
      phone: extendedUser.phoneNumber ?? undefined,
      email: user.email?.endsWith("@auth.setrag.local")
        ? undefined
        : user.email,
    }).catch(() => {
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
