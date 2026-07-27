import { SavedPassengersScreen } from "@/components/account/saved-passengers-screen"
import { PageIntro } from "@/components/site-shell"

export default function VoyageursPage() {
  return (
    <main className="mx-auto grid w-full max-w-2xl min-w-0 gap-6 px-s-5 py-s-5 md:gap-8 md:px-6 md:py-12">
      <PageIntro
        className="hidden md:grid"
        eyebrow="Mon compte"
        title="Voyageurs enregistrés"
        description="Ces fiches préremplissent vos réservations. Elles ne modifient jamais un billet déjà émis."
      />
      <SavedPassengersScreen />
    </main>
  )
}
