"use client"

import { Armchair, Banknote, CheckCheck, FileText, ListOrdered, SquarePen, WifiOff } from "lucide-react"
import { useMemo, useState } from "react"

import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { Field, Input, SelectNative } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { Tag } from "@workspace/ui/components/tag"
import { cn } from "@workspace/ui/lib/utils"

import { CelluleDouble, EnTetePage, Indicateur, Indicateurs, Panneau, TableauDonnees, type ColonneTableau } from "@/components/charte"
import { CLASSES, dateCourte, duree, heure, jourDeService, libelleClasse, montant, nomTrain, xaf, type Classe } from "@/lib/agent-data"

import { CadreGuichet, ChargementEcran, LimiteErreur, useGuichet } from "./cadre"
import { messageErreur, useEcriture, useLecture, type Carnet, type Contexte } from "./donnees"
import { Encart } from "./elements"

/* ═════════════════════════════ Souches ════════════════════════════════════ */

interface LigneSouche {
  numero: string
  etat: "ressaisie" | "a_ressaisir"
  souche: Carnet["souches"][number] | null
}

function lignesDuCarnet(carnet: Carnet): LigneSouche[] {
  const lignes: LigneSouche[] = carnet.souches.map((souche) => ({ numero: souche.numero, etat: "ressaisie", souche }))
  for (const numero of carnet.sequence?.manquantes ?? []) lignes.push({ numero, etat: "a_ressaisir", souche: null })
  return lignes.sort((a, b) => a.numero.localeCompare(b.numero, "fr", { numeric: true }))
}

/** Prochaine souche à ressaisir : le premier trou, sinon la suivante du carnet. */
function prochaineSouche(carnet: Carnet) {
  const manquante = carnet.sequence?.manquantes[0]
  if (manquante) return manquante
  if (!carnet.carnet || !carnet.sequence) return ""
  const suivante = carnet.sequence.premiere + carnet.sequence.utilisees
  if (suivante > carnet.sequence.derniere) return ""
  return `${carnet.carnet.firstNumber.replace(/\d+$/, "")}${String(suivante).padStart(carnet.sequence.largeur, "0")}`
}

const COLONNES: readonly ColonneTableau<LigneSouche>[] = [
  { cle: "numero", libelle: "Souche", rendu: (l) => <span className="tabular">{l.numero}</span>, tri: (l) => l.numero },
  {
    cle: "heure",
    libelle: "Heure papier",
    rendu: (l) => <span className="tabular">{l.souche ? heure(l.souche.venduA) : "—"}</span>,
    tri: (l) => l.souche?.venduA ?? 0,
    export: (l) => (l.souche ? new Date(l.souche.venduA) : ""),
  },
  {
    cle: "desserte",
    libelle: "Desserte",
    rendu: (l) => (l.souche?.desserte ? `${nomTrain(l.souche.desserte.trainType, l.souche.desserte.trainNumber)} · ${dateCourte(l.souche.desserte.serviceDate)}` : "—"),
    tri: (l) => l.souche?.desserte?.departAt ?? 0,
    export: (l) => (l.souche?.desserte ? `${l.souche.desserte.trainNumber} ${l.souche.desserte.serviceDate}` : ""),
    secondaire: true,
  },
  {
    cle: "trajet",
    libelle: "Trajet · classe",
    rendu: (l) => (l.souche ? <CelluleDouble haut={l.souche.voyageur ?? "—"} bas={[l.souche.trajet, l.souche.classe ? libelleClasse(l.souche.classe, true) : null].filter(Boolean).join(" · ")} /> : "—"),
    tri: (l) => l.souche?.trajet ?? "",
    export: (l) => [l.souche?.voyageur, l.souche?.trajet, l.souche?.classe].filter(Boolean).join(" · "),
  },
  { cle: "montant", libelle: "Montant", rendu: (l) => (l.souche ? montant(l.souche.montant) : "—"), tri: (l) => l.souche?.montant ?? 0, numerique: true },
  {
    cle: "etat",
    libelle: "État",
    rendu: (l) =>
      l.etat === "ressaisie" ? (
        <span className="grid gap-0.5">
          <Tag tone="success">
            <CheckCheck aria-hidden />
            Ressaisie
          </Tag>
          <small className="tabular text-[12px] text-ink-muted">
            {l.souche?.billet ? `${l.souche.billet.numero}${l.souche.billet.place ? ` · ${l.souche.billet.voiture ?? ""} ${l.souche.billet.place}` : ""}` : l.souche?.numeroSysteme}
          </small>
        </span>
      ) : (
        <Tag tone="warning">
          <SquarePen aria-hidden />À ressaisir
        </Tag>
      ),
    tri: (l) => l.etat,
    export: (l) => (l.etat === "ressaisie" ? `Ressaisie ${l.souche?.numeroSysteme ?? ""}` : "À ressaisir"),
  },
]

