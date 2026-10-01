"use client"

import { Search } from "lucide-react"
import { useMemo, useState } from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { Button } from "@workspace/ui/components/button"
import { Checkbox, Switch } from "@workspace/ui/components/choice"
import { Field, Input, SelectNative, Textarea } from "@workspace/ui/components/field"

import { debutJour, messageErreur } from "@/components/gestion/referentiels/format"
import { FenetreFormulaire, texte } from "@/components/gestion/referentiels/formulaire"

import { FAMILLES, FAMILLES_PLURIEL, gmaoApi, STATUTS_ENGIN, type DossierPlan, type FamilleEngin } from "../commun"
import { lireNombre } from "../parc/formulaires-engin"

/** Opérations de la gamme : une par ligne, lignes vides ignorées. */
export function lireOperations(valeur: string) {
  return valeur
    .split(/\r?\n/)
    .map((ligne) => ligne.replace(/^[\s•\-–]+/, "").trim())
    .filter(Boolean)
}

const sansAccents = (texteBrut: string) =>
  texteBrut
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()

/* ============================================================ Création */

export function DialogueCreationPlan({
  open,
  onOpenChange,
  onCree,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCree: (resultat: { planId: string; rattaches: number }) => void
}) {
  const formulaires = useQuery(gmaoApi.queries.formulaires, open ? {} : "skip")
  const creer = useMutation(gmaoApi.mutations.creerPlan)
  const [famille, setFamille] = useState<FamilleEngin>("locomotive")
  const [series, setSeries] = useState<Set<string>>(new Set())
  const [immobilisant, setImmobilisant] = useState(true)
  const [rattacher, setRattacher] = useState(true)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const seriesFamille = (formulaires?.series ?? [])
    .filter((serie) => serie.famille === famille)
    .map((serie) => serie.serie)
    .sort((a, b) => a.localeCompare(b, "fr", { numeric: true }))

  return (
    <FenetreFormulaire
      open={open}
      onOpenChange={(ouvert) => {
        onOpenChange(ouvert)
        if (!ouvert) setErreur(null)
      }}
      titre="Créer un plan préventif"
      description="Le plan déclenche une échéance au premier des deux seuils atteints, kilométrique ou calendaire. La marge d'alerte annonce l'échéance « proche »."
      libelleValider="Créer le plan"
      enCours={enCours}
      erreur={erreur}
      large
      onSubmit={async (donnees) => {
        setErreur(null)
        try {
          const seuilKm = lireNombre(donnees, "seuilKm", "Le seuil kilométrique")
          const seuilJours = lireNombre(donnees, "seuilJours", "Le seuil calendaire")
          if (seuilKm === undefined && seuilJours === undefined) {
            throw new Error("Indiquez un seuil kilométrique, un seuil calendaire, ou les deux.")
          }
          const alertePct = lireNombre(donnees, "alertePct", "La marge d'alerte")
          const dureeHeures = lireNombre(donnees, "dureeHeures", "La durée estimée")
          if (alertePct === undefined) throw new Error("Indiquez la marge d'alerte.")
          if (dureeHeures === undefined) throw new Error("Indiquez la durée estimée de l'intervention.")
          const operations = lireOperations(String(donnees.get("operations") ?? ""))
          if (operations.length === 0) throw new Error("Décrivez au moins une opération de la gamme.")
          setEnCours(true)
          const resultat = await creer({
            code: texte(donnees, "code") ?? "",
            libelle: texte(donnees, "libelle") ?? "",
            famille,
            series: seriesFamille.filter((serie) => series.has(serie)),
            seuilKm,
            seuilJours,
            alertePct,
            dureeHeures,
            immobilisant,
            operations,
            rattacherParc: rattacher,
          })
          onOpenChange(false)
          onCree({ planId: resultat.planId, rattaches: resultat.rattaches })
        } catch (cause) {
          setErreur(messageErreur(cause))
        } finally {
          setEnCours(false)
        }
      }}
    >
      <div className="grid gap-4 sm:grid-cols-[160px_minmax(0,1fr)]">
        <Field label="Code" hint="Ex. VL-LOC">
          <Input name="code" required maxLength={20} autoComplete="off" className="tabular uppercase" />
        </Field>
        <Field label="Libellé">
          <Input name="libelle" required maxLength={160} placeholder="Ex. Visite limitée des locomotives" />
        </Field>
      </div>
      <Field label="Famille d'engins">
        <SelectNative
          name="famille"
          value={famille}
          onChange={(event) => {
            setFamille(event.target.value as FamilleEngin)
            setSeries(new Set())
          }}
        >
          {Object.entries(FAMILLES).map(([cle, libelle]) => (
            <option key={cle} value={cle}>
              {libelle}
            </option>
          ))}
        </SelectNative>
      </Field>
      <fieldset className="grid gap-1">
        <legend className="mb-1 text-[13px] font-medium">Séries concernées</legend>
        <p className="text-[12.5px] text-ink-muted">
          Aucune case cochée : le plan s&apos;applique à toute la famille ({FAMILLES_PLURIEL[famille].toLowerCase()}).
        </p>
        {formulaires === undefined ? (
          <p role="status" className="text-small text-ink-muted">
            Chargement des séries…
          </p>
        ) : seriesFamille.length === 0 ? (
          <p className="text-small text-ink-muted">Aucune série enregistrée dans cette famille.</p>
        ) : (
          <div className="grid gap-x-4 sm:grid-cols-2">
            {seriesFamille.map((serie) => (
              <Checkbox
                key={serie}
                label={serie}
                checked={series.has(serie)}
                onCheckedChange={(valeur) =>
                  setSeries((actuelles) => {
                    const suivantes = new Set(actuelles)
                    if (valeur === true) suivantes.add(serie)
                    else suivantes.delete(serie)
                    return suivantes
                  })
                }
              />
            ))}
          </div>
        )}
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Seuil kilométrique (km)" hint="Vide : pas de seuil kilométrique">
          <Input name="seuilKm" inputMode="numeric" className="tabular" />
        </Field>
        <Field label="Seuil calendaire (jours)" hint="Vide : pas de seuil calendaire">
          <Input name="seuilJours" inputMode="numeric" className="tabular" />
        </Field>
        <Field label="Marge d'alerte (%)" hint="Entre 1 et 50 % de l'intervalle">
          <Input name="alertePct" required inputMode="numeric" className="tabular" defaultValue="10" />
        </Field>
        <Field label="Durée estimée (h)">
          <Input name="dureeHeures" required inputMode="decimal" className="tabular" />
        </Field>
      </div>
      <Switch label="L'intervention immobilise l'engin" checked={immobilisant} onCheckedChange={setImmobilisant} />
      <Field label="Gamme d'opérations" hint="Une opération par ligne, dans l'ordre d'exécution">
        <Textarea name="operations" required rows={6} maxLength={8000} />
      </Field>
      <Checkbox
        label="Rattacher dès maintenant le parc existant (dernière réalisation : aujourd'hui)"
        checked={rattacher}
        onCheckedChange={(valeur) => setRattacher(valeur === true)}
      />
    </FenetreFormulaire>
  )
}

