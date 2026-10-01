import { useMemo, useState } from "react"
import { Pressable, View } from "react-native"
import { router } from "expo-router"
import { useConvex, useMutation, useQuery } from "convex/react"
import { Baby } from "lucide-react-native"

import { api } from "@workspace/backend/generated"
import { Button, Field, Input, Text, useTheme } from "@workspace/mobile-ui/components"
import { fonts } from "@workspace/mobile-ui/tokens"

import { Etapes, OptionRadio } from "@/components/achat"
import { Bas, BarreApp, Corps, Ecran, Erreur, Etiquette, Total } from "@/components/ecran"
import { Avatar, Carte, EtatVide } from "@/components/elements"
import { TrajetHeures } from "@/components/trajet"
import { typo } from "@/components/typo"
import { FeuilleVoyageur, voyageurComplet, type Reduction } from "@/components/voyageur"
import { useBookings } from "@/lib/bookings-cache"
import { initiales, messageErreur, montant, normaliserTelephone, xaf } from "@/lib/format"
import { useJourney, type Voyageur } from "@/lib/journey"
import { CLASSES, classeLongue, nomTrain } from "@/lib/voyage"
import { useCompte } from "@/lib/compte"

const VIDE: Voyageur = { prenom: "", nom: "", civilite: "F" }

