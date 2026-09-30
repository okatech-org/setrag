"use client"

import { PlusIcon } from "lucide-react"
import type { FunctionReturnType } from "convex/server"
import { useState, type FormEvent } from "react"
import { toast } from "sonner"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Avatar } from "@workspace/ui/components/avatar"
import { Button } from "@workspace/ui/components/button"
import { Radio, RadioGroup } from "@workspace/ui/components/choice"
import { EmptyState, SkeletonLines } from "@workspace/ui/components/empty-state"
import { Feuille } from "@workspace/ui/components/feuille"
import { Field, Input, SelectNative } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import {
  AIDE_TELEPHONE,
  ChampTelephone,
} from "@/fonctionnalites/connexion/champ-telephone"
import { ecritureNationale } from "@/fonctionnalites/connexion/identifiant"
import {
  libelleEnfant,
  useReductions,
  type Reduction,
} from "@/fonctionnalites/reference/use-reference"
import { useToday } from "@/hooks/use-today"
import { dateDeService } from "@/lib/format"
import { erreurTelephone, lireTelephone } from "@/lib/telephone"
import { reseauDisponible } from "@/lib/reseau"
import { CIVILITES, estLeTitulaire, voyageurMoi } from "@/lib/titulaire"

import {
  EnTeteSousPage,
  ExigeConnexion,
  Ligne,
  Page,
  Section,
  type ProfilVoyageur,
} from "./elements"

type Fiche = FunctionReturnType<
  typeof api.functions.customers.listSavedPassengers
>[number]

const GENRES = { F: "Femme", M: "Homme" } as const

/** « Enfant (4 à 11 ans) · −50 % », « Militaire · −10 % · justificatif demandé ». */
function libelleReduction(
  reduction: Reduction,
  enfant: Reduction | null
): string {
  const nom = reduction === enfant ? libelleEnfant(enfant) : reduction.label
  return `${nom} · −${reduction.ratePct} %${reduction.requiresProof ? " · justificatif demandé" : ""}`
}

const ID_FORMULAIRE = "fiche-voyageur"

/**
 * La feuille d'ajout ou de modification. Montée à neuf à chaque ouverture
 * (clé), elle part toujours des valeurs enregistrées. Le bouton principal
 * tient dans le pied de la feuille, visible au-dessus du clavier.
 */
