"use client"

import { Banknote, Flag, FlagTriangleRight, Gauge, HandCoins, Landmark, Printer, ShieldCheck, Wallet } from "lucide-react"
import type { Route } from "next"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useEffect, useRef, useState } from "react"

import { useQuery } from "@workspace/api/hooks"
import { Button } from "@workspace/ui/components/button"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { Logo } from "@workspace/ui/marque"

import { CelluleDouble, Indicateur, Indicateurs, LienBouton, Panneau, TableauDonnees, type ColonneTableau } from "@/components/charte"
import { SelectFiltre } from "@/components/gestion/referentiels/elements"
import { dateCourte, nombre } from "@/components/gestion/referentiels/format"

import { CadreInfra, TagEtat, infraApi, pct, plagePk, xaf, xafCompact, type RapportBailleur } from "../commun"
import { dateEtHeure } from "../interventions/partage"
import { Avancement, RepartitionBailleurs } from "./composants"
import { BAILLEURS, ORDRE_BAILLEURS, estBailleur, type Bailleur } from "./libelles"

type LigneRapport = RapportBailleur["chantiers"][number]
type JalonRapport = LigneRapport["jalons"][number]
type JalonDecaissement = JalonRapport & { chantierCode: string; chantierLibelle: string }

/** Bailleur lu dans l'adresse : `?bailleur=afd`. Inconnu → tous. */
export function useBailleurChoisi(): Bailleur | undefined {
  const parametres = useSearchParams()
  const valeur = parametres.get("bailleur") ?? ""
  return estBailleur(valeur) ? valeur : undefined
}

const jalonsAtteints = (l: LigneRapport) => l.jalons.filter((j) => j.statut === "atteint").length
const jalonsEnRetard = (l: LigneRapport) => l.jalons.filter((j) => j.statut === "en_retard").length
const decaissementsEnAttente = (l: LigneRapport) => l.jalonsDecaissement.filter((j) => j.statut !== "atteint")

