"use client"

import { ArrowDownToLine, ArrowUpFromLine, Ban, Boxes, ClipboardCheck, Coins, PackagePlus, PackageX, Plus, ShieldAlert, ShoppingCart, TriangleAlert, Warehouse } from "lucide-react"
import type { Route } from "next"
import { useRouter, useSearchParams } from "next/navigation"
import { useMemo, useState } from "react"

import { useQuery } from "@workspace/api/hooks"
import { Button } from "@workspace/ui/components/button"

import { CelluleDouble, Indicateur, Indicateurs, TableauDonnees, type ColonneTableau } from "@/components/charte"
import { DateFiltre, Onglets, RetourOperation, SelectFiltre, useOperation } from "@/components/gestion/referentiels/elements"
import { debutJour, finJour, nombre } from "@/components/gestion/referentiels/format"
import { Pastille } from "@/components/gestion/referentiels/statuts"

import { GenerationSousSeuil, ResultatGeneration } from "../achats/dialogues-achat"
import { CadreGmao, gmaoApi, quantite, SENS_MOUVEMENT, useDroitsGmao, xaf, type LigneArticle, type LigneMouvement } from "../commun"
import { Horodatage, LienInterne } from "../ordres/outils"
import { DialogueArticle, DialogueMouvement, type ModeMouvement } from "./dialogues-stock"

/* ============================================================ Alertes */

/** Alerte d'un stock, toujours écrite : « Rupture », « Sous le seuil ». */
export function TagAlerteStock({ rupture, sousSeuil }: { rupture: boolean; sousSeuil: boolean }) {
  if (rupture)
    return (
      <Pastille ton="danger" icone={PackageX}>
        Rupture
      </Pastille>
    )
  if (sousSeuil)
    return (
      <Pastille ton="warning" icone={TriangleAlert}>
        Sous le seuil
      </Pastille>
    )
  return null
}

export const libelleAlerte = (ligne: { rupture: boolean; sousSeuil: boolean }) => (ligne.rupture ? "Rupture" : ligne.sousSeuil ? "Sous le seuil" : "Stock suffisant")

/** Quantité signée d'un mouvement : « +4 », « −2 », écart d'inventaire. */
export function quantiteSignee(mouvement: { sens: "entree" | "sortie" | "ajustement"; quantite: number; ecart: number | null }, unite?: string) {
  const signe = mouvement.sens === "entree" ? 1 : mouvement.sens === "sortie" ? -1 : Math.sign(mouvement.ecart ?? 0)
  const valeur = mouvement.sens === "ajustement" ? Math.abs(mouvement.ecart ?? mouvement.quantite) : mouvement.quantite
  return `${signe > 0 ? "+" : signe < 0 ? "−" : ""}${quantite(valeur, unite)}`
}

export function TagSens({ sens }: { sens: "entree" | "sortie" | "ajustement" }) {
  const Icone = sens === "entree" ? ArrowDownToLine : sens === "sortie" ? ArrowUpFromLine : ClipboardCheck
  return (
    <Pastille ton={sens === "entree" ? "success" : sens === "sortie" ? "info" : "neutral"} icone={Icone}>
      {SENS_MOUVEMENT[sens]}
    </Pastille>
  )
}

/* ============================================================ Colonnes */

