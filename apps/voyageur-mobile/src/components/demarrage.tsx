import { View } from "react-native"
import Constants from "expo-constants"

import { Text } from "@workspace/mobile-ui/components"
import { Logo } from "@workspace/mobile-ui/marque"
import { colors, fonts } from "@workspace/mobile-ui/tokens"

/**
 * Démarrage : fond blanc, rien d'autre que le logo. Il ne retient personne :
 * il ne reste affiché que le temps de relire la session et les réglages.
 */
export function Demarrage() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.light.surface, alignItems: "center", justifyContent: "center", paddingHorizontal: 28, paddingBottom: 60 }}>
      <Logo variante="compact" hauteur={110} />
      <Text style={{ position: "absolute", bottom: 42, fontFamily: fonts.monoMedium, fontSize: 11.5, color: colors.light.inkFaint }}>
        SETRAG · version {Constants.expoConfig?.version ?? "1.0"}
      </Text>
    </View>
  )
}
