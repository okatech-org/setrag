import { useConvexAuth } from "convex/react"

import { Button, Card, Screen, Text } from "@workspace/mobile-ui/components"

import { signOut } from "@/lib/auth-client"

export default function CompteScreen() {
  // L'état de session vient de Convex : le profil applicatif (nom, téléphone,
  // rôle) est servi par la query `users:me`, pas par la session Better Auth.
  const { isLoading, isAuthenticated } = useConvexAuth()

  return (
    <Screen scroll>
      <Text variant="h1">Mon compte</Text>

      <Card>
        {isLoading ? (
          <Text variant="small" tone="muted">
            Chargement…
          </Text>
        ) : isAuthenticated ? (
          <>
            <Text variant="h4">Connecté</Text>
            <Text variant="small" tone="muted">
              Vos réservations sont synchronisées sur tous vos appareils.
            </Text>
            <Button
              title="Se déconnecter"
              variant="secondary"
              onPress={() => signOut()}
            />
          </>
        ) : (
          <>
            <Text variant="h4">Vous n&apos;êtes pas connecté</Text>
            <Text variant="small" tone="muted">
              Connectez-vous par SMS ou e-mail pour retrouver vos réservations
              sur tous vos appareils.
            </Text>
            <Button title="Se connecter" />
          </>
        )}
      </Card>
    </Screen>
  )
}
