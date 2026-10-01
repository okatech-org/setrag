"use client"

import { ListChecks } from "lucide-react"
import { useState } from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { Button } from "@workspace/ui/components/button"
import { Field, Input, SelectNative, Textarea } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import { FenetreAction, LienInterne, quantiteSaisie, texteObligatoire } from "../ordres/outils"
import { gmaoApi, quantite, xaf } from "../commun"

/**
 * Demande d'achat d'une pièce : depuis la liste des achats, la fiche d'un
 * article (article prérempli) ou un OT (article au choix, OT lié).
 */
export function DialogueDemandeAchat({
  open,
  onOpenChange,
  articleId,
  atelierId,
  ot,
  onCree,
  onSucces,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  articleId?: string
  atelierId?: string
  ot?: { id: string; numero: string }
  onCree?: (resultat: { demandeId: string; numero: string }) => void
  onSucces?: (message: string) => void
}) {
  const formulaires = useQuery(gmaoApi.queries.formulaires, open ? {} : "skip")
  const demander = useMutation(gmaoApi.mutations.demanderAchat)
  const [article, setArticle] = useState(articleId ?? "")
  const [magasin, setMagasin] = useState(atelierId ?? "")
  const [qte, setQte] = useState("")

  const choisi = formulaires?.articles.find((candidat) => candidat.id === article)
  const magasinEffectif = magasin || formulaires?.ateliers[0]?.id || ""
  const enStock = choisi?.stocks.find((stock) => stock.atelierId === magasinEffectif)?.quantite ?? 0
  const nombreSaisi = Number(qte.replace(",", "."))
  const estime = choisi && qte && Number.isFinite(nombreSaisi) ? nombreSaisi * choisi.prixUnitaireFcfa : null

  return (
    <FenetreAction
      open={open}
      onOpenChange={onOpenChange}
      titre={ot ? `Demander une pièce pour ${ot.numero}` : "Demander un achat"}
      description="La demande part en validation. Un autre agent que vous la valide avant la commande."
      libelleValider="Soumettre la demande"
      onSucces={onSucces}
      action={async (donnees) => {
        const articleChoisi = texteObligatoire(donnees, "articleId", "L'article")
        const atelier = texteObligatoire(donnees, "atelierId", "Le magasin")
        const resultat = await demander({
          articleId: articleChoisi as never,
          atelierId: atelier as never,
          quantite: quantiteSaisie(donnees, "quantite"),
          motif: texteObligatoire(donnees, "motif", "Le motif"),
          otId: (ot?.id as never) ?? undefined,
        })
        setQte("")
        onCree?.({ demandeId: resultat.demandeId, numero: resultat.numero })
        return `Demande ${resultat.numero} soumise à validation.`
      }}
    >
      {formulaires === undefined ? (
        <p role="status" className="text-small text-ink-muted">
          Chargement des articles…
        </p>
      ) : (
        <>
          {ot ? (
            <InlineMessage tone="info" title={`Rattachée à l'ordre de travail ${ot.numero}`}>
              Le coût de la pièce s&apos;imputera à l&apos;OT lors de sa consommation.
            </InlineMessage>
          ) : null}
          <Field label="Article" hint={choisi ? `Prix unitaire ${xaf(choisi.prixUnitaireFcfa)} · unité : ${choisi.unite}` : "Seuls les articles actifs se commandent"}>
            <SelectNative name="articleId" value={article} onChange={(event) => setArticle(event.target.value)} required>
              <option value="">Choisir un article…</option>
              {formulaires.articles.map((candidat) => (
                <option key={candidat.id} value={candidat.id}>
                  {candidat.reference} — {candidat.designation}
                </option>
              ))}
            </SelectNative>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Magasin à livrer" hint={choisi ? `En stock : ${quantite(enStock, choisi.unite)}` : undefined}>
              <SelectNative name="atelierId" value={magasinEffectif} onChange={(event) => setMagasin(event.target.value)} required>
                {formulaires.ateliers.map((atelier) => (
                  <option key={atelier.id} value={atelier.id}>
                    {atelier.code} — {atelier.nom}
                  </option>
                ))}
              </SelectNative>
            </Field>
            <Field label="Quantité" hint={estime !== null ? `Montant estimé : ${xaf(estime)}` : "Deux décimales au plus"}>
              <Input name="quantite" inputMode="decimal" required value={qte} onChange={(event) => setQte(event.target.value)} className="tabular" />
            </Field>
          </div>
          <Field label="Motif" hint="Pourquoi cet achat, pour quel engin ou quel besoin">
            <Textarea name="motif" required maxLength={500} defaultValue={ot ? `Pièce nécessaire à l'${ot.numero}` : ""} />
          </Field>
        </>
      )}
    </FenetreAction>
  )
}

/**
 * Génère une demande par stock passé sous son seuil sans achat en cours. Le
 * résultat liste les demandes créées, chacune vers son dossier.
 */
export function GenerationSousSeuil({
  open,
  onOpenChange,
  onGenere,
  onSucces,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onGenere: (numeros: string[]) => void
  onSucces?: (message: string) => void
}) {
  const generer = useMutation(gmaoApi.mutations.genererDemandesSousSeuil)
  return (
    <FenetreAction
      open={open}
      onOpenChange={onOpenChange}
      titre="Générer les demandes sous le seuil"
      description="Une demande d'achat par magasin dont le stock est au seuil ou en dessous, sauf si un achat y est déjà en cours."
      libelleValider="Générer les demandes"
      onSucces={onSucces}
      action={async () => {
        const { crees } = await generer({})
        onGenere(crees)
        return crees.length === 0
          ? "Aucune demande à générer : chaque stock sous le seuil a déjà un achat en cours."
          : `${crees.length} demande(s) d'achat générée(s), en attente de validation.`
      }}
    >
      <p className="text-[14px]">
        La quantité demandée est la quantité de réapprovisionnement paramétrée, ou de quoi revenir à deux fois le seuil si elle est plus grande.
      </p>
    </FenetreAction>
  )
}

/** Demandes générées : chaque numéro mène à son dossier. */
export function ResultatGeneration({ numeros, onFermer }: { numeros: readonly string[]; onFermer: () => void }) {
  const demandes = useQuery(gmaoApi.queries.demandesAchat, numeros.length > 0 ? {} : "skip")
  if (numeros.length === 0) return null
  const parNumero = new Map((demandes ?? []).map((demande) => [demande.numero, demande]))
  return (
    <section aria-label="Demandes générées" className="grid gap-2 rounded-md border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <ListChecks aria-hidden className="size-[18px] text-ink-muted" />
        <h2 className="text-[15px] font-bold">Demandes générées ({numeros.length})</h2>
        <Button type="button" variant="ghost" className="ml-auto" onClick={onFermer}>
          Masquer
        </Button>
      </div>
      <ul className="grid gap-1 text-[14px]">
        {numeros.map((numero) => {
          const demande = parNumero.get(numero)
          return (
            <li key={numero} className="flex flex-wrap items-center gap-x-3">
              {demande ? (
                <LienInterne href={`/materiel/achats/${demande.id}`} mono>
                  {numero}
                </LienInterne>
              ) : (
                <span className="tabular font-semibold">{numero}</span>
              )}
              {demande ? (
                <span className="text-ink-muted">
                  {demande.reference} · {quantite(demande.quantite, demande.unite)} · magasin {demande.atelier} · <span className="tabular">{xaf(demande.montantFcfa)}</span>
                </span>
              ) : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
