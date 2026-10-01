import type { Metadata } from "next"

import { NotesDeService } from "@/components/modules/ged/notes"

export const metadata: Metadata = { title: "GED · Notes de service" }

export default function NotesPage() {
  return <NotesDeService />
}
