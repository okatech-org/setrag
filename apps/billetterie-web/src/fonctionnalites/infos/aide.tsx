import { ShareIcon } from "lucide-react"
import Link from "next/link"

import { Button } from "@workspace/ui/components/button"
import { SigneRuban } from "@workspace/ui/marque"

import { VOYAGEURS_MAX } from "@/lib/voyage"

import {
  EnAttente,
  EnTeteInfo,
  LienSuite,
  PageInfo,
  Question,
  Questions,
  SectionInfo,
} from "./elements"
import { MOYENS_EN_LIGNE, TENUE_MINUTES } from "./regles"
import { OuvrirAncre } from "./sommaire"

/**
 * Questions fréquentes.
 *
 * Chaque réponse décrit ce que le système fait aujourd'hui (fonctions Convex,
 * copie locale, service worker) ou ce que disent les cahiers des charges.
 * Ce que SETRAG n'a pas tranché est marqué comme tel, jamais comblé.
 */

const SOMMAIRE = [
  ["billets", "Vos billets"],
  ["reserver", "Réserver et payer"],
  ["voyage", "Pendant le voyage"],
  ["annuler", "Annuler"],
  ["donnees", "Compte et données"],
  ["application", "L’application"],
] as const

export function Aide() {
  return (
    <PageInfo
      sommaire={[...SOMMAIRE]}
      entete={
        <EnTeteInfo
          surtitre="Aide"
          titre="Questions fréquentes"
          intro={
            <p>
              Les réponses décrivent ce que fait la billetterie aujourd’hui. Ce
              que SETRAG n’a pas encore décidé est signalé comme tel.
            </p>
          }
          actions={
            <Button asChild variant="secondary">
              <Link href="/assistant">
                <SigneRuban className="h-[18px] w-auto" />
                Demander à Ruban
              </Link>
            </Button>
          }
        />
      }
    >
      <OuvrirAncre />

      <SectionInfo id="billets" numero="01" titre="Vos billets">
        <Questions>
          <Question id="retrouver-billet" question="Où retrouver mon billet ?">
            <p>
              Connecté, ouvrez Billets : vos réservations y sont, celles qui
              attendent leur paiement comme les autres.
            </p>
            <p>
              Sans compte, il faut la référence de la réservation et le numéro
              de téléphone donné en réservant. Les deux sont demandés : la
              référence seule ne suffit pas.
            </p>
            <LienSuite href="/billets">Mes billets</LienSuite>
          </Question>
          <Question
            id="hors-reseau"
            question="Mon billet s’ouvre-t-il sans réseau ?"
          >
            <p>
              Oui, si vous êtes connecté à votre compte. L’application
              enregistre vos billets sur le téléphone dès qu’elle les reçoit,
              avec le parcours de vos prochains trains.
            </p>
            <p>
              Sans compte, le téléphone ne garde pas de copie. Téléchargez le
              billet en PDF avant de partir : il porte le même code.
            </p>
            <p>
              Hors réseau, l’application affiche la date de sa copie. Un horaire
              a pu changer depuis ; le code du billet, lui, reste valable.
            </p>
          </Question>
          <Question id="imprimer" question="Faut-il imprimer le billet ?">
            <p>
              Non. Le code affiché sur votre téléphone suffit au contrôle. Le
              PDF du billet porte le même code, si vous préférez le papier.
            </p>
          </Question>
          <Question id="controle" question="Que vérifie le contrôleur à bord ?">
            <p>
              Il scanne le code Aztec de votre billet. Ce code est signé
              électroniquement : on ne peut ni le fabriquer ni le modifier sans
              que le contrôle le détecte.
            </p>
            <p>
              Le contrôle marche sans réseau. Avant le départ, le terminal du
              contrôleur charge la liste des billets du train.
            </p>
            <p>
              Le code ne contient aucune donnée personnelle. Votre nom vient de
              la liste chargée par le contrôleur : le billet est nominatif.
            </p>
            <p>
              Un billet contrôlé est marqué utilisé. Il ne peut plus être
              annulé.
            </p>
          </Question>
        </Questions>
      </SectionInfo>

      <SectionInfo id="reserver" numero="02" titre="Réserver et payer">
        <Questions>
          <Question
            id="tenue"
            question="Combien de temps ma réservation est-elle tenue ?"
          >
            <p>
              {TENUE_MINUTES} minutes. Pendant ce délai, vos places sont
              bloquées et le prix est figé. Vous payez en ligne ou au guichet
              d’une gare.
            </p>
            <p>
              Passé ce délai sans paiement, la réservation expire. Les places
              retournent à la vente et le paiement est refusé : il faut réserver
              à nouveau.
            </p>
          </Question>
          <Question id="paiement" question="Comment payer ?">
            <p>
              Moyens prévus pour la vente en ligne :{" "}
              {MOYENS_EN_LIGNE.join(", ")}. Au guichet, vous pouvez aussi payer
              en espèces.
            </p>
            <EnAttente>
              Les contrats avec les opérateurs de paiement ne sont pas encore
              signés. Aujourd’hui, le paiement en ligne est une simulation.
            </EnAttente>
          </Question>
          <Question id="compte" question="Faut-il un compte pour réserver ?">
            <p>
              Non. Un numéro de téléphone suffit pour réserver, puis pour
              retrouver la réservation avec sa référence.
            </p>
            <p>
              Avec un compte, vos réservations vous suivent d’un appareil à
              l’autre et restent lisibles sans réseau.
            </p>
          </Question>
          <Question
            id="groupes"
            question={`Peut-on réserver pour plus de ${VOYAGEURS_MAX} personnes ?`}
          >
            <p>
              Pas en ligne. À partir de {VOYAGEURS_MAX + 1} voyageurs, réservez
              au guichet : les tarifs de groupe s’y appliquent.
            </p>
            <LienSuite href="/tarifs#groupes">Tarifs de groupe</LienSuite>
          </Question>
          <Question
            id="reductions"
            question="Comment avoir le tarif enfant ou militaire ?"
          >
            <p>
              Indiquez la réduction de chaque voyageur au moment de réserver.
              Une seule réduction par voyageur. Si elle demande un justificatif,
              gardez-le sur vous pendant le voyage.
            </p>
            <LienSuite href="/tarifs#reductions">
              Toutes les réductions
            </LienSuite>
          </Question>
        </Questions>
      </SectionInfo>

      <SectionInfo id="voyage" numero="03" titre="Pendant le voyage">
        <Questions>
          <Question
            id="retard"
            question="Mon train est en retard ou supprimé : que se passe-t-il ?"
          >
            <p>
              Quand l’exploitation déclare un retard ou une suppression, la
              billetterie l’affiche aussitôt sur votre billet et dans le suivi
              des trains, tant que vous avez du réseau.
            </p>
            <p>
              Un train supprimé ne disparaît pas des résultats : il reste
              affiché, marqué comme supprimé.
            </p>
            <p>
              Aucune alerte par SMS n’est envoyée pour l’instant : le
              fournisseur n’est pas encore choisi.
            </p>
            <EnAttente>
              Remboursement ou report après un retard ou une suppression :
              SETRAG n’a pas fixé de règle. Adressez-vous au guichet.
            </EnAttente>
          </Question>
          <Question id="suivi" question="Comment suivre un train ?">
            <p>
              Ouvrez le suivi des trains, choisissez le train et la date :
              arrêts, horaires et retard s’affichent. C’est le statut déclaré
              par l’exploitation, pas une position GPS.
            </p>
            <p>
              Sans réseau, seuls les trains de vos billets restent
              consultables : leur parcours a été enregistré sur le téléphone.
            </p>
            <LienSuite href="/suivi">Suivre un train</LienSuite>
          </Question>
          <Question id="bagages" question="Et mes bagages ?">
            <p>
              Ils s’enregistrent au guichet bagages de la gare, sur présentation
              du billet. Ils ne s’ajoutent pas encore à une réservation en
              ligne.
            </p>
            <LienSuite href="/bagages">Bagages et colis</LienSuite>
          </Question>
        </Questions>
      </SectionInfo>

      <SectionInfo id="annuler" numero="04" titre="Annuler">
        <Questions>
          <Question
            id="annuler-reservation"
            question="Comment annuler une réservation non payée ?"
          >
            <p>
              Ouvrez la réservation et annulez-la : les places retournent tout
              de suite à la vente. Sans rien faire, elle expire seule au bout de{" "}
              {TENUE_MINUTES} minutes.
            </p>
          </Question>
          <Question
            id="annuler-billet"
            question="Puis-je annuler ou modifier un billet payé ?"
          >
            <p>
              Pas en ligne. L’annulation et le remboursement d’un billet payé se
              font au guichet. Le guichet peut déduire une pénalité, selon le
              motif du remboursement.
            </p>
            <p>Un billet déjà contrôlé ne peut plus être annulé.</p>
            <EnAttente>
              Délais, taux de pénalité et mode de remboursement ne sont pas
              encore arrêtés par SETRAG.
            </EnAttente>
          </Question>
        </Questions>
      </SectionInfo>

      <SectionInfo id="donnees" numero="05" titre="Compte et données">
        <Questions>
          <Question
            id="mes-donnees"
            question="Comment récupérer ou effacer mes données ?"
          >
            <p>
              Depuis Compte, vous téléchargez tout ce que le système garde sur
              vous : profil, réservations, billets, consentements et voyageurs
              enregistrés.
            </p>
            <p>
              Vous pouvez aussi supprimer votre compte. Le profil est alors
              anonymisé ; les ventes restent, parce que la comptabilité doit les
              conserver. La suppression est refusée tant qu’une réservation
              attend son paiement.
            </p>
            <p>
              Les offres commerciales demandent votre accord, que vous retirez
              quand vous voulez.
            </p>
            <LienSuite href="/compte">Mon compte</LienSuite>
          </Question>
          <Question
            id="deconnexion"
            question="Pourquoi la déconnexion efface-t-elle mes billets du téléphone ?"
          >
            <p>
              Les billets enregistrés sur l’appareil sont à votre nom. La
              déconnexion les efface, pour qu’une autre personne qui utilise le
              téléphone ne les voie pas. Ils restent dans votre compte.
            </p>
            <p>
              Avant un trajet sans réseau, restez connecté. Hors réseau,
              l’application peut vous sembler déconnectée : vos billets restent
              pourtant affichés.
            </p>
          </Question>
        </Questions>
      </SectionInfo>

      <SectionInfo id="application" numero="06" titre="L’application">
        <Questions>
          <Question id="installer" question="Comment installer l’application ?">
            <p>
              Sur Android, avec Chrome : touchez Installer dans le bandeau qui
              s’affiche à l’accueil, ou passez par le menu du navigateur.
            </p>
            <p>
              Sur iPhone, avec Safari : touchez{" "}
              <ShareIcon
                className="inline size-4 align-text-bottom"
                aria-label="Partager"
              />{" "}
              puis « Sur l’écran d’accueil ».
            </p>
            <p>
              L’application s’ouvre alors en plein écran, depuis son icône, et
              garde vos billets pour les trajets sans réseau.
            </p>
          </Question>
          <Question id="ruban" question="Qui est Ruban ?">
            <p>
              L’assistant de la billetterie. Il cherche un train, prépare la
              réservation et vous guide jusqu’au paiement, à l’écrit ou à la
              voix.
            </p>
            <p>
              C’est vous qui confirmez chaque étape. Ruban ne vous demande
              jamais de code.
            </p>
            <LienSuite href="/assistant">Parler à Ruban</LienSuite>
          </Question>
        </Questions>
      </SectionInfo>

      <section
        aria-labelledby="autre-question"
        className="mt-10 grid gap-4 rounded-lg border border-line bg-surface p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:p-6"
      >
        <div className="grid gap-2">
          <h2 id="autre-question" className="text-h4">
            Une autre question ?
          </h2>
          <p className="max-w-[60ch] text-[15px] leading-relaxed text-ink-muted">
            Ruban répond à l’écrit ou à la voix. En gare, les guichets SETRAG
            traitent les annulations, les remboursements et les bagages.
          </p>
          <EnAttente>
            SETRAG n’a pas encore désigné de contact pour le support voyageur
            (adresse, téléphone, horaires).
          </EnAttente>
        </div>
        <div className="flex flex-wrap gap-x-6 md:flex-col md:items-end">
          <LienSuite href="/assistant">Parler à Ruban</LienSuite>
          <LienSuite href="/conditions">Conditions de vente</LienSuite>
        </div>
      </section>
    </PageInfo>
  )
}
