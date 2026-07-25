"use client"

import { useState } from "react"

import { Button } from "@workspace/ui/components/button"
import { Checkbox, Radio, RadioGroup, Switch } from "@workspace/ui/components/choice"
import { EmptyState, SkeletonLines } from "@workspace/ui/components/empty-state"
import { Field, Input, SelectNative, Textarea } from "@workspace/ui/components/field"
import { InlineMessage, ToastBar } from "@workspace/ui/components/inline-message"
import { Stepper } from "@workspace/ui/components/stepper"
import { Tag } from "@workspace/ui/components/tag"
import { CheckoutSummary } from "@workspace/ui/voyage/checkout-summary"
import { PriceCalendar } from "@workspace/ui/voyage/price-calendar"
import { Ticket } from "@workspace/ui/voyage/ticket"
import { TrafficBanner } from "@workspace/ui/voyage/traffic-banner"
import { TripResultCard } from "@workspace/ui/voyage/trip-result-card"
import { TripSearchBar } from "@workspace/ui/voyage/trip-search-bar"

/* Horodatages figés : le rendu doit être identique côté serveur et client. */
const D = (h: number, m: number) => Date.UTC(2026, 7, 7, h - 1, m)

export function DesignSystemShowcase() {
  const [payment, setPayment] = useState("mobile-money")
  const [day, setDay] = useState("2026-08-07")

  return (
    <main className="mx-auto grid w-full max-w-[1264px] gap-24 px-8 pt-16 pb-30">
      <header className="grid gap-8 border-b border-line pb-12">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="grid size-7 place-items-center rounded-pill bg-accent-base"
          >
            <span className="size-2.5 rounded-xs bg-canvas" />
          </span>
          <span className="text-[18px] leading-none font-semibold tracking-tight">
            Cadence
          </span>
          <span className="tabular rounded-pill border border-line px-2 py-1.5 text-[12px] leading-none text-ink-faint">
            v1.0.0
          </span>
        </div>
        <div className="grid gap-3">
          <h1 className="text-h1">Design system voyage — billetterie SETRAG</h1>
          <p className="max-w-170 text-body-lg text-ink-muted">
            L&apos;heure d&apos;abord, le prix ensuite, le reste en gris. Hauteur
            d&apos;action minimale 44 px, un seul bouton principal par écran, et
            aucune information portée par la couleur seule.
          </p>
        </div>
      </header>

      <Section index="01" title="Fondations">
        <Panel title="Neutres et accents">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {[
              ["canvas", "bg-canvas"],
              ["surface", "bg-surface"],
              ["surface-sunk", "bg-surface-sunk"],
              ["line", "bg-line"],
              ["ink-muted", "bg-ink-muted"],
              ["ink", "bg-ink"],
              ["accent", "bg-accent-base"],
              ["accent-soft", "bg-accent-soft"],
              ["second", "bg-second"],
              ["success", "bg-success"],
              ["warning", "bg-warning"],
              ["danger", "bg-danger"],
            ].map(([name, cls]) => (
              <div key={name} className="grid gap-2">
                <span
                  className={`h-14 rounded-md border border-line ${cls}`}
                  aria-hidden
                />
                <span className="tabular text-[11px] leading-none text-ink-faint">
                  {name}
                </span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Typographie">
          <div className="grid gap-4">
            <p className="text-display">Display 49</p>
            <p className="text-h1">Titre 1 — 39</p>
            <p className="text-h2">Titre 2 — 31</p>
            <p className="text-h3">Titre 3 — 25</p>
            <p className="text-h4">Titre 4 — 20</p>
            <p className="text-body">
              Corps 16 — les heures et les montants passent en mono pour
              s&apos;aligner d&apos;une ligne à l&apos;autre.
            </p>
            <p className="tabular text-time">07:42 · 18 000 F</p>
          </div>
        </Panel>
      </Section>

      <Section index="02" title="Composants de base">
        <Panel title="Boutons" note="radius 999 · h 36/44/52 · label 16/600">
          <div className="flex flex-wrap items-center gap-3">
            <Button size="lg">Rechercher</Button>
            <Button size="lg" variant="secondary">
              Modifier
            </Button>
            <Button size="lg" variant="ghost">
              Voir le détail
            </Button>
            <Button size="lg" variant="danger">
              Annuler le billet
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm">sm — 36</Button>
            <Button>md — 44</Button>
            <Button size="lg">lg — 52</Button>
            <Button disabled>désactivé</Button>
            <Button loading loadingLabel="Recherche…">
              Rechercher
            </Button>
          </div>
        </Panel>

        <div className="grid gap-8 lg:grid-cols-2">
          <Panel title="Champs de saisie">
            <Field label="Gare de départ" hint="Tapez au moins 2 lettres, on complète le reste.">
              <Input placeholder="Gare, ville ou point d'arrêt" />
            </Field>
            <Field
              label="Numéro de téléphone"
              error="Il manque 2 chiffres pour valider le numéro."
            >
              <Input defaultValue="+241 06 12 34" />
            </Field>
            <Field label="Classe">
              <SelectNative defaultValue="economique">
                <option value="economique">Économique</option>
                <option value="confort">Confort</option>
                <option value="vip">VIP</option>
              </SelectNative>
            </Field>
            <Field label="Carte de réduction" disabled>
              <Input placeholder="Ajoutez d'abord un voyageur" />
            </Field>
            <Field label="Un mot pour l'assistance">
              <Textarea placeholder="Décrivez votre situation" />
            </Field>
          </Panel>

          <div className="grid gap-8">
            <Panel title="Sélection">
              <Checkbox label="Direct uniquement" defaultChecked />
              <Checkbox label="Avec bagage volumineux" />
              <Checkbox label="Voiture calme" disabled />
              <RadioGroup defaultValue="ar">
                <Radio value="ar" label="Aller-retour" />
                <Radio value="as" label="Aller simple" />
              </RadioGroup>
              <Switch label="Alertes retard" defaultChecked />
              <Switch label="Lettre d'information" />
            </Panel>

            <Panel title="Tags et pastilles">
              <div className="flex flex-wrap gap-2">
                <Tag tone="accent">Éco</Tag>
                <Tag tone="second">Dernières places</Tag>
                <Tag tone="success">À l&apos;heure</Tag>
                <Tag tone="warning">+12 min</Tag>
                <Tag tone="danger">Supprimé</Tag>
                <Tag tone="neutral">1 correspondance</Tag>
                <Tag tone="strong">Choix du moment</Tag>
              </div>
              <div className="flex flex-wrap gap-2">
                <Tag tone="filterOn" onRemove={() => {}}>
                  Filtre actif
                </Tag>
                <Tag tone="filterOff">Filtre inactif</Tag>
              </div>
            </Panel>
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          <Panel title="Messages en ligne">
            <InlineMessage tone="info" title="Travaux prévus">
              — ligne modifiée les week-ends d&apos;août.
            </InlineMessage>
            <InlineMessage tone="success" title="Paiement accepté">
              — vos billets sont dans l&apos;application.
            </InlineMessage>
            <InlineMessage tone="warning" title="Retard annoncé">
              — votre train partira 12 min plus tard. Votre place est conservée.
            </InlineMessage>
            <InlineMessage tone="danger" title="Train supprimé">
              — on vous propose deux solutions.
            </InlineMessage>
            <ToastBar action="Voir">Billet ajouté à votre carnet</ToastBar>
          </Panel>

          <div className="grid gap-8">
            <Panel title="Progression">
              <Stepper
                current={1}
                steps={[
                  { label: "Voyageurs" },
                  { label: "Paiement" },
                  { label: "Billets" },
                ]}
              />
            </Panel>
            <Panel title="Chargement et vide">
              <SkeletonLines />
              <EmptyState
                title="Aucun train sur ce créneau"
                description="Essayez le jour suivant, ou élargissez à toute la journée — il reste des places le matin."
                action={
                  <Button variant="ghost" size="sm">
                    Voir le 8 août
                  </Button>
                }
              />
            </Panel>
          </div>
        </div>
      </Section>

      <Section index="03" title="Composants métier">
        <div className="grid gap-4">
          <SubTitle>Barre de recherche voyage</SubTitle>
          <TripSearchBar
            onSwap={() => {}}
            onSubmit={() => {}}
            origin={<SlotValue>Owendo (toutes gares)</SlotValue>}
            destination={<SlotValue>Franceville</SlotValue>}
            dates={
              <span className="flex h-14 items-center gap-2 overflow-hidden rounded-md border border-line-strong px-4">
                <span className="tabular text-[15px] leading-none font-medium">
                  ven. 07/08
                </span>
                <span className="text-[15px] leading-none text-ink-faint">→</span>
                <span className="tabular text-[15px] leading-none font-medium">
                  dim. 09/08
                </span>
              </span>
            }
            passengers={<SlotValue>2 adultes, 1 enfant</SlotValue>}
            shortcuts={
              <>
                <Tag tone="neutral">Carte Jeune</Tag>
                <Tag tone="neutral">+ Ajouter une carte</Tag>
                <span className="px-1 text-[12px] leading-none font-medium text-accent-ink">
                  Direct uniquement
                </span>
              </>
            }
          />
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          <div className="grid gap-4">
            <SubTitle>Calendrier des prix</SubTitle>
            <PriceCalendar
              monthLabel="Août 2026"
              selected={day}
              onSelect={setDay}
              onNext={() => {}}
              days={[
                { day: 3, priceXaf: null, value: "2026-08-03" },
                { day: 4, priceXaf: 18000, value: "2026-08-04" },
                { day: 5, priceXaf: 18000, value: "2026-08-05" },
                { day: 6, priceXaf: 27000, value: "2026-08-06" },
                { day: 7, priceXaf: 31000, value: "2026-08-07" },
                { day: 8, priceXaf: 40500, value: "2026-08-08" },
                { day: 9, priceXaf: 36000, value: "2026-08-09" },
              ]}
            />
          </div>

          <div className="grid gap-4">
            <SubTitle>Bandeau info trafic</SubTitle>
            <TrafficBanner
              title="Circulation perturbée entre Booué et Lopé"
              description="Jusqu'à 40 min de retard sur les dessertes de l'après-midi. Vos billets restent valables sur le train suivant, sans échange."
              action={
                <span className="text-[13px] leading-none font-semibold">
                  Suivre la situation en direct →
                </span>
              }
            />
            <TrafficBanner
              tone="info"
              title="Travaux les week-ends du 15 au 30 août"
              description="Départs avancés de 10 min au départ d'Owendo. Les horaires affichés tiennent déjà compte des travaux."
            />
          </div>
        </div>

        <div className="grid gap-4">
          <SubTitle note="standard · correspondance · sélectionné · supprimé">
            Carte de résultat trajet
          </SubTitle>
          <div className="grid gap-3">
            <TripResultCard
              departureAt={D(7, 42)}
              arrivalAt={D(21, 38)}
              durationMinutes={836}
              originLabel="Owendo"
              destinationLabel="Franceville"
              priceXaf={18000}
              tags={[
                { label: "À l'heure", tone: "success" },
                { label: "Éco · 2,4 kg CO₂", tone: "accent" },
              ]}
              onSelect={() => {}}
            />
            <TripResultCard
              departureAt={D(8, 11)}
              arrivalAt={D(23, 55)}
              durationMinutes={944}
              connectionLabel="1 arrêt · Booué"
              originLabel="Owendo"
              destinationLabel="Franceville"
              priceXaf={27000}
              tags={[
                { label: "Départ retardé de 12 min", tone: "warning" },
                { label: "Dernières places", tone: "second" },
              ]}
              onSelect={() => {}}
            />
            <TripResultCard
              state="selected"
              departureAt={D(10, 6)}
              arrivalAt={D(23, 4)}
              durationMinutes={778}
              originLabel="Owendo"
              destinationLabel="Franceville"
              priceXaf={40500}
              selectionNote="Sélectionné pour l'aller · voiture 12, place 44 côté fenêtre"
              onSelect={() => {}}
            />
            <TripResultCard
              state="cancelled"
              departureAt={D(13, 42)}
              arrivalAt={D(23, 42)}
              durationMinutes={600}
              originLabel="Owendo"
              destinationLabel="Franceville"
              cancelledNotice="Nous vous replaçons sans frais sur le 14:06 — même prix, même classe."
              onSelect={() => {}}
            />
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          <div className="grid gap-4">
            <SubTitle note="valide · utilisé · échangé · remboursé · hors ligne">
              Billet
            </SubTitle>
            <Ticket
              legLabel="Aller · vendredi 7 août"
              routeLabel="Owendo → Franceville"
              departureAt={D(7, 42)}
              arrivalAt={D(21, 38)}
              departurePlace="Gare d'Owendo · Hall 1"
              arrivalPlace="Gare de Franceville"
              seatLabel="12 · 44"
              seatNote="Fenêtre, sens marche"
              passengerLabel="Camille Roux · Tarif Jeune"
              reference="KX7 24Q"
              conditionsNote="Échangeable jusqu'à 30 min avant le départ"
              qrCode={
                <span
                  aria-hidden
                  className="size-full rounded-xs"
                  style={{
                    background:
                      "repeating-linear-gradient(90deg, var(--c-canvas) 0 4px, var(--c-ink) 4px 7px)",
                  }}
                />
              }
            />
          </div>

          <div className="grid gap-4">
            <SubTitle>Tunnel de paiement</SubTitle>
            <CheckoutSummary
              selectedOption={payment}
              onSelectOption={setPayment}
              lines={[
                { label: "Aller · 07:42 → 21:38 · Économique", amountXaf: 36000 },
                { label: "Retour · 18:12 → 08:07 · Économique", amountXaf: 36000 },
                { label: "Tarif Jeune (2 voyageurs)", amountXaf: 7200, discount: true },
              ]}
              options={[
                {
                  id: "mobile-money",
                  label: "Airtel Money",
                  note: "•••• 4242",
                  noteMono: true,
                },
                { id: "carte", label: "Carte bancaire", note: "Visa, Mastercard" },
              ]}
              footnote="Vos billets arrivent dans l'application dès le paiement validé. Annulation gratuite jusqu'au 6 août."
            />
          </div>
        </div>
      </Section>
    </main>
  )
}

function Section({
  index,
  title,
  children,
}: {
  index: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="grid gap-12">
      <div className="grid gap-3">
        <span className="text-mono-label text-accent-base">
          {index} — {title}
        </span>
        <h2 className="text-h2">{title}</h2>
      </div>
      {children}
    </section>
  )
}

function Panel({
  title,
  note,
  children,
}: {
  title: string
  note?: string
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-6 rounded-lg border border-line bg-surface p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h3 className="text-h4">{title}</h3>
        {note && (
          <span className="tabular text-[12px] leading-none text-ink-faint">
            {note}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

function SubTitle({
  children,
  note,
}: {
  children: React.ReactNode
  note?: string
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-3">
      <h3 className="text-h4">{children}</h3>
      {note && (
        <span className="tabular text-[12px] leading-none text-ink-faint">
          {note}
        </span>
      )}
    </div>
  )
}

function SlotValue({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex h-14 items-center overflow-hidden rounded-md border border-line-strong px-4 text-[16px] leading-tight font-medium text-ellipsis whitespace-nowrap">
      {children}
    </span>
  )
}
