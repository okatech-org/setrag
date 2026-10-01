"use client"

import {
  Banknote,
  Building2,
  CircleAlert,
  CreditCard,
  Delete,
  RefreshCw,
  Send,
  Smartphone,
  type LucideIcon,
} from "lucide-react"
import { useEffect, useRef } from "react"

import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { formatRebours, useCompteARebours } from "@workspace/ui/components/compte-a-rebours"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@workspace/ui/components/dialog"
import { Field, Input, SelectNative } from "@workspace/ui/components/field"
import { SegmentedControl } from "@workspace/ui/components/segmented-control"
import { Voie } from "@workspace/ui/components/voie"
import { flecheRadio } from "@workspace/ui/lib/clavier"
import { cn } from "@workspace/ui/lib/utils"

import { Panneau } from "@/components/charte"
import { MOYENS, montant, xaf, type ChoixMoyen, type MoyenPaiement } from "@/lib/agent-data"

import { useLecture, type ClientConventionne, type Paiement } from "./donnees"
import { Encart, Touche } from "./elements"

/* ════════════════════════════ État du règlement ═══════════════════════════ */

export interface EtatReglement {
  moyen: ChoixMoyen
  /** Espèces reçues, en chiffres saisis. */
  recu: string
  telephone: string
  reference: string
  carte: "visa" | "mastercard"
  compteId: string
}

export const REGLEMENT_INITIAL: EtatReglement = {
  moyen: "especes",
  recu: "",
  telephone: "",
  reference: "",
  carte: "visa",
  compteId: "",
}

const ICONES: Record<ChoixMoyen, LucideIcon> = {
  especes: Banknote,
  airtel_money: Smartphone,
  moov_money: Smartphone,
  carte: CreditCard,
  clickpay: Send,
  en_compte: Building2,
}

export function iconeMoyen(moyen: ChoixMoyen) {
  return ICONES[moyen]
}

/** Moyen tel que le backend l'enregistre (la carte se précise). */
export function moyenBackend(etat: EtatReglement): MoyenPaiement {
  return etat.moyen === "carte" ? etat.carte : etat.moyen
}

export function estADistance(moyen: ChoixMoyen) {
  return MOYENS.find((m) => m.code === moyen)?.distance ?? false
}

/** Le règlement est-il complet ? Sinon, la phrase du bouton dit pourquoi. */
export function reglementPret(etat: EtatReglement, total: number): { pret: true } | { pret: false; raison: string } {
  switch (etat.moyen) {
    case "especes":
      return Number(etat.recu || 0) >= total ? { pret: true } : { pret: false, raison: "Montant reçu insuffisant" }
    case "airtel_money":
    case "moov_money":
    case "clickpay":
      return etat.telephone.replace(/\D/g, "").length >= 8 ? { pret: true } : { pret: false, raison: "Numéro du payeur à saisir" }
    case "en_compte":
      if (!etat.compteId) return { pret: false, raison: "Client conventionné à choisir" }
      return etat.reference.trim() ? { pret: true } : { pret: false, raison: "Bon de commande à saisir" }
    case "carte":
      return { pret: true }
  }
}

/** Saisie d'un chiffre au pavé ou au clavier ; sept chiffres au plus. */
export function saisirChiffre(recu: string, touche: string) {
  if (touche === "⌫") return recu.slice(0, -1)
  return (recu + touche).replace(/^0+/, "").slice(0, 7)
}

/** Montants ronds proposés au-dessus du total : ce que le client tend. */
export function coupuresRapides(total: number) {
  const paliers = [1_000, 5_000, 10_000, 50_000, 100_000]
  const valeurs = new Set<number>()
  for (const palier of paliers) {
    const arrondi = Math.ceil(total / palier) * palier
    if (arrondi > total) valeurs.add(arrondi)
  }
  return [...valeurs].sort((a, b) => a - b).slice(0, 3)
}

/* ══════════════════════════ Choix du moyen ════════════════════════════════ */

