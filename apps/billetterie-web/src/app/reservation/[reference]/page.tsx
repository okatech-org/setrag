import { BookingDetailScreen } from "@/components/booking-detail-screen"
import { PageIntro } from "@/components/site-shell"

export default async function DossierPage({
  params,
}: {
  params: Promise<{ reference: string }>
}) {
  const { reference } = await params
  const decodedReference = decodeURIComponent(reference)
  return (
    <main className="mx-auto grid w-full max-w-5xl min-w-0 gap-8 px-4 py-8 sm:px-6 sm:py-12">
      <PageIntro
        eyebrow="Titre de transport"
        title="Votre voyage"
        description="Retrouvez chaque billet, téléchargez le dossier complet ou recevez-le par e-mail."
      />
      <BookingDetailScreen reference={decodedReference} />
    </main>
  )
}
