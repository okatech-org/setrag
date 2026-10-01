"use client"

import { usePaginatedQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { CalendarDays, Download, Fingerprint, Search, ShieldCheck, UserRound } from "lucide-react"
import { useSearchParams } from "next/navigation"
import { useEffect, useMemo, useState } from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import { CelluleDouble, TableauDonnees, suffixeDate, telechargerCsv, type ColonneTableau } from "@/components/charte"

import { CadreGestion } from "./cadre"
import { useDroitsGestion } from "./droits"
import { DateFiltre, Puces, RetourOperation, SelectFiltre, useOperation } from "./elements"
import { aujourdhuiService, dateCourte, debutJour, finJour, horodatage, nombre } from "./format"
import { libelleAction } from "./libelles-audit"
import { Pastille } from "./statuts"

type Ligne = FunctionReturnType<typeof api.functions.auditTrail.journal>["page"][number]

export const FAMILLES = [
  { cle: "toutes", libelle: "Toutes actions" },
  { cle: "ventes", libelle: "Ventes" },
  { cle: "caisse", libelle: "Caisse" },
  { cle: "places", libelle: "Places" },
  { cle: "referentiels", libelle: "Référentiels" },
  { cle: "droits", libelle: "Droits" },
  { cle: "terrain", libelle: "Terrain" },
] as const
type Famille = (typeof FAMILLES)[number]["cle"]

export const RESULTATS = {
  succes: { libelle: "Succès", ton: "success" },
  refus: { libelle: "Refus", ton: "danger" },
  echec: { libelle: "Échec", ton: "warning" },
} as const

export function TagResultat({ resultat }: { resultat: string }) {
  const def = RESULTATS[resultat as keyof typeof RESULTATS] ?? { libelle: resultat, ton: "neutral" as const }
  return <Pastille ton={def.ton}>{def.libelle}</Pastille>
}

const objet = (l: Pick<Ligne, "entityTable" | "entityId">) => `${l.entityTable} · ${l.entityId.length > 14 ? `${l.entityId.slice(0, 6)}…${l.entityId.slice(-4)}` : l.entityId}`

const colonnes: ColonneTableau<Ligne>[] = [
  { cle: "horodatage", libelle: "Horodatage", rendu: (l) => <span className="tabular text-[13px] whitespace-nowrap">{horodatage(l.createdAt)}</span>, tri: (l) => l.createdAt, export: (l) => horodatage(l.createdAt) },
  { cle: "agent", libelle: "Agent", rendu: (l) => (l.acteur ? `${l.acteur.court}${l.acteur.matricule ? ` · ${l.acteur.matricule}` : ""}` : "Système"), tri: (l) => l.acteur?.nom ?? "Système" },
  { cle: "action", libelle: "Action", rendu: (l) => <CelluleDouble haut={libelleAction(l.action)} bas={<span className="tabular">{l.action}</span>} />, tri: (l) => l.action, export: (l) => `${libelleAction(l.action)} (${l.action})` },
  { cle: "objet", libelle: "Objet", rendu: (l) => <span className="tabular text-[13px]">{objet(l)}</span>, tri: (l) => l.entityTable, export: (l) => `${l.entityTable} ${l.entityId}`, secondaire: true },
  { cle: "poste", libelle: "Poste", rendu: (l) => <span className="tabular text-[13px]">{l.deviceId ?? "—"}</span>, tri: (l) => l.deviceId ?? "", secondaire: true },
  { cle: "resultat", libelle: "Résultat", rendu: (l) => <TagResultat resultat={l.result} />, tri: (l) => l.result },
  { cle: "detail", libelle: "Détail", rendu: (l) => <span className="text-[13px] text-ink-muted">{l.reason ?? (l.aDesValeurs ? "Avant / après" : "—")}</span>, tri: (l) => l.reason ?? "", secondaire: true },
]

type Periode = "jour" | "7j" | "30j" | "dates"

export function JournalAudit() {
  const parametres = useSearchParams()
  const droits = useDroitsGestion()
  const peutVoir = droits.may("utilisateurs")
  const [famille, setFamille] = useState<Famille>("toutes")
  const [periode, setPeriode] = useState<Periode>("7j")
  // Instant de référence des périodes glissantes, arrondi à la minute : une
  // requête paginée garde ainsi des arguments stables d'un rendu à l'autre.
  const [ancre, setAncre] = useState(() => Math.ceil(Date.now() / 60_000) * 60_000)
  const [du, setDu] = useState(aujourdhuiService(-7))
  const [au, setAu] = useState(aujourdhuiService())
  const [acteur, setActeur] = useState(parametres.get("agent") ?? "")
  const [resultat, setResultat] = useState("")
  const [saisie, setSaisie] = useState("")
  const [recherche, setRecherche] = useState("")
  const comptes = useQuery(api.functions.referentiels.comptes, peutVoir ? {} : "skip")
  const scellement = useQuery(api.functions.auditTrail.scellement, peutVoir ? {} : "skip")
  const exporter = useMutation(api.functions.auditTrail.exporterJournal)
  const operation = useOperation()

  useEffect(() => {
    const minuteur = window.setTimeout(() => setRecherche(saisie.trim()), 350)
    return () => window.clearTimeout(minuteur)
  }, [saisie])

  const filtres = useMemo(() => {
    const maintenant = ancre
    const depuis =
      periode === "jour" ? debutJour(aujourdhuiService()) : periode === "7j" ? maintenant - 7 * 86_400_000 : periode === "30j" ? maintenant - 30 * 86_400_000 : debutJour(du)
    const jusqua = periode === "dates" ? finJour(au) : undefined
    return {
      depuis,
      jusqua,
      acteurId: acteur ? (acteur as never) : undefined,
      categorie: famille === "toutes" ? undefined : famille,
      resultat: resultat ? (resultat as keyof typeof RESULTATS) : undefined,
      recherche: recherche || undefined,
    }
  }, [ancre, periode, du, au, acteur, famille, resultat, recherche])

  const { results, status, loadMore } = usePaginatedQuery(api.functions.auditTrail.journal, peutVoir ? filtres : "skip", { initialNumItems: 50 })

  const telecharger = async () => {
    const resultat = await operation.executer("export", () => exporter(filtres))
    if (!resultat) return
    telechargerCsv(
      `journal-audit-${suffixeDate()}`,
      [
        { libelle: "Horodatage", valeur: (l: Ligne) => horodatage(l.createdAt) },
        { libelle: "Agent", valeur: (l: Ligne) => l.acteur?.nom ?? "Système" },
        { libelle: "Matricule", valeur: (l: Ligne) => l.acteur?.matricule },
        { libelle: "Rôle", valeur: (l: Ligne) => l.acteur?.role },
        { libelle: "Action", valeur: (l: Ligne) => l.action },
        { libelle: "Libellé", valeur: (l: Ligne) => libelleAction(l.action) },
        { libelle: "Table", valeur: (l: Ligne) => l.entityTable },
        { libelle: "Objet", valeur: (l: Ligne) => l.entityId },
        { libelle: "Poste", valeur: (l: Ligne) => l.deviceId },
        { libelle: "Résultat", valeur: (l: Ligne) => RESULTATS[l.result as keyof typeof RESULTATS]?.libelle ?? l.result },
        { libelle: "Motif", valeur: (l: Ligne) => l.reason },
        { libelle: "Classification", valeur: (l: Ligne) => l.classification },
      ],
      resultat.lignes
    )
    operation.signaler({
      ton: "success",
      titre: `${nombre(resultat.lignes.length)} entrée(s) exportée(s)${resultat.tronque ? " · export limité à 5 000 entrées" : ""}.`,
      detail: "L'export est lui-même inscrit au journal.",
    })
  }

  const dernier = scellement?.dernier
  return (
    <CadreGestion
      surtitre="Supervision · traçabilité"
      titre="Journal d'audit"
      description="Toute action sensible : qui, quand, depuis quel poste, avant et après. Le journal ne s'efface pas ; il part aussi vers le SIEM du groupe."
      actions={
        <Button type="button" variant="secondary" loading={operation.enCours === "export"} loadingLabel="Export…" onClick={() => void telecharger()}>
          <Download />
          Exporter
        </Button>
      }
    >
      <InlineMessage tone="info" title="Journal scellé chaque jour.">
        <span className="inline-flex flex-wrap items-center gap-1">
          <Fingerprint aria-hidden className="inline size-4" />
          {dernier ? (
            <>
              Dernière journée scellée : du <span className="tabular">{dateCourte(dernier.windowStart)}</span> ({nombre(dernier.logCount)} entrées), empreinte <span className="tabular">{dernier.sealHash.slice(0, 8)}…{dernier.sealHash.slice(-6)}</span>, chaînée à la précédente.
            </>
          ) : (
            "Aucune journée scellée pour l'instant."
          )}{" "}
          Chaque journée UTC close reçoit une empreinte SHA-256 chaînée à {scellement?.heureScellementUtc ?? "00:30"} UTC : toute altération ultérieure se détecte.
        </span>
      </InlineMessage>
      <div className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex min-h-11 min-w-[240px] flex-1 items-center gap-2 rounded-md border border-line-strong bg-surface px-3 text-[14.5px] focus-within:border-accent-base focus-within:shadow-[var(--focus-ring)]">
            <Search aria-hidden className="size-4 text-ink-muted" />
            <span className="sr-only">Agent, matricule, objet</span>
            <input type="search" value={saisie} onChange={(event) => setSaisie(event.target.value)} placeholder="Agent, matricule, objet (billet, tarif, place…)" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-ink-faint focus-visible:shadow-none" />
          </label>
          <SelectFiltre
            libelle="Période"
            icone={CalendarDays}
            value={periode}
            onChange={(v) => {
              setPeriode(v as Periode)
              setAncre(Math.ceil(Date.now() / 60_000) * 60_000)
            }}
          >
            <option value="jour">Aujourd’hui</option>
            <option value="7j">7 derniers jours</option>
            <option value="30j">30 derniers jours</option>
            <option value="dates">Entre deux dates</option>
          </SelectFiltre>
          {periode === "dates" ? (
            <>
              <DateFiltre libelle="Du" value={du} onChange={setDu} />
              <DateFiltre libelle="Au" value={au} onChange={setAu} />
            </>
          ) : null}
          <SelectFiltre libelle="Agent" icone={UserRound} value={acteur} onChange={setActeur} className="max-w-[260px]">
            <option value="">Tous les agents</option>
            {comptes?.comptes.map((c) => (
              <option key={c._id} value={c._id}>
                {c.nom}
                {c.matricule ? ` · ${c.matricule}` : ""}
              </option>
            ))}
          </SelectFiltre>
          <SelectFiltre libelle="Résultat" value={resultat} onChange={setResultat}>
            <option value="">Tous résultats</option>
            {Object.entries(RESULTATS).map(([cle, def]) => (
              <option key={cle} value={cle}>
                {def.libelle}
              </option>
            ))}
          </SelectFiltre>
        </div>
        <Puces libelle="Famille d'actions" valeur={famille} onChange={setFamille} options={FAMILLES} />
      </div>
      <RetourOperation retour={operation.retour} />
      <TableauDonnees
        libelle="Journal d'audit"
        colonnes={colonnes}
        lignes={status === "LoadingFirstPage" ? undefined : results}
        cle={(l) => l._id}
        lien={(l) => `/gestion/audit/${l._id}`}
        parPage={50}
        vide={{ titre: "Aucune entrée", description: "Rien n'a été tracé pour ces filtres. Élargissez la période ou retirez un filtre." }}
      />
      <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-ink-muted">
        <span>
          {nombre(results.length)} entrée(s) chargée(s){status === "Exhausted" ? " · fin du journal pour ces filtres" : ""}.
        </span>
        {status === "CanLoadMore" || status === "LoadingMore" ? (
          <Button type="button" variant="secondary" size="sm" loading={status === "LoadingMore"} loadingLabel="Chargement…" onClick={() => loadMore(100)}>
            Charger les entrées plus anciennes
          </Button>
        ) : null}
      </div>
      {scellement ? (
        <p className="flex items-center gap-1.5 text-[12.5px] text-ink-muted">
          <ShieldCheck aria-hidden className="size-4" />
          {nombre(scellement.journeesScellees30j)} journée(s) scellée(s) sur les 30 derniers jours. Le journal n’expose aucune action de suppression.
        </p>
      ) : null}
    </CadreGestion>
  )
}
