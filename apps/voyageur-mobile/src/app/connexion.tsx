import { useEffect, useRef, useState } from "react"
import { Pressable, TextInput, View } from "react-native"
import { router, useLocalSearchParams } from "expo-router"
import { useConvexAuth, useMutation, useQuery } from "convex/react"

import { api } from "@workspace/backend/generated"
import { Button, Text, useTheme } from "@workspace/mobile-ui/components"
import { fonts } from "@workspace/mobile-ui/tokens"

import { Bas, BarreApp, Corps, Ecran, Erreur, GrandTitre, LienM, SousTitre } from "@/components/ecran"
import { CodeOtp } from "@/components/otp"
import { typo } from "@/components/typo"
import { authClient } from "@/lib/auth-client"
import { messageErreur, normaliserTelephone, rebours, telephone } from "@/lib/format"
import { useReglages } from "@/lib/reglages"
import { useMaintenant } from "@/lib/voyage"

type Canal = "sms" | "email"

const DELAI_RENVOI = 60_000

/** Connexion : un code à 6 chiffres, par SMS ou par e-mail. Aucun mot de passe. */
export default function Connexion() {
  const theme = useTheme()
  const params = useLocalSearchParams<{ canal?: string }>()
  const { isAuthenticated } = useConvexAuth()
  const { bienvenueVue, marquerBienvenueVue } = useReglages()
  const etat = useQuery(api.functions.devAuth.status, {})
  const assurerProfil = useMutation(api.functions.customers.ensureProfile)
  const lireCodeDev = useMutation(api.functions.devAuth.consumeCode)
  const maintenant = useMaintenant()

  const [canal, setCanal] = useState<Canal>(params.canal === "email" ? "email" : "sms")
  const [saisie, setSaisie] = useState("")
  const [destinataire, setDestinataire] = useState("")
  const [code, setCode] = useState("")
  const [envoyeA, setEnvoyeA] = useState(0)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState("")
  const termine = useRef(false)

  // Connecté : le profil voyageur est créé s'il manque, puis on rend la main.
  useEffect(() => {
    if (!isAuthenticated || termine.current) return
    termine.current = true
    void assurerProfil({})
      .catch(() => undefined)
      .then(async () => {
        const premiereFois = !bienvenueVue
        await marquerBienvenueVue()
        if (premiereFois || !router.canGoBack()) router.replace("/")
        else router.back()
      })
  }, [isAuthenticated, assurerProfil, bienvenueVue, marquerBienvenueVue])

  const canalDisponible = !etat || etat.developmentEnabled || (canal === "sms" ? etat.smsDeliveryEnabled : etat.emailDeliveryEnabled)

  async function envoyer() {
    const cible = canal === "sms" ? normaliserTelephone(saisie) : saisie.trim().toLowerCase()
    if (!cible || (canal === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cible))) {
      setErreur(canal === "sms" ? "Indiquez un numéro gabonais à 8 chiffres, par exemple 077 12 34 56." : "Indiquez une adresse e-mail valide.")
      return
    }
    setEnCours(true)
    setErreur("")
    try {
      const reponse =
        canal === "sms"
          ? await authClient.phoneNumber.sendOtp({ phoneNumber: cible })
          : await authClient.emailOtp.sendVerificationOtp({ email: cible, type: "sign-in" })
      if (reponse.error) throw new Error(reponse.error.message)
      setDestinataire(cible)
      setCode("")
      setEnvoyeA(Date.now())
    } catch (cause) {
      setErreur(messageErreur(cause))
    } finally {
      setEnCours(false)
    }
  }

  async function valider(valeur = code) {
    if (valeur.length !== 6) {
      setErreur("Saisissez les 6 chiffres du code.")
      return
    }
    setEnCours(true)
    setErreur("")
    try {
      const reponse =
        canal === "sms"
          ? await authClient.phoneNumber.verify({ phoneNumber: destinataire, code: valeur })
          : await authClient.signIn.emailOtp({ email: destinataire, otp: valeur })
      if (reponse.error) throw new Error(reponse.error.message)
    } catch (cause) {
      setErreur(messageErreur(cause))
      setEnCours(false)
    }
  }

  async function codeDeDeveloppement() {
    try {
      const resultat = await lireCodeDev({ identifier: destinataire })
      if (!resultat) throw new Error("Aucun code en attente pour cet identifiant.")
      setCode(resultat.code)
      await valider(resultat.code)
    } catch (cause) {
      setErreur(messageErreur(cause))
    }
  }

  const etapeCode = Boolean(destinataire)
  const resteRenvoi = envoyeA + DELAI_RENVOI - maintenant

  return (
    <Ecran>
        <BarreApp
          onRetour={
            etapeCode
              ? () => {
                  setDestinataire("")
                  setErreur("")
                }
              : undefined
          }
        />
        {etapeCode ? (
          <>
            <Corps style={{ gap: 16 }}>
              <View>
                <GrandTitre>{canal === "sms" ? "Entrez le code reçu par SMS" : "Entrez le code reçu par e-mail"}</GrandTitre>
                <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", marginTop: 2 }}>
                  <Text style={[typo.sous, { color: theme.colors.inkMuted }]}>
                    Envoyé au <Text style={{ fontFamily: fonts.monoMedium }}>{canal === "sms" ? telephone(destinataire) : destinataire}</Text> ·{" "}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={canal === "sms" ? "Modifier le numéro" : "Modifier l’adresse"}
                    onPress={() => {
                      setDestinataire("")
                      setErreur("")
                    }}
                    style={{ minHeight: 44, minWidth: 44, justifyContent: "center" }}
                  >
                    <Text style={[typo.sous, { fontFamily: fonts.semibold, color: theme.colors.accentInk }]}>Modifier</Text>
                  </Pressable>
                </View>
              </View>
              <CodeOtp valeur={code} onChange={setCode} onComplet={(complet) => void valider(complet)} />
              {resteRenvoi > 0 ? (
                <Text style={[typo.sous, { color: theme.colors.inkMuted }]}>
                  Renvoyer le code dans <Text style={{ fontFamily: fonts.monoSemibold, color: theme.colors.ink }}>{rebours(resteRenvoi)}</Text>
                </Text>
              ) : (
                <View style={{ alignItems: "flex-start" }}>
                  <LienM titre="Renvoyer le code" onPress={() => void envoyer()} />
                </View>
              )}
              <Erreur>{erreur}</Erreur>
              {etat?.developmentEnabled ? <LienM titre="Utiliser le code de développement" onPress={() => void codeDeDeveloppement()} couleur={theme.colors.inkMuted} /> : null}
            </Corps>
            <Bas sansBord>
              <Button title="Valider" size="lg" block loading={enCours} onPress={() => void valider()} />
            </Bas>
          </>
        ) : (
          <>
            <Corps style={{ gap: 16 }}>
              <View style={{ gap: 6 }}>
                <GrandTitre>{canal === "sms" ? "Votre numéro de téléphone" : "Votre adresse e-mail"}</GrandTitre>
                <SousTitre>Nous vous envoyons un code à 6 chiffres. Pas de mot de passe ; le compte se crée à la première connexion.</SousTitre>
              </View>
              <ChampIdentifiant canal={canal} valeur={saisie} onChange={setSaisie} onValider={() => void envoyer()} />
              {!canalDisponible ? (
                <Text style={[typo.sous, { color: theme.colors.warningInk }]}>
                  L’envoi de codes {canal === "sms" ? "par SMS" : "par e-mail"} n’est pas encore disponible. Essayez l’autre moyen.
                </Text>
              ) : null}
              <Erreur>{erreur}</Erreur>
            </Corps>
            <Bas sansBord>
              <Button title="Recevoir le code" size="lg" block loading={enCours} disabled={!canalDisponible} onPress={() => void envoyer()} />
              <LienM
                titre={canal === "sms" ? "J'ai une adresse e-mail" : "Utiliser mon numéro de téléphone"}
                onPress={() => {
                  setCanal(canal === "sms" ? "email" : "sms")
                  setSaisie("")
                  setErreur("")
                }}
              />
              {!bienvenueVue ? (
                <LienM
                  titre="Continuer sans compte"
                  couleur={theme.colors.inkMuted}
                  onPress={() => {
                    void marquerBienvenueVue()
                    router.replace("/")
                  }}
                />
              ) : null}
            </Bas>
          </>
        )}
    </Ecran>
  )
}

