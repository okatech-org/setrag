import { useState } from "react"
import { Alert, View } from "react-native"
import { useMutation, useQuery } from "convex/react"

import { api } from "@workspace/backend/generated"
import { Button, Text, useTheme } from "@workspace/mobile-ui/components"
import { fonts } from "@workspace/mobile-ui/tokens"

import { Bas, BarreApp, Corps, Ecran, Erreur, SousTitre } from "@/components/ecran"
import { Carte, EtatVide } from "@/components/elements"
import { typo } from "@/components/typo"
import { messageErreur } from "@/lib/format"
import { useCompte } from "@/lib/compte"

/** Ce que Ruban retient de vos voyages : chaque note s'oublie, une à une ou toutes. */
export default function MemoireRuban() {
  const theme = useTheme()
  const { actif } = useCompte()
  const notes = useQuery(api.ai.memory.listMine, actif ? {} : "skip")
  const oublier = useMutation(api.ai.memory.forget)
  const toutOublier = useMutation(api.ai.memory.forgetAll)
  const [erreur, setErreur] = useState("")

  return (
    <Ecran>
      <BarreApp titre="Ce que Ruban retient" />
      <Corps>
        <SousTitre>Vos habitudes et préférences de voyage, pour vous proposer le bon train plus vite.</SousTitre>
        {notes === undefined ? null : notes.length === 0 ? (
          <EtatVide titre="Ruban n'a rien retenu" texte="Ses notes sur vos préférences apparaîtront ici." />
        ) : (
          <Carte>
            {notes.map((note, index) => (
              <View
                key={note._id}
                style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingLeft: 16, paddingRight: 8, borderTopWidth: index ? 1 : 0, borderTopColor: theme.colors.line }}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: theme.colors.inkMuted }}>{note.category}</Text>
                  <Text style={[typo.sous, { color: theme.colors.ink }]}>{note.content}</Text>
                </View>
                <Button title="Oublier" variant="ghost" onPress={() => void oublier({ memoryId: note._id }).catch((cause) => setErreur(messageErreur(cause)))} />
              </View>
            ))}
          </Carte>
        )}
        <Erreur>{erreur}</Erreur>
      </Corps>
      {notes?.length ? (
        <Bas>
          <Button
            title="Tout oublier"
            variant="danger"
            block
            onPress={() =>
              Alert.alert("Effacer ce que Ruban retient ?", "Cette action est définitive.", [
                { text: "Garder", style: "cancel" },
                { text: "Tout oublier", style: "destructive", onPress: () => void toutOublier({}).catch((cause) => setErreur(messageErreur(cause))) },
              ])
            }
          />
        </Bas>
      ) : null}
    </Ecran>
  )
}
