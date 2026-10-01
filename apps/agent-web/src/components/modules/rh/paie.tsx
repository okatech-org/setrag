"use client"

import type { FunctionReturnType } from "convex/server"
import { Calculator, CheckCheck, Download, FolderOpen, Lock, Send, Undo2, Users, Wallet } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { Field, Input, Textarea } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import { CelluleDouble, Chronologie, Indicateur, Indicateurs, Panneau, TableauDonnees, suffixeDate, telechargerCsv, type ColonneTableau } from "@/components/charte"
import { Onglets, RetourOperation, useOperation } from "@/components/gestion/referentiels/elements"
import { dateHeure, millions, nombre } from "@/components/gestion/referentiels/format"
import { FenetreFormulaire, nombreSaisi, texte } from "@/components/gestion/referentiels/formulaire"

import { CadreRh, TagDeclaration, TagPeriode, useAccesRh } from "./cadre-rh"
import { AccesRestreint, Chargement, Introuvable, Montant, chronologie, xaf, type Id } from "./commun"
import { METIERS, STATUTS_PERIODE, nomGare } from "./libelles"

type Periodes = FunctionReturnType<typeof api.modules.rh.paie.listerPeriodes>
type LignePeriode = Periodes["periodes"][number]

const libellePeriode = (code: string) => {
  const [annee, mois] = code.split("-").map(Number) as [number, number]
  return new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }).format(Date.UTC(annee, mois - 1, 15)).replace(/^./, (c) => c.toUpperCase())
}

export function ListePaie() {
  const router = useRouter()
  const { peut, acces } = useAccesRh()
  const autorise = peut("paie.lire") || peut("declarations.lire")
  const donnees = useQuery(api.modules.rh.paie.listerPeriodes, autorise ? {} : "skip")
  const ouvrir = useMutation(api.modules.rh.paie.ouvrirPeriode)
  const operation = useOperation()

  const colonnes: ColonneTableau<LignePeriode>[] = [
    { cle: "periode", libelle: "Période", rendu: (p) => <CelluleDouble haut={p.libelle} bas={<span className="tabular">{p.code}</span>} />, tri: (p) => p.code, export: (p) => p.libelle },
    { cle: "statut", libelle: "État", rendu: (p) => <TagPeriode statut={p.statut} />, tri: (p) => p.statut, export: (p) => STATUTS_PERIODE[p.statut] },
    { cle: "effectif", libelle: "Bulletins", rendu: (p) => nombre(p.totaux?.effectif), tri: (p) => p.totaux?.effectif ?? 0, numerique: true },
    { cle: "brut", libelle: "Masse brute", rendu: (p) => <Montant valeur={p.totaux?.brut} />, tri: (p) => p.totaux?.brut ?? 0, numerique: true },
    { cle: "net", libelle: "Net versé", rendu: (p) => <Montant valeur={p.totaux?.net} />, tri: (p) => p.totaux?.net ?? 0, numerique: true, secondaire: true },
    { cle: "cout", libelle: "Coût employeur", rendu: (p) => <Montant valeur={p.totaux?.coutEmployeur} />, tri: (p) => p.totaux?.coutEmployeur ?? 0, numerique: true, secondaire: true },
    {
      cle: "declarations",
      libelle: "Déclarations sociales",
      rendu: (p) =>
        p.declarations.length === 0 ? (
          <span className="text-ink-muted">{p.statut === "cloturee" ? "À transmettre" : "Après clôture"}</span>
        ) : (
          <span className="flex flex-wrap gap-1">
            {p.declarations.map((d) => (
              <span key={d._id} className="inline-flex items-center gap-1 text-[13px]">
                <b>{d.organisme}</b>
                <TagDeclaration statut={d.statut} />
              </span>
            ))}
          </span>
        ),
      export: (p) => p.declarations.map((d) => `${d.organisme} ${d.statut}`).join(" / "),
    },
  ]

  return (
    <CadreRh
      titre="Paie et déclarations sociales"
      description="Paie gabonaise calculée par période : bulletins, cotisations CNSS et CNAMGS, IRPP et TCS, validation, clôture et déclarations aux organismes (télédéclaration simulée)."
      actions={
        peut("paie.preparer") && donnees?.prochaineAOuvrir ? (
          <Button
            type="button"
            loading={operation.enCours === "ouvrir"}
            loadingLabel="Ouverture…"
            onClick={async () => {
              const resultat = await operation.executer("ouvrir", () => ouvrir({ code: donnees.prochaineAOuvrir! }))
              if (resultat) router.push(`/rh/paie/${resultat.periodeId}`)
            }}
          >
            <FolderOpen />
            Ouvrir la paie de {libellePeriode(donnees.prochaineAOuvrir).toLowerCase()}
          </Button>
        ) : null
      }
    >
      <RetourOperation retour={operation.retour} />
      {acces && !autorise ? (
        <AccesRestreint>Votre profil ne consulte pas la paie.</AccesRestreint>
      ) : (
        <>
          {!peut("paie.lire") && peut("declarations.lire") ? (
            <InlineMessage tone="info" title="Organismes et direction">
              Seules les périodes clôturées sont communiquées : état des charges et déclarations.
            </InlineMessage>
          ) : null}
          <TableauDonnees
            libelle="Périodes de paie"
            colonnes={colonnes}
            lignes={donnees?.periodes}
            cle={(p) => p._id}
            lien={(p) => `/rh/paie/${p._id}`}
            exportNom="periodes-paie"
            triInitial={{ cle: "periode", sens: "desc" }}
            vide={{ titre: "Aucune période de paie", description: peut("paie.preparer") ? "Ouvrez la première période pour saisir les éléments variables." : undefined }}
          />
        </>
      )}
    </CadreRh>
  )
}