/* ========================================================= Modification */

export function DialogueModificationPlan({
  open,
  onOpenChange,
  dossier,
  onModifie,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  dossier: DossierPlan
  onModifie: () => void
}) {
  const modifier = useMutation(gmaoApi.mutations.modifierPlan)
  const plan = dossier.plan
  const [immobilisant, setImmobilisant] = useState(plan.immobilisant)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  return (
    <FenetreFormulaire
      open={open}
      onOpenChange={(ouvert) => {
        onOpenChange(ouvert)
        if (!ouvert) setErreur(null)
      }}
      titre={`Modifier le plan ${plan.code}`}
      description="Le code et la famille ne changent pas. Les nouvelles valeurs s'appliquent aux échéances de tous les engins rattachés."
      libelleValider="Enregistrer le plan"
      enCours={enCours}
      erreur={erreur}
      large
      onSubmit={async (donnees) => {
        setErreur(null)
        try {
          const seuilKm = lireNombre(donnees, "seuilKm", "Le seuil kilométrique")
          const seuilJours = lireNombre(donnees, "seuilJours", "Le seuil calendaire")
          if (seuilKm === undefined && seuilJours === undefined) {
            throw new Error("Indiquez un seuil kilométrique, un seuil calendaire, ou les deux.")
          }
          const operations = lireOperations(String(donnees.get("operations") ?? ""))
          if (operations.length === 0) throw new Error("Décrivez au moins une opération de la gamme.")
          setEnCours(true)
          await modifier({
            planId: plan.id,
            libelle: texte(donnees, "libelle") ?? "",
            seuilKm: seuilKm ?? null,
            seuilJours: seuilJours ?? null,
            alertePct: lireNombre(donnees, "alertePct", "La marge d'alerte"),
            dureeHeures: lireNombre(donnees, "dureeHeures", "La durée estimée"),
            immobilisant,
            operations,
          })
          onOpenChange(false)
          onModifie()
        } catch (cause) {
          setErreur(messageErreur(cause))
        } finally {
          setEnCours(false)
        }
      }}
    >
      <Field label="Libellé">
        <Input name="libelle" required maxLength={160} defaultValue={plan.libelle} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Seuil kilométrique (km)" hint="Vide : supprime le seuil kilométrique">
          <Input name="seuilKm" inputMode="numeric" className="tabular" defaultValue={plan.seuilKm?.toString() ?? ""} />
        </Field>
        <Field label="Seuil calendaire (jours)" hint="Vide : supprime le seuil calendaire">
          <Input name="seuilJours" inputMode="numeric" className="tabular" defaultValue={plan.seuilJours?.toString() ?? ""} />
        </Field>
        <Field label="Marge d'alerte (%)" hint="Entre 1 et 50 %">
          <Input name="alertePct" required inputMode="numeric" className="tabular" defaultValue={String(plan.alertePct)} />
        </Field>
        <Field label="Durée estimée (h)">
          <Input name="dureeHeures" required inputMode="decimal" className="tabular" defaultValue={String(plan.dureeHeures).replace(".", ",")} />
        </Field>
      </div>
      <Switch label="L'intervention immobilise l'engin" checked={immobilisant} onCheckedChange={setImmobilisant} />
      <Field label="Gamme d'opérations" hint="Une opération par ligne">
        <Textarea name="operations" required rows={8} maxLength={8000} defaultValue={plan.operations.join("\n")} />
      </Field>
    </FenetreFormulaire>
  )
}

