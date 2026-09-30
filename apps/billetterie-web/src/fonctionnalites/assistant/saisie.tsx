"use client"

import { ArrowUpIcon, MicIcon, SquareIcon } from "lucide-react"
import { useEffect, useRef, useState, useSyncExternalStore } from "react"

import { SigneRuban } from "@workspace/ui/marque"
import { cn } from "@workspace/ui/lib/utils"

import { useRuban } from "./contexte-ruban"

/* La dictée du navigateur (Web Speech API) : absente des types du DOM. */
interface Reconnaissance {
  lang: string
  interimResults: boolean
  continuous: boolean
  start(): void
  stop(): void
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
}
type ConstructeurReconnaissance = new () => Reconnaissance

function reconnaissanceDisponible(): ConstructeurReconnaissance | null {
  if (typeof window === "undefined") return null
  const w = window as unknown as { SpeechRecognition?: ConstructeurReconnaissance; webkitSpeechRecognition?: ConstructeurReconnaissance }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/**
 * La barre de saisie de Ruban : le champ (le micro y dicte), et à côté le
 * signe, qui lance la conversation à voix haute.
 */
export function Saisie({ onVoix, autoFocus, className }: { onVoix?: () => void; autoFocus?: boolean; className?: string }) {
  const { envoyer, reflechit, enLigne, disponible } = useRuban()
  const [texte, setTexte] = useState("")
  const [dictee, setDictee] = useState(false)
  const peutDicter = useSyncExternalStore(
    () => () => {},
    () => reconnaissanceDisponible() !== null,
    () => false
  )
  const champ = useRef<HTMLTextAreaElement>(null)
  const reconnaissance = useRef<Reconnaissance | null>(null)
  const inactif = !enLigne || disponible === false

  // Fenêtre refermée ou page quittée pendant une dictée : le micro se coupe.
  useEffect(
    () => () => {
      const r = reconnaissance.current
      if (!r) return
      r.onresult = null
      r.onend = null
      r.onerror = null
      r.stop()
    },
    []
  )

  // Le champ grandit avec le texte, jusqu'à cinq lignes.
  useEffect(() => {
    const el = champ.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 5 * 22 + 20)}px`
  }, [texte])

  const soumettre = () => {
    if (!texte.trim() || reflechit || inactif) return
    reconnaissance.current?.stop()
    void envoyer(texte)
    setTexte("")
  }

  const dicter = () => {
    if (dictee) {
      reconnaissance.current?.stop()
      return
    }
    const Constructeur = reconnaissanceDisponible()
    if (!Constructeur) return
    const r = new Constructeur()
    r.lang = "fr-FR"
    r.interimResults = true
    r.continuous = false
    const base = texte ? `${texte.trimEnd()} ` : ""
    r.onresult = (event) => {
      let transcription = ""
      for (let i = 0; i < event.results.length; i += 1) transcription += event.results[i]![0].transcript
      setTexte(base + transcription)
    }
    r.onend = () => setDictee(false)
    r.onerror = () => setDictee(false)
    reconnaissance.current = r
    setDictee(true)
    r.start()
  }

  return (
    <div className={cn("grid gap-2 border-t border-line bg-surface px-3 pt-2.5 pb-3", className)}>
      <form
        className="flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          soumettre()
        }}
      >
        <div className="flex min-h-[50px] flex-1 items-end gap-1 rounded-[25px] border border-line-strong bg-canvas py-[2px] pr-[2px] pl-4 focus-within:border-accent-base has-[textarea:focus-visible]:shadow-[var(--focus-ring)]">
          <label htmlFor="ruban-saisie" className="sr-only">
            Écrire à Ruban
          </label>
          <textarea
            id="ruban-saisie"
            ref={champ}
            rows={1}
            value={texte}
            autoFocus={autoFocus}
            disabled={inactif}
            onChange={(event) => setTexte(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault()
                soumettre()
              }
            }}
            placeholder={inactif ? (enLigne ? "Ruban n'est pas disponible" : "Ruban a besoin du réseau") : dictee ? "Je vous écoute…" : "Écrivez à Ruban…"}
            className="max-h-[130px] min-h-10 flex-1 resize-none bg-transparent py-[11px] text-[16px] leading-[22px] outline-none placeholder:text-ink-faint focus-visible:shadow-none disabled:cursor-not-allowed"
          />
          {texte.trim() ? (
            <button
              type="submit"
              disabled={reflechit || inactif}
              aria-label="Envoyer"
              className="grid size-11 shrink-0 place-items-center rounded-pill bg-accent-base text-ink-inverse transition-opacity disabled:opacity-50"
            >
              <ArrowUpIcon className="size-5" />
            </button>
          ) : (
            peutDicter && (
              <button
                type="button"
                onClick={dicter}
                disabled={inactif}
                aria-pressed={dictee}
                aria-label={dictee ? "Arrêter la dictée" : "Dicter un message"}
                className={cn("grid size-11 shrink-0 place-items-center rounded-pill text-accent-ink disabled:opacity-40", dictee && "bg-accent-soft")}
              >
                {dictee ? <SquareIcon className="size-4 fill-current" /> : <MicIcon className="size-5" />}
              </button>
            )
          )}
        </div>
        {onVoix && (
          <button
            type="button"
            onClick={onVoix}
            disabled={inactif}
            aria-label="Parler à Ruban à voix haute"
            className="grid size-[50px] shrink-0 place-items-center rounded-pill bg-brand-encre text-white transition-transform duration-[var(--dur-micro)] active:scale-95 disabled:opacity-40 dark:bg-[oklch(0.34_0.03_257)]"
          >
            <SigneRuban fond="sombre" className="h-[23px] w-auto" />
          </button>
        )}
      </form>
      <p className="text-center text-[11.5px] font-medium text-ink-faint">Ruban peut se tromper. Il ne vous demandera jamais votre code secret.</p>
    </div>
  )
}
