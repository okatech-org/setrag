"use client"

import { ImagePlus, X } from "lucide-react"
import { useEffect, useId, useMemo, useRef, useState } from "react"

import { useMutation } from "@workspace/api/hooks"
import { Button } from "@workspace/ui/components/button"

import { infraApi } from "../commun"
import type { IdStockage } from "../accueil/partage"

/**
 * Photos d'une anomalie : choix, contrôle (images, 8 Mo au plus), aperçu,
 * puis téléversement réel vers le stockage Convex. Chaque fichier reçoit une
 * adresse d'envoi à usage unique ; le serveur renvoie son `storageId`.
 */

export const TAILLE_MAX_PHOTO = 8 * 1024 * 1024
export const MAX_PHOTOS = 10

const fmtMo = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 })
export const tailleLisible = (octets: number) => (octets >= 1024 * 1024 ? `${fmtMo.format(octets / 1024 / 1024)} Mo` : `${Math.max(1, Math.round(octets / 1024))} Ko`)

/** Tri des fichiers choisis : ceux qu'on garde, et la raison de chaque refus. */
export function verifierPhotos(fichiers: readonly File[], place: number): { retenus: File[]; refus: string[] } {
  const retenus: File[] = []
  const refus: string[] = []
  for (const fichier of fichiers) {
    if (!fichier.type.startsWith("image/")) {
      refus.push(`« ${fichier.name} » n'est pas une image.`)
    } else if (fichier.size > TAILLE_MAX_PHOTO) {
      refus.push(`« ${fichier.name} » pèse ${tailleLisible(fichier.size)} : 8 Mo au plus.`)
    } else if (retenus.length >= place) {
      refus.push(`« ${fichier.name} » écartée : ${MAX_PHOTOS} photos au plus par anomalie.`)
    } else {
      retenus.push(fichier)
    }
  }
  return { retenus, refus }
}

/** Envoie un fichier vers une adresse de téléversement Convex. */
export async function televerserFichier(url: string, fichier: File): Promise<IdStockage> {
  let reponse: Response
  try {
    reponse = await fetch(url, { method: "POST", headers: { "Content-Type": fichier.type }, body: fichier })
  } catch {
    throw new Error(`Téléversement de « ${fichier.name} » impossible : vérifiez la connexion.`)
  }
  if (!reponse.ok) throw new Error(`Téléversement de « ${fichier.name} » refusé par le stockage (${reponse.status}).`)
  const corps = (await reponse.json()) as { storageId?: string }
  if (!corps.storageId) throw new Error(`Le stockage n'a pas confirmé « ${fichier.name} ».`)
  return corps.storageId as IdStockage
}

/** Téléverse une liste de photos, une à une, et suit l'avancement. */
export function useTeleversement() {
  const genererUrl = useMutation(infraApi.mutations.genererUrlTeleversement)
  const [progression, setProgression] = useState<{ fait: number; total: number } | null>(null)
  const televerser = async (fichiers: readonly File[]): Promise<IdStockage[]> => {
    const ids: IdStockage[] = []
    setProgression({ fait: 0, total: fichiers.length })
    try {
      for (const fichier of fichiers) {
        const url = await genererUrl({})
        ids.push(await televerserFichier(url, fichier))
        setProgression({ fait: ids.length, total: fichiers.length })
      }
      return ids
    } finally {
      setProgression(null)
    }
  }
  return { televerser, progression }
}

/** Sélecteur de photos avec aperçu et retrait. */
export function ChoixPhotos({
  fichiers,
  onChange,
  dejaPresentes = 0,
  desactive,
}: {
  fichiers: readonly File[]
  onChange: (fichiers: File[]) => void
  /** Photos déjà jointes au dossier (limite de 10 au total). */
  dejaPresentes?: number
  desactive?: boolean
}) {
  const id = useId()
  const entree = useRef<HTMLInputElement>(null)
  const [refus, setRefus] = useState<string[]>([])
  const apercus = useMemo(() => fichiers.map((fichier) => ({ fichier, url: typeof URL.createObjectURL === "function" ? URL.createObjectURL(fichier) : "" })), [fichiers])
  useEffect(
    () => () => {
      for (const apercu of apercus) if (apercu.url) URL.revokeObjectURL(apercu.url)
    },
    [apercus]
  )
  const place = Math.max(0, MAX_PHOTOS - dejaPresentes - fichiers.length)

  return (
    <div className="grid gap-2">
      <span className="text-[13px] font-medium" id={`${id}-libelle`}>
        Photos (facultatif)
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={entree}
          id={id}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          aria-labelledby={`${id}-libelle`}
          aria-describedby={`${id}-aide`}
          disabled={desactive || place === 0}
          onChange={(event) => {
            const choisis = Array.from(event.target.files ?? [])
            const { retenus, refus: refuses } = verifierPhotos(choisis, place)
            setRefus(refuses)
            if (retenus.length > 0) onChange([...fichiers, ...retenus])
            event.target.value = ""
          }}
        />
        <Button type="button" variant="secondary" size="sm" disabled={desactive || place === 0} onClick={() => entree.current?.click()}>
          <ImagePlus />
          Ajouter des photos
        </Button>
        <small id={`${id}-aide`} className="text-[12px] text-ink-muted">
          Images seulement, 8 Mo au plus chacune · encore {place} possible{place > 1 ? "s" : ""}.
        </small>
      </div>
      {refus.length > 0 ? (
        <ul role="alert" className="grid gap-0.5 text-[12.5px] font-medium text-danger-ink">
          {refus.map((motif) => (
            <li key={motif}>{motif}</li>
          ))}
        </ul>
      ) : null}
      {apercus.length > 0 ? (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Photos choisies">
          {apercus.map(({ fichier, url }, index) => (
            <li key={`${fichier.name}-${index}`} className="grid gap-1 rounded-md border border-line bg-surface-sunk p-1.5">
              {url ? (
                // eslint-disable-next-line @next/next/no-img-element -- aperçu local (blob:), hors optimiseur d'images
                <img src={url} alt={`Aperçu de ${fichier.name}`} className="aspect-[4/3] w-full rounded-sm object-cover" />
              ) : null}
              <span className="flex items-center gap-1">
                <small className="min-w-0 flex-1 truncate text-[12px]" title={fichier.name}>
                  {fichier.name} · <span className="tabular">{tailleLisible(fichier.size)}</span>
                </small>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Retirer ${fichier.name}`}
                  disabled={desactive}
                  onClick={() => onChange(fichiers.filter((_, i) => i !== index))}
                >
                  <X />
                </Button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
