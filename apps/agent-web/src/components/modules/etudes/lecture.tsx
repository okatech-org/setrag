"use client"

import type { FunctionReturnType } from "convex/server"
import { ArrowLeft, Download, FileDown, ListChecks, MessageSquarePlus, MessageSquareText } from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { SkeletonLines } from "@workspace/ui/components/empty-state"
import { Field, SelectNative, Textarea } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { Tag } from "@workspace/ui/components/tag"

import { Panneau, suffixeDate, telechargerCsv, telechargerTexte } from "@/components/charte"
import { DocumentButton } from "@/components/document-button"
import { Puces, RetourOperation, useOperation } from "@/components/gestion/referentiels/elements"
import { dateCourte, dateHeure } from "@/components/gestion/referentiels/format"
import { FenetreFormulaire } from "@/components/gestion/referentiels/formulaire"

import { CadreEtudes } from "./cadre"
import { FenetreConstat } from "./constat"
import { Markdown } from "./markdown"
import { NATURES_ANNOTATION, TagGravite, TagStatutConstat, type NatureAnnotation } from "./statuts"

type Lecture = NonNullable<FunctionReturnType<typeof api.modules.etudes.queries.etude>>
type Annotation = Lecture["annotations"][number]

const jour = (date: string) => dateCourte(Date.parse(`${date}T12:00:00Z`))

function CarteAnnotation({ annotation, peutTraiter, section }: { annotation: Annotation; peutTraiter: boolean; section?: string }) {
  const traiter = useMutation(api.modules.etudes.mutations.traiterAnnotation)
  const operation = useOperation()
  const [reponse, setReponse] = useState("")
  return (
    <li className="grid gap-1.5 rounded-md border border-line px-3 py-2.5">
      <span className="flex flex-wrap items-center gap-2">
        <Tag tone={annotation.nature === "reserve" ? "warning" : annotation.nature === "question" ? "info" : "neutral"}>
          {NATURES_ANNOTATION[annotation.nature]}
        </Tag>
        <Tag tone={annotation.statut === "ouverte" ? "accent" : "success"}>{annotation.statut === "ouverte" ? "Ouverte" : "Traitée"}</Tag>
        {annotation.origine === "demo" ? <Tag tone="neutral">Exemple</Tag> : null}
      </span>
      <small className="text-[12.5px] text-ink-muted">
        <b className="font-semibold text-ink">{annotation.auteur}</b> · <span className="tabular">{dateHeure(annotation.createdAt)}</span>
        {section ? (
          <>
            {" "}·{" "}
            <a href={`#${annotation.ancre}`} className="underline">
              {section}
            </a>
          </>
        ) : null}
      </small>
      <p className="text-[14px] whitespace-pre-wrap">{annotation.texte}</p>
      {annotation.reponse ? (
        <p className="border-l-[3px] border-success pl-3 text-[13.5px]">
          <b className="font-semibold">{annotation.traitePar}</b> : {annotation.reponse}
        </p>
      ) : null}
      {peutTraiter && annotation.statut === "ouverte" ? (
        <form
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            void operation.executer("traiter", () => traiter({ annotationId: annotation._id, reponse }), "Annotation traitée.")
          }}
        >
          <Field label="Réponse du référent">
            <Textarea value={reponse} onChange={(event) => setReponse(event.target.value)} maxLength={2000} className="min-h-16" />
          </Field>
          <div>
            <Button type="submit" variant="secondary" size="sm" disabled={reponse.trim().length < 2} loading={operation.enCours === "traiter"}>
              Répondre et clore
            </Button>
          </div>
          <RetourOperation retour={operation.retour} />
        </form>
      ) : null}
    </li>
  )
}

