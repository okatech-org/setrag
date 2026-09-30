"use client"

import {
  CameraOffIcon,
  FlashlightIcon,
  KeyboardIcon,
  MapPinIcon,
  SearchIcon,
  TrainFrontIcon,
  type LucideIcon,
} from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { Feuille } from "@workspace/ui/components/feuille"
import { Field, Textarea } from "@workspace/ui/components/field"
import { Tag } from "@workspace/ui/components/tag"
import { Voie } from "@workspace/ui/components/voie"
import { cn } from "@workspace/ui/lib/utils"

import { TERRAIN } from "@/composants/boutons"
import { CartesChoix } from "@/composants/carte-choix"
import { useApparence } from "@/coquille/apparence"
import { Bas, Corps } from "@/coquille/ecran"
import { humanError } from "@/lib/errors"
import { classeLongue } from "@/lib/format"
import { isStale } from "@/lib/offline/manifest"
import { arretDeRang, arretsOrdonnes } from "@/lib/position"
import { debloquerSon } from "@/lib/retour"
import {
  decodeFrame,
  describeCameraFailure,
  openCamera,
  type CameraFailure,
  type CameraHandle,
} from "@/lib/scanner"
import { memeVoiture, nomDuTrain, numeroVoiture, voitureDe } from "@/lib/train"

import { useTerminal } from "../terminal/contexte-terminal"
import { useDonneesTournee } from "../tournee/donnees-tournee"
import { FeuilleGareAtteinte, libelleGare, usePropositionGare } from "../tournee/gare-atteinte"
import { useControle, type ResultatControle } from "./controle"
import { Verdict } from "./verdict"

/**
 * Le contrôle : le viseur, puis le verdict qui recouvre tout l'écran.
 *
 * La caméra ne tourne que sur le viseur : elle se coupe dès que le verdict
 * s'affiche ou que l'écran change — quatorze heures de tournée sur une
 * batterie.
 */
export function Controle() {
  const { manifest, ready } = useTerminal()
  const parametres = useSearchParams()
  const router = useRouter()
  const [resultat, setResultat] = useState<ResultatControle | null>(null)
  const [saisie, setSaisie] = useState(parametres.get("saisir") === "1")

  if (!ready) return null
  if (!manifest) return <SansManifeste />
  if (resultat) {
    return (
      <Verdict
        resultat={resultat}
        onFermer={() => {
          setResultat(null)
          if (parametres.get("saisir")) router.replace("/scan")
        }}
        onSaisir={() => {
          setResultat(null)
          setSaisie(true)
        }}
      />
    )
  }
  return <Viseur onResultat={setResultat} saisie={saisie} onSaisie={setSaisie} />
}

function SansManifeste() {
  useApparence({ sombre: true })
  return (
    <>
      <Corps className="justify-center text-center">
        <CameraOffIcon aria-hidden className="mx-auto size-8 text-ink-muted" />
        <h1 className="text-[19px] font-bold">Aucun manifeste embarqué</h1>
        <p className="mx-auto max-w-[32ch] text-small text-ink-muted">
          Choisissez une desserte et téléchargez son manifeste avant de
          contrôler : la vérification des titres en dépend.
        </p>
      </Corps>
      <Bas avecOnglets className="bg-transparent">
        <Button size="lg" block className={TERRAIN} asChild>
          <Link href="/tournee">Choisir une desserte</Link>
        </Button>
      </Bas>
    </>
  )
}

/**
 * Le décodage tourne à intervalle fixe plutôt qu'à chaque image : décoder 60
 * fois par seconde viderait la batterie sans lire un code de plus.
 */
const INTERVALLE_DECODAGE_MS = 320

