import { ReservationsScreen } from "@/components/after-sale-screens"
import { PageIntro } from "@/components/site-shell"

export default function MesReservationsPage() {
  return (
    <main className="mx-auto grid w-full max-w-5xl min-w-0 gap-6 px-s-5 py-s-5 md:gap-8 md:px-6 md:py-12">
      {/* La barre d'onglets porte déjà « Billets » en mobile. */}
      <PageIntro
        className="hidden md:grid"
        eyebrow="Espace voyageur"
        title="Mes réservations"
        description="Retrouvez vos billets, leur statut et le suivi de vos remboursements."
      />
      <ReservationsScreen />
    </main>
  )
}
