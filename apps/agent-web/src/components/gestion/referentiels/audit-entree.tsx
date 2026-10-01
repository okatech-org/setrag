"use client"

import { ArrowRight, FileDiff, Fingerprint, Info, ListTree, ScrollText } from "lucide-react"

import { useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { SkeletonLines } from "@workspace/ui/components/empty-state"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { cn } from "@workspace/ui/lib/utils"

import { Fiche, LienBouton, Panneau, TableauDonnees } from "@/components/charte"
import { ManagementDetailShell } from "@/components/management-detail-shell"
import { ROLE_LABELS } from "@/lib/roles"

import { dateCourte, horodatage } from "./format"
import { libelleAction } from "./libelles-audit"
import { TagResultat } from "./audit"

/** Route du dossier correspondant à un objet tracé, quand l'écran existe. */
const DOSSIERS: Record<string, string> = {
  timetableBooklets: "/gestion/livrets/",
  trains: "/gestion/trains/",
  fareSchedules: "/gestion/tarifs/",
  pricingRules: "/gestion/yield/",
  pointsOfSale: "/gestion/points-de-vente/",
  seatBlocks: "/gestion/places/",
  tickets: "/gestion/voyageurs/",
  incidents: "/gestion/incidents/",
  procesVerbaux: "/gestion/incidents/proces-verbaux/",
  users: "/gestion/utilisateurs/",
}

function lire(json: string | undefined) {
  if (!json) return undefined
  try {
    return JSON.parse(json) as unknown
  } catch {
    return json
  }
}

function texteValeur(valeur: unknown) {
  if (valeur === undefined) return "—"
  if (valeur === null) return "null"
  if (typeof valeur === "string") return valeur
  return JSON.stringify(valeur)
}

const IGNORES = new Set(["_id", "_creationTime"])

/** Comparaison champ par champ des valeurs avant et après. */
export function differences(avant: unknown, apres: unknown) {
  const objet = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null)
  const a = objet(avant)
  const b = objet(apres)
  if (!a && !b) return null
  const cles = [...new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])].filter((cle) => !IGNORES.has(cle))
  return cles.map((cle) => {
    const va = a?.[cle]
    const vb = b?.[cle]
    return { cle, avant: texteValeur(va), apres: texteValeur(vb), change: JSON.stringify(va) !== JSON.stringify(vb) }
  })
}

function BlocJson({ titre, valeur }: { titre: string; valeur: unknown }) {
  if (valeur === undefined) return null
  return (
    <div className="grid gap-1">
      <h3 className="text-[13px] font-semibold text-ink-muted">{titre}</h3>
      <pre className="tabular max-h-80 overflow-auto rounded-md border border-line bg-surface-sunk p-3 text-[12.5px] leading-relaxed whitespace-pre-wrap">
        {typeof valeur === "string" ? valeur : JSON.stringify(valeur, null, 2)}
      </pre>
    </div>
  )
}

