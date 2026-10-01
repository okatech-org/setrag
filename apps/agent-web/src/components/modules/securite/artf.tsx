"use client"

import type { FunctionReturnType } from "convex/server"
import { FileText, Inbox, Send } from "lucide-react"
import { useId, useState } from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { Field, Input, Textarea } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { Tag } from "@workspace/ui/components/tag"

import {
  Chronologie,
  Fiche,
  Panneau,
  TableauDonnees,
  type ColonneTableau,
} from "@/components/charte"
import {
  RetourOperation,
  SelectFiltre,
  useOperation,
} from "@/components/gestion/referentiels/elements"
import { FenetreFormulaire } from "@/components/gestion/referentiels/formulaire"
import {
  AccesRestreint,
  Chargement,
  Introuvable,
  LienDossier,
  chronologie,
  type Id,
} from "@/components/modules/rh/commun"

import {
  CadreSecurite,
  TagArtf,
  TagEnquete,
  TagGravite,
  TagRetard,
  dateHeureComplete,
  useAccesSecurite,
} from "./cadre-securite"
import { DialogueTexte } from "./dialogues"
import {
  NATURES_ARTF,
  STATUTS_ARTF,
  libelleTrimestre,
  libelleType,
} from "./libelles"

type Declaration = FunctionReturnType<
  typeof api.modules.securite.artf.lister
>[number]
type Dossier = NonNullable<
  FunctionReturnType<typeof api.modules.securite.artf.dossier>
>

const RETOUR = { href: "/securite/artf", libelle: "Déclarations ARTF" }

/** Mention obligatoire : aucune transmission réelle n'a lieu. */
export function MentionSimulation() {
  return (
    <InlineMessage tone="info" title="Transmission simulée">
      Le portail de l&apos;ARTF n&apos;est pas raccordé : la transmission
      attribue une référence locale et l&apos;accusé de réception est simulé une
      trentaine de secondes après.
    </InlineMessage>
  )
}

function etatDelai(d: { enRetard: boolean; horsDelai: boolean }) {
  return d.enRetard ? "En retard" : d.horsDelai ? "Transmise hors délai" : ""
}

const colonnes: ColonneTableau<Declaration>[] = [
  {
    cle: "numero",
    libelle: "N°",
    rendu: (d) => <span className="tabular font-semibold">{d.numero}</span>,
    tri: (d) => d.numero,
  },
  {
    cle: "nature",
    libelle: "Nature",
    rendu: (d) => NATURES_ARTF[d.nature],
    tri: (d) => NATURES_ARTF[d.nature],
  },
  {
    cle: "objet",
    libelle: "Objet",
    rendu: (d) => d.objet,
    tri: (d) => d.objet,
  },
  {
    cle: "echeance",
    libelle: "Échéance",
    rendu: (d) => (
      <span className="tabular whitespace-nowrap">
        {dateHeureComplete(d.echeance)}
      </span>
    ),
    tri: (d) => d.echeance,
    export: (d) => dateHeureComplete(d.echeance),
  },
  {
    cle: "delai",
    libelle: "Délai",
    rendu: (d) =>
      d.enRetard ? (
        <TagRetard />
      ) : d.horsDelai ? (
        <Tag tone="danger">Hors délai</Tag>
      ) : (
        <span className="text-ink-muted">Dans les délais</span>
      ),
    tri: (d) => etatDelai(d),
    export: (d) => etatDelai(d) || "Dans les délais",
  },
  {
    cle: "transmise",
    libelle: "Transmise le",
    rendu: (d) => (
      <span className="tabular whitespace-nowrap">
        {dateHeureComplete(d.transmiseLe)}
      </span>
    ),
    tri: (d) => d.transmiseLe ?? null,
    export: (d) => (d.transmiseLe ? dateHeureComplete(d.transmiseLe) : ""),
    secondaire: true,
  },
  {
    cle: "statut",
    libelle: "Statut",
    rendu: (d) => <TagArtf statut={d.statut} />,
    tri: (d) => d.statut,
    export: (d) => STATUTS_ARTF[d.statut],
  },
]