/** Les moyens en cartes, chacun avec sa touche. */
export function ChoixMoyens({
  valeur,
  onChange,
  permis,
  compact,
}: {
  valeur: ChoixMoyen
  onChange: (moyen: ChoixMoyen) => void
  /** Moyens proposés ; tous par défaut. */
  permis?: readonly ChoixMoyen[]
  compact?: boolean
}) {
  const options = MOYENS.filter((m) => !permis || permis.includes(m.code))
  return (
    <div
      role="radiogroup"
      aria-label="Moyen de paiement"
      onKeyDown={(event) => flecheRadio(event, options.map((o) => o.code), valeur, (v) => onChange(v as ChoixMoyen))}
      className={cn("grid gap-2 sm:grid-cols-2", compact ? "lg:grid-cols-2" : "2xl:grid-cols-3")}
    >
      {options.map((option) => {
        const actif = option.code === valeur
        const Icone = ICONES[option.code]
        return (
          <button
            key={option.code}
            type="button"
            role="radio"
            aria-checked={actif}
            data-valeur={option.code}
            tabIndex={actif ? 0 : -1}
            onClick={() => onChange(option.code)}
            className={cn(
              "flex min-h-16 items-center gap-3 rounded-md border px-3.5 py-2.5 text-left transition-colors duration-[var(--dur-fast)]",
              actif ? "border-accent-base bg-accent-soft shadow-[inset_0_0_0_1px_var(--c-accent)]" : "border-line-strong bg-surface hover:bg-surface-sunk"
            )}
          >
            <span
              aria-hidden
              className={cn(
                "grid size-[22px] shrink-0 place-items-center rounded-pill border-[1.5px]",
                actif ? "border-accent-base" : "border-line-strong"
              )}
            >
              {actif ? <span className="size-2.5 rounded-pill bg-accent-base" /> : null}
            </span>
            <Icone aria-hidden className={cn("size-[18px] shrink-0", actif ? "text-accent-ink" : "text-ink-muted")} />
            <span className="grid min-w-0 flex-1 leading-tight">
              <b className="truncate text-[15px] font-semibold">{option.libelle}</b>
              <small className="truncate text-[12.5px] text-ink-muted">{option.aide}</small>
            </span>
            <Touche>{option.touche}</Touche>
          </button>
        )
      })}
    </div>
  )
}

/* ══════════════════════════ Zone du moyen choisi ══════════════════════════ */

/** Pavé numérique du guichet : chiffres, « 000 », effacement. */
export function Pave({ onTouche, disabled }: { onTouche: (touche: string) => void; disabled?: boolean }) {
  return (
    <div className="grid grid-cols-3 gap-2" role="group" aria-label="Pavé numérique">
      {["1", "2", "3", "4", "5", "6", "7", "8", "9", "000", "0", "⌫"].map((touche) => (
        <button
          key={touche}
          type="button"
          disabled={disabled}
          aria-label={touche === "⌫" ? "Effacer le dernier chiffre" : touche}
          onClick={() => onTouche(touche)}
          className={cn(
            "grid min-h-14 place-items-center rounded-md border border-line-strong bg-surface transition-[background-color,transform] duration-[var(--dur-micro)] hover:bg-surface-sunk active:scale-[0.97] disabled:opacity-45",
            touche === "⌫" ? "text-[14px] font-semibold text-accent-ink" : "tabular text-[20px] font-semibold text-ink"
          )}
        >
          {touche === "⌫" ? <Delete aria-hidden className="size-5" /> : touche}
        </button>
      ))}
    </div>
  )
}

/** Reçu du client et monnaie à rendre, en grand : le vendeur les lit de loin. */
export function RenduMonnaie({ recu, total }: { recu: number; total: number }) {
  const rendu = recu - total
  return (
    <div className="grid overflow-hidden rounded-md border border-line" aria-live="polite">
      <div className="grid gap-1 bg-surface px-4 py-3.5">
        <span className="text-[12.5px] font-semibold text-ink-muted">Reçu du client</span>
        <b className="text-[28px] leading-none font-bold tabular-nums">{montant(recu)}</b>
      </div>
      <div className="grid gap-1 bg-brand-encre px-4 py-3.5 text-[oklch(0.97_0.006_257)]">
        <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[oklch(0.78_0.016_257)]">
          {rendu < 0 ? <CircleAlert aria-hidden className="size-4" /> : null}
          {rendu < 0 ? "Il manque" : "À rendre"}
        </span>
        <b className={cn("text-[28px] leading-none font-bold tabular-nums", rendu < 0 ? "text-[oklch(0.8_0.12_25)]" : "text-brand-jaune")}>
          {montant(Math.abs(rendu))}
        </b>
      </div>
    </div>
  )
}

