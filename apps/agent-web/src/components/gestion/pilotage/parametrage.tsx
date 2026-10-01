"use client"

import { CalendarClock, Check, Eye, History, Plus, Printer, Receipt, RotateCcw, ShieldCheck, Trash2, X } from "lucide-react"
import type { FunctionReturnType } from "convex/server"
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { Switch } from "@workspace/ui/components/choice"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { SkeletonLines } from "@workspace/ui/components/empty-state"
import { Field, Input, SelectNative } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { Tag } from "@workspace/ui/components/tag"
import { cn } from "@workspace/ui/lib/utils"

import { Chronologie, EnTetePage, Panneau } from "@/components/charte"

import { CadrePilotage, messageLectureSeule, usePilotage } from "./cadre"
import { DialogueMotif, useExecution } from "./elements"
import { dateNumerique, horodatage, jourDeService } from "./format"

type Vue = FunctionReturnType<typeof api.functions.pilotage.parametres>
export type Parametres = Vue["courant"]
type Champ = keyof Parametres

/** Libellé et unité de chaque paramètre, pour les écrans et l’historique. */
export const LIBELLES_PARAMETRES: Record<Champ, { libelle: string; unite?: string }> = {
  vatPct: { libelle: "TVA", unite: "%" },
  cssPct: { libelle: "CSS", unite: "%" },
  seatHoldMinutes: { libelle: "Tenue d’une place", unite: "min" },
  saleOpeningDays: { libelle: "Ouverture de la vente", unite: "jours" },
  mobilePaymentAttempts: { libelle: "Tentatives de paiement mobile" },
  degradedSalesEnabled: { libelle: "Vente en mode dégradé" },
  cashVarianceNotificationsEnabled: { libelle: "Alerte d’écart de caisse" },
  refundPenaltyEarlyPct: { libelle: "Pénalité avant le seuil", unite: "%" },
  refundPenaltyLatePct: { libelle: "Pénalité après le seuil", unite: "%" },
  refundThresholdHours: { libelle: "Seuil de remboursement", unite: "h" },
  refundAfterDepartureAllowed: { libelle: "Remboursement après le départ" },
  refundReasons: { libelle: "Motifs de remboursement" },
  ssoEnabled: { libelle: "Connexion par l’annuaire Eramet" },
  mfaRequired: { libelle: "Second facteur obligatoire" },
  otpFallbackEnabled: { libelle: "Code à usage unique en secours" },
  sessionIdleMinutes: { libelle: "Session inactive", unite: "min" },
  ticketPrintFormat: { libelle: "Format du billet de guichet" },
  duplicateMention: { libelle: "Mention sur duplicata" },
  ticketFooter: { libelle: "Pied de billet" },
}

const CHAMPS_SECURITE: readonly Champ[] = ["ssoEnabled", "mfaRequired", "otpFallbackEnabled", "sessionIdleMinutes"]

/** Valeur lisible d’un paramètre : « 15 min », « oui », « Thermique 80 mm ». */
export function valeurLisible(champ: string, valeur: unknown): string {
  if (valeur === null || valeur === undefined) return "—"
  if (typeof valeur === "boolean") return valeur ? "activé" : "désactivé"
  if (Array.isArray(valeur)) return `${valeur.length} motif(s)`
  if (champ === "ticketPrintFormat") return valeur === "a5" ? "A5 (imprimante bureautique)" : "Thermique 80 mm"
  const unite = LIBELLES_PARAMETRES[champ as Champ]?.unite
  return typeof valeur === "number" ? `${valeur.toLocaleString("fr-FR")}${unite ? ` ${unite}` : ""}` : String(valeur)
}

