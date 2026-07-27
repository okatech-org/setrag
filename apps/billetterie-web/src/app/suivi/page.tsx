import { Suspense } from "react"

import { SkeletonLines } from "@workspace/ui/components/empty-state"

import { TrackingScreen } from "@/components/after-sale-screens"
import { PageIntro } from "@/components/site-shell"

export default function SuiviPage() {
  return (
    <main className="mx-auto grid w-full max-w-4xl gap-6 px-s-5 py-s-5 md:gap-8 md:px-6 md:py-12">
      <PageIntro
        className="hidden md:grid"
        eyebrow="Information en temps réel"
        title="Suivre un train"
        description="Consultez les heures estimées et les éventuels retards sans recharger la page."
      />
      <Suspense fallback={<SkeletonLines lines={5} />}>
        <TrackingScreen />
      </Suspense>
    </main>
  )
}
