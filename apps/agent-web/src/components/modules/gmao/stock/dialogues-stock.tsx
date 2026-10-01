"use client"

import { useState } from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { Checkbox } from "@workspace/ui/components/choice"
import { Field, Input, SelectNative, Textarea } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import { gmaoApi, quantite, xaf, type DossierArticle } from "../commun"
import { FenetreAction, quantiteSaisie, texteObligatoire } from "../ordres/outils"

export type ModeMouvement = "entree" | "sortie" | "inventaire"

const TITRES: Record<ModeMouvement, string> = {
  entree: "Entrée en stock",
  sortie: "Sortie hors OT",
  inventaire: "Inventaire",
}

const DESCRIPTIONS: Record<ModeMouvement, string> = {
  entree: "Réception hors commande, transfert reçu, retour d'atelier : la quantité s'ajoute au magasin choisi.",
  sortie: "Prélèvement qui ne relève d'aucun OT (prêt, mise au rebut, transfert). Une pièce montée sur un engin se consomme depuis son OT.",
  inventaire: "Saisissez la quantité comptée en rayon : l'écart avec le stock théorique est enregistré comme ajustement.",
}

/** Article imposé (fiche article) : ses stocks par magasin, actif ou non. */
export interface ArticleFixe {
  id: string
  reference: string
  designation: string
  unite: string
  stocks: readonly { atelierId: string; quantite: number }[]
}

/** Écart d'inventaire arrondi au centième, signé. */
export function ecartInventaire(comptee: number, theorique: number) {
  return Math.round((comptee - theorique) * 100) / 100
}

export function libelleEcart(ecart: number, unite: string) {
  if (ecart === 0) return "Aucun écart : le stock compté est égal au stock théorique."
  return `Écart : ${ecart > 0 ? "+" : "−"}${quantite(Math.abs(ecart), unite)} (${ecart > 0 ? "surplus" : "manquant"})`
}

/**
 * Mouvement de stock hors OT : entrée, sortie ou ajustement d'inventaire.
 * L'écart d'inventaire est calculé et affiché avant la validation.
 */
