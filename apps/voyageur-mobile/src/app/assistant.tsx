import { useEffect, useRef, useState } from "react"
import { Animated, Easing, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, useWindowDimensions, View } from "react-native"
import { router } from "expo-router"
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react"
import type { GenericId } from "convex/values"
import * as Crypto from "expo-crypto"
import { CalendarClock, Luggage, Route, Ticket, X } from "lucide-react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { api } from "@workspace/backend/generated"
import { Button, Text, useTheme } from "@workspace/mobile-ui/components"
import { SigneRuban, useMouvementReduit } from "@workspace/mobile-ui/marque"
import { fonts, motion, voile } from "@workspace/mobile-ui/tokens"

import { Erreur } from "@/components/ecran"
import { RondEncre } from "@/components/ruban"
import { messageErreur } from "@/lib/format"

type Message = { id: string; auteur: "moi" | "ruban"; texte: string }
type Validation = { callId: string; label: string; input: unknown }

const RACCOURCIS = [
  { icone: Ticket, libelle: "Réserver un trajet", demande: "Je voudrais réserver un trajet." },
  { icone: Route, libelle: "Suivre mon train", demande: "Où en est mon prochain train ?" },
  { icone: CalendarClock, libelle: "Changer une réservation", demande: "Je voudrais changer une réservation." },
  { icone: Luggage, libelle: "Bagages, animaux", demande: "Quelles sont les règles pour les bagages et les animaux ?" },
]

