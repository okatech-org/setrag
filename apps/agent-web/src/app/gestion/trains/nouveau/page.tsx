import type { Metadata } from "next"

import { TrainCreateScreen } from "@/components/train-detail"

export const metadata: Metadata = {
  title: "Gestion · Nouveau train",
}

export default function NewTrainPage() {
  return <TrainCreateScreen />
}