function colonnesRapport(bailleur: Bailleur | undefined): ColonneTableau<LigneRapport>[] {
  return [
    { cle: "code", libelle: "Code", rendu: (l) => <span className="tabular font-semibold">{l.code}</span>, tri: (l) => l.code },
    { cle: "libelle", libelle: "Chantier", rendu: (l) => <CelluleDouble haut={l.libelle} bas={`${l.natureLibelle} · ${plagePk(l.pkDebut, l.pkFin)}`} />, tri: (l) => l.libelle, export: (l) => `${l.libelle} (${l.natureLibelle})` },
    { cle: "plage", libelle: "Plage PK", rendu: (l) => <span className="tabular">{plagePk(l.pkDebut, l.pkFin)}</span>, tri: (l) => l.pkDebut, export: (l) => plagePk(l.pkDebut, l.pkFin), secondaire: true },
    { cle: "statut", libelle: "Statut", rendu: (l) => <TagEtat valeur={l.statut} libelle={l.statutLibelle} />, tri: (l) => l.statut, export: (l) => l.statutLibelle },
    {
      cle: "apport",
      libelle: bailleur ? `Apport ${BAILLEURS[bailleur]}` : "Financements",
      rendu: (l) => <span className="tabular">{xafCompact(l.montantBailleurFcfa)}</span>,
      tri: (l) => l.montantBailleurFcfa,
      export: (l) => l.montantBailleurFcfa,
      numerique: true,
    },
    { cle: "part", libelle: "Part du budget", rendu: (l) => <span className="tabular">{pct(l.partBailleurPct)}</span>, tri: (l) => l.partBailleurPct, numerique: true },
    { cle: "budget", libelle: "Budget", rendu: (l) => <span className="tabular">{xafCompact(l.budgetFcfa)}</span>, tri: (l) => l.budgetFcfa, export: (l) => l.budgetFcfa, numerique: true },
    { cle: "engage", libelle: "Engagé", rendu: (l) => <span className="tabular">{xafCompact(l.engageFcfa)}</span>, tri: (l) => l.engageFcfa, export: (l) => l.engageFcfa, numerique: true, secondaire: true },
    { cle: "paye", libelle: "Payé", rendu: (l) => <span className="tabular">{xafCompact(l.payeFcfa)}</span>, tri: (l) => l.payeFcfa, export: (l) => l.payeFcfa, numerique: true },
    { cle: "physique", libelle: "Avancement physique", rendu: (l) => <Avancement valeur={l.avancementPhysiquePct} libelle={`Avancement physique de ${l.code}`} />, tri: (l) => l.avancementPhysiquePct, export: (l) => l.avancementPhysiquePct },
    { cle: "financier", libelle: "Avancement financier", rendu: (l) => <Avancement valeur={l.avancementFinancierPct} libelle={`Avancement financier de ${l.code}`} />, tri: (l) => l.avancementFinancierPct, export: (l) => l.avancementFinancierPct },
    {
      cle: "jalons",
      libelle: "Jalons",
      rendu: (l) => (
        <span className="grid text-[13px]">
          <span className="tabular">
            {jalonsAtteints(l)} / {l.jalons.length} atteints
          </span>
          {jalonsEnRetard(l) > 0 ? <span className="font-semibold text-danger-ink">{jalonsEnRetard(l)} en retard</span> : null}
        </span>
      ),
      tri: (l) => jalonsEnRetard(l),
      export: (l) => `${jalonsAtteints(l)}/${l.jalons.length} atteints, ${jalonsEnRetard(l)} en retard`,
    },
    {
      cle: "decaissements",
      libelle: "Décaissements conditionnés",
      rendu: (l) =>
        l.jalonsDecaissement.length === 0 ? (
          <span className="text-ink-muted">Aucun</span>
        ) : (
          <span className="grid text-[13px]">
            <span className="tabular">
              {l.jalonsDecaissement.length - decaissementsEnAttente(l).length} / {l.jalonsDecaissement.length} levés
            </span>
            {decaissementsEnAttente(l).length > 0 ? <span className="text-ink-muted">{decaissementsEnAttente(l).length} en attente</span> : null}
          </span>
        ),
      tri: (l) => decaissementsEnAttente(l).length,
      export: (l) => l.jalonsDecaissement.map((j) => `${j.libelle} : ${j.statutLibelle}${j.bailleurLibelle ? ` (${j.bailleurLibelle})` : ""}`).join(" | "),
    },
  ]
}

const colonnesDecaissements: ColonneTableau<JalonDecaissement>[] = [
  { cle: "chantier", libelle: "Chantier", rendu: (j) => <CelluleDouble haut={j.chantierCode} bas={j.chantierLibelle} mono />, tri: (j) => j.chantierCode, export: (j) => `${j.chantierCode} ${j.chantierLibelle}` },
  { cle: "jalon", libelle: "Jalon", rendu: (j) => <span className="font-semibold">{j.libelle}</span>, tri: (j) => j.libelle },
  { cle: "bailleur", libelle: "Bailleur", rendu: (j) => j.bailleurLibelle ?? "Tous", tri: (j) => j.bailleurLibelle },
  { cle: "prevu", libelle: "Prévu le", rendu: (j) => <span className="tabular">{dateCourte(j.prevuLe)}</span>, tri: (j) => j.prevuLe, export: (j) => dateCourte(j.prevuLe) },
  { cle: "statut", libelle: "Statut", rendu: (j) => <TagEtat valeur={j.statut} libelle={j.statutLibelle} />, tri: (j) => j.statut, export: (j) => j.statutLibelle },
  { cle: "atteint", libelle: "Atteint le", rendu: (j) => <span className="tabular">{dateCourte(j.atteintLe)}</span>, tri: (j) => j.atteintLe, export: (j) => dateCourte(j.atteintLe) },
  { cle: "preuve", libelle: "Preuve", rendu: (j) => j.preuve ?? "—", tri: (j) => j.preuve },
]