/** Le texte de Ruban arrive en Markdown : on le rend lisible tel quel. */
function lisible(message: string) {
  return message
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1 ($2)")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/\*\*|__/g, "")
    .replace(/`/g, "")
}

/**
 * Ruban, l'assistant : une feuille à mi-hauteur avec quatre raccourcis ;
 * tirée vers le haut, la conversation.
 */
export default function Assistant() {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { height: hauteur } = useWindowDimensions()
  const reduit = useMouvementReduit()
  // La feuille monte en 320 ms, sans rebond ; le voile vient en fondu.
  const [montee] = useState(() => new Animated.Value(0))
  useEffect(() => {
    const animation = Animated.timing(montee, { toValue: 1, duration: reduit ? 0 : motion.durationSlow, easing: Easing.bezier(...motion.easing.standard), useNativeDriver: true })
    animation.start()
    return () => animation.stop()
  }, [montee, reduit])
  const { isAuthenticated } = useConvexAuth()
  const profil = useQuery(api.functions.customers.me, isAuthenticated ? {} : "skip")
  const configuration = useQuery(api.ai.conversations.getConfiguration, {})
  const creer = useMutation(api.ai.conversations.create)
  const envoyer = useAction(api.ai.chat.sendMessage)
  const approuver = useAction(api.ai.chat.approveToolCall)
  const refuser = useAction(api.ai.chat.rejectToolCall)
  const cleInvite = useRef(`${Crypto.randomUUID()}${Crypto.randomUUID()}`)
  const conversation = useRef<GenericId<"assistantConversations"> | null>(null)
  const fil = useRef<ScrollView>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [validations, setValidations] = useState<Validation[]>([])
  const [saisie, setSaisie] = useState("")
  const [reflechit, setReflechit] = useState(false)
  const [erreur, setErreur] = useState("")
  const disponible = configuration?.assistants.some((item) => item.id === "concierge" && item.configured) ?? false

  async function conversationCourante() {
    if (conversation.current) return conversation.current
    const resultat = await creer({ guestKey: cleInvite.current, assistantId: "concierge" })
    conversation.current = resultat.conversationId
    return resultat.conversationId
  }

  async function demander(texte: string) {
    const contenu = texte.trim()
    if (!contenu || reflechit || !disponible) return
    setSaisie("")
    setErreur("")
    setReflechit(true)
    setMessages((courants) => [...courants, { id: Crypto.randomUUID(), auteur: "moi", texte: contenu }])
    try {
      const id = await conversationCourante()
      const reponse = await envoyer({ conversationId: id, guestKey: cleInvite.current, requestId: Crypto.randomUUID(), content: contenu, pageContext: "Application mobile SETRAG" })
      setMessages((courants) => [...courants, { id: Crypto.randomUUID(), auteur: "ruban", texte: reponse.message }])
      setValidations(reponse.pendingApprovals)
    } catch (cause) {
      setErreur(messageErreur(cause))
    } finally {
      setReflechit(false)
    }
  }

  async function decider(callId: string, accepte: boolean) {
    if (!conversation.current) return
    setReflechit(true)
    setErreur("")
    try {
      const resultat = accepte
        ? await approuver({ conversationId: conversation.current, guestKey: cleInvite.current, callId })
        : await refuser({ conversationId: conversation.current, guestKey: cleInvite.current, callId })
      const texte = "message" in resultat ? resultat.message : resultat.status === "ok" ? "C'est fait." : "L'action n'a pas abouti."
      setMessages((courants) => [...courants, { id: Crypto.randomUUID(), auteur: "ruban", texte }])
      setValidations((courantes) => courantes.filter((item) => item.callId !== callId))
    } catch (cause) {
      setErreur(messageErreur(cause))
    } finally {
      setReflechit(false)
    }
  }

  const prenom = profil?.user.firstName

  // Mi-hauteur avec les raccourcis ; la conversation ouvre la feuille haute.
  const hauteurFeuille = messages.length || reflechit ? hauteur - insets.top - 8 : Math.round(hauteur * 0.6)

  return (
    <View style={{ flex: 1, justifyContent: "flex-end" }}>
      <Animated.View style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: voile, opacity: montee }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Revenir à l’écran précédent" onPress={() => router.back()} style={{ flex: 1 }} />
      </Animated.View>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} pointerEvents="box-none">
        <Animated.View
          accessibilityViewIsModal
          style={{
            height: hauteurFeuille,
            backgroundColor: theme.colors.canvas,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            overflow: "hidden",
            ...theme.shadows.lg,
            transform: [{ translateY: montee.interpolate({ inputRange: [0, 1], outputRange: [hauteurFeuille, 0] }) }],
          }}
        >
      <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: theme.colors.lineStrong, alignSelf: "center", marginTop: 8, marginBottom: 2 }} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 4, paddingBottom: 8, paddingLeft: 16, paddingRight: 8 }}>
        <RondEncre taille={36}>
          <SigneRuban hauteur={21} etat={reflechit ? "reflexion" : "repos"} />
        </RondEncre>
        <View style={{ flex: 1 }}>
          <Text accessibilityRole="header" style={{ fontFamily: fonts.bold, fontSize: 15.5, color: theme.colors.ink }}>
            Ruban
          </Text>
          <Text style={{ fontFamily: fonts.medium, fontSize: 12, color: theme.colors.inkMuted }}>Assistant SETRAG</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Fermer Ruban" onPress={() => router.back()} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
          <X size={19} color={theme.colors.inkMuted} />
        </Pressable>
      </View>

      <ScrollView
        ref={fil}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12, gap: 14, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => fil.current?.scrollToEnd({ animated: true })}
      >
        {messages.length === 0 ? (
          <View style={{ gap: 12 }}>
            <Text style={{ fontFamily: fonts.bold, fontSize: 22, lineHeight: 26, color: theme.colors.ink }}>
              Bonjour{prenom ? ` ${prenom}` : ""}, que puis-je faire ?
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {RACCOURCIS.map(({ icone: Icone, libelle, demande }) => (
                <Pressable
                  key={libelle}
                  accessibilityRole="button"
                  disabled={!disponible}
                  onPress={() => void demander(demande)}
                  style={({ pressed }) => ({
                    width: "48.5%",
                    minHeight: 64,
                    justifyContent: "center",
                    gap: 2,
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: theme.colors.line,
                    backgroundColor: pressed ? theme.colors.surfaceSunk : theme.colors.surface,
                    opacity: disponible ? 1 : 0.5,
                  })}
                >
                  <Icone size={18} color={theme.colors.accentInk} />
                  <Text style={{ fontFamily: fonts.semibold, fontSize: 13.5, lineHeight: 18, color: theme.colors.ink }}>{libelle}</Text>
                </Pressable>
              ))}
            </View>
            {configuration && !disponible ? (
              <Text style={{ fontFamily: fonts.regular, fontSize: 14, color: theme.colors.warningInk }}>Ruban n’est pas encore en service. Les raccourcis s’ouvriront dès son activation.</Text>
            ) : null}
          </View>
        ) : (
          <View style={{ flexGrow: 1, justifyContent: "flex-end", gap: 14 }}>
            {messages.map((message) =>
              message.auteur === "moi" ? (
                <View
                  key={message.id}
                  style={{
                    alignSelf: "flex-end",
                    maxWidth: "84%",
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                    borderTopLeftRadius: 18,
                    borderTopRightRadius: 18,
                    borderBottomRightRadius: 4,
                    borderBottomLeftRadius: 18,
                    backgroundColor: theme.colors.accent,
                  }}
                >
                  <Text style={{ fontFamily: fonts.medium, fontSize: 15, lineHeight: 21, color: theme.colors.inkInverse }}>{message.texte}</Text>
                </View>
              ) : (
                <ReponseRuban key={message.id}>
                  <Text style={{ fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: theme.colors.ink }}>{lisible(message.texte)}</Text>
                </ReponseRuban>
              ),
            )}
            {validations.map((item) => (
              <ReponseRuban key={item.callId}>
                <View style={{ borderWidth: 1, borderColor: theme.colors.line, borderRadius: 16, backgroundColor: theme.colors.surface, overflow: "hidden" }}>
                  <View style={{ paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: theme.colors.line }}>
                    <Text style={{ fontFamily: fonts.bold, fontSize: 11.5, letterSpacing: 0.6, textTransform: "uppercase", color: theme.colors.inkMuted }}>À confirmer</Text>
                  </View>
                  <View style={{ padding: 14, gap: 12 }}>
                    <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: theme.colors.ink }}>{item.label}</Text>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <Button title="Refuser" variant="secondary" onPress={() => void decider(item.callId, false)} />
                      <View style={{ flex: 1 }}>
                        <Button title="Confirmer" block loading={reflechit} onPress={() => void decider(item.callId, true)} />
                      </View>
                    </View>
                  </View>
                </View>
              </ReponseRuban>
            ))}
            {reflechit ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }} accessibilityLiveRegion="polite" accessibilityLabel="Ruban réfléchit">
                <RondEncre taille={26}>
                  <SigneRuban hauteur={15} etat="reflexion" />
                </RondEncre>
                <Text style={{ fontFamily: fonts.medium, fontSize: 14, color: theme.colors.inkMuted }}>Ruban cherche…</Text>
              </View>
            ) : null}
          </View>
        )}
        <Erreur>{erreur}</Erreur>
      </ScrollView>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 10, paddingHorizontal: 12, paddingBottom: Math.max(insets.bottom, 12), backgroundColor: theme.colors.surface, borderTopWidth: 1, borderTopColor: theme.colors.line }}>
        <View style={{ flex: 1, minHeight: 50, justifyContent: "center", paddingHorizontal: 16, borderRadius: 25, borderWidth: 1, borderColor: theme.colors.lineStrong, backgroundColor: theme.colors.canvas }}>
          <TextInput
            value={saisie}
            onChangeText={setSaisie}
            onSubmitEditing={() => void demander(saisie)}
            editable={disponible}
            placeholder="Écrivez à Ruban…"
            placeholderTextColor={theme.colors.inkFaint}
            returnKeyType="send"
            accessibilityLabel="Message à Ruban"
            style={{ minHeight: 44, fontFamily: fonts.regular, fontSize: 15, color: theme.colors.ink }}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Envoyer"
          accessibilityState={{ disabled: !saisie.trim() || !disponible }}
          disabled={!saisie.trim() || !disponible || reflechit}
          onPress={() => void demander(saisie)}
          style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center", opacity: saisie.trim() ? 1 : 0.5 }}
        >
          <RondEncre taille={40}>
            <SigneRuban hauteur={19} />
          </RondEncre>
        </Pressable>
      </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  )
}

function ReponseRuban({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
      <View style={{ marginTop: 1 }}>
        <RondEncre taille={26}>
          <SigneRuban hauteur={15} />
        </RondEncre>
      </View>
      <View style={{ flex: 1, gap: 10 }}>{children}</View>
    </View>
  )
}
