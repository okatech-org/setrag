"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import { Camera, X } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { Field } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import { humanError } from "@/lib/errors"
import { hhmm } from "@/lib/format"
import { commitOperation, listIncidents, putPhoto } from "@/lib/offline/db"
import { clientId, localNumber, nowMs } from "@/lib/offline/ids"
import type { LocalIncident } from "@/lib/offline/types"
import { NetworkBadge, StatusTag } from "./network-badge"
import { useTerminal } from "./terminal-provider"

/**
 * Signalement d'incident — CM-09.
 *
 * La gravité n'est pas décorative : elle commande la priorité d'envoi. Un
 * incident critique part en tête de file, avant les contrôles et les ventes,
 * parce que son retard a une conséquence à bord — pas une conséquence
 * comptable.
 *
 * Les photos sont écrites localement puis téléversées à la reconnexion, avant
 * leur incident : un signalement doit arriver avec ses preuves.
 */

const CATEGORIES = [
  { value: "securite", label: "Sécurité" },
  { value: "technique", label: "Technique" },
  { value: "comportement", label: "Comportement" },
  { value: "medical", label: "Médical" },
  { value: "autre", label: "Autre" },
] as const

const SEVERITIES = [
  { value: "information", label: "Information" },
  { value: "important", label: "Important" },
  { value: "critique", label: "Critique" },
] as const

/**
 * Ce que la gravité change concrètement.
 *
 * Plutôt qu'un « la gravité détermine la priorité d'envoi » abstrait sous le
 * champ, on dit à l'agent l'effet du choix qu'il vient de faire — c'est la
 * seule chose qui l'intéresse au moment de trancher.
 */
const SEVERITY_EFFECT: Record<LocalIncident["severity"], string> = {
  information: "Part avec le reste de la file, sans priorité particulière.",
  important: "Part avant les contrôles et les ventes.",
  critique: "Part en tête de file, avant tout le reste.",
}

