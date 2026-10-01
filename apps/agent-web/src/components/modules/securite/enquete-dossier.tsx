"use client"

import type { FunctionReturnType } from "convex/server"
import {
  CircleCheck,
  FileSearch,
  ListPlus,
  Plus,
  Printer,
  Save,
  Send,
  Trash2,
  Undo2,
  UserRoundCheck,
} from "lucide-react"
import { useId, useRef, useState } from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/choice"
import { Field, SelectNative, Textarea } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { Tag } from "@workspace/ui/components/tag"

import {
  Chronologie,
  Fiche,
  LienBouton,
  Panneau,
  TableauDonnees,
} from "@/components/charte"
import {
  Encart,
  RetourOperation,
  useOperation,
} from "@/components/gestion/referentiels/elements"
import {
  AccesRestreint,
  Chargement,
  Introuvable,
  LienDossier,
  chronologie,
  dateIso,
  type Id,
} from "@/components/modules/rh/commun"

import { colonnesActions } from "./actions"
import {
  CadreSecurite,
  TagArtf,
  TagEnquete,
  TagEvenement,
  TagGravite,
  TagRetard,
  dateHeureComplete,
  useAccesSecurite,
} from "./cadre-securite"
import { DialogueAction, DialogueTexte } from "./dialogues"
import {
  CATEGORIES_CAUSE,
  NATURES_ARTF,
  libelleType,
  lieuEtPk,
  type CategorieCause,
} from "./libelles"

type Dossier = NonNullable<
  FunctionReturnType<typeof api.modules.securite.enquetes.dossier>
>

const RETOUR = { href: "/securite/enquetes", libelle: "Enquêtes" }

/* ═══════════════════════════ Contenu du rapport ═════════════════════════ */

export interface ContenuInstruction {
  constats?: string
  causes: { categorie: CategorieCause; description: string; racine: boolean }[]
  recommandations: { texte: string }[]
  conclusion?: string
}

/** Ce qui manque encore pour soumettre (miroir de la règle serveur). */
export function manquesInstruction(contenu: ContenuInstruction): string[] {
  const manques: string[] = []
  if (!contenu.constats || contenu.constats.trim().length < 20)
    manques.push("les constats (20 caractères au moins)")
  if (contenu.causes.length === 0) manques.push("au moins une cause")
  else if (!contenu.causes.some((cause) => cause.racine))
    manques.push("la cause racine")
  if (contenu.recommandations.length === 0)
    manques.push("au moins une recommandation")
  if (!contenu.conclusion || contenu.conclusion.trim().length < 10)
    manques.push("la conclusion")
  return manques
}

/* ═════════════════════════════ Dossier ══════════════════════════════════ */

