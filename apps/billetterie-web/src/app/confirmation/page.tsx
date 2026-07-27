import { ConfirmationScreen } from "@/components/after-sale-screens"
import { JourneyStepper } from "@/components/journey-stepper"
import { PageIntro } from "@/components/site-shell"

export default async function ConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>
}) {
  const { mode } = await searchParams
  return (
    <main className="mx-auto grid w-full max-w-4xl min-w-0 gap-6 px-s-5 py-s-5 md:gap-9 md:px-6 md:py-12">
      <JourneyStepper current={3} />
      <PageIntro className="hidden md:grid" eyebrow="Étape 4 sur 4" title="Votre voyage est enregistré" />
      <ConfirmationScreen counterPayment={mode === "guichet"} />
    </main>
  )
}
