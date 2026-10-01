"use client"

import { Check, Luggage, Phone, Plus, Printer } from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { Suspense, useEffect, useRef, useState } from "react"

import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { EmptyState } from "@workspace/ui/components/empty-state"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { PastilleBillet, type StatutBillet } from "@workspace/ui/voyage/statut"
import { cn } from "@workspace/ui/lib/utils"

import { CelluleDouble, Indicateur, LienBouton, Panneau } from "@/components/charte"
import { signalerNavigation } from "@/coquille/filet-navigation"
import { libelleMoyen, montant, type ChoixMoyen, type MoyenPaiement } from "@/lib/agent-data"
import { effacerBrouillonVente } from "@/lib/sale-draft"

import { BilletImprime, categorieCourte } from "./guichet/billet-imprime"
import { CadreGuichet, ChargementEcran, useGuichet } from "./guichet/cadre"
import { MODE_E2E, messageErreur, useEcriture, useLecture, type DossierVente } from "./guichet/donnees"
import { Touche } from "./guichet/elements"
import { useImpression } from "./guichet/impression"
import { iconeMoyen } from "./guichet/reglement"

function choixDepuis(moyen: string | null): ChoixMoyen {
  if (moyen === "visa" || moyen === "mastercard") return "carte"
  return (moyen ?? "especes") as ChoixMoyen
}

/**
 * Vente enregistrée : billets émis, aperçu du ticket imprimé, réimpression en
 * duplicata tracé, nouvelle vente d'une touche (N).
 */