export function jalonsDecaissement(rapport: RapportBailleur): JalonDecaissement[] {
  return rapport.chantiers.flatMap((l) => l.jalonsDecaissement.map((j) => ({ ...j, chantierCode: l.code, chantierLibelle: l.libelle })))
}

/** Présentation du rapport, sans lecture : testable avec un rapport fourni. */
export function RapportBailleurVue({ rapport, bailleur }: { rapport: RapportBailleur; bailleur: Bailleur | undefined }) {
  const t = rapport.totaux
  const decaissements = jalonsDecaissement(rapport)
  const suffixe = bailleur ?? "tous"
  return (
    <>
      <InlineMessage tone="info" title={rapport.bailleurLibelle ? `Rapport établi pour ${rapport.bailleurLibelle}` : "Rapport consolidé, tous bailleurs"}>
        {rapport.perimetre} Données arrêtées le <span className="tabular">{dateEtHeure(rapport.genereLe)}</span>.
      </InlineMessage>
      <Indicateurs>
        <Indicateur libelle="Chantiers financés" icone={Landmark} valeur={nombre(t.chantiers)} />
        <Indicateur
          libelle={bailleur ? `Apport ${BAILLEURS[bailleur]}` : "Financements inscrits"}
          icone={HandCoins}
          valeur={xafCompact(t.montantBailleurFcfa)}
          evolution={{ sens: "neutre", texte: `${pct(t.budgetFcfa > 0 ? (t.montantBailleurFcfa / t.budgetFcfa) * 100 : 0)} des budgets concernés` }}
          fort
        />
        <Indicateur libelle="Budgets des chantiers" icone={Wallet} valeur={xafCompact(t.budgetFcfa)} evolution={{ sens: "neutre", texte: `${xafCompact(t.engageFcfa)} engagés` }} />
        <Indicateur libelle="Payé" icone={Banknote} valeur={xafCompact(t.payeFcfa)} />
        <Indicateur libelle="Avancement physique" icone={Gauge} valeur={pct(t.avancementPhysiquePct)} remplissage={t.avancementPhysiquePct / 100} evolution={{ sens: "neutre", texte: "Pondéré par les budgets" }} />
        <Indicateur libelle="Avancement financier" icone={Banknote} valeur={pct(t.avancementFinancierPct)} remplissage={t.avancementFinancierPct / 100} evolution={{ sens: "neutre", texte: "Payé sur budget" }} />
        <Indicateur libelle="Jalons en retard" icone={Flag} valeur={nombre(t.jalonsEnRetard)} evolution={t.jalonsEnRetard > 0 ? { sens: "vigilance", texte: "Date prévue dépassée" } : { sens: "neutre", texte: "Calendrier tenu" }} />
        <Indicateur
          libelle="Décaissements conditionnés en attente"
          icone={FlagTriangleRight}
          valeur={nombre(t.jalonsDecaissementEnAttente)}
          evolution={{ sens: t.jalonsDecaissementEnAttente > 0 ? "vigilance" : "neutre", texte: "Jalon à atteindre avant versement" }}
        />
      </Indicateurs>

      <TableauDonnees
        libelle="Chantiers financés"
        colonnes={colonnesRapport(bailleur)}
        lignes={rapport.chantiers}
        cle={(l) => l.id}
        lien={(l) => `/infrastructures/prn/${l.id}`}
        recherche={{ placeholder: "Code, chantier, entreprise…", texte: (l) => `${l.code} ${l.libelle} ${l.entreprise} ${l.natureLibelle}` }}
        exportNom={`rapport-bailleurs-${suffixe}`}
        triInitial={{ cle: "code", sens: "asc" }}
        vide={{
          titre: bailleur ? `Aucun chantier financé par ${BAILLEURS[bailleur]}` : "Aucun chantier financé",
          description: "Le rapport se remplit dès qu'un financement est inscrit sur un chantier du programme.",
        }}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Panneau titre="Répartition des financements" icone={HandCoins} sousTitre="Sur les chantiers du rapport">
          <RepartitionBailleurs parts={rapport.parBailleur} legende="Répartition des financements par bailleur" />
        </Panneau>
        <Panneau titre="Jalons et décaissements conditionnés" icone={ShieldCheck} sousTitre={`${decaissements.length} jalon${decaissements.length > 1 ? "s" : ""} conditionnant un versement`}>
          <TableauDonnees
            libelle="Jalons de décaissement"
            colonnes={colonnesDecaissements}
            lignes={decaissements}
            cle={(j) => j.id}
            lien={(j) => `/infrastructures/prn/${j.chantierId}`}
            exportNom={`decaissements-${suffixe}`}
            triInitial={{ cle: "prevu", sens: "asc" }}
            parPage={10}
            vide={{ titre: "Aucun décaissement conditionné", description: "Aucun jalon de ces chantiers ne conditionne un versement." }}
          />
        </Panneau>
      </div>
    </>
  )
}

