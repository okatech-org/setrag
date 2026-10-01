"use client"

import type { FunctionReturnType } from "convex/server"
import { Armchair, CalendarDays, Layers, Lock, LockOpen, Plus, Store, Ticket, TrainFront } from "lucide-react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useMemo, useState, type CSSProperties } from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { EmptyState, SkeletonLines } from "@workspace/ui/components/empty-state"
import { Field, Input, SelectNative, Textarea } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { cn } from "@workspace/ui/lib/utils"

import { CelluleDouble, Indicateur, Indicateurs, Panneau, TableauDonnees, type ColonneTableau } from "@/components/charte"

import { CadreGestion, mentionLectureSeule } from "./cadre"
import { useDroitsGestion } from "./droits"
import { DateFiltre, Puces, RetourOperation, SelectFiltre, useOperation } from "./elements"
import {
  agent,
  aujourdhuiService,
  CLASSES,
  dateHeure,
  dateService,
  libelleDesserte,
  MOTIFS_BLOCAGE,
  nombre,
  ORDRE_CLASSES,
  type ClasseService,
} from "./format"
import { FenetreFormulaire, nombreSaisi } from "./formulaire"
import { Pastille, TagBlocage } from "./statuts"

type Occupation = NonNullable<FunctionReturnType<typeof api.functions.referentiels.occupation>>
type Blocage = Occupation["blocages"][number]
type Quota = Occupation["quotas"][number]
type EtatPlace = Occupation["voitures"][number]["places"][number]["etat"]

/** Motif hachuré des places bloquées : la forme dit l'état autant que la teinte. */
const HACHURES: CSSProperties = {
  backgroundImage: "repeating-linear-gradient(135deg, var(--c-warning-soft) 0 3px, var(--c-warning) 3px 4px)",
}

const CASES: Record<EtatPlace, { classe: string; style?: CSSProperties; libelle: string }> = {
  vendue: { classe: "border-accent-line bg-accent-line", libelle: "Vendue" },
  tenue: { classe: "border-accent-line bg-accent-soft", libelle: "Tenue (paiement en cours)" },
  bloquee: { classe: "border-warning", style: HACHURES, libelle: "Bloquée (hachures)" },
  quota: { classe: "border-second bg-second-soft", libelle: "Quota agence" },
  libre: { classe: "border-line bg-surface-sunk", libelle: "Libre" },
}

export function LegendePlaces() {
  return (
    <p className="flex flex-wrap gap-x-4 gap-y-2 text-[13px] text-ink-muted">
      {(Object.keys(CASES) as EtatPlace[]).map((etat) => (
        <span key={etat} className="inline-flex items-center gap-2">
          <i aria-hidden className={cn("size-3.5 rounded-[2px] border", CASES[etat].classe)} style={CASES[etat].style} />
          {CASES[etat].libelle}
        </span>
      ))}
    </p>
  )
}

/** Occupation d'une desserte : une ligne de cases par voiture, les chiffres écrits à côté. */
export function OccupationVoitures({ voitures }: { voitures: Occupation["voitures"] }) {
  return (
    <div className="grid gap-2.5">
      {voitures.map((voiture) => {
        const compte = (etat: EtatPlace) => voiture.places.filter((p) => p.etat === etat).length
        const total = voiture.places.length
        const resume = `${compte("vendue")} vendues, ${compte("libre")} libres, ${compte("bloquee")} bloquées, ${compte("quota")} en quota, ${compte("tenue")} tenues, sur ${total}`
        return (
          <div key={voiture.id} className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-x-3 gap-y-1 text-[13.5px] sm:grid-cols-[110px_minmax(0,1fr)_110px]">
            <span>
              <b className="font-bold">{voiture.label}</b>
              <small className="block text-[12px] text-ink-muted">{CLASSES[voiture.serviceClass].long}</small>
            </span>
            <div aria-hidden className="grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${Math.min(32, Math.max(total, 1))}, minmax(0, 1fr))` }}>
              {voiture.places.map((place) => (
                <i key={place.id} title={`${voiture.label} · ${place.label} : ${CASES[place.etat].libelle}`} className={cn("h-3.5 rounded-[2px] border", CASES[place.etat].classe)} style={CASES[place.etat].style} />
              ))}
            </div>
            <span className="tabular col-span-2 text-[13px] font-semibold sm:col-span-1 sm:text-right">
              {compte("vendue")} / {total}
              <span className="sr-only"> — {resume}</span>
            </span>
          </div>
        )
      })}
    </div>
  )
}

