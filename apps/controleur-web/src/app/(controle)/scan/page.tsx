import type { Metadata } from "next"

import { ScannerScreen } from "@/components/scanner-screen"

export const metadata: Metadata = { title: "Scanner" }

export default function ScanPage() {
  return <ScannerScreen />
}
