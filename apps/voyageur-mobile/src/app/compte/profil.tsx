import { useState } from "react"
import { router } from "expo-router"
import { useMutation, useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"

import { api } from "@workspace/backend/generated"
import { Button, Field, Input } from "@workspace/mobile-ui/components"

import { Bas, BarreApp, Corps, Ecran, Erreur, SousTitre } from "@/components/ecran"
import { messageErreur, normaliserTelephone, telephone } from "@/lib/format"

type Utilisateur = NonNullable<FunctionReturnType<typeof api.functions.customers.me>>["user"]

export default function Profil() {
  const profil = useQuery(api.functions.customers.me, {})
  if (!profil) {
    return (
      <Ecran>
        <BarreApp titre="Mon profil" />
      </Ecran>
    )
  }
  return <Formulaire key={profil.user._id} utilisateur={profil.user} />
}

function Formulaire({ utilisateur }: { utilisateur: Utilisateur }) {
  const modifier = useMutation(api.functions.customers.updateProfile)
  const [prenom, setPrenom] = useState(utilisateur.firstName ?? "")
  const [nom, setNom] = useState(utilisateur.lastName ?? "")
  const [tel, setTel] = useState(utilisateur.phone ? telephone(utilisateur.phone) : "")
  // Une connexion par SMS crée une adresse technique : elle n'est pas montrée.
  const [email, setEmail] = useState(utilisateur.email?.endsWith("@auth.setrag.local") ? "" : (utilisateur.email ?? ""))
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState("")

  async function enregistrer() {
    setEnCours(true)
    setErreur("")
    try {
      await modifier({ firstName: prenom.trim(), lastName: nom.trim(), phone: tel.trim() ? (normaliserTelephone(tel) ?? tel.trim()) : undefined, email: email.trim() || undefined })
      router.back()
    } catch (cause) {
      setErreur(messageErreur(cause))
    } finally {
      setEnCours(false)
    }
  }

  return (
    <Ecran>
      <BarreApp titre="Mon profil" />
      <Corps>
        <SousTitre>Votre nom figure sur vos billets : écrivez-le comme sur votre pièce d’identité.</SousTitre>
        <Field label="Prénom">
          <Input value={prenom} onChangeText={setPrenom} autoComplete="given-name" autoCapitalize="words" />
        </Field>
        <Field label="Nom">
          <Input value={nom} onChangeText={setNom} autoComplete="family-name" autoCapitalize="characters" />
        </Field>
        <Field label="Téléphone">
          <Input value={tel} onChangeText={setTel} keyboardType="phone-pad" autoComplete="tel" />
        </Field>
        <Field label="E-mail" hint="Facultatif : pour recevoir vos billets en PDF.">
          <Input value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
        </Field>
        <Erreur>{erreur}</Erreur>
      </Corps>
      <Bas>
        <Button title="Enregistrer" size="lg" block loading={enCours} onPress={() => void enregistrer()} />
      </Bas>
    </Ecran>
  )
}