export function EntreeAudit({ logId }: { logId: string }) {
  const entree = useQuery(api.functions.auditTrail.entree, { logId: logId as never })

  if (entree === undefined || entree === null) {
    return (
      <ManagementDetailShell title={entree === null ? "Entrée introuvable" : "Entrée du journal"} eyebrow="Supervision · journal d'audit" backHref="/gestion/audit" backLabel="Retour au journal" verrouillage="aucun" gouvernance>
        {entree === null ? <InlineMessage tone="danger" title="Cette entrée n'existe pas." /> : <SkeletonLines />}
      </ManagementDetailShell>
    )
  }
  const { log, acteur, scellement } = entree
  const avant = lire(log.before)
  const apres = lire(log.after)
  const lignes = differences(avant, apres)
  const dossier = DOSSIERS[log.entityTable]

  return (
    <ManagementDetailShell
      title={libelleAction(log.action)}
      eyebrow={`Supervision · journal d'audit · ${horodatage(log.createdAt)}`}
      backHref="/gestion/audit"
      backLabel="Retour au journal"
      verrouillage="aucun"
      gouvernance
      actions={
        dossier && log.entityId !== "*" ? (
          <LienBouton href={`${dossier}${log.entityId}`} variante="secondary">
            Ouvrir l’objet
            <ArrowRight />
          </LienBouton>
        ) : null
      }
    >
      <div className="flex flex-wrap gap-2">
        <TagResultat resultat={log.result ?? "succes"} />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Panneau titre="Entrée" icone={ScrollText}>
          <Fiche
            elements={[
              ["Horodatage", <span key="h" className="tabular">{horodatage(log.createdAt)}</span>],
              ["Agent", acteur ? `${acteur.nom}${acteur.matricule ? ` · ${acteur.matricule}` : ""}` : "Système"],
              acteur ? ["Rôle", ROLE_LABELS[acteur.role].split(" — ")[0]] : null,
              ["Action", <span key="a" className="tabular">{log.action}</span>],
              ["Objet", <span key="o" className="tabular break-all">{log.entityTable} · {log.entityId}</span>],
              log.permission ? ["Droit exercé", log.permission] : null,
              log.reason ? ["Motif", log.reason] : null,
              log.classification ? ["Classification", log.classification] : null,
              ["Poste", <span key="p" className="tabular">{log.deviceId ?? "—"}</span>],
              ["Adresse IP", <span key="i" className="tabular">{log.ipAddress ?? "—"}</span>],
              log.correlationId ? ["Corrélation", <span key="c" className="tabular break-all">{log.correlationId}</span>] : null,
            ]}
          />
        </Panneau>
        <Panneau titre="Scellement" icone={Fingerprint}>
          {scellement ? (
            <>
              <Fiche
                elements={[
                  ["Journée scellée", <span key="j" className="tabular">{dateCourte(scellement.windowStart)}</span>],
                  ["Entrées de la journée", <span key="n" className="tabular">{scellement.logCount}</span>],
                  ["Scellée le", <span key="s" className="tabular">{horodatage(scellement.sealedAt)}</span>],
                  ["Empreinte", <span key="e" className="tabular break-all text-[12px]">{scellement.sealHash}</span>],
                  ["Maillon précédent", <span key="m" className="tabular break-all text-[12px]">{scellement.previousSealHash ?? "premier maillon"}</span>],
                ]}
              />
              <p className="text-[12.5px] text-ink-muted">Cette entrée fait partie d’une journée scellée : toute modification ultérieure romprait la chaîne d’empreintes.</p>
            </>
          ) : (
            <p className="flex items-start gap-2 text-[14px]">
              <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-muted" />
              Pas encore scellée : la journée UTC de cette entrée sera scellée par le traitement quotidien de 00:30 UTC, une fois close.
            </p>
          )}
        </Panneau>
      </div>
      <Panneau titre="Avant · après" icone={FileDiff} plein>
        {lignes ? (
          <div className="relative overflow-x-auto">
            <table className="w-full border-collapse text-[13.5px]" aria-label="Valeurs avant et après">
              <thead>
                <tr className="bg-surface-sunk text-left text-[11.5px] font-semibold tracking-[0.05em] text-ink-muted uppercase">
                  <th scope="col" className="px-3.5 py-2.5">Champ</th>
                  <th scope="col" className="px-3.5 py-2.5">Avant</th>
                  <th scope="col" className="px-3.5 py-2.5">Après</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((ligne) => (
                  <tr key={ligne.cle} className={cn("border-t border-line align-top", ligne.change && "bg-warning-soft")}>
                    <th scope="row" className="tabular px-3.5 py-2 text-left font-semibold">
                      {ligne.cle}
                      {ligne.change ? <span className="ml-1.5 text-[11px] font-semibold text-warning-ink">modifié</span> : null}
                    </th>
                    <td className="tabular max-w-[420px] px-3.5 py-2 break-words text-ink-muted">{ligne.avant}</td>
                    <td className="tabular max-w-[420px] px-3.5 py-2 break-words">{ligne.apres}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : avant !== undefined || apres !== undefined ? (
          <div className="grid gap-3 p-4 lg:grid-cols-2">
            <BlocJson titre="Avant" valeur={avant} />
            <BlocJson titre="Après" valeur={apres} />
          </div>
        ) : (
          <p className="text-small p-4 text-ink-muted">Cette action ne porte pas de valeurs avant et après.</p>
        )}
      </Panneau>
      {log.metadata || log.context ? (
        <Panneau titre="Métadonnées" icone={ListTree}>
          <div className="grid gap-3 lg:grid-cols-2">
            <BlocJson titre="Métadonnées" valeur={lire(log.metadata)} />
            <BlocJson titre="Contexte" valeur={lire(log.context)} />
          </div>
        </Panneau>
      ) : null}
      <Panneau titre="Autres entrées sur le même objet" icone={ScrollText} plein>
        <div className="p-3">
          <TableauDonnees
            libelle="Entrées liées"
            colonnes={[
              { cle: "h", libelle: "Horodatage", rendu: (l) => <span className="tabular text-[13px]">{horodatage(l.createdAt)}</span>, tri: (l) => l.createdAt },
              { cle: "a", libelle: "Action", rendu: (l) => libelleAction(l.action), tri: (l) => l.action },
              { cle: "g", libelle: "Agent", rendu: (l) => l.acteur?.court ?? "Système", tri: (l) => l.acteur?.nom ?? "" },
              { cle: "r", libelle: "Résultat", rendu: (l) => <TagResultat resultat={l.result} />, tri: (l) => l.result },
            ]}
            lignes={entree.liees}
            cle={(l) => l._id}
            lien={(l) => `/gestion/audit/${l._id}`}
            parPage={12}
            vide={{ titre: "Aucune autre entrée", description: "C'est la seule trace de cet objet." }}
          />
        </div>
      </Panneau>
    </ManagementDetailShell>
  )
}
