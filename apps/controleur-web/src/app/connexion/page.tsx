import type { Metadata } from "next"

import { LoginScreen } from "@/components/login-screen"

export const metadata: Metadata = {
  title: "Connexion",
}

export default function ConnexionPage() {
  return <LoginScreen />
}
