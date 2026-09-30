import type { Metadata } from "next"
import { Suspense } from "react"

import { SqueletteTunnel } from "@/fonctionnalites/tunnel/etapes"
import { Reservation } from "@/fonctionnalites/tunnel/reservation/reservation"

export const metadata: Metadata = {
  title: "Voyageurs et classe",
  robots: { index: false },
}

export default function PageReservation() {
  return (
    <Suspense fallback={<SqueletteTunnel />}>
      <Reservation />
    </Suspense>
  )
}
