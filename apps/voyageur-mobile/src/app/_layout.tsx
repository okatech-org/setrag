import { useEffect } from "react"
import { Stack } from "expo-router"
import { StatusBar } from "expo-status-bar"
import * as SplashScreen from "expo-splash-screen"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import { SafeAreaProvider } from "react-native-safe-area-context"

import { useCadenceFonts } from "@workspace/mobile-ui/fonts"
import { colors } from "@workspace/mobile-ui/tokens"

import { ConvexProvider } from "@/lib/convex"

SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
  const [fontsLoaded, fontError] = useCadenceFonts()

  useEffect(() => {
    // On garde l'écran de démarrage tant que Cadence n'est pas prêt : sans ses
    // familles, la typographie retomberait sur la police système.
    if (fontsLoaded || fontError) SplashScreen.hideAsync()
  }, [fontsLoaded, fontError])

  if (!fontsLoaded && !fontError) return null

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ConvexProvider>
          <StatusBar style="auto" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.light.canvas },
            }}
          >
            <Stack.Screen name="(tabs)" />
          </Stack>
        </ConvexProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