/* ════════════════════════════ Période ═══════════════════════════════════ */

type DossierPeriodeDto = NonNullable<FunctionReturnType<typeof api.modules.rh.paie.periode>>
type LigneBulletin = DossierPeriodeDto["bulletins"][number]
type LigneVariables = NonNullable<FunctionReturnType<typeof api.modules.rh.paie.variables>>[number]
type EtatCharges = NonNullable<FunctionReturnType<typeof api.modules.rh.paie.etatCharges>>
type LigneCharges = EtatCharges["lignes"][number]

const RETOUR = { href: "/rh/paie", libelle: "Paie et déclarations" }

export function DossierPeriode({ periodeId }: { periodeId: string }) {
  const { peut, charge } = useAccesRh()
  if (!charge) {
    return (
      <CadreRh titre="Période de paie" retour={RETOUR}>
        <Chargement />
      </CadreRh>
    )
  }
  return peut("paie.lire") ? <PeriodeComplete periodeId={periodeId as Id<"rhPeriodesPaie">} /> : <PeriodeOrganisme periodeId={periodeId as Id<"rhPeriodesPaie">} />
}

function PeriodeComplete({ periodeId }: { periodeId: Id<"rhPeriodesPaie"> }) {
  const { peut } = useAccesRh()
  const dossier = useQuery(api.modules.rh.paie.periode, { periodeId })
  const [onglet, setOnglet] = useState<"bulletins" | "variables" | "charges" | "declarations" | "historique">("bulletins")
  const operation = useOperation()
  const calculer = useMutation(api.modules.rh.paie.calculerPeriode)
  const valider = useMutation(api.modules.rh.paie.validerPeriode)
  const cloturer = useMutation(api.modules.rh.paie.cloturerPeriode)
  const transmettre = useMutation(api.modules.rh.paie.transmettreDeclaration)
  const renvoyer = useMutation(api.modules.rh.paie.renvoyerALaSaisie)
  const [renvoi, setRenvoi] = useState(false)

  if (dossier === undefined) {
    return (
      <CadreRh titre="Période de paie" retour={RETOUR}>
        <Chargement />
      </CadreRh>
    )
  }
  if (dossier === null) {
    return (
      <CadreRh titre="Période introuvable" retour={RETOUR}>
        <Introuvable titre="Cette période n'existe pas" retour={RETOUR} />
      </CadreRh>
    )
  }
  const { periode } = dossier
  const t = periode.totaux
  const statut = periode.statut
  const declares = new Set(dossier.declarations.filter((d) => d.statut !== "rejetee").map((d) => d.organisme))

  const actions = (
    <>
      {(statut === "calculee" || statut === "validee") && peut("paie.valider") ? (
        <Button type="button" variant="danger" onClick={() => setRenvoi(true)}>
          <Undo2 />
          Renvoyer à la saisie
        </Button>
      ) : null}
      {statut === "calculee" && peut("paie.preparer") ? (
        <Button type="button" variant="secondary" loading={operation.enCours === "calcul"} loadingLabel="Calcul…" onClick={() => operation.executer("calcul", () => calculer({ periodeId }), (r) => `Paie recalculée : ${r.totaux.effectif} bulletins.`)}>
          <Calculator />
          Recalculer
        </Button>
      ) : null}
      {statut === "ouverte" && peut("paie.preparer") ? (
        <Button type="button" loading={operation.enCours === "calcul"} loadingLabel="Calcul…" onClick={() => operation.executer("calcul", () => calculer({ periodeId }), (r) => `Paie calculée : ${r.totaux.effectif} bulletins, net ${xaf(r.totaux.net)}.`)}>
          <Calculator />
          Calculer la paie
        </Button>
      ) : null}
      {statut === "calculee" && peut("paie.valider") ? (
        <Button type="button" loading={operation.enCours === "valider"} loadingLabel="Validation…" onClick={() => operation.executer("valider", () => valider({ periodeId }), (r) => `${r.bulletins} bulletins validés.`)}>
          <CheckCheck />
          Valider la paie
        </Button>
      ) : null}
      {statut === "validee" && peut("paie.preparer") ? (
        <Button type="button" loading={operation.enCours === "cloturer"} loadingLabel="Clôture…" onClick={() => operation.executer("cloturer", () => cloturer({ periodeId }), "Période clôturée : les déclarations sociales peuvent partir.")}>
          <Lock />
          Clôturer la période
        </Button>
      ) : null}
      {statut === "cloturee" && peut("declarations.transmettre")
        ? (["CNSS", "CNAMGS"] as const)
            .filter((organisme) => !declares.has(organisme))
            .map((organisme) => (
              <Button
                key={organisme}
                type="button"
                variant="secondary"
                loading={operation.enCours === organisme}
                loadingLabel="Transmission…"
                onClick={() => operation.executer(organisme, () => transmettre({ periodeId, organisme }), (r) => `Déclaration ${organisme} transmise (simulation) : ${xaf(r.total)}. L'accusé arrive sous peu.`)}
              >
                <Send />
                Déclarer à la {organisme}
              </Button>
            ))
        : null}
    </>
  )

  return (
    <CadreRh titre={`Paie de ${periode.libelle.toLowerCase()}`} description={`Du ${periode.debut.split("-").reverse().join("/")} au ${periode.fin.split("-").reverse().join("/")} · paramètres ${dossier.parametres.code}`} retour={RETOUR} actions={actions}>
      <div className="flex flex-wrap items-center gap-2">
        <TagPeriode statut={statut} />
        <span className="text-small text-ink-muted">{dossier.parametres.libelle}</span>
      </div>
      <RetourOperation retour={operation.retour} />
      {statut === "calculee" && peut("paie.preparer") && !peut("paie.valider") ? (
        <InlineMessage tone="info" title="En attente de validation">
          La paie calculée doit être validée par une autre personne (direction des ressources humaines) avant la clôture.
        </InlineMessage>
      ) : null}
      {statut === "calculee" && periode.calculeePar && peut("paie.valider") ? (
        <InlineMessage tone="info" title="Séparation des tâches">
          Calculée par {periode.calculeeParNom} : la personne qui calcule ne peut pas valider.
        </InlineMessage>
      ) : null}

      <Indicateurs colonnes={4}>
        <Indicateur libelle="Bulletins" icone={Users} valeur={nombre(t?.effectif ?? 0)} unite={`sur ${dossier.effectifPayable} agents payables`} />
        <Indicateur libelle="Masse brute" icone={Wallet} valeur={millions(t?.brut)} unite="XAF" evolution={t ? { sens: "neutre", texte: xaf(t.brut) } : undefined} />
        <Indicateur libelle="Net à verser" valeur={millions(t?.net)} unite="XAF" evolution={t ? { sens: "neutre", texte: xaf(t.net) } : undefined} />
        <Indicateur libelle="Coût employeur" valeur={millions(t?.coutEmployeur)} unite="XAF" evolution={t ? { sens: "neutre", texte: `Charges patronales ${xaf(t.cnssPatronal + t.cnamgsPatronal)}` } : undefined} />
      </Indicateurs>

      <Onglets
        libelle="Période de paie"
        valeur={onglet}
        onChange={setOnglet}
        onglets={[
          { cle: "bulletins", libelle: "Livre de paie", compte: dossier.bulletins.length },
          { cle: "variables", libelle: "Éléments variables", compte: dossier.variablesSaisies },
          { cle: "charges", libelle: "État des charges" },
          { cle: "declarations", libelle: "Déclarations", compte: dossier.declarations.length },
          { cle: "historique", libelle: "Historique" },
        ]}
      />
      <div role="tabpanel">
        {onglet === "bulletins" ? <LivreDePaie periodeId={periodeId} libelle={periode.code} bulletins={dossier.bulletins} statut={statut} /> : null}
        {onglet === "variables" ? <VariablesPeriode periodeId={periodeId} modifiable={(statut === "ouverte" || statut === "calculee") && peut("paie.preparer")} statut={statut} /> : null}
        {onglet === "charges" ? <VoletEtatCharges periodeId={periodeId} /> : null}
        {onglet === "declarations" ? <VoletDeclarations declarations={dossier.declarations} statut={statut} /> : null}
        {onglet === "historique" ? (
          <Panneau titre="Historique de la période">
            <Chronologie evenements={chronologie(dossier.chronologie)} />
          </Panneau>
        ) : null}
      </div>

      <FenetreFormulaire
        open={renvoi}
        onOpenChange={setRenvoi}
        titre="Renvoyer la paie à la saisie"
        description="Les bulletins calculés sont retirés ; le service paie corrige les éléments variables puis relance le calcul."
        libelleValider="Renvoyer"
        variante="danger"
        enCours={operation.enCours === "renvoi"}
        erreur={operation.retour?.ton === "danger" ? operation.retour.detail : null}
        onSubmit={async (d) => {
          const ok = await operation.executer("renvoi", () => renvoyer({ periodeId, motif: String(d.get("motif") ?? "") }).then(() => true), "Paie renvoyée à la saisie.")
          if (ok) setRenvoi(false)
        }}
      >
        <Field label="Motif du renvoi" htmlFor="renvoi-motif">
          <Textarea id="renvoi-motif" name="motif" required minLength={3} placeholder="Heures supplémentaires du dépôt d'Owendo à reprendre." />
        </Field>
      </FenetreFormulaire>
    </CadreRh>
  )
}

