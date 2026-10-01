"use client"

import { BrickWall, Clock, Eye, Filter, Plus, ShieldAlert, TriangleAlert } from "lucide-react"
import type { Route } from "next"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { useQuery } from "@workspace/api/hooks"
import { Button } from "@workspace/ui/components/button"

import { Indicateur, Indicateurs, TableauDonnees, type ColonneTableau } from "@/components/charte"
import { RetourOperation, SelectFiltre, useOperation } from "@/components/gestion/referentiels/elements"
import { dateCourte, nombre } from "@/components/gestion/referentiels/format"
import { Pastille } from "@/components/gestion/referentiels/statuts"

import { CadreInfra, TagCotation, TagRetard, infraApi, pk, useDroitsInfra, type LigneOuvrage } from "../commun"
import { FenetreOuvrage } from "./formulaires"
import { COTATIONS, ORDRE_COTATIONS, TYPES_OUVRAGE, type TypeOuvrage } from "./libelles"

const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 })

/** Surveillance renforcée : écrite, jamais signalée par la seule teinte. */
export function TagSurveillance() {
  return (
    <Pastille ton="warning" icone={Eye}>
      Surveillance renforcée
    </Pastille>
  )
}

const colonnes: ColonneTableau<LigneOuvrage>[] = [
  { cle: "code", libelle: "Code", rendu: (o) => <span className="tabular font-semibold">{o.code}</span>, tri: (o) => o.code },
  { cle: "nom", libelle: "Ouvrage", rendu: (o) => <span className="font-semibold">{o.nom}</span>, tri: (o) => o.nom },
  { cle: "type", libelle: "Type", rendu: (o) => o.typeLibelle, tri: (o) => o.typeLibelle },
  { cle: "pk", libelle: "PK", rendu: (o) => <span className="tabular">{pk(o.pk)}</span>, tri: (o) => o.pk, numerique: true },
  { cle: "section", libelle: "Section", rendu: (o) => o.sectionLibelle ?? "—", tri: (o) => o.sectionLibelle, secondaire: true },
  { cle: "longueur", libelle: "Longueur", rendu: (o) => <span className="tabular">{nf.format(o.longueurM)} m</span>, tri: (o) => o.longueurM, numerique: true, secondaire: true },
  { cle: "franchissement", libelle: "Franchissement", rendu: (o) => o.franchissement ?? "—", tri: (o) => o.franchissement, secondaire: true },
  { cle: "cotation", libelle: "Cotation", rendu: (o) => <TagCotation cotation={o.cotation} />, tri: (o) => ORDRE_COTATIONS.indexOf(o.cotation), export: (o) => o.cotationLibelle },
  {
    cle: "surveillance",
    libelle: "Surveillance",
    rendu: (o) => (o.surveillanceRenforcee ? <TagSurveillance /> : <span className="text-ink-muted">Courante</span>),
    tri: (o) => (o.surveillanceRenforcee ? 0 : 1),
    export: (o) => (o.surveillanceRenforcee ? "Renforcée" : "Courante"),
  },
  {
    cle: "derniere",
    libelle: "Dernière inspection",
    rendu: (o) => <span className="tabular">{dateCourte(o.derniereInspectionLe)}</span>,
    tri: (o) => o.derniereInspectionLe,
    export: (o) => dateCourte(o.derniereInspectionLe),
    secondaire: true,
  },
  {
    cle: "prochaine",
    libelle: "Prochaine inspection",
    rendu: (o) => (
      <span className="flex flex-wrap items-center gap-2">
        <span className="tabular">{dateCourte(o.prochaineInspectionLe)}</span>
        {o.inspectionEnRetard ? <TagRetard texte="Inspection en retard" /> : null}
      </span>
    ),
    tri: (o) => o.prochaineInspectionLe,
    export: (o) => `${dateCourte(o.prochaineInspectionLe)}${o.inspectionEnRetard ? " (inspection en retard)" : ""}`,
  },
]

