import { useState } from "react"
import { View } from "react-native"

import {
  Avatar,
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Field,
  InlineMessage,
  Input,
  Radio,
  RadioGroup,
  Screen,
  SegmentedControl,
  Separator,
  SkeletonLines,
  Stepper,
  Switch,
  Tag,
  Text,
  Textarea,
  ToastBar,
  useTheme,
} from "@workspace/mobile-ui/components"
import {
  BoardingPass,
  CheckoutSummary,
  PriceCalendar,
  Ticket,
  TrafficBanner,
  TripResultCard,
  WalletPass,
} from "@workspace/mobile-ui/voyage"

/**
 * Référence vivante du design system mobile — le pendant de `/design-system`
 * côté web. Elle monte chaque composant : si l'un d'eux cesse de compiler ou
 * de rendre, l'écran le montre avant que ce ne soit un écran de production.
 */

const D = (h: number, m: number) => Date.UTC(2026, 7, 7, h - 1, m)

const qr = (
  <View
    style={{
      width: "100%",
      height: "100%",
      backgroundColor: "#131B26",
      opacity: 0.9,
    }}
  />
)

/* Défini au niveau module : un composant créé pendant le rendu est recréé à
   chaque passe et remonte toute sa sous-arborescence. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useTheme()
  return (
    <View style={{ gap: theme.spacing[3] }}>
      <Text variant="monoLabel" tone="muted">
        {title}
      </Text>
      {children}
    </View>
  )
}

export default function DesignSystemScreen() {
  const theme = useTheme()
  const [creneau, setCreneau] = useState("matin")
  const [classe, setClasse] = useState("economique")
  const [direct, setDirect] = useState(true)
  const [alertes, setAlertes] = useState(true)
  const [paiement, setPaiement] = useState("airtel")
  const [jour, setJour] = useState("2026-08-07")

  return (
    <Screen scroll>
      <Text variant="h1">Design system</Text>
      <Text variant="small" tone="muted">
        SETRAG v1.1.0 — référence mobile
      </Text>

      <Section title="Boutons">
        <View style={{ gap: theme.spacing[2] }}>
          <Button title="Rechercher une desserte" size="lg" block />
          <View style={{ flexDirection: "row", gap: theme.spacing[2], flexWrap: "wrap" }}>
            <Button title="Modifier" variant="secondary" />
            <Button title="Détail" variant="ghost" />
            <Button title="Annuler" variant="danger" />
          </View>
          <View style={{ flexDirection: "row", gap: theme.spacing[2], flexWrap: "wrap" }}>
            <Button title="sm" size="sm" />
            <Button title="Désactivé" disabled />
            <Button title="Recherche…" loading />
          </View>
        </View>
      </Section>

      <Section title="Champs">
        <Field label="Gare de départ" hint="Tapez au moins 2 lettres.">
          <Input placeholder="Gare, ville ou point d'arrêt" />
        </Field>
        <Field label="Numéro de téléphone" error="Il manque 2 chiffres.">
          <Input defaultValue="+241 06 12 34" invalid />
        </Field>
        <Field label="Carte de réduction" disabled>
          <Input placeholder="Ajoutez d'abord un voyageur" editable={false} />
        </Field>
        <Field label="Un mot pour l'assistance">
          <Textarea placeholder="Décrivez votre situation" />
        </Field>
      </Section>

      <Section title="Sélection">
        <SegmentedControl
          label="Créneau"
          value={creneau}
          onValueChange={setCreneau}
          options={[
            { value: "matin", label: "Matin" },
            { value: "midi", label: "Midi" },
            { value: "soir", label: "Soir" },
          ]}
        />
        <Checkbox label="Direct uniquement" checked={direct} onCheckedChange={setDirect} />
        <Checkbox label="Voiture calme" disabled />
        <RadioGroup value={classe} onValueChange={setClasse}>
          <Radio value="economique" label="Économique" />
          <Radio value="confort" label="Confort" />
          <Radio value="vip" label="VIP" />
        </RadioGroup>
        <Switch label="Alertes retard" value={alertes} onValueChange={setAlertes} />
      </Section>

      <Section title="Pastilles">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing[2] }}>
          <Tag label="À l'heure" tone="success" />
          <Tag label="+12 min" tone="warning" />
          <Tag label="Supprimé" tone="danger" />
          <Tag label="Éco" tone="accent" />
          <Tag label="1 arrêt" tone="neutral" />
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing[2], alignItems: "center" }}>
          <Badge label="Confirmée" />
          <Badge label="Payée" variant="success" />
          <Badge label="En attente" variant="warning" />
          <Badge label="Annulée" variant="destructive" />
          <Avatar name="Camille Roux" />
        </View>
      </Section>

      <Section title="Retours">
        <InlineMessage tone="info" title="Travaux prévus" description="Ligne modifiée les week-ends d'août." />
        <InlineMessage tone="warning" title="Retard annoncé" description="Votre train partira 12 min plus tard. Votre place est conservée." />
        <ToastBar message="Billet ajouté à votre carnet" actionLabel="Voir" onAction={() => {}} />
        <Stepper current={1} steps={[{ label: "Voyageurs" }, { label: "Paiement" }, { label: "Billets" }]} />
        <Separator />
        <SkeletonLines />
        <EmptyState
          title="Aucun train sur ce créneau"
          description="Essayez le jour suivant — il reste des places le matin."
          action={<Button title="Voir le 8 août" variant="ghost" size="sm" />}
        />
      </Section>

      <Section title="Voyage">
        <TrafficBanner
          title="Circulation perturbée entre Booué et Lopé"
          description="Jusqu'à 40 min de retard cet après-midi. Vos billets restent valables sur le train suivant."
        />
        <TripResultCard
          departureAt={D(7, 42)}
          arrivalAt={D(21, 38)}
          durationMinutes={836}
          originLabel="Owendo"
          destinationLabel="Franceville"
          priceXaf={18000}
          tags={[{ label: "À l'heure", tone: "success" }]}
          onPress={() => {}}
        />
        <PriceCalendar
          monthLabel="Août 2026"
          selected={jour}
          onSelect={setJour}
          days={[
            { day: 5, priceXaf: 18000, value: "2026-08-05" },
            { day: 6, priceXaf: 27000, value: "2026-08-06" },
            { day: 7, priceXaf: 31000, value: "2026-08-07" },
            { day: 8, priceXaf: 40500, value: "2026-08-08" },
            { day: 9, priceXaf: null, value: "2026-08-09" },
          ]}
        />
        <BoardingPass
          countdownLabel="Départ dans 34 min"
          routeLabel="Owendo → Franceville"
          coachLabel="12"
          seatLabel="44"
          platformLabel="H"
          reference="KX7 24Q · Camille Roux"
          qrCode={qr}
          onAddToWallet={() => {}}
          onExchange={() => {}}
        />
        <WalletPass
          headerFields={[{ label: "Train", value: "TR-201", mono: true }]}
          origin={{ label: "Départ", value: "OWE" }}
          destination={{ label: "Arrivée", value: "FCV" }}
          secondaryFields={[
            { label: "Départ", value: "07:42", mono: true },
            { label: "Arrivée", value: "21:38", mono: true },
          ]}
          auxiliaryFields={[
            { label: "Voiture", value: "12", mono: true },
            { label: "Place", value: "44", mono: true },
          ]}
          qrCode={qr}
          barcodeAltText="KX7 24Q"
        />
        <Ticket
          legLabel="Aller · vendredi 7 août"
          routeLabel="Owendo → Franceville"
          departureAt={D(7, 42)}
          arrivalAt={D(21, 38)}
          seatLabel="12 · 44"
          passengerLabel="Camille Roux"
          reference="KX7 24Q"
          qrCode={qr}
        />
        <CheckoutSummary
          selectedOption={paiement}
          onSelectOption={setPaiement}
          lines={[
            { label: "Aller · Économique", amountXaf: 36000 },
            { label: "Tarif Jeune", amountXaf: 7200, discount: true },
          ]}
          options={[
            { id: "airtel", label: "Airtel Money", note: "•••• 4242", noteMono: true },
            { id: "carte", label: "Carte bancaire", note: "Visa" },
          ]}
        />
        <Card>
          <Text variant="h4">Carte</Text>
          <Text variant="small" tone="muted">Conteneur de base du design system.</Text>
        </Card>
      </Section>
    </Screen>
  )
}