export function ListeArtf() {
  const { peut, acces } = useAccesSecurite()
  const lecture = peut("artf.lire")
  const declarations = useQuery(
    api.modules.securite.artf.lister,
    lecture ? {} : "skip"
  )
  const [statut, setStatut] = useState("tous")
  const [nature, setNature] = useState("toutes")
  const filtres = declarations?.filter(
    (d) =>
      (statut === "tous" || d.statut === statut) &&
      (nature === "toutes" || d.nature === nature)
  )
  return (
    <CadreSecurite
      titre="Déclarations à l'ARTF"
      description="Notifications d'événements, rapports d'enquête et bilans trimestriels dus à l'Autorité de régulation des transports ferroviaires, avec leurs échéances."
    >
      {acces && !lecture ? (
        <AccesRestreint>
          Votre profil ne consulte pas les déclarations à l&apos;ARTF.
        </AccesRestreint>
      ) : (
        <>
          {acces && !acces.interne ? (
            <p className="text-small text-ink-muted">
              Seules les déclarations transmises à l&apos;ARTF sont visibles des
              parties prenantes externes.
            </p>
          ) : null}
          <TableauDonnees
            libelle="Déclarations à l'ARTF"
            colonnes={colonnes}
            lignes={filtres}
            cle={(d) => d._id}
            lien={(d) => `/securite/artf/${d._id}`}
            recherche={{
              placeholder: "N°, objet, période…",
              texte: (d) =>
                `${d.numero} ${d.objet} ${d.periode ?? ""} ${NATURES_ARTF[d.nature]}`,
            }}
            filtres={
              <>
                <SelectFiltre
                  libelle="Statut"
                  value={statut}
                  onChange={setStatut}
                >
                  <option value="tous">Tous les statuts</option>
                  {Object.entries(STATUTS_ARTF).map(([cle, lib]) => (
                    <option key={cle} value={cle}>
                      {lib}
                    </option>
                  ))}
                </SelectFiltre>
                <SelectFiltre
                  libelle="Nature"
                  icone={FileText}
                  value={nature}
                  onChange={setNature}
                >
                  <option value="toutes">Toutes natures</option>
                  {Object.entries(NATURES_ARTF).map(([cle, lib]) => (
                    <option key={cle} value={cle}>
                      {lib}
                    </option>
                  ))}
                </SelectFiltre>
              </>
            }
            exportNom="declarations-artf"
            imprimable
            triInitial={{ cle: "echeance", sens: "desc" }}
            vide={{
              titre: "Aucune déclaration",
              description: "Aucune déclaration ne correspond à ces filtres.",
            }}
          />
        </>
      )}
    </CadreSecurite>
  )
}

/* ═════════════════════════════ Dossier ══════════════════════════════════ */