function FeuilleFiche({
  fiche,
  ouverte,
  onOuverte,
}: {
  fiche: Fiche | null
  ouverte: boolean
  onOuverte: (ouverte: boolean) => void
}) {
  const onFini = () => onOuverte(false)
  const ajouter = useMutation(api.functions.customers.addSavedPassenger)
  const modifier = useMutation(api.functions.customers.updateSavedPassenger)
  const retirer = useMutation(api.functions.customers.removeSavedPassenger)
  const { enfant, individuelles } = useReductions()
  const aujourdhui = useToday()

  const [prenom, setPrenom] = useState(fiche?.firstName ?? "")
  const [nom, setNom] = useState(fiche?.lastName ?? "")
  const [genre, setGenre] = useState<"F" | "M" | "">(fiche?.gender ?? "")
  const [tel, setTel] = useState(ecritureNationale(fiche?.phone))
  const [urgence, setUrgence] = useState(
    ecritureNationale(fiche?.emergencyPhone)
  )
  const [naissance, setNaissance] = useState(fiche?.birthDate ?? "")
  const [reduction, setReduction] = useState(fiche?.discountCode ?? "")
  const [erreurs, setErreurs] = useState<
    Partial<
      Record<"prenom" | "nom" | "genre" | "tel" | "urgence" | "envoi", string>
    >
  >({})
  const [envoi, setEnvoi] = useState(false)
  const [suppression, setSuppression] = useState(false)

  const proposees = [...(enfant ? [enfant] : []), ...individuelles]
  // Une réduction retirée de la grille reste lisible sur la fiche qui la porte.
  const inconnue =
    reduction && !proposees.some((r) => r.code === reduction) ? reduction : null

  async function enregistrer(event: FormEvent) {
    event.preventDefault()
    const lectureTel = tel.trim() ? lireTelephone(tel) : null
    const lectureUrgence = urgence.trim() ? lireTelephone(urgence) : null
    const trouvees = {
      prenom: prenom.trim() ? undefined : "Indiquez le prénom du voyageur.",
      nom: nom.trim() ? undefined : "Indiquez le nom du voyageur.",
      genre: genre
        ? undefined
        : "Choisissez le genre : il figure sur le billet.",
      tel:
        lectureTel && !lectureTel.ok
          ? erreurTelephone(lectureTel.raison)
          : undefined,
      urgence:
        lectureUrgence && !lectureUrgence.ok
          ? erreurTelephone(lectureUrgence.raison)
          : lectureUrgence?.ok &&
              lectureTel?.ok &&
              lectureUrgence.numero === lectureTel.numero
            ? "Le numéro d'urgence doit être celui d'un proche, pas celui du voyageur."
            : undefined,
    }
    setErreurs(trouvees)
    if (Object.values(trouvees).some(Boolean) || !genre || !reseauDisponible())
      return
    setEnvoi(true)
    const champs = {
      firstName: prenom.trim(),
      lastName: nom.trim(),
      gender: genre,
      phone: lectureTel?.ok ? lectureTel.numero : undefined,
      emergencyPhone: lectureUrgence?.ok ? lectureUrgence.numero : undefined,
      birthDate: naissance || undefined,
      discountCode: reduction || undefined,
    }
    try {
      if (fiche) await modifier({ passengerId: fiche._id, ...champs })
      else await ajouter(champs)
      toast(
        fiche
          ? "Fiche modifiée."
          : `${champs.firstName} ${champs.lastName} est enregistré${genre === "F" ? "e" : ""}.`
      )
      onFini()
    } catch {
      setErreurs({
        envoi:
          "La fiche n'a pas pu être enregistrée. Réessayez dans un instant.",
      })
    } finally {
      setEnvoi(false)
    }
  }

  async function supprimer() {
    if (!fiche || !reseauDisponible()) return
    setEnvoi(true)
    try {
      await retirer({ passengerId: fiche._id })
      toast("Fiche supprimée.")
      onFini()
    } catch {
      setErreurs({
        envoi: "La fiche n'a pas pu être supprimée. Réessayez dans un instant.",
      })
      setEnvoi(false)
    }
  }

  const pied =
    suppression && fiche ? (
      <div className="grid gap-2 md:flex md:justify-end">
        <Button
          variant="danger"
          loading={envoi}
          loadingLabel="Suppression…"
          onClick={() => void supprimer()}
          className="md:order-2"
        >
          Supprimer la fiche
        </Button>
        <Button
          variant="ghost"
          onClick={() => setSuppression(false)}
          disabled={envoi}
        >
          Annuler
        </Button>
      </div>
    ) : (
      <div className="grid gap-2 md:flex md:justify-end">
        <Button
          type="submit"
          form={ID_FORMULAIRE}
          loading={envoi}
          loadingLabel="Enregistrement…"
          className="md:order-2"
        >
          {fiche ? "Enregistrer" : "Ajouter ce voyageur"}
        </Button>
        {fiche && (
          <Button
            type="button"
            variant="danger"
            onClick={() => setSuppression(true)}
            disabled={envoi}
          >
            Supprimer la fiche
          </Button>
        )}
      </div>
    )

  return (
    <Feuille
      open={ouverte}
      onOpenChange={(valeur) => !envoi && onOuverte(valeur)}
      titre={
        fiche ? `${fiche.firstName} ${fiche.lastName}` : "Nouveau voyageur"
      }
      description={
        fiche
          ? "Fiche de voyageur enregistrée"
          : "Ces informations restent dans votre compte."
      }
      hauteur={suppression ? "auto" : "haute"}
      pied={pied}
    >
      {suppression && fiche ? (
        <div className="grid gap-4 pt-1">
          <p className="text-[15px] leading-normal">
            La fiche de <b>{`${fiche.firstName} ${fiche.lastName}`}</b> sera
            effacée de votre compte. Les billets déjà émis à son nom ne changent
            pas.
          </p>
          {erreurs.envoi && (
            <InlineMessage tone="danger" title={erreurs.envoi} />
          )}
        </div>
      ) : (
        <form
          id={ID_FORMULAIRE}
          onSubmit={enregistrer}
          noValidate
          className="grid grid-cols-[minmax(0,1fr)] gap-4 pt-1"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Prénom" error={erreurs.prenom} htmlFor="fiche-prenom">
              <Input
                autoComplete="off"
                value={prenom}
                onChange={(event) => setPrenom(event.target.value)}
              />
            </Field>
            <Field label="Nom" error={erreurs.nom} htmlFor="fiche-nom">
              <Input
                autoComplete="off"
                value={nom}
                onChange={(event) => setNom(event.target.value)}
              />
            </Field>
          </div>
          <fieldset className="grid gap-1">
            <legend
              className={
                erreurs.genre
                  ? "text-[13px] font-medium text-danger-ink"
                  : "text-[13px] font-medium"
              }
            >
              Genre
            </legend>
            <RadioGroup
              value={genre}
              onValueChange={(valeur) => setGenre(valeur as "F" | "M")}
              aria-label="Genre"
              aria-describedby={
                erreurs.genre ? "fiche-genre-erreur" : undefined
              }
              className="flex gap-8"
            >
              <Radio value="F" label={GENRES.F} />
              <Radio value="M" label={GENRES.M} />
            </RadioGroup>
            {erreurs.genre && (
              <span
                id="fiche-genre-erreur"
                className="text-[12px] font-medium text-danger-ink"
              >
                {erreurs.genre}
              </span>
            )}
          </fieldset>
          <Field
            label="Téléphone (facultatif)"
            hint={AIDE_TELEPHONE}
            error={erreurs.tel}
            htmlFor="fiche-telephone"
          >
            <ChampTelephone valeur={tel} onChange={setTel} autoComplete="off" />
          </Field>
          <Field
            label="Téléphone d'urgence (facultatif)"
            hint="Un proche joignable pendant le voyage."
            error={erreurs.urgence}
            htmlFor="fiche-urgence"
          >
            <ChampTelephone
              valeur={urgence}
              onChange={setUrgence}
              autoComplete="off"
            />
          </Field>
          <Field
            label="Date de naissance (facultative)"
            htmlFor="fiche-naissance"
          >
            <Input
              type="date"
              value={naissance}
              max={aujourdhui === null ? undefined : dateDeService(aujourdhui)}
              onChange={(event) => setNaissance(event.target.value)}
            />
          </Field>
          <Field
            label="Réduction habituelle"
            hint="Les réductions sur justificatif se contrôlent en gare."
            htmlFor="fiche-reduction"
          >
            <SelectNative
              value={reduction}
              onChange={(event) => setReduction(event.target.value)}
            >
              <option value="">Aucune, plein tarif</option>
              {proposees.map((r) => (
                <option key={r.code} value={r.code}>
                  {libelleReduction(r, enfant)}
                </option>
              ))}
              {inconnue && (
                <option value={inconnue}>
                  {inconnue} (n&apos;est plus proposée)
                </option>
              )}
            </SelectNative>
          </Field>
          {erreurs.envoi && (
            <InlineMessage tone="danger" title={erreurs.envoi} />
          )}
        </form>
      )}
    </Feuille>
  )
}

