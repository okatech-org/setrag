"use client"

import { Clock, Coins, Filter, Plus, ShoppingCart, Truck } from "lucide-react"
import type { Route } from "next"
import { useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"

import { useQuery } from "@workspace/api/hooks"
import { Button } from "@workspace/ui/components/button"

import { CelluleDouble, Indicateur, Indicateurs, TableauDonnees, type ColonneTableau } from "@/components/charte"
import { RetourOperation, SelectFiltre, useOperation } from "@/components/gestion/referentiels/elements"
import { dateCourte, nombre } from "@/components/gestion/referentiels/format"
import { Pastille } from "@/components/gestion/referentiels/statuts"

import { CadreGmao, gmaoApi, ORIGINES_ACHAT, quantite, STATUTS_ACHAT, TagAchat, useDroitsGmao, xaf, type LigneAchat } from "../commun"
import { DialogueDemandeAchat, GenerationSousSeuil, ResultatGeneration } from "./dialogues-achat"

const ORDRE_STATUTS = ["soumise", "validee", "commandee", "recue", "refusee", "annulee"] as const
const EN_COURS = new Set<string>(["soumise", "validee", "commandee"])

/** Livraison dépassée d'une commande non reçue. */
export function livraisonEnRetard(achat: { statut: string; livraisonPrevueLe: number | null }, maintenant: number) {
  return achat.statut === "commandee" && achat.livraisonPrevueLe !== null && achat.livraisonPrevueLe < maintenant
}

export function TagLivraisonRetard() {
  return (
    <Pastille ton="danger" icone={Clock}>
      Livraison en retard
    </Pastille>
  )
}

function colonnesAchats(maintenant: number): ColonneTableau<LigneAchat>[] {
  return [
    { cle: "numero", libelle: "N° demande", rendu: (a) => <span className="tabular font-semibold">{a.numero}</span>, tri: (a) => a.numero },
    {
      cle: "article",
      libelle: "Article",
      rendu: (a) => <CelluleDouble haut={<span className="tabular">{a.reference}</span>} bas={a.designation} />,
      tri: (a) => a.reference,
      export: (a) => `${a.reference} — ${a.designation}`,
    },
    { cle: "magasin", libelle: "Magasin", rendu: (a) => a.atelier, tri: (a) => a.atelier, secondaire: true },
    { cle: "quantite", libelle: "Quantité", rendu: (a) => quantite(a.quantite, a.unite), tri: (a) => a.quantite, numerique: true },
    { cle: "montant", libelle: "Montant", rendu: (a) => xaf(a.montantFcfa), tri: (a) => a.montantFcfa, numerique: true },
    { cle: "origine", libelle: "Origine", rendu: (a) => ORIGINES_ACHAT[a.origine], tri: (a) => ORIGINES_ACHAT[a.origine], secondaire: true },
    { cle: "statut", libelle: "Statut", rendu: (a) => <TagAchat statut={a.statut} />, tri: (a) => ORDRE_STATUTS.indexOf(a.statut), export: (a) => STATUTS_ACHAT[a.statut].libelle },
    {
      cle: "demandeur",
      libelle: "Demandée",
      rendu: (a) => <CelluleDouble haut={<span className="tabular">{dateCourte(a.demandeLe)}</span>} bas={a.demandeur ?? "Génération automatique"} />,
      tri: (a) => a.demandeLe,
      export: (a) => `${dateCourte(a.demandeLe)} · ${a.demandeur ?? "Génération automatique"}`,
      secondaire: true,
    },
    {
      cle: "livraison",
      libelle: "Livraison prévue",
      rendu: (a) =>
        a.livraisonPrevueLe ? (
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="tabular">{dateCourte(a.livraisonPrevueLe)}</span>
            {livraisonEnRetard(a, maintenant) ? <TagLivraisonRetard /> : null}
          </span>
        ) : (
          <span className="text-ink-muted">—</span>
        ),
      tri: (a) => a.livraisonPrevueLe,
      export: (a) => (a.livraisonPrevueLe ? `${dateCourte(a.livraisonPrevueLe)}${livraisonEnRetard(a, maintenant) ? " · en retard" : ""}` : ""),
    },
    { cle: "commande", libelle: "N° commande", rendu: (a) => (a.commandeNumero ? <span className="tabular">{a.commandeNumero}</span> : "—"), tri: (a) => a.commandeNumero ?? "", secondaire: true },
  ]
}

export function EcranAchats() {
  const router = useRouter()
  const parametres = useSearchParams()
  const droits = useDroitsGmao()
  const operation = useOperation()
  const achats = useQuery(gmaoApi.queries.demandesAchat, {})
  const [maintenant] = useState(() => Date.now())
  const [statut, setStatut] = useState(parametres.get("statut") ?? "tous")
  const [origine, setOrigine] = useState("toutes")
  const [demande, setDemande] = useState(false)
  const [generation, setGeneration] = useState(false)
  const [generees, setGenerees] = useState<string[]>([])

  const filtres = achats?.filter(
    (a) =>
      (statut === "tous" ||
        (statut === "en_cours" && EN_COURS.has(a.statut)) ||
        (statut === "en_retard" && livraisonEnRetard(a, maintenant)) ||
        a.statut === statut) &&
      (origine === "toutes" || a.origine === origine)
  )
  const engage = achats?.filter((a) => a.statut === "validee" || a.statut === "commandee").reduce((total, a) => total + a.montantFcfa, 0)
  const enRetard = achats?.filter((a) => livraisonEnRetard(a, maintenant)).length
  const peutDemander = droits.peut("achat_demander")
  const succes = (message: string) => operation.signaler({ ton: "success", titre: message })

  return (
    <CadreGmao
      titre="Achats de pièces"
      description="Demandes d'achat des magasins : validation par un autre agent que le demandeur, commande au fournisseur, réception en stock."
      actions={
        peutDemander ? (
          <>
            <Button type="button" variant="secondary" onClick={() => setGeneration(true)}>
              <ShoppingCart />
              Générer les demandes sous le seuil
            </Button>
            <Button type="button" onClick={() => setDemande(true)}>
              <Plus />
              Demander un achat
            </Button>
          </>
        ) : undefined
      }
    >
      <Indicateurs>
        <Indicateur libelle="À valider" icone={Clock} valeur={achats ? nombre(achats.filter((a) => a.statut === "soumise").length) : "…"} />
        <Indicateur libelle="Montant engagé" icone={Coins} valeur={achats ? xaf(engage) : "…"} evolution={{ sens: "neutre", texte: "demandes validées et commandées" }} />
        <Indicateur libelle="Commandes en attente" icone={Truck} valeur={achats ? nombre(achats.filter((a) => a.statut === "commandee").length) : "…"} />
        <Indicateur
          libelle="Livraisons en retard"
          icone={Clock}
          valeur={enRetard === undefined ? "…" : nombre(enRetard)}
          evolution={enRetard ? { sens: "vigilance", texte: "date de livraison dépassée" } : undefined}
        />
      </Indicateurs>

      <RetourOperation retour={operation.retour} />
      <ResultatGeneration numeros={generees} onFermer={() => setGenerees([])} />

      <TableauDonnees
        libelle="Demandes d'achat"
        colonnes={colonnesAchats(maintenant)}
        lignes={filtres}
        cle={(a) => a.id}
        lien={(a) => `/materiel/achats/${a.id}`}
        recherche={{ placeholder: "N° de demande, référence, désignation, commande…", texte: (a) => `${a.numero} ${a.reference} ${a.designation} ${a.commandeNumero ?? ""} ${a.demandeur ?? ""}` }}
        filtres={
          <>
            <SelectFiltre libelle="Statut" icone={Filter} value={statut} onChange={setStatut}>
              <option value="tous">Tous les statuts</option>
              <option value="en_cours">En cours (à valider, validées, commandées)</option>
              <option value="en_retard">Livraison en retard</option>
              {ORDRE_STATUTS.map((cle) => (
                <option key={cle} value={cle}>
                  {STATUTS_ACHAT[cle].libelle}
                </option>
              ))}
            </SelectFiltre>
            <SelectFiltre libelle="Origine" value={origine} onChange={setOrigine}>
              <option value="toutes">Toutes origines</option>
              {Object.entries(ORIGINES_ACHAT).map(([cle, libelle]) => (
                <option key={cle} value={cle}>
                  {libelle}
                </option>
              ))}
            </SelectFiltre>
          </>
        }
        exportNom="demandes-achat"
        triInitial={{ cle: "demandeur", sens: "desc" }}
        vide={{
          titre: achats && achats.length > 0 ? "Aucune demande ne répond à ces filtres" : "Aucune demande d'achat",
          description:
            achats && achats.length > 0
              ? "Retirez un filtre pour élargir la liste."
              : "Les demandes naissent d'un OT, d'une fiche article ou de la génération automatique sous le seuil.",
        }}
      />

      {demande ? (
        <DialogueDemandeAchat
          open
          onOpenChange={setDemande}
          onSucces={succes}
          onCree={({ demandeId }) => router.push(`/materiel/achats/${demandeId}` as Route)}
        />
      ) : null}
      <GenerationSousSeuil open={generation} onOpenChange={setGeneration} onGenere={setGenerees} onSucces={succes} />
    </CadreGmao>
  )
}
