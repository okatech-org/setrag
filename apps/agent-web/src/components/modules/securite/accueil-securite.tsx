"use client"

import type { FunctionReturnType } from "convex/server"
import {
  Activity,
  CalendarCheck,
  ClipboardCheck,
  FileSearch,
  FileText,
  ListChecks,
  Send,
  ShieldAlert,
} from "lucide-react"
import { useRouter } from "next/navigation"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { Tag } from "@workspace/ui/components/tag"

import { ContinuityPanel } from "@/components/direction/continuity-panel"
import {
  Indicateur,
  Indicateurs,
  LienBouton,
  Panneau,
} from "@/components/charte"
import {
  RetourOperation,
  useOperation,
} from "@/components/gestion/referentiels/elements"
import { nombre, taux } from "@/components/gestion/referentiels/format"
import {
  Chargement,
  ListePrioritaire,
  TableSimple,
  dateIso,
} from "@/components/modules/rh/commun"

import {
  Barres,
  CadreSecurite,
  TagArtf,
  TagEnquete,
  TagGravite,
  TagRetard,
  dateHeureComplete,
  useAccesSecurite,
} from "./cadre-securite"
import {
  FAMILLES,
  GRAVITES,
  NATURES_ARTF,
  libelleTrimestre,
  libelleType,
  lieuEtPk,
  moisCourt,
  type Famille,
  type Gravite,
} from "./libelles"

export type TableauSecurite = FunctionReturnType<
  typeof api.modules.securite.accueil.tableauDeBord
>

export function AccueilSecurite() {
  const router = useRouter()
  const { peut } = useAccesSecurite()
  const tableau = useQuery(api.modules.securite.accueil.tableauDeBord, {})
  const continuite = useQuery(
    api.modules.continuity.queries.getContinuitySummary,
    { policyLimit: 8 }
  )
  const preparerBilan = useMutation(api.modules.securite.artf.preparerBilan)
  const operation = useOperation()
  const bilan =
    tableau?.artf.bilanAPreparer && peut("artf.gerer")
      ? tableau.artf.bilanAPreparer
      : null

  return (
    <CadreSecurite
      titre="Sécurité ferroviaire et conformité ARTF"
      description="Registre des événements de sécurité, enquêtes, actions correctives, inspections et déclarations à l'Autorité de régulation des transports ferroviaires."
      actions={
        <>
          {peut("registre.lire") ? (
            <LienBouton href="/securite/evenements" variante="secondary">
              <ShieldAlert />
              Registre des événements
            </LienBouton>
          ) : null}
          {bilan ? (
            <Button
              type="button"
              loading={operation.enCours === "bilan"}
              loadingLabel="Préparation…"
              onClick={async () => {
                const resultat = await operation.executer("bilan", () =>
                  preparerBilan({ trimestre: bilan })
                )
                if (resultat)
                  router.push(`/securite/artf/${resultat.declarationId}`)
              }}
            >
              <FileText />
              Préparer le bilan du trimestre
            </Button>
          ) : null}
        </>
      }
    >
      <RetourOperation retour={operation.retour} />
      {tableau === undefined ? (
        <Chargement libelle="Chargement des indicateurs de sécurité" />
      ) : (
        <TableauDeBord tableau={tableau} bilan={bilan} />
      )}

      {continuite ? (
        <ContinuityPanel summary={continuite} />
      ) : (
        <p role="status" className="text-small text-ink-muted">
          Chargement de la préparation PCA / PRA…
        </p>
      )}
    </CadreSecurite>
  )
}

