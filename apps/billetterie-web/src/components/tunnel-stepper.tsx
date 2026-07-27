import { Stepper } from "@workspace/ui/components/stepper"

const STEPS = [
  { label: "Desserte" },
  { label: "Voyageurs" },
  { label: "Payer" },
]

/**
 * Progression du tunnel d'achat, en mobile.
 *
 * Les trois étapes de la maquette recouvrent quatre routes : `/resultats`,
 * `/reservation`, puis `/paiement` et son écran d'attente, qui partagent la
 * dernière. Le bureau garde son propre fil d'Ariane.
 */
export function TunnelStepper({ current }: { current: 0 | 1 | 2 }) {
  return <Stepper steps={STEPS} current={current} className="md:hidden" />
}
