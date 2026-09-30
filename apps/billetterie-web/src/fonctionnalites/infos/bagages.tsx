import {
  CarFrontIcon,
  Flower2Icon,
  LuggageIcon,
  PackageIcon,
  type LucideIcon,
} from "lucide-react"
import type { ReactNode } from "react"

import {
  BAGGAGE_MAX_WEIGHT_KG,
  BAGGAGE_REGISTRATION_LONG_HT,
  BAGGAGE_REGISTRATION_SHORT_HT,
  BAGGAGE_SHORT_DISTANCE_MAX_KM,
  PARCEL_MAX_UNIT_WEIGHT_KG,
  PARCEL_WEIGHT_STEP_KG,
  PARCEL_ZONES,
} from "@workspace/backend/fares"

import { prixCourt } from "@/lib/format"

import {
  EnAttente,
  EnTeteInfo,
  LienSuite,
  PageInfo,
  SectionInfo,
  Source,
  Texte,
} from "./elements"

/**
 * Bagages, colis et transports spéciaux.
 *
 * Le système les vend au guichet seulement : `ancillaries.*` exige le droit
 * « ventes » d'un agent, et leurs barèmes (`ancillaryFares`) ne sont exposés
 * par aucune query publique. La page dit donc ce qui est fixé — par le cahier
 * des charges et le moteur tarifaire (`@workspace/backend/fares`) — et renvoie
 * au guichet pour le reste. Aucun montant n'y est recopié à la main.
 */

function Produit({
  icone: Icone,
  titre,
  resume,
  children,
}: {
  icone: LucideIcon
  titre: string
  resume: string
  children: ReactNode
}) {
  return (
    <article className="grid content-start gap-3 rounded-lg border border-line bg-surface p-5 md:p-6">
      <Icone className="size-[26px] text-accent-ink" aria-hidden />
      <h3 className="text-h4">{titre}</h3>
      <p className="text-[15px] leading-relaxed text-ink">{resume}</p>
      <ul className="grid gap-2 border-t border-line pt-3 text-[14.5px] leading-relaxed text-ink-muted">
        {children}
      </ul>
    </article>
  )
}

function Point({ children }: { children: ReactNode }) {
  return (
    <li className="grid grid-cols-[12px_minmax(0,1fr)] gap-2">
      <span
        aria-hidden
        className="mt-[9px] size-1.5 rounded-pill bg-line-strong"
      />
      <span>{children}</span>
    </li>
  )
}

const kg = (valeur: number) => <span className="tabular">{valeur} kg</span>
const km = (valeur: number) => <span className="tabular">{valeur} km</span>
const francsHt = (valeur: number) => (
  <span className="tabular">{prixCourt(valeur)} F HT</span>
)

/** Largeur d'une zone colis, lue dans la table des zones du moteur tarifaire. */
const LARGEUR_ZONE_KM = PARCEL_ZONES[0]!.maxKm - PARCEL_ZONES[0]!.minKm + 1

export function Bagages() {
  return (
    <PageInfo
      entete={
        <EnTeteInfo
          surtitre="Bagages, colis, transports"
          titre="Bagages et colis s’enregistrent au guichet"
          intro={
            <p>
              Le guichet de la gare pèse, étiquette et encaisse. Un bagage ne
              s’ajoute pas encore à une réservation en ligne : présentez votre
              billet au guichet bagages avant le départ.
            </p>
          }
        />
      }
    >
      <SectionInfo
        id="produits"
        numero="01"
        titre="Ce que le train transporte"
        intro="Quatre services, vendus au guichet. Deux demandent un billet voyageur, deux non."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Produit
            icone={LuggageIcon}
            titre="Bagage"
            resume="Vos affaires, rattachées à votre billet voyageur."
          >
            <Point>
              Jusqu’à {kg(BAGGAGE_MAX_WEIGHT_KG)} par bagage. Au-delà, l’envoi
              passe en colis express.
            </Point>
            <Point>Chaque bagage reçoit une étiquette à numéro unique.</Point>
            <Point>
              Frais d’enregistrement obligatoires :{" "}
              {francsHt(BAGGAGE_REGISTRATION_SHORT_HT)} jusqu’à{" "}
              {km(BAGGAGE_SHORT_DISTANCE_MAX_KM)},{" "}
              {francsHt(BAGGAGE_REGISTRATION_LONG_HT)} au-delà, taxes en sus.
            </Point>
            <Point>
              Au-delà de la franchise de poids, l’excédent se paie en plus, au
              barème du guichet.
            </Point>
          </Produit>
          <Produit
            icone={PackageIcon}
            titre="Colis express"
            resume="Un envoi de marchandises d’une gare à une autre, sans billet voyageur."
          >
            <Point>
              Jusqu’à {kg(PARCEL_MAX_UNIT_WEIGHT_KG)} par colis. Chaque colis
              porte sa vignette.
            </Point>
            <Point>
              Le prix dépend de la distance ({PARCEL_ZONES.length} zones de{" "}
              {km(LARGEUR_ZONE_KM)} le long de la ligne) et du poids, par
              paliers de {kg(PARCEL_WEIGHT_STEP_KG)}.
            </Point>
            <Point>Le guichet vous remet un numéro d’expédition.</Point>
          </Produit>
          <Produit
            icone={CarFrontIcon}
            titre="Transport auto accompagné"
            resume="Votre véhicule voyage par le train. Il faut un billet voyageur."
          >
            <Point>
              Le prix dépend du tonnage du véhicule et de la distance.
            </Point>
            <Point>
              La vente se fait au guichet, avec le numéro de votre billet.
            </Point>
          </Produit>
          <Produit
            icone={Flower2Icon}
            titre="Transport funéraire"
            resume="Le transport d’une dépouille mortelle par le train, sans billet voyageur."
          >
            <Point>Le prix dépend du tonnage et de la distance.</Point>
            <Point>La vente se fait au guichet.</Point>
          </Produit>
        </div>
        <Source>
          cahier des charges SETRAG, §7.1.2 à 7.1.5 et annexe 2 (§9.8.3, §9.8.4)
          ; moteur tarifaire du système.
        </Source>
      </SectionInfo>

      <SectionInfo
        id="non-publie"
        numero="02"
        titre="Ce qui n’est pas encore publié"
        intro="Ces prix se calculent au guichet. La billetterie en ligne ne les publie pas."
      >
        <EnAttente>
          Barèmes des colis, du transport de véhicules et du transport
          funéraire, franchise et prix de l’excédent de bagage : le cahier des
          charges ne les donne pas. SETRAG doit les fournir. En attendant,
          demandez le prix au guichet.
        </EnAttente>
        <EnAttente>
          Animaux, objets interdits, matières dangereuses : SETRAG n’a pas
          encore publié de règle. Renseignez-vous au guichet avant le voyage.
        </EnAttente>
        <Texte>
          Ajouter un bagage pendant la réservation en ligne est prévu par le
          cahier des charges. Ce n’est pas encore possible : le bagage
          s’enregistre au guichet, sur présentation du billet.
        </Texte>
        <div className="flex flex-wrap gap-x-6">
          <LienSuite href="/tarifs">Tarifs des billets</LienSuite>
          <LienSuite href="/aide">Questions fréquentes</LienSuite>
        </div>
      </SectionInfo>
    </PageInfo>
  )
}