/* ========================================================= Rattachement */

export function DialogueRattachement({
  open,
  onOpenChange,
  dossier,
  onRattache,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  dossier: DossierPlan
  onRattache: (ajoutes: number) => void
}) {
  const formulaires = useQuery(gmaoApi.queries.formulaires, open ? {} : "skip")
  const rattacher = useMutation(gmaoApi.mutations.rattacherEngins)
  const plan = dossier.plan
  const [choisis, setChoisis] = useState<Set<string>>(new Set())
  const [recherche, setRecherche] = useState("")
  const [toutesSeries, setToutesSeries] = useState(plan.series.length === 0)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const dejaRattaches = useMemo(() => new Set(dossier.engins.map((engin) => engin.equipementId as string)), [dossier.engins])
  const candidats = (formulaires?.engins ?? []).filter(
    (engin) =>
      engin.famille === plan.famille &&
      !dejaRattaches.has(engin.id) &&
      (toutesSeries || plan.series.length === 0 || plan.series.includes(engin.serie))
  )
  const q = sansAccents(recherche.trim())
  const visibles = q ? candidats.filter((engin) => sansAccents(`${engin.numero} ${engin.serie}`).includes(q)) : candidats

  return (
    <FenetreFormulaire
      open={open}
      onOpenChange={(ouvert) => {
        onOpenChange(ouvert)
        if (!ouvert) setErreur(null)
      }}
      titre={`Rattacher des engins au plan ${plan.code}`}
      description={`Seuls les ${FAMILLES_PLURIEL[plan.famille].toLowerCase()} non réformés et pas encore suivis par ce plan sont proposés.`}
      libelleValider={`Rattacher ${choisis.size} engin(s)`}
      enCours={enCours}
      erreur={erreur}
      large
      onSubmit={async (donnees) => {
        setErreur(null)
        if (choisis.size === 0) {
          setErreur("Cochez au moins un engin.")
          return
        }
        const date = String(donnees.get("derniereRealisation") ?? "")
        const le = date ? Math.min(debutJour(date) + 12 * 3_600_000, Date.now()) : undefined
        if (le !== undefined && Number.isNaN(le)) {
          setErreur("La date de dernière réalisation est illisible.")
          return
        }
        setEnCours(true)
        try {
          const resultat = await rattacher({ planId: plan.id, equipementIds: [...choisis] as never[], derniereRealisationLe: le })
          onOpenChange(false)
          setChoisis(new Set())
          onRattache(resultat.ajoutes)
        } catch (cause) {
          setErreur(messageErreur(cause))
        } finally {
          setEnCours(false)
        }
      }}
    >
      <Field label="Dernière réalisation (facultatif)" hint="Vide : aujourd'hui. Le compteur actuel de chaque engin sert de point de départ kilométrique.">
        <Input name="derniereRealisation" type="date" className="tabular" />
      </Field>
      {plan.series.length > 0 ? (
        <Checkbox
          label={`Proposer aussi les séries hors plan (plan limité à ${plan.series.join(", ")})`}
          checked={toutesSeries}
          onCheckedChange={(valeur) => setToutesSeries(valeur === true)}
        />
      ) : null}
      <label className="flex min-h-11 items-center gap-2 rounded-md border border-line-strong bg-surface px-3 focus-within:border-accent-base focus-within:shadow-[var(--focus-ring)]">
        <Search aria-hidden className="size-4 text-ink-muted" />
        <span className="sr-only">Chercher un engin</span>
        <input
          type="search"
          value={recherche}
          onChange={(event) => setRecherche(event.target.value)}
          placeholder="Numéro ou série…"
          className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-faint"
        />
      </label>
      {formulaires === undefined ? (
        <p role="status" className="text-small text-ink-muted">
          Chargement du parc…
        </p>
      ) : candidats.length === 0 ? (
        <p className="text-small text-ink-muted">Tous les engins éligibles sont déjà rattachés à ce plan.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-muted">
            <span className="tabular">
              {choisis.size} coché(s) · {visibles.length} affiché(s)
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setChoisis((actuels) => new Set([...actuels, ...visibles.map((engin) => engin.id)]))}
            >
              Cocher les engins affichés
            </Button>
            {choisis.size > 0 ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => setChoisis(new Set())}>
                Tout décocher
              </Button>
            ) : null}
          </div>
          <div className="grid max-h-72 gap-x-4 overflow-y-auto rounded-md border border-line px-3 sm:grid-cols-2">
            {visibles.map((engin) => (
              <Checkbox
                key={engin.id}
                label={`${engin.numero} — ${engin.serie} · ${STATUTS_ENGIN[engin.statut].libelle.toLowerCase()}`}
                checked={choisis.has(engin.id)}
                onCheckedChange={(valeur) =>
                  setChoisis((actuels) => {
                    const suivants = new Set(actuels)
                    if (valeur === true) suivants.add(engin.id)
                    else suivants.delete(engin.id)
                    return suivants
                  })
                }
              />
            ))}
          </div>
        </>
      )}
    </FenetreFormulaire>
  )
}