function LivreDePaie({ periodeId, libelle, bulletins, statut }: { periodeId: Id<"rhPeriodesPaie">; libelle: string; bulletins: LigneBulletin[]; statut: string }) {
  const tracer = useMutation(api.modules.rh.paie.tracerDocument)
  const colonnes: ColonneTableau<LigneBulletin>[] = [
    { cle: "matricule", libelle: "Matricule", rendu: (b) => <span className="tabular">{b.matricule}</span>, tri: (b) => b.matricule },
    { cle: "agent", libelle: "Agent", rendu: (b) => <CelluleDouble haut={b.nomComplet} bas={`${b.poste} · ${nomGare(b.gareCode)}`} />, tri: (b) => b.nomComplet, export: (b) => b.nomComplet },
    { cle: "jours", libelle: "Jours", rendu: (b) => b.joursPayes, tri: (b) => b.joursPayes, numerique: true, secondaire: true },
    { cle: "brut", libelle: "Brut", rendu: (b) => <Montant valeur={b.brut} />, tri: (b) => b.brut, numerique: true },
    { cle: "cotisations", libelle: "CNSS + CNAMGS", rendu: (b) => <Montant valeur={b.cotisationsSalariales} />, tri: (b) => b.cotisationsSalariales, numerique: true, secondaire: true },
    { cle: "impots", libelle: "IRPP + TCS", rendu: (b) => <Montant valeur={b.impots} />, tri: (b) => b.impots, numerique: true, secondaire: true },
    { cle: "net", libelle: "Net à payer", rendu: (b) => <Montant valeur={b.net} className="font-semibold" />, tri: (b) => b.net, numerique: true },
    { cle: "cout", libelle: "Coût employeur", rendu: (b) => <Montant valeur={b.coutEmployeur} />, tri: (b) => b.coutEmployeur, numerique: true, secondaire: true },
  ]
  const exporter = async (lignes: readonly LigneBulletin[]) => {
    await tracer({ objet: "livre_paie", periodeId, format: "csv" })
    telechargerCsv(
      `livre-paie-${libelle}-${suffixeDate()}`,
      [
        { libelle: "Matricule", valeur: (b: LigneBulletin) => b.matricule },
        { libelle: "Agent", valeur: (b: LigneBulletin) => b.nomComplet },
        { libelle: "Poste", valeur: (b: LigneBulletin) => b.poste },
        { libelle: "Jours payés", valeur: (b: LigneBulletin) => b.joursPayes },
        { libelle: "Brut (XAF)", valeur: (b: LigneBulletin) => b.brut },
        { libelle: "Cotisations salariales (XAF)", valeur: (b: LigneBulletin) => b.cotisationsSalariales },
        { libelle: "IRPP + TCS (XAF)", valeur: (b: LigneBulletin) => b.impots },
        { libelle: "Net (XAF)", valeur: (b: LigneBulletin) => b.net },
        { libelle: "Charges patronales (XAF)", valeur: (b: LigneBulletin) => b.chargesPatronales },
        { libelle: "Coût employeur (XAF)", valeur: (b: LigneBulletin) => b.coutEmployeur },
      ],
      lignes
    )
  }
  return (
    <TableauDonnees
      libelle="Livre de paie"
      colonnes={colonnes}
      lignes={bulletins}
      cle={(b) => b._id}
      lien={(b) => `/rh/paie/bulletins/${b._id}`}
      recherche={{ placeholder: "Nom, matricule…", texte: (b) => `${b.nomComplet} ${b.matricule} ${b.poste}` }}
      outils={
        <Button type="button" variant="secondary" size="sm" disabled={bulletins.length === 0} onClick={() => void exporter(bulletins)}>
          <Download />
          Exporter le livre de paie ({bulletins.length})
        </Button>
      }
      triInitial={{ cle: "matricule", sens: "asc" }}
      vide={{
        titre: statut === "ouverte" ? "Paie non calculée" : "Aucun bulletin",
        description: statut === "ouverte" ? "Saisissez les éléments variables puis lancez le calcul." : undefined,
      }}
    />
  )
}

