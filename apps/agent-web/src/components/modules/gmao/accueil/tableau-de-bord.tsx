"use client"

import {
  Activity,
  ArrowRight,
  Boxes,
  CalendarClock,
  ClipboardCheck,
  Coins,
  Gauge,
  ListChecks,
  Plus,
  ShoppingCart,
  Timer,
  TrainFront,
  Wrench,
  type LucideIcon,
} from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, type ReactNode } from "react"

import { useQuery } from "@workspace/api/hooks"
import { Button } from "@workspace/ui/components/button"
import { EmptyState } from "@workspace/ui/components/empty-state"
import { cn } from "@workspace/ui/lib/utils"

import { Indicateur, Indicateurs, LienBouton, Panneau } from "@/components/charte"
import { Remplissage } from "@/components/gestion/referentiels/elements"
import { dateHeure, nombre } from "@/components/gestion/referentiels/format"
import { Pastille } from "@/components/gestion/referentiels/statuts"

import {
  CadreGmao,
  DossierEnChargement,
  FAMILLES_PLURIEL,
  gmaoApi,
  pct,
  STATUTS_OT,
  useDroitsGmao,
  type AccueilGmao,
} from "../commun"
import { DialogueNouvelOt } from "../dialogue-nouvel-ot"

type Priorite = AccueilGmao["priorites"][number]

const NIVEAUX: Record<Priorite["niveau"], { libelle: string; ton: "danger" | "warning" | "neutral" }> = {
  critique: { libelle: "Critique", ton: "danger" },
  eleve: { libelle: "Élevé", ton: "warning" },
  normal: { libelle: "Normal", ton: "neutral" },
}

const TYPES_PRIORITE: Record<Priorite["type"], string> = {
  ot: "Ordre de travail",
  echeance: "Échéance préventive",
  stock: "Stock",
  achat: "Achat",
  visite: "Visite avant départ",
}

/** Dossier vers lequel mène une priorité. */
export function lienPriorite(priorite: Pick<Priorite, "type" | "id">) {
  switch (priorite.type) {
    case "ot":
      return `/materiel/ordres/${priorite.id}`
    case "echeance":
      return "/materiel/preventif"
    case "stock":
      return `/materiel/stock/${priorite.id}`
    case "achat":
      return `/materiel/achats/${priorite.id}`
    case "visite":
      return `/materiel/visites/${priorite.id}`
  }
}

/** Indicateur cliquable : il mène à la liste qui détaille le chiffre. */
function IndicateurLien({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href as Route} className="grid rounded-md transition-colors hover:[&>div]:border-accent-line">
      {children}
    </Link>
  )
}

/** Tableau de bord du module : disponibilité, OT, préventif, stock, visites. */
export function TableauDeBordGmao() {
  const accueil = useQuery(gmaoApi.queries.accueil, {})
  const droits = useDroitsGmao()
  const router = useRouter()
  const [demande, setDemande] = useState(false)

  return (
    <CadreGmao
      titre="Matériel roulant"
      description="Disponibilité du parc, ordres de travail, échéances préventives, pièces et visites avant départ des ateliers d'Owendo, Booué et Moanda."
      actions={
        <>
          <LienBouton href="/materiel/visites">
            <ClipboardCheck />
            Départs du jour
          </LienBouton>
          <LienBouton href="/materiel/preventif">
            <CalendarClock />
            Échéances
          </LienBouton>
          {droits.peut("ot_demander") ? (
            <Button type="button" onClick={() => setDemande(true)}>
              <Plus />
              Demander un OT
            </Button>
          ) : null}
        </>
      }
    >
      <VueAccueil accueil={accueil} />
      <DialogueNouvelOt
        open={demande}
        onOpenChange={setDemande}
        onCree={({ otId }) => router.push(`/materiel/ordres/${otId}` as Route)}
      />
    </CadreGmao>
  )
}

