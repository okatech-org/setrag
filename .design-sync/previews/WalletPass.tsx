import { WalletPass } from "@workspace/ui"

const qr = (
  <span
    aria-hidden
    style={{
      width: "100%",
      height: "100%",
      background:
        "repeating-linear-gradient(90deg, var(--c-surface) 0 4px, var(--c-ink) 4px 7px)",
    }}
  />
)

export const Billet = () => (
  <WalletPass
    headerFields={[{ label: "Train", value: "TR-201", mono: true }]}
    origin={{ label: "Départ", value: "OWE" }}
    destination={{ label: "Arrivée", value: "FCV" }}
    secondaryFields={[
      { label: "Départ", value: "07:42", mono: true },
      { label: "Arrivée", value: "21:38", mono: true },
      { label: "Classe", value: "Économique" },
    ]}
    auxiliaryFields={[
      { label: "Voiture", value: "12", mono: true },
      { label: "Place", value: "44", mono: true },
      { label: "Quai", value: "H", mono: true },
    ]}
    qrCode={qr}
    barcodeAltText="KX7 24Q"
  />
)

export const SansPlace = () => (
  <WalletPass
    headerFields={[{ label: "Train", value: "TR-202", mono: true }]}
    origin={{ label: "Départ", value: "FCV" }}
    destination={{ label: "Arrivée", value: "OWE" }}
    secondaryFields={[
      { label: "Départ", value: "18:12", mono: true },
      { label: "Arrivée", value: "08:07", mono: true },
      { label: "Classe", value: "Confort" },
    ]}
    qrCode={qr}
    barcodeAltText="MP4 88T"
  />
)
