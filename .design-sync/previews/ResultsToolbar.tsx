import { ResultsToolbar } from "@workspace/ui"

export const Resultats = () => (
  <div style={{ maxWidth: 560 }}>
    <ResultsToolbar
      summary="14 dessertes · la moins chère à 18 000 FCFA"
      sortLabel="Trier : le plus tôt"
      onSortClick={() => {}}
    />
  </div>
)

export const SansTri = () => (
  <div style={{ maxWidth: 560 }}>
    <ResultsToolbar summary="3 dessertes le dimanche 9 août" />
  </div>
)