/* ═════════════════════════════ Saisie ═════════════════════════════════════ */

function FormulaireSouche({ carnet, contexte, numeroPropose, onEnregistree }: { carnet: Carnet; contexte: Contexte; numeroPropose: string; onEnregistree: (texte: string) => void }) {
  const gares = useLecture(api.functions.referential.listStations, {})
  const enregistrer = useEcriture(api.functions.manualSales.recordManualSale)
  const [numero, setNumero] = useState(numeroPropose)
  const [date, setDate] = useState(jourDeService())
  const [heurePapier, setHeurePapier] = useState("")
  const [origine, setOrigine] = useState<string>(contexte.pointOfSale.stationId ?? "")
  const [arrivee, setArrivee] = useState("")
  const [dateTrain, setDateTrain] = useState(jourDeService())
  const [tripId, setTripId] = useState("")
  const [classe, setClasse] = useState<Classe>("DEUXIEME")
  const [montantPercu, setMontantPercu] = useState("")
  const [voyageur, setVoyageur] = useState("")
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState("")
  const dessertes = useLecture(
    api.functions.guichet.dessertes,
    origine && arrivee && origine !== arrivee ? { originStationId: origine as never, destinationStationId: arrivee as never, serviceDate: dateTrain, discountCodes: [""] } : "skip"
  )

  const valider = async () => {
    if (!numero.trim()) return setErreur("Numéro de souche obligatoire.")
    if (!heurePapier) return setErreur("Heure inscrite sur la souche obligatoire.")
    if (!origine || !arrivee || origine === arrivee) return setErreur("Choisissez deux gares différentes.")
    if (!voyageur.trim()) return setErreur("Nom du voyageur inscrit sur la souche obligatoire.")
    const soldAt = Date.parse(`${date}T${heurePapier}:00+01:00`)
    if (!Number.isFinite(soldAt)) return setErreur("Date ou heure illisible.")
    setEnCours(true)
    setErreur("")
    try {
      const r = await enregistrer({
        preprintedNumber: numero.trim(),
        soldAt,
        originalSellerId: carnet.vendeurId as never,
        tripId: tripId ? (tripId as never) : undefined,
        originStationId: origine as never,
        destinationStationId: arrivee as never,
        serviceClass: classe,
        passengerName: voyageur.trim(),
        amountReceivedXaf: Number(montantPercu || 0),
      })
      onEnregistree(
        `Souche ${r.preprintedNumber} ressaisie · ${r.systemNumber}` +
          (r.seat ? ` · place ${r.seat.coachLabel ?? ""} ${r.seat.seatLabel ?? ""} tenue` : r.withoutSeat ? " · train complet, aucune place tenue" : "")
      )
    } catch (cause) {
      setErreur(messageErreur(cause, "La souche n'a pas pu être ressaisie."))
    } finally {
      setEnCours(false)
    }
  }

  const listeGares = (gares ?? []).map((g) => (
    <option key={g._id} value={g._id}>
      {g.name}
    </option>
  ))

  return (
    <Panneau titre={numero ? `Souche ${numero}` : "Nouvelle souche"} icone={SquarePen}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="N° de la souche" htmlFor="souche-numero">
          <Input id="souche-numero" className="tabular" value={numero} onChange={(e) => setNumero(e.target.value)} />
        </Field>
        <Field label="Montant perçu (XAF)" htmlFor="souche-montant">
          <Input id="souche-montant" className="tabular" inputMode="numeric" value={montantPercu} onChange={(e) => setMontantPercu(e.target.value.replace(/\D/g, ""))} />
        </Field>
        <Field label="Date de la vente" htmlFor="souche-date">
          <Input id="souche-date" type="date" max={jourDeService()} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Heure inscrite" htmlFor="souche-heure">
          <Input id="souche-heure" type="time" value={heurePapier} onChange={(e) => setHeurePapier(e.target.value)} />
        </Field>
        <Field label="De" htmlFor="souche-origine">
          <SelectNative id="souche-origine" value={origine} onChange={(e) => setOrigine(e.target.value)}>
            <option value="">Gare de départ</option>
            {listeGares}
          </SelectNative>
        </Field>
        <Field label="À" htmlFor="souche-arrivee">
          <SelectNative id="souche-arrivee" value={arrivee} onChange={(e) => setArrivee(e.target.value)}>
            <option value="">Gare d&apos;arrivée</option>
            {listeGares}
          </SelectNative>
        </Field>
        <Field label="Jour du train" htmlFor="souche-jour">
          <Input id="souche-jour" type="date" value={dateTrain} onChange={(e) => setDateTrain(e.target.value)} />
        </Field>
        <Field label="Classe" htmlFor="souche-classe">
          <SelectNative id="souche-classe" value={classe} onChange={(e) => setClasse(e.target.value as Classe)}>
            {CLASSES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.libelle}
              </option>
            ))}
          </SelectNative>
        </Field>
      </div>
      <Field label="Desserte" htmlFor="souche-desserte" hint={dessertes && dessertes.length === 0 ? "Aucun train ce jour-là sur ce trajet : la souche s'enregistre sans place." : "La place est tenue sur ce train."}>
        <SelectNative id="souche-desserte" value={tripId} onChange={(e) => setTripId(e.target.value)}>
          <option value="">Sans desserte (aucune place tenue)</option>
          {(dessertes ?? []).map((d) => (
            <option key={d.tripId} value={d.tripId} disabled={d.status === "annule"}>
              {nomTrain(d.trainType, d.trainNumber)} · {dateCourte(d.serviceDate)} · {heure(d.departAt)}
            </option>
          ))}
        </SelectNative>
      </Field>
      <Field label="Voyageur (NOM Prénom)" htmlFor="souche-voyageur">
        <Input id="souche-voyageur" autoComplete="off" value={voyageur} onChange={(e) => setVoyageur(e.target.value)} placeholder="ESSONO Blaise" />
      </Field>
      <Encart icone={Armchair} titre={tripId ? "Place attribuée à l'enregistrement" : "Pas de place tenue"}>
        {tripId ? "La première place libre du trajet, pour que la place ne soit pas revendue. La souche reste le titre du voyageur." : "Choisissez la desserte pour tenir la place du voyageur."}
      </Encart>
      {erreur ? (
        <InlineMessage tone="danger" title="Ressaisie refusée.">
          {erreur}
        </InlineMessage>
      ) : null}
      <Button type="button" block loading={enCours} loadingLabel="Enregistrement…" onClick={valider}>
        <CheckCheck aria-hidden />
        Enregistrer la ressaisie
      </Button>
    </Panneau>
  )
}