export function LectureEtude({ code }: { code: string }) {
  const lecture = useQuery(api.modules.etudes.queries.etude, { code })
  const annoter = useMutation(api.modules.etudes.mutations.annoter)
  const operation = useOperation()
  const [fenetre, setFenetre] = useState<null | { type: "annotation"; ancre?: string } | { type: "constat"; ancre?: string }>(null)
  const [filtre, setFiltre] = useState<"ouvertes" | "toutes">("ouvertes")
  const defile = useRef(false)

  useEffect(() => {
    if (!lecture || defile.current) return
    defile.current = true
    const ancre = window.location.hash.slice(1)
    if (ancre) document.getElementById(decodeURIComponent(ancre))?.scrollIntoView({ block: "start" })
  }, [lecture])

  const retour = (
    <Button asChild variant="ghost" className="-ml-3">
      <Link href={"/etudes" as Route}>
        <ArrowLeft />
        Bibliothèque
      </Link>
    </Button>
  )

  if (lecture === undefined) {
    return (
      <CadreEtudes titre="Étude" eyebrow={retour}>
        <SkeletonLines />
      </CadreEtudes>
    )
  }
  if (lecture === null) {
    return (
      <CadreEtudes titre="Étude introuvable" eyebrow={retour}>
        <InlineMessage tone="warning" title="Cette étude n'est pas dans la bibliothèque.">
          Le lien est peut-être ancien, ou la bibliothèque n&apos;a pas encore été chargée.
        </InlineMessage>
      </CadreEtudes>
    )
  }

  const { etude, sections, annotations, constats, droits } = lecture
  const titresSection = new Map(sections.map((section) => [section.ancre, section.titre]))
  const visibles = annotations.filter((annotation) => filtre === "toutes" || annotation.statut === "ouverte")
  const parSection = (ancre: string) => annotations.filter((annotation) => annotation.ancre === ancre).length

  return (
    <CadreEtudes
      titre={etude.titre}
      description={`${etude.categorie} · ${etude.mots.toLocaleString("fr-FR")} mots · mise à jour le ${dateHeure(etude.updatedAt)}`}
      eyebrow={retour}
      actions={
        <>
          <Button
            type="button"
            variant="secondary"
            onClick={() => telechargerTexte(etude.fichierMd, etude.contenu, "text/markdown;charset=utf-8")}
          >
            <Download />
            Source .md
          </Button>
          {etude.fichierPdf ? (
            <DocumentButton file={etude.fichierPdf} variant="secondary">
              <FileDown className="size-4" />
              PDF
            </DocumentButton>
          ) : null}
          <Button type="button" variant="secondary" onClick={() => setFenetre({ type: "annotation" })}>
            <MessageSquarePlus />
            Annoter
          </Button>
          {droits.peutGererPlan ? (
            <Button type="button" variant="secondary" onClick={() => setFenetre({ type: "constat" })}>
              <ListChecks />
              Inscrire un constat
            </Button>
          ) : null}
        </>
      }
    >
      <RetourOperation retour={operation.retour} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <article className="grid min-w-0 content-start gap-6 rounded-md border border-line bg-surface p-5 md:p-7">
          {sections.map((section) => {
            const Titre = section.niveau === 1 ? "h2" : section.niveau === 2 ? "h3" : "h4"
            const nombre = parSection(section.ancre)
            return (
              <section key={section.ancre} id={section.ancre} aria-labelledby={`${section.ancre}-titre`} className="grid scroll-mt-24 gap-3">
                <header className="flex flex-wrap items-start gap-2">
                  <Titre
                    id={`${section.ancre}-titre`}
                    className={
                      section.niveau === 1
                        ? "min-w-0 flex-1 text-[22px] leading-tight font-bold"
                        : section.niveau === 2
                          ? "min-w-0 flex-1 text-[18px] leading-snug font-bold"
                          : "min-w-0 flex-1 text-[16px] font-bold"
                    }
                  >
                    {section.titre}
                  </Titre>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setFenetre({ type: "annotation", ancre: section.ancre })}
                    aria-label={`Annoter la section « ${section.titre} »${nombre ? ` (${nombre} annotation(s))` : ""}`}
                  >
                    <MessageSquareText />
                    {nombre > 0 ? <span className="tabular">{nombre}</span> : "Annoter"}
                  </Button>
                </header>
                {section.corps ? <Markdown texte={section.corps} /> : null}
              </section>
            )
          })}
        </article>

        <aside className="grid content-start gap-5 xl:sticky xl:top-4 xl:max-h-[calc(100dvh-2rem)] xl:overflow-y-auto">
          <Panneau titre="Sommaire">
            <nav aria-label="Sommaire de l'étude">
              <ol className="grid gap-1 text-[13.5px]">
                {sections
                  .filter((section) => section.niveau <= 2)
                  .map((section) => (
                    <li key={section.ancre} className={section.niveau === 2 ? "pl-3" : undefined}>
                      <a href={`#${section.ancre}`} className="inline-flex min-h-9 items-center hover:underline">
                        {section.titre}
                      </a>
                    </li>
                  ))}
              </ol>
            </nav>
          </Panneau>

          <Panneau
            titre="Annotations"
            icone={MessageSquareText}
            sousTitre={`${annotations.filter((annotation) => annotation.statut === "ouverte").length} ouverte(s)`}
            actions={
              annotations.length > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    telechargerCsv(
                      `annotations-${etude.numero}-${suffixeDate()}`,
                      [
                        { libelle: "Date", valeur: (a: Annotation) => new Date(a.createdAt) },
                        { libelle: "Auteur", valeur: (a: Annotation) => a.auteur },
                        { libelle: "Nature", valeur: (a: Annotation) => NATURES_ANNOTATION[a.nature] },
                        { libelle: "Section", valeur: (a: Annotation) => (a.ancre ? titresSection.get(a.ancre) : "Étude entière") },
                        { libelle: "Texte", valeur: (a: Annotation) => a.texte },
                        { libelle: "État", valeur: (a: Annotation) => (a.statut === "ouverte" ? "Ouverte" : "Traitée") },
                        { libelle: "Réponse", valeur: (a: Annotation) => a.reponse },
                        { libelle: "Traitée par", valeur: (a: Annotation) => a.traitePar },
                      ],
                      annotations
                    )
                  }
                >
                  <Download />
                  Exporter
                </Button>
              ) : null
            }
          >
            <Puces
              libelle="Annotations affichées"
              valeur={filtre}
              onChange={setFiltre}
              options={[
                { cle: "ouvertes", libelle: "Ouvertes" },
                { cle: "toutes", libelle: "Toutes" },
              ]}
            />
            {visibles.length === 0 ? (
              <p className="text-small text-ink-muted">
                {filtre === "ouvertes" ? "Aucune annotation ouverte." : "Aucune annotation. Annotez une section pour poser une question ou émettre une réserve."}
              </p>
            ) : (
              <ul className="grid gap-2">
                {visibles.map((annotation) => (
                  <CarteAnnotation
                    key={annotation._id}
                    annotation={annotation}
                    peutTraiter={droits.peutTraiterAnnotations}
                    section={annotation.ancre ? titresSection.get(annotation.ancre) : undefined}
                  />
                ))}
              </ul>
            )}
          </Panneau>

          <Panneau titre="Actions d'audit liées" icone={ListChecks}>
            {constats.length === 0 ? (
              <p className="text-small text-ink-muted">Aucune action du plan ne cite cette étude.</p>
            ) : (
              <ul className="grid gap-2">
                {constats.map((constat) => (
                  <li key={constat._id}>
                    <Link
                      href={`/etudes/plan-actions/${constat._id}` as Route}
                      className="grid gap-1 rounded-md border border-line px-3 py-2.5 hover:bg-surface-sunk"
                    >
                      <span className="tabular text-[12.5px] text-ink-muted">{constat.reference}</span>
                      <b className="text-[14px] font-semibold">{constat.titre}</b>
                      <span className="flex flex-wrap gap-2">
                        <TagStatutConstat statut={constat.statut} />
                        <TagGravite gravite={constat.gravite} />
                      </span>
                      <small className={constat.enRetard ? "text-[12.5px] font-semibold text-danger-ink" : "text-[12.5px] text-ink-muted"}>
                        {constat.enRetard ? "En retard · " : ""}échéance <span className="tabular">{jour(constat.echeance)}</span> · {constat.responsable}
                      </small>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panneau>
        </aside>
      </div>

      <FenetreFormulaire
        open={fenetre?.type === "annotation"}
        onOpenChange={(ouvert) => (ouvert ? null : setFenetre(null))}
        titre="Annoter l'étude"
        description="L'annotation est horodatée et tracée ; les référents (audit, juridique, Direction générale) y répondent."
        libelleValider={
          <>
            <MessageSquarePlus />
            Publier
          </>
        }
        enCours={operation.enCours === "annoter"}
        erreur={operation.retour?.ton === "danger" ? operation.retour.detail : null}
        onSubmit={async (donnees) => {
          const ancre = String(donnees.get("ancre") ?? "")
          const resultat = await operation.executer(
            "annoter",
            () =>
              annoter({
                code: etude.code,
                ancre: ancre || undefined,
                nature: String(donnees.get("nature")) as NatureAnnotation,
                texte: String(donnees.get("texte") ?? ""),
              }),
            "Annotation publiée."
          )
          if (resultat) setFenetre(null)
        }}
      >
        <Field label="Section" htmlFor="annotation-section">
          <SelectNative id="annotation-section" name="ancre" defaultValue={fenetre?.type === "annotation" ? (fenetre.ancre ?? "") : ""}>
            <option value="">Étude entière</option>
            {sections.map((section) => (
              <option key={section.ancre} value={section.ancre}>
                {section.titre}
              </option>
            ))}
          </SelectNative>
        </Field>
        <Field label="Nature" htmlFor="annotation-nature">
          <SelectNative id="annotation-nature" name="nature" defaultValue="commentaire">
            {Object.entries(NATURES_ANNOTATION).map(([cle, libelle]) => (
              <option key={cle} value={cle}>
                {libelle}
              </option>
            ))}
          </SelectNative>
        </Field>
        <Field label="Annotation" htmlFor="annotation-texte">
          <Textarea id="annotation-texte" name="texte" required minLength={3} maxLength={2000} />
        </Field>
      </FenetreFormulaire>
      {fenetre?.type === "constat" ? (
        <FenetreConstat
          open
          onOpenChange={(ouvert) => (ouvert ? null : setFenetre(null))}
          source={{ code: etude.code, sections: sections.map((section) => ({ ancre: section.ancre, titre: section.titre })) }}
        />
      ) : null}
    </CadreEtudes>
  )
}