function VariablesPeriode({ periodeId, modifiable, statut }: { periodeId: Id<"rhPeriodesPaie">; modifiable: boolean; statut: string }) {
  const lignes = useQuery(api.modules.rh.paie.variables, { periodeId })
  const [saisie, setSaisie] = useState<LigneVariables | null>(null)
  const [filtre, setFiltre] = useState<"saisis" | "tous">("saisis")
  const colonnes: ColonneTableau<LigneVariables>[] = [
    { cle: "matricule", libelle: "Matricule", rendu: (l) => <span className="tabular">{l.matricule}</span>, tri: (l) => l.matricule },
    { cle: "agent", libelle: "Agent", rendu: (l) => <CelluleDouble haut={l.nomComplet} bas={`${METIERS[l.metier]} · ${nomGare(l.gareCode)}`} />, tri: (l) => l.nomComplet, export: (l) => l.nomComplet },
    { cle: "hs", libelle: "H. sup. 125/150/200", rendu: (l) => (l.variables ? <span className="tabular">{l.variables.heuresSup125} / {l.variables.heuresSup150} / {l.variables.heuresSup200}</span> : "—"), export: (l) => (l.variables ? `${l.variables.heuresSup125}/${l.variables.heuresSup150}/${l.variables.heuresSup200}` : "") },
    { cle: "km", libelle: "Km traction", rendu: (l) => nombre(l.variables?.kmTraction), tri: (l) => l.variables?.kmTraction ?? 0, numerique: true, secondaire: true },
    { cle: "nuits", libelle: "Découchés", rendu: (l) => nombre(l.variables?.nuitsDecouche), tri: (l) => l.variables?.nuitsDecouche ?? 0, numerique: true, secondaire: true },
    { cle: "absence", libelle: "Absences", rendu: (l) => nombre(l.variables?.joursAbsence), tri: (l) => l.variables?.joursAbsence ?? 0, numerique: true, secondaire: true },
    { cle: "avance", libelle: "Avance", rendu: (l) => <Montant valeur={l.variables?.avanceSalaireFcfa} />, tri: (l) => l.variables?.avanceSalaireFcfa ?? 0, numerique: true, secondaire: true },
    { cle: "maj", libelle: "Saisi", rendu: (l) => (l.majLe ? <span className="tabular text-[13px]">{dateHeure(l.majLe)}</span> : "—"), tri: (l) => l.majLe ?? 0, secondaire: true },
    {
      cle: "action",
      libelle: "",
      export: false,
      rendu: (l) =>
        modifiable ? (
          <Button type="button" variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setSaisie(l) }}>
            Saisir
          </Button>
        ) : null,
    },
  ]
  return (
    <div className="grid gap-3">
      {!modifiable && (statut === "validee" || statut === "cloturee") ? (
        <InlineMessage tone="info" title="Éléments figés">
          La période est {statut === "cloturee" ? "clôturée" : "validée"} : les éléments variables ne se modifient plus.
        </InlineMessage>
      ) : null}
      {modifiable && statut === "calculee" ? (
        <InlineMessage tone="warning" title="Recalcul nécessaire">
          Toute saisie ramène la période à la saisie et retire les bulletins calculés.
        </InlineMessage>
      ) : null}
      <TableauDonnees
        libelle="Éléments variables de paie"
        colonnes={colonnes}
        lignes={lignes?.filter((l) => filtre === "tous" || l.variables)}
        cle={(l) => l.agentId}
        recherche={{ placeholder: "Nom, matricule…", texte: (l) => `${l.nomComplet} ${l.matricule}` }}
        filtres={
          <div role="group" aria-label="Lignes affichées" className="flex gap-1.5">
            {(["saisis", "tous"] as const).map((cle) => (
              <Button key={cle} type="button" size="sm" variant={filtre === cle ? "secondary" : "ghost"} aria-pressed={filtre === cle} onClick={() => setFiltre(cle)}>
                {cle === "saisis" ? "Agents avec saisie" : "Tous les agents payables"}
              </Button>
            ))}
          </div>
        }
        exportNom="elements-variables"
        triInitial={{ cle: "matricule", sens: "asc" }}
        vide={{ titre: "Aucun élément variable saisi", description: "Affichez tous les agents payables pour saisir heures, découchés ou primes." }}
      />
      {saisie ? <DialogueVariables periodeId={periodeId} ligne={saisie} onClose={() => setSaisie(null)} /> : null}
    </div>
  )
}

