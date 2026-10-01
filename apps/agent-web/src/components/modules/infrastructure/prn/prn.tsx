"use client"

import { Banknote, ClipboardCheck, Construction, FileText, Flag, Gauge, HandCoins, Plus, Wallet } from "lucide-react"
import type { Route } from "next"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { useQuery } from "@workspace/api/hooks"
import { Button } from "@workspace/ui/components/button"

import { CelluleDouble, Indicateur, Indicateurs, LienBouton, Panneau, TableauDonnees, type ColonneTableau } from "@/components/charte"
import { Encart, RetourOperation, SelectFiltre, useOperation } from "@/components/gestion/referentiels/elements"
import { nombre } from "@/components/gestion/referentiels/format"

import { CadreInfra, TagEtat, TagRetard, infraApi, pct, plagePk, useDroitsInfra, xaf, xafCompact, type LigneChantier } from "../commun"
import { Avancement, RepartitionBailleurs, type PartBailleur } from "./composants"
import { FenetreChantier } from "./formulaires"
import { NATURES_CHANTIER, STATUTS_CHANTIER } from "./libelles"

const ORDRE_STATUTS = ["en_cours", "suspendu", "etude", "receptionne"]

const colonnes: ColonneTableau<LigneChantier>[] = [
  { cle: "code", libelle: "Code", rendu: (c) => <span className="tabular font-semibold">{c.code}</span>, tri: (c) => c.code },
  { cle: "libelle", libelle: "Chantier", rendu: (c) => <CelluleDouble haut={c.libelle} bas={c.natureLibelle} />, tri: (c) => c.libelle },
  { cle: "nature", libelle: "Nature", rendu: (c) => c.natureLibelle, tri: (c) => c.natureLibelle, secondaire: true },
  { cle: "plage", libelle: "Plage PK", rendu: (c) => <span className="tabular whitespace-nowrap">{plagePk(c.pkDebut, c.pkFin)}</span>, tri: (c) => c.pkDebut, export: (c) => plagePk(c.pkDebut, c.pkFin) },
  { cle: "entreprise", libelle: "Entreprise", rendu: (c) => c.entreprise, tri: (c) => c.entreprise, secondaire: true },
  { cle: "budget", libelle: "Budget", rendu: (c) => <span className="tabular">{xafCompact(c.budgetFcfa)}</span>, tri: (c) => c.budgetFcfa, export: (c) => c.budgetFcfa, numerique: true },
  { cle: "physique", libelle: "Avancement physique", rendu: (c) => <Avancement valeur={c.avancementPhysiquePct} libelle={`Avancement physique de ${c.code}`} />, tri: (c) => c.avancementPhysiquePct, export: (c) => c.avancementPhysiquePct },
  { cle: "financier", libelle: "Avancement financier", rendu: (c) => <Avancement valeur={c.avancementFinancierPct} libelle={`Avancement financier de ${c.code}`} />, tri: (c) => c.avancementFinancierPct, export: (c) => c.avancementFinancierPct },
  { cle: "statut", libelle: "Statut", rendu: (c) => <TagEtat valeur={c.statut} libelle={c.statutLibelle} />, tri: (c) => ORDRE_STATUTS.indexOf(c.statut), export: (c) => c.statutLibelle },
  {
    cle: "jalons",
    libelle: "Jalons en retard",
    rendu: (c) => (c.jalonsEnRetard > 0 ? <TagRetard texte={`${c.jalonsEnRetard} en retard`} /> : <span className="text-ink-muted">Aucun</span>),
    tri: (c) => c.jalonsEnRetard,
    export: (c) => c.jalonsEnRetard,
  },
  { cle: "engage", libelle: "Engagé (XAF)", rendu: (c) => xaf(c.engageFcfa), tri: (c) => c.engageFcfa, numerique: true, secondaire: true },
  { cle: "paye", libelle: "Payé (XAF)", rendu: (c) => xaf(c.payeFcfa), tri: (c) => c.payeFcfa, numerique: true, secondaire: true },
]

