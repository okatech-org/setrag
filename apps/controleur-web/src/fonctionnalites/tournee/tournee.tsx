"use client"

import {
  ClipboardListIcon,
  LockIcon,
  MapPinIcon,
  MoonIcon,
  RouteIcon,
  UserIcon,
} from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { Feuille } from "@workspace/ui/components/feuille"
import { Tag } from "@workspace/ui/components/tag"
import { Voie } from "@workspace/ui/components/voie"
import { cn } from "@workspace/ui/lib/utils"

import { INACTIF_EXPLIQUE, TERRAIN } from "@/composants/boutons"
import { Compteurs } from "@/composants/compteurs"
import { Ligne, Liste } from "@/composants/liste"
import { Message } from "@/composants/message"
import { Bas, BarreApp, Corps, TitreSection } from "@/coquille/ecran"
import { useMaintenant } from "@/hooks/use-maintenant"
import { usePreferences } from "@/hooks/use-preferences"
import { humanError } from "@/lib/errors"
import { classeCourte, dateCourte, FUSEAU, heure } from "@/lib/format"
import { freshness, isStale } from "@/lib/offline/manifest"
import type { EmbarkedManifest } from "@/lib/offline/types"
import { arretDeRang, arretsOrdonnes, heurePassage, progressionA } from "@/lib/position"
import type { EtatVoiture } from "@/lib/tournee"
import { memeVoiture, nomDuTrain, numeroVoiture } from "@/lib/train"

import { FeuilleAffichage, resumeAffichage } from "../reglages/feuille-affichage"
import { FeuilleSession } from "../reglages/feuille-session"
import { useSessionControle } from "../session/garde-session"
import { useVerrouillage } from "../session/verrouillage"
import { useTerminal } from "../terminal/contexte-terminal"
import { ChoixDesserte, libelleDesserte, type Desserte } from "./dessertes"
import { useDonneesTournee } from "./donnees-tournee"
import { FeuilleGareAtteinte, libelleGare, usePropositionGare } from "./gare-atteinte"

/**
 * La tournée — l'écran d'accueil. Il répond à trois questions, dans cet
 * ordre : où en est le train, où en est le contrôle, que reste-t-il à
 * envoyer. Le ruban y garde son sens : sur la voie de la desserte il dit où
 * est le train, sous chaque voiture il dit la part contrôlée.
 */
export function Tournee() {
  const { manifest, ready } = useTerminal()
  if (!ready) return null
  return manifest ? <EcranTournee manifest={manifest} /> : <PriseDeService />
}

/** Matricule (ouvre la session) et verrouillage, à droite de la barre d'app. */
function ActionsBarre() {
  const { matricule } = useSessionControle()
  const { verrouiller, possible } = useVerrouillage()
  const [session, setSession] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setSession(true)}
        aria-label={`Session du terminal, matricule ${matricule}`}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-pill px-2 font-mono text-[14px] font-semibold text-ink-muted active:bg-surface-sunk"
      >
        <UserIcon aria-hidden className="size-[18px]" />
        {matricule}
      </button>
      {possible && (
        <button
          type="button"
          onClick={verrouiller}
          aria-label="Verrouiller le terminal"
          className="grid size-11 place-items-center rounded-pill text-ink active:bg-surface-sunk"
        >
          <LockIcon aria-hidden className="size-[22px]" />
        </button>
      )}
      <FeuilleSession open={session} onOpenChange={setSession} />
    </>
  )
}

/* ─────────────────────────── Prise de service ─────────────────────────── */

/**
 * Aucune desserte embarquée : l'agent choisit la sienne, puis télécharge son
 * manifeste — en gare, avant le départ.
 */
