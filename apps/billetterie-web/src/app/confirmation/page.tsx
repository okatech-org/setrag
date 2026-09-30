import type { Metadata } from "next"
import { Suspense } from "react"

import { Confirmation } from "@/fonctionnalites/billets/confirmation"

export const metadata: Metadata = {
  title: "Billets émis",
  description:
    "Vos billets SETRAG : le code de chacun se présente au contrôle, même sans réseau.",
  robots: { index: false },
}

export default function PageConfirmation() {
  return (
    <Suspense>
      <Confirmation />
    </Suspense>
  )
}
