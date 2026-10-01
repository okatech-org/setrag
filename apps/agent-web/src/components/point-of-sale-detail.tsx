"use client"

import type { FunctionReturnType } from "convex/server"
import { Coins, History, LockOpen, Pencil, Plus, Power, Store, Ticket, Users } from "lucide-react"
import { useState } from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { SkeletonLines } from "@workspace/ui/components/empty-state"
import { Field, Input, SelectNative } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import { CelluleDouble, Fiche, Indicateur, Indicateurs, Panneau, TableauDonnees, type ColonneTableau } from "@/components/charte"
import { ROLE_LABELS } from "@/lib/roles"
import { useDroitsGestion } from "./gestion/referentiels/droits"
import { Historique, RetourOperation, useOperation } from "./gestion/referentiels/elements"
import { agent, CLASSES, dateHeure, dateService, dateServiceCourte, libelleDesserte, millions, montant, nombre, TYPES_POINT_DE_VENTE } from "./gestion/referentiels/format"
import { FenetreFormulaire, nombreSaisi, texte } from "./gestion/referentiels/formulaire"
import { Pastille, TagActif } from "./gestion/referentiels/statuts"
import { ManagementDetailShell } from "./management-detail-shell"

type Dossier = NonNullable<FunctionReturnType<typeof api.functions.referentiels.pointDeVente>>
type TypePoint = keyof typeof TYPES_POINT_DE_VENTE

export interface ValeursPoint {
  code: string
  name: string
  type: TypePoint
  stationId?: string
  counters: { passengers: number; baggage: number; parcels: number }
  royaltyPct?: number | null
}

/** Création ou modification d'un point de vente. */
export function DialoguePointDeVente({
  open,
  onOpenChange,
  point,
  typeInitial = "gare",
  onCree,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  point?: ValeursPoint & { _id: string }
  typeInitial?: TypePoint
  onCree?: (id: string) => void
}) {
  const stations = useQuery(api.functions.referential.listStations, open ? { includeInactive: true } : "skip")
  const creer = useMutation(api.functions.management.createPointOfSale)
  const modifier = useMutation(api.functions.management.updatePointOfSale)
  const operation = useOperation()
  const [type, setType] = useState<TypePoint>(point?.type ?? typeInitial)
  return (
    <FenetreFormulaire
      open={open}
      onOpenChange={onOpenChange}
      titre={point ? `Modifier ${point.name}` : type === "gare" ? "Nouveau point de vente" : "Accréditer une agence"}
      description={point ? "Réduire les guichets est refusé tant que des caisses restent ouvertes." : "Le point de vente est actif dès sa création ; rattachez-y ensuite ses vendeurs."}
      libelleValider={point ? "Enregistrer" : (<><Plus />{type === "gare" ? "Créer le point de vente" : "Accréditer l'agence"}</>)}
      enCours={operation.enCours === "point"}
      erreur={operation.retour?.ton === "danger" ? operation.retour.detail : null}
      onSubmit={async (donnees) => {
        const valeurs = {
          code: String(donnees.get("code") ?? ""),
          name: String(donnees.get("name") ?? ""),
          type,
          stationId: texte(donnees, "stationId") as never,
          passengerCounters: nombreSaisi(donnees, "passengers") ?? 0,
          baggageCounters: nombreSaisi(donnees, "baggage") ?? 0,
          parcelCounters: nombreSaisi(donnees, "parcels") ?? 0,
          royaltyPct: type === "gare" ? undefined : nombreSaisi(donnees, "royaltyPct"),
        }
        const id = await operation.executer("point", () => (point ? modifier({ pointOfSaleId: point._id as never, ...valeurs }) : creer(valeurs)))
        if (id) {
          onOpenChange(false)
          if (!point) onCree?.(id)
        }
      }}
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
        <Field label="Code" htmlFor="pdv-code">
          <Input id="pdv-code" name="code" defaultValue={point?.code} placeholder={type === "gare" ? "OWE" : "AG-LBV1"} required className="tabular uppercase" />
        </Field>
        <Field label="Nom" htmlFor="pdv-nom">
          <Input id="pdv-nom" name="name" defaultValue={point?.name} placeholder={type === "gare" ? "Gare d'Owendo" : "Agence Libreville Centre"} required />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Type" htmlFor="pdv-type">
          <SelectNative id="pdv-type" value={type} onChange={(event) => setType(event.target.value as TypePoint)}>
            {Object.entries(TYPES_POINT_DE_VENTE).map(([valeur, libelle]) => (
              <option key={valeur} value={valeur}>
                {libelle}
              </option>
            ))}
          </SelectNative>
        </Field>
        <Field label="Gare de rattachement" htmlFor="pdv-gare">
          <SelectNative id="pdv-gare" name="stationId" defaultValue={point?.stationId ?? ""}>
            <option value="">Aucune</option>
            {stations?.map((s) => (
              <option key={s._id} value={s._id}>
                {s.name} · PK {s.kilometerPoint}
                {s.isActive ? "" : " · fermée"}
              </option>
            ))}
          </SelectNative>
        </Field>
      </div>
      <fieldset className="grid gap-2">
        <legend className="text-[13px] font-medium">Postes de vente</legend>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Voyageurs" htmlFor="pdv-voyageurs">
            <Input id="pdv-voyageurs" name="passengers" inputMode="numeric" defaultValue={point?.counters.passengers ?? 1} required className="tabular" />
          </Field>
          <Field label="Bagages" htmlFor="pdv-bagages">
            <Input id="pdv-bagages" name="baggage" inputMode="numeric" defaultValue={point?.counters.baggage ?? 0} required className="tabular" />
          </Field>
          <Field label="Colis" htmlFor="pdv-colis">
            <Input id="pdv-colis" name="parcels" inputMode="numeric" defaultValue={point?.counters.parcels ?? 0} required className="tabular" />
          </Field>
        </div>
      </fieldset>
      {type !== "gare" ? (
        <Field label="Commission de l'agence (%)" hint="Taux de royalties reversé à l'agence." htmlFor="pdv-royalties">
          <Input id="pdv-royalties" name="royaltyPct" inputMode="decimal" defaultValue={point?.royaltyPct ?? undefined} className="tabular" />
        </Field>
      ) : null}
    </FenetreFormulaire>
  )
}

