import { router } from "expo-router"
import { BadgePercent, Luggage, MessageCircle } from "lucide-react-native"

import { Text, useTheme } from "@workspace/mobile-ui/components"
import { fonts } from "@workspace/mobile-ui/tokens"
import { CURRENT_CGV_VERSION } from "@workspace/backend/cgv"

import { BarreApp, Corps, Ecran, Etiquette, SousTitre } from "./ecran"
import { Carte, Liste, Ligne } from "./elements"
import { typo } from "./typo"

type Sujet = "aide" | "tarifs" | "bagages" | "conditions"

const CONTENUS: Record<Sujet, { titre: string; chapo: string; sections: { titre: string; texte: string }[] }> = {
  aide: {
    titre: "Aide et contact",
    chapo: "Les réponses aux questions les plus fréquentes.",
    sections: [
      { titre: "Où retrouver mon billet ?", texte: "Dans l'onglet Billets. Sans compte, touchez « Retrouver une réservation » et saisissez la référence et le téléphone du dossier." },
      { titre: "Mon billet s'ouvre-t-il sans réseau ?", texte: "Oui. Les billets sont enregistrés sur ce téléphone ; l'onglet Billets indique l'heure de la dernière mise à jour. Le code reste valable même si l'horaire a changé depuis." },
      { titre: "Faut-il imprimer le billet ?", texte: "Non. Présentez le code de votre billet au contrôleur, sur votre téléphone. La luminosité monte d'elle-même." },
      { titre: "Combien de temps mes places sont-elles tenues ?", texte: "15 minutes à partir du choix du train. Passé ce délai sans paiement, elles retournent à la vente." },
      { titre: "Mon train est en retard ?", texte: "Le suivi du voyage montre le retard annoncé par l'exploitation. La position du train est estimée d'après l'horaire, sans GPS." },
      { titre: "Comment annuler ?", texte: "Une réservation non payée s'annule depuis l'écran de paiement. Pour un billet payé, adressez-vous au guichet avec sa référence." },
    ],
  },
  tarifs: {
    titre: "Tarifs et réductions",
    chapo: "Le prix dépend du trajet, du train, de la classe et des réductions.",
    sections: [
      { titre: "Classes", texte: "L'Express propose la 2e classe, la 1re classe et la classe VIP. L'Omnibus et l'Autorail proposent la 2e et la 1re classe. La place est attribuée par le système." },
      { titre: "Enfants et militaires", texte: "Le tarif enfant s'applique de 4 à 11 ans ; sa date de naissance est demandée à la réservation. Une réduction militaire est prévue sur justificatif." },
      { titre: "Groupes", texte: "Au-delà de 9 voyageurs, la réservation se fait au guichet, qui applique le tarif de groupe." },
    ],
  },
  bagages: {
    titre: "Bagages et colis",
    chapo: "L'enregistrement se fait en gare, avant le départ.",
    sections: [
      { titre: "Bagages accompagnés", texte: "Présentez votre billet au guichet bagages avant le départ. Les bagages ne s'ajoutent pas encore à une réservation dans l'app." },
      { titre: "Poids", texte: "Un bagage enregistré pèse au plus 30 kg. Pour un objet plus lourd ou encombrant, demandez les conditions au guichet." },
      { titre: "Colis et autres transports", texte: "Le dépôt des colis, le transport des véhicules et le transport funéraire se règlent au guichet de la gare." },
    ],
  },
  conditions: {
    titre: "Conditions de vente",
    chapo: `Version ${CURRENT_CGV_VERSION.replace("cgv-", "")}`,
    sections: [
      { titre: "Réserver", texte: "Le prix et les places sont tenus 15 minutes. Sans paiement dans ce délai, la réservation expire." },
      { titre: "Payer", texte: "Le paiement en ligne est pour l'instant simulé : aucun prélèvement réel n'est effectué. Le paiement enregistré émet les billets." },
      { titre: "Billets nominatifs", texte: "Chaque billet appartient au voyageur indiqué à la réservation. Le contrôleur vérifie son identité et le code signé du billet." },
      { titre: "Annulation et remboursement", texte: "Une réservation non payée peut être annulée. Pour un billet payé, adressez-vous au guichet. Les conditions de remboursement restent à fixer par SETRAG." },
    ],
  },
}

export function InfoPage({ sujet }: { sujet: Sujet }) {
  const theme = useTheme()
  const contenu = CONTENUS[sujet]

  return (
    <Ecran>
      <BarreApp titre={contenu.titre} />
      <Corps>
        <SousTitre>{contenu.chapo}</SousTitre>
        {contenu.sections.map((section) => (
          <Carte key={section.titre} style={{ padding: 16, gap: 4 }}>
            <Text accessibilityRole="header" style={{ fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20, color: theme.colors.ink }}>
              {section.titre}
            </Text>
            <Text style={[typo.sous, { color: theme.colors.inkMuted }]}>{section.texte}</Text>
          </Carte>
        ))}
        {sujet === "aide" ? (
          <>
            <Etiquette style={{ marginTop: 4 }}>Nous joindre</Etiquette>
            <Liste>
              <Ligne icone={MessageCircle} libelle="Demander à Ruban" precision="L'assistant répond tout de suite" onPress={() => router.push("/assistant")} />
              <Ligne icone={Luggage} libelle="Bagages et colis" onPress={() => router.push("/bagages")} />
              <Ligne icone={BadgePercent} libelle="Tarifs et réductions" onPress={() => router.push("/tarifs")} />
            </Liste>
          </>
        ) : null}
        {sujet === "conditions" ? (
          <Text style={[typo.legende, { color: theme.colors.inkFaint }]}>Le texte complet des conditions de vente fait foi.</Text>
        ) : null}
      </Corps>
    </Ecran>
  )
}
