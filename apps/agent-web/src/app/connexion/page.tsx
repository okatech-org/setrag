import type { Metadata } from "next"

import { LoginPageClient } from "@/components/login-screen"

export const metadata: Metadata = {
  title: "Connexion",
}

export default function ConnexionPage() {
  return <LoginPageClient />
}