function PriseDeService() {
  const router = useRouter()
  const { settings, setActiveTrip, online, authenticated } = useTerminal()
  const [choisie, setChoisie] = useState<Desserte | null>(null)
  const retenue = choisie?.id ?? settings.activeTripId

  async function telecharger() {
    if (choisie) await setActiveTrip(choisie.id, libelleDesserte(choisie))
    router.push("/manifeste?telecharger=1" as Route)
  }

  return (
    <>
      <BarreApp logo actions={<ActionsBarre />} />
      <Corps>
        <div className="grid gap-1 rounded-md border-[1.5px] border-dashed border-line-strong px-4 py-3.5">
          <b className="text-[16px] font-bold">
            {settings.activeTripId ? "Manifeste non téléchargé" : "Aucune desserte embarquée"}
          </b>
          <p className="text-small text-ink-muted">
            {settings.activeTripId
              ? `${settings.activeTripLabel ?? "La desserte choisie"} est choisie, mais son manifeste n'est pas encore embarqué. Téléchargez-le avant le départ.`
              : "Choisissez votre desserte ci-dessous, puis téléchargez son manifeste avant le départ : au-delà de Ntoum, le réseau devient très irrégulier."}
          </p>
        </div>
        <TitreSection>Dessertes disponibles</TitreSection>
        <ChoixDesserte valeur={retenue} onChange={setChoisie} />
      </Corps>
      <Bas avecOnglets>
        <Button
          size="lg"
          block
          className={cn(TERRAIN, INACTIF_EXPLIQUE)}
          disabled={!retenue || !online || !authenticated}
          onClick={() => void telecharger()}
        >
          {!online
            ? "Téléchargement impossible sans réseau"
            : !retenue
              ? "Choisissez une desserte"
              : "Télécharger le manifeste"}
        </Button>
      </Bas>
    </>
  )
}

/* ─────────────────────────────── Tournée ─────────────────────────────── */

function EcranTournee({ manifest }: { manifest: EmbarkedManifest }) {
  const router = useRouter()
  const { settings, queue, setActiveTrip, online, authenticated } = useTerminal()
  const { profil, matricule } = useSessionControle()
  const donnees = useDonneesTournee(manifest)
  const prefs = usePreferences()
  const maintenant = useMaintenant(60_000)
  const [gare, setGare] = useState(false)
  const [affichage, setAffichage] = useState(false)
  const [dessertes, setDessertes] = useState(false)
  const [nouvelle, setNouvelle] = useState<Desserte | null>(null)

  const perime = maintenant !== null && isStale(manifest, maintenant)
  const partiel = !manifest.complete
  const commence = donnees.controles.size > 0

  return (
    <>
      <BarreApp logo actions={<ActionsBarre />} />
      <Corps>
        {perime && (
          <Message ton="alerte" titre={`Données périmées — manifeste ${freshness(manifest, maintenant ?? undefined)}.`}>
            Les annulations et remboursements survenus depuis ne sont pas connus
            du terminal.
          </Message>
        )}
        {partiel && !perime && (
          <Message
            ton="alerte"
            titre={`Manifeste incomplet — ${manifest.downloadedCount} titres sur ${manifest.ticketCount}.`}
          >
            Les titres manquants seront sans statut connu : l&apos;absence
            d&apos;un titre ne vaut pas preuve.
          </Message>
        )}

        <CarteDesserte manifest={manifest} onChanger={() => setGare(true)} />

        <Compteurs
          controles={donnees.controles.size}
          attendus={manifest.ticketCount}
          aEnvoyer={queue.total}
        />

        {donnees.voitures.length > 0 && (
          <>
            <TitreSection fin="ruban : part contrôlée">Voitures</TitreSection>
            <Rame voitures={donnees.voitures} ici={settings.coachLabel} />
          </>
        )}

        <Caisse rattache={Boolean(profil?.user.pointOfSaleId)} matricule={matricule} />

        <Liste>
          <Ligne
            icone={ClipboardListIcon}
            libelle="Données embarquées"
            detail={`mises à jour ${freshness(manifest, maintenant ?? manifest.updatedAt)}`}
            fin={
              perime ? (
                <Tag tone="warning">périmées</Tag>
              ) : partiel ? (
                <Tag tone="warning">incomplètes</Tag>
              ) : (
                <Tag tone="success">à jour</Tag>
              )
            }
            href="/manifeste"
          />
          <Ligne
            icone={MoonIcon}
            libelle="Affichage et son"
            detail={resumeAffichage(prefs)}
            onClick={() => setAffichage(true)}
          />
          <Ligne
            icone={RouteIcon}
            libelle="Changer de desserte"
            detail={`${nomDuTrain(manifest)} · ${manifest.originName} → ${manifest.destinationName}`}
            onClick={() => setDessertes(true)}
          />
        </Liste>
      </Corps>
      <Bas avecOnglets>
        <Button size="lg" block className={TERRAIN} asChild>
          <Link href="/scan">{commence ? "Reprendre le contrôle" : "Commencer le contrôle"}</Link>
        </Button>
      </Bas>

      <FeuilleGareAtteinte open={gare} onOpenChange={setGare} />
      <FeuilleAffichage open={affichage} onOpenChange={setAffichage} />
      <Feuille
        open={dessertes}
        onOpenChange={(ouverte) => {
          setDessertes(ouverte)
          if (!ouverte) setNouvelle(null)
        }}
        titre="Changer de desserte"
        description="Les écritures déjà faites restent en file et partiront normalement."
        hauteur="haute"
        pied={
          <Button
            size="lg"
            block
            className={cn(TERRAIN, INACTIF_EXPLIQUE)}
            disabled={!nouvelle || nouvelle.id === manifest.tripId || !online || !authenticated}
            onClick={() => {
              if (!nouvelle) return
              void setActiveTrip(nouvelle.id, libelleDesserte(nouvelle)).then(() =>
                router.push("/manifeste?telecharger=1" as Route)
              )
            }}
          >
            {!online ? "Téléchargement impossible sans réseau" : "Embarquer cette desserte"}
          </Button>
        }
      >
        <ChoixDesserte valeur={nouvelle?.id ?? manifest.tripId} onChange={setNouvelle} />
      </Feuille>
    </>
  )
}

