import { Stepper } from "@workspace/ui"

const etapes = [{ label: "Voyageurs" }, { label: "Paiement" }, { label: "Billets" }]

export const Debut = () => (
  <div style={{ maxWidth: 460 }}><Stepper steps={etapes} current={0} /></div>
)

export const EnCours = () => (
  <div style={{ maxWidth: 460 }}><Stepper steps={etapes} current={1} /></div>
)

export const Fin = () => (
  <div style={{ maxWidth: 460 }}><Stepper steps={etapes} current={2} /></div>
)