export function OuvragesEcran() {
  const router = useRouter()
  const droits = useDroitsInfra()
  const ouvrages = useQuery(infraApi.queries.ouvrages, {})
  const operation = useOperation()
  const [type, setType] = useState("tous")
  const [cotation, setCotation] = useState("toutes")
  const [retard, setRetard] = useState("tous")
  const [creation, setCreation] = useState(false)

  const filtres = ouvrages?.filter(
    (o) =>
      (type === "tous" || o.type === type) &&
      (cotation === "toutes" || (cotation === "graves" ? o.cotation === "3" || o.cotation === "3U" : o.cotation === cotation)) &&
      (retard === "tous" || (retard === "retard" ? o.inspectionEnRetard : retard === "renforcee" ? o.surveillanceRenforcee : !o.inspectionEnRetard))
  )
  const typesPresents = [...new Set((ouvrages ?? []).map((o) => o.type))] as TypeOuvrage[]
  const cotes3 = ouvrages?.filter((o) => o.cotation === "3").length ?? 0
  const cotes3U = ouvrages?.filter((o) => o.cotation === "3U").length ?? 0
  const enRetard = ouvrages?.filter((o) => o.inspectionEnRetard).length ?? 0
  const renforcee = ouvrages?.filter((o) => o.surveillanceRenforcee).length ?? 0
  const charge = ouvrages !== undefined

  return (
    <CadreInfra
      titre="Ouvrages d'art"
      description="Inventaire des ponts, viaducs, tunnels, buses et murs de la ligne, avec leur cotation IQOA et le calendrier des inspections."
      actions={
        droits.peut("ouvrage_inspecter") ? (
          <Button type="button" onClick={() => setCreation(true)}>
            <Plus />
            Ajouter un ouvrage
          </Button>
        ) : null
      }
    >
      <RetourOperation retour={operation.retour} />
      <Indicateurs>
        <Indicateur libelle="Ouvrages inventoriés" icone={BrickWall} valeur={charge ? nombre(ouvrages.length) : "…"} />
        <Indicateur
          libelle="Cotés 3 ou 3U"
          icone={ShieldAlert}
          valeur={charge ? nombre(cotes3 + cotes3U) : "…"}
          evolution={charge ? { sens: cotes3U > 0 ? "baisse" : cotes3 > 0 ? "vigilance" : "neutre", texte: `${cotes3} en 3, ${cotes3U} en 3U (urgence)` } : undefined}
        />
        <Indicateur
          libelle="Inspections en retard"
          icone={Clock}
          valeur={charge ? nombre(enRetard) : "…"}
          evolution={charge ? { sens: enRetard > 0 ? "vigilance" : "neutre", texte: enRetard > 0 ? "Échéance d'inspection dépassée" : "Calendrier tenu" } : undefined}
        />
        <Indicateur libelle="Sous surveillance renforcée" icone={Eye} valeur={charge ? nombre(renforcee) : "…"} />
      </Indicateurs>
      <TableauDonnees
        libelle="Inventaire des ouvrages d'art"
        colonnes={colonnes}
        lignes={filtres}
        cle={(o) => o.id}
        lien={(o) => `/infrastructures/ouvrages/${o.id}`}
        recherche={{ placeholder: "Code, nom, franchissement, section…", texte: (o) => `${o.code} ${o.nom} ${o.franchissement ?? ""} ${o.sectionLibelle ?? ""} ${o.materiau}` }}
        filtres={
          <>
            <SelectFiltre libelle="Type d'ouvrage" icone={Filter} value={type} onChange={setType}>
              <option value="tous">Tous les types</option>
              {typesPresents.map((t) => (
                <option key={t} value={t}>
                  {TYPES_OUVRAGE[t] ?? t}
                </option>
              ))}
            </SelectFiltre>
            <SelectFiltre libelle="Cotation IQOA" icone={ShieldAlert} value={cotation} onChange={setCotation}>
              <option value="toutes">Toutes les cotations</option>
              <option value="graves">Cotés 3 ou 3U</option>
              {ORDRE_COTATIONS.map((c) => (
                <option key={c} value={c}>
                  {COTATIONS[c]}
                </option>
              ))}
            </SelectFiltre>
            <SelectFiltre libelle="Inspection" icone={TriangleAlert} value={retard} onChange={setRetard}>
              <option value="tous">Toutes les inspections</option>
              <option value="retard">Inspection en retard</option>
              <option value="a_jour">Inspection à jour</option>
              <option value="renforcee">Surveillance renforcée</option>
            </SelectFiltre>
          </>
        }
        exportNom="ouvrages-art"
        triInitial={{ cle: "pk", sens: "asc" }}
        vide={{
          titre: ouvrages && ouvrages.length > 0 ? "Aucun ouvrage pour ces filtres" : "Aucun ouvrage inventorié",
          description: ouvrages && ouvrages.length > 0 ? "Élargissez la cotation ou le type." : "L'inventaire se constitue en ajoutant les ouvrages de la ligne.",
        }}
      />
      <FenetreOuvrage
        open={creation}
        onOpenChange={setCreation}
        operation={operation}
        onCree={(id) => router.push(`/infrastructures/ouvrages/${id}` as Route)}
      />
    </CadreInfra>
  )
}
