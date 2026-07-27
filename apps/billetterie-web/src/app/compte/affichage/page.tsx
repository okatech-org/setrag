import { DisplayScreen } from "@/components/account/display-screen"
import { PageIntro } from "@/components/site-shell"

export default function AffichagePage() {
  return (
    <main className="mx-auto grid w-full max-w-2xl min-w-0 gap-6 px-s-5 py-s-5 md:gap-8 md:px-6 md:py-12">
      <PageIntro
        className="hidden md:grid"
        eyebrow="Mon compte"
        title="Affichage et langue"
        description="Ces réglages ne concernent que cet appareil."
      />
      <DisplayScreen />
    </main>
  )
}
