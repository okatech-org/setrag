import { InlineMessage } from "@workspace/ui/components/inline-message"

import { VOYAGEURS_MAX } from "@/lib/voyage"

import {
  EnAttente,
  EnTeteInfo,
  Fait,
  Faits,
  LienSuite,
  PageInfo,
  SectionInfo,
  Source,
} from "./elements"
import {
  MOYENS_EN_LIGNE,
  PASSAGE_EXPIRATION_MINUTES,
  TENUE_MINUTES,
  VERSION_CGV,
} from "./regles"

/**
 * Conditions générales de vente.
 *
 * Le texte contractuel n'est pas arrêté par SETRAG (audit de la billetterie,
 * « Décisions SETRAG encore indispensables »). La page ne l'invente pas : elle
 * donne la version que le système enregistre sur chaque vente et résume les
 * règles que le code applique réellement, chacune vérifiée dans le backend.
 */

const SOMMAIRE = [
  ["reservation", "Réservation"],
  ["prix", "Prix"],
  ["paiement", "Paiement"],
  ["billets", "Billets"],
  ["controle", "Contrôle"],
  ["annulation", "Annulation"],
  ["donnees", "Données"],
  ["en-attente", "À décider"],
] as const

/** Décisions attendues de SETRAG, reprises de l'audit de la billetterie. */
const DECISIONS = [
  "Le texte et la version définitive des conditions générales de vente.",
  "Le barème d’annulation voyageur : délais, motifs, taux de pénalité et mode de remboursement.",
  "Ce qui est dû au voyageur quand un train est retardé ou supprimé.",
  "Les contrats des opérateurs de paiement (Airtel Money, Moov Money, carte).",
  "Le contact du support voyageur : adresse, outil de traitement, délais de réponse.",
  `La vente en ligne des allers-retours et des groupes de plus de ${VOYAGEURS_MAX} voyageurs.`,
]

