import { ToastBar } from "@workspace/ui"

export const Confirmation = () => (
  <div style={{ maxWidth: 480 }}>
    <ToastBar action="Voir">Billet ajouté à votre carnet</ToastBar>
  </div>
)

export const SansAction = () => (
  <div style={{ maxWidth: 480 }}>
    <ToastBar>Vos préférences de notification sont enregistrées</ToastBar>
  </div>
)