/**
 * La desserte : ses deux bouts, la voie entre eux et le ruban jusqu'à la
 * position du train ; en dessous, la dernière gare atteinte et de quoi la
 * changer — ou la proposition de l'horaire, à confirmer d'un geste.
 */
function CarteDesserte({
  manifest,
  onChanger,
}: {
  manifest: EmbarkedManifest
  onChanger: () => void
}) {
  const { settings } = useTerminal()
  const proposition = usePropositionGare(manifest)
  const arrets = arretsOrdonnes(manifest)
  const premier = arrets[0]
  const dernier = arrets[arrets.length - 1]
  const ici = arretDeRang(manifest, settings.currentStopIndex) ?? premier
  const passage = ici ? heurePassage(ici) : undefined
  const aQuai = ici?.sequence === premier?.sequence
  const aller = (premier?.kilometerPoint ?? 0) <= (dernier?.kilometerPoint ?? 0)
  const longueur = Math.abs((dernier?.kilometerPoint ?? 0) - (premier?.kilometerPoint ?? 0))
  const arrivee = dernier ? heurePassage(dernier) : manifest.arrivalAt
  const lendemain =
    arrivee !== undefined &&
    new Intl.DateTimeFormat("en-CA", { timeZone: FUSEAU }).format(arrivee) !== manifest.serviceDate

  return (
    <section className="grid gap-3 rounded-md border border-line bg-surface p-4">
      <p className="text-[13px] font-semibold text-ink-muted">
        <b className="text-[15px] font-bold text-ink">{nomDuTrain(manifest)}</b> ·{" "}
        {dateCourte(manifest.serviceDate)} · <span className="tabular">{arrets.length}</span> gares
      </p>
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
        <div>
          <b className="block font-mono text-[22px] leading-none font-semibold tabular-nums">
            {heure(manifest.departureAt)}
          </b>
          <span className="mt-1.5 block text-[12.5px] font-medium text-ink-muted">{manifest.originName}</span>
        </div>
        <div className="grid justify-items-center gap-1.5">
          <Voie rempli={progressionA(manifest, ici?.sequence ?? 0)} className="w-full flex-none" />
          {ici && (
            <small className="font-mono text-[12px] whitespace-nowrap text-ink-muted">
              PK {ici.kilometerPoint}
              {aller && ` sur ${longueur}`}
            </small>
          )}
        </div>
        <div className="text-right">
          <b className="block font-mono text-[22px] leading-none font-semibold tabular-nums">
            {arrivee !== undefined ? heure(arrivee) : "--:--"}
            {lendemain && (
              <sup className="ml-0.5 align-top font-mono text-[11px] text-ink-muted">
                +1<span className="sr-only"> jour</span>
              </sup>
            )}
          </b>
          <span className="mt-1.5 block text-[12.5px] font-medium text-ink-muted">{manifest.destinationName}</span>
        </div>
      </div>

      {proposition ? (
        <div className="-mx-4 -mb-4 grid gap-2 border-t border-line bg-info-soft px-4 py-3">
          <p className="flex items-start gap-2 text-[13.5px] font-medium text-info-ink">
            <MapPinIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>
              Position confirmée : {libelleGare(ici, aQuai)}. D&apos;après l&apos;horaire, le
              train a passé <b>{proposition.name}</b>
              {heurePassage(proposition) !== undefined && (
                <>
                  {" à "}
                  <span className="tabular">{heure(heurePassage(proposition)!)}</span>
                </>
              )}
              .
            </span>
          </p>
          <Button variant="secondary" block onClick={onChanger}>
            Vérifier et confirmer la position
          </Button>
        </div>
      ) : (
        <div className="-mx-4 -mb-4 flex min-h-11 items-center gap-2 border-t border-line pr-2 pl-4 text-[13.5px] font-medium text-ink-muted">
          <MapPinIcon aria-hidden className="size-4 shrink-0" />
          <span className="min-w-0">
            {aQuai ? "À quai à " : "Après "}
            <b className="font-bold text-ink">{ici?.name}</b>
            {passage !== undefined && (
              <>
                {aQuai ? " · départ " : " · "}
                <span className="tabular">{heure(passage)}</span>
              </>
            )}
          </span>
          <button
            type="button"
            onClick={onChanger}
            className="ml-auto inline-flex min-h-11 items-center rounded-pill px-3 text-[14px] font-semibold text-accent-ink active:bg-surface-sunk"
          >
            Changer
          </button>
        </div>
      )}
    </section>
  )
}

