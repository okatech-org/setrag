"use client"

import type { FunctionReturnType } from "convex/server"
import { History, Power, Save, SlidersHorizontal } from "lucide-react"
import { useState } from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { SkeletonLines } from "@workspace/ui/components/empty-state"
import { Field, Input, SelectNative } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import { Fiche, Panneau } from "@/components/charte"
import { useDroitsGestion } from "./gestion/referentiels/droits"
import { Historique, RetourOperation, useOperation } from "./gestion/referentiels/elements"
import {
  agent,
  champDate,
  CLASSES,
  coefficient,
  dateCourte,
  debutJour,
  finJour,
  JOURS_LONGS,
  libelleDesserte,
  montant,
  ORDRE_CLASSES,
  signePct,
  type ClasseService,
} from "./gestion/referentiels/format"
import { nombreSaisi, texte } from "./gestion/referentiels/formulaire"
import { TagRegle } from "./gestion/referentiels/statuts"
import { ManagementDetailShell } from "./management-detail-shell"

type LigneRegle = FunctionReturnType<typeof api.functions.referentiels.reglesYield>[number]
type Regle = Pick<LigneRegle, "type" | "threshold" | "modifierPct" | "code" | "validFrom" | "validUntil" | "floorXaf" | "capXaf" | "scope" | "serviceClass">

export const TYPES_REGLE = {
  anticipation: "Anticipation",
  remplissage: "Remplissage",
  periode: "Jour de départ",
  promotion: "Promotion",
  canal: "Canal de vente",
} as const

/** Seuil de remplissage : le moteur le lit en fraction (0,85) ; d'anciennes règles l'écrivent en pour cent. */
export const seuilRemplissagePct = (seuil: number) => (seuil <= 1 ? seuil * 100 : seuil)

/** Ce qui déclenche la règle, en une phrase. */
export function declencheur(regle: Regle) {
  const t = regle.threshold
  let phrase: string
  switch (regle.type) {
    case "anticipation":
      phrase = t === undefined ? "Anticipation (seuil manquant)" : regle.modifierPct < 0 ? `Départ dans ${t} jours ou plus` : `Départ dans moins de ${t} jours`
      break
    case "remplissage":
      phrase = t === undefined ? "Remplissage (seuil manquant)" : `${Math.round(seuilRemplissagePct(t))} % vendus ou plus`
      break
    case "periode":
      phrase = t === undefined ? "Jour de départ (manquant)" : `Départ le ${JOURS_LONGS[t] ?? "?"}`
      break
    case "promotion":
      phrase = regle.code ? `Sur présentation du code ${regle.code}` : "Promotion ouverte à tous"
      break
    case "canal":
      phrase = `Vente par le canal ${regle.code ?? "?"}`
      break
  }
  if (regle.validFrom || regle.validUntil) {
    phrase += ` · ${regle.validFrom ? `du ${dateCourte(regle.validFrom)}` : ""}${regle.validUntil ? ` au ${dateCourte(regle.validUntil)}` : ""}`
  }
  return phrase
}

export function bornes(regle: Pick<Regle, "floorXaf" | "capXaf">) {
  return `${regle.floorXaf !== undefined ? montant(regle.floorXaf) : "—"} · ${regle.capXaf !== undefined ? montant(regle.capXaf) : "—"}`
}

export function portee(regle: Pick<Regle, "scope" | "serviceClass">, desserte?: Parameters<typeof libelleDesserte>[0]) {
  const cible = regle.scope === "desserte" ? (desserte ? libelleDesserte(desserte) : "Une desserte") : regle.scope === "ligne" ? "Ligne" : "Tous les trains"
  return regle.serviceClass ? `${cible} · ${CLASSES[regle.serviceClass].court}` : cible
}

