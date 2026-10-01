"use client"

import Link from "next/link"

import { MODULE_MANIFEST } from "@workspace/backend/modules"
import { Button } from "@workspace/ui/components/button"

/**
 * Les gardes du serveur lèvent des erreurs lisibles (« Module désactivé :
 * securite », « Accès refusé ») : on les traduit en une explication et une
 * porte de sortie plutôt qu'en un message générique.
 */
function expliquer(message: string) {
  const code = /Module désactivé : (\w+)/.exec(message)?.[1]
  if (code) {
    const libelle = MODULE_MANIFEST.find((entree) => entree.code === code)?.label ?? code
    return {
      titre: `Le module ${libelle} est désactivé`,
      texte: `Cet écran s'appuie sur le module ${libelle}, qui n'est pas activé sur ce déploiement. Un administrateur système peut l'activer depuis Administration.`,
    }
  }
  if (/Accès refusé|non autorisé|Permission/i.test(message)) {
    return {
      titre: "Accès non autorisé",
      texte: "Votre rôle ne permet pas d'ouvrir cet écran. Demandez l'habilitation à l'administrateur fonctionnel.",
    }
  }
  return {
    titre: "Impossible d’afficher cet écran",
    texte: "Une erreur a interrompu le chargement. Vos données ne sont pas perdues.",
  }
}

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const { titre, texte } = expliquer(error.message)
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas p-6">
      <div className="grid max-w-md gap-4 text-center">
        <h1 className="text-h3">{titre}</h1>
        <p className="text-small text-ink-muted">{texte}</p>
        {/* En développement seulement : la cause, pour ne pas chercher à l'aveugle. */}
        {process.env.NODE_ENV !== "production" ? (
          <pre className="tabular max-h-60 overflow-auto rounded-md border border-line bg-surface-sunk p-3 text-left text-[12px] whitespace-pre-wrap text-danger-ink">
            {error.message}
          </pre>
        ) : null}
        <div className="flex flex-wrap justify-center gap-2">
          <Button type="button" className="min-h-11" onClick={() => reset()}>
            Réessayer
          </Button>
          <Button asChild variant="secondary" className="min-h-11">
            <Link href="/">Retour à l’accueil</Link>
          </Button>
        </div>
      </div>
    </main>
  )
}