export function DossierEnquete({ enqueteId }: { enqueteId: string }) {
  const { peut, acces } = useAccesSecurite()
  const lecture = peut("registre.lire")
  const dossier = useQuery(
    api.modules.securite.enquetes.dossier,
    lecture ? { enqueteId: enqueteId as Id<"securiteEnquetes"> } : "skip"
  )
  const enregistrer = useMutation(api.modules.securite.enquetes.enregistrer)
  const soumettre = useMutation(api.modules.securite.enquetes.soumettre)
  const renvoyer = useMutation(api.modules.securite.enquetes.renvoyer)
  const cloturer = useMutation(api.modules.securite.enquetes.cloturer)
  const operation = useOperation()
  const [dialogue, setDialogue] = useState<
    "renvoyer" | "cloturer" | "action" | null
  >(null)
  const [recommandation, setRecommandation] = useState<string | undefined>(
    undefined
  )

  if (acces && !lecture) {
    return (
      <CadreSecurite titre="Enquête" retour={RETOUR}>
        <AccesRestreint>
          Votre profil ne consulte pas les enquêtes de sécurité.
        </AccesRestreint>
      </CadreSecurite>
    )
  }
  if (dossier === undefined) {
    return (
      <CadreSecurite titre="Enquête" retour={RETOUR}>
        <Chargement libelle="Chargement de l'enquête" />
      </CadreSecurite>
    )
  }
  if (dossier === null) {
    return (
      <CadreSecurite titre="Enquête introuvable" retour={RETOUR}>
        <Introuvable titre="Cette enquête n'existe pas" retour={RETOUR} />
      </CadreSecurite>
    )
  }

  const { enquete, evenement, droits } = dossier
  const editable =
    droits.instruire &&
    (enquete.statut === "ouverte" || enquete.statut === "instruction")
  const soumis = enquete.statut === "rapport_soumis"
  const peutCloturer = soumis && peut("enquete.cloturer")
  const peutAjouterAction = droits.gererActions && enquete.statut !== "cloturee"

  return (
    <CadreSecurite
      titre={`Enquête ${enquete.numero}`}
      description={`${evenement.numero} · ${libelleType(evenement.type)} · ${dateHeureComplete(evenement.survenuLe)} · ${lieuEtPk(evenement)}`}
      retour={RETOUR}
      actions={
        <>
          <LienBouton
            href={`/securite/enquetes/${enquete._id}/rapport`}
            variante="ghost"
          >
            <Printer />
            Imprimer le rapport
          </LienBouton>
          {peutCloturer ? (
            <>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setDialogue("renvoyer")}
              >
                <Undo2 />
                Renvoyer à l&apos;instruction
              </Button>
              <Button type="button" onClick={() => setDialogue("cloturer")}>
                <CircleCheck />
                Clôturer l&apos;enquête
              </Button>
            </>
          ) : null}
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <TagEnquete statut={enquete.statut} />
        {dossier.enRetard ? <TagRetard libelle="Rapport en retard" /> : null}
        <span className="text-small text-ink-muted">
          Enquêteur : {enquete.enqueteurNom} · rapport attendu le{" "}
          <span className="tabular">{dateIso(enquete.echeanceRapport)}</span>
        </span>
      </div>
      <RetourOperation retour={operation.retour} />
      {enquete.statut === "instruction" && enquete.motifRenvoi ? (
        <InlineMessage tone="warning" title="Rapport renvoyé à l'instruction">
          {enquete.motifRenvoi}
        </InlineMessage>
      ) : null}
      {peutCloturer && droits.designe ? (
        <Encart
          icone={UserRoundCheck}
          titre="Séparation des tâches"
          ton="vigilance"
        >
          Vous êtes l&apos;enquêteur désigné : la clôture de cette enquête
          revient à un autre inspecteur sécurité, et le serveur la refusera.
        </Encart>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Panneau
          titre="Instruction"
          icone={FileSearch}
          sousTitre={
            editable
              ? "Constats, causes, recommandations et conclusion"
              : undefined
          }
        >
          {editable ? (
            <EditeurInstruction
              key={enquete._id}
              initial={{
                constats: enquete.constats,
                causes: enquete.causes.map((c) => ({ ...c })),
                recommandations: enquete.recommandations.map((r) => ({ ...r })),
                conclusion: enquete.conclusion,
              }}
              onEnregistrer={(contenu) =>
                enregistrer({ enqueteId: enquete._id, ...contenu })
              }
              onSoumettre={async (contenu, modifie) => {
                if (modifie || enquete.statut === "ouverte")
                  await enregistrer({ enqueteId: enquete._id, ...contenu })
                await soumettre({ enqueteId: enquete._id })
                operation.signaler({
                  ton: "success",
                  titre: "Rapport soumis pour clôture",
                })
              }}
            />
          ) : (
            <LectureInstruction enquete={enquete} />
          )}
        </Panneau>

        <div className="grid content-start gap-5">
          <Panneau titre="Événement">
            <p className="flex flex-wrap items-center gap-2 text-[14px]">
              <LienDossier href={`/securite/evenements/${evenement._id}`}>
                {evenement.numero}
              </LienDossier>
              <TagEvenement statut={evenement.statut} />
              <TagGravite gravite={evenement.gravite} />
            </p>
            <Fiche
              elements={[
                ["Nature", libelleType(evenement.type)],
                [
                  "Survenu le",
                  <span key="s" className="tabular">
                    {dateHeureComplete(evenement.survenuLe)}
                  </span>,
                ],
                ["Lieu", lieuEtPk(evenement)],
                ["Train", evenement.trainNumber ?? "—"],
                [
                  "Victimes",
                  `${evenement.blesses} blessé(s) · ${evenement.deces} décès`,
                ],
                ["Déclarant", evenement.declarantNom],
              ]}
            />
            <p className="text-[14px] whitespace-pre-line">
              {evenement.description}
            </p>
          </Panneau>
          <Panneau titre="Déclarations à l'ARTF">
            {dossier.declarations.length === 0 ? (
              <p className="text-small text-ink-muted">
                Aucun rapport d&apos;enquête n&apos;est exigé par l&apos;ARTF
                pour cet événement.
              </p>
            ) : (
              <ul className="grid gap-2">
                {dossier.declarations.map((d) => (
                  <li
                    key={d._id}
                    className="flex flex-wrap items-center gap-2 text-[14px]"
                  >
                    {peut("artf.lire") ? (
                      <LienDossier href={`/securite/artf/${d._id}`}>
                        {d.numero}
                      </LienDossier>
                    ) : (
                      <b className="tabular">{d.numero}</b>
                    )}
                    <span className="text-ink-muted">
                      {NATURES_ARTF[d.nature]}
                    </span>
                    <TagArtf statut={d.statut} />
                  </li>
                ))}
              </ul>
            )}
          </Panneau>
        </div>
      </div>

      <Panneau
        titre="Plan d'actions correctives"
        actions={
          peutAjouterAction ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setRecommandation(undefined)
                setDialogue("action")
              }}
            >
              <ListPlus />
              Ajouter une action
            </Button>
          ) : null
        }
      >
        {peutAjouterAction && enquete.recommandations.length > 0 ? (
          <ul
            className="grid gap-1"
            aria-label="Recommandations à traduire en actions"
          >
            {enquete.recommandations.map((r, index) => (
              <li
                key={index}
                className="flex flex-wrap items-center gap-2 text-[14px]"
              >
                <span className="min-w-0 flex-1">
                  <b className="tabular">R{index + 1}.</b> {r.texte}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setRecommandation(r.texte)
                    setDialogue("action")
                  }}
                >
                  <Plus />
                  En faire une action
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        <TableauDonnees
          libelle="Plan d'actions de l'enquête"
          colonnes={colonnesActions()}
          lignes={dossier.actions}
          cle={(a) => a._id}
          lien={(a) => `/securite/actions/${a._id}`}
          exportNom={`actions-${enquete.numero}`}
          triInitial={{ cle: "echeance", sens: "asc" }}
          vide={{
            titre: "Plan d'actions vide",
            description:
              "Traduisez les recommandations en actions avant la clôture.",
          }}
        />
      </Panneau>

      <Panneau titre="Chronologie de l'enquête">
        <Chronologie
          evenements={chronologie(dossier.chronologie)}
          vide="Aucune action tracée sur cette enquête."
        />
      </Panneau>

      {peutCloturer ? (
        <>
          <DialogueTexte
            open={dialogue === "renvoyer"}
            onOpenChange={(o) => setDialogue(o ? "renvoyer" : null)}
            titre="Renvoyer à l'instruction"
            description="L'enquêteur reprend le rapport ; le motif lui est affiché en tête du dossier."
            libelle="Motif du renvoi"
            libelleValider="Renvoyer"
            onValider={async (motif) => {
              await renvoyer({ enqueteId: enquete._id, motif })
              operation.signaler({
                ton: "success",
                titre: "Rapport renvoyé à l'instruction",
              })
            }}
          />
          <DialogueTexte
            open={dialogue === "cloturer"}
            onOpenChange={(o) => setDialogue(o ? "cloturer" : null)}
            titre="Clôturer l'enquête"
            description="La clôture fige le rapport, clôt l'événement et prépare le rapport ARTF s'il est exigé. Le plan d'actions ne peut pas être vide si des recommandations ont été émises."
            libelle="Note de clôture"
            aide="Facultative."
            requis={false}
            libelleValider="Clôturer"
            onValider={async (note) => {
              const resultat = await cloturer({
                enqueteId: enquete._id,
                note: note.trim() || undefined,
              })
              operation.signaler({
                ton: "success",
                titre: "Enquête clôturée",
                detail: resultat.rapportArtf
                  ? `Le rapport ${resultat.rapportArtf} est prêt à transmettre à l'ARTF.`
                  : undefined,
              })
            }}
          />
        </>
      ) : null}
      {peutAjouterAction ? (
        <DialogueAction
          key={recommandation ?? "libre"}
          open={dialogue === "action"}
          onOpenChange={(o) => setDialogue(o ? "action" : null)}
          source={{ enqueteId: enquete._id }}
          contexte={`Rattachée à l'enquête ${enquete.numero}`}
          libelleInitial={recommandation}
          onCreee={(r) =>
            operation.signaler({
              ton: "success",
              titre: `Action ${r.numero} inscrite au plan`,
            })
          }
        />
      ) : null}
    </CadreSecurite>
  )
}

/* ════════════════════════ Lecture du rapport ════════════════════════════ */

export function LectureInstruction({
  enquete,
}: {
  enquete: Dossier["enquete"]
}) {
  return (
    <div className="grid gap-4 text-[14px]">
      <section className="grid gap-1">
        <h3 className="font-bold">Constats</h3>
        <p className="whitespace-pre-line">
          {enquete.constats ?? (
            <span className="text-ink-muted">Non renseignés.</span>
          )}
        </p>
      </section>
      <section className="grid gap-1">
        <h3 className="font-bold">Causes</h3>
        {enquete.causes.length === 0 ? (
          <p className="text-ink-muted">Aucune cause établie.</p>
        ) : (
          <ul className="grid gap-2">
            {enquete.causes.map((c, index) => (
              <li key={index} className="flex flex-wrap items-start gap-2">
                <Tag tone="neutral">{CATEGORIES_CAUSE[c.categorie]}</Tag>
                {c.racine ? <Tag tone="accent">Cause racine</Tag> : null}
                <span className="min-w-0 flex-1">{c.description}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="grid gap-1">
        <h3 className="font-bold">Recommandations</h3>
        {enquete.recommandations.length === 0 ? (
          <p className="text-ink-muted">Aucune recommandation.</p>
        ) : (
          <ol className="grid list-decimal gap-1 pl-5">
            {enquete.recommandations.map((r, index) => (
              <li key={index}>{r.texte}</li>
            ))}
          </ol>
        )}
      </section>
      <section className="grid gap-1">
        <h3 className="font-bold">Conclusion</h3>
        <p className="whitespace-pre-line">
          {enquete.conclusion ?? (
            <span className="text-ink-muted">Non rédigée.</span>
          )}
        </p>
      </section>
    </div>
  )
}

/* ════════════════════════ Éditeur d'instruction ═════════════════════════ */

/** Empreinte comparable d'un contenu, pour savoir s'il reste à enregistrer. */
function empreinte(contenu: ContenuInstruction) {
  return JSON.stringify({
    constats: contenu.constats?.trim() || null,
    causes: contenu.causes.map(({ categorie, description, racine }) => [
      categorie,
      description,
      racine,
    ]),
    recommandations: contenu.recommandations.map(({ texte }) => texte),
    conclusion: contenu.conclusion?.trim() || null,
  })
}

interface CauseSaisie {
  cle: number
  categorie: CategorieCause
  description: string
  racine: boolean
}

interface RecommandationSaisie {
  cle: number
  texte: string
}

/**
 * Éditeur du rapport d'enquête : constats, causes (catégorie, description,
 * cause racine), recommandations et conclusion, avec ajout et retrait de
 * lignes. Les manques s'affichent au fil de la saisie ; le serveur reste
 * l'autorité à la soumission.
 */
export function EditeurInstruction({
  initial,
  onEnregistrer,
  onSoumettre,
}: {
  initial: ContenuInstruction
  onEnregistrer: (contenu: ContenuInstruction) => Promise<unknown>
  onSoumettre?: (
    contenu: ContenuInstruction,
    modifie: boolean
  ) => Promise<unknown>
}) {
  const base = useId()
  const compteur = useRef(0)
  const nouvelleCle = () => {
    compteur.current += 1
    return compteur.current
  }
  const [constats, setConstats] = useState(initial.constats ?? "")
  const [conclusion, setConclusion] = useState(initial.conclusion ?? "")
  const [causes, setCauses] = useState<CauseSaisie[]>(() =>
    initial.causes.map((c, index) => ({ ...c, cle: -1 - index }))
  )
  const [recommandations, setRecommandations] = useState<
    RecommandationSaisie[]
  >(() =>
    initial.recommandations.map((r, index) => ({ ...r, cle: -1 - index }))
  )
  const [reference, setReference] = useState(() => empreinte(initial))
  const operation = useOperation()

  const contenu: ContenuInstruction = {
    constats: constats.trim() || undefined,
    causes: causes.map(({ categorie, description, racine }) => ({
      categorie,
      description,
      racine,
    })),
    recommandations: recommandations.map(({ texte }) => ({ texte })),
    conclusion: conclusion.trim() || undefined,
  }
  const modifie = empreinte(contenu) !== reference
  const manques = manquesInstruction(contenu)

  const majCause = (cle: number, modif: Partial<CauseSaisie>) =>
    setCauses((liste) =>
      liste.map((c) => (c.cle === cle ? { ...c, ...modif } : c))
    )

  return (
    <form
      className="grid gap-4"
      onSubmit={async (event) => {
        event.preventDefault()
        const ok = await operation.executer(
          "enregistrer",
          async () => {
            await onEnregistrer(contenu)
            return true
          },
          "Instruction enregistrée"
        )
        if (ok) setReference(empreinte(contenu))
      }}
    >
      <Field
        label="Constats"
        htmlFor={`${base}-constats`}
        hint="Faits établis : relevés, témoignages, état du matériel et de la voie."
      >
        <Textarea
          id={`${base}-constats`}
          rows={5}
          value={constats}
          onChange={(e) => setConstats(e.target.value)}
        />
      </Field>

      <fieldset className="grid gap-3">
        <legend className="mb-1 text-[14px] font-bold">Causes</legend>
        {causes.length === 0 ? (
          <p className="text-small text-ink-muted">Aucune cause saisie.</p>
        ) : null}
        <ol className="grid gap-3">
          {causes.map((cause, index) => (
            <li
              key={cause.cle}
              className="grid gap-2 rounded-md border border-line p-3 sm:grid-cols-[220px_minmax(0,1fr)]"
            >
              <Field
                label={`Catégorie de la cause n° ${index + 1}`}
                htmlFor={`${base}-cause-${cause.cle}-categorie`}
              >
                <SelectNative
                  id={`${base}-cause-${cause.cle}-categorie`}
                  value={cause.categorie}
                  onChange={(e) =>
                    majCause(cause.cle, {
                      categorie: e.target.value as CategorieCause,
                    })
                  }
                >
                  {(Object.keys(CATEGORIES_CAUSE) as CategorieCause[]).map(
                    (c) => (
                      <option key={c} value={c}>
                        {CATEGORIES_CAUSE[c]}
                      </option>
                    )
                  )}
                </SelectNative>
              </Field>
              <Field
                label={`Description de la cause n° ${index + 1}`}
                htmlFor={`${base}-cause-${cause.cle}-description`}
              >
                <Textarea
                  id={`${base}-cause-${cause.cle}-description`}
                  rows={2}
                  required
                  value={cause.description}
                  onChange={(e) =>
                    majCause(cause.cle, { description: e.target.value })
                  }
                />
              </Field>
              <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-2">
                <Checkbox
                  label="Cause racine"
                  checked={cause.racine}
                  onCheckedChange={(v) =>
                    majCause(cause.cle, { racine: v === true })
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Retirer la cause n° ${index + 1}`}
                  onClick={() =>
                    setCauses((liste) =>
                      liste.filter((c) => c.cle !== cause.cle)
                    )
                  }
                >
                  <Trash2 />
                  Retirer
                </Button>
              </div>
            </li>
          ))}
        </ol>
        <div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={causes.length >= 20}
            onClick={() =>
              setCauses((liste) => [
                ...liste,
                {
                  cle: nouvelleCle(),
                  categorie: "humaine",
                  description: "",
                  racine: liste.length === 0,
                },
              ])
            }
          >
            <Plus />
            Ajouter une cause
          </Button>
        </div>
      </fieldset>

      <fieldset className="grid gap-3">
        <legend className="mb-1 text-[14px] font-bold">Recommandations</legend>
        {recommandations.length === 0 ? (
          <p className="text-small text-ink-muted">
            Aucune recommandation saisie.
          </p>
        ) : null}
        <ol className="grid gap-3">
          {recommandations.map((r, index) => (
            <li
              key={r.cle}
              className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
            >
              <Field
                label={`Recommandation n° ${index + 1}`}
                htmlFor={`${base}-reco-${r.cle}`}
              >
                <Textarea
                  id={`${base}-reco-${r.cle}`}
                  rows={2}
                  required
                  value={r.texte}
                  onChange={(e) =>
                    setRecommandations((liste) =>
                      liste.map((x) =>
                        x.cle === r.cle ? { ...x, texte: e.target.value } : x
                      )
                    )
                  }
                />
              </Field>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Retirer la recommandation n° ${index + 1}`}
                onClick={() =>
                  setRecommandations((liste) =>
                    liste.filter((x) => x.cle !== r.cle)
                  )
                }
              >
                <Trash2 />
                Retirer
              </Button>
            </li>
          ))}
        </ol>
        <div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={recommandations.length >= 20}
            onClick={() =>
              setRecommandations((liste) => [
                ...liste,
                { cle: nouvelleCle(), texte: "" },
              ])
            }
          >
            <Plus />
            Ajouter une recommandation
          </Button>
        </div>
      </fieldset>

      <Field label="Conclusion" htmlFor={`${base}-conclusion`}>
        <Textarea
          id={`${base}-conclusion`}
          rows={3}
          value={conclusion}
          onChange={(e) => setConclusion(e.target.value)}
        />
      </Field>

      {manques.length > 0 ? (
        <InlineMessage
          tone="info"
          title="Avant de soumettre le rapport, il manque :"
        >
          <ul className="list-disc pl-5">
            {manques.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </InlineMessage>
      ) : (
        <p className="text-small text-ink-muted">
          Le rapport est complet : il peut être soumis pour clôture.
        </p>
      )}
      <RetourOperation retour={operation.retour} />

      <div className="flex flex-wrap items-center justify-end gap-2">
        {modifie ? (
          <span className="text-small mr-auto text-ink-muted">
            Modifications non enregistrées.
          </span>
        ) : null}
        <Button
          type="submit"
          variant="secondary"
          loading={operation.enCours === "enregistrer"}
          loadingLabel="Enregistrement…"
        >
          <Save />
          Enregistrer l&apos;instruction
        </Button>
        {onSoumettre ? (
          <Button
            type="button"
            loading={operation.enCours === "soumettre"}
            loadingLabel="Soumission…"
            onClick={async () => {
              const ok = await operation.executer("soumettre", async () => {
                await onSoumettre(contenu, modifie)
                return true
              })
              if (ok) setReference(empreinte(contenu))
            }}
          >
            <Send />
            Soumettre le rapport
          </Button>
        ) : null}
      </div>
    </form>
  )
}
