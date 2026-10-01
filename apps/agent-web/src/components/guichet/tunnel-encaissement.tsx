"use client"

import { Tenue } from "@workspace/ui/components/compte-a-rebours"

import { dateCourte, heure, libelleClasse, montant, nomTrain, xaf } from "@/lib/agent-data"
import type { BrouillonVente } from "@/lib/sale-draft"

import type { Categorie, Gare } from "./donnees"
import { LigneRecap, Recap } from "./elements"
import { ChoixMoyens, ZoneReglement, type EtatReglement } from "./reglement"
import { justificatif, libelleCategorie } from "./vente-billet"

/** Étape « Encaissement » : le moyen, sa saisie, et le récapitulatif fiscal. */
export function EtapeEncaissement({
  brouillon,
  gares,
  categories,
  reglement,
  onReglement,
  tentativesMax,
  tenueActive,
  disabled,
}: {
  brouillon: BrouillonVente
  gares: readonly Gare[]
  categories: readonly Categorie[]
  reglement: EtatReglement
  onReglement: (etat: EtatReglement) => void
  tentativesMax: number
  tenueActive: number | null
  disabled?: boolean
}) {
  const desserte = brouillon.desserte!
  const tenue = brouillon.tenue!
  const origine = gares.find((g) => g._id === brouillon.origineId)?.name ?? "—"
  const arrivee = gares.find((g) => g._id === brouillon.arriveeId)?.name ?? "—"
  const ttc = tenue.montants.ttc

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="grid min-w-0 gap-4">
        <ChoixMoyens valeur={reglement.moyen} onChange={(moyen) => onReglement({ ...reglement, moyen })} />
        <ZoneReglement etat={reglement} onChange={onReglement} total={ttc} tentativesMax={tentativesMax} disabled={disabled} />
      </div>
      <div className="grid gap-3">
        <Recap
          titre={`${origine} → ${arrivee}`}
          sousTitre={`${dateCourte(desserte.serviceDate)} · ${heure(desserte.departAt)} → ${heure(desserte.arriveeAt)} · ${nomTrain(desserte.trainType, desserte.trainNumber)} · ${libelleClasse(desserte.classe)}`}
        >
          {brouillon.voyageurs.map((voyageur, index) => {
            const billet = tenue.billets[index]
            const remise = voyageur.categorie ? justificatif(voyageur.categorie, categories)?.split(" · ")[0] : null
            return (
              <LigneRecap
                key={index}
                libelle={
                  <span className="grid">
                    <span className="text-ink">
                      {[voyageur.prenom, voyageur.nom].filter(Boolean).join(" ") || `Voyageur ${index + 1}`} · {libelleCategorie(voyageur.categorie, categories)}
                      {remise ? ` ${remise}` : ""}
                    </span>
                    <small className="tabular text-[12.5px]">{billet?.place ? `${billet.voiture ?? ""} · ${billet.place}` : "—"}</small>
                  </span>
                }
                valeur={billet ? montant(billet.prix) : "—"}
              />
            )
          })}
          <LigneRecap libelle="Montant HT" valeur={montant(tenue.montants.ht)} />
          <LigneRecap libelle="TVA" valeur={montant(tenue.montants.vat)} />
          <LigneRecap libelle="CSS" valeur={montant(tenue.montants.css)} />
          <LigneRecap libelle="Total TTC" valeur={xaf(ttc)} fort />
        </Recap>
        {tenueActive ? <Tenue fin={tenueActive}>Places tenues encore</Tenue> : null}
      </div>
    </div>
  )
}