/** Synthèse du programme, pondérée par les budgets. */
export function syntheseProgramme(chantiers: readonly LigneChantier[]) {
  const budget = chantiers.reduce((s, c) => s + c.budgetFcfa, 0)
  const engage = chantiers.reduce((s, c) => s + c.engageFcfa, 0)
  const paye = chantiers.reduce((s, c) => s + c.payeFcfa, 0)
  const physique = budget > 0 ? chantiers.reduce((s, c) => s + c.avancementPhysiquePct * c.budgetFcfa, 0) / budget : 0
  const financier = budget > 0 ? (paye / budget) * 100 : 0
  const parBailleur = new Map<string, PartBailleur>()
  for (const c of chantiers) {
    for (const f of c.financements) {
      const part = parBailleur.get(f.bailleur) ?? { bailleur: f.bailleur, bailleurLibelle: f.bailleurLibelle, montantFcfa: 0, partPct: 0 }
      part.montantFcfa += f.montantFcfa
      parBailleur.set(f.bailleur, part)
    }
  }
  const totalFinance = [...parBailleur.values()].reduce((s, p) => s + p.montantFcfa, 0)
  const parts = [...parBailleur.values()].map((p) => ({ ...p, partPct: totalFinance > 0 ? (p.montantFcfa / totalFinance) * 100 : 0 })).sort((a, b) => b.montantFcfa - a.montantFcfa)
  return {
    budget,
    engage,
    paye,
    physique,
    financier,
    jalonsEnRetard: chantiers.reduce((s, c) => s + c.jalonsEnRetard, 0),
    situationsEnAttente: chantiers.reduce((s, c) => s + c.situationsEnAttente, 0),
    totalFinance,
    parts,
  }
}

