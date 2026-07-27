import { JourneyStepper } from "@/components/journey-stepper"
import { PaymentForm } from "@/components/payment-form"
import { PageIntro } from "@/components/site-shell"
import { TunnelStepper } from "@/components/tunnel-stepper"

export default function PaiementPage() {
  return (
    <main className="mx-auto grid w-full max-w-3xl min-w-0 gap-6 px-s-5 py-s-5 md:gap-9 md:px-6 md:py-12">
      <TunnelStepper current={2} />
      <JourneyStepper current={2} className="hidden md:grid" />
      <PageIntro
        className="hidden md:grid"
        eyebrow="Étape 3 sur 4"
        title="Paiement"
        description="Votre prix et vos places sont bloqués pendant 15 minutes."
      />
      <PaymentForm />
    </main>
  )
}