/** Contrôles immédiats, mêmes bornes que le serveur (qui reste seul juge). */
export function erreursParametres(p: Parametres): Partial<Record<Champ, string>> {
  const e: Partial<Record<Champ, string>> = {}
  const borne = (champ: Champ, min: number, max: number, entier = false) => {
    const v = p[champ] as number
    if (!Number.isFinite(v) || v < min || v > max || (entier && !Number.isInteger(v))) {
      e[champ] = `Entre ${min} et ${max}${entier ? ", nombre entier" : ""}.`
    }
  }
  borne("vatPct", 0, 100)
  borne("cssPct", 0, 100)
  borne("seatHoldMinutes", 1, 120, true)
  borne("saleOpeningDays", 1, 365, true)
  borne("mobilePaymentAttempts", 1, 10, true)
  borne("refundPenaltyEarlyPct", 0, 100)
  borne("refundPenaltyLatePct", 0, 100)
  borne("refundThresholdHours", 0, 72, true)
  borne("sessionIdleMinutes", 1, 120, true)
  if (!e.refundPenaltyLatePct && p.refundPenaltyLatePct < p.refundPenaltyEarlyPct) {
    e.refundPenaltyLatePct = "Ne peut pas être inférieure à la pénalité avant le seuil."
  }
  const motifs = p.refundReasons.map((m) => m.trim()).filter(Boolean)
  if (motifs.length === 0) e.refundReasons = "Au moins un motif."
  else if (motifs.length > 20) e.refundReasons = "20 motifs au plus."
  else if (new Set(motifs.map((m) => m.toLowerCase())).size !== motifs.length) e.refundReasons = "Un motif apparaît deux fois."
  const mention = p.duplicateMention.trim()
  if (mention.length < 3 || mention.length > 24) e.duplicateMention = "Entre 3 et 24 caractères."
  if (p.ticketFooter.length > 160) e.ticketFooter = "160 caractères au plus."
  if (!p.ssoEnabled && !p.otpFallbackEnabled) e.otpFallbackEnabled = "Sans annuaire, le code de secours doit rester actif."
  return e
}

export function differences(avant: Parametres, apres: Parametres) {
  return (Object.keys(LIBELLES_PARAMETRES) as Champ[]).filter((champ) => JSON.stringify(avant[champ]) !== JSON.stringify(apres[champ]))
}

