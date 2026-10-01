import { useState } from "react"
import { Pressable, ScrollView, View } from "react-native"

import { Button, Field, Input, Text, useTheme } from "@workspace/mobile-ui/components"
import { fonts } from "@workspace/mobile-ui/tokens"

import type { Voyageur } from "@/lib/journey"
import { OptionRadio } from "./achat"
import { Erreur, Etiquette } from "./ecran"
import { Feuille } from "./feuille"

export type Reduction = {
  code: string
  label: string
  ratePct: number
  minAge: number | null
  maxAge: number | null
  requiresProof: boolean
}

export type VoyageurEnregistre = {
  _id: string
  firstName: string
  lastName: string
  gender: "M" | "F"
  birthDate?: string
  discountCode?: string
}

/** Une réduction liée à l'âge demande la date de naissance. */
export const demandeNaissance = (reduction?: Reduction) => Boolean(reduction && (reduction.minAge !== null || reduction.maxAge !== null))

/** Voyageur prêt à réserver : nom, prénom, et date de naissance si la réduction l'exige. */
export function voyageurComplet(voyageur: Voyageur, reductions: Reduction[]) {
  const reduction = reductions.find((item) => item.code === voyageur.reduction)
  return Boolean(voyageur.prenom.trim() && voyageur.nom.trim() && (!demandeNaissance(reduction) || /^\d{4}-\d{2}-\d{2}$/.test(voyageur.naissance ?? "")))
}

const versSaisie = (iso?: string) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split("-").reverse().join("/") : "")
const versIso = (saisie: string) => {
  const morceaux = saisie.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!morceaux) return undefined
  const [, jour, mois, annee] = morceaux
  return `${annee}-${mois!.padStart(2, "0")}-${jour!.padStart(2, "0")}`
}

/**
 * Feuille d'un voyageur : nom, civilité, réduction. Les voyageurs enregistrés
 * du compte se reprennent d'un geste.
 */
export function FeuilleVoyageur({
  visible,
  titre,
  voyageur,
  reductions,
  enregistres,
  onValider,
  onFermer,
  onSupprimer,
  libelleValider = "Enregistrer ce voyageur",
}: {
  visible: boolean
  titre: string
  voyageur: Voyageur
  reductions: Reduction[]
  enregistres: VoyageurEnregistre[]
  onValider: (voyageur: Voyageur) => void
  onFermer: () => void
  /** Voyageur enregistré : on peut aussi le retirer du compte. */
  onSupprimer?: () => void
  libelleValider?: string
}) {
  const theme = useTheme()
  const [brouillon, setBrouillon] = useState(voyageur)
  const [naissance, setNaissance] = useState(versSaisie(voyageur.naissance))
  const [erreur, setErreur] = useState("")
  const reduction = reductions.find((item) => item.code === brouillon.reduction)
  const modifier = (patch: Partial<Voyageur>) => setBrouillon((courant) => ({ ...courant, ...patch }))

  function valider() {
    const suivant = { ...brouillon, prenom: brouillon.prenom.trim(), nom: brouillon.nom.trim(), naissance: demandeNaissance(reduction) ? versIso(naissance) : undefined }
    if (!suivant.prenom || !suivant.nom) return setErreur("Indiquez le prénom et le nom, tels qu'ils figurent sur la pièce d'identité.")
    if (demandeNaissance(reduction) && !suivant.naissance) return setErreur("Indiquez la date de naissance au format JJ/MM/AAAA.")
    onValider(suivant)
  }

  return (
    <Feuille visible={visible} titre={titre} onFermer={onFermer}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40, gap: 16 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets>
        {enregistres.length > 0 ? (
          <View style={{ gap: 8 }}>
            <Etiquette>Vos voyageurs</Etiquette>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {enregistres.map((item) => {
                const actif = brouillon.prenom === item.firstName && brouillon.nom === item.lastName
                return (
                  <Pressable
                    key={item._id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: actif }}
                    onPress={() => {
                      setBrouillon({ prenom: item.firstName, nom: item.lastName, civilite: item.gender, reduction: item.discountCode, naissance: item.birthDate })
                      setNaissance(versSaisie(item.birthDate))
                    }}
                    style={{
                      minHeight: 44,
                      justifyContent: "center",
                      paddingHorizontal: 14,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: actif ? theme.colors.accentLine : theme.colors.lineStrong,
                      backgroundColor: actif ? theme.colors.accentSoft : theme.colors.surface,
                    }}
                  >
                    <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: actif ? theme.colors.accentInk : theme.colors.ink }}>
                      {item.firstName} {item.lastName}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          </View>
        ) : null}

        <Field label="Prénom">
          <Input value={brouillon.prenom} onChangeText={(prenom) => modifier({ prenom })} autoComplete="given-name" autoCapitalize="words" />
        </Field>
        <Field label="Nom">
          <Input value={brouillon.nom} onChangeText={(nom) => modifier({ nom })} autoComplete="family-name" autoCapitalize="characters" />
        </Field>
        <View style={{ gap: 8 }} accessibilityRole="radiogroup" accessibilityLabel="Civilité">
          <Etiquette>Civilité</Etiquette>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {(["F", "M"] as const).map((civilite) => (
              <View key={civilite} style={{ flex: 1 }}>
                <OptionRadio coche={brouillon.civilite === civilite} titre={civilite === "F" ? "Madame" : "Monsieur"} hauteurMin={52} onPress={() => modifier({ civilite })} />
              </View>
            ))}
          </View>
        </View>
        <View style={{ gap: 8 }} accessibilityRole="radiogroup" accessibilityLabel="Tarif">
          <Etiquette>Tarif</Etiquette>
          <OptionRadio coche={!brouillon.reduction} titre="Plein tarif" hauteurMin={52} onPress={() => modifier({ reduction: undefined })} />
          {reductions.map((item) => (
            <OptionRadio
              key={item.code}
              coche={brouillon.reduction === item.code}
              titre={`${item.label} −${item.ratePct} %`}
              precision={[
                // L'âge n'est rappelé que si le libellé ne le dit pas déjà.
                /\bans\b/.test(item.label)
                  ? null
                  : item.minAge !== null && item.maxAge !== null
                    ? `De ${item.minAge} à ${item.maxAge} ans`
                    : item.maxAge !== null
                      ? `Jusqu'à ${item.maxAge} ans`
                      : item.minAge !== null
                        ? `Dès ${item.minAge} ans`
                        : null,
                item.requiresProof ? "Justificatif demandé au contrôle" : null,
              ]
                .filter(Boolean)
                .join(" · ") || undefined}
              hauteurMin={52}
              onPress={() => modifier({ reduction: item.code })}
            />
          ))}
        </View>
        {demandeNaissance(reduction) ? (
          <Field label="Date de naissance" hint="Format JJ/MM/AAAA">
            <Input value={naissance} onChangeText={setNaissance} keyboardType="numbers-and-punctuation" placeholder="14/05/2018" maxLength={10} />
          </Field>
        ) : null}
        <Erreur>{erreur}</Erreur>
        <Button title={libelleValider} size="lg" block onPress={valider} />
        {onSupprimer ? <Button title="Retirer ce voyageur" variant="ghost" block onPress={onSupprimer} /> : null}
      </ScrollView>
    </Feuille>
  )
}