export function DialogueMouvement({
  mode,
  open,
  onOpenChange,
  article: articleFixe,
  atelierId,
  onSucces,
}: {
  mode: ModeMouvement
  open: boolean
  onOpenChange: (open: boolean) => void
  article?: ArticleFixe
  atelierId?: string
  onSucces?: (message: string) => void
}) {
  const formulaires = useQuery(gmaoApi.queries.formulaires, open ? {} : "skip")
  const entree = useMutation(gmaoApi.mutations.entreeStock)
  const sortie = useMutation(gmaoApi.mutations.sortieStock)
  const inventaire = useMutation(gmaoApi.mutations.ajusterInventaire)
  const [articleId, setArticleId] = useState(articleFixe?.id ?? "")
  const [magasin, setMagasin] = useState(atelierId ?? "")
  const [qte, setQte] = useState("")

  const choisi: ArticleFixe | undefined = articleFixe ?? formulaires?.articles.find((candidat) => candidat.id === articleId)
  const magasinEffectif = magasin || formulaires?.ateliers[0]?.id || ""
  const theorique = choisi?.stocks.find((stock) => stock.atelierId === magasinEffectif)?.quantite ?? 0
  const saisie = Number(qte.replace(",", "."))
  const saisieValide = qte.trim() !== "" && Number.isFinite(saisie)
  const ecart = mode === "inventaire" && choisi && saisieValide ? ecartInventaire(saisie, theorique) : null
  const apres = choisi && saisieValide ? (mode === "entree" ? theorique + saisie : mode === "sortie" ? theorique - saisie : saisie) : null

  return (
    <FenetreAction
      open={open}
      onOpenChange={onOpenChange}
      titre={TITRES[mode]}
      description={DESCRIPTIONS[mode]}
      libelleValider={mode === "inventaire" ? "Enregistrer l'ajustement" : mode === "entree" ? "Enregistrer l'entrée" : "Enregistrer la sortie"}
      onSucces={onSucces}
      action={async (donnees) => {
        const article = texteObligatoire(donnees, "articleId", "L'article") as never
        const atelier = texteObligatoire(donnees, "atelierId", "Le magasin") as never
        const motif = texteObligatoire(donnees, "motif", "Le motif")
        const valeur = quantiteSaisie(donnees, "quantite", mode === "inventaire" ? "La quantité comptée" : "La quantité")
        const unite = choisi?.unite
        if (mode === "inventaire") {
          const resultat = await inventaire({ articleId: article, atelierId: atelier, quantiteComptee: valeur, motif })
          setQte("")
          return `Inventaire enregistré · ${libelleEcart(resultat.ecart, unite ?? "")} · stock ${quantite(resultat.quantiteApres, unite)}.`
        }
        const resultat = await (mode === "entree" ? entree : sortie)({ articleId: article, atelierId: atelier, quantite: valeur, motif })
        setQte("")
        return `${mode === "entree" ? "Entrée" : "Sortie"} enregistrée · stock ${quantite(resultat.quantiteApres, unite)}.`
      }}
    >
      {formulaires === undefined ? (
        <p role="status" className="text-small text-ink-muted">
          Chargement des articles…
        </p>
      ) : (
        <>
          {articleFixe ? (
            <>
              <input type="hidden" name="articleId" value={articleFixe.id} />
              <p className="text-[14px]">
                <span className="tabular font-semibold">{articleFixe.reference}</span> — {articleFixe.designation}
              </p>
            </>
          ) : (
            <Field label="Article">
              <SelectNative name="articleId" value={articleId} onChange={(event) => setArticleId(event.target.value)} required>
                <option value="">Choisir un article…</option>
                {formulaires.articles.map((candidat) => (
                  <option key={candidat.id} value={candidat.id}>
                    {candidat.reference} — {candidat.designation}
                  </option>
                ))}
              </SelectNative>
            </Field>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Magasin" hint={choisi ? `Stock théorique : ${quantite(theorique, choisi.unite)}` : undefined}>
              <SelectNative name="atelierId" value={magasinEffectif} onChange={(event) => setMagasin(event.target.value)} required>
                {formulaires.ateliers.map((atelier) => (
                  <option key={atelier.id} value={atelier.id}>
                    {atelier.code} — {atelier.nom}
                  </option>
                ))}
              </SelectNative>
            </Field>
            <Field
              label={mode === "inventaire" ? "Quantité comptée" : "Quantité"}
              hint={apres !== null && mode !== "inventaire" && choisi ? `Stock après : ${quantite(apres, choisi.unite)}` : "Deux décimales au plus"}
            >
              <Input name="quantite" inputMode="decimal" required value={qte} onChange={(event) => setQte(event.target.value)} className="tabular" />
            </Field>
          </div>
          {ecart !== null && choisi ? (
            <InlineMessage tone={ecart === 0 ? "info" : "warning"} title={libelleEcart(ecart, choisi.unite)}>
              {ecart === 0
                ? "Le serveur refuse un ajustement sans écart."
                : `Stock théorique ${quantite(theorique, choisi.unite)} → compté ${quantite(saisie, choisi.unite)}.`}
            </InlineMessage>
          ) : null}
          {mode === "sortie" && apres !== null && apres < 0 && choisi ? (
            <InlineMessage tone="warning" title="Stock insuffisant dans ce magasin">
              {`Il n'en reste que ${quantite(theorique, choisi.unite)} : le serveur refusera la sortie.`}
            </InlineMessage>
          ) : null}
          <Field label="Motif" hint={mode === "inventaire" ? "Ex. Inventaire tournant de septembre" : "Ex. Bon de livraison 4512, transfert vers Booué"}>
            <Textarea name="motif" required maxLength={300} />
          </Field>
        </>
      )}
    </FenetreAction>
  )
}

/** Création ou modification d'un article du catalogue. */
export function DialogueArticle({
  open,
  onOpenChange,
  article,
  familles,
  onCree,
  onSucces,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Article à modifier ; absent pour une création. */
  article?: DossierArticle["article"]
  /** Familles existantes, proposées à la saisie. */
  familles: readonly string[]
  onCree?: (articleId: string) => void
  onSucces?: (message: string) => void
}) {
  const creer = useMutation(gmaoApi.mutations.creerArticle)
  const modifier = useMutation(gmaoApi.mutations.modifierArticle)
  const [critique, setCritique] = useState(article?.critique ?? false)
  const entier = (donnees: FormData, cle: string, libelle: string) => {
    const valeur = quantiteSaisie(donnees, cle, libelle)
    if (!Number.isInteger(valeur) || valeur <= 0) throw new Error(`${libelle} est un nombre entier strictement positif.`)
    return valeur
  }
  return (
    <FenetreAction
      open={open}
      onOpenChange={onOpenChange}
      titre={article ? `Modifier ${article.reference}` : "Créer un article"}
      description={article ? "La référence et l'unité ne changent pas : elles portent l'historique des mouvements." : "L'article entre au catalogue ; son stock se paramètre ensuite magasin par magasin."}
      libelleValider={article ? "Enregistrer" : "Créer l'article"}
      large
      onSucces={onSucces}
      action={async (donnees) => {
        const champs = {
          designation: texteObligatoire(donnees, "designation", "La désignation"),
          famille: texteObligatoire(donnees, "famille", "La famille"),
          prixUnitaireFcfa: entier(donnees, "prix", "Le prix unitaire"),
          fournisseur: texteObligatoire(donnees, "fournisseur", "Le fournisseur"),
          delaiApproJours: entier(donnees, "delai", "Le délai d'approvisionnement"),
          critique,
          compatibilite: texteObligatoire(donnees, "compatibilite", "La compatibilité"),
        }
        if (article) {
          await modifier({ articleId: article.id, ...champs })
          return `${article.reference} mis à jour.`
        }
        const reference = texteObligatoire(donnees, "reference", "La référence")
        const { articleId } = await creer({ reference, unite: texteObligatoire(donnees, "unite", "L'unité"), ...champs })
        onCree?.(articleId)
        return `Article ${reference.toUpperCase()} créé.`
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {article ? null : (
          <Field label="Référence" hint="Unique, mise en majuscules">
            <Input name="reference" required maxLength={40} className="tabular" autoComplete="off" />
          </Field>
        )}
        <Field label="Famille" hint="Ex. Freinage, Traction, Roulement">
          <Input name="famille" required maxLength={60} list="gmao-familles-articles" defaultValue={article?.famille ?? ""} />
        </Field>
        <datalist id="gmao-familles-articles">
          {familles.map((famille) => (
            <option key={famille} value={famille} />
          ))}
        </datalist>
      </div>
      <Field label="Désignation">
        <Input name="designation" required maxLength={200} defaultValue={article?.designation ?? ""} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        {article ? null : (
          <Field label="Unité" hint="Ex. pièce, kg, L, jeu">
            <Input name="unite" required maxLength={12} />
          </Field>
        )}
        <Field label="Prix unitaire (XAF)">
          <Input name="prix" inputMode="numeric" required className="tabular" defaultValue={article ? String(article.prixUnitaireFcfa) : ""} />
        </Field>
        <Field label="Délai d'appro. (jours)">
          <Input name="delai" inputMode="numeric" required className="tabular" defaultValue={article ? String(article.delaiApproJours) : ""} />
        </Field>
      </div>
      <Field label="Fournisseur">
        <Input name="fournisseur" required maxLength={120} defaultValue={article?.fournisseur ?? ""} />
      </Field>
      <Field label="Compatibilité" hint="Séries d'engins sur lesquelles la pièce se monte">
        <Input name="compatibilite" required maxLength={300} defaultValue={article?.compatibilite ?? ""} />
      </Field>
      <Checkbox label="Pièce critique : sa rupture immobilise un engin" checked={critique} onCheckedChange={(valeur) => setCritique(valeur === true)} />
      {article ? <p className="text-small text-ink-muted">{`Prix actuel : ${xaf(article.prixUnitaireFcfa)} · les mouvements passés gardent leur valeur.`}</p> : null}
    </FenetreAction>
  )
}

/** Seuil, quantité de réapprovisionnement et emplacement d'un article dans un magasin. */
export function DialogueParametrage({
  open,
  onOpenChange,
  article,
  stock,
  ateliersSansStock,
  onSucces,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  article: DossierArticle["article"]
  /** Stock existant ; absent pour ouvrir l'article dans un nouveau magasin. */
  stock?: DossierArticle["stocks"][number]
  ateliersSansStock: readonly { id: string; code: string; nom: string }[]
  onSucces?: (message: string) => void
}) {
  const parametrer = useMutation(gmaoApi.mutations.parametrerStock)
  const positif = (donnees: FormData, cle: string, libelle: string) => {
    const valeur = quantiteSaisie(donnees, cle, libelle)
    if (valeur < 0) throw new Error(`${libelle} ne peut pas être négatif.`)
    return valeur
  }
  return (
    <FenetreAction
      open={open}
      onOpenChange={onOpenChange}
      titre={stock ? `Paramétrer le magasin ${stock.atelierCode}` : `Ouvrir ${article.reference} dans un magasin`}
      description="Au seuil ou en dessous, le stock est signalé et entre dans la génération automatique des demandes d'achat."
      libelleValider="Enregistrer"
      onSucces={onSucces}
      action={async (donnees) => {
        const atelierId = stock ? stock.atelierId : texteObligatoire(donnees, "atelierId", "Le magasin")
        await parametrer({
          articleId: article.id,
          atelierId: atelierId as never,
          seuilReappro: positif(donnees, "seuil", "Le seuil"),
          quantiteReappro: positif(donnees, "quantiteReappro", "La quantité de réapprovisionnement"),
          emplacement: texteObligatoire(donnees, "emplacement", "L'emplacement"),
        })
        return stock ? `Paramètres du magasin ${stock.atelierCode} enregistrés.` : "Magasin ouvert pour cet article."
      }}
    >
      {stock ? null : ateliersSansStock.length === 0 ? (
        <InlineMessage tone="info" title="Tous les magasins sont déjà paramétrés">
          Modifiez les paramètres depuis la ligne du magasin.
        </InlineMessage>
      ) : (
        <Field label="Magasin">
          <SelectNative name="atelierId" required defaultValue="">
            <option value="">Choisir un magasin…</option>
            {ateliersSansStock.map((atelier) => (
              <option key={atelier.id} value={atelier.id}>
                {atelier.code} — {atelier.nom}
              </option>
            ))}
          </SelectNative>
        </Field>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={`Seuil de réappro. (${article.unite})`}>
          <Input name="seuil" inputMode="decimal" required className="tabular" defaultValue={stock ? String(stock.seuilReappro) : ""} />
        </Field>
        <Field label={`Quantité à commander (${article.unite})`}>
          <Input name="quantiteReappro" inputMode="decimal" required className="tabular" defaultValue={stock ? String(stock.quantiteReappro) : ""} />
        </Field>
      </div>
      <Field label="Emplacement" hint="Allée, rayon, casier">
        <Input name="emplacement" required maxLength={60} defaultValue={stock?.emplacement ?? ""} />
      </Field>
      {stock ? <input type="hidden" name="atelierId" value={stock.atelierId} /> : null}
    </FenetreAction>
  )
}
