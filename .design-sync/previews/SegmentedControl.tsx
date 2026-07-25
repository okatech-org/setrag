import { useState } from "react"
import { SegmentedControl } from "@workspace/ui"

export const Creneau = () => {
  const [v, setV] = useState("matin")
  return (
    <SegmentedControl
      label="Horaire de départ"
      value={v}
      onValueChange={setV}
      options={[
        { value: "matin", label: "Matin" },
        { value: "midi", label: "Midi" },
        { value: "soir", label: "Soir" },
      ]}
    />
  )
}

export const TypeDeTrajet = () => {
  const [v, setV] = useState("ar")
  return (
    <SegmentedControl
      label="Type de trajet"
      value={v}
      onValueChange={setV}
      options={[
        { value: "ar", label: "Aller-retour" },
        { value: "as", label: "Aller simple" },
        { value: "me", label: "Multi-étapes" },
      ]}
    />
  )
}
