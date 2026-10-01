"use client"

import { dateCourte, dateHeure, heure, libelleClasse, montant, nomTrain, xaf } from "@/lib/agent-data"

import type { DossierVente } from "./donnees"
import { CodeTicket, FiletTicket, LigneTicket, TicketThermique } from "./impression"
import { nomVoiture } from "./plan-voiture"

type Billet = DossierVente["billets"][number]

/** « ENFANT » → « Enfant » : le code de réduction, lisible sur le papier. */
export function categorieCourte(code: string) {
  const texte = code.replaceAll("_", " ").toLowerCase()
  return texte.charAt(0).toUpperCase() + texte.slice(1)
}

/** Part de TVA d'un billet, au prorata de la vente : la somme retombe juste. */
function tvaDuBillet(dossier: DossierVente, billet: Billet) {
  const { ttc, vat } = dossier.vente.montants
  return ttc > 0 ? Math.round((billet.prix * vat) / ttc) : 0
}

/**
 * Le billet tel qu'il sort de l'imprimante du guichet (80 mm) : train et
 * date, trajet en gros, place, voyageur, code Aztec signé, prix et TVA.
 */
export function BilletImprime({
  dossier,
  billet,
  duplicata,
  piedBillet,
  imprime,
}: {
  dossier: DossierVente
  billet: Billet
  duplicata?: string | null
  piedBillet?: string
  imprime?: boolean
}) {
  const desserte = dossier.desserte
  const pdv = dossier.vente.pointDeVente
  const voyageur = `${billet.voyageur.nom} ${billet.voyageur.prenom}`.trim()
  return (
    <TicketThermique duplicata={duplicata} imprime={imprime}>
      <div className="text-center">
        SETRAG · Transgabonais
        <br />
        {pdv?.name ?? "Guichet"}
      </div>
      <FiletTicket />
      {desserte ? (
        <LigneTicket
          gras
          gauche={nomTrain(desserte.trainType, desserte.trainNumber)}
          droite={dateCourte(desserte.serviceDate, true)}
        />
      ) : null}
      <div className="text-center text-[20px] leading-tight font-semibold">
        {desserte ? heure(desserte.departAt) : ""} {dossier.origine?.code ?? ""} → {dossier.arrivee?.code ?? ""}{" "}
        {desserte ? heure(desserte.arriveeAt) : ""}
      </div>
      <LigneTicket
        gauche={billet.place ? `${billet.voiture ? nomVoiture(billet.voiture) : "Voiture"} · place ${billet.place}` : "Placement libre"}
        droite={libelleClasse(billet.classe)}
      />
      <LigneTicket gauche={voyageur} droite={billet.reduction ? `${categorieCourte(billet.reduction)} −${billet.reductionPct} %` : "Adulte"} />
      {billet.codeBarres ? <CodeTicket valeur={billet.codeBarres} legende={`Code du billet ${billet.numero}`} /> : null}
      <LigneTicket gauche={billet.numero} droite={<b>{xaf(billet.prix)}</b>} />
      <LigneTicket gauche="dont TVA" droite={montant(tvaDuBillet(dossier, billet))} />
      <FiletTicket />
      <div className="text-center text-[10.5px] text-ink-muted">
        {dossier.vente.numero} · {dateHeure(dossier.vente.heure)}
        {dossier.vente.matriculeVendeur ? ` · ${dossier.vente.matriculeVendeur}` : ""}
        <br />
        {piedBillet ?? "Billet nominatif, valable sur ce train uniquement."}
      </div>
    </TicketThermique>
  )
}
