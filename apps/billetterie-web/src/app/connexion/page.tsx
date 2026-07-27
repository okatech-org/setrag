import { Suspense } from "react"

import { SkeletonLines } from "@workspace/ui/components/empty-state"

import { OtpScreen } from "@/components/after-sale-screens"

export default function ConnexionPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-s-5 py-s-6 md:px-6 md:py-14">
      <Suspense fallback={<SkeletonLines lines={5} />}>
        <OtpScreen />
      </Suspense>
    </main>
  )
}