/** Champs d'une règle, communs à la création et à l'édition. */
export function ChampsRegle({ regle, label }: { regle?: Partial<Regle>; label?: string }) {
  const trips = useQuery(api.functions.administration.listYieldTripOptions, {})
  const [type, setType] = useState<keyof typeof TYPES_REGLE>(regle?.type ?? "anticipation")
  const [scope, setScope] = useState(regle?.scope ?? "reseau")
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <Field label="Nom de la règle" htmlFor="regle-label">
          <Input id="regle-label" name="label" defaultValue={label} placeholder="Forte demande vendredi" />
        </Field>
        <Field label="Code" hint="Identifiant unique." htmlFor="regle-code">
          <Input id="regle-code" name="code" defaultValue={regle?.code} placeholder="VENDREDI" required className="tabular uppercase" />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Déclencheur" htmlFor="regle-type">
          <SelectNative id="regle-type" name="type" value={type} onChange={(event) => setType(event.target.value as keyof typeof TYPES_REGLE)}>
            {(["anticipation", "remplissage", "periode", "promotion"] as const).map((t) => (
              <option key={t} value={t}>
                {TYPES_REGLE[t]}
              </option>
            ))}
            {regle?.type === "canal" ? <option value="canal">{TYPES_REGLE.canal}</option> : null}
          </SelectNative>
        </Field>
        {type === "periode" ? (
          <Field label="Jour du départ" htmlFor="regle-seuil">
            <SelectNative id="regle-seuil" name="threshold" defaultValue={regle?.threshold ?? 5}>
              {[1, 2, 3, 4, 5, 6, 0].map((j) => (
                <option key={j} value={j}>
                  {JOURS_LONGS[j]}
                </option>
              ))}
            </SelectNative>
          </Field>
        ) : type === "promotion" || type === "canal" ? (
          <p className="text-[12.5px] text-ink-muted sm:pt-7">Le code ci-dessus sert de code promotionnel, à présenter à l’achat.</p>
        ) : (
          <Field
            label={type === "remplissage" ? "Seuil de remplissage (%)" : "Seuil (jours avant départ)"}
            hint={type === "anticipation" ? "Remise : au-delà du seuil. Majoration : en deçà." : undefined}
            htmlFor="regle-seuil"
          >
            <Input
              id="regle-seuil"
              name="threshold"
              inputMode="numeric"
              defaultValue={regle?.threshold === undefined ? "" : type === "remplissage" ? seuilRemplissagePct(regle.threshold) : regle.threshold}
              required
              className="tabular"
            />
          </Field>
        )}
        <Field label="Modulation (%)" hint="−10 pour une remise, 12 pour ×1,12." htmlFor="regle-modulation">
          <Input id="regle-modulation" name="modifierPct" inputMode="decimal" defaultValue={regle?.modifierPct} required className="tabular" />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Portée" htmlFor="regle-portee">
          <SelectNative id="regle-portee" name="scope" value={scope} onChange={(event) => setScope(event.target.value as typeof scope)}>
            <option value="reseau">Tous les trains</option>
            <option value="desserte">Une desserte</option>
            {regle?.scope === "ligne" ? <option value="ligne">Ligne</option> : null}
          </SelectNative>
        </Field>
        {scope === "desserte" ? (
          <Field label="Desserte" htmlFor="regle-desserte" className="sm:col-span-2">
            <SelectNative id="regle-desserte" name="tripId" defaultValue={(regle as { tripId?: string } | undefined)?.tripId ?? ""} required>
              <option value="">Choisir une desserte</option>
              {trips?.map((trip) => (
                <option key={trip.id} value={trip.id}>
                  {trip.label}
                </option>
              ))}
            </SelectNative>
          </Field>
        ) : null}
        <Field label="Classe" htmlFor="regle-classe">
          <SelectNative id="regle-classe" name="serviceClass" defaultValue={regle?.serviceClass ?? ""}>
            <option value="">Toutes les classes</option>
            {ORDRE_CLASSES.map((c) => (
              <option key={c} value={c}>
                {CLASSES[c].long}
              </option>
            ))}
          </SelectNative>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="Priorité" hint="Plus petit : évalué d'abord." htmlFor="regle-priorite">
          <Input id="regle-priorite" name="priority" inputMode="numeric" defaultValue={(regle as { priority?: number } | undefined)?.priority ?? 50} required className="tabular" />
        </Field>
        <Field label="Plancher (XAF)" htmlFor="regle-plancher">
          <Input id="regle-plancher" name="floorXaf" inputMode="numeric" defaultValue={regle?.floorXaf} className="tabular" />
        </Field>
        <Field label="Plafond (XAF)" htmlFor="regle-plafond">
          <Input id="regle-plafond" name="capXaf" inputMode="numeric" defaultValue={regle?.capXaf} className="tabular" />
        </Field>
        <div />
        <Field label="Effet à partir du" htmlFor="regle-debut">
          <Input id="regle-debut" name="validFrom" type="date" defaultValue={champDate(regle?.validFrom)} />
        </Field>
        <Field label="Jusqu'au" htmlFor="regle-fin">
          <Input id="regle-fin" name="validUntil" type="date" defaultValue={champDate(regle?.validUntil)} />
        </Field>
      </div>
      <p className="text-[12.5px] text-ink-muted">
        Les modulations des règles qui s’appliquent s’additionnent ; le cumul est ensuite borné par le plancher et le plafond de la règle active la plus prioritaire, puis arrondi au pas réglementaire.
      </p>
    </>
  )
}

