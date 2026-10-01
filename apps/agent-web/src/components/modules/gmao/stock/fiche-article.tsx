"use client"

import { ArrowDownToLine, ArrowUpFromLine, Ban, Boxes, ClipboardCheck, Coins, History, Package, PencilLine, Plus, RotateCcw, Settings2, ShieldAlert, ShoppingCart, TrendingDown, Warehouse } from "lucide-react"
import { useState } from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { Button } from "@workspace/ui/components/button"

import { Chronologie, Fiche, Indicateur, Indicateurs, Panneau, TableauDonnees, type ColonneTableau } from "@/components/charte"
import { RetourOperation, useOperation } from "@/components/gestion/referentiels/elements"
import { dateCourte, nombre } from "@/components/gestion/referentiels/format"
import { Pastille } from "@/components/gestion/referentiels/statuts"

import { DialogueDemandeAchat } from "../achats/dialogues-achat"
import { CadreGmao, DossierEnChargement, DossierIntrouvable, gmaoApi, quantite, SENS_MOUVEMENT, STATUTS_ACHAT, TagAchat, useDroitsGmao, xaf, type DossierArticle } from "../commun"
import { chronologieGmao, FenetreAction, GardeDossier, Horodatage, LienInterne } from "../ordres/outils"
import { DialogueArticle, DialogueMouvement, DialogueParametrage, type ModeMouvement } from "./dialogues-stock"
import { quantiteSignee, TagAlerteStock, TagSens } from "./stock"

type Stock = DossierArticle["stocks"][number]
type Mouvement = DossierArticle["mouvements"][number]
type Demande = DossierArticle["demandes"][number]

const RETOUR = { href: "/materiel/stock", libelle: "Stock de pièces" }
const EN_COURS = new Set(["soumise", "validee", "commandee"])

export function PageFicheArticle({ articleId }: { articleId: string }) {
  return (
    <GardeDossier
      key={articleId}
      secours={
        <CadreGmao titre="Article" retour={RETOUR}>
          <DossierIntrouvable quoi="Article" retour={RETOUR} />
        </CadreGmao>
      }
    >
      <FicheArticle articleId={articleId} />
    </GardeDossier>
  )
}

export function FicheArticle({ articleId }: { articleId: string }) {
  const dossier = useQuery(gmaoApi.queries.article, { articleId: articleId as never })
  if (dossier === undefined) {
    return (
      <CadreGmao titre="Article" retour={RETOUR}>
        <DossierEnChargement />
      </CadreGmao>
    )
  }
  if (dossier === null) {
    return (
      <CadreGmao titre="Article introuvable" retour={RETOUR}>
        <DossierIntrouvable quoi="Article" retour={RETOUR} />
      </CadreGmao>
    )
  }
  return <FicheArticleChargee dossier={dossier} />
}

type Fenetre =
  | { type: "mouvement"; mode: ModeMouvement; atelierId?: string }
  | { type: "parametrer"; stock?: Stock }
  | { type: "modifier" }
  | { type: "activation" }
  | { type: "achat"; atelierId?: string }