/** Contenu du tableau de bord, séparé de la coquille pour les tests. */
export function VueAccueil({ accueil }: { accueil: AccueilGmao | undefined }) {
  if (accueil === undefined) return <DossierEnChargement />

  if (accueil.vide) {
    return (
      <div className="rounded-md border border-line bg-surface">
        <EmptyState
          title="Le parc n'est pas encore chargé"
          description="Aucune locomotive, voiture ni wagon n'est enregistré dans la GMAO. Les indicateurs apparaîtront dès l'entrée des premiers engins au parc."
          action={<LienBouton href="/materiel/parc">Ouvrir le parc</LienBouton>}
        />
      </div>
    )
  }

  const { ot, preventif, stock, visitesJour, fiabilite } = accueil
  const maxStatut = Math.max(1, ...ot.parStatut.map((ligne) => ligne.nombre))

  return (
    <div className="grid gap-5">
      <p className="text-small text-ink-muted">
        Situation au <span className="tabular">{dateHeure(accueil.genereLe)}</span> · mise à jour en continu.
      </p>

      <section aria-label="Disponibilité du parc" className="grid gap-3">
        <Indicateurs colonnes={4}>
          <IndicateurLien href="/materiel/parc">
            <Indicateur
              libelle="Disponibilité du parc"
              icone={Gauge}
              valeur={pct(accueil.disponibiliteGlobale)}
              remplissage={accueil.disponibiliteGlobale}
              evolution={{
                sens: "neutre",
                texte: `${nombre(accueil.enginsEnService)} en service sur ${nombre(accueil.enginsUtiles)} engins utiles`,
              }}
              fort
            />
          </IndicateurLien>
          {accueil.parc.map((famille) => (
            <IndicateurLien key={famille.famille} href="/materiel/parc">
              <Indicateur
                libelle={FAMILLES_PLURIEL[famille.famille]}
                icone={TrainFront}
                valeur={famille.utiles === 0 ? "—" : pct(famille.disponibilite)}
                remplissage={famille.utiles === 0 ? undefined : famille.disponibilite}
                evolution={{
                  sens: famille.immobilises > 0 ? "vigilance" : "neutre",
                  texte:
                    famille.total === 0
                      ? "Aucun engin enregistré"
                      : `${nombre(famille.enService)} / ${nombre(famille.utiles)} en service · ${nombre(famille.immobilises)} immobilisé(s) · ${nombre(famille.enAtelier)} en atelier`,
                }}
              />
            </IndicateurLien>
          ))}
        </Indicateurs>
      </section>

      <section aria-label="Maintenance" className="grid gap-3">
        <Indicateurs colonnes={4}>
          <IndicateurLien href="/materiel/ordres">
            <Indicateur
              libelle="OT ouverts"
              icone={Wrench}
              valeur={nombre(ot.ouverts)}
              evolution={{
                sens: ot.enRetard > 0 ? "vigilance" : "neutre",
                texte: `${nombre(ot.enRetard)} en retard · ${nombre(ot.urgents)} urgent(s)`,
              }}
            />
          </IndicateurLien>
          <IndicateurLien href="/materiel/preventif">
            <Indicateur
              libelle="Échéances préventives"
              icone={CalendarClock}
              valeur={nombre(preventif.echues)}
              unite="échue(s)"
              evolution={{
                sens: preventif.echuesSansOt > 0 ? "vigilance" : "neutre",
                texte: `${nombre(preventif.echuesSansOt)} sans OT · ${nombre(preventif.proches)} proche(s) sur ${nombre(preventif.suivies)} suivies`,
              }}
            />
          </IndicateurLien>
          <Indicateur
            libelle={`MTBF · ${fiabilite.fenetreJours} j`}
            icone={Activity}
            valeur={fiabilite.mtbfJours === null ? "—" : nombre(fiabilite.mtbfJours)}
            unite={fiabilite.mtbfJours === null ? undefined : "jours"}
            evolution={{
              sens: "neutre",
              texte: fiabilite.mtbfJours === null ? "Aucune défaillance sur la période" : `${nombre(fiabilite.defaillances)} défaillance(s) corrective(s)`,
            }}
          />
          <Indicateur
            libelle={`MTTR · ${fiabilite.fenetreJours} j`}
            icone={Timer}
            valeur={fiabilite.mttrHeures === null ? "—" : fiabilite.mttrHeures.toLocaleString("fr-FR")}
            unite={fiabilite.mttrHeures === null ? undefined : "heures"}
            evolution={{
              sens: "neutre",
              texte: fiabilite.mttrHeures === null ? "Aucune réparation clôturée mesurable" : "Durée moyenne de réparation",
            }}
          />
        </Indicateurs>
        <Indicateurs colonnes={4}>
          <IndicateurLien href="/materiel/ordres">
            <Indicateur
              libelle="Coût des OT clôturés · 30 j"
              icone={Coins}
              valeur={nombre(Math.round(ot.cout30Fcfa))}
              unite="XAF"
              evolution={{ sens: "neutre", texte: `${nombre(ot.clotures30)} OT clôturé(s)` }}
            />
          </IndicateurLien>
          <IndicateurLien href="/materiel/stock">
            <Indicateur
              libelle="Articles sous le seuil"
              icone={Boxes}
              valeur={nombre(stock.sousSeuil)}
              evolution={{
                sens: stock.ruptures > 0 ? "vigilance" : "neutre",
                texte: `${nombre(stock.ruptures)} en rupture · ${nombre(stock.articles)} articles suivis`,
              }}
            />
          </IndicateurLien>
          <IndicateurLien href="/materiel/achats">
            <Indicateur
              libelle="Achats à valider"
              icone={ShoppingCart}
              valeur={nombre(stock.achatsAValider)}
              evolution={{ sens: "neutre", texte: `Stock valorisé ${nombre(Math.round(stock.valeurFcfa))} XAF` }}
            />
          </IndicateurLien>
          <IndicateurLien href="/materiel/visites">
            <Indicateur
              libelle="Visites du jour"
              icone={ClipboardCheck}
              valeur={nombre(visitesJour.total)}
              evolution={{
                sens: visitesJour.inaptes > 0 ? "vigilance" : "neutre",
                texte: `${nombre(visitesJour.signees)} signée(s) · ${nombre(visitesJour.inaptes)} inapte(s)`,
              }}
            />
          </IndicateurLien>
        </Indicateurs>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
        <Panneau
          titre="Priorités"
          icone={ListChecks}
          sousTitre="Ce qui demande une décision, du plus grave au moins grave"
          plein
        >
          {accueil.priorites.length === 0 ? (
            <EmptyState
              illustration={false}
              title="Rien d'urgent"
              description="Aucun OT urgent ou en retard, aucune échéance échue sans OT, aucune pièce critique en rupture, aucun convoi inapte aujourd'hui."
            />
          ) : (
            <ul className="grid">
              {accueil.priorites.map((priorite) => (
                <LignePriorite key={`${priorite.type}-${priorite.id}`} priorite={priorite} />
              ))}
            </ul>
          )}
        </Panneau>

        <div className="grid content-start gap-5">
          <Panneau
            titre="OT ouverts par statut"
            icone={Wrench}
            actions={
              <LienBouton href="/materiel/ordres" variante="ghost" taille="sm">
                Tous les OT
                <ArrowRight />
              </LienBouton>
            }
          >
            <ul className="grid gap-2.5" aria-label="Répartition des OT ouverts">
              {ot.parStatut.map((ligne) => (
                <li key={ligne.statut} className="grid grid-cols-[110px_minmax(0,1fr)_40px] items-center gap-3 text-[13.5px]">
                  <span className="font-semibold">{STATUTS_OT[ligne.statut].libelle}</span>
                  <span aria-hidden className="h-3 overflow-hidden rounded-pill bg-surface-sunk">
                    <span
                      className="block h-full rounded-pill bg-accent-base"
                      style={{ width: `${(ligne.nombre / maxStatut) * 100}%` }}
                    />
                  </span>
                  <b className="tabular text-right">{nombre(ligne.nombre)}</b>
                </li>
              ))}
            </ul>
            <details className="text-[13.5px]">
              <summary className="min-h-11 cursor-pointer py-2.5 font-semibold text-accent-ink">
                Voir le tableau : OT ouverts par statut
              </summary>
              <table className="w-full border-collapse">
                <caption className="sr-only">Nombre d’ordres de travail ouverts par statut</caption>
                <thead>
                  <tr className="border-b border-line text-left text-ink-muted">
                    <th scope="col" className="py-1.5">Statut</th>
                    <th scope="col" className="py-1.5 text-right">OT</th>
                  </tr>
                </thead>
                <tbody>
                  {ot.parStatut.map((ligne) => (
                    <tr key={ligne.statut} className="border-b border-line">
                      <th scope="row" className="py-1.5 text-left font-medium">
                        {STATUTS_OT[ligne.statut].libelle}
                      </th>
                      <td className="tabular py-1.5 text-right">{nombre(ligne.nombre)}</td>
                    </tr>
                  ))}
                  <tr>
                    <th scope="row" className="py-1.5 text-left font-bold">
                      Total
                    </th>
                    <td className="tabular py-1.5 text-right font-bold">{nombre(ot.ouverts)}</td>
                  </tr>
                </tbody>
              </table>
            </details>
          </Panneau>

          <Panneau titre="Disponibilité par famille" icone={Gauge}>
            <ul className="grid gap-3">
              {accueil.parc.map((famille) => (
                <Remplissage
                  key={famille.famille}
                  libelle={FAMILLES_PLURIEL[famille.famille]}
                  detail={`${nombre(famille.enService)} en service sur ${nombre(famille.utiles)} · ${nombre(famille.reformes)} réformé(s)`}
                  part={famille.disponibilite}
                  valeur={famille.utiles === 0 ? "—" : pct(famille.disponibilite)}
                />
              ))}
            </ul>
          </Panneau>
        </div>
      </div>
    </div>
  )
}