/** Valeurs d'un formulaire de règle, prêtes pour le serveur. */
export function lireRegle(donnees: FormData) {
  const type = String(donnees.get("type")) as keyof typeof TYPES_REGLE
  const seuil = nombreSaisi(donnees, "threshold")
  const debut = texte(donnees, "validFrom")
  const fin = texte(donnees, "validUntil")
  const classe = texte(donnees, "serviceClass")
  const scope = String(donnees.get("scope")) as "reseau" | "ligne" | "desserte"
  return {
    label: texte(donnees, "label") ?? "",
    code: String(donnees.get("code") ?? ""),
    type,
    threshold: seuil === undefined ? undefined : type === "remplissage" ? seuil / 100 : seuil,
    modifierPct: nombreSaisi(donnees, "modifierPct") ?? Number.NaN,
    priority: nombreSaisi(donnees, "priority") ?? 50,
    scope,
    tripId: scope === "desserte" ? (texte(donnees, "tripId") as never) : undefined,
    serviceClass: classe as ClasseService | undefined,
    validFrom: debut ? debutJour(debut) : undefined,
    validUntil: fin ? finJour(fin) : undefined,
    floorXaf: nombreSaisi(donnees, "floorXaf"),
    capXaf: nombreSaisi(donnees, "capXaf"),
  }
}

type DossierRegle = NonNullable<FunctionReturnType<typeof api.functions.referentiels.regleYield>>

export function PricingRuleDetail({ ruleId }: { ruleId: string }) {
  const droits = useDroitsGestion()
  const dossier = useQuery(api.functions.referentiels.regleYield, { ruleId: ruleId as never })
  const modifier = useMutation(api.functions.administration.updatePricingRule)
  const basculer = useMutation(api.functions.administration.setPricingRuleStatus)
  const operation = useOperation()

  if (dossier === undefined || dossier === null) {
    return (
      <ManagementDetailShell title={dossier === null ? "Règle introuvable" : "Règle de yield"} eyebrow="Commercial · yield" backHref="/gestion/yield" verrouillage="aucun">
        {dossier === null ? <InlineMessage tone="danger" title="Cette règle n'existe plus." /> : <SkeletonLines />}
      </ManagementDetailShell>
    )
  }
  const { rule } = dossier as DossierRegle
  const peutModifier = droits.may("yield", "modifier")
  const peutBasculer = rule.isActive ? droits.may("yield", "supprimer") : peutModifier

  return (
    <ManagementDetailShell
      title={rule.label ?? rule.code ?? TYPES_REGLE[rule.type]}
      eyebrow={`Commercial · yield · ${rule.code ?? ""}`}
      backHref="/gestion/yield"
      verrouillage="aucun"
      lectureSeule={!droits.chargement && !peutModifier}
      description={declencheur(rule)}
      actions={
        peutBasculer ? (
          <Button
            type="button"
            variant="secondary"
            loading={operation.enCours === "etat"}
            onClick={() => void operation.executer("etat", () => basculer({ ruleId: rule._id, isActive: !rule.isActive }), rule.isActive ? "Règle suspendue : elle ne s'applique plus à la vente." : "Règle réactivée : elle s'applique dès maintenant.")}
          >
            <Power />
            {rule.isActive ? "Suspendre" : "Réactiver"}
          </Button>
        ) : null
      }
    >
      <div className="flex flex-wrap gap-2">
        <TagRegle etat={dossier.etat} />
      </div>
      <RetourOperation retour={operation.retour} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(300px,0.7fr)]">
        <Panneau titre="Paramètres" icone={SlidersHorizontal}>
          {peutModifier ? (
            <form
              className="grid gap-4"
              onSubmit={async (event) => {
                event.preventDefault()
                const valeurs = lireRegle(new FormData(event.currentTarget))
                await operation.executer("enregistrer", () => modifier({ ruleId: rule._id, ...valeurs }), "Règle enregistrée : le prix de vente en tient compte dès maintenant.")
              }}
            >
              <ChampsRegle regle={rule} label={rule.label} />
              <div>
                <Button type="submit" loading={operation.enCours === "enregistrer"} loadingLabel="Enregistrement…">
                  <Save />
                  Enregistrer la règle
                </Button>
              </div>
            </form>
          ) : (
            <Fiche
              elements={[
                ["Déclencheur", declencheur(rule)],
                ["Modulation", `${signePct(rule.modifierPct)} (${coefficient(rule.modifierPct)})`],
                ["Plancher · plafond", bornes(rule)],
                ["Portée", portee(rule, dossier.desserte)],
                ["Priorité", rule.priority],
              ]}
            />
          )}
        </Panneau>
        <div className="grid content-start gap-4">
          <Panneau titre="Résumé" icone={SlidersHorizontal}>
            <Fiche
              elements={[
                ["Coefficient", <span key="c" className="tabular">{coefficient(rule.modifierPct)}</span>],
                ["Portée", portee(rule, dossier.desserte)],
                ["Plancher · plafond (XAF)", <span key="b" className="tabular">{bornes(rule)}</span>],
                ["Créée par", agent(dossier.creePar)],
              ]}
            />
          </Panneau>
          <Panneau titre="Historique" icone={History}>
            <Historique historique={dossier.historique} />
          </Panneau>
        </div>
      </div>
    </ManagementDetailShell>
  )
}