type Vendeur = Dossier["vendeurs"][number]
type Caisse = Dossier["caisses"][number]

const colonnesVendeurs: ColonneTableau<Vendeur>[] = [
  { cle: "nom", libelle: "Vendeur", rendu: (v) => <CelluleDouble haut={v.nom} bas={<span className="tabular">{v.matricule ?? "sans matricule"}</span>} />, tri: (v) => v.nom },
  { cle: "role", libelle: "Rôle", rendu: (v) => ROLE_LABELS[v.role], tri: (v) => ROLE_LABELS[v.role], secondaire: true },
  { cle: "acces", libelle: "Dernier accès", rendu: (v) => <span className="tabular">{dateHeure(v.lastSeenAt)}</span>, tri: (v) => v.lastSeenAt ?? 0 },
  {
    cle: "etat",
    libelle: "État",
    rendu: (v) => (
      <span className="flex flex-wrap gap-1.5">
        <TagActif actif={v.isActive} />
        {v.caisseOuverte ? (
          <Pastille ton="success" icone={LockOpen}>
            Caisse ouverte
          </Pastille>
        ) : null}
      </span>
    ),
    tri: (v) => (v.caisseOuverte ? 0 : v.isActive ? 1 : 2),
    export: (v) => `${v.isActive ? "Actif" : "Suspendu"}${v.caisseOuverte ? " · caisse ouverte" : ""}`,
  },
]

const colonnesCaisses: ColonneTableau<Caisse>[] = [
  { cle: "vendeur", libelle: "Vendeur", rendu: (c) => agent(c.vendeur), tri: (c) => c.vendeur?.nom },
  { cle: "ouverte", libelle: "Ouverte", rendu: (c) => <span className="tabular">{dateHeure(c.openedAt)}</span>, tri: (c) => c.openedAt },
  { cle: "fermee", libelle: "Clôturée", rendu: (c) => <span className="tabular">{dateHeure(c.closedAt)}</span>, tri: (c) => c.closedAt ?? 0, secondaire: true },
  { cle: "ecart", libelle: "Écart", rendu: (c) => (c.varianceXaf === null ? "—" : `${c.varianceXaf > 0 ? "+" : c.varianceXaf < 0 ? "−" : ""}${montant(Math.abs(c.varianceXaf))}`), tri: (c) => c.varianceXaf ?? 0, numerique: true },
  {
    cle: "etat",
    libelle: "État",
    rendu: (c) =>
      c.status === "ouverte" ? (
        <Pastille ton="success" icone={LockOpen}>Ouverte</Pastille>
      ) : c.status === "validee" ? (
        <Pastille ton="neutral">Validée</Pastille>
      ) : c.varianceXaf && !c.varianceReason ? (
        <Pastille ton="warning">Écart à justifier</Pastille>
      ) : (
        <Pastille ton="neutral">Clôturée</Pastille>
      ),
    tri: (c) => c.status,
  },
]

