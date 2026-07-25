import { CheckoutSummary } from "@workspace/ui"

const lignes = [
  { label: "Aller · 07:42 → 21:38 · Économique", amountXaf: 36000 },
  { label: "Retour · 18:12 → 08:07 · Économique", amountXaf: 36000 },
  { label: "Tarif Jeune (2 voyageurs)", amountXaf: 7200, discount: true },
]

const moyens = [
  { id: "airtel", label: "Airtel Money", note: "•••• 4242", noteMono: true },
  { id: "carte", label: "Carte bancaire", note: "Visa, Mastercard" },
]

export const Recapitulatif = () => (
  <div style={{ maxWidth: 480 }}>
    <CheckoutSummary
      lines={lignes}
      options={moyens}
      selectedOption="airtel"
      footnote="Vos billets arrivent dans l'application dès le paiement validé. Annulation gratuite jusqu'au 6 août."
    />
  </div>
)

export const EnCours = () => (
  <div style={{ maxWidth: 480 }}>
    <CheckoutSummary lines={lignes} options={moyens} selectedOption="carte" submitting />
  </div>
)