export function Conditions() {
  return (
    <PageInfo
      sommaire={[...SOMMAIRE]}
      entete={
        <EnTeteInfo
          surtitre="Conditions générales de vente"
          titre="Les règles que le système applique"
          intro={
            <>
              <p>
                SETRAG n’a pas encore arrêté le texte de ses conditions
                générales de vente. Cette page ne le remplace pas : elle décrit,
                règle par règle, ce que la billetterie fait aujourd’hui.
              </p>
              <div className="grid gap-3 pt-2">
                <InlineMessage
                  tone="warning"
                  title="Texte définitif en attente."
                >
                  Décision attendue de SETRAG. Jusque-là, délais d’annulation,
                  pénalités et remboursements ne sont pas fixés.
                </InlineMessage>
                <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[15px] text-ink">
                  Version enregistrée sur chaque vente :
                  <code className="rounded-xs bg-surface-sunk px-2 py-0.5 font-mono text-[14px] font-semibold">
                    {VERSION_CGV}
                  </code>
                </p>
              </div>
            </>
          }
        />
      }
    >
      <SectionInfo id="reservation" numero="01" titre="Réservation">
        <Faits>
          <Fait terme="Sans compte">
            Un numéro de téléphone suffit pour réserver. Avec la référence de la
            réservation, il permet de la retrouver ; la référence seule ne
            suffit pas.
          </Fait>
          <Fait terme={`${VOYAGEURS_MAX} voyageurs au plus`}>
            Une réservation en ligne compte de 1 à {VOYAGEURS_MAX} voyageurs,
            dont au moins un adulte. Au-delà, la réservation se fait au guichet.
          </Fait>
          <Fait terme={`${TENUE_MINUTES} minutes`}>
            Les places sont tenues {TENUE_MINUTES} minutes, le temps de payer.
            Personne d’autre ne peut les prendre pendant ce délai, ni en ligne
            ni au guichet.
          </Fait>
          <Fait terme="Expiration">
            Sans paiement dans le délai, le paiement est refusé et la
            réservation expire. Un contrôle automatique, toutes les{" "}
            {PASSAGE_EXPIRATION_MINUTES} minutes, rend ses places à la vente.
          </Fait>
          <Fait terme="Annulation">
            Vous pouvez annuler une réservation non payée à tout moment. Ses
            places retournent aussitôt à la vente.
          </Fait>
        </Faits>
      </SectionInfo>

      <SectionInfo id="prix" numero="02" titre="Prix">
        <Faits>
          <Fait terme="Calcul">
            <span>
              Le prix dépend de la distance, du type de train, de la classe, de
              la réduction et du remplissage du train. Il comprend la TVA et la
              contribution spéciale de solidarité.
            </span>
            <LienSuite href="/tarifs#calcul">Le détail du calcul</LienSuite>
          </Fait>
          <Fait terme="Avant de réserver">
            Le prix affiché est indicatif. Il peut évoluer avec le remplissage
            du train.
          </Fait>
          <Fait terme="Prix figé">
            Le prix est figé à la création de la réservation. Le paiement porte
            sur ce montant.
          </Fait>
          <Fait terme="Réductions">
            Une réduction par voyageur, au taux de la grille tarifaire en
            vigueur. Certaines demandent un justificatif.
          </Fait>
        </Faits>
      </SectionInfo>

      <SectionInfo id="paiement" numero="03" titre="Paiement">
        <Faits>
          <Fait terme="Moyens prévus">
            En ligne : {MOYENS_EN_LIGNE.join(", ")}. Au guichet, on peut aussi
            payer en espèces.
          </Fait>
          <Fait terme="Au guichet">
            Une réservation faite en ligne peut se régler au guichet d’une gare,
            dans le délai de {TENUE_MINUTES} minutes.
          </Fait>
          <Fait terme="Acceptation">
            Vous acceptez les conditions de vente au moment de payer. La vente
            enregistre la version acceptée et l’heure de l’acceptation. Cet
            accord ne se retire pas depuis le compte.
          </Fait>
        </Faits>
        <EnAttente>
          Les contrats des opérateurs de paiement ne sont pas signés.
          Aujourd’hui, le paiement en ligne est une simulation.
        </EnAttente>
      </SectionInfo>

      <SectionInfo id="billets" numero="04" titre="Billets">
        <Faits>
          <Fait terme="Nominatif">
            Chaque voyageur a son billet, établi à son nom, son prénom et son
            sexe.
          </Fait>
          <Fait terme="Code signé">
            Le billet porte un code Aztec signé électroniquement. Un code
            modifié ou fabriqué échoue au contrôle.
          </Fait>
          <Fait terme="Sans donnée personnelle">
            Le code ne contient ni nom ni numéro de téléphone : un billet perdu
            ne dit rien de son porteur.
          </Fait>
          <Fait terme="Duplicata">
            Un billet réimprimé au guichet est un duplicata tracé, jamais un
            second original.
          </Fait>
        </Faits>
      </SectionInfo>

      <SectionInfo id="controle" numero="05" titre="Contrôle à bord">
        <Faits>
          <Fait terme="Sans réseau">
            Le contrôleur vérifie la signature du code sans réseau, avec la
            liste des billets du train chargée avant le départ.
          </Fait>
          <Fait terme="Billet utilisé">
            Un billet contrôlé est marqué utilisé. Il ne peut plus être annulé
            ni remboursé.
          </Fait>
          <Fait terme="Refus">
            Un billet annulé, remboursé, non payé, d’un autre train ou déjà
            contrôlé est signalé comme tel au contrôleur.
          </Fait>
        </Faits>
      </SectionInfo>

      <SectionInfo
        id="annulation"
        numero="06"
        titre="Annulation et remboursement"
      >
        <Faits>
          <Fait terme="Réservation non payée">
            Annulable en ligne. Rien n’a été payé, rien n’est retenu.
          </Fait>
          <Fait terme="Billet payé">
            L’annulation et le remboursement se font au guichet, pas en ligne.
          </Fait>
          <Fait terme="Pénalité">
            Le guichet déduit du remboursement le taux de pénalité attaché au
            motif choisi. SETRAG paramètre les motifs et leurs taux.
          </Fait>
          <Fait terme="Trace">
            Rien n’est effacé : une annulation crée une écriture liée à la vente
            d’origine, et le billet annulé est refusé au contrôle.
          </Fait>
        </Faits>
        <EnAttente>
          Les délais, les motifs, les taux de pénalité et le mode de
          remboursement ne sont pas encore arrêtés.
        </EnAttente>
      </SectionInfo>

      <SectionInfo id="donnees" numero="07" titre="Données personnelles">
        <Faits>
          <Fait terme="Accès">
            Depuis votre compte, vous téléchargez tout ce que le système garde
            sur vous.
          </Fait>
          <Fait terme="Effacement">
            La suppression du compte anonymise votre profil. Les ventes restent,
            parce que la comptabilité doit les conserver. Elle est refusée tant
            qu’une réservation attend son paiement.
          </Fait>
          <Fait terme="Consentements">
            Les offres commerciales demandent votre accord. Vous le retirez
            quand vous voulez.
          </Fait>
        </Faits>
      </SectionInfo>

      <SectionInfo
        id="en-attente"
        numero="08"
        titre="Ce qui reste à décider"
        intro="Ces points attendent une décision de SETRAG. La billetterie ne les tranche pas à sa place."
      >
        <ul className="grid max-w-[72ch] gap-3">
          {DECISIONS.map((decision) => (
            <li key={decision}>
              <EnAttente libelle="Décision SETRAG attendue">
                {decision}
              </EnAttente>
            </li>
          ))}
        </ul>
        <Source>
          fonctions de réservation, de vente, de contrôle et de données du
          système ; cahier des charges Front-Office, §3.1.1 (« Annulation /
          Modification : conditions selon les conditions générales de vente »).
        </Source>
      </SectionInfo>
    </PageInfo>
  )
}
