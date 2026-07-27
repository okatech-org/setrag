import { BookingForm } from "@/components/booking-form"
import { JourneyStepper } from "@/components/journey-stepper"
import { PageIntro } from "@/components/site-shell"
import { TunnelStepper } from "@/components/tunnel-stepper"

export default function ReservationPage() {
  return (
    <main className="mx-auto grid w-full max-w-5xl min-w-0 gap-6 px-s-5 py-s-5 md:gap-9 md:px-6 md:py-12">
      <TunnelStepper current={1} />
      {/* Le fil du bureau compte quatre étapes ; le mobile en montre trois,
          conformément à la maquette. */}
      <JourneyStepper current={1} className="hidden md:grid" />
      <PageIntro
        className="hidden md:grid"
        eyebrow="Étape 2 sur 4"
        title="Votre voyage et vos passagers"
        description="Choisissez la classe, puis renseignez les informations qui figureront sur chaque billet."
      />
      <BookingForm />
    </main>
  )
}
