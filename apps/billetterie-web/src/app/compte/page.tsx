import { AccountScreen } from "@/components/after-sale-screens"
import { PageIntro } from "@/components/site-shell"

export default function ComptePage() {
  return (
    <main className="mx-auto grid w-full max-w-5xl min-w-0 gap-6 px-s-5 py-s-5 md:gap-8 md:px-6 md:py-12">
      <PageIntro
        className="hidden md:grid"
        eyebrow="Confidentialité et préférences"
        title="Mon compte"
        description="Gérez votre profil, vos consentements et vos droits sur vos données."
      />
      <AccountScreen />
    </main>
  )
}