function Viseur({
  onResultat,
  saisie,
  onSaisie,
}: {
  onResultat: (resultat: ResultatControle) => void
  saisie: boolean
  onSaisie: (ouverte: boolean) => void
}) {
  // Toujours sombre : la caméra montre une image sombre, et un fond clair
  // éblouirait dans une voiture éteinte.
  useApparence({ sombre: true })
  const { manifest, settings, updateSettings, queue } = useTerminal()
  const { inspecter } = useControle()
  const donnees = useDonneesTournee(manifest)
  const proposition = usePropositionGare(manifest)
  const video = useRef<HTMLVideoElement | null>(null)
  const toile = useRef<HTMLCanvasElement | null>(null)
  const camera = useRef<CameraHandle | null>(null)
  const occupe = useRef(false)

  const [panne, setPanne] = useState<CameraFailure | null>(null)
  const [ouverture, setOuverture] = useState(false)
  const [lampeDisponible, setLampeDisponible] = useState(false)
  const [choixVoiture, setChoixVoiture] = useState(false)
  const [gare, setGare] = useState(false)

  // La lampe est un réglage persistant : suivie dans une référence, pour ne
  // pas relancer la caméra à chaque bascule.
  const lampeVoulue = useRef(settings.torch)
  useEffect(() => {
    lampeVoulue.current = settings.torch
  }, [settings.torch])

  const brancher = useCallback(async (handle: CameraHandle) => {
    camera.current = handle
    setLampeDisponible(handle.torchAvailable)
    if (video.current) {
      video.current.srcObject = handle.stream
      await video.current.play().catch(() => {})
    }
    if (lampeVoulue.current && handle.torchAvailable) {
      await handle.setTorch(true).catch(() => {})
    }
  }, [])

  /** Rouvre la caméra : un refus d'autorisation se rattrape sans quitter l'écran. */
  const relancer = useCallback(async () => {
    setOuverture(true)
    setPanne(null)
    try {
      camera.current?.stop()
      await brancher(await openCamera())
    } catch (error) {
      setPanne(describeCameraFailure(error))
    } finally {
      setOuverture(false)
    }
  }, [brancher])

  useEffect(() => {
    let annule = false
    void (async () => {
      const handle = await openCamera().catch((error: unknown) => {
        if (!annule) setPanne(describeCameraFailure(error))
        return null
      })
      if (!handle) return
      if (annule) {
        handle.stop()
        return
      }
      await brancher(handle)
    })()
    return () => {
      annule = true
      camera.current?.stop()
      camera.current = null
    }
  }, [brancher])

  const traiter = useCallback(
    async (code: string, manuel = false) => {
      if (occupe.current) return
      occupe.current = true
      try {
        onResultat(await inspecter(code, { manuel }))
      } catch (error) {
        toast.error(humanError(error))
      } finally {
        occupe.current = false
      }
    },
    [inspecter, onResultat]
  )

  useEffect(() => {
    if (panne || saisie) return
    const minuteur = window.setInterval(() => {
      void (async () => {
        const v = video.current
        const t = toile.current
        if (!v || !t || v.readyState < 2 || occupe.current) return
        if (!v.videoWidth || !v.videoHeight) return
        t.width = v.videoWidth
        t.height = v.videoHeight
        const contexte = t.getContext("2d", { willReadFrequently: true })
        if (!contexte) return
        contexte.drawImage(v, 0, 0, t.width, t.height)
        const code = await decodeFrame(t)
        if (code) await traiter(code)
      })()
    }, INTERVALLE_DECODAGE_MS)
    return () => window.clearInterval(minuteur)
  }, [panne, saisie, traiter])

  async function basculerLampe() {
    const voulue = !settings.torch
    try {
      await camera.current?.setTorch(voulue)
      await updateSettings({ torch: voulue })
    } catch {
      toast.error("Ce terminal ne pilote pas la lampe.")
    }
  }

  if (!manifest) return null
  const voiture = voitureDe(donnees.composition, settings.coachLabel)
  const numero = numeroVoiture(voiture?.label ?? settings.coachLabel)
  const ici = arretDeRang(manifest, settings.currentStopIndex)
  const premiere = arretsOrdonnes(manifest)[0]?.sequence
  const incomplet = !manifest.complete
  const perime = isStale(manifest)

  return (
    <div className="flex flex-1 flex-col" onPointerDown={debloquerSon}>
      <div className="flex items-center gap-3 px-4 pt-1.5 pb-2">
        <div className="min-w-0">
          <h1 className="truncate text-[18px] font-bold">
            Voiture {numero}
            {voiture?.serviceClass && ` · ${classeLongue(voiture.serviceClass)}`}
          </h1>
          <p className="truncate text-[13px] font-medium text-ink-muted">
            {nomDuTrain(manifest)} · {libelleGare(ici, ici?.sequence === premiere)}
          </p>
        </div>
      </div>

      {(proposition || incomplet || perime) && (
        <div className="grid gap-1.5 px-4 pb-2">
          {proposition && (
            <button
              type="button"
              onClick={() => setGare(true)}
              className="flex min-h-11 items-center gap-2 rounded-md border border-accent-line bg-accent-soft px-3 text-left text-[13.5px] font-semibold text-accent-ink"
            >
              <MapPinIcon aria-hidden className="size-4 shrink-0" />
              <span className="min-w-0 flex-1">
                L&apos;horaire indique : après {proposition.name}. Confirmer ?
              </span>
            </button>
          )}
          {(incomplet || perime) && (
            <Tag tone="warning" className="h-auto min-h-[30px] py-1 text-[13px] whitespace-normal">
              {incomplet
                ? `Manifeste incomplet — ${manifest.downloadedCount} titres sur ${manifest.ticketCount}`
                : "Manifeste périmé — statuts fins inconnus"}
            </Tag>
          )}
        </div>
      )}

      <section
        aria-label="Viseur"
        className="viseur-fond relative mx-4 min-h-[300px] flex-1 overflow-hidden rounded-lg"
      >
        {panne ? (
          <div className="absolute inset-0 grid content-center justify-items-center gap-2.5 p-5 text-center">
            <CameraOffIcon aria-hidden className="size-[30px] text-ink-muted" />
            <h2 className="text-[19px] font-bold">Caméra indisponible</h2>
            <p className="max-w-[30ch] text-small text-ink-muted">
              {panne.message} {panne.remedy}
            </p>
          </div>
        ) : (
          <>
            <video
              ref={video}
              playsInline
              muted
              aria-label="Image de la caméra"
              className="absolute inset-0 size-full object-cover"
            />
            <div aria-hidden className="pointer-events-none absolute top-[44%] left-1/2 size-[196px] -translate-x-1/2 -translate-y-1/2">
              <i className="absolute top-0 left-0 size-[34px] rounded-tl-[14px] border-t-[5px] border-l-[5px] border-accent-on-ink" />
              <i className="absolute top-0 right-0 size-[34px] rounded-tr-[14px] border-t-[5px] border-r-[5px] border-accent-on-ink" />
              <i className="absolute bottom-0 left-0 size-[34px] rounded-bl-[14px] border-b-[5px] border-l-[5px] border-accent-on-ink" />
              <i className="absolute right-0 bottom-0 size-[34px] rounded-br-[14px] border-r-[5px] border-b-[5px] border-accent-on-ink" />
            </div>
            <div className="absolute inset-x-0 bottom-4 grid justify-items-center gap-2.5 px-5 text-center text-[15px] leading-[1.35] font-semibold text-ink">
              <p>Présentez le code Aztec dans le cadre</p>
              {/* Une rame passe tant que la caméra attend un code : l'attente
                  réelle, le seul mouvement de l'écran. */}
              <Voie etat="attente" fond="encre" className="w-[150px] flex-none" />
            </div>
          </>
        )}
        <canvas ref={toile} className="hidden" />
      </section>

      {panne ? (
        <Bas avecOnglets className="bg-transparent">
          {panne.retryable && (
            <Button
              size="lg"
              block
              className={TERRAIN}
              loading={ouverture}
              loadingLabel="Ouverture…"
              onClick={() => void relancer()}
            >
              Autoriser la caméra
            </Button>
          )}
          <Button
            variant={panne.retryable ? "secondary" : "primary"}
            size="lg"
            block
            className={TERRAIN}
            onClick={() => onSaisie(true)}
          >
            Saisir un code à la main
          </Button>
          <Button variant="secondary" size="lg" block className={TERRAIN} asChild>
            <Link href="/recherche">Chercher dans le manifeste</Link>
          </Button>
        </Bas>
      ) : (
        <>
          <p className="flex items-center justify-center gap-4 px-4 pt-2.5 pb-1.5 text-[13px] font-medium text-ink-muted">
            <span>
              <b className="font-mono text-[15px] font-semibold text-ink tabular-nums">
                {donnees.controles.size}
              </b>{" "}
              contrôlés
            </span>
            <span>
              <b className="font-mono text-[15px] font-semibold text-warning-ink tabular-nums">
                {queue.total}
              </b>{" "}
              à envoyer
            </span>
          </p>
          <div className="grid grid-cols-4 gap-1.5 px-4 pt-1 pb-2.5">
            <Commande
              icone={FlashlightIcon}
              libelle="Lampe"
              active={settings.torch}
              disabled={!lampeDisponible}
              onClick={() => void basculerLampe()}
              nom={
                lampeDisponible
                  ? settings.torch
                    ? "Lampe allumée — éteindre"
                    : "Allumer la lampe"
                  : "Lampe indisponible sur ce terminal"
              }
            />
            <Commande
              icone={TrainFrontIcon}
              libelle={`Voiture ${numero}`}
              onClick={() => setChoixVoiture(true)}
              nom={`Voiture ${numero} — changer de voiture`}
            />
            <Commande icone={SearchIcon} libelle="Chercher" href="/recherche" nom="Chercher dans le manifeste" />
            <Commande
              icone={KeyboardIcon}
              libelle="Saisir"
              onClick={() => onSaisie(true)}
              nom="Saisir le code à la main"
            />
          </div>
        </>
      )}

      <FeuilleSaisie
        open={saisie}
        onOpenChange={onSaisie}
        onValider={(code) => {
          onSaisie(false)
          void traiter(code, false)
        }}
      />
      <FeuilleGareAtteinte open={gare} onOpenChange={setGare} />
      <Feuille
        open={choixVoiture}
        onOpenChange={setChoixVoiture}
        titre="Voiture contrôlée"
        description={`Composition ${donnees.composition.length > 0 ? `de ${nomDuTrain(manifest)}` : "inconnue"}.`}
      >
        {donnees.composition.length > 0 ? (
          <CartesChoix
            label="Voiture"
            valeur={voiture?.label}
            onChange={(label) => {
              void updateSettings({ coachLabel: label })
              setChoixVoiture(false)
            }}
            options={donnees.voitures.map(({ voiture: v, titres }) => ({
              valeur: v.label,
              nom: `Voiture ${numeroVoiture(v.label)}${v.serviceClass ? `, ${classeLongue(v.serviceClass)}` : ""}, ${titres} titres`,
              titre: `Voiture ${numeroVoiture(v.label)}${v.serviceClass ? ` · ${classeLongue(v.serviceClass)}` : ""}`,
              sousTitre: (
                <>
                  {v.seatCount > 0 && (
                    <>
                      <span className="tabular">{v.seatCount}</span> places
                      {v.standingCapacity > 0 && (
                        <>
                          {" · "}
                          <span className="tabular">{v.standingCapacity}</span> debout
                        </>
                      )}
                      {" · "}
                    </>
                  )}
                  <span className="tabular">{titres}</span> titres
                </>
              ),
              fin: memeVoiture(v.label, settings.coachLabel) ? <Tag tone="accent">ici</Tag> : undefined,
            }))}
          />
        ) : (
          <p className="pb-4 text-small text-ink-muted">
            Le manifeste embarqué ne porte pas la composition du train :
            mettez-le à jour en gare.
          </p>
        )}
      </Feuille>
    </div>
  )
}