export function ParametragePage() {
  const pilotage = usePilotage()
  const vue = useQuery(api.functions.pilotage.parametres, pilotage.voit("parametrage") ? {} : "skip")
  const enregistrer = useMutation(api.functions.management.saveSettings)
  const annuler = useMutation(api.functions.pilotage.annulerParametresProgrammes)
  const execution = useExecution()
  const [brouillon, setBrouillon] = useState<Parametres | null>(null)
  const [effet, setEffet] = useState("")
  const [motif, setMotif] = useState("")
  const [nouveauMotif, setNouveauMotif] = useState("")
  const [apercu, setApercu] = useState(false)
  const [annulation, setAnnulation] = useState(false)

  const peutModifier = pilotage.peut("parametrage", "modifier")
  const seulementSecurite = pilotage.role === "admin_it"
  const courant = vue?.courant
  const valeurs = brouillon ?? courant
  const modifies = useMemo(() => (courant && brouillon ? differences(courant, brouillon) : []), [courant, brouillon])
  const erreurs = valeurs ? erreursParametres(valeurs) : {}
  const nbErreurs = Object.keys(erreurs).length

  // Quitter la page avec des modifications en cours : le navigateur prévient.
  useEffect(() => {
    if (modifies.length === 0) return
    const garde = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener("beforeunload", garde)
    return () => window.removeEventListener("beforeunload", garde)
  }, [modifies.length])

  const modifiable = (champ: Champ) => peutModifier && (!seulementSecurite || CHAMPS_SECURITE.includes(champ))
  function changer<K extends Champ>(champ: K, valeur: Parametres[K]) {
    if (!courant) return
    setBrouillon({ ...(brouillon ?? courant), [champ]: valeur })
  }

  async function soumettre() {
    if (!valeurs) return
    const effectiveFrom = effet ? Date.parse(`${effet}T00:00:00+01:00`) : undefined
    const r = await execution.executer(
      "enregistrer",
      () => enregistrer({ ...valeurs, effectiveFrom, changeReason: motif.trim() || undefined }),
      () =>
        effectiveFrom && effectiveFrom > Date.now()
          ? { titre: `Modifications programmées au ${dateNumerique(effectiveFrom)}.`, detail: "La version en vigueur reste appliquée jusque-là." }
          : "Paramètres enregistrés et appliqués à tous les canaux."
    )
    if (r) {
      setBrouillon(null)
      setEffet("")
      setMotif("")
    }
  }

  const lectureSeule = pilotage.pret && pilotage.enLigne && !peutModifier ? messageLectureSeule(pilotage.role, "le paramétrage") : false

  return (
    <CadrePilotage lectureSeule={lectureSeule}>
      <EnTetePage
        surtitre="Supervision · réglages"
        titre="Paramétrage"
        description="Taxes, délais et règles appliqués par tous les canaux. Toute modification prend effet à une date — tout de suite ou plus tard — et reste au journal d’audit avec les valeurs avant et après."
      />
      {seulementSecurite && peutModifier ? (
        <InlineMessage tone="info" title="Administration système : seuls les réglages de sécurité sont modifiables depuis votre rôle." />
      ) : null}
      {execution.retour}

      {vue === undefined || !valeurs ? (
        <SkeletonLines />
      ) : (
        <>
          {vue.programme ? (
            <InlineMessage tone="warning" title={`Modification programmée au ${dateNumerique(vue.programme.effectiveFrom)} par ${vue.programme.par}.`}>
              <span className="grid gap-2">
                <span>
                  {differences(vue.courant, vue.programme.valeurs)
                    .map((c) => `${LIBELLES_PARAMETRES[c].libelle} : ${valeurLisible(c, vue.courant[c])} → ${valeurLisible(c, vue.programme!.valeurs[c])}`)
                    .join(" · ") || "Aucune valeur différente de la version en vigueur."}
                  {vue.programme.motif ? ` — « ${vue.programme.motif} »` : ""}
                </span>
                {peutModifier ? (
                  <span>
                    <Button type="button" variant="ghost" onClick={() => setAnnulation(true)}>
                      <X />
                      Annuler la programmation
                    </Button>
                  </span>
                ) : null}
              </span>
            </InlineMessage>
          ) : null}

          <ChampsModifies.Provider value={modifies}>
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-5 xl:grid-cols-2">
            <Panneau titre="Vente et taxes" icone={Receipt} plein>
              <Reglages>
                <ReglageNombre champ="vatPct" detail="Billets, bagages, colis" valeurs={valeurs} erreurs={erreurs} modifiable={modifiable("vatPct")} changer={changer} pas={0.1} />
                <ReglageNombre champ="cssPct" detail="Contribution spéciale de solidarité" valeurs={valeurs} erreurs={erreurs} modifiable={modifiable("cssPct")} changer={changer} pas={0.1} />
                <ReglageNombre champ="seatHoldMinutes" detail="Avant encaissement, tous canaux" valeurs={valeurs} erreurs={erreurs} modifiable={modifiable("seatHoldMinutes")} changer={changer} />
                <ReglageNombre champ="saleOpeningDays" detail="Avant le départ" valeurs={valeurs} erreurs={erreurs} modifiable={modifiable("saleOpeningDays")} changer={changer} />
                <ReglageNombre champ="mobilePaymentAttempts" detail="Airtel Money, Moov Money" valeurs={valeurs} erreurs={erreurs} modifiable={modifiable("mobilePaymentAttempts")} changer={changer} />
                <ReglageInterrupteur champ="degradedSalesEnabled" detail="Billets pré-imprimés quand le réseau tombe" valeurs={valeurs} erreurs={erreurs} modifiable={modifiable("degradedSalesEnabled")} changer={changer} />
                <ReglageInterrupteur champ="cashVarianceNotificationsEnabled" detail="Prévient le contrôle des recettes à chaque clôture en écart" valeurs={valeurs} erreurs={erreurs} modifiable={modifiable("cashVarianceNotificationsEnabled")} changer={changer} />
              </Reglages>
            </Panneau>

            <Panneau titre="Remboursement" icone={RotateCcw} plein>
              <Reglages>
                <ReglageNombre champ="refundThresholdHours" detail="Avant le départ ; sépare les deux pénalités" valeurs={valeurs} erreurs={erreurs} modifiable={modifiable("refundThresholdHours")} changer={changer} />
                <ReglageNombre champ="refundPenaltyEarlyPct" libelle={`Plus de ${valeurs.refundThresholdHours} h avant le départ`} detail="Pénalité retenue" valeurs={valeurs} erreurs={erreurs} modifiable={modifiable("refundPenaltyEarlyPct")} changer={changer} pas={0.5} />
                <ReglageNombre champ="refundPenaltyLatePct" libelle={`Moins de ${valeurs.refundThresholdHours} h avant le départ`} detail="Pénalité retenue" valeurs={valeurs} erreurs={erreurs} modifiable={modifiable("refundPenaltyLatePct")} changer={changer} pas={0.5} />
                <ReglageInterrupteur champ="refundAfterDepartureAllowed" libelle="Après le départ" detail="Sauf train supprimé ou retard de plus de 2 h, toujours remboursés" valeurs={valeurs} erreurs={erreurs} modifiable={modifiable("refundAfterDepartureAllowed")} changer={changer} />
                <Reglage libelle="Billet contrôlé à bord" detail="Invariant, non modifiable">
                  <Tag tone="neutral">Jamais remboursé au guichet</Tag>
                </Reglage>
                <div className="grid gap-2 border-t border-line px-4 py-3.5">
                  <span className="grid">
                    <b className="text-[14.5px] font-semibold">Motifs proposés</b>
                    <small className="text-[13px] text-ink-muted">Liste au choix du vendeur</small>
                  </span>
                  <ul className="grid gap-1.5">
                    {valeurs.refundReasons.map((m, index) => (
                      <li key={`${m}-${index}`} className="flex min-h-11 items-center gap-2 rounded-md border border-line px-3">
                        <span className="flex-1 text-[14px]">{m}</span>
                        {modifiable("refundReasons") ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Retirer le motif « ${m} »`}
                            onClick={() => changer("refundReasons", valeurs.refundReasons.filter((_, i) => i !== index))}
                          >
                            <Trash2 />
                          </Button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                  {modifiable("refundReasons") ? (
                    <form
                      className="flex flex-wrap items-end gap-2"
                      onSubmit={(event) => {
                        event.preventDefault()
                        const m = nouveauMotif.trim()
                        if (!m) return
                        changer("refundReasons", [...valeurs.refundReasons, m])
                        setNouveauMotif("")
                      }}
                    >
                      <Field label="Nouveau motif" className="min-w-[200px] flex-1" error={erreurs.refundReasons}>
                        <Input value={nouveauMotif} maxLength={80} onChange={(event) => setNouveauMotif(event.target.value)} />
                      </Field>
                      <Button type="submit" variant="secondary" disabled={!nouveauMotif.trim()}>
                        <Plus />
                        Ajouter
                      </Button>
                    </form>
                  ) : erreurs.refundReasons ? (
                    <small className="text-[12px] text-danger-ink">{erreurs.refundReasons}</small>
                  ) : null}
                </div>
              </Reglages>
            </Panneau>

            <Panneau titre="Sécurité" icone={ShieldCheck} plein>
              <Reglages>
                <ReglageInterrupteur champ="ssoEnabled" detail="Entra ID, SAML 2 ou OIDC — non raccordé à ce jour" valeurs={valeurs} erreurs={erreurs} modifiable={modifiable("ssoEnabled")} changer={changer} />
                <ReglageInterrupteur champ="mfaRequired" detail="Application, clé FIDO2 ou SMS" valeurs={valeurs} erreurs={erreurs} modifiable={modifiable("mfaRequired")} changer={changer} />
                <ReglageInterrupteur champ="otpFallbackEnabled" detail="Si l’annuaire ne répond pas" valeurs={valeurs} erreurs={erreurs} modifiable={modifiable("otpFallbackEnabled")} changer={changer} />
                <ReglageNombre champ="sessionIdleMinutes" detail="Verrouillage du poste" valeurs={valeurs} erreurs={erreurs} modifiable={modifiable("sessionIdleMinutes")} changer={changer} />
              </Reglages>
            </Panneau>

            <Panneau titre="Impression" icone={Printer} plein>
              <Reglages>
                <Reglage libelle={LIBELLES_PARAMETRES.ticketPrintFormat.libelle} detail="Code Aztec signé sur chaque billet">
                  <SelectNative
                    aria-label={LIBELLES_PARAMETRES.ticketPrintFormat.libelle}
                    className="h-11 w-52"
                    value={valeurs.ticketPrintFormat}
                    disabled={!modifiable("ticketPrintFormat")}
                    onChange={(event) => changer("ticketPrintFormat", event.target.value as Parametres["ticketPrintFormat"])}
                  >
                    <option value="thermique_80">Thermique 80 mm</option>
                    <option value="a5">A5 bureautique</option>
                  </SelectNative>
                </Reglage>
                <ReglageTexte champ="duplicateMention" detail="Imprimée en tête du billet réimprimé" valeurs={valeurs} erreurs={erreurs} modifiable={modifiable("duplicateMention")} changer={changer} largeur="w-44" />
                <ReglageTexte champ="ticketFooter" detail="Sous le code, sur tous les billets" valeurs={valeurs} erreurs={erreurs} modifiable={modifiable("ticketFooter")} changer={changer} largeur="w-full sm:w-72" />
                <Reglage libelle="Aperçu du billet" detail="Avec les réglages en cours de saisie">
                  <Button type="button" variant="secondary" onClick={() => setApercu(true)}>
                    <Eye />
                    Aperçu
                  </Button>
                </Reglage>
              </Reglages>
            </Panneau>
          </div>
          </ChampsModifies.Provider>

          <Panneau titre="Historique des modifications" icone={History} sousTitre={vue.misAJourLe ? `version en vigueur du ${horodatage(vue.misAJourLe)} · ${vue.misAJourPar}` : "valeurs par défaut, jamais modifiées"}>
            <Chronologie
              vide="Aucune modification enregistrée : les valeurs par défaut du cahier des charges s’appliquent."
              evenements={vue.historique.map((h) => ({
                cle: h._id,
                heure: dateNumerique(h.at).slice(0, 5),
                titre: `${h.action === "parametrage.programmer" ? `Programmé au ${dateNumerique(h.effectiveFrom)}` : h.action === "parametrage.appliquer" ? "Version programmée appliquée" : h.action === "parametrage.annuler_programmation" ? "Programmation annulée" : "Enregistré"} · ${h.actor}`,
                detail: [
                  h.changes.map((c) => `${LIBELLES_PARAMETRES[c.champ as Champ]?.libelle ?? c.champ} : ${valeurLisible(c.champ, c.avant)} → ${valeurLisible(c.champ, c.apres)}`).join(" · "),
                  h.reason ? `« ${h.reason} »` : null,
                ]
                  .filter(Boolean)
                  .join(" — "),
              }))}
            />
          </Panneau>

          {modifies.length > 0 ? (
            <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-end gap-3 rounded-md border border-line bg-surface px-4 py-3 shadow-[var(--sh-md)]">
              <div className="grid min-w-[220px] flex-1 text-small text-ink-muted" role="status">
                <b className="text-[15px] text-ink">
                  {modifies.length} modification{modifies.length > 1 ? "s" : ""} non enregistrée{modifies.length > 1 ? "s" : ""}
                </b>
                <span>
                  {modifies
                    .map((c) => `${LIBELLES_PARAMETRES[c].libelle} : ${valeurLisible(c, courant![c])} → ${valeurLisible(c, valeurs[c])}`)
                    .join(" · ")}
                </span>
                {nbErreurs > 0 ? <span className="font-semibold text-danger-ink">{nbErreurs} valeur(s) à corriger avant d’enregistrer.</span> : null}
              </div>
              <Field label="Effet au (vide : tout de suite)" className="w-56">
                <Input type="date" min={jourDeService()} value={effet} onChange={(event) => setEffet(event.target.value)} />
              </Field>
              <Field label="Motif, repris au journal d’audit" className="w-full sm:w-64">
                <Input value={motif} maxLength={200} onChange={(event) => setMotif(event.target.value)} />
              </Field>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={() => setBrouillon(null)}>
                  <X />
                  Annuler
                </Button>
                <Button type="button" disabled={nbErreurs > 0 || !peutModifier} loading={execution.enCours === "enregistrer"} loadingLabel="Enregistrement…" onClick={soumettre}>
                  {effet ? <CalendarClock /> : <Check />}
                  {effet ? "Programmer" : "Enregistrer"}
                </Button>
              </div>
            </div>
          ) : null}

          <Dialog open={apercu} onOpenChange={setApercu}>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle className="text-h3">Aperçu du billet de guichet</DialogTitle>
                <DialogDescription>
                  {valeurs.ticketPrintFormat === "a5" ? "Format A5 bureautique" : "Thermique 80 mm"} · billet d’exemple réimprimé, avec la mention de duplicata et les taux saisis.
                </DialogDescription>
              </DialogHeader>
              <div className={cn("mx-auto grid gap-2 border border-dashed border-line-strong bg-surface p-4 font-mono text-[12px] text-ink", valeurs.ticketPrintFormat === "a5" ? "w-full" : "w-[280px]")}>
                <b className="text-center text-[14px] tracking-[0.2em]">{valeurs.duplicateMention.trim() || "—"}</b>
                <span className="text-center font-semibold">SETRAG · Transgabonais</span>
                <span>Express 201 · 2e classe</span>
                <span>Owendo 07:40 → Franceville 19:25</span>
                <span>V3 · place 2A · Adulte</span>
                <span className="flex justify-between border-t border-line pt-1">
                  <span>TTC</span>
                  <span className="tabular-nums">32 500 XAF</span>
                </span>
                <span className="text-ink-muted">dont TVA {valeurs.vatPct.toLocaleString("fr-FR")} % · CSS {valeurs.cssPct.toLocaleString("fr-FR")} %</span>
                <span className="mx-auto grid size-24 place-items-center border border-line-strong text-[10px] text-ink-muted">code Aztec</span>
                <span className="text-center text-[11px]">{valeurs.ticketFooter}</span>
              </div>
            </DialogContent>
          </Dialog>

          <DialogueMotif
            ouvert={annulation}
            surFermeture={() => setAnnulation(false)}
            titre="Annuler la modification programmée"
            description="La version en vigueur reste appliquée ; la version programmée est abandonnée."
            libelleAction="Annuler la programmation"
            danger
            enCours={execution.enCours === "annuler"}
            surConfirmation={async (m) => {
              const r = await execution.executer("annuler", () => annuler({ motif: m }), () => "Programmation annulée.")
              if (r) setAnnulation(false)
            }}
          />
        </>
      )}
    </CadrePilotage>
  )
}

/* ============================================================ Réglages */

/** Champs modifiés et non enregistrés : chaque ligne concernée le dit. */
const ChampsModifies = createContext<readonly Champ[]>([])

function Reglages({ children }: { children: ReactNode }) {
  return <div className="grid [&>*:first-child]:border-t-0">{children}</div>
}

function Reglage({ libelle, detail, erreur, modifie, children }: { libelle: string; detail?: string; erreur?: string; modifie?: boolean; children: ReactNode }) {
  return (
    <div className={cn("grid grid-cols-1 items-center gap-2 border-t border-line px-4 py-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-4", modifie && "bg-accent-soft")}>
      <span className="grid min-w-0">
        <b className="text-[14.5px] font-semibold">
          {libelle}
          {modifie ? <span className="ml-2 text-[12px] font-semibold text-accent-ink">modifié</span> : null}
        </b>
        {detail ? <small className="text-[13px] text-ink-muted">{detail}</small> : null}
        {erreur ? <small className="text-[12px] font-medium text-danger-ink">{erreur}</small> : null}
      </span>
      <div className="sm:justify-self-end">{children}</div>
    </div>
  )
}

interface ProprietesReglage<K extends Champ> {
  champ: K
  libelle?: string
  detail?: string
  valeurs: Parametres
  erreurs: Partial<Record<Champ, string>>
  modifiable: boolean
  changer: <C extends Champ>(champ: C, valeur: Parametres[C]) => void
}

function ReglageNombre({ champ, libelle, detail, valeurs, erreurs, modifiable, changer, pas = 1 }: ProprietesReglage<Champ> & { pas?: number }) {
  const info = LIBELLES_PARAMETRES[champ]
  const valeur = valeurs[champ] as number
  return (
    <Reglage libelle={libelle ?? info.libelle} detail={detail} erreur={erreurs[champ]} modifie={useContext(ChampsModifies).includes(champ)}>
      <label className="flex items-center gap-2">
        <span className="sr-only">{libelle ?? info.libelle}</span>
        <Input
          type="number"
          inputMode="decimal"
          step={pas}
          className="h-11 w-28 text-right font-mono tabular-nums"
          aria-invalid={erreurs[champ] ? true : undefined}
          disabled={!modifiable}
          value={Number.isFinite(valeur) ? valeur : ""}
          onChange={(event) => changer(champ, (event.target.value === "" ? Number.NaN : Number(event.target.value)) as never)}
        />
        {info.unite ? <span className="w-10 text-[13px] text-ink-muted">{info.unite}</span> : <span className="w-10" />}
      </label>
    </Reglage>
  )
}

function ReglageInterrupteur({ champ, libelle, detail, valeurs, erreurs, modifiable, changer }: ProprietesReglage<Champ>) {
  const info = LIBELLES_PARAMETRES[champ]
  const actif = Boolean(valeurs[champ])
  return (
    <Reglage libelle={libelle ?? info.libelle} detail={detail} erreur={erreurs[champ]} modifie={useContext(ChampsModifies).includes(champ)}>
      <Switch label={actif ? "Activé" : "Désactivé"} checked={actif} disabled={!modifiable} onCheckedChange={(v) => changer(champ, v as never)} />
    </Reglage>
  )
}

function ReglageTexte({ champ, detail, valeurs, erreurs, modifiable, changer, largeur }: ProprietesReglage<Champ> & { largeur: string }) {
  const info = LIBELLES_PARAMETRES[champ]
  return (
    <Reglage libelle={info.libelle} detail={detail} erreur={erreurs[champ]} modifie={useContext(ChampsModifies).includes(champ)}>
      <Input
        aria-label={info.libelle}
        className={cn("h-11 font-mono", largeur)}
        aria-invalid={erreurs[champ] ? true : undefined}
        disabled={!modifiable}
        value={String(valeurs[champ] ?? "")}
        onChange={(event) => changer(champ, event.target.value as never)}
      />
    </Reglage>
  )
}