const ICONES_PRIORITE: Record<Priorite["type"], LucideIcon> = {
  ot: Wrench,
  echeance: CalendarClock,
  stock: Boxes,
  achat: ShoppingCart,
  visite: ClipboardCheck,
}

function LignePriorite({ priorite }: { priorite: Priorite }) {
  const niveau = NIVEAUX[priorite.niveau]
  const Icone = ICONES_PRIORITE[priorite.type]
  return (
    <li className="border-t border-line first:border-t-0">
      <Link
        href={lienPriorite(priorite) as Route}
        className={cn("flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-surface-sunk")}
      >
        <Icone aria-hidden className="size-[18px] shrink-0 text-ink-muted" />
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="font-semibold">{priorite.titre}</span>
          <small className="text-[12.5px] text-ink-muted">
            {TYPES_PRIORITE[priorite.type]} · {priorite.detail}
            {priorite.echeance ? (
              <>
                {" "}
                · {priorite.type === "ot" ? "fin prévue" : "échéance"} <span className="tabular">{dateHeure(priorite.echeance)}</span>
              </>
            ) : null}
          </small>
        </span>
        <Pastille ton={niveau.ton}>Niveau {niveau.libelle.toLowerCase()}</Pastille>
        <ArrowRight aria-hidden className="size-4 text-ink-muted" />
      </Link>
    </li>
  )
}
