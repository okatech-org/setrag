import { Fragment, useEffect, useRef } from "react"
import { View } from "react-native"
import { router } from "expo-router"
import { useMutation, useQuery } from "convex/react"
import { Bell, CircleX, ClockAlert, Receipt, Ticket } from "lucide-react-native"

import { api } from "@workspace/backend/generated"
import { Button, Text, useTheme } from "@workspace/mobile-ui/components"
import { fonts } from "@workspace/mobile-ui/tokens"

import { BarreApp, Corps, Ecran, Etiquette } from "@/components/ecran"
import { Carte, EtatVide } from "@/components/elements"
import { ajouterJours, aujourdhui, heure, jourDe, jourSansSemaine } from "@/lib/format"
import { useCompte } from "@/lib/compte"

type Categorie = "retard" | "rappel" | "achat" | "remboursement"

/** Chaque alerte dit ce qui change et ce qui reste acquis. */
export default function Notifications() {
  const theme = useTheme()
  const { connecte: isAuthenticated, chargement: isLoading, actif } = useCompte()
  const liste = useQuery(api.functions.notificationCenter.list, actif ? {} : "skip")
  const toutLire = useMutation(api.functions.notificationCenter.markAllRead)
  const nonLues = liste?.some((item) => !item.readAt) ?? false
  const aLire = useRef(false)

  // Les alertes affichées sont lues en quittant l'écran : la pastille reste le temps de les voir.
  useEffect(() => {
    aLire.current = nonLues
  }, [nonLues])
  useEffect(() => () => void (aLire.current && toutLire({}).catch(() => undefined)), [toutLire])

  if (!isLoading && !isAuthenticated) {
    return (
      <Ecran>
        <BarreApp titre="Notifications" />
        <EtatVide
          titre="Connectez-vous pour être prévenu"
          texte="Retards, rappels avant le départ et billets émis arrivent ici, et sur votre téléphone."
          action={<Button title="Se connecter" onPress={() => router.push("/connexion")} />}
        />
      </Ecran>
    )
  }

  const jours = new Map<string, NonNullable<typeof liste>>()
  for (const item of liste ?? []) {
    const jour = jourDe(item.sentAt ?? item._creationTime)
    jours.set(jour, [...(jours.get(jour) ?? []), item])
  }
  const intitule = (jour: string) => (jour === aujourdhui() ? "Aujourd'hui" : jour === ajouterJours(aujourdhui(), -1) ? "Hier" : jourSansSemaine(jour))

  return (
    <Ecran>
      <BarreApp titre="Notifications" />
      <Corps>
        {liste === undefined ? (
          <Text style={{ fontFamily: fonts.regular, fontSize: 14, color: theme.colors.inkMuted }}>Chargement…</Text>
        ) : liste.length === 0 ? (
          <EtatVide titre="Aucune notification" texte="Les nouvelles de vos voyages arriveront ici : retards, rappels, billets." />
        ) : (
          [...jours.entries()].map(([jour, alertes]) => (
            <Fragment key={jour}>
              <Etiquette>{intitule(jour)}</Etiquette>
              <Carte>
                {alertes.map((item, index) => (
                  <Alerte
                    key={item._id}
                    premiere={index === 0}
                    categorie={item.category}
                    titre={item.title}
                    texte={item.body}
                    heure={heure(item.sentAt ?? item._creationTime)}
                    nouvelle={!item.readAt}
                  />
                ))}
              </Carte>
            </Fragment>
          ))
        )}
      </Corps>
    </Ecran>
  )
}

function Alerte({ categorie, titre, texte, heure: moment, nouvelle, premiere }: { categorie?: Categorie; titre: string; texte: string; heure: string; nouvelle: boolean; premiere: boolean }) {
  const theme = useTheme()
  const c = theme.colors
  // Le pictogramme et le titre portent le sens ; la teinte ne fait que l'appuyer.
  const pictos = {
    retard: { Icone: ClockAlert, fond: c.warningSoft, encre: c.warningInk },
    rappel: { Icone: Bell, fond: c.accentSoft, encre: c.accentInk },
    achat: { Icone: Ticket, fond: c.successSoft, encre: c.successInk },
    remboursement: { Icone: Receipt, fond: c.surfaceSunk, encre: c.inkMuted },
  }
  const { Icone, fond, encre } = categorie ? pictos[categorie] : { Icone: titre.toLowerCase().includes("supprim") ? CircleX : Bell, fond: c.surfaceSunk, encre: c.inkMuted }

  return (
    <View
      accessible
      accessibilityLabel={`${nouvelle ? "Nouveau. " : ""}${titre}. ${texte}. ${moment}`}
      style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: premiere ? 0 : 1, borderTopColor: c.line }}
    >
      <View style={{ width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: fond }}>
        <Icone size={20} color={encre} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={{ fontFamily: fonts.semibold, fontSize: 14.5, lineHeight: 19, color: c.ink, flexShrink: 1 }}>{titre}</Text>
          {nouvelle ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.accent }} /> : null}
        </View>
        <Text style={{ fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: c.inkMuted }}>{texte}</Text>
      </View>
      <Text style={{ fontFamily: fonts.monoMedium, fontSize: 12, color: c.inkFaint }}>{moment}</Text>
    </View>
  )
}