/** Corps du tableau de bord, séparé pour être rendu et testé sans requête. */
export function TableauDeBord({
  tableau,
  bilan,
}: {
  tableau: TableauSecurite
  bilan: string | null
}) {
  const { peut } = useAccesSecurite()
  const graves = tableau.parGravite.grave + tableau.parGravite.majeur
  const maxMois = Math.max(1, ...tableau.parMois.map((m) => m.nombre))
  return (
    <>
      {bilan ? (
        <p className="text-small text-ink-muted">
          Le bilan du {libelleTrimestre(bilan)} n&apos;est pas encore préparé :
          il se compose à partir du registre et se relit avant transmission.
        </p>
      ) : null}
      <Indicateurs colonnes={4}>
        <Indicateur
          libelle="Événements · 12 mois"
          icone={ShieldAlert}
          valeur={nombre(tableau.evenements12Mois)}
          evolution={{
            sens: graves > 0 ? "vigilance" : "neutre",
            texte: `${graves} grave(s) ou majeur(s) · ${tableau.victimes.blesses} blessé(s), ${tableau.victimes.deces} décès`,
          }}
        />
        <Indicateur
          libelle="Taux pour 1 000 circulations"
          icone={Activity}
          valeur={
            tableau.tauxPourMille === null ? "—" : taux(tableau.tauxPourMille)
          }
          evolution={{
            sens: "neutre",
            texte:
              tableau.tauxPourMille === null
                ? "Non calculable : aucune circulation enregistrée sur 12 mois"
                : `${nombre(tableau.circulations12Mois)} circulations sur 12 mois`,
          }}
        />
        <Indicateur
          libelle="Jours sans événement grave"
          icone={CalendarCheck}
          valeur={
            tableau.joursSansEvenementGrave === null
              ? "—"
              : nombre(tableau.joursSansEvenementGrave)
          }
          unite={tableau.joursSansEvenementGrave === null ? undefined : "jours"}
          evolution={{
            sens:
              tableau.joursSansEvenementGrave === null ||
              tableau.joursSansEvenementGrave > 90
                ? "hausse"
                : "neutre",
            texte:
              tableau.joursSansEvenementGrave === null
                ? "Aucun événement grave au registre"
                : "Depuis le dernier événement grave ou majeur",
          }}
        />
        <Indicateur
          libelle="Enquêtes ouvertes"
          icone={FileSearch}
          valeur={nombre(tableau.enquetes.ouvertes)}
          evolution={
            tableau.enquetes.enRetard > 0
              ? {
                  sens: "baisse",
                  texte: `${tableau.enquetes.enRetard} en retard · ${tableau.enquetes.aCloturer} à clôturer`,
                }
              : {
                  sens: "neutre",
                  texte: `Aucune en retard · ${tableau.enquetes.aCloturer} à clôturer`,
                }
          }
        />
        <Indicateur
          libelle="Actions correctives ouvertes"
          icone={ListChecks}
          valeur={nombre(tableau.actions.ouvertes)}
          evolution={
            tableau.actions.enRetard > 0
              ? {
                  sens: "baisse",
                  texte: `${tableau.actions.enRetard} en retard · ${tableau.actions.aVerifier} à vérifier`,
                }
              : {
                  sens: "neutre",
                  texte: `Aucune en retard · ${tableau.actions.aVerifier} à vérifier`,
                }
          }
        />
        <Indicateur
          libelle="Déclarations ARTF à transmettre"
          icone={Send}
          valeur={nombre(tableau.artf.aTransmettre)}
          evolution={
            tableau.artf.enRetard > 0
              ? {
                  sens: "baisse",
                  texte: `${tableau.artf.enRetard} en retard sur l'échéance`,
                }
              : {
                  sens: "neutre",
                  texte: `${tableau.artf.transmises12Mois} transmise(s) sur 12 mois, ${tableau.artf.horsDelai12Mois} hors délai`,
                }
          }
        />
        <Indicateur
          libelle="Inspections · 30 jours"
          icone={ClipboardCheck}
          valeur={nombre(tableau.inspections.aVenir30Jours)}
          unite="programmées"
          evolution={
            tableau.inspections.enRetard > 0
              ? {
                  sens: "vigilance",
                  texte: `${tableau.inspections.enRetard} en retard de saisie`,
                }
              : {
                  sens: "neutre",
                  texte: `${tableau.inspections.ncSansAction} non-conformité(s) sans action`,
                }
          }
        />
        <Indicateur
          libelle="Actions vérifiées efficaces"
          icone={ListChecks}
          valeur={nombre(tableau.actions.verifiees)}
          evolution={{
            sens: "neutre",
            texte: "Soldées après vérification de leur efficacité",
          }}
        />
      </Indicateurs>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panneau
          titre="Répartition par gravité"
          sousTitre="Douze derniers mois"
        >
          <Barres
            libelle="Événements par gravité"
            lignes={(Object.keys(GRAVITES) as Gravite[]).map((g) => ({
              cle: g,
              libelle: GRAVITES[g],
              valeur: tableau.parGravite[g],
            }))}
          />
        </Panneau>
        <Panneau
          titre="Répartition par famille"
          sousTitre="Douze derniers mois"
        >
          <Barres
            libelle="Événements par famille"
            lignes={(Object.keys(FAMILLES) as Famille[]).map((f) => ({
              cle: f,
              libelle: FAMILLES[f],
              valeur: tableau.parFamille[f],
            }))}
          />
        </Panneau>
      </div>

      <Panneau
        titre="Événements par mois"
        sousTitre="Hauteur : nombre d'événements ; le chiffre est écrit au-dessus de chaque barre"
      >
        <ol
          className="grid h-48 grid-cols-12 items-end gap-1 sm:gap-2"
          aria-label="Histogramme des événements par mois"
        >
          {tableau.parMois.map((m) => (
            <li
              key={m.mois}
              className="flex h-full min-w-0 flex-col items-center justify-end gap-1"
            >
              <b className="tabular text-[12px]">{m.nombre}</b>
              <span
                aria-hidden
                className="w-full rounded-t-xs bg-accent-base"
                style={{
                  height: `${(m.nombre / maxMois) * 100}%`,
                  minHeight: m.nombre > 0 ? 4 : 1,
                }}
              />
              <span className="w-full truncate text-center text-[10.5px] text-ink-muted">
                {moisCourt(m.mois)}
              </span>
            </li>
          ))}
        </ol>
        <details className="text-small text-ink-muted">
          <summary className="min-h-11 cursor-pointer py-2">
            Voir le tableau : événements par mois
          </summary>
          <TableSimple
            libelle="Événements par mois"
            colonnes={[
              { libelle: "Mois" },
              { libelle: "Événements", numerique: true },
              { libelle: "Dont graves ou majeurs", numerique: true },
            ]}
            lignes={tableau.parMois.map((m) => [
              moisCourt(m.mois),
              nombre(m.nombre),
              nombre(m.graves),
            ])}
          />
        </details>
      </Panneau>

      {tableau.listes ? (
        <div className="grid gap-5 xl:grid-cols-2">
          <Panneau
            titre="Événements à qualifier"
            icone={ShieldAlert}
            actions={
              <LienBouton
                href="/securite/evenements"
                variante="ghost"
                taille="sm"
              >
                Registre
              </LienBouton>
            }
          >
            <ListePrioritaire
              vide="Aucun événement en attente de qualification."
              elements={tableau.listes.aQualifier.map((e) => ({
                cle: e._id,
                href: `/securite/evenements/${e._id}`,
                titre: `${e.numero} · ${libelleType(e.type)}`,
                detail: `${dateHeureComplete(e.survenuLe)} · ${lieuEtPk(e)}`,
                etat: <TagGravite gravite={e.gravite} />,
              }))}
            />
          </Panneau>
          <Panneau
            titre="Enquêtes en cours"
            icone={FileSearch}
            actions={
              <LienBouton
                href="/securite/enquetes"
                variante="ghost"
                taille="sm"
              >
                Enquêtes
              </LienBouton>
            }
          >
            <ListePrioritaire
              vide="Aucune enquête ouverte."
              elements={tableau.listes.enquetesEnCours.map((e) => ({
                cle: e._id,
                href: `/securite/enquetes/${e._id}`,
                titre: `${e.numero} · ${e.enqueteurNom}`,
                detail: `Rapport attendu le ${dateIso(e.echeanceRapport)}`,
                etat: (
                  <span className="flex flex-wrap gap-1">
                    {e.enRetard ? <TagRetard /> : null}
                    <TagEnquete statut={e.statut} />
                  </span>
                ),
              }))}
            />
          </Panneau>
          <Panneau
            titre="Actions correctives en retard"
            icone={ListChecks}
            actions={
              <LienBouton href="/securite/actions" variante="ghost" taille="sm">
                Plan d&apos;actions
              </LienBouton>
            }
          >
            <ListePrioritaire
              vide="Aucune action en retard."
              elements={tableau.listes.actionsEnRetard.map((a) => ({
                cle: a._id,
                href: `/securite/actions/${a._id}`,
                titre: `${a.numero} · ${a.libelle}`,
                detail: `${a.responsableNom} · échéance ${dateIso(a.echeance)} · ${a.avancement} %`,
                etat: <TagRetard />,
              }))}
            />
          </Panneau>
          {peut("artf.lire") ? (
            <Panneau
              titre="Déclarations ARTF à échéance"
              icone={Send}
              actions={
                <LienBouton href="/securite/artf" variante="ghost" taille="sm">
                  Déclarations
                </LienBouton>
              }
            >
              <ListePrioritaire
                vide="Aucune déclaration en attente de transmission."
                elements={tableau.listes.declarations.map((d) => ({
                  cle: d._id,
                  href: `/securite/artf/${d._id}`,
                  titre: `${d.numero} · ${NATURES_ARTF[d.nature]}`,
                  detail: `${d.objet} · échéance ${dateHeureComplete(d.echeance)}`,
                  etat: (
                    <span className="flex flex-wrap gap-1">
                      {d.enRetard ? <TagRetard /> : null}
                      <TagArtf statut={d.statut} />
                    </span>
                  ),
                }))}
              />
            </Panneau>
          ) : null}
        </div>
      ) : (
        <p className="text-small text-ink-muted">
          <Tag tone="neutral">Indicateurs seuls</Tag> Votre profil consulte les
          indicateurs consolidés, sans accès au détail du registre.
        </p>
      )}
    </>
  )
}
