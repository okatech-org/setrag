"use client"

import {
  CameraIcon,
  EllipsisIcon,
  GaugeIcon,
  HeartPulseIcon,
  MapPinIcon,
  ShieldAlertIcon,
  UserXIcon,
  WrenchIcon,
  XIcon,
} from "lucide-react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { Field, Input, Textarea } from "@workspace/ui/components/field"
import { Tag } from "@workspace/ui/components/tag"

import { TERRAIN } from "@/composants/boutons"
import { PastilleEnvoi } from "@/composants/etat-envoi"
import { Cases } from "@/composants/cases"
import { Journal, LigneJournal } from "@/composants/journal"
import { Message } from "@/composants/message"
import { Bas, BarreApp, Corps, Note, TitreSection } from "@/coquille/ecran"
import { humanError } from "@/lib/errors"
import { heure } from "@/lib/format"
import { commitOperation, listIncidents, putPhoto } from "@/lib/offline/db"
import { clientId, localNumber, nowMs } from "@/lib/offline/ids"
import type { LocalIncident } from "@/lib/offline/types"
import { arretDeRang } from "@/lib/position"
import { nomDuTrain, numeroVoiture } from "@/lib/train"

import { useTerminal } from "../terminal/contexte-terminal"

/**
 * Signaler un incident — catégorie, gravité, lieu, description, photos.
 *
 * La gravité règle la place dans la file d'envoi, et l'écran le dit : un
 * incident critique part en tête, avant tout le reste ; un incident
 * important, avant les ventes et les contrôles ; une information, avec le
 * reste. Un signalement n'est pas une alerte en temps réel : pour une
 * urgence, la radio du chef de train.
 *
 * Les photos sont écrites sur le terminal, puis envoyées avant leur incident
 * au retour du réseau : un signalement doit arriver avec ses preuves.
 */

type Categorie = LocalIncident["category"]
type Gravite = LocalIncident["severity"]

const CATEGORIES = [
  { valeur: "securite", libelle: "Sécurité", icone: ShieldAlertIcon },
  { valeur: "technique", libelle: "Technique", icone: WrenchIcon },
  { valeur: "comportement", libelle: "Comportement", icone: UserXIcon },
  { valeur: "medical", libelle: "Médical", icone: HeartPulseIcon },
  { valeur: "autre", libelle: "Autre", icone: EllipsisIcon },
] as const satisfies ReadonlyArray<{ valeur: Categorie; libelle: string; icone: unknown }>

const LIBELLE_CATEGORIE: Record<Categorie, string> = {
  securite: "Sécurité",
  technique: "Technique",
  comportement: "Comportement",
  medical: "Médical",
  autre: "Autre",
}

const LIBELLE_GRAVITE: Record<Gravite, string> = {
  information: "Information",
  important: "Important",
  critique: "Critique",
}

/** Ce que la gravité change concrètement : la place dans la file d'envoi. */
const EFFET_GRAVITE: Record<Gravite, string> = {
  information: "Part avec le reste de la file, après les contrôles.",
  important: "Part avant les ventes et les contrôles.",
  critique: "Part en tête de file, avant tout le reste.",
}

const PRIORITE: Record<Gravite, string> = {
  information: "priorité basse",
  important: "priorité normale",
  critique: "priorité haute",
}

/** Ce que l'agent lit une fois le signalement enregistré, selon réseau et gravité. */
function annonce(incident: LocalIncident, online: boolean): string {
  if (online) return "Il part à la prochaine synchronisation, dans quelques secondes."
  const horsReseau = "Enregistré hors couverture réseau."
  if (incident.severity === "critique") return `${horsReseau} Il partira en tête de file dès le premier signal.`
  if (incident.severity === "important") {
    return `${horsReseau} Il partira dès le premier signal, avant les ventes et les contrôles.`
  }
  return `${horsReseau} Il partira avec le reste de la file au retour du signal.`
}

function categorieDe(valeur: string | null): Categorie {
  return CATEGORIES.some((c) => c.valeur === valeur) ? (valeur as Categorie) : "technique"
}

