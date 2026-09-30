"use client"

import { KeyRoundIcon } from "lucide-react"
import { useState, type FormEvent } from "react"
import { toast } from "sonner"

import { useAuth, useMutation } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { Field, Input } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import {
  AIDE_TELEPHONE,
  ChampTelephone,
} from "@/fonctionnalites/connexion/champ-telephone"
import { ChoixCivilite } from "@/fonctionnalites/connexion/choix-civilite"
import {
  ecritureNationale,
  emailTechnique,
  emailValide,
  normaliserEmail,
} from "@/fonctionnalites/connexion/identifiant"
import { erreurTelephone, lireTelephone } from "@/lib/telephone"
import { reseauDisponible } from "@/lib/reseau"
import type { Civilite } from "@/lib/titulaire"

import {
  Carte,
  EnTeteSousPage,
  ExigeConnexion,
  Page,
  type ProfilVoyageur,
} from "./elements"

/**
 * Comment le voyageur se connecte. Better Auth donne aux comptes ouverts par
 * téléphone une adresse technique : c'est elle qui trahit le canal.
 */
function useIdentifiantConnexion():
  | { canal: "telephone"; valeur: string }
  | { canal: "email"; valeur: string }
  | null {
  const { user } = useAuth()
  const numero = (user as { phoneNumber?: string | null } | null)?.phoneNumber
  if (numero && emailTechnique(user?.email))
    return { canal: "telephone", valeur: numero }
  if (user?.email && !emailTechnique(user.email))
    return { canal: "email", valeur: user.email }
  return null
}

function FormulaireProfil({ profil }: { profil: ProfilVoyageur }) {
  const { user } = profil
  const connexion = useIdentifiantConnexion()
  const majProfil = useMutation(api.functions.customers.updateProfile)

  const [prenom, setPrenom] = useState(user.firstName ?? "")
  const [nom, setNom] = useState(user.lastName ?? "")
  const [civilite, setCivilite] = useState<Civilite | "">(user.gender ?? "")
  const [tel, setTel] = useState(ecritureNationale(user.phone))
  const [email, setEmail] = useState(
    user.email && !emailTechnique(user.email) ? user.email : ""
  )
  const [erreurs, setErreurs] = useState<
    Partial<Record<"prenom" | "nom" | "telephone" | "email" | "envoi", string>>
  >({})
  const [envoi, setEnvoi] = useState(false)

  const telephoneModifiable = connexion?.canal !== "telephone"
  const emailModifiable = connexion?.canal !== "email"

  async function enregistrer(event: FormEvent) {
    event.preventDefault()
    const adresse = normaliserEmail(email)
    const lecture = tel.trim() ? lireTelephone(tel) : null
    const trouvees = {
      prenom: prenom.trim()
        ? undefined
        : "Indiquez votre prénom : il figure sur vos billets.",
      nom: nom.trim()
        ? undefined
        : "Indiquez votre nom : il figure sur vos billets.",
      telephone:
        telephoneModifiable && lecture && !lecture.ok
          ? erreurTelephone(lecture.raison)
          : undefined,
      email:
        emailModifiable && adresse && !emailValide(adresse)
          ? "Cette adresse e-mail est incomplète."
          : undefined,
    }
    setErreurs(trouvees)
    if (Object.values(trouvees).some(Boolean) || !reseauDisponible()) return
    setEnvoi(true)
    try {
      await majProfil({
        firstName: prenom.trim(),
        lastName: nom.trim(),
        // Facultative : un compte plus ancien peut ne pas l'avoir donnée.
        ...(civilite ? { gender: civilite } : {}),
        // Une chaîne vide efface le champ ; `undefined` le laisserait tel quel.
        ...(telephoneModifiable
          ? { phone: lecture?.ok ? lecture.numero : "" }
          : {}),
        ...(emailModifiable ? { email: adresse } : {}),
      })
      toast("Profil enregistré.")
    } catch {
      setErreurs({
        envoi:
          "Le profil n'a pas pu être enregistré. Réessayez dans un instant.",
      })
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <form
      onSubmit={enregistrer}
      noValidate
      className="grid grid-cols-[minmax(0,1fr)] gap-6"
    >
      {connexion && (
        <Carte className="grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3">
          <KeyRoundIcon className="mt-0.5 size-5 text-ink-muted" aria-hidden />
          <div className="grid gap-0.5">
            <p className="text-[13px] font-medium text-ink-muted">
              Identifiant de connexion
            </p>
            <p
              className={
                connexion.canal === "telephone"
                  ? "tabular text-[16px]"
                  : "truncate text-[16px] font-medium"
              }
            >
              {connexion.canal === "telephone"
                ? ecritureNationale(connexion.valeur)
                : connexion.valeur}
            </p>
            <p className="text-[12.5px] text-ink-muted">
              Le code de connexion arrive ici. Il ne se modifie pas depuis le
              profil.
            </p>
          </div>
        </Carte>
      )}

      <Carte className="gap-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Prénom" error={erreurs.prenom} htmlFor="profil-prenom">
            <Input
              autoComplete="given-name"
              value={prenom}
              onChange={(event) => setPrenom(event.target.value)}
            />
          </Field>
          <Field label="Nom" error={erreurs.nom} htmlFor="profil-nom">
            <Input
              autoComplete="family-name"
              value={nom}
              onChange={(event) => setNom(event.target.value)}
            />
          </Field>
        </div>
        <ChoixCivilite
          valeur={civilite}
          onChange={setCivilite}
          id="profil-civilite"
          facultative={!user.gender}
        />
        {telephoneModifiable && (
          <Field
            label="Téléphone (facultatif)"
            hint={AIDE_TELEPHONE}
            error={erreurs.telephone}
            htmlFor="profil-telephone"
          >
            <ChampTelephone valeur={tel} onChange={setTel} />
          </Field>
        )}
        {emailModifiable && (
          <Field
            label="Adresse e-mail (facultative)"
            error={erreurs.email}
            htmlFor="profil-email"
          >
            <Input
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="nadia@exemple.ga"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
        )}
      </Carte>

      {erreurs.envoi && <InlineMessage tone="danger" title={erreurs.envoi} />}

      <Button
        type="submit"
        size="lg"
        loading={envoi}
        loadingLabel="Enregistrement…"
        className="w-full md:w-fit"
      >
        Enregistrer
      </Button>
    </form>
  )
}

export function Profil() {
  return (
    <>
      <EnTeteSousPage titre="Profil" />
      <Page>
        <ExigeConnexion
          invitation={{
            titre: "Connectez-vous pour modifier votre profil",
            texte:
              "Votre nom et vos coordonnées sont rattachés à votre compte.",
          }}
        >
          {(profil) => <FormulaireProfil profil={profil} />}
        </ExigeConnexion>
      </Page>
    </>
  )
}