/* ═════════════════════════════ Écran ══════════════════════════════════════ */

function EcranVentesManuelles({ contexte, enLigne }: { contexte: Contexte; enLigne: boolean }) {
  const carnet = useLecture(api.functions.guichet.ventesManuelles, {})
  const [choisie, setChoisie] = useState<string | null>(null)
  const [message, setMessage] = useState("")
  const [version, setVersion] = useState(0)
  const lignes = useMemo(() => (carnet ? lignesDuCarnet(carnet) : undefined), [carnet])

  if (carnet === undefined) return <ChargementEcran libelle="Chargement du carnet…" />
  const numeroPropose = choisie ?? prochaineSouche(carnet)
  const taille = carnet.sequence ? carnet.sequence.derniere - carnet.sequence.premiere + 1 : null
  const aRessaisir = carnet.sequence?.manquantes.length ?? 0

  return (
    <>
      <EnTetePage
        surtitre="Guichet · mode dégradé"
        titre="Ressaisir les ventes papier"
        description="Pendant la coupure, chaque billet vendu sur souche pré-imprimée garde son numéro. On le ressaisit ici : il reçoit un numéro système, sans être réimprimé."
      />
      {!enLigne ? (
        <InlineMessage tone="warning" title="Réseau perdu.">
          <span className="inline-flex items-center gap-2">
            <WifiOff aria-hidden className="size-4" />
            Continuez sur le carnet : la ressaisie se fera au retour du réseau.
          </span>
        </InlineMessage>
      ) : null}
      {!carnet.carnet ? (
        <InlineMessage tone="info" title="Aucun carnet de secours déclaré.">
          Déclarez le carnet à l&apos;ouverture de la caisse pour suivre ses souches. Vous pouvez tout de même ressaisir une souche par son numéro.
        </InlineMessage>
      ) : null}
      <Indicateurs>
        <Indicateur
          libelle="Période papier"
          icone={WifiOff}
          valeur={carnet.indicateurs.coupure ? `${heure(carnet.indicateurs.coupure.debut)} → ${heure(carnet.indicateurs.coupure.fin)}` : "—"}
          evolution={{ sens: "neutre", texte: carnet.indicateurs.coupure ? duree(carnet.indicateurs.coupure.debut, carnet.indicateurs.coupure.fin) : "aucune souche" }}
        />
        <Indicateur
          libelle="Souches utilisées"
          icone={FileText}
          valeur={carnet.sequence?.utilisees ?? carnet.souches.length}
          unite={taille ? `/ ${taille}` : undefined}
          evolution={{ sens: "neutre", texte: carnet.carnet ? `carnet ${carnet.carnet.number}` : "hors carnet" }}
        />
        <Indicateur
          libelle="Ressaisies"
          icone={CheckCheck}
          valeur={carnet.indicateurs.ressaisies}
          unite={carnet.sequence ? `/ ${carnet.sequence.utilisees}` : undefined}
          remplissage={carnet.sequence && carnet.sequence.utilisees > 0 ? carnet.indicateurs.ressaisies / carnet.sequence.utilisees : undefined}
          evolution={aRessaisir ? { sens: "vigilance", texte: `${aRessaisir} à ressaisir` } : { sens: "neutre", texte: "séquence continue" }}
        />
        <Indicateur libelle="Encaissé sur papier" icone={Banknote} valeur={montant(carnet.indicateurs.encaisse)} unite="XAF" />
      </Indicateurs>
      {message ? <InlineMessage tone="success" title={message} /> : null}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <Panneau
          titre={carnet.carnet ? `Souches du carnet ${carnet.carnet.number}` : "Souches ressaisies"}
          icone={ListOrdered}
          sousTitre={carnet.carnet ? `${carnet.carnet.firstNumber} → ${carnet.carnet.lastNumber}` : undefined}
          plein
        >
          <div className="p-3">
            <TableauDonnees
              libelle="Souches du carnet"
              colonnes={COLONNES}
              lignes={lignes}
              cle={(l) => l.numero}
              surLigne={(l) => (l.etat === "a_ressaisir" ? setChoisie(l.numero) : undefined)}
              selection={choisie ?? undefined}
              recherche={{ placeholder: "N° de souche ou voyageur", texte: (l) => [l.numero, l.souche?.voyageur, l.souche?.numeroSysteme].filter(Boolean).join(" ") }}
              exportNom={carnet.carnet ? `souches-carnet-${carnet.carnet.number}` : "souches-ressaisies"}
              triInitial={{ cle: "numero", sens: "asc" }}
              vide={{ titre: "Aucune souche ressaisie", description: "Chaque souche vendue pendant une coupure se ressaisit ici, dans l'ordre du carnet." }}
            />
          </div>
          {aRessaisir > 0 ? (
            <p className={cn("border-t border-line px-4 py-3 text-[13px] font-medium text-warning-ink")}>
              Contrôle de séquence : {aRessaisir} souche{aRessaisir > 1 ? "s" : ""} manquante{aRessaisir > 1 ? "s" : ""} entre la première et la dernière ressaisie (
              <span className="tabular">{carnet.sequence!.manquantes.slice(0, 6).join(", ")}</span>
              {aRessaisir > 6 ? "…" : ""}).
            </p>
          ) : null}
        </Panneau>
        {enLigne ? (
          <FormulaireSouche
            key={`${numeroPropose}-${version}`}
            carnet={carnet}
            contexte={contexte}
            numeroPropose={numeroPropose}
            onEnregistree={(texte) => {
              setMessage(texte)
              setChoisie(null)
              setVersion((v) => v + 1)
            }}
          />
        ) : null}
      </div>
      <p className="text-[12.5px] text-ink-muted">Total des souches ressaisies de ce point de vente : {xaf(carnet.souches.reduce((s, x) => s + x.montant, 0))}.</p>
    </>
  )
}

export function ManualSalesPageClient() {
  const { contexte, enLigne } = useGuichet()
  return (
    <CadreGuichet contexte={contexte}>
      {contexte ? (
        <LimiteErreur titre="Les ventes manuelles n'ont pas pu être lues.">
          <EcranVentesManuelles contexte={contexte} enLigne={enLigne} />
        </LimiteErreur>
      ) : (
        <ChargementEcran libelle="Chargement des ventes manuelles…" />
      )}
    </CadreGuichet>
  )
}
