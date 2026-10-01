"use client"

import { CalendarClock, CalendarDays, HeartPulse, ShieldCheck, Users, Wallet } from "lucide-react"

import { useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Tag } from "@workspace/ui/components/tag"

import { Indicateur, Indicateurs, LienBouton, Panneau } from "@/components/charte"
import { Remplissage } from "@/components/gestion/referentiels/elements"
import { dateHeure, millions, nombre } from "@/components/gestion/referentiels/format"

import { CadreRh, TagAptitude, TagHabilitation, TagPeriode, useAccesRh } from "./cadre-rh"
import { Chargement, ListePrioritaire, dateIso, xaf } from "./commun"
import { METIERS, TYPES_CONGE, TYPES_SERVICE, libelle } from "./libelles"

export function AccueilRh() {
  const { peut } = useAccesRh()
  const tableau = useQuery(api.modules.rh.accueil.tableauDeBord, {})

  return (
    <CadreRh
      titre="Ressources humaines"
      description="Effectifs, paie gabonaise, roulements des équipes, aptitude médicale et congés du personnel du Transgabonais."
      actions={
        peut("dossiers.lire") ? (
          <LienBouton href="/rh/agents" variante="secondary">
            <Users />
            Dossiers du personnel
          </LienBouton>
        ) : null
      }
    >
      {tableau === undefined ? (
        <Chargement libelle="Chargement des indicateurs RH" />
      ) : (
        <>
          <Indicateurs colonnes={4}>
            <Indicateur
              libelle="Effectif en activité"
              icone={Users}
              valeur={nombre(tableau.effectif.actifs)}
              unite="agents"
              evolution={{ sens: "neutre", texte: `${tableau.effectif.entrees12Mois} entrées · ${tableau.effectif.sorties12Mois} sorties sur 12 mois` }}
            />
            <Indicateur
              libelle={tableau.masseSalariale ? `Masse salariale · ${tableau.masseSalariale.libelle}` : "Masse salariale"}
              icone={Wallet}
              valeur={tableau.masseSalariale ? millions(tableau.masseSalariale.brut) : "—"}
              unite={tableau.masseSalariale ? "XAF brut" : undefined}
              evolution={
                tableau.masseSalariale
                  ? { sens: "neutre", texte: `Coût employeur ${xaf(tableau.masseSalariale.coutEmployeur)}` }
                  : { sens: "neutre", texte: "Aucune paie calculée" }
              }
            />
            <Indicateur
              libelle="Aptitudes à renouveler"
              icone={HeartPulse}
              valeur={nombre(tableau.aptitudes.aRenouveler)}
              unite={`sur ${tableau.aptitudes.postesSecurite} postes de sécurité`}
              evolution={tableau.aptitudes.aRenouveler > 0 ? { sens: "vigilance", texte: "Visites à programmer" } : { sens: "hausse", texte: "Toutes à jour" }}
            />
            <Indicateur
              libelle="Conflits de roulement · 14 jours"
              icone={CalendarClock}
              valeur={nombre(tableau.roulement.bloquants + tableau.roulement.alertes)}
              unite={`sur ${tableau.roulement.services} services`}
              evolution={
                tableau.roulement.bloquants > 0
                  ? { sens: "baisse", texte: `${tableau.roulement.bloquants} bloquant(s) à résoudre` }
                  : tableau.roulement.alertes > 0
                    ? { sens: "vigilance", texte: `${tableau.roulement.alertes} alerte(s) de repos` }
                    : { sens: "hausse", texte: "Planning sans conflit" }
              }
            />
          </Indicateurs>

          <div className="grid gap-5 xl:grid-cols-2">
            <Panneau
              titre="Paie en cours"
              icone={Wallet}
              actions={
                peut("paie.lire") || peut("declarations.lire") ? (
                  <LienBouton href="/rh/paie" variante="ghost" taille="sm">
                    Ouvrir la paie
                  </LienBouton>
                ) : null
              }
            >
              {tableau.periodeEnCours ? (
                <div className="flex flex-wrap items-center gap-3">
                  <b className="text-[16px]">{tableau.periodeEnCours.libelle}</b>
                  <TagPeriode statut={tableau.periodeEnCours.statut} />
                  {peut("paie.lire") ? (
                    <LienBouton href={`/rh/paie/${tableau.periodeEnCours._id}`} variante="secondary" taille="sm">
                      Dossier de la période
                    </LienBouton>
                  ) : null}
                </div>
              ) : (
                <p className="text-small text-ink-muted">Aucune période ouverte : la dernière paie est clôturée.</p>
              )}
              {tableau.masseSalariale ? (
                <dl className="grid grid-cols-2 gap-3 text-[14px] sm:grid-cols-4">
                  <div>
                    <dt className="text-ink-muted">Effectif payé</dt>
                    <dd className="tabular font-semibold">{nombre(tableau.masseSalariale.effectif)}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-muted">Net versé</dt>
                    <dd className="tabular font-semibold">{xaf(tableau.masseSalariale.net)}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-muted">CNSS (sal. + pat.)</dt>
                    <dd className="tabular font-semibold">{xaf(tableau.masseSalariale.cnssSalarie + tableau.masseSalariale.cnssPatronal)}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-muted">IRPP + TCS</dt>
                    <dd className="tabular font-semibold">{xaf(tableau.masseSalariale.irpp + tableau.masseSalariale.tcs)}</dd>
                  </div>
                </dl>
              ) : null}
            </Panneau>

            <Panneau titre="Effectif par direction" icone={Users} sousTitre="Agents en activité">
              <ul className="grid gap-2.5">
                {tableau.effectif.parDirection.map((ligne) => (
                  <Remplissage key={ligne.code} libelle={ligne.libelle} part={ligne.nombre / Math.max(1, tableau.effectif.actifs)} valeur={nombre(ligne.nombre)} />
                ))}
              </ul>
              <details className="text-small text-ink-muted">
                <summary className="min-h-11 cursor-pointer py-2">Voir le tableau : effectif par métier</summary>
                <ul className="grid gap-1 pt-1">
                  {tableau.effectif.parMetier.map((ligne) => (
                    <li key={ligne.code} className="flex justify-between gap-3">
                      <span>{libelle(METIERS, ligne.code)}</span>
                      <b className="tabular text-ink">{nombre(ligne.nombre)}</b>
                    </li>
                  ))}
                </ul>
              </details>
            </Panneau>
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            {tableau.roulement.liste ? (
              <Panneau
                titre="Conflits de roulement"
                icone={CalendarClock}
                sousTitre="Quatorze prochains jours"
                actions={
                  <LienBouton href="/rh/roulements" variante="ghost" taille="sm">
                    Planning
                  </LienBouton>
                }
              >
                <ListePrioritaire
                  vide="Aucun conflit sur les deux prochaines semaines."
                  elements={tableau.roulement.liste.map((ligne) => ({
                    cle: ligne.serviceId,
                    href: `/rh/roulements/${ligne.serviceId}`,
                    titre: `${ligne.nomComplet} · ${libelle(TYPES_SERVICE, ligne.type)}${ligne.trainNumber ? ` ${ligne.trainNumber}` : ""}`,
                    detail: `${dateHeure(ligne.debut)} — ${ligne.message}`,
                    etat: <Tag tone={ligne.bloquant ? "danger" : "warning"}>{ligne.bloquant ? "Bloquant" : "Alerte"}</Tag>,
                  }))}
                />
              </Panneau>
            ) : null}

            {tableau.aptitudes.liste ? (
              <Panneau
                titre="Aptitudes à renouveler"
                icone={HeartPulse}
                actions={
                  <LienBouton href="/rh/aptitude" variante="ghost" taille="sm">
                    Suivi médical
                  </LienBouton>
                }
              >
                <ListePrioritaire
                  vide="Toutes les aptitudes des postes de sécurité sont à jour."
                  elements={tableau.aptitudes.liste.map((ligne) => ({
                    cle: ligne.agentId,
                    href: `/rh/agents/${ligne.agentId}`,
                    titre: `${ligne.nomComplet} · ${ligne.matricule}`,
                    detail: `${libelle(METIERS, ligne.metier)}${ligne.valideJusquau ? ` · échéance ${dateIso(ligne.valideJusquau)}` : ""}`,
                    etat: <TagAptitude etat={ligne.etat} />,
                  }))}
                />
              </Panneau>
            ) : null}

            {tableau.conges.liste ? (
              <Panneau
                titre="Congés à valider"
                icone={CalendarDays}
                sousTitre={`${tableau.conges.enAttente} demande(s)`}
                actions={
                  <LienBouton href="/rh/conges" variante="ghost" taille="sm">
                    Congés
                  </LienBouton>
                }
              >
                <ListePrioritaire
                  vide="Aucune demande en attente."
                  elements={tableau.conges.liste.map((ligne) => ({
                    cle: ligne._id,
                    href: `/rh/conges/${ligne._id}`,
                    titre: `${ligne.nomComplet} · ${libelle(TYPES_CONGE, ligne.type)}`,
                    detail: `${ligne.numero} · du ${dateIso(ligne.du)} au ${dateIso(ligne.au)} · ${ligne.jours} j`,
                  }))}
                />
              </Panneau>
            ) : null}

            {tableau.habilitations.liste ? (
              <Panneau titre="Habilitations à échéance" icone={ShieldCheck} sousTitre="Expirées ou dans les 60 jours">
                <ListePrioritaire
                  vide="Aucune habilitation n'arrive à échéance."
                  elements={tableau.habilitations.liste.map((ligne) => ({
                    cle: ligne._id,
                    href: `/rh/agents/${ligne.agentId}`,
                    titre: `${ligne.nomComplet} · ${ligne.libelle}`,
                    detail: `Échéance ${dateIso(ligne.expireLe)}`,
                    etat: <TagHabilitation etat={ligne.etat} />,
                  }))}
                />
              </Panneau>
            ) : null}
          </div>
        </>
      )}
    </CadreRh>
  )
}
