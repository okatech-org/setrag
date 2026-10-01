import { useEffect } from "react"
import { Redirect, Tabs } from "expo-router"
import { useConvexAuth } from "convex/react"

import { Demarrage } from "@/components/demarrage"
import { BarreOnglets } from "@/components/onglets"
import { useReglages } from "@/lib/reglages"

/** Trois onglets : Accueil, Billets, Compte. */
export default function TabsLayout() {
  const { isLoading, isAuthenticated } = useConvexAuth()
  const { pret, bienvenueVue, marquerBienvenueVue } = useReglages()

  // Un voyageur déjà connecté a passé la bienvenue, même s'il n'est jamais passé par elle.
  useEffect(() => {
    if (pret && isAuthenticated && !bienvenueVue) void marquerBienvenueVue()
  }, [pret, isAuthenticated, bienvenueVue, marquerBienvenueVue])

  // Le démarrage n'attend la session que pour décider d'afficher la bienvenue :
  // hors réseau, les billets ne doivent pas rester derrière le logo.
  if (!pret || (!bienvenueVue && isLoading)) return <Demarrage />
  if (!bienvenueVue && !isAuthenticated) return <Redirect href="/bienvenue" />

  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <BarreOnglets {...props} />}>
      <Tabs.Screen name="index" options={{ title: "Accueil" }} />
      <Tabs.Screen name="billets" options={{ title: "Billets" }} />
      <Tabs.Screen name="compte" options={{ title: "Compte" }} />
    </Tabs>
  )
}