export function ProgrammeEcran() {
  const router = useRouter()
  const droits = useDroitsInfra()
  const chantiers = useQuery(infraApi.queries.chantiers, {})
  const operation = useOperation()
  const [statut, setStatut] = useState("tous")
  const [nature, setNature] = useState("toutes")
  const [creation, setCreation] = useState(false)
  const [cleFenetre, setCleFenetre] = useState(0)

  const filtres = chantiers?.filter((c) => (statut === "tous" || c.statut === statut) && (nature === "toutes" || c.nature === nature))
  const s = chantiers ? syntheseProgramme(chantiers) : null

  return (
    <CadreInfra
      titre="Programme de remise à niveau"
      description="Chantiers du PRN de la ligne Owendo–Franceville : budgets, financements, avancement physique et financier établis sur les situations validées."
      actions={
        <>
          <LienBouton href="/infrastructures/prn/rapport">
            <FileText />
            Rapport bailleurs
          </LienBouton>
          {droits.peut("prn_gerer") ? (
            <Button
              type="button"
              onClick={() => {
                setCleFenetre((c) => c + 1)
                setCreation(true)
              }}
            >
              <Plus />
              Créer un chantier
            </Button>
          ) : null}
        </>
      }
    >
      <RetourOperation retour={operation.retour} />
      <Encart icone={FileText} titre={droits.partenaire ? "Espace partenaire : lecture du programme" : "Rapport aux bailleurs"} action={<LienBouton href="/infrastructures/prn/rapport" taille="sm">Ouvrir le rapport</LienBouton>}>
        Apports, avancements et jalons conditionnant les décaissements, filtrés par financeur, exportables et imprimables.
      </Encart>
      <Indicateurs>
        <Indicateur libelle="Budget du programme" icone={Wallet} valeur={s ? xafCompact(s.budget) : "…"} evolution={chantiers ? { sens: "neutre", texte: `${chantiers.length} chantier${chantiers.length > 1 ? "s" : ""}` } : undefined} fort />
        <Indicateur libelle="Engagé" icone={HandCoins} valeur={s ? xafCompact(s.engage) : "…"} evolution={s ? { sens: "neutre", texte: `${pct(s.budget > 0 ? (s.engage / s.budget) * 100 : 0)} du budget` } : undefined} />
        <Indicateur libelle="Payé" icone={Banknote} valeur={s ? xafCompact(s.paye) : "…"} evolution={s ? { sens: "neutre", texte: `${pct(s.financier)} du budget` } : undefined} />
        <Indicateur libelle="Avancement physique" icone={Gauge} valeur={s ? pct(s.physique) : "…"} remplissage={s ? s.physique / 100 : undefined} evolution={{ sens: "neutre", texte: "Pondéré par les budgets" }} />
        <Indicateur libelle="Avancement financier" icone={Banknote} valeur={s ? pct(s.financier) : "…"} remplissage={s ? s.financier / 100 : undefined} evolution={{ sens: "neutre", texte: "Payé sur budget" }} />
        <Indicateur
          libelle="Jalons en retard"
          icone={Flag}
          valeur={s ? nombre(s.jalonsEnRetard) : "…"}
          evolution={s ? { sens: s.jalonsEnRetard > 0 ? "vigilance" : "neutre", texte: s.jalonsEnRetard > 0 ? "Date prévue dépassée" : "Calendrier tenu" } : undefined}
        />
        <Indicateur
          libelle="Situations à valider"
          icone={ClipboardCheck}
          valeur={s ? nombre(s.situationsEnAttente) : "…"}
          evolution={s && s.situationsEnAttente > 0 ? { sens: "vigilance", texte: "Hors avancement tant qu'elles ne sont pas validées" } : undefined}
        />
        <Indicateur
          libelle="Chantiers en cours"
          icone={Construction}
          valeur={chantiers ? nombre(chantiers.filter((c) => c.statut === "en_cours").length) : "…"}
          evolution={chantiers ? { sens: "neutre", texte: `${chantiers.filter((c) => c.statut === "receptionne").length} réceptionné(s)` } : undefined}
        />
      </Indicateurs>

      <TableauDonnees
        libelle="Chantiers du programme"
        colonnes={colonnes}
        lignes={filtres}
        cle={(c) => c.id}
        lien={(c) => `/infrastructures/prn/${c.id}`}
        recherche={{ placeholder: "Code, chantier, entreprise…", texte: (c) => `${c.code} ${c.libelle} ${c.entreprise} ${c.maitreOeuvre} ${c.natureLibelle}` }}
        filtres={
          <>
            <SelectFiltre libelle="Statut" icone={Flag} value={statut} onChange={setStatut}>
              <option value="tous">Tous les statuts</option>
              {Object.entries(STATUTS_CHANTIER).map(([cle, libelle]) => (
                <option key={cle} value={cle}>
                  {libelle}
                </option>
              ))}
            </SelectFiltre>
            <SelectFiltre libelle="Nature" icone={Construction} value={nature} onChange={setNature}>
              <option value="toutes">Toutes les natures</option>
              {Object.entries(NATURES_CHANTIER).map(([cle, libelle]) => (
                <option key={cle} value={cle}>
                  {libelle}
                </option>
              ))}
            </SelectFiltre>
          </>
        }
        exportNom="programme-prn"
        triInitial={{ cle: "code", sens: "asc" }}
        vide={{
          titre: chantiers && chantiers.length > 0 ? "Aucun chantier pour ces filtres" : "Aucun chantier au programme",
          description: chantiers && chantiers.length > 0 ? "Élargissez le statut ou la nature." : "Les chantiers du PRN apparaîtront ici dès leur création.",
        }}
      />

      <Panneau titre="Financements par bailleur" icone={HandCoins} sousTitre={s ? `${xafCompact(s.totalFinance)} financés sur ${xafCompact(s.budget)} de budget` : undefined}>
        {s ? <RepartitionBailleurs parts={s.parts} legende="Répartition des financements du programme par bailleur" /> : <p role="status" className="text-small text-ink-muted">Chargement…</p>}
      </Panneau>

      {droits.peut("prn_gerer") ? (
        <FenetreChantier key={cleFenetre} open={creation} onOpenChange={setCreation} operation={operation} onCree={(id) => router.push(`/infrastructures/prn/${id}` as Route)} />
      ) : null}
    </CadreInfra>
  )
}