function DialogueVariables({ periodeId, ligne, onClose }: { periodeId: Id<"rhPeriodesPaie">; ligne: LigneVariables; onClose: () => void }) {
  const enregistrer = useMutation(api.modules.rh.paie.enregistrerVariables)
  const operation = useOperation()
  const v = ligne.variables
  const champ = (nom: string, libelle: string, valeur: number | undefined, aide?: string) => (
    <Field label={libelle} htmlFor={`var-${nom}`} hint={aide}>
      <Input id={`var-${nom}`} name={nom} inputMode="decimal" defaultValue={valeur ?? 0} />
    </Field>
  )
  return (
    <FenetreFormulaire
      open
      onOpenChange={(o) => !o && onClose()}
      large
      titre={`Éléments variables · ${ligne.nomComplet}`}
      description={`${ligne.matricule} · ${METIERS[ligne.metier]}. Les montants sont en XAF ; le moteur contrôle les bornes avant d'enregistrer.`}
      libelleValider="Enregistrer"
      enCours={operation.enCours === "variables"}
      erreur={operation.retour?.ton === "danger" ? operation.retour.detail : null}
      onSubmit={async (d) => {
        const n = (cle: string) => nombreSaisi(d, cle) ?? 0
        const ok = await operation.executer("variables", () =>
          enregistrer({
            periodeId,
            agentId: ligne.agentId,
            heuresSup125: n("hs125"),
            heuresSup150: n("hs150"),
            heuresSup200: n("hs200"),
            kmTraction: n("km"),
            nuitsDecouche: n("nuits"),
            primeExceptionnelleFcfa: n("prime"),
            joursAbsence: n("absence"),
            avanceSalaireFcfa: n("avance"),
            commentaire: texte(d, "commentaire"),
          }).then(() => true)
        )
        if (ok) onClose()
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        {champ("hs125", "Heures sup. à 125 %", v?.heuresSup125)}
        {champ("hs150", "Heures sup. à 150 %", v?.heuresSup150)}
        {champ("hs200", "Heures sup. à 200 %", v?.heuresSup200, "Nuit, dimanche, jour férié")}
        {champ("km", "Kilomètres de traction", v?.kmTraction, "Conducteurs : 15 XAF/km")}
        {champ("nuits", "Nuits de découché", v?.nuitsDecouche, "Indemnité non soumise")}
        {champ("absence", "Jours d'absence non payée", v?.joursAbsence)}
        {champ("prime", "Prime exceptionnelle (XAF)", v?.primeExceptionnelleFcfa)}
        {champ("avance", "Avance à retenir (XAF)", v?.avanceSalaireFcfa)}
      </div>
      <Field label="Commentaire" htmlFor="var-commentaire">
        <Textarea id="var-commentaire" name="commentaire" defaultValue={ligne.commentaire ?? ""} />
      </Field>
    </FenetreFormulaire>
  )
}

function VoletEtatCharges({ periodeId }: { periodeId: Id<"rhPeriodesPaie"> }) {
  const etat = useQuery(api.modules.rh.paie.etatCharges, { periodeId })
  const tracer = useMutation(api.modules.rh.paie.tracerDocument)
  if (etat === undefined) return <Chargement />
  if (etat === null) return null
  const t = etat.totaux
  const colonnes: ColonneTableau<LigneCharges>[] = [
    { cle: "matricule", libelle: "Matricule", rendu: (l) => <span className="tabular">{l.matricule}</span>, tri: (l) => l.matricule },
    { cle: "agent", libelle: "Agent", rendu: (l) => <CelluleDouble haut={l.nomComplet} bas={l.numeroCnss ? `CNSS ${l.numeroCnss}` : "N° CNSS manquant"} />, tri: (l) => l.nomComplet, export: (l) => l.nomComplet },
    { cle: "assietteCnss", libelle: "Assiette CNSS", rendu: (l) => <Montant valeur={l.assietteCnss} />, tri: (l) => l.assietteCnss, numerique: true },
    { cle: "cnssSal", libelle: "CNSS sal.", rendu: (l) => <Montant valeur={l.cnssSalarie} />, tri: (l) => l.cnssSalarie, numerique: true, secondaire: true },
    { cle: "cnssPat", libelle: "CNSS pat.", rendu: (l) => <Montant valeur={l.cnssPatronal} />, tri: (l) => l.cnssPatronal, numerique: true, secondaire: true },
    { cle: "cnamgsSal", libelle: "CNAMGS sal.", rendu: (l) => <Montant valeur={l.cnamgsSalarie} />, tri: (l) => l.cnamgsSalarie, numerique: true, secondaire: true },
    { cle: "cnamgsPat", libelle: "CNAMGS pat.", rendu: (l) => <Montant valeur={l.cnamgsPatronal} />, tri: (l) => l.cnamgsPatronal, numerique: true, secondaire: true },
    { cle: "irpp", libelle: "IRPP", rendu: (l) => <Montant valeur={l.irpp} />, tri: (l) => l.irpp, numerique: true },
    { cle: "tcs", libelle: "TCS", rendu: (l) => <Montant valeur={l.tcs} />, tri: (l) => l.tcs, numerique: true },
  ]
  const exporter = async () => {
    await tracer({ objet: "etat_charges", periodeId, format: "csv" })
    telechargerCsv(
      `etat-charges-${etat.periode.code}-${suffixeDate()}`,
      [
        { libelle: "Matricule", valeur: (l: LigneCharges) => l.matricule },
        { libelle: "Agent", valeur: (l: LigneCharges) => l.nomComplet },
        { libelle: "N° CNSS", valeur: (l: LigneCharges) => l.numeroCnss },
        { libelle: "N° CNAMGS", valeur: (l: LigneCharges) => l.numeroCnamgs },
        { libelle: "Brut soumis (XAF)", valeur: (l: LigneCharges) => l.brutSoumis },
        { libelle: "Assiette CNSS (XAF)", valeur: (l: LigneCharges) => l.assietteCnss },
        { libelle: "CNSS salariale (XAF)", valeur: (l: LigneCharges) => l.cnssSalarie },
        { libelle: "CNSS patronale (XAF)", valeur: (l: LigneCharges) => l.cnssPatronal },
        { libelle: "Assiette CNAMGS (XAF)", valeur: (l: LigneCharges) => l.assietteCnamgs },
        { libelle: "CNAMGS salariale (XAF)", valeur: (l: LigneCharges) => l.cnamgsSalarie },
        { libelle: "CNAMGS patronale (XAF)", valeur: (l: LigneCharges) => l.cnamgsPatronal },
        { libelle: "IRPP (XAF)", valeur: (l: LigneCharges) => l.irpp },
        { libelle: "TCS (XAF)", valeur: (l: LigneCharges) => l.tcs },
      ],
      etat.lignes
    )
  }
  return (
    <div className="grid gap-4">
      <Indicateurs colonnes={4}>
        <Indicateur libelle="CNSS à verser" valeur={millions(t.cnssSalarie + t.cnssPatronal)} unite="XAF" evolution={{ sens: "neutre", texte: `Salariale ${xaf(t.cnssSalarie)} · patronale ${xaf(t.cnssPatronal)}` }} />
        <Indicateur libelle="CNAMGS à verser" valeur={millions(t.cnamgsSalarie + t.cnamgsPatronal)} unite="XAF" evolution={{ sens: "neutre", texte: `Salariale ${xaf(t.cnamgsSalarie)} · patronale ${xaf(t.cnamgsPatronal)}` }} />
        <Indicateur libelle="IRPP retenu" valeur={millions(t.irpp)} unite="XAF" evolution={{ sens: "neutre", texte: xaf(t.irpp) }} />
        <Indicateur libelle="TCS retenue" valeur={millions(t.tcs)} unite="XAF" evolution={{ sens: "neutre", texte: xaf(t.tcs) }} />
      </Indicateurs>
      <TableauDonnees
        libelle="État des charges sociales et fiscales"
        colonnes={colonnes}
        lignes={etat.lignes}
        cle={(l) => l.bulletinId}
        recherche={{ placeholder: "Nom, matricule, n° CNSS…", texte: (l) => `${l.nomComplet} ${l.matricule} ${l.numeroCnss ?? ""}` }}
        outils={
          <Button type="button" variant="secondary" size="sm" disabled={etat.lignes.length === 0} onClick={() => void exporter()}>
            <Download />
            Exporter l&apos;état des charges ({etat.lignes.length})
          </Button>
        }
        triInitial={{ cle: "matricule", sens: "asc" }}
        vide={{ titre: "Aucune charge", description: "La paie de cette période n'est pas encore calculée." }}
      />
    </div>
  )
}

function VoletDeclarations({ declarations, statut }: { declarations: DossierPeriodeDto["declarations"]; statut: string }) {
  type Declaration = DossierPeriodeDto["declarations"][number]
  const colonnes: ColonneTableau<Declaration>[] = [
    { cle: "numero", libelle: "N°", rendu: (d) => <span className="tabular font-semibold">{d.numero}</span>, tri: (d) => d.numero },
    { cle: "organisme", libelle: "Organisme", rendu: (d) => d.organisme, tri: (d) => d.organisme },
    { cle: "effectif", libelle: "Salariés", rendu: (d) => d.effectif, tri: (d) => d.effectif, numerique: true },
    { cle: "assiette", libelle: "Assiette", rendu: (d) => <Montant valeur={d.assiette} />, tri: (d) => d.assiette, numerique: true, secondaire: true },
    { cle: "total", libelle: "Montant dû", rendu: (d) => <Montant valeur={d.total} className="font-semibold" />, tri: (d) => d.total, numerique: true },
    { cle: "transmise", libelle: "Transmise", rendu: (d) => <span className="tabular">{dateHeure(d.transmiseLe)}</span>, tri: (d) => d.transmiseLe, secondaire: true },
    { cle: "reference", libelle: "Références", rendu: (d) => <CelluleDouble haut={d.referenceTransmission} bas={d.referenceAccuse ? `Accusé ${d.referenceAccuse}` : "Accusé attendu"} mono />, export: (d) => `${d.referenceTransmission} ${d.referenceAccuse ?? ""}` },
    { cle: "statut", libelle: "État", rendu: (d) => <TagDeclaration statut={d.statut} />, tri: (d) => d.statut },
  ]
  return (
    <div className="grid gap-3">
      <InlineMessage tone="info" title="Télédéclaration simulée">
        Le guichet de la CNSS et de la CNAMGS n&apos;est pas raccordé : les montants sont calculés sur les bulletins réels, la transmission et l&apos;accusé de réception sont simulés.
      </InlineMessage>
      <TableauDonnees
        libelle="Déclarations sociales"
        colonnes={colonnes}
        lignes={declarations}
        cle={(d) => d._id}
        exportNom="declarations-sociales"
        vide={{ titre: "Aucune déclaration", description: statut === "cloturee" ? "Transmettez les déclarations depuis l'en-tête." : "Les déclarations partent après la clôture de la période." }}
      />
    </div>
  )
}

/** Vue des organismes sociaux et de la direction : état des charges d'une période clôturée. */
function PeriodeOrganisme({ periodeId }: { periodeId: Id<"rhPeriodesPaie"> }) {
  const etat = useQuery(api.modules.rh.paie.etatCharges, { periodeId })
  if (etat === undefined) {
    return (
      <CadreRh titre="Période de paie" retour={RETOUR}>
        <Chargement />
      </CadreRh>
    )
  }
  if (etat === null) {
    return (
      <CadreRh titre="Période introuvable" retour={RETOUR}>
        <Introuvable titre="Cette période n'existe pas" retour={RETOUR} />
      </CadreRh>
    )
  }
  return (
    <CadreRh titre={`Charges sociales de ${etat.periode.libelle.toLowerCase()}`} retour={RETOUR}>
      <div className="flex flex-wrap gap-2">
        <TagPeriode statut={etat.periode.statut} />
      </div>
      <VoletEtatCharges periodeId={periodeId} />
      <VoletDeclarations declarations={etat.declarations} statut={etat.periode.statut} />
    </CadreRh>
  )
}