/* ============================================================ Dialogues */

function DialogueBlocage({ occupation, open, onOpenChange }: { occupation: Occupation; open: boolean; onOpenChange: (open: boolean) => void }) {
  const bloquer = useMutation(api.functions.referentiels.bloquerPlaces)
  const operation = useOperation()
  const [choisies, setChoisies] = useState<Set<string>>(new Set())
  const [classe, setClasse] = useState<"toutes" | ClasseService>("toutes")
  const arrets = occupation.arrets
  const basculer = (id: string) =>
    setChoisies((ensemble) => {
      const suivant = new Set(ensemble)
      if (suivant.has(id)) suivant.delete(id)
      else suivant.add(id)
      return suivant
    })
  return (
    <FenetreFormulaire
      open={open}
      onOpenChange={onOpenChange}
      large
      titre="Bloquer des places"
      description="Bloquer une place la retire de tous les canaux, entre les deux gares choisies. Un motif écrit est exigé ; le blocage reste au journal."
      libelleValider={
        <>
          <Lock />
          Bloquer {choisies.size > 0 ? `${choisies.size} place${choisies.size > 1 ? "s" : ""}` : "les places"}
        </>
      }
      enCours={operation.enCours === "bloquer"}
      erreur={operation.retour?.ton === "danger" ? operation.retour.detail : null}
      onSubmit={async (donnees) => {
        if (choisies.size === 0) {
          operation.signaler({ ton: "danger", titre: "Aucune place", detail: "Cochez au moins une place libre." })
          return
        }
        const ok = await operation.executer("bloquer", () =>
          bloquer({
            tripId: occupation.desserte!.id,
            seatIds: [...choisies] as never,
            fromStopIndex: Number(donnees.get("depuis")),
            toStopIndex: Number(donnees.get("jusqua")),
            reason: String(donnees.get("motif")) as keyof typeof MOTIFS_BLOCAGE,
            comment: String(donnees.get("commentaire") ?? ""),
          })
        )
        if (ok) {
          setChoisies(new Set())
          onOpenChange(false)
        }
      }}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="De la gare" htmlFor="blocage-depuis">
          <SelectNative id="blocage-depuis" name="depuis" defaultValue="0">
            {arrets.slice(0, -1).map((arret) => (
              <option key={arret.sequence} value={arret.sequence}>
                {arret.station?.name ?? "?"}
              </option>
            ))}
          </SelectNative>
        </Field>
        <Field label="Jusqu'à la gare" htmlFor="blocage-jusqua">
          <SelectNative id="blocage-jusqua" name="jusqua" defaultValue={String(arrets.length - 1)}>
            {arrets.slice(1).map((arret) => (
              <option key={arret.sequence} value={arret.sequence}>
                {arret.station?.name ?? "?"}
              </option>
            ))}
          </SelectNative>
        </Field>
        <Field label="Motif" htmlFor="blocage-motif">
          <SelectNative id="blocage-motif" name="motif" defaultValue="exploitation">
            {Object.entries(MOTIFS_BLOCAGE).map(([valeur, libelle]) => (
              <option key={valeur} value={valeur}>
                {libelle}
              </option>
            ))}
          </SelectNative>
        </Field>
      </div>
      <Field label="Motif détaillé" hint="Cause, demandeur et condition de remise en vente." htmlFor="blocage-commentaire">
        <Textarea id="blocage-commentaire" name="commentaire" required minLength={3} placeholder="Réservation protocole — délégation du ministère des Transports" />
      </Field>
      <fieldset className="grid gap-2">
        <legend className="text-[13px] font-medium">Places libres à bloquer</legend>
        <Puces
          libelle="Classe"
          valeur={classe}
          onChange={setClasse}
          options={[{ cle: "toutes", libelle: "Toutes classes" }, ...ORDRE_CLASSES.map((c) => ({ cle: c, libelle: CLASSES[c].court }))]}
        />
        <div className="grid max-h-[40dvh] gap-3 overflow-y-auto rounded-md border border-line p-3">
          {occupation.voitures
            .filter((v) => classe === "toutes" || v.serviceClass === classe)
            .map((voiture) => {
              const libres = voiture.places.filter((p) => p.etat === "libre")
              return (
                <div key={voiture.id} className="grid gap-1">
                  <b className="text-[13px] font-semibold">
                    {voiture.label} · {CLASSES[voiture.serviceClass].long} <span className="font-normal text-ink-muted">({libres.length} libres)</span>
                  </b>
                  <div className="flex flex-wrap gap-1">
                    {libres.map((place) => {
                      const actif = choisies.has(place.id)
                      return (
                        <button
                          key={place.id}
                          type="button"
                          aria-pressed={actif}
                          onClick={() => basculer(place.id)}
                          className={cn(
                            "tabular grid min-h-11 min-w-11 place-items-center rounded-md border px-1.5 text-[12.5px] font-semibold",
                            actif ? "border-warning-ink text-warning-ink" : "border-line bg-surface hover:bg-surface-sunk"
                          )}
                          style={actif ? HACHURES : undefined}
                        >
                          <span className={cn(actif && "rounded-[4px] bg-surface px-1")}>{place.label}</span>
                        </button>
                      )
                    })}
                    {libres.length === 0 ? <span className="text-[12.5px] text-ink-muted">Aucune place libre.</span> : null}
                  </div>
                </div>
              )
            })}
        </div>
      </fieldset>
    </FenetreFormulaire>
  )
}

