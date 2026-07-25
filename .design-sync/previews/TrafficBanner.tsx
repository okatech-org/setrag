import { TrafficBanner } from "@workspace/ui"

export const Perturbation = () => (
  <TrafficBanner
    title="Circulation perturbée entre Booué et Lopé"
    description="Jusqu'à 40 min de retard sur les dessertes de l'après-midi. Vos billets restent valables sur le train suivant, sans échange."
    action={<span className="text-[13px] leading-none font-semibold">Suivre la situation en direct →</span>}
  />
)

export const Travaux = () => (
  <TrafficBanner
    tone="info"
    title="Travaux les week-ends du 15 au 30 août"
    description="Départs avancés de 10 min au départ d'Owendo. Les horaires affichés tiennent déjà compte des travaux."
  />
)

export const Interruption = () => (
  <TrafficBanner
    tone="danger"
    title="Trafic interrompu entre Ndjolé et Alembé"
    description="Un service de bus est mis en place au départ de Ndjolé. Présentez votre billet au chef de gare."
  />
)