export function Incident() {
  const parametres = useSearchParams()
  const { manifest, settings, online, refresh, queue } = useTerminal()
  const entreePhoto = useRef<HTMLInputElement | null>(null)

  const [categorie, setCategorie] = useState<Categorie>(categorieDe(parametres.get("categorie")))
  const [gravite, setGravite] = useState<Gravite>("important")
  const [description, setDescription] = useState(parametres.get("description") ?? "")
  // Tant que l'agent n'a rien saisi, le lieu suit la voiture et la dernière
  // gare atteinte : c'est presque toujours la bonne réponse.
  const [lieuSaisi, setLieuSaisi] = useState<string | null>(null)
  const [modifierLieu, setModifierLieu] = useState(false)
  const [photos, setPhotos] = useState<Array<{ id: string; url: string; blob: Blob }>>([])
  const [enregistre, setEnregistre] = useState<LocalIncident | null>(null)
  const [historique, setHistorique] = useState<LocalIncident[]>([])
  const [enCours, setEnCours] = useState(false)

  useEffect(() => {
    let annule = false
    void listIncidents().then((tous) => {
      if (!annule) setHistorique(tous)
    })
    return () => {
      annule = true
    }
  }, [queue.total, enregistre])

  useEffect(() => {
    return () => {
      for (const photo of photos) URL.revokeObjectURL(photo.url)
    }
  }, [photos])

  const lieuParDefaut = useMemo(() => {
    const gare = manifest ? arretDeRang(manifest, settings.currentStopIndex) : undefined
    return `Voiture ${numeroVoiture(settings.coachLabel)}${gare ? ` · après ${gare.name}` : ""}`
  }, [manifest, settings.coachLabel, settings.currentStopIndex])
  const lieu = lieuSaisi ?? lieuParDefaut

  function ajouterPhotos(fichiers: FileList | null) {
    if (!fichiers) return
    const ajout = [...fichiers].map((fichier) => ({
      id: clientId("photo"),
      url: URL.createObjectURL(fichier),
      blob: fichier,
    }))
    setPhotos((courantes) => [...courantes, ...ajout])
  }

  async function enregistrer() {
    if (!description.trim()) {
      toast.error("La description est obligatoire.")
      return
    }
    setEnCours(true)
    try {
      const incident: LocalIncident = {
        clientId: clientId("inc"),
        tripId: manifest?.tripId,
        category: categorie,
        severity: gravite,
        description: description.trim(),
        location: lieu.trim() || undefined,
        photoIds: photos.map((p) => p.id),
        reportedAt: nowMs(),
        offline: !online,
        localNumber: localNumber("INC", 3),
        state: "pending",
      }
      // Les photos d'abord : un incident dont les images manqueraient serait
      // envoyé amputé de sa preuve.
      for (const photo of photos) {
        await putPhoto({
          id: photo.id,
          incidentClientId: incident.clientId,
          blob: photo.blob,
          capturedAt: nowMs(),
        })
      }
      // L'incident et sa mise en file, dans une seule transaction ; sa place
      // dans la file suit sa gravité.
      await commitOperation("incident", incident.clientId, incident)
      await refresh()
      setEnregistre(incident)
      setPhotos([])
      setDescription("")
      setLieuSaisi(null)
    } catch (error) {
      toast.error(humanError(error))
    } finally {
      setEnCours(false)
    }
  }

  const barre = (
    <BarreApp
      grandTitre="Incident"
      actions={
        manifest && (
          <span className="px-2 font-mono text-[14px] font-semibold text-ink-muted">{nomDuTrain(manifest)}</span>
        )
      }
    />
  )

  const journal = historique.length > 0 && (
    <>
      <TitreSection className="mt-1">Signalements de ce terminal</TitreSection>
      <Journal>
        {historique.slice(0, 8).map((incident) => (
          <LigneJournal
            key={incident.clientId}
            heure={heure(incident.reportedAt)}
            qui={`${incident.localNumber} · ${incident.description}`}
            reference={`${LIBELLE_CATEGORIE[incident.category]} · ${LIBELLE_GRAVITE[incident.severity]}`}
            etat={<PastilleEnvoi etat={incident.state} />}
          />
        ))}
      </Journal>
    </>
  )

  if (enregistre) {
    return (
      <>
        {barre}
        <Corps>
          <Message ton="info" titre={`Signalement enregistré — n° ${enregistre.localNumber}`}>
            {annonce(enregistre, online)}
          </Message>
          <div className="flex flex-wrap gap-1.5">
            <Tag tone={enregistre.severity === "critique" ? "danger" : "neutral"} className="h-[30px] text-[13px]">
              <GaugeIcon aria-hidden />
              {PRIORITE[enregistre.severity]}
            </Tag>
            <PastilleEnvoi
              etat={historique.find((i) => i.clientId === enregistre.clientId)?.state ?? enregistre.state}
              className="h-[30px] text-[13px]"
            />
          </div>
          {journal}
          <Message ton="danger" titre={enregistre.severity === "critique" ? "Incident critique" : "En « Critique »"}>
            {enregistre.severity === "critique"
              ? "Il passe en tête de file, avant les contrôles et les ventes."
              : "Il passerait en tête de file, avant les contrôles et les ventes."}{" "}
            Pour une urgence immédiate, prévenez le chef de train par radio : ce
            signalement n&apos;est pas une alerte temps réel.
          </Message>
        </Corps>
        <Bas avecOnglets>
          <Button size="lg" block className={TERRAIN} asChild>
            <Link href="/scan">Retour au contrôle</Link>
          </Button>
          <Button variant="ghost" block onClick={() => setEnregistre(null)}>
            Nouveau signalement
          </Button>
        </Bas>
      </>
    )
  }

  return (
    <>
      {barre}
      <Corps serre>
        <div className="grid gap-1">
          <p className="text-[13px] font-medium">Catégorie</p>
          <Cases
            label="Catégorie"
            variante="puces"
            colonnes={3}
            options={CATEGORIES.map((c) => ({ valeur: c.valeur, libelle: c.libelle, icone: c.icone }))}
            valeur={categorie}
            onChange={setCategorie}
          />
        </div>
        <div className="grid gap-1">
          <p className="text-[13px] font-medium">Gravité</p>
          <Cases
            label="Gravité"
            serre
            options={(["information", "important", "critique"] as const).map((g) => ({
              valeur: g,
              libelle: LIBELLE_GRAVITE[g],
            }))}
            valeur={gravite}
            onChange={setGravite}
          />
          <Note>{EFFET_GRAVITE[gravite]}</Note>
        </div>

        {gravite === "critique" && (
          <Message ton="danger" titre="Incident critique.">
            Il passera en tête de file, avant les contrôles et les ventes. Pour
            une urgence immédiate, prévenez le chef de train par radio : ce
            signalement n&apos;est pas une alerte temps réel.
          </Message>
        )}

        {modifierLieu ? (
          <Field label="Lieu" htmlFor="incident-lieu">
            <Input autoFocus value={lieu} onChange={(event) => setLieuSaisi(event.target.value)} />
          </Field>
        ) : (
          <div className="flex min-h-12 items-center gap-2 rounded-md border border-line bg-surface pr-1 pl-3.5 text-[14px] font-semibold">
            <MapPinIcon aria-hidden className="size-[18px] shrink-0 text-ink-muted" />
            <span className="min-w-0 truncate">
              {lieu} <small className="font-medium text-ink-muted">· lieu</small>
            </span>
            <button
              type="button"
              onClick={() => setModifierLieu(true)}
              className="ml-auto inline-flex min-h-11 items-center rounded-pill px-3 text-[14px] font-semibold text-accent-ink active:bg-surface-sunk"
            >
              Modifier
            </button>
          </div>
        )}

        <Field label="Description" htmlFor="incident-description">
          <Textarea
            rows={3}
            className="min-h-0 text-[14.5px]"
            value={description}
            placeholder="Ce qui se passe, où, depuis quand, ce qui a été fait."
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>

        <div className="flex items-center gap-2">
          {photos.map((photo) => (
            <span key={photo.id} className="relative shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.url} alt="Photo jointe au signalement" className="size-14 rounded-md border border-line object-cover" />
              <button
                type="button"
                aria-label="Retirer la photo"
                onClick={() => setPhotos((courantes) => courantes.filter((p) => p.id !== photo.id))}
                className="absolute -top-2.5 -right-2.5 grid size-11 place-items-center"
              >
                <span className="grid size-6 place-items-center rounded-pill bg-ink text-ink-inverse">
                  <XIcon aria-hidden className="size-3.5" />
                </span>
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={() => entreePhoto.current?.click()}
            aria-label="Ajouter une photo"
            className="grid size-14 shrink-0 place-items-center rounded-md border-[1.5px] border-dashed border-line-strong text-accent-ink"
          >
            <CameraIcon aria-hidden className="size-5" />
          </button>
          <input
            ref={entreePhoto}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={(event) => {
              ajouterPhotos(event.target.files)
              event.target.value = ""
            }}
          />
          <Note className="flex-1">Photos stockées localement, envoyées à la reconnexion.</Note>
        </div>

        {journal}
      </Corps>
      <Bas avecOnglets>
        <Button
          size="lg"
          block
          className={TERRAIN}
          loading={enCours}
          loadingLabel="Enregistrement…"
          disabled={!description.trim()}
          onClick={() => void enregistrer()}
        >
          Enregistrer le signalement
        </Button>
      </Bas>
    </>
  )
}

