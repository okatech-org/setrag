import type { Metadata } from "next"

import { DesignSystemShowcase } from "./showcase"

export const metadata: Metadata = {
  title: "Cadence — design system",
  description:
    "Référence vivante du design system Cadence appliqué à la billetterie SETRAG.",
  robots: { index: false, follow: false },
}

export default function DesignSystemPage() {
  return <DesignSystemShowcase />
}