const colonnesArticles: ColonneTableau<LigneArticle>[] = [
  { cle: "reference", libelle: "Référence", rendu: (a) => <span className="tabular font-semibold">{a.reference}</span>, tri: (a) => a.reference },
  {
    cle: "designation",
    libelle: "Désignation",
    rendu: (a) => <CelluleDouble haut={a.designation} bas={a.fournisseur} />,
    tri: (a) => a.designation,
  },
  { cle: "famille", libelle: "Famille", rendu: (a) => a.famille, tri: (a) => a.famille, secondaire: true },
  {
    cle: "quantite",
    libelle: "Quantité",
    rendu: (a) => quantite(a.quantite, a.unite),
    tri: (a) => a.quantite,
    export: (a) => a.quantite,
    numerique: true,
  },
  { cle: "unite", libelle: "Unité", rendu: (a) => a.unite, tri: (a) => a.unite, secondaire: true },
  { cle: "valeur", libelle: "Valeur", rendu: (a) => xaf(a.valeurFcfa), tri: (a) => a.valeurFcfa, numerique: true },
  {
    cle: "alerte",
    libelle: "Alerte",
    rendu: (a) => (
      <span className="flex flex-wrap gap-1.5">
        <TagAlerteStock rupture={a.rupture} sousSeuil={a.sousSeuil} />
        {a.critique ? (
          <Pastille ton="strong" icone={ShieldAlert}>
            Critique
          </Pastille>
        ) : null}
        {!a.actif ? (
          <Pastille ton="neutral" icone={Ban}>
            Désactivé
          </Pastille>
        ) : null}
        {!a.rupture && !a.sousSeuil && a.critique === false && a.actif ? <span className="text-ink-muted">—</span> : null}
      </span>
    ),
    tri: (a) => (a.rupture ? 0 : a.sousSeuil ? 1 : 2),
    export: (a) => [libelleAlerte(a), a.critique ? "critique" : null, a.actif ? null : "désactivé"].filter(Boolean).join(" · "),
  },
  {
    cle: "magasins",
    libelle: "Magasins",
    rendu: (a) =>
      a.magasins.length === 0 ? (
        <span className="text-ink-muted">Aucun</span>
      ) : (
        <span className="grid gap-0.5 text-[13px]">
          {a.magasins.map((m) => (
            <span key={m.stockId}>
              <span className="font-semibold">{m.atelier}</span> <span className="tabular">{quantite(m.quantite)}</span>
              {m.quantite === 0 ? " · rupture" : m.sousSeuil ? " · sous le seuil" : ""}
            </span>
          ))}
        </span>
      ),
    tri: (a) => a.magasins.length,
    export: (a) => a.magasins.map((m) => `${m.atelier} ${m.quantite}`).join(" ; "),
    secondaire: true,
  },
  { cle: "achats", libelle: "Achats en cours", rendu: (a) => (a.achatsEnCours > 0 ? nombre(a.achatsEnCours) : "—"), tri: (a) => a.achatsEnCours, numerique: true, secondaire: true },
]

const colonnesMouvements: ColonneTableau<LigneMouvement>[] = [
  { cle: "le", libelle: "Date", rendu: (m) => <Horodatage le={m.le} />, tri: (m) => m.le, export: (m) => new Date(m.le) },
  { cle: "sens", libelle: "Sens", rendu: (m) => <TagSens sens={m.sens} />, tri: (m) => m.sens, export: (m) => SENS_MOUVEMENT[m.sens] },
  {
    cle: "article",
    libelle: "Article",
    rendu: (m) => <CelluleDouble haut={<span className="tabular">{m.reference}</span>} bas={m.designation} />,
    tri: (m) => m.reference,
    export: (m) => `${m.reference} — ${m.designation}`,
  },
  { cle: "magasin", libelle: "Magasin", rendu: (m) => m.atelier, tri: (m) => m.atelier, secondaire: true },
  {
    cle: "quantite",
    libelle: "Quantité",
    rendu: (m) => quantiteSignee(m, m.unite),
    tri: (m) => (m.sens === "sortie" ? -m.quantite : m.sens === "entree" ? m.quantite : (m.ecart ?? 0)),
    export: (m) => (m.sens === "sortie" ? -m.quantite : m.sens === "entree" ? m.quantite : (m.ecart ?? 0)),
    numerique: true,
  },
  { cle: "apres", libelle: "Stock après", rendu: (m) => quantite(m.quantiteApres, m.unite), tri: (m) => m.quantiteApres, numerique: true, secondaire: true },
  { cle: "valeur", libelle: "Valeur", rendu: (m) => xaf(m.valeurFcfa), tri: (m) => m.valeurFcfa, numerique: true },
  { cle: "motif", libelle: "Motif", rendu: (m) => <span className="text-[13px]">{m.motif}</span>, tri: (m) => m.motif, secondaire: true },
  {
    cle: "ot",
    libelle: "OT",
    rendu: (m) =>
      m.otId ? (
        <LienInterne href={`/materiel/ordres/${m.otId}`} mono>
          {m.otNumero ?? "OT"}
        </LienInterne>
      ) : (
        "—"
      ),
    tri: (m) => m.otNumero ?? "",
  },
  { cle: "auteur", libelle: "Auteur", rendu: (m) => m.auteur ?? "Système", tri: (m) => m.auteur ?? "", secondaire: true },
]

/* ============================================================== Écran */

type Onglet = "articles" | "mouvements"

