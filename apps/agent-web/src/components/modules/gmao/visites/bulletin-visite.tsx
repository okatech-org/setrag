"use client"

import { ClipboardCheck, History, ListChecks, PenLine, Plus, Printer, TrainFront, TriangleAlert, Wrench, X } from "lucide-react"
import { useState } from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { Button } from "@workspace/ui/components/button"
import { Radio, RadioGroup } from "@workspace/ui/components/choice"
import { Field, Input, SelectNative, Textarea } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { SegmentedControl } from "@workspace/ui/components/segmented-control"

import { Chronologie, Fiche, LienBouton, Panneau } from "@/components/charte"
import { RetourOperation, useOperation } from "@/components/gestion/referentiels/elements"
import { dateHeure, dateService, messageErreur, nombre } from "@/components/gestion/referentiels/format"
import { FenetreFormulaire, texte } from "@/components/gestion/referentiels/formulaire"
import { Pastille } from "@/components/gestion/referentiels/statuts"

import {
  APTITUDES,
  CadreGmao,
  DossierEnChargement,
  DossierIntrouvable,
  FAMILLES,
  GRAVITES_DEFAUT,
  gmaoApi,
  RESULTATS_CONTROLE,
  TagAptitude,
  TagEngin,
  TagOt,
  TagPriorite,
  useDroitsGmao,
  type DossierVisite,
} from "../commun"
import { evenementsGmao, LienCellule } from "../parc/partage"
import { aptitudesAdmises, BandeauDecision, TagGraviteDefaut, type Aptitude, type Gravite } from "./decision"
import { TagStatutVisite } from "./visites"

type Resultat = keyof typeof RESULTATS_CONTROLE

const OPTIONS_CONTROLE = (Object.keys(RESULTATS_CONTROLE) as Resultat[]).map((cle) => ({ value: cle, label: RESULTATS_CONTROLE[cle] }))

const TONS_RESULTAT = { ok: "success", defaut: "danger", non_applicable: "neutral" } as const

/** Bulletin de visite avant départ : décision, composition, check-list, défauts, signature. */
export function BulletinVisite({ visiteId }: { visiteId: string }) {
  const dossier = useQuery(gmaoApi.queries.visite, { visiteId: visiteId as never })
  const retour = { href: "/materiel/visites", libelle: "Visites avant départ" }
  if (dossier === undefined) {
    return (
      <CadreGmao titre="Visite avant départ" retour={retour}>
        <DossierEnChargement />
      </CadreGmao>
    )
  }
  if (dossier === null) {
    return (
      <CadreGmao titre="Visite avant départ" retour={retour}>
        <DossierIntrouvable quoi="Visite" retour={{ href: "/materiel/visites", libelle: "Revenir aux visites" }} />
      </CadreGmao>
    )
  }
  return <ContenuBulletin key={`${dossier.visite.id}-${dossier.visite.statut}`} dossier={dossier} />
}