export function RapportBailleursEcran() {
  const router = useRouter()
  const chemin = usePathname()
  const bailleur = useBailleurChoisi()
  const rapport = useQuery(infraApi.queries.rapportBailleur, bailleur ? { bailleur } : {})
  const impression = `/infrastructures/prn/rapport/impression${bailleur ? `?bailleur=${bailleur}` : ""}`

  return (
    <CadreInfra
      titre="Rapport aux bailleurs"
      description="Apports, avancement et jalons conditionnant les décaissements des chantiers du PRN, par financeur. Établi sur les seules situations validées."
      retour={{ href: "/infrastructures/prn", libelle: "Programme PRN" }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <SelectFiltre
          libelle="Bailleur"
          icone={Landmark}
          value={bailleur ?? ""}
          onChange={(valeur) => router.replace(`${chemin}${valeur ? `?bailleur=${valeur}` : ""}` as Route, { scroll: false })}
          className="min-w-[260px]"
        >
          <option value="">Tous les bailleurs</option>
          {ORDRE_BAILLEURS.map((b) => (
            <option key={b} value={b}>
              {BAILLEURS[b]}
            </option>
          ))}
        </SelectFiltre>
        <div className="ml-auto">
          <LienBouton href={impression}>
            <Printer />
            Imprimer le rapport
          </LienBouton>
        </div>
      </div>
      {rapport === undefined ? (
        <div role="status" aria-label="Chargement du rapport" className="text-small text-ink-muted">
          Consolidation du rapport…
        </div>
      ) : (
        <RapportBailleurVue rapport={rapport} bailleur={bailleur} />
      )}
    </CadreInfra>
  )
}

/* ============================================================ Impression */

/**
 * Rapport bailleurs à imprimer ou enregistrer en PDF : page sans coquille,
 * datée, avec la provenance des données.
 */
export function RapportBailleursImprimable() {
  const bailleur = useBailleurChoisi()
  const rapport = useQuery(infraApi.queries.rapportBailleur, bailleur ? { bailleur } : {})
  const [imprimeLe] = useState(() => Date.now())
  const lance = useRef(false)

  useEffect(() => {
    if (!rapport || lance.current) return
    lance.current = true
    const minuterie = window.setTimeout(() => window.print(), 400)
    return () => window.clearTimeout(minuterie)
  }, [rapport])

  const retour = `/infrastructures/prn/rapport${bailleur ? `?bailleur=${bailleur}` : ""}`
  if (rapport === undefined) {
    return (
      <main className="mx-auto max-w-[1100px] p-6">
        <p role="status" className="text-small text-ink-muted">
          Consolidation du rapport…
        </p>
      </main>
    )
  }
  const t = rapport.totaux
  const decaissements = jalonsDecaissement(rapport)
  return (
    <main className="mx-auto grid max-w-[1100px] gap-4 bg-surface p-6 text-ink print:max-w-none print:p-0">
      <header className="flex flex-wrap items-start gap-4 border-b border-line-strong pb-3">
        <Logo variante="compact" title="SETRAG" className="h-8" />
        <div className="grid flex-1 gap-0.5">
          <h1 className="text-[20px] font-bold">Programme de remise à niveau — rapport aux bailleurs</h1>
          <p className="text-[13px] text-ink-muted">{rapport.bailleurLibelle ? `Établi pour ${rapport.bailleurLibelle}` : "Consolidé, tous bailleurs"} · ligne Owendo (PK 0) – Franceville (PK 669)</p>
        </div>
        <div className="text-right text-[12px] text-ink-muted">
          <p>
            Données arrêtées le <span className="tabular">{dateEtHeure(rapport.genereLe)}</span>
          </p>
          <p>
            Imprimé le <span className="tabular">{dateEtHeure(imprimeLe)}</span>
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <LienBouton href={retour} variante="ghost" taille="sm">
            Retour au rapport
          </LienBouton>
          <Button type="button" variant="secondary" size="sm" onClick={() => window.print()}>
            <Printer />
            Imprimer
          </Button>
        </div>
      </header>

      <section className="grid gap-1 text-[13px]">
        <h2 className="text-[15px] font-bold">Synthèse</h2>
        <table className="w-full max-w-[720px] border-collapse">
          <caption className="sr-only">Synthèse du rapport</caption>
          <tbody>
            {[
              ["Chantiers financés", nombre(t.chantiers)],
              [rapport.bailleurLibelle ? `Apport ${rapport.bailleurLibelle}` : "Financements inscrits", xaf(t.montantBailleurFcfa)],
              ["Budgets des chantiers", xaf(t.budgetFcfa)],
              ["Engagé", xaf(t.engageFcfa)],
              ["Payé", xaf(t.payeFcfa)],
              ["Avancement physique (pondéré par les budgets)", pct(t.avancementPhysiquePct)],
              ["Avancement financier (payé sur budget)", pct(t.avancementFinancierPct)],
              ["Jalons en retard", nombre(t.jalonsEnRetard)],
              ["Décaissements conditionnés en attente", nombre(t.jalonsDecaissementEnAttente)],
            ].map(([libelle, valeur]) => (
              <tr key={libelle} className="border-b border-line">
                <th scope="row" className="py-1 pr-3 text-left font-medium">{libelle}</th>
                <td className="tabular py-1 text-right font-semibold">{valeur}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="grid gap-1">
        <h2 className="text-[15px] font-bold">Chantiers financés</h2>
        {rapport.chantiers.length === 0 ? (
          <p className="text-[13px]">Aucun chantier financé pour ce périmètre.</p>
        ) : (
          <table className="w-full border-collapse text-[11.5px]">
            <caption className="sr-only">Chantiers financés</caption>
            <thead>
              <tr className="border-b border-line-strong text-left">
                <th scope="col" className="py-1 pr-2">Chantier</th>
                <th scope="col" className="py-1 pr-2">Statut</th>
                <th scope="col" className="py-1 pr-2 text-right">{rapport.bailleurLibelle ? "Apport" : "Financé"}</th>
                <th scope="col" className="py-1 pr-2 text-right">Part</th>
                <th scope="col" className="py-1 pr-2 text-right">Budget</th>
                <th scope="col" className="py-1 pr-2 text-right">Engagé</th>
                <th scope="col" className="py-1 pr-2 text-right">Payé</th>
                <th scope="col" className="py-1 pr-2 text-right">Physique</th>
                <th scope="col" className="py-1 pr-2 text-right">Financier</th>
                <th scope="col" className="py-1 text-right">Jalons</th>
              </tr>
            </thead>
            <tbody>
              {rapport.chantiers.map((l) => (
                <tr key={l.id} className="break-inside-avoid border-b border-line align-top">
                  <td className="py-1 pr-2">
                    <b className="tabular">{l.code}</b> {l.libelle}
                    <span className="tabular block text-ink-muted">
                      {plagePk(l.pkDebut, l.pkFin)} · {l.entreprise}
                    </span>
                  </td>
                  <td className="py-1 pr-2">{l.statutLibelle}</td>
                  <td className="tabular py-1 pr-2 text-right">{xaf(l.montantBailleurFcfa)}</td>
                  <td className="tabular py-1 pr-2 text-right">{pct(l.partBailleurPct)}</td>
                  <td className="tabular py-1 pr-2 text-right">{xaf(l.budgetFcfa)}</td>
                  <td className="tabular py-1 pr-2 text-right">{xaf(l.engageFcfa)}</td>
                  <td className="tabular py-1 pr-2 text-right">{xaf(l.payeFcfa)}</td>
                  <td className="tabular py-1 pr-2 text-right">{pct(l.avancementPhysiquePct)}</td>
                  <td className="tabular py-1 pr-2 text-right">{pct(l.avancementFinancierPct)}</td>
                  <td className="tabular py-1 text-right">
                    {jalonsAtteints(l)}/{l.jalons.length}
                    {jalonsEnRetard(l) > 0 ? ` · ${jalonsEnRetard(l)} en retard` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="grid gap-1">
        <h2 className="text-[15px] font-bold">Jalons conditionnant un décaissement</h2>
        {decaissements.length === 0 ? (
          <p className="text-[13px]">Aucun jalon de décaissement.</p>
        ) : (
          <table className="w-full border-collapse text-[11.5px]">
            <caption className="sr-only">Jalons conditionnant un décaissement</caption>
            <thead>
              <tr className="border-b border-line-strong text-left">
                <th scope="col" className="py-1 pr-2">Chantier</th>
                <th scope="col" className="py-1 pr-2">Jalon</th>
                <th scope="col" className="py-1 pr-2">Bailleur</th>
                <th scope="col" className="py-1 pr-2">Prévu le</th>
                <th scope="col" className="py-1 pr-2">Statut</th>
                <th scope="col" className="py-1">Preuve</th>
              </tr>
            </thead>
            <tbody>
              {decaissements.map((j) => (
                <tr key={j.id} className="break-inside-avoid border-b border-line align-top">
                  <td className="tabular py-1 pr-2">{j.chantierCode}</td>
                  <td className="py-1 pr-2">{j.libelle}</td>
                  <td className="py-1 pr-2">{j.bailleurLibelle ?? "Tous"}</td>
                  <td className="tabular py-1 pr-2">{dateCourte(j.prevuLe)}</td>
                  <td className="py-1 pr-2">
                    {j.statutLibelle}
                    {j.atteintLe ? <span className="tabular"> le {dateCourte(j.atteintLe)}</span> : null}
                  </td>
                  <td className="py-1">{j.preuve ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="grid gap-1">
        <h2 className="text-[15px] font-bold">Répartition des financements</h2>
        <table className="w-full max-w-[560px] border-collapse text-[12px]">
          <caption className="sr-only">Répartition des financements par bailleur</caption>
          <thead>
            <tr className="border-b border-line-strong text-left">
              <th scope="col" className="py-1 pr-2">Bailleur</th>
              <th scope="col" className="py-1 pr-2 text-right">Montant</th>
              <th scope="col" className="py-1 text-right">Part</th>
            </tr>
          </thead>
          <tbody>
            {rapport.parBailleur.map((p) => (
              <tr key={p.bailleur} className="border-b border-line">
                <td className="py-1 pr-2">{p.bailleurLibelle}</td>
                <td className="tabular py-1 pr-2 text-right">{xaf(p.montantFcfa)}</td>
                <td className="tabular py-1 text-right">{pct(p.partPct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <footer className="border-t border-line pt-2 text-[11px] text-ink-muted">
        Provenance : registre des chantiers du programme de remise à niveau tenu par SETRAG (module Infrastructures ferroviaires et travaux PRN). {rapport.perimetre} Montants en XAF.
        Document arrêté le <span className="tabular">{dateEtHeure(rapport.genereLe)}</span>.
      </footer>
    </main>
  )
}