export function ZoneReglement({
  etat,
  onChange,
  total,
  tentativesMax = 3,
  disabled,
}: {
  etat: EtatReglement
  onChange: (etat: EtatReglement) => void
  total: number
  tentativesMax?: number
  disabled?: boolean
}) {
  const clients = useLecture(api.functions.guichet.clientsConventionnes, etat.moyen === "en_compte" ? {} : "skip")
  const maj = (partiel: Partial<EtatReglement>) => onChange({ ...etat, ...partiel })

  if (etat.moyen === "especes") {
    const recu = Number(etat.recu || 0)
    return (
      <Panneau titre="Espèces" icone={Banknote}>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Montants rapides">
          {[total, ...coupuresRapides(total)].map((valeur, index) => (
            <button
              key={`${index}-${valeur}`}
              type="button"
              disabled={disabled}
              onClick={() => maj({ recu: String(valeur) })}
              className="tabular min-h-11 rounded-pill border border-line-strong bg-surface px-3.5 text-[14px] font-semibold hover:border-accent-base"
            >
              {index === 0 ? "Montant exact" : montant(valeur)}
            </button>
          ))}
        </div>
        <div className="grid items-stretch gap-4 md:grid-cols-2">
          <div className="grid content-start gap-3">
            <Field label="Montant reçu (XAF)" htmlFor="montant-recu" hint="Tapez au clavier ou au pavé.">
              <Input
                id="montant-recu"
                inputMode="numeric"
                autoComplete="off"
                value={etat.recu ? montant(Number(etat.recu)) : ""}
                disabled={disabled}
                onChange={(event) => maj({ recu: event.target.value.replace(/\D/g, "").slice(0, 7) })}
                className="tabular text-right text-[20px] font-semibold"
              />
            </Field>
            <RenduMonnaie recu={recu} total={total} />
          </div>
          <Pave disabled={disabled} onTouche={(touche) => maj({ recu: saisirChiffre(etat.recu, touche) })} />
        </div>
      </Panneau>
    )
  }

  if (etat.moyen === "airtel_money" || etat.moyen === "moov_money" || etat.moyen === "clickpay") {
    const libelle = MOYENS.find((m) => m.code === etat.moyen)!.libelle
    return (
      <Panneau titre={libelle} icone={etat.moyen === "clickpay" ? Send : Smartphone}>
        <Field
          label={etat.moyen === "clickpay" ? "Envoyer le lien au" : "Numéro du payeur"}
          htmlFor="telephone-payeur"
          hint={
            etat.moyen === "clickpay"
              ? "Le client paie depuis son téléphone ; la vente se confirme d'elle-même."
              : "Le client valide avec son code secret. La demande attend 3 minutes au plus."
          }
        >
          <Input
            id="telephone-payeur"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            placeholder="+241 77 12 34 56"
            value={etat.telephone}
            disabled={disabled}
            onChange={(event) => maj({ telephone: event.target.value })}
          />
        </Field>
        <Encart icone={RefreshCw} titre={`${tentativesMax} tentatives au plus`}>
          Paramétrage réseau · au-delà, proposez un autre moyen de paiement.
        </Encart>
        <Encart icone={CircleAlert} titre="Opérateur non raccordé" ton="info">
          La réponse de l&apos;opérateur est simulée quelques secondes après la demande. Un numéro finissant par 000 est refusé.
        </Encart>
      </Panneau>
    )
  }

  if (etat.moyen === "carte") {
    return (
      <Panneau titre="Carte bancaire" icone={CreditCard}>
        <SegmentedControl
          label="Réseau de la carte"
          size="touch"
          value={etat.carte}
          onValueChange={(valeur) => maj({ carte: valeur as "visa" | "mastercard" })}
          options={[
            { value: "visa", label: "Visa" },
            { value: "mastercard", label: "Mastercard" },
          ]}
        />
        <Encart icone={Send} titre={`Montant à saisir sur le TPE : ${xaf(total)}`}>
          Le client présente sa carte. Le ticket du TPE sert au rapprochement du soir.
        </Encart>
        <Field label="N° du ticket TPE" htmlFor="ticket-tpe" hint="Facultatif · recopié sur l'état de caisse.">
          <Input
            id="ticket-tpe"
            autoComplete="off"
            value={etat.reference}
            disabled={disabled}
            onChange={(event) => maj({ reference: event.target.value })}
          />
        </Field>
      </Panneau>
    )
  }

  const choisi = clients?.find((c) => c.id === etat.compteId)
  return (
    <Panneau titre="En compte" icone={Building2}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Client conventionné" htmlFor="client-conventionne" hint={clients && clients.length === 0 ? "Aucun client conventionné actif." : undefined}>
          <SelectNative
            id="client-conventionne"
            value={etat.compteId}
            disabled={disabled || !clients || clients.length === 0}
            onChange={(event) => maj({ compteId: event.target.value })}
          >
            <option value="">{clients === undefined ? "Chargement…" : "Choisir un client"}</option>
            {(clients ?? []).map((client: ClientConventionne) => (
              <option key={client.id} value={client.id} disabled={client.disponible < total}>
                {client.nom}
                {client.disponible < total ? " · plafond atteint" : ""}
              </option>
            ))}
          </SelectNative>
        </Field>
        <Field label="Bon de commande" htmlFor="bon-commande">
          <Input
            id="bon-commande"
            autoComplete="off"
            placeholder="BC-2026-0412"
            value={etat.reference}
            disabled={disabled}
            onChange={(event) => maj({ reference: event.target.value })}
          />
        </Field>
      </div>
      <p className="text-small text-ink-muted">
        Facturé en fin de mois.
        {choisi ? (
          <>
            {" "}
            Plafond restant : <span className="tabular">{xaf(choisi.disponible)}</span>.
          </>
        ) : null}
      </p>
    </Panneau>
  )
}

