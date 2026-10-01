import { useState } from "react"
import { Alert, Pressable, View } from "react-native"
import { router } from "expo-router"
import { useMutation, useQuery } from "convex/react"
import {
  ChevronRight,
  CircleHelp,
  Database,
  FileText,
  Languages,
  LogOut,
  MessageSquare,
  Moon,
  Smartphone,
  Sparkles,
  Users,
} from "lucide-react-native"

import { api } from "@workspace/backend/generated"
import { Button, Text, useTheme } from "@workspace/mobile-ui/components"
import { fonts } from "@workspace/mobile-ui/tokens"

import { OptionRadio } from "@/components/achat"
import { BarreTitre, Corps, Ecran, Erreur, Etiquette } from "@/components/ecran"
import { Avatar, Carte, Liste, Ligne } from "@/components/elements"
import { Feuille } from "@/components/feuille"
import { typo } from "@/components/typo"
import { initiales, messageErreur, telephoneMasque } from "@/lib/format"
import { useReglages, type Theme } from "@/lib/reglages"
import { useSeDeconnecter } from "@/lib/session"
import { useCompte } from "@/lib/compte"

const THEMES: { id: Theme; libelle: string }[] = [
  { id: "automatique", libelle: "Automatique" },
  { id: "clair", libelle: "Clair" },
  { id: "sombre", libelle: "Sombre" },
]

const MOYENS = { airtel_money: "Airtel Money", moov_money: "Moov Money", carte: "Carte bancaire", clickpay: "Click-Pay" } as const