export function SaleConfirmationScreen({
  dossier,
  piedBillet,
  mentionDuplicata,
  onNouvelleVente,
  onImprimer,
  onDuplicata,
}: {
  dossier: DossierVente
  piedBillet?: string
  mentionDuplicata: string
  onNouvelleVente: () => void
  onImprimer: (billets: DossierVente["billets"], duplicata?: string) => void
  onDuplicata: (billet: DossierVente["billets"][number]) => Promise<string>
}) {
  const [courant, setCourant] = useState(0)
  const [message, setMessage] = useState<{ ton: "success" | "danger"; texte: string } | null>(null)
  const [enCours, setEnCours] = useState(false)
  const billets = dossier.billets
  const billet = billets[Math.min(courant, billets.length - 1)]
  const paiement = dossier.paiements.find((p) => p.statut === "confirme")
  const moyen = dossier.vente.moyen as MoyenPaiement | null
  const IconeMoyen = iconeMoyen(choixDepuis(moyen))
  const telephone = dossier.vente.telephone ?? billets.find((b) => b.voyageur.telephone)?.voyageur.telephone ?? null

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="grid min-w-0 gap-4">
        <div className="flex items-center gap-4 rounded-md bg-success-soft px-5 py-4 text-success-ink" role="status">
          <span className="grid size-12 shrink-0 place-items-center rounded-pill bg-success text-ink-inverse">
            <Check aria-hidden className="size-6" />
          </span>
          <div className="grid min-w-0 gap-0.5">
            <h1 className="text-[22px] leading-tight font-bold text-ink">Vente enregistrée</h1>
            <p className="text-[14px]">
              <span className="tabular">{dossier.vente.numero}</span> · {billets.length} billet{billets.length > 1 ? "s" : ""} · caisse mise à jour
            </p>
          </div>
        </div>

        <Panneau titre="Billets" plein>
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-[14px]">
              <thead>
                <tr className="bg-surface-sunk text-left text-[11.5px] font-semibold tracking-[0.05em] text-ink-muted uppercase">
                  <th scope="col" className="px-3.5 py-2.5">Billet</th>
                  <th scope="col" className="px-3.5 py-2.5">Voyageur</th>
                  <th scope="col" className="px-3.5 py-2.5">Place</th>
                  <th scope="col" className="px-3.5 py-2.5 text-right">Prix</th>
                  <th scope="col" className="px-3.5 py-2.5">État</th>
                </tr>
              </thead>
              <tbody>
                {billets.map((b, index) => (
                  <tr
                    key={b.id}
                    className={cn("cursor-pointer border-t border-line hover:bg-surface-sunk", index === courant && "bg-accent-soft shadow-[inset_3px_0_0_var(--c-accent)] hover:bg-accent-soft")}
                    onClick={() => setCourant(index)}
                    aria-selected={index === courant}
                  >
                    <td className="tabular px-3.5 py-2.5 text-[13px] whitespace-nowrap">{b.numero}</td>
                    <td className="px-3.5 py-2.5">
                      <CelluleDouble haut={`${b.voyageur.prenom} ${b.voyageur.nom}`} bas={b.reduction ? `${categorieCourte(b.reduction)} −${b.reductionPct} %` : "Adulte"} />
                    </td>
                    <td className="tabular px-3.5 py-2.5 whitespace-nowrap">{b.place ? `${b.voiture ?? ""} · ${b.place}` : "—"}</td>
                    <td className="px-3.5 py-2.5 text-right font-mono tabular-nums">{montant(b.prix)}</td>
                    <td className="px-3.5 py-2.5">
                      <PastilleBillet statut={b.statut as StatutBillet} />
                      {b.duplicatas > 0 ? <small className="ml-2 text-[12px] text-ink-muted">{b.duplicatas} duplicata{b.duplicatas > 1 ? "s" : ""}</small> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panneau>

        <div className="grid gap-3 md:grid-cols-2">
          <Indicateur
            libelle={libelleMoyen(moyen)}
            icone={IconeMoyen}
            valeur={montant(dossier.vente.montants.ttc)}
            unite="XAF"
            evolution={{
              sens: "neutre",
              texte:
                paiement?.remis !== null && paiement?.remis !== undefined
                  ? `Reçu ${montant(paiement.remis)} · rendu ${montant(paiement.rendu ?? 0)}`
                  : paiement?.reference
                    ? `Réf. ${paiement.reference}${paiement.simule ? " · confirmation simulée" : ""}`
                    : "Réglé au guichet",
            }}
          />
          <Indicateur
            libelle="Contact"
            icone={Phone}
            valeur={<span className="text-[18px]">{telephone ?? "Aucun téléphone"}</span>}
            evolution={{ sens: "neutre", texte: telephone ? "Numéro joint à la vente" : "Le billet papier fait foi" }}
          />
        </div>

        {message ? <InlineMessage tone={message.ton} title={message.texte} /> : null}

        <div className="flex flex-wrap gap-2">
          <Button type="button" size="lg" onClick={onNouvelleVente}>
            <Plus aria-hidden />
            Nouvelle vente
            <Touche surAccent>N</Touche>
          </Button>
          {billet ? (
            <LienBouton href={`/vente/bagage?billet=${encodeURIComponent(billet.numero)}`}>
              <Luggage aria-hidden />
              Ajouter un bagage
            </LienBouton>
          ) : null}
          <Button type="button" variant="ghost" onClick={() => onImprimer(billets.filter((b) => b.statut === "valide"))}>
            <Printer aria-hidden />
            Imprimer les billets
          </Button>
        </div>
      </div>

      {billet ? (
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-muted">
            <Printer aria-hidden className="size-4" />
            Aperçu 80 mm · billet {courant + 1} sur {billets.length}
            {billets.length > 1 ? (
              <span className="ml-auto flex gap-1" role="group" aria-label="Billet affiché">
                {billets.map((b, index) => (
                  <button
                    key={b.id}
                    type="button"
                    aria-pressed={index === courant}
                    onClick={() => setCourant(index)}
                    className={cn(
                      "tabular grid size-11 place-items-center rounded-pill border text-[13px] font-semibold",
                      index === courant ? "border-accent-base bg-accent-soft text-accent-ink" : "border-line-strong bg-surface"
                    )}
                  >
                    {index + 1}
                  </button>
                ))}
              </span>
            ) : null}
          </div>
          <BilletImprime dossier={dossier} billet={billet} piedBillet={piedBillet} imprime />
          <Button
            type="button"
            variant="secondary"
            loading={enCours}
            loadingLabel="Duplicata…"
            disabled={billet.statut !== "valide"}
            onClick={async () => {
              setEnCours(true)
              setMessage(null)
              try {
                const mention = await onDuplicata(billet)
                setMessage({ ton: "success", texte: `${mention} imprimé · tracé au journal d'audit` })
              } catch (cause) {
                setMessage({ ton: "danger", texte: messageErreur(cause, "Le duplicata n'a pas pu être émis.") })
              } finally {
                setEnCours(false)
              }
            }}
          >
            <Printer aria-hidden />
            Réimprimer (duplicata)
          </Button>
          <p className="text-[12.5px] text-ink-muted">
            Chaque réimpression porte la mention {mentionDuplicata} et son rang : elle est tracée, jamais un second original.
          </p>
        </div>
      ) : null}
    </div>
  )
}

export function SaleConfirmationPageClient() {
  return (
    <Suspense fallback={null}>
      <Confirmation />
    </Suspense>
  )
}

function Confirmation() {
  const router = useRouter()
  const { saleId } = useParams<{ saleId: string }>()
  const params = useSearchParams()
  const { contexte } = useGuichet()
  const dossier = useLecture(api.functions.guichet.vente, saleId ? { venteId: saleId as never } : "skip")
  const dupliquer = useEcriture(api.functions.sales.reprintTicket)
  const { imprimer, zone } = useImpression()
  const dejaImprime = useRef(false)

  // La vente est enregistrée : le brouillon du tunnel n'a plus d'objet.
  useEffect(() => {
    effacerBrouillonVente()
  }, [])

  const imprimerBillets = (billets: DossierVente["billets"], duplicata?: string) => {
    if (!dossier || billets.length === 0) return
    imprimer(
      billets.map((b) => (
        <BilletImprime key={b.id} dossier={dossier} billet={b} duplicata={duplicata} piedBillet={contexte?.parametres.piedBillet} />
      )),
      "ticket"
    )
  }

  // Option « Imprimer au guichet » : les billets sortent dès la confirmation.
  useEffect(() => {
    if (dejaImprime.current || MODE_E2E || params.get("imprimer") !== "1" || !dossier) return
    if (dossier.vente.statut !== "confirmee") return
    dejaImprime.current = true
    imprimerBillets(dossier.billets.filter((b) => b.statut === "valide"))
    router.replace(`/vente/confirmation/${saleId}` as Route)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dossier])

  const nouvelleVente = () => {
    effacerBrouillonVente()
    signalerNavigation()
    router.push("/vente/billet" as Route)
  }

  useEffect(() => {
    const ecouter = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      if ((event.target as HTMLElement | null)?.closest("input, textarea, select, [role='dialog']")) return
      if (event.key.toLowerCase() !== "n") return
      event.preventDefault()
      nouvelleVente()
    }
    window.addEventListener("keydown", ecouter)
    return () => window.removeEventListener("keydown", ecouter)
  })

  return (
    <CadreGuichet contexte={contexte}>
      {dossier === undefined ? (
        <ChargementEcran libelle="Chargement de la vente…" />
      ) : dossier === null ? (
        <div className="rounded-md border border-line bg-surface">
          <EmptyState
            title="Vente introuvable"
            description="Le numéro ne correspond à aucune vente. Retrouvez-la dans l'après-vente."
            action={<LienBouton href="/vente/operations">Rechercher une opération</LienBouton>}
          />
        </div>
      ) : dossier.vente.statut === "en_attente_paiement" ? (
        <InlineMessage tone="warning" title="Paiement en attente.">
          La vente {dossier.vente.numero} attend encore la confirmation de l&apos;opérateur.{" "}
          <Link href={"/vente/billet?etape=encaissement" as Route} className="font-semibold underline">
            Revenir à l&apos;encaissement
          </Link>
        </InlineMessage>
      ) : dossier.vente.produit !== "billet" ? (
        <InlineMessage tone="info" title="Cette opération n'est pas une vente de billet.">
          <Link href={`/vente/operations?op=${saleId}` as Route} className="font-semibold underline">
            Ouvrir son dossier
          </Link>
        </InlineMessage>
      ) : (
        <SaleConfirmationScreen
          dossier={dossier}
          piedBillet={contexte?.parametres.piedBillet}
          mentionDuplicata={contexte?.parametres.mentionDuplicata ?? "DUPLICATA"}
          onNouvelleVente={nouvelleVente}
          onImprimer={(billets) => imprimerBillets(billets)}
          onDuplicata={async (billet) => {
            const resultat = await dupliquer({ ticketId: billet.id as never })
            const mention = `${contexte?.parametres.mentionDuplicata ?? "DUPLICATA"} N°${resultat.duplicateCount}`
            imprimerBillets([billet], mention)
            return mention
          }}
        />
      )}
      {zone}
    </CadreGuichet>
  )
}
