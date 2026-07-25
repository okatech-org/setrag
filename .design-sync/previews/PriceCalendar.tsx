import { PriceCalendar } from "@workspace/ui"

const jours = [
  { day: 3, priceXaf: null, value: "2026-08-03" },
  { day: 4, priceXaf: 18000, value: "2026-08-04" },
  { day: 5, priceXaf: 18000, value: "2026-08-05" },
  { day: 6, priceXaf: 27000, value: "2026-08-06" },
  { day: 7, priceXaf: 31000, value: "2026-08-07" },
  { day: 8, priceXaf: 40500, value: "2026-08-08" },
  { day: 9, priceXaf: 36000, value: "2026-08-09" },
]

export const Semaine = () => (
  <div style={{ maxWidth: 520 }}>
    <PriceCalendar monthLabel="Août 2026" days={jours} selected="2026-08-07" onNext={() => {}} />
  </div>
)