/**
 * Le voyageur « Moi » : le titulaire du compte, tiré du profil — il n'a pas
 * de fiche à créer. Il se modifie dans le profil.
 */
function LigneMoi({
  profil,
  fiches,
}: {
  profil: ProfilVoyageur
  fiches: Fiche[]
}) {
  const moi = voyageurMoi(profil.user, fiches)
  if (!moi) {
    return (
      <Section titre="Vous">
        <Ligne
          libelle="Ajoutez votre nom"
          detail="Il figure sur vos billets : vous serez le premier voyageur proposé."
          href="/compte/profil"
        />
      </Section>
    )
  }
  const nomComplet = `${moi.prenom} ${moi.nom}`.trim()
  return (
    <Section titre="Vous">
      <Ligne
        debut={<Avatar name={nomComplet} size="lg" />}
        libelle={
          <>
            {moi.nom.toUpperCase()} {moi.prenom}
          </>
        }
        detail={
          moi.sexe
            ? `${CIVILITES[moi.sexe]} · titulaire du compte, proposé en premier`
            : "Civilité à compléter dans le profil"
        }
        href="/compte/profil"
        aria-label={`Modifier votre profil, ${nomComplet}`}
      />
    </Section>
  )
}

function ListeFiches({ profil }: { profil: ProfilVoyageur }) {
  const fiches = useQuery(api.functions.customers.listSavedPassengers, {})
  const { reductions, enfant } = useReductions()
  const [ouverte, setOuverte] = useState(false)
  const [fiche, setFiche] = useState<Fiche | null>(null)
  const [ouvertures, setOuvertures] = useState(0)

  function ouvrir(choisie: Fiche | null) {
    setFiche(choisie)
    setOuvertures((n) => n + 1)
    setOuverte(true)
  }

  if (fiches === undefined) return <SkeletonLines />

  const detail = (f: Fiche) => {
    const r = f.discountCode
      ? reductions?.find((x) => x.code === f.discountCode)
      : undefined
    const nomReduction = f.discountCode
      ? r
        ? r === enfant
          ? libelleEnfant(enfant)
          : r.label
        : f.discountCode
      : null
    return (
      <>
        {[GENRES[f.gender], nomReduction].filter(Boolean).join(" · ")}
        {f.phone && (
          <>
            {" · "}
            <span className="tabular whitespace-nowrap">
              {ecritureNationale(f.phone)}
            </span>
          </>
        )}
      </>
    )
  }

  return (
    <>
      <LigneMoi profil={profil} fiches={fiches} />
      {fiches.length === 0 ? (
        <EmptyState
          title="Personne d'autre pour l'instant"
          description="Enregistrez une fois les personnes avec qui vous voyagez : nom, genre, contact et réduction habituelle restent dans votre compte."
          className="rounded-md border border-line bg-surface py-8"
        />
      ) : (
        <Section titre="Avec qui vous voyagez">
          {fiches.map((f) => (
            <Ligne
              key={f._id}
              debut={<Avatar name={`${f.firstName} ${f.lastName}`} size="lg" />}
              libelle={
                <>
                  {f.lastName.toUpperCase()} {f.firstName}
                </>
              }
              detail={
                estLeTitulaire(profil.user, f) ? (
                  <>
                    {detail(f)} · même nom que vous : cette fiche fait double
                    emploi
                  </>
                ) : (
                  detail(f)
                )
              }
              onClick={() => ouvrir(f)}
              aria-label={`Modifier la fiche de ${f.firstName} ${f.lastName}`}
            />
          ))}
        </Section>
      )}
      <Button
        size="lg"
        onClick={() => ouvrir(null)}
        className="w-full md:w-fit"
      >
        <PlusIcon aria-hidden />
        Ajouter un voyageur
      </Button>
      {fiches.length > 0 && (
        <p className="text-small text-ink-muted">
          Modifier une fiche ne change aucun billet déjà émis : chaque billet
          garde l&apos;identité du jour de l&apos;achat.
        </p>
      )}
      <FeuilleFiche
        key={ouvertures}
        fiche={fiche}
        ouverte={ouverte}
        onOuverte={setOuverte}
      />
    </>
  )
}

export function Voyageurs() {
  return (
    <>
      <EnTeteSousPage titre="Voyageurs enregistrés" />
      <Page>
        <ExigeConnexion
          invitation={{
            titre: "Connectez-vous pour enregistrer vos voyageurs",
            texte: "Les fiches de voyageurs sont rattachées à votre compte.",
          }}
        >
          {(profil) => <ListeFiches profil={profil} />}
        </ExigeConnexion>
      </Page>
    </>
  )
}