export function DossierArtf({ declarationId }: { declarationId: string }) {
  const { peut, acces } = useAccesSecurite()
  const lecture = peut("artf.lire")
  const dossier = useQuery(
    api.modules.securite.artf.dossier,
    lecture
      ? { declarationId: declarationId as Id<"securiteDeclarationsArtf"> }
      : "skip"
  )
  const transmettre = useMutation(api.modules.securite.artf.transmettre)
  const accuser = useMutation(api.modules.securite.artf.enregistrerAccuse)
  const operation = useOperation()
  const [dialogue, setDialogue] = useState<"transmettre" | "accuse" | null>(
    null
  )

  if (acces && !lecture) {
    return (
      <CadreSecurite titre="Déclaration ARTF" retour={RETOUR}>
        <AccesRestreint>
          Votre profil ne consulte pas les déclarations à l&apos;ARTF.
        </AccesRestreint>
      </CadreSecurite>
    )
  }
  if (dossier === undefined) {
    return (
      <CadreSecurite titre="Déclaration ARTF" retour={RETOUR}>
        <Chargement libelle="Chargement de la déclaration" />
      </CadreSecurite>
    )
  }
  if (dossier === null) {
    return (
      <CadreSecurite titre="Déclaration introuvable" retour={RETOUR}>
        <Introuvable titre="Cette déclaration n'existe pas" retour={RETOUR} />
      </CadreSecurite>
    )
  }

  const { declaration, droits } = dossier
  const enPreparation =
    declaration.statut === "a_preparer" || declaration.statut === "prete"
  const peutRediger = droits.gerer && enPreparation
  const peutTransmettre = droits.gerer && declaration.statut === "prete"
  const peutAccuser = droits.gerer && declaration.statut === "transmise"
  const horsDelai =
    declaration.transmiseLe !== undefined &&
    declaration.transmiseLe > declaration.echeance

  return (
    <CadreSecurite
      titre={`${declaration.numero} · ${NATURES_ARTF[declaration.nature]}`}
      description={declaration.objet}
      retour={RETOUR}
      actions={
        <>
          {peutAccuser ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => setDialogue("accuse")}
            >
              <Inbox />
              Enregistrer un accusé
            </Button>
          ) : null}
          {peutTransmettre ? (
            <Button type="button" onClick={() => setDialogue("transmettre")}>
              <Send />
              Transmettre à l&apos;ARTF
            </Button>
          ) : null}
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <TagArtf statut={declaration.statut} />
        {dossier.enRetard ? <TagRetard /> : null}
        {horsDelai ? <Tag tone="danger">Transmise hors délai</Tag> : null}
        <Tag tone="neutral">Simulation</Tag>
      </div>
      <MentionSimulation />
      <RetourOperation retour={operation.retour} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {peutRediger ? (
          <Panneau
            titre="Rédaction"
            icone={FileText}
            sousTitre={
              declaration.contenu
                ? "Texte enregistré"
                : dossier.proposition
                  ? "Pré-rédigé à partir du dossier"
                  : undefined
            }
          >
            <EditeurDeclaration
              key={`${declaration._id}-${declaration.prepareeLe ?? 0}`}
              dossier={dossier}
              primaire={declaration.statut === "a_preparer"}
            />
          </Panneau>
        ) : (
          <Panneau
            titre={
              declaration.statut === "transmise" ||
              declaration.statut === "accusee"
                ? "Contenu transmis"
                : "Contenu"
            }
            icone={FileText}
          >
            {declaration.contenu ? (
              <pre className="font-[inherit] text-[14px] whitespace-pre-wrap">
                {declaration.contenu}
              </pre>
            ) : (
              <p className="text-small text-ink-muted">
                Déclaration non encore rédigée.
              </p>
            )}
          </Panneau>
        )}

        <div className="grid content-start gap-5">
          <Panneau titre="Suivi">
            <Fiche
              elements={[
                ["Nature", NATURES_ARTF[declaration.nature]],
                declaration.periode
                  ? ["Période", libelleTrimestre(declaration.periode)]
                  : null,
                [
                  "Échéance",
                  <span key="e" className="tabular">
                    {dateHeureComplete(declaration.echeance)}
                  </span>,
                ],
                declaration.prepareeLe
                  ? [
                      "Préparée",
                      `${dateHeureComplete(declaration.prepareeLe)} · ${declaration.prepareeParNom ?? ""}`,
                    ]
                  : null,
                declaration.transmiseLe
                  ? [
                      "Transmise",
                      `${dateHeureComplete(declaration.transmiseLe)} · ${declaration.transmiseParNom ?? ""}`,
                    ]
                  : null,
                declaration.referenceTransmission
                  ? [
                      "Réf. de transmission",
                      <span key="t" className="tabular">
                        {declaration.referenceTransmission}
                      </span>,
                    ]
                  : null,
                declaration.accuseLe
                  ? [
                      "Accusé reçu",
                      <span key="a" className="tabular">
                        {dateHeureComplete(declaration.accuseLe)}
                      </span>,
                    ]
                  : null,
                declaration.referenceAccuse
                  ? [
                      "Réf. de l'accusé",
                      <span key="r" className="tabular">
                        {declaration.referenceAccuse}
                      </span>,
                    ]
                  : null,
                ["Mode", "Simulation (portail non raccordé)"],
              ]}
            />
            {declaration.statut === "transmise" ? (
              <p className="text-small text-ink-muted">
                Accusé de réception attendu.
              </p>
            ) : null}
          </Panneau>
          {dossier.evenement || dossier.enquete ? (
            <Panneau titre="Dossiers liés">
              {dossier.evenement ? (
                <p className="flex flex-wrap items-center gap-2 text-[14px]">
                  {peut("registre.lire") ? (
                    <LienDossier
                      href={`/securite/evenements/${dossier.evenement._id}`}
                    >
                      {dossier.evenement.numero}
                    </LienDossier>
                  ) : (
                    <b className="tabular">{dossier.evenement.numero}</b>
                  )}
                  <span>{libelleType(dossier.evenement.type)}</span>
                  <TagGravite gravite={dossier.evenement.gravite} />
                </p>
              ) : null}
              {dossier.enquete ? (
                <p className="flex flex-wrap items-center gap-2 text-[14px]">
                  {peut("registre.lire") ? (
                    <LienDossier
                      href={`/securite/enquetes/${dossier.enquete._id}`}
                    >
                      Enquête {dossier.enquete.numero}
                    </LienDossier>
                  ) : (
                    <b>Enquête {dossier.enquete.numero}</b>
                  )}
                  <TagEnquete statut={dossier.enquete.statut} />
                </p>
              ) : null}
            </Panneau>
          ) : null}
        </div>
      </div>

      <Panneau titre="Chronologie de la déclaration">
        <Chronologie
          evenements={chronologie(dossier.chronologie)}
          vide="Aucune action tracée."
        />
      </Panneau>

      {peutTransmettre ? (
        <FenetreFormulaire
          open={dialogue === "transmettre"}
          onOpenChange={(o) => setDialogue(o ? "transmettre" : null)}
          titre="Transmettre à l'ARTF"
          description={`${declaration.numero} · échéance ${dateHeureComplete(declaration.echeance)}`}
          libelleValider={
            <>
              <Send />
              Transmettre
            </>
          }
          enCours={operation.enCours === "transmettre"}
          erreur={
            operation.retour?.ton === "danger" ? operation.retour.detail : null
          }
          onSubmit={async () => {
            const resultat = await operation.executer(
              "transmettre",
              () => transmettre({ declarationId: declaration._id }),
              (r) =>
                `Transmise (simulation) · réf. ${r.reference}${r.horsDelai ? " · hors délai" : ""}`
            )
            if (resultat) setDialogue(null)
          }}
        >
          <MentionSimulation />
          <p className="text-[14px]">
            Une fois transmise, la déclaration ne se modifie plus.
          </p>
        </FenetreFormulaire>
      ) : null}
      {peutAccuser ? (
        <DialogueTexte
          open={dialogue === "accuse"}
          onOpenChange={(o) => setDialogue(o ? "accuse" : null)}
          titre="Enregistrer un accusé de réception"
          description="Accusé reçu hors portail (courrier, courriel) : sa référence est saisie à la main."
          libelle="Référence de l'accusé"
          multiligne={false}
          libelleValider={
            <>
              <Inbox />
              Enregistrer
            </>
          }
          onValider={async (reference) => {
            await accuser({ declarationId: declaration._id, reference })
            operation.signaler({
              ton: "success",
              titre: "Accusé de réception enregistré",
            })
          }}
        />
      ) : null}
    </CadreSecurite>
  )
}