function DialogueQuota({ occupation, open, onOpenChange }: { occupation: Occupation; open: boolean; onOpenChange: (open: boolean) => void }) {
  const creer = useMutation(api.functions.referentiels.creerQuotaAgence)
  const operation = useOperation()
  const classes = ORDRE_CLASSES.filter((c) => occupation.voitures.some((v) => v.serviceClass === c))
  return (
    <FenetreFormulaire
      open={open}
      onOpenChange={onOpenChange}
      titre="Attribuer un quota à une agence"
      description="Les places sortent de la vente générale sur tout le parcours. À l'échéance, celles qui restent y reviennent d'elles-mêmes."
      libelleValider={
        <>
          <Store />
          Attribuer le quota
        </>
      }
      enCours={operation.enCours === "quota"}
      erreur={operation.retour?.ton === "danger" ? operation.retour.detail : null}
      onSubmit={async (donnees) => {
        const echeance = String(donnees.get("echeance") ?? "")
        const ok = await operation.executer("quota", () =>
          creer({
            tripId: occupation.desserte!.id,
            pointOfSaleId: String(donnees.get("agence")) as never,
            serviceClass: String(donnees.get("classe")) as ClasseService,
            allocated: nombreSaisi(donnees, "places") ?? 0,
            releaseAt: echeance ? Date.parse(`${echeance}:00+01:00`) : undefined,
          })
        )
        if (ok) onOpenChange(false)
      }}
    >
      {occupation.agences.length === 0 ? (
        <InlineMessage tone="warning" title="Aucune agence accréditée active." />
      ) : (
        <Field label="Agence" htmlFor="quota-agence">
          <SelectNative id="quota-agence" name="agence" required>
            {occupation.agences.map((agence) => (
              <option key={agence.id} value={agence.id}>
                {agence.code} · {agence.name}
              </option>
            ))}
          </SelectNative>
        </Field>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Classe" htmlFor="quota-classe">
          <SelectNative id="quota-classe" name="classe">
            {classes.map((c) => (
              <option key={c} value={c}>
                {CLASSES[c].long} · {occupation.disponiblesParClasse[c] ?? 0} disponibles
              </option>
            ))}
          </SelectNative>
        </Field>
        <Field label="Nombre de places" htmlFor="quota-places">
          <Input id="quota-places" name="places" type="number" min="1" max="200" required inputMode="numeric" className="tabular" />
        </Field>
      </div>
      <Field label="Libération des places non vendues" hint="Facultatif. Avant le départ ; au-delà, retour à la vente générale." htmlFor="quota-echeance">
        <Input id="quota-echeance" name="echeance" type="datetime-local" className="tabular" />
      </Field>
    </FenetreFormulaire>
  )
}

function DialogueLiberation({
  titre,
  description,
  libelle,
  open,
  onOpenChange,
  onValider,
  enCours,
  erreur,
}: {
  titre: string
  description: string
  libelle: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onValider: (note: string) => void
  enCours: boolean
  erreur?: string | null
}) {
  return (
    <FenetreFormulaire
      open={open}
      onOpenChange={onOpenChange}
      titre={titre}
      description={description}
      libelleValider={
        <>
          <LockOpen />
          {libelle}
        </>
      }
      enCours={enCours}
      erreur={erreur}
      onSubmit={(donnees) => onValider(String(donnees.get("note") ?? ""))}
    >
      <Field label="Note obligatoire" htmlFor="liberation-note">
        <Textarea id="liberation-note" name="note" required minLength={3} placeholder="Siège réparé et contrôlé par l'atelier d'Owendo." />
      </Field>
    </FenetreFormulaire>
  )
}

/* ================================================================ Écran */

export function PlacesQuotas({ ouvrirBlocage = false }: { ouvrirBlocage?: boolean }) {
  const router = useRouter()
  const chemin = usePathname()
  const parametres = useSearchParams()
  const droits = useDroitsGestion()
  const [date, setDate] = useState(parametres.get("date") ?? aujourdhuiService(1))
  const [tripId, setTripId] = useState<string>(parametres.get("desserte") ?? "")
  const [classe, setClasse] = useState<"toutes" | ClasseService>("toutes")
  const [dialogue, setDialogue] = useState<"blocage" | "quota" | null>(ouvrirBlocage ? "blocage" : null)
  const [liberation, setLiberation] = useState<{ type: "blocage"; id: string; libelle: string } | { type: "quota"; id: string; libelle: string } | null>(null)
  const peutVoir = droits.may("places")
  const dessertes = useQuery(api.functions.referentiels.dessertes, peutVoir ? { serviceDate: date, pour: "places" } : "skip")
  const choisie = tripId && dessertes?.some((d) => d.id === tripId) ? tripId : (dessertes?.[0]?.id ?? "")
  const occupation = useQuery(api.functions.referentiels.occupation, peutVoir && choisie ? { tripId: choisie as never } : "skip")
  const liberer = useMutation(api.functions.management.releaseSeatBlock)
  const annulerQuota = useMutation(api.functions.referentiels.annulerQuotaAgence)
  const operation = useOperation()

  const voitures = useMemo(
    () => (occupation?.voitures ?? []).filter((v) => classe === "toutes" || v.serviceClass === classe),
    [occupation, classe]
  )
  const totaux = useMemo(() => {
    const t = { vendue: 0, tenue: 0, bloquee: 0, quota: 0, libre: 0, capacite: 0 }
    for (const v of voitures) for (const p of v.places) {
      t[p.etat] += 1
      t.capacite += 1
    }
    return t
  }, [voitures])

  const choisirDesserte = (id: string) => {
    setTripId(id)
    router.replace(`${chemin}?date=${date}&desserte=${id}` as never, { scroll: false })
  }
  const peutBloquer = droits.may("places", "creer") && Boolean(occupation?.desserte?.isOpenForSale)
  const peutQuota = droits.may("quotas_agences", "creer") && Boolean(occupation?.desserte?.isOpenForSale)
  const prochaineLiberation = occupation?.quotas
    .filter((q) => q.isActive && q.releaseAt)
    .sort((a, b) => (a.releaseAt ?? 0) - (b.releaseAt ?? 0))[0]

  const colonnesBlocages: ColonneTableau<Blocage>[] = [
    { cle: "place", libelle: "Places", rendu: (b) => <span className="tabular">{b.place}</span>, tri: (b) => b.place },
    { cle: "motif", libelle: "Motif", rendu: (b) => <CelluleDouble haut={MOTIFS_BLOCAGE[b.reason]} bas={b.comment?.split("\n")[0]} />, tri: (b) => MOTIFS_BLOCAGE[b.reason], export: (b) => `${MOTIFS_BLOCAGE[b.reason]} — ${b.comment ?? ""}` },
    { cle: "portion", libelle: "Portion", rendu: (b) => b.portion, tri: (b) => b.portion, secondaire: true },
    { cle: "par", libelle: "Par", rendu: (b) => <CelluleDouble haut={agent(b.creePar)} bas={<span className="tabular">{dateHeure(b.creeLe)}</span>} />, tri: (b) => b.creeLe, export: (b) => `${agent(b.creePar)} · ${dateHeure(b.creeLe)}` },
    {
      cle: "etat",
      libelle: "État",
      rendu: (b) => (
        <span className="flex flex-wrap items-center gap-2">
          <TagBlocage actif={b.isActive} />
          {!b.isActive && b.liberePar ? <small className="text-[12px] text-ink-muted">{agent(b.liberePar)} · <span className="tabular">{dateHeure(b.libereLe)}</span></small> : null}
          {b.isActive && droits.may("places", "modifier") ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={(event) => {
                event.stopPropagation()
                setLiberation({ type: "blocage", id: b.id, libelle: b.place })
              }}
            >
              <LockOpen />
              Débloquer
            </Button>
          ) : null}
        </span>
      ),
      tri: (b) => (b.isActive ? 0 : 1),
      export: (b) => (b.isActive ? "Bloquée" : `Libérée · ${agent(b.liberePar)} · ${dateHeure(b.libereLe)}`),
    },
  ]

  const colonnesQuotas: ColonneTableau<Quota>[] = [
    { cle: "agence", libelle: "Agence", rendu: (q) => <CelluleDouble haut={q.pointOfSale?.name ?? "Agence supprimée"} bas={<span className="tabular">{q.pointOfSale?.code}</span>} />, tri: (q) => q.pointOfSale?.name },
    { cle: "classe", libelle: "Classe", rendu: (q) => CLASSES[q.serviceClass].court, tri: (q) => q.serviceClass },
    { cle: "quota", libelle: "Quota", rendu: (q) => q.allocated, tri: (q) => q.allocated, numerique: true },
    { cle: "vendues", libelle: "Vendues", rendu: (q) => q.sold, tri: (q) => q.sold, numerique: true },
    { cle: "liberation", libelle: "Libération", rendu: (q) => <span className="tabular">{q.releaseAt ? dateHeure(q.releaseAt) : "Au départ"}</span>, tri: (q) => q.releaseAt ?? 0, secondaire: true },
    {
      cle: "etat",
      libelle: "État",
      rendu: (q) => (
        <span className="flex flex-wrap items-center gap-2">
          {q.isActive ? (
            q.sold >= q.allocated ? <Pastille ton="success">Épuisé</Pastille> : <Pastille ton="second" icone={Store}>En cours</Pastille>
          ) : (
            <Pastille ton="neutral">Levé · {agent(q.annulePar, "échéance")}</Pastille>
          )}
          {q.isActive && droits.may("quotas_agences", "supprimer") ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setLiberation({ type: "quota", id: q.id, libelle: q.pointOfSale?.code ?? "quota" })}>
              Lever
            </Button>
          ) : null}
        </span>
      ),
      tri: (q) => (q.isActive ? 0 : 1),
      export: (q) => (q.isActive ? "En cours" : `Levé · ${agent(q.annulePar, "échéance")} · ${dateHeure(q.annuleLe)}`),
    },
  ]

  return (
    <CadreGestion
      surtitre="Exploitation · inventaire"
      titre="Places et quotas"
      description="Bloquer une place la retire de tous les canaux, avec un motif. Un quota réserve des places à une agence jusqu'à une date ; au-delà, elles reviennent à la vente générale."
      lectureSeule={!droits.chargement && !droits.may("places", "creer") ? mentionLectureSeule(droits.role, "l'inventaire") : undefined}
    >
      <div className="flex flex-wrap items-center gap-2">
        <DateFiltre libelle="Date de circulation" icone={CalendarDays} value={date} onChange={setDate} />
        <SelectFiltre libelle="Desserte" icone={TrainFront} value={choisie} onChange={choisirDesserte} className="min-w-[240px] flex-1 sm:flex-none">
          {dessertes?.length === 0 ? <option value="">Aucune desserte ce jour</option> : null}
          {dessertes?.map((d) => (
            <option key={d.id} value={d.id}>
              {libelleDesserte(d)}
            </option>
          ))}
        </SelectFiltre>
        <Puces libelle="Classe" valeur={classe} onChange={setClasse} options={[{ cle: "toutes", libelle: "Toutes classes" }, ...ORDRE_CLASSES.map((c) => ({ cle: c, libelle: CLASSES[c].court }))]} />
        <div className="ml-auto flex flex-wrap gap-2">
          {peutQuota ? (
            <Button type="button" variant="secondary" onClick={() => setDialogue("quota")}>
              <Plus />
              Attribuer un quota
            </Button>
          ) : null}
          {peutBloquer ? (
            <Button type="button" onClick={() => setDialogue("blocage")}>
              <Lock />
              Bloquer des places
            </Button>
          ) : null}
        </div>
      </div>

      <RetourOperation retour={operation.retour} />

      {dessertes !== undefined && dessertes.length === 0 ? (
        <div className="rounded-md border border-line bg-surface">
          <EmptyState title={`Aucune desserte le ${dateService(date)}`} description="Choisissez une autre date : les dessertes naissent de l'activation d'un livret." />
        </div>
      ) : occupation === undefined ? (
        <SkeletonLines />
      ) : occupation === null ? (
        <InlineMessage tone="warning" title="Cette desserte n'existe plus." />
      ) : (
        <>
          {!occupation.desserte?.isOpenForSale ? (
            <InlineMessage tone="info" title="Desserte fermée à la vente.">
              Blocages et quotas ne s’appliquent qu’aux dessertes ouvertes ; l’historique reste consultable.
            </InlineMessage>
          ) : null}
          <Indicateurs>
            <Indicateur libelle="Vendues" icone={Ticket} valeur={nombre(totaux.vendue)} unite={`/ ${nombre(totaux.capacite)}`} remplissage={totaux.capacite ? totaux.vendue / totaux.capacite : 0} />
            <Indicateur libelle="Libres" icone={Armchair} valeur={nombre(totaux.libre)} evolution={totaux.tenue ? { sens: "neutre", texte: `${totaux.tenue} tenue(s) en paiement` } : undefined} />
            <Indicateur libelle="Bloquées" icone={Lock} valeur={nombre(totaux.bloquee)} evolution={{ sens: "neutre", texte: `${new Set(occupation.blocages.filter((b) => b.isActive).map((b) => b.reason)).size} motif(s)` }} />
            <Indicateur
              libelle="En quota agence"
              icone={Store}
              valeur={nombre(totaux.quota)}
              evolution={{ sens: "neutre", texte: prochaineLiberation ? `libérées le ${dateHeure(prochaineLiberation.releaseAt)}` : "libérées au départ" }}
            />
          </Indicateurs>
          <Panneau titre="Occupation par voiture" icone={Layers} sousTitre={occupation.desserte ? `${libelleDesserte(occupation.desserte)} · ${dateService(occupation.desserte.serviceDate)}` : undefined}>
            {voitures.length === 0 ? <p className="text-small text-ink-muted">Aucune voiture de cette classe.</p> : <OccupationVoitures voitures={voitures} />}
            <LegendePlaces />
            <p className="text-[12.5px] text-ink-muted">Un quota réserve un nombre de places d’une classe, pas des sièges désignés : il est figuré sur les dernières places libres de la classe.</p>
          </Panneau>
          <div className="grid gap-5 2xl:grid-cols-2">
            <Panneau titre="Blocages" icone={Lock} plein sousTitre="qui, quand, pourquoi">
              <div className="p-3">
                <TableauDonnees
                  libelle="Blocages de la desserte"
                  colonnes={colonnesBlocages}
                  lignes={occupation.blocages}
                  cle={(b) => b.id}
                  lien={(b) => `/gestion/places/${b.id}`}
                  exportNom={`blocages-${occupation.desserte?.trainNumber ?? "desserte"}`}
                  parPage={10}
                  vide={{ titre: "Aucun blocage", description: "Toutes les places de cette desserte sont ouvertes à la vente." }}
                />
              </div>
            </Panneau>
            <Panneau titre="Quotas des agences" icone={Store} plein>
              <div className="p-3">
                <TableauDonnees
                  libelle="Quotas des agences"
                  colonnes={colonnesQuotas}
                  lignes={occupation.quotas}
                  cle={(q) => q.id}
                  exportNom={`quotas-${occupation.desserte?.trainNumber ?? "desserte"}`}
                  parPage={10}
                  vide={{ titre: "Aucun quota", description: "Aucune agence n'a de places réservées sur cette desserte." }}
                />
              </div>
            </Panneau>
          </div>
          {dialogue === "blocage" && occupation.desserte ? <DialogueBlocage occupation={occupation} open onOpenChange={(o) => !o && setDialogue(null)} /> : null}
          {dialogue === "quota" && occupation.desserte ? <DialogueQuota occupation={occupation} open onOpenChange={(o) => !o && setDialogue(null)} /> : null}
        </>
      )}
      {liberation ? (
        <DialogueLiberation
          open
          onOpenChange={(o) => !o && setLiberation(null)}
          titre={liberation.type === "blocage" ? `Débloquer ${liberation.libelle}` : `Lever le quota ${liberation.libelle}`}
          description={
            liberation.type === "blocage"
              ? "La place revient à la vente sur la portion bloquée. Ventes et réservations ne sont pas touchées."
              : "Les places non vendues du quota reviennent aussitôt à la vente générale."
          }
          libelle={liberation.type === "blocage" ? "Débloquer" : "Lever le quota"}
          enCours={operation.enCours === "liberer"}
          erreur={operation.retour?.ton === "danger" ? operation.retour.detail : null}
          onValider={async (note) => {
            const ok = await operation.executer(
              "liberer",
              () =>
                liberation.type === "blocage"
                  ? liberer({ blockId: liberation.id as never, note }).then(() => true)
                  : annulerQuota({ quotaId: liberation.id as never, motif: note }).then(() => true),
              liberation.type === "blocage" ? `${liberation.libelle} : place rendue à la vente.` : "Quota levé : places rendues à la vente générale."
            )
            if (ok !== undefined) setLiberation(null)
          }}
        />
      ) : null}
    </CadreGestion>
  )
}
