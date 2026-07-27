import { Suspense } from "react"

import { SkeletonLines } from "@workspace/ui/components/empty-state"

import { PageIntro } from "@/components/site-shell"
import { TripResults } from "@/components/trip-results"
import { TunnelStepper } from "@/components/tunnel-stepper"

export default function ResultatsPage() {
  return (
    <main className="mx-auto grid w-full max-w-5xl gap-6 px-s-5 py-s-5 md:gap-8 md:px-6 md:py-12">
      <TunnelStepper current={0} />
      {/* La barre de titre mobile porte déjà « Dessertes ». */}
      <PageIntro
        className="hidden md:grid"
        eyebrow="Owendo → Franceville"
        title="Choisissez votre train"
        description="Les disponibilités sont vérifiées sur tout votre trajet, gare par gare."
      />
      <Suspense fallback={<SkeletonLines lines={5} />}>
        <TripResults />
      </Suspense>
    </main>
  )
}
