"use client"

import { DownloadIcon, Trash2Icon } from "lucide-react"
import { useState, type FormEvent } from "react"
import { toast } from "sonner"

import { useConvex, useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { SkeletonLines } from "@workspace/ui/components/empty-state"
import { Feuille } from "@workspace/ui/components/feuille"
import { Field, Input } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { Tag } from "@workspace/ui/components/tag"

import { useNaviguer } from "@/coquille/filet-navigation"
import { useDonneesLocales } from "@/fonctionnalites/hors-ligne/donnees-locales"
import { useToday } from "@/hooks/use-today"
import {
  CONSENTEMENTS,
  LIBELLES_CONSENTEMENT,
  type ConsentementRevocable,
} from "@/lib/consentements"
import { FUSEAU, dateDeService } from "@/lib/format"
import { seDeconnecter } from "@/lib/offline/deconnexion"
import { reseauDisponible } from "@/lib/reseau"

import {
  Carte,
  EnTeteSousPage,
  EtiquetteListe,
  ExigeConnexion,
  Ligne,
  LigneInterrupteur,
  Page,
  Section,
  messageServeur,
} from "./elements"

const date = new Intl.DateTimeFormat("fr-FR", {
  timeZone: FUSEAU,
  day: "numeric",
  month: "long",
  year: "numeric",
})

/** Le mot à saisir, exigé tel quel par le serveur. */
const MOT_DE_CONFIRMATION = "SUPPRIMER"

function Consentements() {
  const accords = useQuery(api.functions.customers.listConsents, {})
  const accorder = useMutation(api.functions.customers.grantConsent)
  const retirer = useMutation(api.functions.customers.revokeConsent)
  // Valeur affichée pendant l'enregistrement : la mutation Convex ne se
  // résout qu'une fois la liste des accords à jour.
  const [enAttente, setEnAttente] = useState<
    Partial<Record<ConsentementRevocable, boolean>>
  >({})

  if (accords === undefined) return <SkeletonLines />

  const actif = (type: "cgv" | ConsentementRevocable) =>
    accords
      .filter((a) => a.type === type && a.revokedAt === undefined)
      .sort((a, b) => b.grantedAt - a.grantedAt)[0]

  async function basculer(type: ConsentementRevocable, valeur: boolean) {
    if (!reseauDisponible()) return
    setEnAttente((e) => ({ ...e, [type]: valeur }))
    try {
      if (valeur)
        await accorder({
          type,
          version: CONSENTEMENTS[type].version,
          channel: "web",
        })
      else await retirer({ type })
      toast(
        valeur
          ? "Accord enregistré."
          : "Accord retiré : c'est effectif dès maintenant."
      )
    } catch {
      toast.error(
        "Votre choix n'a pas pu être enregistré. Réessayez dans un instant."
      )
    } finally {
      setEnAttente((e) => ({ ...e, [type]: undefined }))
    }
  }

  const cgv = actif("cgv")
  const historique = [...accords].sort((a, b) => b.grantedAt - a.grantedAt)

  return (
    <>
      <Section titre="Consentements">
        <Ligne
          libelle="Conditions générales de vente"
          detail={
            cgv ? (
              <>
                Version <span className="tabular">{cgv.version}</span>, acceptée
                le <span className="tabular">{date.format(cgv.grantedAt)}</span>
                . Requises pour voyager : elles ne se retirent pas.
              </>
            ) : (
              "Acceptées à chaque achat : la version acceptée est enregistrée avec la réservation. Requises pour voyager, elles ne se retirent pas."
            )
          }
          fin={<Tag tone="neutral">Requises</Tag>}
        />
        {(["donnees", "marketing"] as const).map((type) => {
          const accord = actif(type)
          const coche = enAttente[type] ?? Boolean(accord)
          return (
            <LigneInterrupteur
              key={type}
              libelle={CONSENTEMENTS[type].libelle}
              checked={coche}
              disabled={enAttente[type] !== undefined}
              onCheckedChange={(valeur) => void basculer(type, valeur)}
              detail={
                <>
                  {CONSENTEMENTS[type].texte}{" "}
                  {accord ? (
                    <>
                      Accordé le{" "}
                      <span className="tabular">
                        {date.format(accord.grantedAt)}
                      </span>
                      , version{" "}
                      <span className="tabular">{accord.version}</span>.
                    </>
                  ) : (
                    "Non accordé."
                  )}
                </>
              }
            />
          )
        })}
      </Section>

      {historique.length > 0 && (
        <section aria-labelledby="historique-accords" className="grid gap-2">
          <EtiquetteListe id="historique-accords">
            Historique des accords
          </EtiquetteListe>
          <ol className="rounded-md border border-line bg-surface">
            {historique.map((a) => (
              <li
                key={a._id}
                className="grid gap-0.5 border-t border-line px-4 py-3 first:border-t-0"
              >
                <span className="flex flex-wrap items-center justify-between gap-2 text-[15px] font-medium">
                  {LIBELLES_CONSENTEMENT[a.type]}
                  <Tag tone={a.revokedAt === undefined ? "success" : "neutral"}>
                    {a.revokedAt === undefined ? "En vigueur" : "Retiré"}
                  </Tag>
                </span>
                <span className="text-[12.5px] text-ink-muted">
                  Version <span className="tabular">{a.version}</span> · accordé
                  le <span className="tabular">{date.format(a.grantedAt)}</span>
                  {a.revokedAt !== undefined && (
                    <>
                      {" "}
                      · retiré le{" "}
                      <span className="tabular">
                        {date.format(a.revokedAt)}
                      </span>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  )
}

function Export() {
  const convex = useConvex()
  const [enCours, setEnCours] = useState(false)

  async function telecharger() {
    if (
      !reseauDisponible(
        "Hors réseau : l'export se prépare sur le serveur. Réessayez une fois le réseau revenu."
      )
    )
      return
    setEnCours(true)
    try {
      const donnees = await convex.query(
        api.functions.customers.exportMyData,
        {}
      )
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(donnees, null, 2)], {
          type: "application/json",
        })
      )
      const lien = document.createElement("a")
      lien.href = url
      lien.download = `setrag-mes-donnees-${dateDeService(Date.parse(donnees.exportedAt))}.json`
      lien.click()
      URL.revokeObjectURL(url)
      toast("Vos données sont téléchargées.")
    } catch {
      toast.error(
        "L'export n'a pas abouti. Il demande du réseau ; réessayez dans un instant."
      )
    } finally {
      setEnCours(false)
    }
  }

  return (
    <section aria-labelledby="export-donnees" className="grid gap-2">
      <EtiquetteListe id="export-donnees">Mes données</EtiquetteListe>
      <Carte>
        <p className="text-[15px] leading-normal">
          Un fichier JSON, lisible dans un éditeur de texte : votre profil, vos
          réservations, vos billets, vos accords, vos voyageurs enregistrés et
          le nombre de vos notifications.
        </p>
        <Button
          variant="secondary"
          loading={enCours}
          loadingLabel="Préparation…"
          onClick={() => void telecharger()}
          className="w-full md:w-fit"
        >
          <DownloadIcon aria-hidden />
          Télécharger mes données
        </Button>
      </Carte>
    </section>
  )
}

function Suppression() {
  const naviguer = useNaviguer()
  const supprimerCompte = useMutation(api.functions.customers.deleteMyAccount)
  const { dossiers } = useDonneesLocales()
  const maintenant = useToday()
  const [ouverte, setOuverte] = useState(false)
  const [saisie, setSaisie] = useState("")
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)

  const aVenir =
    maintenant === null
      ? 0
      : dossiers.filter(
          (d) =>
            d.sale.status === "confirmee" &&
            d.trip &&
            d.trip.arrivalAt > maintenant
        ).length
  const confirme = saisie.trim().toUpperCase() === MOT_DE_CONFIRMATION

  async function supprimer(event: FormEvent) {
    event.preventDefault()
    if (
      !confirme ||
      !reseauDisponible(
        "Hors réseau : la suppression du compte demande du réseau. Rien n'a changé."
      )
    )
      return
    setEnCours(true)
    setErreur(null)
    try {
      await supprimerCompte({ confirmation: MOT_DE_CONFIRMATION })
    } catch (cause) {
      // Le serveur explique son refus (réservation en attente de paiement…).
      setErreur(
        messageServeur(
          cause,
          "La suppression n'a pas abouti. Réessayez dans un instant."
        )
      )
      setEnCours(false)
      return
    }
    // Le compte est supprimé : une déconnexion qui échoue ensuite ne doit pas
    // faire croire le contraire. La session restante tombe sur « Ce compte a
    // été supprimé », qui propose de la fermer.
    await seDeconnecter().catch(() => {})
    setOuverte(false)
    naviguer("/", { remplacer: true })
    toast("Votre compte est supprimé.")
  }

  return (
    <section aria-labelledby="suppression-compte" className="grid gap-2">
      <EtiquetteListe id="suppression-compte">
        Supprimer mon compte
      </EtiquetteListe>
      <Carte>
        <p className="text-[15px] leading-normal">
          Votre nom, votre téléphone et votre e-mail sont effacés du compte, vos
          voyageurs enregistrés supprimés et vos accords retirés. Les ventes et
          les billets déjà émis sont conservés : la loi impose de garder les
          pièces comptables.
        </p>
        <Button
          variant="danger"
          onClick={() => setOuverte(true)}
          className="w-full md:w-fit"
        >
          <Trash2Icon aria-hidden />
          Supprimer mon compte
        </Button>
      </Carte>
      <Feuille
        open={ouverte}
        onOpenChange={(valeur) => {
          if (enCours) return
          setOuverte(valeur)
          setSaisie("")
          setErreur(null)
        }}
        titre="Supprimer mon compte ?"
        description="Cette action est définitive."
      >
        <form onSubmit={supprimer} noValidate className="grid gap-4 pt-1">
          <ul className="grid list-disc gap-1.5 pl-5 text-[15px] leading-normal">
            <li>Le profil est anonymisé, sans retour possible.</li>
            <li>
              Les ventes et les billets émis restent dans la comptabilité de
              SETRAG, comme la loi l&apos;impose.
            </li>
            <li>Les billets enregistrés sur cet appareil sont effacés.</li>
            <li>
              Une réservation en attente de paiement empêche la suppression :
              réglez-la ou annulez-la d&apos;abord.
            </li>
          </ul>
          {aVenir > 0 && (
            <InlineMessage
              tone="warning"
              title={
                aVenir > 1
                  ? `Vous avez ${aVenir} voyages à venir.`
                  : "Vous avez un voyage à venir."
              }
            >
              Les billets restent valables, mais ils quittent cet appareil :
              téléchargez-en d&apos;abord le PDF depuis Billets.
            </InlineMessage>
          )}
          <Field
            label={`Pour confirmer, saisissez ${MOT_DE_CONFIRMATION}`}
            htmlFor="suppression-confirmation"
          >
            <Input
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              value={saisie}
              onChange={(event) => setSaisie(event.target.value)}
            />
          </Field>
          {erreur && (
            <InlineMessage tone="danger" title="La suppression est refusée.">
              {erreur}
            </InlineMessage>
          )}
          <div className="grid gap-2 md:flex md:justify-end">
            <Button
              type="submit"
              variant="danger"
              disabled={!confirme}
              loading={enCours}
              loadingLabel="Suppression…"
              className="md:order-2"
            >
              Supprimer définitivement
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={enCours}
              onClick={() => setOuverte(false)}
            >
              Annuler
            </Button>
          </div>
        </form>
      </Feuille>
    </section>
  )
}

export function Donnees() {
  return (
    <>
      <EnTeteSousPage titre="Mes données et consentements" />
      <Page>
        <ExigeConnexion
          invitation={{
            titre: "Connectez-vous pour gérer vos données",
            texte:
              "Vos accords, l'export et la suppression concernent votre compte.",
          }}
        >
          {() => (
            <>
              <Consentements />
              <Export />
              <Suppression />
            </>
          )}
        </ExigeConnexion>
      </Page>
    </>
  )
}