export function PointOfSaleDetail({ pointOfSaleId }: { pointOfSaleId: string }) {
  const droits = useDroitsGestion()
  const dossier = useQuery(api.functions.referentiels.pointDeVente, { pointOfSaleId: pointOfSaleId as never })
  const changerEtat = useMutation(api.functions.management.setPointOfSaleStatus)
  const operation = useOperation()
  const [edition, setEdition] = useState(false)

  if (dossier === undefined || dossier === null) {
    return (
      <ManagementDetailShell title={dossier === null ? "Point de vente introuvable" : "Point de vente"} eyebrow="Commercial · réseau de vente" backHref="/gestion/points-de-vente" verrouillage="aucun">
        {dossier === null ? <InlineMessage tone="danger" title="Ce point de vente n'existe plus." /> : <SkeletonLines />}
      </ManagementDetailShell>
    )
  }
  const { pointOfSale: pos, dependances } = dossier
  const bloque = dependances.caissesOuvertes > 0 || dependances.quotasActifs > 0
  const peutModifier = droits.may("referentiel", "modifier")
  const peutSuspendre = pos.isActive ? droits.may("referentiel", "supprimer") : peutModifier
  const maxJour = Math.max(1, ...dossier.serie.map((j) => j.net))

  return (
    <ManagementDetailShell
      title={pos.name}
      eyebrow={`Commercial · ${TYPES_POINT_DE_VENTE[pos.type]} · ${pos.code}`}
      backHref="/gestion/points-de-vente"
      verrouillage="aucun"
      lectureSeule={!droits.chargement && !peutModifier}
      description={dossier.station ? `Rattaché à ${dossier.station.name}, PK ${dossier.station.kilometerPoint}.` : "Sans gare de rattachement."}
      actions={
        <>
          {peutSuspendre ? (
            <Button
              type="button"
              variant={pos.isActive ? "danger" : "secondary"}
              disabled={pos.isActive && bloque}
              loading={operation.enCours === "etat"}
              onClick={() => {
                if (pos.isActive && !window.confirm(`Suspendre ${pos.name} ? Les ventes y seront bloquées ; son historique reste.`)) return
                void operation.executer("etat", () => changerEtat({ pointOfSaleId: pos._id, isActive: !pos.isActive }), pos.isActive ? "Point de vente suspendu : son historique est conservé." : "Point de vente réactivé.")
              }}
            >
              <Power />
              {pos.isActive ? "Suspendre" : "Réactiver"}
            </Button>
          ) : null}
          {peutModifier ? (
            <Button type="button" variant="secondary" onClick={() => setEdition(true)}>
              <Pencil />
              Modifier
            </Button>
          ) : null}
        </>
      }
    >
      <div className="flex flex-wrap gap-2">
        <TagActif actif={pos.isActive} oui={pos.type === "gare" ? "Ouvert" : "Accréditée"} non="Suspendu" />
        <Pastille ton="neutral">{TYPES_POINT_DE_VENTE[pos.type]}</Pastille>
      </div>
      <RetourOperation retour={operation.retour} />
      {pos.isActive && bloque && peutSuspendre ? (
        <InlineMessage tone="info" title="Suspension protégée.">
          {dependances.caissesOuvertes} caisse(s) ouverte(s) et {dependances.quotasActifs} quota(s) actif(s) : clôturez-les ou levez-les avant de suspendre ce point de vente.
        </InlineMessage>
      ) : null}
      <Indicateurs>
        <Indicateur libelle="Postes de vente" icone={Store} valeur={nombre(pos.counters.passengers + pos.counters.baggage + pos.counters.parcels)} evolution={{ sens: "neutre", texte: `${pos.counters.passengers} voyageurs · ${pos.counters.baggage} bagages · ${pos.counters.parcels} colis` }} />
        <Indicateur libelle="Vendeurs" icone={Users} valeur={nombre(dependances.agentsActifs)} unite={`/ ${dependances.agents}`} evolution={{ sens: "neutre", texte: "comptes actifs rattachés" }} />
        <Indicateur libelle="Caisses ouvertes" icone={LockOpen} valeur={nombre(dossier.caissesOuvertes)} />
        <Indicateur libelle="Recette · 30 j" icone={Coins} valeur={millions(dossier.recette30j)} unite="XAF" fort evolution={{ sens: "neutre", texte: `${nombre(dossier.billets30j)} billets · journées clôturées` }} />
      </Indicateurs>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.6fr)]">
        <div className="grid content-start gap-5">
          <Panneau titre="Vendeurs" icone={Users} plein>
            <div className="p-3">
              <TableauDonnees
                libelle="Vendeurs rattachés"
                colonnes={colonnesVendeurs}
                lignes={dossier.vendeurs}
                cle={(v) => v.id}
                lien={droits.may("utilisateurs") ? (v) => `/gestion/utilisateurs/${v.id}` : undefined}
                exportNom={`vendeurs-${pos.code}`}
                parPage={10}
                vide={{ titre: "Aucun vendeur rattaché", description: "Rattachez un compte à ce point de vente depuis « Utilisateurs et droits »." }}
              />
            </div>
          </Panneau>
          <Panneau titre="Caisses" icone={Coins} sousTitre="12 dernières sessions" plein>
            <div className="p-3">
              <TableauDonnees
                libelle="Sessions de caisse"
                colonnes={colonnesCaisses}
                lignes={dossier.caisses}
                cle={(c) => c.id}
                exportNom={`caisses-${pos.code}`}
                parPage={12}
                vide={{ titre: "Aucune caisse ouverte à ce jour", description: "Les sessions apparaissent à la première ouverture de caisse." }}
              />
            </div>
          </Panneau>
        </div>
        <div className="grid content-start gap-4">
          <Panneau titre="Recette nette par jour" icone={Ticket} sousTitre="30 derniers jours · XAF">
            {dossier.serie.length === 0 ? (
              <p className="text-small text-ink-muted">Aucune journée clôturée sur la période.</p>
            ) : (
              <ol className="grid gap-1.5">
                {dossier.serie.slice(-10).map((jour) => (
                  <li key={jour.date} className="grid grid-cols-[48px_minmax(0,1fr)_72px] items-center gap-2 text-[13px]">
                    <span className="tabular text-ink-muted">{dateServiceCourte(jour.date)}</span>
                    <span aria-hidden className="h-2.5 rounded-[3px] bg-accent-base" style={{ width: `${Math.max(2, (jour.net / maxJour) * 100)}%` }} />
                    <span className="tabular text-right">{millions(jour.net)}</span>
                  </li>
                ))}
              </ol>
            )}
          </Panneau>
          {pos.type !== "gare" ? (
            <Panneau titre="Quotas en cours" icone={Store} plein>
              {dossier.quotas.length === 0 ? (
                <p className="text-small p-4 text-ink-muted">Aucun quota actif.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {dossier.quotas.map((q) => (
                    <li key={q.id} className="grid gap-0.5 px-4 py-2.5 text-[13.5px]">
                      <b className="font-semibold">{q.desserte ? `${libelleDesserte(q.desserte)} · ${dateService(q.desserte.serviceDate)}` : "Desserte"}</b>
                      <small className="text-ink-muted">
                        {CLASSES[q.serviceClass].long} · <span className="tabular">{q.sold} / {q.allocated}</span> vendues · libération {q.releaseAt ? <span className="tabular">{dateHeure(q.releaseAt)}</span> : "au départ"}
                      </small>
                    </li>
                  ))}
                </ul>
              )}
            </Panneau>
          ) : null}
          <Panneau titre="Fiche" icone={Store}>
            <Fiche
              elements={[
                ["Code", <span key="c" className="tabular">{pos.code}</span>],
                ["Gare", dossier.station ? `${dossier.station.name} · PK ${dossier.station.kilometerPoint}` : "—"],
                pos.royaltyPct !== undefined ? ["Commission", `${pos.royaltyPct.toLocaleString("fr-FR")} %`] : null,
              ]}
            />
          </Panneau>
          <Panneau titre="Historique" icone={History}>
            <Historique historique={dossier.historique} />
          </Panneau>
        </div>
      </div>
      <DialoguePointDeVente
        open={edition}
        onOpenChange={setEdition}
        point={{ _id: pos._id, code: pos.code, name: pos.name, type: pos.type, stationId: pos.stationId, counters: pos.counters, royaltyPct: pos.royaltyPct }}
      />
    </ManagementDetailShell>
  )
}