/** La rame : une case par voiture, le ruban sous chacune dit la part contrôlée. */
function Rame({ voitures, ici }: { voitures: EtatVoiture[]; ici: string }) {
  return (
    <div
      className="grid gap-[5px]"
      style={{ gridTemplateColumns: `repeat(${voitures.length}, minmax(0, 1fr))` }}
    >
      {voitures.map(({ voiture, titres, controles }) => {
        const estIci = memeVoiture(voiture.label, ici)
        const classe = voiture.serviceClass ? classeCourte(voiture.serviceClass) : ""
        return (
          <Link
            key={voiture.label}
            href={`/voiture?v=${encodeURIComponent(voiture.label)}` as Route}
            aria-label={`Voiture ${numeroVoiture(voiture.label)}${classe ? `, ${classe}` : ""}${estIci ? ", voiture contrôlée" : ""} : ${titres > 0 ? `${controles} titres contrôlés sur ${titres}` : "aucun titre"}`}
            className={cn(
              "rame-voiture relative grid min-h-16 content-start justify-items-center gap-px overflow-hidden rounded-[10px_10px_6px_6px] border bg-surface px-0.5 pt-[7px] pb-3",
              estIci ? "border-accent-base shadow-[inset_0_0_0_1px_var(--c-accent)]" : "border-line"
            )}
            style={{ "--p": titres > 0 ? controles / titres : 0 } as React.CSSProperties}
          >
            <b className="text-[14px] font-bold">{voiture.label}</b>
            <small className="text-[10.5px] font-medium whitespace-nowrap text-ink-muted">
              {classe}
              {estIci && " · ici"}
            </small>
            <span className="mt-0.5 font-mono text-[12px] font-semibold tabular-nums">
              {titres > 0 ? `${controles}/${titres}` : <span className="text-ink-muted">—</span>}
            </span>
          </Link>
        )
      })}
    </div>
  )
}

/**
 * La caisse embarquée : la vente à bord et l'encaissement des amendes en
 * exigent une, et une caisse appartient à un point de vente. Vérifiée quand
 * le serveur répond ; hors réseau, rien n'est affirmé.
 */
function Caisse({ rattache, matricule }: { rattache: boolean; matricule: string }) {
  const { online, authenticated } = useTerminal()
  const pret = online && authenticated
  const caisse = useQuery(api.functions.cash.mySession, pret ? {} : "skip")
  const ouvrir = useMutation(api.functions.cash.openSession)
  const [ouverture, setOuverture] = useState(false)

  if (!pret || caisse !== null) return null
  if (!rattache) {
    return (
      <Message ton="alerte" titre="Compte non rattaché à un point de vente.">
        La vente à bord et l&apos;encaissement des amendes exigent une caisse.
        Demandez à votre chef de gare de rattacher le matricule {matricule}. Le
        contrôle des titres, lui, reste possible.
      </Message>
    )
  }
  return (
    <Message ton="alerte" titre="Caisse fermée.">
      <p>La vente à bord exige une caisse ouverte.</p>
      <Button
        variant="secondary"
        size="sm"
        className="mt-2"
        loading={ouverture}
        loadingLabel="Ouverture…"
        onClick={() => {
          setOuverture(true)
          void ouvrir({ openingFloatXaf: 0 })
            .then(() => toast.success("Caisse ouverte, fonds initial nul."))
            .catch((error: unknown) => toast.error(humanError(error)))
            .finally(() => setOuverture(false))
        }}
      >
        Ouvrir la caisse maintenant
      </Button>
    </Message>
  )
}
