import { useEffect, type ReactNode } from "react"
import { useConvexAuth, useMutation, useQuery } from "convex/react"
import { api } from "@workspace/backend/generated"

export function ProfileBootstrap({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useConvexAuth()
  const profile = useQuery(api.functions.customers.me, isAuthenticated ? {} : "skip")
  const ensure = useMutation(api.functions.customers.ensureProfile)
  useEffect(() => { if (isAuthenticated && profile === null) void ensure({}).catch(() => undefined) }, [isAuthenticated, profile, ensure])
  return children
}
