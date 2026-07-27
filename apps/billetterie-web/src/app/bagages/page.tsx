import { PageIntro } from "@/components/site-shell"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { InlineMessage } from "@workspace/ui/components/inline-message"

export default function BagagesPage() {
  return (
    <main className="mx-auto grid w-full max-w-4xl gap-6 px-s-5 py-s-5 md:gap-8 md:px-6 md:py-12">
      <PageIntro
        className="hidden md:grid"
        eyebrow="Préparer le voyage"
        title="Bagages"
        description="Identifiez les bagages inclus avec votre billet et ceux qui nécessitent une taxation en gare."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Bagages accompagnés</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-small text-ink-muted">
              Gardez avec vous les effets personnels compatibles avec l’espace
              disponible et étiquetez chaque bagage avec vos coordonnées.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Bagages volumineux</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-small text-ink-muted">
              Les colis lourds, encombrants ou hors franchise sont pesés, taxés
              et étiquetés au comptoir bagages avant l’embarquement.
            </p>
          </CardContent>
        </Card>
      </div>
      <InlineMessage
        tone="warning"
        title="Arrivez au moins 45 minutes avant le départ."
      >
        Le poids, la nature du bien et les règles de sécurité sont vérifiés en
        gare. Les matières dangereuses sont interdites.
      </InlineMessage>
    </main>
  )
}