function EditeurDeclaration({
  dossier,
  primaire,
}: {
  dossier: Dossier
  primaire: boolean
}) {
  const rediger = useMutation(api.modules.securite.artf.rediger)
  const operation = useOperation()
  const base = useId()
  const { declaration } = dossier
  const attenteEnquete =
    declaration.nature === "rapport_enquete" &&
    dossier.enquete &&
    dossier.enquete.statut !== "cloturee"
  return (
    <form
      className="grid gap-4"
      onSubmit={async (event) => {
        event.preventDefault()
        const d = new FormData(event.currentTarget)
        await operation.executer(
          "rediger",
          () =>
            rediger({
              declarationId: declaration._id,
              objet: String(d.get("objet") ?? ""),
              contenu: String(d.get("contenu") ?? ""),
            }),
          "Déclaration prête à transmettre"
        )
      }}
    >
      {attenteEnquete ? (
        <InlineMessage tone="warning" title="Enquête non clôturée">
          Le rapport d&apos;enquête ne se rédige qu&apos;après la clôture de
          l&apos;enquête {dossier.enquete?.numero}.
        </InlineMessage>
      ) : null}
      <Field label="Objet" htmlFor={`${base}-objet`}>
        <Input
          id={`${base}-objet`}
          name="objet"
          required
          defaultValue={declaration.objet}
          autoComplete="off"
        />
      </Field>
      <Field
        label="Contenu"
        htmlFor={`${base}-contenu`}
        hint="Quarante caractères au moins. Relisez le texte pré-rédigé avant de l'enregistrer."
      >
        <Textarea
          id={`${base}-contenu`}
          name="contenu"
          required
          rows={12}
          defaultValue={declaration.contenu ?? dossier.proposition ?? ""}
        />
      </Field>
      <RetourOperation retour={operation.retour} />
      <div className="flex justify-end">
        <Button
          type="submit"
          variant={primaire ? "primary" : "secondary"}
          loading={operation.enCours === "rediger"}
          loadingLabel="Enregistrement…"
        >
          <FileText />
          {primaire
            ? "Enregistrer, prête à transmettre"
            : "Enregistrer les modifications"}
        </Button>
      </div>
    </form>
  )
}