/* ========================================================= Détachement */

export function DialogueDetachement({
  open,
  onOpenChange,
  engin,
  planCode,
  onDetache,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  engin: { planEquipementId: string; numero: string } | null
  planCode: string
  onDetache: (numero: string) => void
}) {
  const detacher = useMutation(gmaoApi.mutations.detacherEngin)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  return (
    <FenetreFormulaire
      open={open && engin !== null}
      onOpenChange={(ouvert) => {
        onOpenChange(ouvert)
        if (!ouvert) setErreur(null)
      }}
      titre={`Détacher ${engin?.numero ?? "l'engin"} du plan ${planCode}`}
      description="L'engin ne sera plus suivi par ce plan : son échéance disparaît. Refusé si un OT préventif est ouvert pour cette échéance."
      libelleValider="Détacher l'engin"
      variante="danger"
      enCours={enCours}
      erreur={erreur}
      onSubmit={async (donnees) => {
        if (!engin) return
        setErreur(null)
        const motif = texte(donnees, "motif")
        if (!motif) {
          setErreur("Le motif est obligatoire : il est inscrit au journal du plan.")
          return
        }
        setEnCours(true)
        try {
          await detacher({ planEquipementId: engin.planEquipementId as never, motif })
          onOpenChange(false)
          onDetache(engin.numero)
        } catch (cause) {
          setErreur(messageErreur(cause))
        } finally {
          setEnCours(false)
        }
      }}
    >
      <Field label="Motif" hint="Ex. engin transféré dans une série suivie par un autre plan">
        <Textarea name="motif" required maxLength={300} />
      </Field>
    </FenetreFormulaire>
  )
}