/** Saisie du numéro (préfixe +241 affiché) ou de l'adresse e-mail. */
function ChampIdentifiant({ canal, valeur, onChange, onValider }: { canal: Canal; valeur: string; onChange: (valeur: string) => void; onValider: () => void }) {
  const theme = useTheme()
  const [focus, setFocus] = useState(false)
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        minHeight: 56,
        paddingHorizontal: 14,
        borderRadius: theme.radius.md,
        borderWidth: focus ? 2 : 1,
        borderColor: focus ? theme.colors.accent : theme.colors.lineStrong,
        backgroundColor: theme.colors.surface,
      }}
    >
      {canal === "sms" ? <Text style={{ fontFamily: fonts.monoMedium, fontSize: 18, color: theme.colors.inkMuted }}>+241</Text> : null}
      <TextInput
        value={valeur}
        onChangeText={onChange}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        onSubmitEditing={onValider}
        autoFocus
        keyboardType={canal === "sms" ? "phone-pad" : "email-address"}
        autoComplete={canal === "sms" ? "tel-national" : "email"}
        textContentType={canal === "sms" ? "telephoneNumber" : "emailAddress"}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={canal === "sms" ? "77 12 34 56" : "nom@exemple.ga"}
        placeholderTextColor={theme.colors.inkFaint}
        accessibilityLabel={canal === "sms" ? "Numéro de téléphone" : "Adresse e-mail"}
        style={{ flex: 1, minHeight: 52, fontFamily: canal === "sms" ? fonts.monoMedium : fonts.medium, fontSize: 18, color: theme.colors.ink }}
      />
    </View>
  )
}
