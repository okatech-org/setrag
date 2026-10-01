import { useMemo, useState } from "react"
import { Alert, Pressable, View } from "react-native"
import { useMutation, useQuery } from "convex/react"
import type { GenericId } from "convex/values"
import { Baby } from "lucide-react-native"

import { api } from "@workspace/backend/generated"
import { Button, Text, useTheme } from "@workspace/mobile-ui/components"
import { fonts } from "@workspace/mobile-ui/tokens"

import { Bas, BarreApp, Corps, Ecran, Erreur, SousTitre } from "@/components/ecran"
import { Avatar, Carte, EtatVide } from "@/components/elements"
import { typo } from "@/components/typo"
import { FeuilleVoyageur, type Reduction } from "@/components/voyageur"
import { initiales, messageErreur } from "@/lib/format"
import type { Voyageur } from "@/lib/journey"
import { useCompte } from "@/lib/compte"

/** Voyageurs enregistrés : on les reprend d'un geste en réservant. */
export default function Voyageurs() {
  const theme = useTheme()
  const { actif } = useCompte()
  const liste = useQuery(api.functions.customers.listSavedPassengers, actif ? {} : "skip")
  const toutesReductions = useQuery(api.functions.fareSchedules.publicDiscounts, {})
  const ajouter = useMutation(api.functions.customers.addSavedPassenger)
  const modifier = useMutation(api.functions.customers.updateSavedPassenger)
  const retirer = useMutation(api.functions.customers.removeSavedPassenger)
  const reductions: Reduction[] = useMemo(() => (toutesReductions ?? []).filter((item) => item.minPassengers === null), [toutesReductions])
  const [edition, setEdition] = useState<{ id: GenericId<"savedPassengers"> | null; voyageur: Voyageur } | null>(null)
  const [erreur, setErreur] = useState("")

  async function enregistrer(voyageur: Voyageur) {
    if (!edition) return
    const champs = { firstName: voyageur.prenom, lastName: voyageur.nom, gender: voyageur.civilite, birthDate: voyageur.naissance, discountCode: voyageur.reduction }
    try {
      if (edition.id) await modifier({ passengerId: edition.id, ...champs })
      else await ajouter(champs)
      setEdition(null)
    } catch (cause) {
      setErreur(messageErreur(cause))
    }
  }

  function supprimer(id: GenericId<"savedPassengers">) {
    Alert.alert("Retirer ce voyageur ?", "Ses billets déjà émis ne changent pas.", [
      { text: "Garder", style: "cancel" },
      {
        text: "Retirer",
        style: "destructive",
        onPress: () => {
          setEdition(null)
          void retirer({ passengerId: id }).catch((cause) => setErreur(messageErreur(cause)))
        },
      },
    ])
  }

  return (
    <Ecran>
      <BarreApp titre="Voyageurs enregistrés" />
      <Corps>
        <SousTitre>Ils se reprennent d’un geste quand vous réservez.</SousTitre>
        {liste === undefined ? null : liste.length === 0 ? (
          <EtatVide titre="Aucun voyageur enregistré" texte="Ajoutez les personnes avec qui vous voyagez souvent : enfants, proches, collègues." />
        ) : (
          <Carte>
            {liste.map((item, index) => {
              const reduction = reductions.find((candidate) => candidate.code === item.discountCode)
              return (
                <Pressable
                  key={item._id}
                  accessibilityRole="button"
                  accessibilityHint="Modifier ce voyageur"
                  onPress={() =>
                    setEdition({
                      id: item._id,
                      voyageur: { prenom: item.firstName, nom: item.lastName, civilite: item.gender, naissance: item.birthDate, reduction: item.discountCode },
                    })
                  }
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    minHeight: 56,
                    paddingVertical: 12,
                    paddingHorizontal: 16,
                    borderTopWidth: index === 0 ? 0 : 1,
                    borderTopColor: theme.colors.line,
                    backgroundColor: pressed ? theme.colors.surfaceSunk : "transparent",
                  })}
                >
                  <Avatar>{reduction?.maxAge !== null && reduction?.maxAge !== undefined && reduction.maxAge <= 12 ? <Baby size={18} color={theme.colors.secondInk} /> : initiales(item.firstName, item.lastName)}</Avatar>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: theme.colors.ink }}>
                      {item.firstName} {item.lastName}
                    </Text>
                    <Text style={[typo.petit, { color: theme.colors.inkMuted }]}>
                      {item.gender === "F" ? "Madame" : "Monsieur"}
                      {reduction ? ` · ${reduction.label.toLowerCase()} −${reduction.ratePct} %` : ""}
                    </Text>
                  </View>
                </Pressable>
              )
            })}
          </Carte>
        )}
        <Erreur>{erreur}</Erreur>
      </Corps>
      <Bas>
        <Button title="Ajouter un voyageur" size="lg" block onPress={() => setEdition({ id: null, voyageur: { prenom: "", nom: "", civilite: "F" } })} />
      </Bas>
      {edition ? (
        <FeuilleVoyageur
          key={edition.id ?? "nouveau"}
          visible
          titre={edition.id ? "Modifier le voyageur" : "Nouveau voyageur"}
          voyageur={edition.voyageur}
          reductions={reductions}
          enregistres={[]}
          libelleValider={edition.id ? "Enregistrer" : "Ajouter ce voyageur"}
          onValider={(voyageur) => void enregistrer(voyageur)}
          onSupprimer={edition.id ? () => supprimer(edition.id!) : undefined}
          onFermer={() => setEdition(null)}
        />
      ) : null}
    </Ecran>
  )
}