/** Compte : les alertes de retard d'abord, c'est le service le plus utile. */
export default function Compte() {
  const theme = useTheme()
  const { connecte: isAuthenticated, actif, profil } = useCompte()
  const enregistres = useQuery(api.functions.customers.listSavedPassengers, actif ? {} : "skip")
  const alertes = useQuery(api.functions.notificationCenter.preferences, actif ? {} : "skip")
  const regler = useMutation(api.functions.notificationCenter.setPreferences)
  const consentir = useMutation(api.functions.customers.grantConsent)
  const retirer = useMutation(api.functions.customers.revokeConsent)
  const { theme: themeChoisi, choisirTheme, moyenPrefere } = useReglages()
  const seDeconnecter = useSeDeconnecter()
  const [feuilleTheme, setFeuilleTheme] = useState(false)
  const [erreur, setErreur] = useState("")

  const offres = profil?.consents.some((item) => item.type === "marketing" && !item.revokedAt) ?? false
  const muet = (categorie: "retard" | "rappel") => alertes?.mutedCategories.includes(categorie) ?? false

  function basculer(categorie: "retard" | "rappel", actif: boolean) {
    if (!alertes) return
    const mutedCategories = actif ? alertes.mutedCategories.filter((item) => item !== categorie) : [...alertes.mutedCategories, categorie]
    void regler({ ...alertes, mutedCategories }).catch((cause) => setErreur(messageErreur(cause)))
  }

  function deconnexion() {
    Alert.alert("Se déconnecter ?", "Les billets enregistrés sur ce téléphone seront effacés. Ils restent dans votre compte.", [
      { text: "Rester connecté", style: "cancel" },
      { text: "Se déconnecter", style: "destructive", onPress: () => void seDeconnecter() },
    ])
  }

  const nom = [profil?.user.firstName, profil?.user.lastName].filter(Boolean).join(" ")
  const contact = profil?.user.phone ? telephoneMasque(profil.user.phone) : profil?.user.email?.endsWith("@auth.setrag.local") ? "" : (profil?.user.email ?? "")

  return (
    <Ecran>
      <BarreTitre titre="Compte" />
      <Corps>
        {isAuthenticated ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Mon profil, ${nom || "à compléter"}`}
            onPress={() => router.push("/compte/profil")}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              padding: 16,
              backgroundColor: pressed ? theme.colors.surfaceSunk : theme.colors.surface,
              borderWidth: 1,
              borderColor: theme.colors.line,
              borderRadius: theme.radius.md,
            })}
          >
            <Avatar taille={52}>{initiales(profil?.user.firstName, profil?.user.lastName)}</Avatar>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: fonts.bold, fontSize: 17, color: theme.colors.ink }}>{nom || "Complétez votre profil"}</Text>
              {contact ? <Text style={{ fontFamily: fonts.monoMedium, fontSize: 13, color: theme.colors.inkMuted }}>{contact}</Text> : null}
            </View>
            <ChevronRight size={20} color={theme.colors.inkFaint} />
          </Pressable>
        ) : (
          <Carte style={{ padding: 16, gap: 12 }}>
            <Text style={{ fontFamily: fonts.bold, fontSize: 17, color: theme.colors.ink }}>Retrouvez vos billets partout</Text>
            <Text style={[typo.sous, { color: theme.colors.inkMuted }]}>
              Connectez-vous par SMS ou e-mail : vos billets, vos voyageurs et vos alertes vous suivent d’un téléphone à l’autre.
            </Text>
            <Button title="Se connecter" block onPress={() => router.push("/connexion")} />
          </Carte>
        )}

        {isAuthenticated ? (
          <Liste>
            <Ligne icone={Users} libelle="Voyageurs enregistrés" valeur={enregistres?.length ? String(enregistres.length) : undefined} onPress={() => router.push("/compte/voyageurs")} />
            <Ligne icone={Smartphone} libelle="Moyens de paiement" valeur={moyenPrefere ? MOYENS[moyenPrefere.moyen] : undefined} onPress={() => router.push("/compte/paiement")} />
          </Liste>
        ) : null}

        {isAuthenticated ? (
          <>
            <Etiquette>Alertes</Etiquette>
            <Liste>
              <Ligne
                libelle="Retards et suppressions"
                precision="Recommandé : on vous prévient même hors de l'app"
                interrupteur={{ valeur: !muet("retard"), onChange: (actif) => basculer("retard", actif), desactive: !alertes }}
              />
              <Ligne libelle="Rappel avant le départ" interrupteur={{ valeur: !muet("rappel"), onChange: (actif) => basculer("rappel", actif), desactive: !alertes }} />
              <Ligne
                libelle="Offres et nouveautés"
                interrupteur={{
                  valeur: offres,
                  desactive: !profil,
                  onChange: (actif) =>
                    void (actif ? consentir({ type: "marketing", channel: "mobile" }) : retirer({ type: "marketing" })).catch((cause) => setErreur(messageErreur(cause))),
                }}
              />
            </Liste>
          </>
        ) : null}
        <Erreur>{erreur}</Erreur>

        <Liste>
          <Ligne icone={Moon} libelle="Thème" valeur={THEMES.find((item) => item.id === themeChoisi)?.libelle} onPress={() => setFeuilleTheme(true)} />
          <Ligne icone={Languages} libelle="Langue" valeur="Français" />
          <Ligne icone={CircleHelp} libelle="Aide et contact" onPress={() => router.push("/aide")} />
        </Liste>

        <Liste>
          {isAuthenticated ? <Ligne icone={Sparkles} libelle="Ce que Ruban retient" onPress={() => router.push("/compte/ruban")} /> : null}
          {isAuthenticated ? <Ligne icone={MessageSquare} libelle="Messageries reliées" onPress={() => router.push("/compte/messageries")} /> : null}
          {isAuthenticated ? <Ligne icone={Database} libelle="Mes données" onPress={() => router.push("/compte/donnees")} /> : null}
          <Ligne icone={FileText} libelle="Conditions de vente" onPress={() => router.push("/conditions")} />
        </Liste>

        {isAuthenticated ? (
          <Liste>
            <Ligne icone={LogOut} libelle="Se déconnecter" danger onPress={deconnexion} />
          </Liste>
        ) : null}
      </Corps>

      <Feuille visible={feuilleTheme} titre="Thème" onFermer={() => setFeuilleTheme(false)} hauteur="auto">
        <View style={{ paddingHorizontal: 16, gap: 8 }} accessibilityRole="radiogroup">
          {THEMES.map((item) => (
            <OptionRadio
              key={item.id}
              coche={themeChoisi === item.id}
              titre={item.libelle}
              precision={item.id === "automatique" ? "Suit le réglage du téléphone" : undefined}
              hauteurMin={52}
              onPress={() => {
                void choisirTheme(item.id)
                setFeuilleTheme(false)
              }}
            />
          ))}
        </View>
      </Feuille>
    </Ecran>
  )
}