/* ═════════════════════════ Attente de l'opérateur ═════════════════════════ */

/**
 * Attente d'un paiement mobile : une rame passe sur la voie tant que le
 * client n'a pas validé. La réponse arrive d'elle-même (souscription).
 */
export function AttentePaiement({
  paiementId,
  onConfirme,
  onEchec,
  onAnnuler,
}: {
  paiementId: string | null
  onConfirme: (paiement: Paiement) => void
  onEchec: (paiement: Paiement) => void
  onAnnuler: () => void
}) {
  const paiement = useLecture(api.functions.guichet.paiement, paiementId ? { paiementId: paiementId as never } : "skip")
  const restant = useCompteARebours(paiement?.expireA ?? undefined)
  const signale = useRef<string | null>(null)

  useEffect(() => {
    if (!paiement || signale.current === `${paiement.id}:${paiement.statut}`) return
    if (paiement.statut === "confirme") {
      signale.current = `${paiement.id}:${paiement.statut}`
      onConfirme(paiement)
    } else if (paiement.statut === "echoue" || paiement.statut === "expire") {
      signale.current = `${paiement.id}:${paiement.statut}`
      onEchec(paiement)
    }
  }, [paiement, onConfirme, onEchec])

  const libelle = paiement ? (MOYENS.find((m) => m.code === paiement.moyen)?.libelle ?? paiement.moyen) : ""
  return (
    <Dialog open={paiementId !== null} onOpenChange={(ouvert) => (!ouvert ? onAnnuler() : undefined)}>
      <DialogContent showCloseButton={false} className="max-w-[min(440px,calc(100%-2rem))] bg-surface text-ink">
        <div className="grid justify-items-center gap-3 px-2 py-4 text-center">
          <span className="grid size-[72px] place-items-center rounded-pill bg-accent-soft text-accent-ink">
            <Smartphone aria-hidden className="size-[34px] stroke-[1.7]" />
          </span>
          <DialogTitle className="text-[20px] font-bold">En attente du client</DialogTitle>
          <DialogDescription className="text-small max-w-[40ch] text-ink-muted">
            {paiement ? (
              <>
                Demande de <span className="tabular">{xaf(paiement.montant)}</span> envoyée sur {libelle}
                {paiement.telephone ? (
                  <>
                    {" "}
                    au <span className="tabular">{paiement.telephone}</span>
                  </>
                ) : null}
                . Le client valide avec son code secret.
              </>
            ) : (
              "Envoi de la demande à l'opérateur…"
            )}
          </DialogDescription>
          <Voie etat="attente" className="w-full max-w-[260px] flex-none" />
          <p role="timer" className="tabular text-[14px] text-ink-muted">
            {paiement?.expireA ? `Expire dans ${formatRebours(restant)}` : " "}
          </p>
          {paiement ? (
            <p className="text-[12.5px] text-ink-muted">
              Tentative {paiement.tentative} sur {paiement.tentativesMax}
              {paiement.simule ? " · réponse opérateur simulée" : ""}
            </p>
          ) : null}
          <Button type="button" variant="ghost" onClick={onAnnuler}>
            Annuler la demande
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