export function IncidentScreen() {
  const { manifest, settings, online, refresh, queue } = useTerminal()
  const fileInput = useRef<HTMLInputElement | null>(null)

  const [category, setCategory] =
    useState<LocalIncident["category"]>("technique")
  const [severity, setSeverity] =
    useState<LocalIncident["severity"]>("important")
  const [description, setDescription] = useState("")
  // Tant que l'agent n'a rien saisi, la localisation suit la voiture et
  // l'arrêt courants : c'est presque toujours la bonne réponse, et elle change
  // au fil de la tournée.
  const [locationDraft, setLocationDraft] = useState<string | null>(null)
  const [photos, setPhotos] = useState<Array<{ id: string; url: string; blob: Blob }>>([])
  const [saved, setSaved] = useState<LocalIncident | null>(null)
  const [history, setHistory] = useState<LocalIncident[]>([])
  const [pending, setPending] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const all = await listIncidents()
      if (!cancelled) setHistory(all)
    })()
    return () => {
      cancelled = true
    }
  }, [queue.total, saved])

  useEffect(() => {
    return () => {
      for (const photo of photos) URL.revokeObjectURL(photo.url)
    }
  }, [photos])

  const defaultLocation = useMemo(() => {
    const stop = manifest?.stops[settings.currentStopIndex]
    return `Voiture ${settings.coachLabel}${stop ? ` · après ${stop.name}` : ""}`
  }, [manifest, settings.coachLabel, settings.currentStopIndex])
  const location = locationDraft ?? defaultLocation

  function addPhotos(files: FileList | null) {
    if (!files) return
    const added = [...files].map((file) => ({
      id: clientId("photo"),
      url: URL.createObjectURL(file),
      blob: file,
    }))
    setPhotos((current) => [...current, ...added])
  }

  async function save() {
    if (!description.trim()) {
      toast.error("La description est obligatoire.")
      return
    }
    setPending(true)
    try {
      const incident: LocalIncident = {
        clientId: clientId("inc"),
        tripId: manifest?.tripId,
        category,
        severity,
        description: description.trim(),
        location: location.trim() || undefined,
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

      await commitOperation("incident", incident.clientId, incident, {
        // Un incident critique double tout le reste dans la file.
        priority: severity === "critique" ? 0 : undefined,
      })
      await refresh()
      setSaved(incident)
      setPhotos([])
      setDescription("")
    } catch (error) {
      toast.error(humanError(error))
    } finally {
      setPending(false)
    }
  }

  if (saved) {
    return (
      <main className="safe-top flex flex-1 flex-col gap-5 px-5 pt-5 pb-6">
        <header className="flex items-start justify-between gap-3">
          <h1 className="text-h3">Incidents</h1>
          <NetworkBadge />
        </header>

        <InlineMessage
          tone={saved.severity === "critique" ? "danger" : "info"}
          title={
            saved.severity === "critique"
              ? `Incident critique enregistré — n° ${saved.localNumber}`
              : `Signalement enregistré — n° ${saved.localNumber}`
          }
        >
          {online
            ? "Il part à la prochaine synchronisation."
            : "Enregistré hors couverture réseau. Il partira en tête de file dès le premier signal."}
        </InlineMessage>

        <div className="flex flex-wrap gap-2">
          <StatusTag tone={saved.severity === "critique" ? "danger" : "neutral"}>
            {saved.severity === "critique" ? "priorité haute" : "priorité normale"}
          </StatusTag>
          <StatusTag tone="warning">en attente d&apos;envoi</StatusTag>
        </div>

        <div className="mt-auto flex flex-col gap-3">
          <Button size="lg" block onClick={() => setSaved(null)}>
            Nouveau signalement
          </Button>
          <Button variant="secondary" size="lg" block asChild>
            <Link href="/scan">Retour au contrôle</Link>
          </Button>
        </div>
      </main>
    )
  }

  return (
    <main className="safe-top flex flex-1 flex-col gap-5 px-5 pt-5 pb-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-h3">Incidents</h1>
          <p className="text-[13px] text-ink-muted">
            {manifest ? manifest.trainNumber : "Hors desserte"} ·{" "}
            <span className="tabular">{history.length}</span> signalés
          </p>
        </div>
        <NetworkBadge />
      </header>

      {/* Catégorie et gravité sont des choix exclusifs à cinq et trois
          options : une liste déroulante les présente sans déborder de
          l'écran ni occuper la moitié de la page. Les commandes du contrôle
          — celles qu'on touche en marchant — restent des boutons. */}
      <Field label="Catégorie" htmlFor="incident-categorie">
        <select
          id="incident-categorie"
          value={category}
          onChange={(event) =>
            setCategory(event.target.value as LocalIncident["category"])
          }
          className="h-13 w-full rounded-md border border-line-strong bg-surface px-4 text-[16px] outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {CATEGORIES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="Gravité"
        htmlFor="incident-gravite"
        hint={SEVERITY_EFFECT[severity]}
      >
        <select
          id="incident-gravite"
          value={severity}
          onChange={(event) =>
            setSeverity(event.target.value as LocalIncident["severity"])
          }
          className="h-13 w-full rounded-md border border-line-strong bg-surface px-4 text-[16px] outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {SEVERITIES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Localisation">
        <input
          value={location}
          onChange={(event) => setLocationDraft(event.target.value)}
          className="h-13 w-full rounded-md border border-line-strong bg-surface px-4 text-[16px] outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
      </Field>

      <Field label="Description">
        <textarea
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Porte de la voiture 3 bloquée en position ouverte depuis Booué. Voyageurs écartés de la zone."
          className="w-full rounded-md border border-line-strong bg-surface p-3 text-[16px] outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
      </Field>

      <div>
        <p className="text-[13px] font-medium">
          Photos — stockées localement, envoyées à la reconnexion
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {photos.map((photo) => (
            <span key={photo.id} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.url}
                alt="Photo jointe au signalement"
                className="size-16 rounded-md border border-line object-cover"
              />
              <button
                type="button"
                aria-label="Retirer la photo"
                onClick={() =>
                  setPhotos((current) =>
                    current.filter((p) => p.id !== photo.id)
                  )
                }
                className="absolute -top-2 -right-2 grid size-6 place-items-center rounded-pill bg-ink text-ink-inverse"
              >
                <X aria-hidden className="size-3.5" />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="grid size-16 place-items-center rounded-md border border-dashed border-line-strong bg-surface"
            aria-label="Ajouter une photo"
          >
            <Camera aria-hidden className="size-5 text-ink-muted" />
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={(event) => {
              addPhotos(event.target.files)
              event.target.value = ""
            }}
          />
        </div>
      </div>

      {severity === "critique" && (
        <InlineMessage tone="danger" title="Incident critique.">
          Il passera en tête de file, avant les contrôles et les ventes. Pour
          une urgence immédiate, prévenez le chef de train par radio : ce
          signalement n&apos;est pas une alerte temps réel.
        </InlineMessage>
      )}

      <Button
        size="lg"
        block
        loading={pending}
        disabled={!description.trim()}
        onClick={() => void save()}
      >
        Enregistrer le signalement
      </Button>

      {history.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-[13px] font-semibold tracking-wide text-ink-muted uppercase">
            Signalements de ce terminal
          </h2>
          <ul className="overflow-hidden rounded-md border border-line">
            {history.slice(0, 6).map((incident) => (
              <li
                key={incident.clientId}
                className="flex items-center gap-3 border-b border-line bg-surface px-4 py-3 last:border-b-0"
              >
                <span className="w-12 text-[13px] text-ink-muted tabular">
                  {hhmm(incident.reportedAt)}
                </span>
                <span className="flex-1 text-[15px]">
                  {incident.localNumber} · {incident.description.slice(0, 40)}
                  {incident.description.length > 40 ? "…" : ""}
                </span>
                <StatusTag
                  tone={
                    incident.state === "sent"
                      ? "success"
                      : incident.state === "failed"
                        ? "danger"
                        : "warning"
                  }
                >
                  {incident.state === "sent"
                    ? "envoyé"
                    : incident.state === "failed"
                      ? "échec"
                      : "en attente"}
                </StatusTag>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}