function ContenuBulletin({ dossier }: { dossier: DossierVisite }) {
  const droits = useDroitsGmao()
  const majControles = useMutation(gmaoApi.mutations.majControles)
  const retirerDefaut = useMutation(gmaoApi.mutations.retirerDefaut)
  const operation = useOperation()
  const { visite } = dossier
  const editable = visite.statut === "en_cours" && droits.peut("visite_signer")
  const [resultats, setResultats] = useState<Record<string, Resultat>>(() =>
    Object.fromEntries(visite.controles.map((controle) => [controle.code, controle.resultat]))
  )
  const [observations, setObservations] = useState(visite.observations ?? "")
  const [dialogue, setDialogue] = useState<"defaut" | "signer" | null>(null)
  const [ouvertures, setOuvertures] = useState(0)

  const modifies = visite.controles.filter((controle) => resultats[controle.code] !== controle.resultat)
  const observationsModifiees = observations.trim() !== (visite.observations ?? "").trim()
  const nonEnregistre = modifies.length > 0 || observationsModifiees
  const enDefaut = visite.controles.filter((controle) => controle.resultat === "defaut").length
  const ouvrir = (cle: "defaut" | "signer") => {
    operation.effacer()
    setOuvertures((n) => n + 1)
    setDialogue(cle)
  }
  const fermer = (ouvert: boolean) => {
    if (!ouvert) setDialogue(null)
  }

  const enregistrer = () =>
    void operation.executer(
      "controles",
      () =>
        majControles({
          visiteId: visite.id,
          controles: visite.controles.map((controle) => ({ code: controle.code, resultat: resultats[controle.code] ?? controle.resultat })),
          observations,
        }),
      "Check-list enregistrée."
    )

  return (
    <CadreGmao
      titre={`Visite ${visite.numero}`}
      description={`Convoi ${visite.convoi} · ${dossier.atelier?.nom ?? "atelier inconnu"} · ouverte le ${dateHeure(visite.debutLe)}`}
      retour={{ href: "/materiel/visites", libelle: "Visites avant départ" }}
      actions={
        <>
          <LienBouton href={`/materiel/visites/${visite.id}/impression`}>
            <Printer />
            Imprimer le bulletin
          </LienBouton>
          {editable ? (
            <Button type="button" onClick={() => ouvrir("signer")}>
              <PenLine />
              Signer la visite
            </Button>
          ) : null}
        </>
      }
    >
      <BandeauDecision decision={dossier.decision} />
      <div className="flex flex-wrap items-center gap-2 text-[14px]">
        <TagStatutVisite statut={visite.statut} />
        {visite.aptitude ? <TagAptitude aptitude={visite.aptitude} /> : null}
        {visite.signeeLe ? (
          <span className="text-ink-muted">
            signée le <span className="tabular">{dateHeure(visite.signeeLe)}</span> par {visite.visiteur ?? "—"}
          </span>
        ) : (
          <span className="text-ink-muted">Visiteur : {visite.visiteur ?? "—"}</span>
        )}
      </div>
      <RetourOperation retour={operation.retour} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.55fr)]">
        <div className="grid min-w-0 content-start gap-5">
          <Panneau
            titre="Check-list"
            icone={ListChecks}
            sousTitre={`${nombre(enDefaut)} contrôle(s) en défaut sur ${nombre(visite.controles.length)}`}
            pied={
              editable ? (
                <>
                  <span className="flex-1">{nonEnregistre ? `${modifies.length} contrôle(s) modifié(s) non enregistré(s).` : "Check-list à jour."}</span>
                  <Button type="button" variant="secondary" disabled={!nonEnregistre} loading={operation.enCours === "controles"} onClick={enregistrer}>
                    Enregistrer la check-list
                  </Button>
                </>
              ) : undefined
            }
          >
            <ul className="grid">
              {visite.controles.map((controle) => (
                <li key={controle.code} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line py-2.5 first:border-t-0 first:pt-0">
                  <span className="min-w-[200px] flex-1 text-[14px]">{controle.libelle}</span>
                  {editable ? (
                    <SegmentedControl
                      label={controle.libelle}
                      size="touch"
                      options={OPTIONS_CONTROLE}
                      value={resultats[controle.code] ?? controle.resultat}
                      onValueChange={(valeur) => setResultats((actuels) => ({ ...actuels, [controle.code]: valeur as Resultat }))}
                    />
                  ) : (
                    <Pastille ton={TONS_RESULTAT[controle.resultat]}>{RESULTATS_CONTROLE[controle.resultat]}</Pastille>
                  )}
                </li>
              ))}
            </ul>
            {editable ? (
              <Field label="Observations" hint="Reprises sur le bulletin imprimé">
                <Textarea value={observations} onChange={(event) => setObservations(event.target.value)} maxLength={2000} />
              </Field>
            ) : (
              <div className="grid gap-1">
                <span className="text-[13px] font-medium text-ink-muted">Observations</span>
                <p className="text-[14px] whitespace-pre-line">{visite.observations ?? "Aucune observation."}</p>
              </div>
            )}
          </Panneau>

          <Panneau
            titre="Défauts relevés"
            icone={TriangleAlert}
            sousTitre={`${nombre(visite.defauts.length)} défaut(s)`}
            actions={
              editable ? (
                <Button type="button" variant="secondary" size="sm" onClick={() => ouvrir("defaut")}>
                  <Plus />
                  Ajouter un défaut
                </Button>
              ) : null
            }
            plein
          >
            {visite.defauts.length === 0 ? (
              <p className="text-small px-4 py-4 text-ink-muted">Aucun défaut relevé sur ce convoi.</p>
            ) : (
              <div className="relative overflow-x-auto">
                <table className="w-full border-collapse text-[14px]" aria-label="Défauts relevés">
                  <thead>
                    <tr className="bg-surface-sunk text-left text-[11.5px] tracking-[0.05em] text-ink-muted uppercase">
                      <th scope="col" className="px-3.5 py-2.5 font-semibold">Engin</th>
                      <th scope="col" className="px-3.5 py-2.5 font-semibold">Organe</th>
                      <th scope="col" className="px-3.5 py-2.5 font-semibold">Description</th>
                      <th scope="col" className="px-3.5 py-2.5 font-semibold">Gravité</th>
                      {editable ? <th scope="col" className="px-3.5 py-2.5 font-semibold"><span className="sr-only">Action</span></th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {visite.defauts.map((defaut) => (
                      <tr key={defaut.index} className="border-t border-line align-top">
                        <td className="px-3.5 py-2.5">
                          <LienCellule href={`/materiel/parc/${defaut.equipementId}`} mono>
                            {defaut.numeroEngin}
                          </LienCellule>
                        </td>
                        <td className="px-3.5 py-2.5 font-semibold">{defaut.organe}</td>
                        <td className="px-3.5 py-2.5">{defaut.description}</td>
                        <td className="px-3.5 py-2.5">
                          <TagGraviteDefaut gravite={defaut.gravite} />
                        </td>
                        {editable ? (
                          <td className="px-3.5 py-1.5 text-right">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              aria-label={`Retirer le défaut ${defaut.organe} de ${defaut.numeroEngin}`}
                              loading={operation.enCours === `retirer-${defaut.index}`}
                              onClick={() =>
                                void operation.executer(
                                  `retirer-${defaut.index}`,
                                  () => retirerDefaut({ visiteId: visite.id, index: defaut.index }),
                                  "Défaut retiré."
                                )
                              }
                            >
                              <X />
                              Retirer
                            </Button>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panneau>

          <Panneau titre="Ordres de travail générés" icone={Wrench} sousTitre="Un OT par défaut majeur ou bloquant, ouvert à la signature">
            {dossier.ordres.length === 0 ? (
              <p className="text-small text-ink-muted">
                {visite.statut === "signee" ? "Aucun OT : aucun défaut majeur ni bloquant n'a été relevé." : "Les OT seront ouverts à la signature de la visite."}
              </p>
            ) : (
              <ul className="grid gap-2">
                {dossier.ordres.map((ot) => (
                  <li key={ot.id} className="flex flex-wrap items-center gap-2 text-[14px]">
                    <LienCellule href={`/materiel/ordres/${ot.id}`} mono>
                      {ot.numero}
                    </LienCellule>
                    <span className="min-w-0 flex-1">{ot.titre}</span>
                    <TagPriorite priorite={ot.priorite} />
                    <TagOt statut={ot.statut} />
                  </li>
                ))}
              </ul>
            )}
          </Panneau>
        </div>

        <div className="grid min-w-0 content-start gap-5">
          <Panneau titre="Composition du convoi" icone={TrainFront} sousTitre={`${nombre(dossier.engins.length)} engin(s)`}>
            <ul className="grid gap-1">
              {dossier.engins.map((engin) => (
                <li key={engin.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line pt-1 first:border-t-0 first:pt-0">
                  <LienCellule href={`/materiel/parc/${engin.id}`} mono>
                    {engin.numero}
                  </LienCellule>
                  <span className="min-w-0 flex-1 text-[13px] text-ink-muted">
                    {FAMILLES[engin.famille]} · {engin.serie}
                  </span>
                  <TagEngin statut={engin.statut} />
                </li>
              ))}
            </ul>
          </Panneau>
          <Panneau titre="Circulation" icone={ClipboardCheck}>
            <Fiche
              elements={[
                ["Convoi", <span key="c" className="tabular">{visite.convoi}</span>],
                ["Train", dossier.trajet ? <span key="t" className="tabular">{dossier.trajet.train}</span> : "Hors horaire"],
                dossier.trajet ? ["Jour de service", dateService(dossier.trajet.serviceDate)] : null,
                dossier.trajet ? ["Départ prévu", <span key="d" className="tabular">{dateHeure(dossier.trajet.departureAt)}</span>] : null,
                ["Atelier", dossier.atelier?.nom ?? "—"],
                ["Ouverte le", <span key="o" className="tabular">{dateHeure(visite.debutLe)}</span>],
                ["Signée le", visite.signeeLe ? <span key="s" className="tabular">{dateHeure(visite.signeeLe)}</span> : "Non signée"],
                ["Aptitude", visite.aptitude ? APTITUDES[visite.aptitude].libelle : "Non prononcée"],
              ]}
            />
          </Panneau>
          <Panneau titre="Journal de la visite" icone={History}>
            <Chronologie evenements={evenementsGmao(dossier.chronologie)} vide="Aucun événement enregistré." />
          </Panneau>
        </div>
      </div>

      {editable ? (
        <>
          <DialogueDefaut
            key={`defaut-${ouvertures}`}
            open={dialogue === "defaut"}
            onOpenChange={fermer}
            dossier={dossier}
            onAjoute={() => operation.signaler({ ton: "success", titre: "Défaut ajouté au bulletin." })}
          />
          <DialogueSignature
            key={`signer-${ouvertures}`}
            open={dialogue === "signer"}
            onOpenChange={fermer}
            dossier={dossier}
            observations={observations}
            nonEnregistre={nonEnregistre}
            onSigne={(aptitude, ots) =>
              operation.signaler({
                ton: "success",
                titre: `Visite signée : ${APTITUDES[aptitude].libelle}.`,
                detail: ots > 0 ? `${ots} ordre(s) de travail ouvert(s).` : undefined,
              })
            }
          />
        </>
      ) : null}
    </CadreGmao>
  )
}

/* ================================================================ Défaut */

function DialogueDefaut({
  open,
  onOpenChange,
  dossier,
  onAjoute,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  dossier: DossierVisite
  onAjoute: () => void
}) {
  const ajouter = useMutation(gmaoApi.mutations.ajouterDefaut)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  return (
    <FenetreFormulaire
      open={open}
      onOpenChange={(ouvert) => {
        onOpenChange(ouvert)
        if (!ouvert) setErreur(null)
      }}
      titre="Ajouter un défaut"
      description="Mineur : signalé sans OT. Majeur : OT prioritaire ouvert à la signature, apte sous réserve au mieux. Bloquant : OT urgent, engin immobilisé, convoi inapte."
      libelleValider="Ajouter le défaut"
      enCours={enCours}
      erreur={erreur}
      onSubmit={async (donnees) => {
        setErreur(null)
        const equipementId = texte(donnees, "equipementId")
        const organe = texte(donnees, "organe")
        const description = texte(donnees, "description")
        if (!equipementId || !organe || !description) {
          setErreur("L'engin, l'organe et la description sont obligatoires.")
          return
        }
        setEnCours(true)
        try {
          await ajouter({
            visiteId: dossier.visite.id,
            equipementId: equipementId as never,
            organe,
            description,
            gravite: String(donnees.get("gravite")) as Gravite,
          })
          onOpenChange(false)
          onAjoute()
        } catch (cause) {
          setErreur(messageErreur(cause))
        } finally {
          setEnCours(false)
        }
      }}
    >
      <Field label="Engin du convoi">
        <SelectNative name="equipementId" required defaultValue={dossier.engins.length === 1 ? dossier.engins[0]!.id : ""}>
          <option value="">Choisir un engin…</option>
          {dossier.engins.map((engin) => (
            <option key={engin.id} value={engin.id}>
              {engin.numero} — {engin.serie}
            </option>
          ))}
        </SelectNative>
      </Field>
      <Field label="Organe">
        <Input name="organe" required maxLength={120} placeholder="Ex. Semelle de frein, attelage, boîte d'essieu" />
      </Field>
      <Field label="Description">
        <Textarea name="description" required maxLength={1000} />
      </Field>
      <Field label="Gravité">
        <SelectNative name="gravite" defaultValue="mineur">
          {Object.entries(GRAVITES_DEFAUT).map(([cle, libelle]) => (
            <option key={cle} value={cle}>
              {libelle}
            </option>
          ))}
        </SelectNative>
      </Field>
    </FenetreFormulaire>
  )
}

/* ============================================================= Signature */

const AIDES_APTITUDE: Record<Aptitude, string> = {
  apte: "Le convoi peut partir.",
  apte_sous_reserve: "Le convoi peut partir ; les réserves sont tracées et les défauts majeurs ouvrent un OT.",
  inapte: "Le départ est bloqué tant qu'une nouvelle visite n'est pas signée apte.",
}

function DialogueSignature({
  open,
  onOpenChange,
  dossier,
  observations,
  nonEnregistre,
  onSigne,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  dossier: DossierVisite
  observations: string
  nonEnregistre: boolean
  onSigne: (aptitude: Aptitude, ots: number) => void
}) {
  const signer = useMutation(gmaoApi.mutations.signerVisite)
  const admises = aptitudesAdmises(dossier.visite.defauts)
  const [aptitude, setAptitude] = useState<Aptitude>(admises[0]!)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const controlesEnDefaut = dossier.visite.controles.filter((controle) => controle.resultat === "defaut").length
  const majeurs = dossier.visite.defauts.filter((defaut) => defaut.gravite !== "mineur").length

  return (
    <FenetreFormulaire
      open={open}
      onOpenChange={(ouvert) => {
        onOpenChange(ouvert)
        if (!ouvert) setErreur(null)
      }}
      titre={`Signer la visite ${dossier.visite.numero}`}
      description="La signature fige le bulletin : la check-list et les défauts ne sont plus modifiables."
      libelleValider="Signer la visite"
      enCours={enCours}
      erreur={erreur}
      onSubmit={async () => {
        setErreur(null)
        setEnCours(true)
        try {
          const resultat = await signer({ visiteId: dossier.visite.id, aptitude, observations })
          onOpenChange(false)
          onSigne(resultat.aptitude, resultat.otIds.length)
        } catch (cause) {
          setErreur(messageErreur(cause))
        } finally {
          setEnCours(false)
        }
      }}
    >
      {nonEnregistre ? (
        <InlineMessage tone="warning" title="Check-list non enregistrée">
          Les contrôles modifiés depuis le dernier enregistrement ne seront pas pris en compte. Les observations saisies le seront.
        </InlineMessage>
      ) : null}
      {controlesEnDefaut > 0 && dossier.visite.defauts.length === 0 ? (
        <InlineMessage tone="warning" title="Défaut à décrire">
          {controlesEnDefaut} contrôle(s) noté(s) en défaut sans défaut décrit : la signature sera refusée.
        </InlineMessage>
      ) : null}
      <fieldset className="grid gap-1">
        <legend className="mb-1 text-[13px] font-medium">Aptitude prononcée</legend>
        <RadioGroup value={aptitude} onValueChange={(valeur) => setAptitude(valeur as Aptitude)} aria-label="Aptitude prononcée">
          {admises.map((cle) => (
            <div key={cle} className="grid">
              <Radio value={cle} label={APTITUDES[cle].libelle} />
              <small className="pl-[34px] text-[12.5px] text-ink-muted">{AIDES_APTITUDE[cle]}</small>
            </div>
          ))}
        </RadioGroup>
        {admises.length < 3 ? (
          <p className="text-[12.5px] text-ink-muted">
            Les défauts relevés interdisent une aptitude plus favorable que « {APTITUDES[admises[0]!].libelle} ».
          </p>
        ) : null}
      </fieldset>
      <p className="text-small text-ink-muted">
        {majeurs > 0 ? `${majeurs} ordre(s) de travail seront ouverts à la signature.` : "Aucun ordre de travail ne sera ouvert."}
      </p>
    </FenetreFormulaire>
  )
}
