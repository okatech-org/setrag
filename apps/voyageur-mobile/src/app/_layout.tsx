import { useEffect } from "react"
import { Stack, type ErrorBoundaryProps } from "expo-router"
import { StatusBar } from "expo-status-bar"
import * as SplashScreen from "expo-splash-screen"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import { SafeAreaProvider } from "react-native-safe-area-context"

import { Button, useTheme } from "@workspace/mobile-ui/components"
import { useSetragFonts } from "@workspace/mobile-ui/fonts"
import { brand } from "@workspace/mobile-ui/tokens"

import { Ecran } from "@/components/ecran"
import { EtatVide } from "@/components/elements"
import { BookingsProvider } from "@/lib/bookings-cache"
import { ConvexProvider } from "@/lib/convex"
import { JourneyProvider } from "@/lib/journey"
import { ProfileBootstrap } from "@/lib/profile-bootstrap"
import { ReglagesProvider } from "@/lib/reglages"

SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
  const [fontsLoaded, fontError] = useSetragFonts()

  useEffect(() => {
    // On garde l'écran de démarrage tant que SETRAG n'est pas prêt : sans ses
    // familles, la typographie retomberait sur la police système.
    if (fontsLoaded || fontError) SplashScreen.hideAsync()
  }, [fontsLoaded, fontError])

  if (!fontsLoaded && !fontError) return null

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ConvexProvider>
          <ProfileBootstrap>
            <ReglagesProvider>
              <JourneyProvider>
                <BookingsProvider>
                  <Navigation />
                </BookingsProvider>
              </JourneyProvider>
            </ReglagesProvider>
          </ProfileBootstrap>
        </ConvexProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}

/**
 * Dernier filet : une erreur de rendu (requête refusée, donnée inattendue)
 * affiche un écran de reprise plutôt que de fermer l'app.
 */
export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return (
    <Ecran>
      <EtatVide
        titre="Un incident est survenu"
        texte="L'écran n'a pas pu s'afficher. Vos billets restent enregistrés sur ce téléphone."
        action={<Button title="Réessayer" onPress={() => void retry()} />}
      />
    </Ecran>
  )
}

function Navigation() {
  const theme = useTheme()
  return (
    <>
      <StatusBar style={theme.isDark ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.canvas } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="bienvenue" options={{ animation: "fade", gestureEnabled: false }} />
        {/* Quitter le paiement libère les places : seul le bouton retour le propose, avec confirmation. */}
        <Stack.Screen name="paiement" options={{ gestureEnabled: false }} />
        <Stack.Screen name="paiement/attente" options={{ gestureEnabled: false }} />
        <Stack.Screen name="confirmation" options={{ gestureEnabled: false, animation: "fade" }} />
        <Stack.Screen name="billets/[reference]" options={{ contentStyle: { backgroundColor: brand.encre } }} />
        {/* Ruban dessine sa propre feuille, à deux hauteurs, sur un voile. */}
        <Stack.Screen name="assistant" options={{ presentation: "transparentModal", animation: "none", contentStyle: { backgroundColor: "transparent" } }} />
      </Stack>
    </>
  )
}