function FicheArticleChargee({ dossier }: { dossier: DossierArticle }) {
  const droits = useDroitsGmao()
  const operation = useOperation()
  const formulaires = useQuery(gmaoApi.queries.formulaires, {})
  const articles = useQuery(gmaoApi.queries.articles, {})
  const modifier = useMutation(gmaoApi.mutations.modifierArticle)
  const [fenetre, setFenetre] = useState<Fenetre | null>(null)
  const { article, stocks } = dossier

  const peutStock = droits.peut("stock_mouvementer")
  const peutAchat = droits.peut("achat_demander") && article.actif
  const total = stocks.reduce((somme, stock) => somme + stock.quantite, 0)
  const rupture = stocks.some((stock) => stock.quantite === 0)
  const sousSeuil = stocks.some((stock) => stock.sousSeuil)
  const achatsEnCours = dossier.demandes.filter((demande) => EN_COURS.has(demande.statut))
  const succes = (message: string) => operation.signaler({ ton: "success", titre: message })
  const fermer = (ouvert: boolean) => {
    if (!ouvert) setFenetre(null)
  }
  // Prochaine action utile : réapprovisionner un stock en alerte, sinon enregistrer une entrée.
  const principale: "achat" | "entree" | null = sousSeuil && peutAchat ? "achat" : peutStock ? "entree" : peutAchat ? "achat" : null
  const familles = [...new Set((articles ?? []).map((a) => a.famille))].sort((a, b) => a.localeCompare(b, "fr"))
  const ateliersSansStock = (formulaires?.ateliers ?? []).filter((atelier) => !stocks.some((stock) => stock.atelierId === atelier.id))
  const articleFixe = { id: article.id, reference: article.reference, designation: article.designation, unite: article.unite, stocks }

  const colonnesStocks: ColonneTableau<Stock>[] = [
    { cle: "magasin", libelle: "Magasin", rendu: (s) => <span className="grid"><span className="font-semibold">{s.atelier}</span><small className="tabular text-[12.5px] text-ink-muted">{s.atelierCode}</small></span>, tri: (s) => s.atelier },
    { cle: "quantite", libelle: "Quantité", rendu: (s) => quantite(s.quantite, article.unite), tri: (s) => s.quantite, numerique: true },
    { cle: "seuil", libelle: "Seuil", rendu: (s) => quantite(s.seuilReappro), tri: (s) => s.seuilReappro, numerique: true },
    { cle: "reappro", libelle: "Qté à commander", rendu: (s) => quantite(s.quantiteReappro), tri: (s) => s.quantiteReappro, numerique: true, secondaire: true },
    { cle: "emplacement", libelle: "Emplacement", rendu: (s) => s.emplacement, tri: (s) => s.emplacement, secondaire: true },
    {
      cle: "alerte",
      libelle: "Alerte",
      rendu: (s) => (s.quantite === 0 || s.sousSeuil ? <TagAlerteStock rupture={s.quantite === 0} sousSeuil={s.sousSeuil} /> : <span className="text-ink-muted">Stock suffisant</span>),
      tri: (s) => (s.quantite === 0 ? 0 : s.sousSeuil ? 1 : 2),
      export: (s) => (s.quantite === 0 ? "Rupture" : s.sousSeuil ? "Sous le seuil" : "Stock suffisant"),
    },
    ...(peutStock || peutAchat
      ? [
          {
            cle: "actions",
            libelle: "Actions",
            export: false as const,
            rendu: (s: Stock) => (
              <span className="flex flex-wrap justify-end gap-1">
                {peutStock ? (
                  <>
                    <Button type="button" variant="ghost" aria-label={`Paramétrer le magasin ${s.atelierCode}`} onClick={() => setFenetre({ type: "parametrer", stock: s })}>
                      <Settings2 />
                      Paramétrer
                    </Button>
                    <Button type="button" variant="ghost" aria-label={`Entrée au magasin ${s.atelierCode}`} onClick={() => setFenetre({ type: "mouvement", mode: "entree", atelierId: s.atelierId })}>
                      <ArrowDownToLine />
                      Entrée
                    </Button>
                    <Button type="button" variant="ghost" aria-label={`Sortie du magasin ${s.atelierCode}`} onClick={() => setFenetre({ type: "mouvement", mode: "sortie", atelierId: s.atelierId })}>
                      <ArrowUpFromLine />
                      Sortie
                    </Button>
                    <Button type="button" variant="ghost" aria-label={`Inventaire du magasin ${s.atelierCode}`} onClick={() => setFenetre({ type: "mouvement", mode: "inventaire", atelierId: s.atelierId })}>
                      <ClipboardCheck />
                      Inventaire
                    </Button>
                  </>
                ) : null}
                {peutAchat && s.sousSeuil ? (
                  <Button type="button" variant="ghost" aria-label={`Demander un achat pour le magasin ${s.atelierCode}`} onClick={() => setFenetre({ type: "achat", atelierId: s.atelierId })}>
                    <ShoppingCart />
                    Achat
                  </Button>
                ) : null}
              </span>
            ),
          } satisfies ColonneTableau<Stock>,
        ]
      : []),
  ]

  const colonnesMouvements: ColonneTableau<Mouvement>[] = [
    { cle: "le", libelle: "Date", rendu: (m) => <Horodatage le={m.le} />, tri: (m) => m.le, export: (m) => new Date(m.le) },
    { cle: "sens", libelle: "Sens", rendu: (m) => <TagSens sens={m.sens} />, tri: (m) => m.sens, export: (m) => SENS_MOUVEMENT[m.sens] },
    { cle: "magasin", libelle: "Magasin", rendu: (m) => m.atelier, tri: (m) => m.atelier },
    {
      cle: "quantite",
      libelle: "Quantité",
      rendu: (m) => quantiteSignee(m, article.unite),
      tri: (m) => (m.sens === "sortie" ? -m.quantite : m.sens === "entree" ? m.quantite : (m.ecart ?? 0)),
      numerique: true,
    },
    { cle: "apres", libelle: "Stock après", rendu: (m) => quantite(m.quantiteApres), tri: (m) => m.quantiteApres, numerique: true },
    { cle: "valeur", libelle: "Valeur", rendu: (m) => xaf(m.valeurFcfa), tri: (m) => m.valeurFcfa, numerique: true, secondaire: true },
    { cle: "motif", libelle: "Motif", rendu: (m) => <span className="text-[13px]">{m.motif}</span>, tri: (m) => m.motif, secondaire: true },
    {
      cle: "ot",
      libelle: "OT",
      rendu: (m) => (m.otId ? <LienInterne href={`/materiel/ordres/${m.otId}`} mono>{m.otNumero ?? "OT"}</LienInterne> : "—"),
      tri: (m) => m.otNumero ?? "",
    },
    { cle: "auteur", libelle: "Auteur", rendu: (m) => m.auteur ?? "Système", tri: (m) => m.auteur ?? "", secondaire: true },
  ]

  const colonnesDemandes: ColonneTableau<Demande>[] = [
    { cle: "numero", libelle: "Demande", rendu: (d) => <span className="tabular font-semibold">{d.numero}</span>, tri: (d) => d.numero },
    { cle: "le", libelle: "Demandée le", rendu: (d) => <span className="tabular">{dateCourte(d.demandeLe)}</span>, tri: (d) => d.demandeLe, export: (d) => new Date(d.demandeLe) },
    { cle: "statut", libelle: "Statut", rendu: (d) => <TagAchat statut={d.statut} />, tri: (d) => d.statut, export: (d) => STATUTS_ACHAT[d.statut].libelle },
    { cle: "quantite", libelle: "Quantité", rendu: (d) => quantite(d.quantite, article.unite), tri: (d) => d.quantite, numerique: true },
    { cle: "montant", libelle: "Montant", rendu: (d) => xaf(d.montantFcfa), tri: (d) => d.montantFcfa, numerique: true },
  ]

  return (
    <CadreGmao
      titre={`${article.reference} · ${article.designation}`}
      description={`${article.famille} · fournisseur ${article.fournisseur} · livré sous ${nombre(article.delaiApproJours)} j`}
      retour={RETOUR}
      actions={
        peutStock || peutAchat ? (
          <>
            {peutStock ? (
              <>
                <Button type="button" variant="ghost" onClick={() => setFenetre({ type: "activation" })}>
                  {article.actif ? <Ban /> : <RotateCcw />}
                  {article.actif ? "Désactiver" : "Réactiver"}
                </Button>
                <Button type="button" variant="secondary" onClick={() => setFenetre({ type: "modifier" })}>
                  <PencilLine />
                  Modifier
                </Button>
                <Button type="button" variant="secondary" onClick={() => setFenetre({ type: "mouvement", mode: "inventaire" })}>
                  <ClipboardCheck />
                  Inventaire
                </Button>
                <Button type="button" variant="secondary" onClick={() => setFenetre({ type: "mouvement", mode: "sortie" })}>
                  <ArrowUpFromLine />
                  Sortie hors OT
                </Button>
                <Button type="button" variant={principale === "entree" ? "primary" : "secondary"} onClick={() => setFenetre({ type: "mouvement", mode: "entree" })}>
                  <ArrowDownToLine />
                  Entrée en stock
                </Button>
              </>
            ) : null}
            {peutAchat ? (
              <Button type="button" variant={principale === "achat" ? "primary" : "secondary"} onClick={() => setFenetre({ type: "achat" })}>
                <ShoppingCart />
                Demander un achat
              </Button>
            ) : null}
          </>
        ) : undefined
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <TagAlerteStock rupture={rupture} sousSeuil={sousSeuil} />
        {!rupture && !sousSeuil ? <Pastille ton="success">Stock suffisant</Pastille> : null}
        {article.critique ? (
          <Pastille ton="strong" icone={ShieldAlert}>
            Pièce critique
          </Pastille>
        ) : null}
        {!article.actif ? (
          <Pastille ton="neutral" icone={Ban}>
            Désactivé : plus de sortie ni d&apos;achat
          </Pastille>
        ) : null}
      </div>

      <RetourOperation retour={operation.retour} />

      <Indicateurs>
        <Indicateur libelle="Quantité totale" icone={Boxes} valeur={quantite(total)} unite={article.unite} />
        <Indicateur libelle="Valeur" icone={Coins} valeur={xaf(total * article.prixUnitaireFcfa)} />
        <Indicateur libelle="Consommation 6 mois" icone={TrendingDown} valeur={quantite(dossier.consommation6Mois)} unite={article.unite} evolution={{ sens: "neutre", texte: "sorties des 182 derniers jours" }} />
        <Indicateur libelle="Achats en cours" icone={ShoppingCart} valeur={nombre(achatsEnCours.length)} evolution={achatsEnCours.length > 0 ? { sens: "neutre", texte: `${quantite(achatsEnCours.reduce((s, d) => s + d.quantite, 0), article.unite)} attendus` } : undefined} />
      </Indicateurs>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <div className="grid min-w-0 content-start gap-5">
          <Panneau
            titre="Stock par magasin"
            icone={Warehouse}
            actions={
              peutStock ? (
                <Button type="button" variant="secondary" onClick={() => setFenetre({ type: "parametrer" })}>
                  <Plus />
                  Ouvrir dans un magasin
                </Button>
              ) : null
            }
          >
            <TableauDonnees
              libelle={`Stock de ${article.reference} par magasin`}
              colonnes={colonnesStocks}
              lignes={stocks}
              cle={(s) => s.id}
              exportNom={`${article.reference}-stocks`}
              vide={{ titre: "Aucun magasin paramétré", description: "Ouvrez l'article dans un magasin pour fixer son seuil et son emplacement." }}
            />
          </Panneau>

          <Panneau titre="Mouvements" icone={Package} sousTitre="300 derniers">
            <TableauDonnees
              libelle={`Mouvements de ${article.reference}`}
              colonnes={colonnesMouvements}
              lignes={dossier.mouvements}
              cle={(m) => m.id}
              exportNom={`${article.reference}-mouvements`}
              triInitial={{ cle: "le", sens: "desc" }}
              parPage={15}
              vide={{ titre: "Aucun mouvement", description: "Entrées, sorties et inventaires de cet article apparaîtront ici." }}
            />
          </Panneau>

          <Panneau titre="Demandes d'achat" icone={ShoppingCart}>
            <TableauDonnees
              libelle={`Demandes d'achat de ${article.reference}`}
              colonnes={colonnesDemandes}
              lignes={dossier.demandes}
              cle={(d) => d.id}
              lien={(d) => `/materiel/achats/${d.id}`}
              exportNom={`${article.reference}-achats`}
              parPage={10}
              vide={{ titre: "Aucune demande d'achat", description: "Les demandes manuelles, sur OT ou générées sous le seuil apparaissent ici." }}
            />
          </Panneau>
        </div>

        <div className="grid min-w-0 content-start gap-5">
          <Panneau titre="Fiche article" icone={Boxes}>
            <Fiche
              elements={[
                ["Référence", <span key="r" className="tabular">{article.reference}</span>],
                ["Famille", article.famille],
                ["Unité", article.unite],
                ["Prix unitaire", <span key="p" className="tabular">{xaf(article.prixUnitaireFcfa)}</span>],
                ["Fournisseur", article.fournisseur],
                ["Délai d'approvisionnement", `${nombre(article.delaiApproJours)} jours`],
                ["Compatibilité", article.compatibilite],
                ["Pièce critique", article.critique ? "Oui" : "Non"],
                ["État", article.actif ? "Actif" : "Désactivé"],
              ]}
            />
          </Panneau>
          <Panneau titre="Chronologie" icone={History}>
            <Chronologie evenements={chronologieGmao(dossier.chronologie)} />
          </Panneau>
        </div>
      </div>

      {fenetre?.type === "mouvement" ? (
        <DialogueMouvement mode={fenetre.mode} open onOpenChange={fermer} article={articleFixe} atelierId={fenetre.atelierId} onSucces={succes} />
      ) : null}
      {fenetre?.type === "parametrer" ? (
        <DialogueParametrage open onOpenChange={fermer} article={article} stock={fenetre.stock} ateliersSansStock={ateliersSansStock} onSucces={succes} />
      ) : null}
      {fenetre?.type === "modifier" ? <DialogueArticle open onOpenChange={fermer} article={article} familles={familles} onSucces={succes} /> : null}
      {fenetre?.type === "achat" ? <DialogueDemandeAchat open onOpenChange={fermer} articleId={article.id} atelierId={fenetre.atelierId} onSucces={succes} /> : null}
      {fenetre?.type === "activation" ? (
        <FenetreAction
          open
          onOpenChange={fermer}
          titre={article.actif ? `Désactiver ${article.reference} ?` : `Réactiver ${article.reference} ?`}
          description={
            article.actif
              ? "Un article désactivé ne sort plus du magasin et ne se commande plus. Son historique reste consultable ; il peut être réactivé."
              : "L'article redevient disponible pour les sorties, les OT et les achats."
          }
          libelleValider={article.actif ? "Désactiver l'article" : "Réactiver l'article"}
          variante={article.actif ? "danger" : "primary"}
          onSucces={succes}
          action={async () => {
            await modifier({ articleId: article.id, isActive: !article.actif })
            return article.actif ? `${article.reference} désactivé.` : `${article.reference} réactivé.`
          }}
        >
          {achatsEnCours.length > 0 && article.actif ? (
            <p className="text-[14px]">{`${achatsEnCours.length} demande(s) d'achat en cours restent à traiter ou à annuler.`}</p>
          ) : (
            <p className="text-[14px]">L&apos;action est inscrite à la chronologie de l&apos;article.</p>
          )}
        </FenetreAction>
      ) : null}
    </CadreGmao>
  )
}