/** Commande au pouce : 58 px, une icône et un mot. */
function Commande({
  icone: Icone,
  libelle,
  nom,
  active,
  disabled,
  onClick,
  href,
}: {
  icone: LucideIcon
  libelle: ReactNode
  nom: string
  active?: boolean
  disabled?: boolean
  onClick?: () => void
  href?: Route
}) {
  const classes = cn(
    "grid min-h-[58px] content-center justify-items-center gap-[3px] rounded-md border px-1 text-center text-[12.5px] font-semibold disabled:opacity-45",
    active
      ? "border-accent-base bg-accent-base text-ink-inverse"
      : "border-line-strong bg-surface text-ink"
  )
  const contenu = (
    <>
      <Icone aria-hidden className={cn("size-[22px]", active ? "text-ink-inverse" : "text-accent-ink")} />
      <span className="max-w-full truncate">{libelle}</span>
    </>
  )
  if (href) {
    return (
      <Link href={href} aria-label={nom} className={classes}>
        {contenu}
      </Link>
    )
  }
  return (
    <button
      type="button"
      aria-label={nom}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={classes}
    >
      {contenu}
    </button>
  )
}

/**
 * Saisie du code à la main. Elle attend la chaîne complète imprimée sous le
 * code (`SETRAG1:…`) : elle passe par la même vérification de signature
 * qu'un code lu par la caméra.
 */
function FeuilleSaisie({
  open,
  onOpenChange,
  onValider,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onValider: (code: string) => void
}) {
  const [code, setCode] = useState("")
  const valider = () => {
    const nettoye = code.trim()
    if (!nettoye) return
    setCode("")
    onValider(nettoye)
  }
  return (
    <Feuille
      open={open}
      onOpenChange={onOpenChange}
      titre="Saisir le code du titre"
      description="Recopiez la chaîne imprimée sous le code, en commençant par SETRAG1:."
      pied={
        <Button size="lg" block className={TERRAIN} disabled={!code.trim()} onClick={valider}>
          Vérifier le code
        </Button>
      }
    >
      <form
        className="pb-2"
        onSubmit={(event) => {
          event.preventDefault()
          valider()
        }}
      >
        <Field label="Code du titre" htmlFor="code-titre" hint="La signature est vérifiée sur ce terminal, sans réseau.">
          <Textarea
            autoFocus
            rows={4}
            spellCheck={false}
            autoCapitalize="characters"
            autoComplete="off"
            className="font-mono text-[14px]"
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
        </Field>
      </form>
    </Feuille>
  )
}