export function EcranStock() {
  const router = useRouter()
  const parametres = useSearchParams()
  const droits = useDroitsGmao()
  const operation = useOperation()
  const [onglet, setOnglet] = useState<Onglet>(parametres.get("onglet") === "mouvements" ? "mouvements" : "articles")
  const articles = useQuery(gmaoApi.queries.articles, {})
  const mouvements = useQuery(gmaoApi.queries.mouvements, onglet === "mouvements" ? {} : "skip")

  // Filtres des articles
  const [famille, setFamille] = useState("toutes")
  const [alerte, setAlerte] = useState(parametres.get("alerte") ?? "toutes")
  const [magasin, setMagasin] = useState("tous")
  // Filtres des mouvements
  const [sens, setSens] = useState("tous")
  const [magasinMouvement, setMagasinMouvement] = useState("tous")
  const [du, setDu] = useState("")
  const [au, setAu] = useState("")

  const [mouvement, setMouvement] = useState<ModeMouvement | null>(null)
  const [creation, setCreation] = useState(false)
  const [generation, setGeneration] = useState(false)
  const [generees, setGenerees] = useState<string[]>([])

  const familles = useMemo(() => [...new Set((articles ?? []).map((a) => a.famille))].sort((a, b) => a.localeCompare(b, "fr")), [articles])
  const magasins = useMemo(() => [...new Set((articles ?? []).flatMap((a) => a.magasins.map((m) => m.atelier)))].sort(), [articles])

  const articlesFiltres = articles?.filter(
    (a) =>
      (famille === "toutes" || a.famille === famille) &&
      (magasin === "tous" || a.magasins.some((m) => m.atelier === magasin)) &&
      (alerte === "toutes" ||
        (alerte === "sous_seuil" && a.sousSeuil) ||
        (alerte === "rupture" && a.rupture) ||
        (alerte === "critiques" && a.critique) ||
        (alerte === "desactives" && !a.actif))
  )
  const debut = du ? debutJour(du) : null
  const fin = au ? finJour(au) : null
  const mouvementsFiltres = mouvements?.filter(
    (m) =>
      (sens === "tous" || m.sens === sens) &&
      (magasinMouvement === "tous" || m.atelier === magasinMouvement) &&
      (debut === null || m.le >= debut) &&
      (fin === null || m.le <= fin)
  )

  const actifs = articles?.filter((a) => a.actif)
  const valeurTotale = articlesFiltres?.reduce((total, a) => total + a.valeurFcfa, 0) ?? 0
  const peutMouvementer = droits.peut("stock_mouvementer")
  const peutDemander = droits.peut("achat_demander")
  const succes = (message: string) => operation.signaler({ ton: "success", titre: message })

  return (
    <CadreGmao
      titre="Stock de pièces"
      description="Pièces détachées des magasins d'Owendo, Booué et Moanda : quantités, seuils de réapprovisionnement et mouvements tracés."
      actions={
        peutMouvementer || peutDemander ? (
          <>
            {peutDemander ? (
              <Button type="button" variant="secondary" onClick={() => setGeneration(true)}>
                <ShoppingCart />
                Générer les demandes sous le seuil
              </Button>
            ) : null}
            {peutMouvementer ? (
              <>
                <Button type="button" variant="secondary" onClick={() => setCreation(true)}>
                  <Plus />
                  Créer un article
                </Button>
                <Button type="button" variant="secondary" onClick={() => setMouvement("inventaire")}>
                  <ClipboardCheck />
                  Inventaire
                </Button>
                <Button type="button" variant="secondary" onClick={() => setMouvement("sortie")}>
                  <ArrowUpFromLine />
                  Sortie hors OT
                </Button>
                <Button type="button" onClick={() => setMouvement("entree")}>
                  <PackagePlus />
                  Entrée en stock
                </Button>
              </>
            ) : null}
          </>
        ) : undefined
      }
    >
      <Indicateurs>
        <Indicateur libelle="Valeur du stock" icone={Coins} valeur={actifs ? xaf(actifs.reduce((total, a) => total + a.valeurFcfa, 0)) : "…"} />
        <Indicateur
          libelle="Articles sous le seuil"
          icone={TriangleAlert}
          valeur={actifs ? nombre(actifs.filter((a) => a.sousSeuil).length) : "…"}
          evolution={actifs?.some((a) => a.sousSeuil) ? { sens: "vigilance", texte: "à réapprovisionner" } : undefined}
        />
        <Indicateur
          libelle="Ruptures"
          icone={PackageX}
          valeur={actifs ? nombre(actifs.filter((a) => a.rupture).length) : "…"}
          evolution={actifs?.some((a) => a.rupture && a.critique) ? { sens: "baisse", texte: "dont pièces critiques en rupture" } : undefined}
        />
        <Indicateur libelle="Achats en cours" icone={ShoppingCart} valeur={articles ? nombre(articles.reduce((total, a) => total + a.achatsEnCours, 0)) : "…"} />
      </Indicateurs>

      <RetourOperation retour={operation.retour} />
      <ResultatGeneration numeros={generees} onFermer={() => setGenerees([])} />

      <Onglets
        libelle="Stock"
        valeur={onglet}
        onChange={setOnglet}
        onglets={[
          { cle: "articles", libelle: "Articles", compte: actifs?.length },
          { cle: "mouvements", libelle: "Mouvements" },
        ]}
      />

      <div role="tabpanel" className="grid gap-4">
        {onglet === "articles" ? (
          <TableauDonnees
            libelle="Articles en stock"
            colonnes={colonnesArticles}
            lignes={articlesFiltres}
            cle={(a) => a.id}
            lien={(a) => `/materiel/stock/${a.id}`}
            recherche={{ placeholder: "Référence, désignation, fournisseur…", texte: (a) => `${a.reference} ${a.designation} ${a.fournisseur} ${a.famille}` }}
            filtres={
              <>
                <SelectFiltre libelle="Famille" icone={Boxes} value={famille} onChange={setFamille}>
                  <option value="toutes">Toutes les familles</option>
                  {familles.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </SelectFiltre>
                <SelectFiltre libelle="Alerte" icone={TriangleAlert} value={alerte} onChange={setAlerte}>
                  <option value="toutes">Tous les articles</option>
                  <option value="sous_seuil">Sous le seuil</option>
                  <option value="rupture">En rupture</option>
                  <option value="critiques">Pièces critiques</option>
                  <option value="desactives">Désactivés</option>
                </SelectFiltre>
                <SelectFiltre libelle="Magasin" icone={Warehouse} value={magasin} onChange={setMagasin}>
                  <option value="tous">Tous les magasins</option>
                  {magasins.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </SelectFiltre>
              </>
            }
            exportNom="stock-articles"
            triInitial={{ cle: "alerte", sens: "asc" }}
            vide={{
              titre: articles && articles.length > 0 ? "Aucun article ne répond à ces filtres" : "Aucun article au catalogue",
              description: articles && articles.length > 0 ? "Retirez un filtre pour élargir la liste." : "Créez le premier article, puis paramétrez son stock par magasin.",
            }}
            pied={
              articlesFiltres && articlesFiltres.length > 0 ? (
                <tr>
                  <td colSpan={3} className="px-3.5 py-2.5">
                    Valeur totale · {nombre(articlesFiltres.length)} article(s)
                  </td>
                  <td />
                  <td className="hidden md:table-cell" />
                  <td className="px-3.5 py-2.5 text-right tabular-nums">{xaf(valeurTotale)}</td>
                  <td />
                  <td colSpan={2} className="hidden md:table-cell" />
                </tr>
              ) : undefined
            }
          />
        ) : (
          <TableauDonnees
            libelle="Mouvements de stock"
            colonnes={colonnesMouvements}
            lignes={mouvementsFiltres}
            cle={(m) => m.id}
            lien={(m) => `/materiel/stock/${m.articleId}`}
            recherche={{ placeholder: "Référence, motif, OT, auteur…", texte: (m) => `${m.reference} ${m.designation} ${m.motif} ${m.otNumero ?? ""} ${m.auteur ?? ""}` }}
            filtres={
              <>
                <SelectFiltre libelle="Sens" value={sens} onChange={setSens}>
                  <option value="tous">Tous les sens</option>
                  {Object.entries(SENS_MOUVEMENT).map(([cle, libelle]) => (
                    <option key={cle} value={cle}>
                      {libelle}
                    </option>
                  ))}
                </SelectFiltre>
                <SelectFiltre libelle="Magasin" icone={Warehouse} value={magasinMouvement} onChange={setMagasinMouvement}>
                  <option value="tous">Tous les magasins</option>
                  {magasins.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </SelectFiltre>
                <DateFiltre libelle="Du" value={du} onChange={setDu} />
                <DateFiltre libelle="Au" value={au} onChange={setAu} />
              </>
            }
            exportNom="stock-mouvements"
            triInitial={{ cle: "le", sens: "desc" }}
            vide={{
              titre: mouvements && mouvements.length > 0 ? "Aucun mouvement sur cette période" : "Aucun mouvement de stock",
              description: "Entrées, sorties sur OT ou hors OT et ajustements d'inventaire apparaissent ici. Les 1 000 derniers mouvements sont listés.",
            }}
          />
        )}
      </div>

      {mouvement ? (
        <DialogueMouvement
          key={mouvement}
          mode={mouvement}
          open
          onOpenChange={(ouvert) => {
            if (!ouvert) setMouvement(null)
          }}
          onSucces={succes}
        />
      ) : null}
      {creation ? (
        <DialogueArticle
          open
          onOpenChange={setCreation}
          familles={familles}
          onCree={(articleId) => router.push(`/materiel/stock/${articleId}` as Route)}
        />
      ) : null}
      <GenerationSousSeuil open={generation} onOpenChange={setGeneration} onGenere={setGenerees} onSucces={succes} />
    </CadreGmao>
  )
}