export default function Reservation() {
  const theme = useTheme()
  const convex = useConvex()
  const { actif, profil } = useCompte()
  const { save } = useBookings()
  const { recherche, choix, classe, setClasse, voyageurs, setVoyageurs, setTenue } = useJourney()
  const { depart, arrivee } = recherche
  const enregistres = useQuery(api.functions.customers.listSavedPassengers, actif ? {} : "skip")
  const toutesReductions = useQuery(api.functions.fareSchedules.publicDiscounts, {})
  const creer = useMutation(api.functions.bookings.create)

  // Les réductions de groupe s'appliquent au guichet, pas voyageur par voyageur.
  const reductions: Reduction[] = useMemo(() => (toutesReductions ?? []).filter((item) => item.minPassengers === null), [toutesReductions])
  const moi = profil?.user
  const [saisis, setListe] = useState<Voyageur[]>(() => Array.from({ length: recherche.voyageurs }, (_, index) => voyageurs[index] ?? VIDE))
  // Connecté, le premier voyageur est le titulaire du compte, tant qu'il n'a pas été saisi.
  const liste = saisis.map((voyageur, index) =>
    index === 0 && !voyageur.prenom && !voyageur.nom && moi?.firstName && moi.lastName
      ? { prenom: moi.firstName, nom: moi.lastName, civilite: moi.gender === "M" ? ("M" as const) : ("F" as const) }
      : voyageur,
  )
  const [edition, setEdition] = useState<number | null>(null)
  const [telephone, setTelephone] = useState("")
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState("")

  const devis = useQuery(
    api.functions.bookings.quote,
    choix && depart && arrivee
      ? {
          tripId: choix.tripId,
          originStationId: depart._id,
          destinationStationId: arrivee._id,
          serviceClass: classe,
          passengerCount: liste.length,
          discountCodes: liste.map((item) => item.reduction ?? ""),
        }
      : "skip",
  )

  if (!choix || !depart || !arrivee) {
    return (
      <Ecran>
        <BarreApp titre="Voyageurs et classe" />
        <EtatVide titre="Aucun train choisi" texte="Revenez aux résultats pour choisir un train." action={<Button title="Chercher un train" onPress={() => router.replace("/")} />} />
      </Ecran>
    )
  }

  const telephoneCompte = moi?.phone ? normaliserTelephone(moi.phone) : null
  const estMoi = (voyageur: Voyageur, index: number) => index === 0 && Boolean(moi?.firstName) && voyageur.prenom === moi?.firstName && voyageur.nom === moi?.lastName

  async function continuer() {
    if (!choix || !depart || !arrivee) return
    const incomplet = liste.findIndex((item) => !voyageurComplet(item, reductions))
    if (incomplet !== -1) {
      setEdition(incomplet)
      return
    }
    const contact = telephoneCompte ?? normaliserTelephone(telephone)
    if (!contact) {
      setErreur("Indiquez un numéro gabonais à 8 chiffres : il permet de retrouver vos billets.")
      return
    }
    setErreur("")
    setEnCours(true)
    try {
      const reponse = await creer({
        tripId: choix.tripId,
        originStationId: depart._id,
        destinationStationId: arrivee._id,
        serviceClass: classe,
        contactPhone: contact,
        contactEmail: moi?.email && !moi.email.endsWith("@auth.setrag.local") ? moi.email : undefined,
        passengers: liste.map((item) => ({
          firstName: item.prenom,
          lastName: item.nom,
          gender: item.civilite,
          birthDate: item.naissance,
          discountCode: item.reduction,
        })),
      })
      setVoyageurs(liste)
      setTenue({ reference: reponse.reference, telephoneContact: contact, expireAt: reponse.holdExpiresAt, totalTtc: devis?.totalTtc ?? 0, billets: liste.length, classe })
      // La réservation non payée rejoint la copie locale : elle se retrouve sans réseau.
      const dossier = await convex.query(api.functions.bookings.getByReference, { reference: reponse.reference, contactPhone: contact }).catch(() => null)
      if (dossier) await save(dossier).catch(() => undefined)
      router.push("/paiement")
    } catch (cause) {
      setErreur(messageErreur(cause))
    } finally {
      setEnCours(false)
    }
  }

  return (
    <Ecran>
      <BarreApp titre="Voyageurs et classe" sousTitre="Étape 2 sur 4" />
      <Corps>
        <Etapes courante={1} />
        <Carte style={{ padding: 16 }}>
          <TrajetHeures
            departAt={choix.departAt}
            arriveeAt={choix.arriveeAt}
            gareDepart={depart.name}
            gareArrivee={arrivee.name}
            milieu={nomTrain(choix.trainType, choix.trainNumber)}
            progression={1}
          />
        </Carte>

        <Etiquette>Classe</Etiquette>
        <View accessibilityRole="radiogroup" accessibilityLabel="Classe" style={{ gap: 8 }}>
          {CLASSES.filter((item) => choix.unitaires[item] !== undefined).map((item) => {
            const restantes = choix.disponibles[item] ?? 0
            const complet = restantes < liste.length
            return (
              <OptionRadio
                key={item}
                coche={classe === item}
                titre={classeLongue(item)}
                precision={complet ? "Complet pour ce groupe" : restantes < 10 ? `Encore ${restantes} place${restantes > 1 ? "s" : ""}` : "Place attribuée"}
                desactive={complet}
                onPress={() => setClasse(item)}
                droite={<Text style={{ fontFamily: fonts.bold, fontSize: 16, color: theme.colors.ink }}>{montant(choix.unitaires[item]!)}</Text>}
                accessibilite={`${classeLongue(item)}, ${montant(choix.unitaires[item]!)} francs la place`}
              />
            )
          })}
        </View>

        <Etiquette>Voyageurs</Etiquette>
        <Carte>
          {liste.map((voyageur, index) => {
            const reduction = reductions.find((item) => item.code === voyageur.reduction)
            const ligne = devis?.lines[index]
            const complet = voyageurComplet(voyageur, reductions)
            const enfant = reduction?.maxAge !== null && reduction?.maxAge !== undefined && reduction.maxAge <= 12
            const nom = estMoi(voyageur, index) ? "Vous" : voyageur.prenom ? `${voyageur.prenom} ${voyageur.nom}`.trim() : `Voyageur ${index + 1}`
            const type = reduction ? reduction.label.toLowerCase() : "adulte"
            return (
              <Pressable
                key={index}
                accessibilityRole="button"
                accessibilityHint="Modifier ce voyageur"
                onPress={() => setEdition(index)}
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
                <Avatar>{enfant ? <Baby size={18} color={theme.colors.secondInk} /> : initiales(voyageur.prenom, voyageur.nom)}</Avatar>
                <View style={{ flex: 1 }}>
                  <Text style={[typo.gras15, { color: theme.colors.ink }]}>
                    {nom} · {type}
                  </Text>
                  <Text style={[typo.petit, { color: complet ? theme.colors.inkMuted : theme.colors.warningInk }]}>
                    {!complet ? "À compléter : touchez pour saisir" : reduction ? `Réduction ${reduction.label.toLowerCase()} −${reduction.ratePct} %` : "Plein tarif"}
                  </Text>
                </View>
                <Text style={[typo.mono13, { color: theme.colors.ink, fontSize: 14 }]}>{ligne ? montant(ligne.unitPriceTtc) : "…"}</Text>
              </Pressable>
            )
          })}
        </Carte>

        {!telephoneCompte ? (
          <>
            <Etiquette>Contact</Etiquette>
            <Field label="Téléphone" hint="Il permet de retrouver vos billets, et reçoit le reçu par SMS.">
              <Input value={telephone} onChangeText={setTelephone} keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" placeholder="077 12 34 56" />
            </Field>
          </>
        ) : null}
        <Erreur>{erreur}</Erreur>
      </Corps>
      <Bas>
        <Total libelle={`Total · ${liste.length} voyageur${liste.length > 1 ? "s" : ""}`} valeur={devis ? xaf(devis.totalTtc) : "…"} />
        <Button title="Continuer" size="lg" block loading={enCours} disabled={!devis || !devis.hasAvailability} onPress={() => void continuer()} />
      </Bas>

      {edition !== null ? (
        <FeuilleVoyageur
          key={edition}
          visible
          titre={edition === 0 && estMoi(liste[0]!, 0) ? "Vous" : `Voyageur ${edition + 1}`}
          voyageur={liste[edition] ?? VIDE}
          reductions={reductions}
          enregistres={enregistres ?? []}
          onFermer={() => setEdition(null)}
          onValider={(voyageur) => {
            setListe(liste.map((item, index) => (index === edition ? voyageur : item)))
            setEdition(null)
          }}
        />
      ) : null}
    </Ecran>
  )
}
