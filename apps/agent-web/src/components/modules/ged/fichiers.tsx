"use client"

import { Download, FileText, Loader2 } from "lucide-react"
import { useEffect, useState } from "react"

import { useMutation } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@workspace/ui/components/dialog"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import { messageErreur } from "@/components/gestion/referentiels/format"

import type { Id } from "./types"

/**
 * Types acceptés au dépôt : ceux que le serveur admet
 * (`modules/platform/documentModel.ts`, ALLOWED_DOCUMENT_MIME_TYPES).
 */
export const TYPES_ACCEPTES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
] as const

export const TAILLE_MAX = 25 * 1024 * 1024

export function verifierFichier(fichier: File): string | null {
  if (!(TYPES_ACCEPTES as readonly string[]).includes(fichier.type)) {
    return "Type de fichier refusé : PDF, image, texte, CSV ou document bureautique."
  }
  if (fichier.size === 0) return "Le fichier est vide."
  if (fichier.size > TAILLE_MAX) return "Le fichier dépasse 25 Mo."
  return null
}

/** Téléverse un fichier dans le stockage Convex et rend sa description. */
export function useTeleversement() {
  const genererUrl = useMutation(api.modules.ged.mutations.genererUrlTeleversement)
  return async (fichier: File) => {
    const erreur = verifierFichier(fichier)
    if (erreur) throw new Error(erreur)
    const url = await genererUrl({})
    const reponse = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": fichier.type },
      body: fichier,
    })
    if (!reponse.ok) throw new Error("Le téléversement a échoué : vérifiez la connexion et recommencez.")
    const { storageId } = (await reponse.json()) as { storageId: Id<"_storage"> }
    return { storageId, nomFichier: fichier.name, typeMime: fichier.type, taille: fichier.size }
  }
}

type Apercu = { url: string; nomFichier: string; typeMime: string }

/**
 * Ouvre un fichier par la mutation serveur, qui contrôle le droit et inscrit
 * la consultation au journal ; l'URL rendue est de courte durée.
 */
export function useOuvertureFichier(documentId: Id<"gedDocuments">) {
  const ouvrir = useMutation(api.modules.ged.mutations.ouvrirFichier)
  const [apercu, setApercu] = useState<Apercu | null>(null)
  const [enCours, setEnCours] = useState<string | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  const lancer = async (nature: "apercu" | "telechargement", versionNumero?: number) => {
    setEnCours(`${nature}-${versionNumero ?? "courante"}`)
    setErreur(null)
    try {
      const fichier = await ouvrir({ documentId, nature, versionNumero })
      if (nature === "apercu") {
        setApercu(fichier)
      } else {
        const reponse = await fetch(fichier.url)
        if (!reponse.ok) throw new Error("Le fichier n'a pas pu être récupéré.")
        const lien = document.createElement("a")
        const objet = URL.createObjectURL(await reponse.blob())
        lien.href = objet
        lien.download = fichier.nomFichier
        document.body.append(lien)
        lien.click()
        lien.remove()
        window.setTimeout(() => URL.revokeObjectURL(objet), 60_000)
      }
    } catch (cause) {
      setErreur(messageErreur(cause, "Ouverture impossible."))
    } finally {
      setEnCours(null)
    }
  }

  return { apercu, fermer: () => setApercu(null), lancer, enCours, erreur }
}

/** Aperçu intégré : PDF et images dans la page, texte en clair. */
export function FenetreApercu({ apercu, onClose }: { apercu: Apercu | null; onClose: () => void }) {
  return (
    <Dialog open={apercu !== null} onOpenChange={(ouvert) => (ouvert ? null : onClose())}>
      <DialogContent className="grid max-h-[92dvh] w-full max-w-[calc(100%-2rem)] grid-rows-[auto_minmax(0,1fr)] gap-4 sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[17px] font-bold">
            <FileText aria-hidden className="size-5 text-ink-muted" />
            {apercu?.nomFichier}
          </DialogTitle>
          <DialogDescription>Aperçu enregistré au journal de consultation.</DialogDescription>
        </DialogHeader>
        {apercu ? <ContenuApercu apercu={apercu} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function ContenuApercu({ apercu }: { apercu: Apercu }) {
  if (apercu.typeMime === "application/pdf") {
    return <iframe title={`Aperçu de ${apercu.nomFichier}`} src={apercu.url} className="h-[72dvh] w-full rounded-md border border-line bg-surface" />
  }
  if (apercu.typeMime.startsWith("image/")) {
    // eslint-disable-next-line @next/next/no-img-element -- URL signée du stockage Convex, hors optimiseur d'images.
    return <img src={apercu.url} alt={`Aperçu de ${apercu.nomFichier}`} className="max-h-[72dvh] w-full rounded-md border border-line object-contain" />
  }
  if (apercu.typeMime === "text/plain" || apercu.typeMime === "text/csv") {
    return <ApercuTexte url={apercu.url} />
  }
  return (
    <InlineMessage tone="info" title="Pas d'aperçu pour ce format.">
      Téléchargez le fichier pour l’ouvrir avec l’application adaptée.
    </InlineMessage>
  )
}

function ApercuTexte({ url }: { url: string }) {
  const [texte, setTexte] = useState<string | null>(null)
  useEffect(() => {
    let actif = true
    fetch(url)
      .then((reponse) => reponse.text())
      .then((contenu) => {
        if (actif) setTexte(contenu.slice(0, 200_000))
      })
      .catch(() => {
        if (actif) setTexte("Lecture du fichier impossible.")
      })
    return () => {
      actif = false
    }
  }, [url])
  if (texte === null) {
    return (
      <p role="status" className="text-small flex items-center gap-2 text-ink-muted">
        <Loader2 aria-hidden className="size-4 animate-spin" /> Lecture du fichier…
      </p>
    )
  }
  return <pre className="tabular max-h-[72dvh] overflow-auto rounded-md border border-line bg-surface-sunk p-4 text-[13px] whitespace-pre-wrap">{texte}</pre>
}

export function BoutonTelecharger({
  onClick,
  enCours,
  libelle = "Télécharger",
}: {
  onClick: () => void
  enCours: boolean
  libelle?: string
}) {
  return (
    <Button type="button" variant="ghost" size="sm" onClick={onClick} loading={enCours}>
      <Download />
      {libelle}
    </Button>
  )
}
