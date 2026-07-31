"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Lock } from "lucide-react"
import { sha256 } from "@noble/hashes/sha256"

import { Button } from "@workspace/ui/components/button"

import { useTerminal } from "./terminal-provider"

/**
 * Verrouillage du terminal après inactivité.
 *
 * Un terminal contrôleur porte le manifeste d'une desserte entière — noms,
 * places, trajets. Posé cinq minutes sur une tablette de voiture, il doit se
 * refermer. Mais le déverrouillage ne peut pas exiger le réseau : il se fait
 * donc par un code court vérifié LOCALEMENT, la session Better Auth restant
 * ouverte derrière. Redemander le second facteur ici condamnerait l'agent à
 * attendre la prochaine gare pour reprendre son contrôle.
 *
 * Le code n'est jamais stocké : seule son empreinte l'est.
 */

const IDLE_MS = 5 * 60 * 1000
const SALT = "setrag-controle-v1"

function hashCode(code: string): string {
  const bytes = sha256(new TextEncoder().encode(`${SALT}:${code}`))
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")
}

export function LockScreen({ children }: { children: React.ReactNode }) {
  const { settings, updateSettings, queue, ready } = useTerminal()
  const [locked, setLocked] = useState(false)
  const [entry, setEntry] = useState("")
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<number | null>(null)

  const hasCode = Boolean(settings.lockHash)

  const arm = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current)
    // Sans code défini, verrouiller enfermerait l'agent dehors.
    if (!hasCode) return
    timer.current = window.setTimeout(() => setLocked(true), IDLE_MS)
  }, [hasCode])

  useEffect(() => {
    if (!ready) return
    arm()
    const events = ["pointerdown", "keydown", "visibilitychange"] as const
    const onActivity = () => {
      if (document.visibilityState === "hidden") return
      arm()
    }
    for (const event of events) {
      window.addEventListener(event, onActivity, { passive: true })
    }
    return () => {
      for (const event of events) window.removeEventListener(event, onActivity)
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [arm, ready])

  const submit = useCallback(async () => {
    if (entry.length < 4) {
      setError("Le code compte quatre chiffres.")
      return
    }
    if (!hasCode) {
      await updateSettings({ lockHash: hashCode(entry) })
      setEntry("")
      setError(null)
      return
    }
    if (hashCode(entry) !== settings.lockHash) {
      setError("Code incorrect.")
      setEntry("")
      return
    }
    setEntry("")
    setError(null)
    setLocked(false)
    arm()
  }, [arm, entry, hasCode, settings.lockHash, updateSettings])

  if (!locked) {
    return (
      <>
        {children}
        {!hasCode && ready && (
          <CodeSetup
            entry={entry}
            error={error}
            onEntry={setEntry}
            onSubmit={() => void submit()}
          />
        )}
      </>
    )
  }

  return (
    <main className="safe-top flex min-h-dvh flex-col items-center justify-center gap-5 bg-canvas p-6">
      <Lock aria-hidden className="size-6 text-ink-muted" />
      <div className="text-center">
        <h1 className="text-h3">Terminal verrouillé</h1>
        <p className="mt-2 max-w-xs text-[15px] text-ink-muted">
          Session ouverte, inactive depuis 5 min. Vos écritures locales sont
          intactes.
        </p>
      </div>

      <CodeInput value={entry} onChange={setEntry} onSubmit={() => void submit()} />
      {error && (
        <p role="alert" className="text-[14px] font-semibold text-danger-ink">
          {error}
        </p>
      )}

      <Button size="lg" block className="max-w-xs" onClick={() => void submit()}>
        Déverrouiller
      </Button>
      <p className="text-center text-[13px] text-ink-muted">
        <span className="tabular">{queue.total}</span> écritures en attente
        d&apos;envoi
        <br />
        Le déverrouillage se fait sans réseau : le code est vérifié localement.
      </p>
    </main>
  )
}

/** Première ouverture : l'agent choisit le code qui rouvrira son terminal. */
function CodeSetup({
  entry,
  error,
  onEntry,
  onSubmit,
}: {
  entry: string
  error: string | null
  onEntry: (value: string) => void
  onSubmit: () => void
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="code-setup-title"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-canvas p-6"
    >
      <div className="text-center">
        <h1 id="code-setup-title" className="text-h3">
          Choisissez un code de reprise
        </h1>
        <p className="mt-2 max-w-xs text-[15px] text-ink-muted">
          Quatre chiffres, pour rouvrir le terminal après une inactivité — sans
          réseau et sans refaire l&apos;authentification.
        </p>
      </div>
      <CodeInput value={entry} onChange={onEntry} onSubmit={onSubmit} />
      {error && (
        <p role="alert" className="text-[14px] font-semibold text-danger-ink">
          {error}
        </p>
      )}
      <Button size="lg" block className="max-w-xs" onClick={onSubmit}>
        Enregistrer le code
      </Button>
    </div>
  )
}

function CodeInput({
  value,
  onChange,
  onSubmit,
}: {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
}) {
  return (
    <label className="flex flex-col items-center gap-2">
      <span className="sr-only">Code à quatre chiffres</span>
      <input
        autoFocus
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={4}
        value={value}
        onChange={(event) =>
          onChange(event.target.value.replace(/\D/g, "").slice(0, 4))
        }
        onKeyDown={(event) => {
          if (event.key === "Enter") onSubmit()
        }}
        className="h-14 w-44 rounded-md border border-line-strong bg-surface text-center text-h2 tracking-[0.5em] tabular outline-none focus-visible:ring-2 focus-visible:ring-accent"
      />
    </label>
  )
}
