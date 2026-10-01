"use client"

import { Armchair, SlidersHorizontal, Users } from "lucide-react"

import { Tenue } from "@workspace/ui/components/compte-a-rebours"
import { Switch } from "@workspace/ui/components/choice"
import { Field, Input, SelectNative } from "@workspace/ui/components/field"
import { Tag } from "@workspace/ui/components/tag"

import { Panneau } from "@/components/charte"
import { libelleClasse, montant, nomTrain } from "@/lib/agent-data"
import type { BrouillonVente, VoyageurBrouillon } from "@/lib/sale-draft"

import type { Categorie } from "./donnees"
import { categoriesGuichet, justificatif, libelleCategorie } from "./vente-billet"

/**
 * Étape « Voyageurs » : l'identité telle qu'elle figure sur la pièce, la
 * catégorie tarifaire (qui recalcule le prix) et un téléphone.
 */
export function EtapeVoyageurs({
  brouillon,
  categories,
  tenueActive,
  recalcul,
  erreurs,
  onVoyageur,
  onOptions,
}: {
  brouillon: BrouillonVente
  categories: readonly Categorie[]
  tenueActive: number | null
  /** Une nouvelle tenue est en cours (catégorie changée). */
  recalcul: boolean
  /** Erreurs de saisie par voyageur, affichées après une tentative. */
  erreurs: boolean
  onVoyageur: (index: number, voyageur: VoyageurBrouillon) => void
  onOptions: (options: Partial<Pick<BrouillonVente, "imprimer" | "conventionne">>) => void
}) {
  const desserte = brouillon.desserte!
  const prix = (index: number) => brouillon.tenue?.billets[index]?.prix
  const choix = ["", ...categoriesGuichet(categories).map((c) => c.code)]

  return (
    <div className="grid items-start gap-5 2xl:grid-cols-[minmax(0,1fr)_360px]">
      <Panneau
        titre={`${brouillon.voyageurs.length} voyageur${brouillon.voyageurs.length > 1 ? "s" : ""}`}
        icone={Users}
        sousTitre={`${nomTrain(desserte.trainType, desserte.trainNumber)} · ${libelleClasse(desserte.classe)}`}
        plein
      >
        <ol className="divide-y divide-line">
          {brouillon.voyageurs.map((voyageur, index) => {
            const maj = (partiel: Partial<VoyageurBrouillon>) => onVoyageur(index, { ...voyageur, ...partiel })
            const id = `voyageur-${index}`
            const note = voyageur.categorie ? justificatif(voyageur.categorie, categories) : null
            return (
              <li key={index} className="grid gap-3 p-4 sm:grid-cols-[32px_minmax(0,1fr)]">
                <span className="grid size-8 place-items-center rounded-pill bg-accent-soft text-[13px] font-bold text-accent-ink sm:mt-6">{index + 1}</span>
                <div className="grid min-w-0 gap-3">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1.1fr_1.1fr_1fr_0.7fr_1.2fr]">
                    <Field label="Nom" htmlFor={`${id}-nom`} error={erreurs && !voyageur.nom.trim() ? "Nom obligatoire" : undefined}>
                      <Input
                        id={`${id}-nom`}
                        autoComplete="off"
                        autoCapitalize="characters"
                        value={voyageur.nom}
                        onChange={(event) => maj({ nom: event.target.value.toUpperCase() })}
                      />
                    </Field>
                    <Field label="Prénom" htmlFor={`${id}-prenom`} error={erreurs && !voyageur.prenom.trim() ? "Prénom obligatoire" : undefined}>
                      <Input id={`${id}-prenom`} autoComplete="off" value={voyageur.prenom} onChange={(event) => maj({ prenom: event.target.value })} />
                    </Field>
                    <Field label="Catégorie" htmlFor={`${id}-categorie`}>
                      <SelectNative id={`${id}-categorie`} value={voyageur.categorie} disabled={recalcul} onChange={(event) => maj({ categorie: event.target.value })}>
                        {choix.map((code) => (
                          <option key={code || "adulte"} value={code}>
                            {libelleCategorie(code, categories)}
                          </option>
                        ))}
                      </SelectNative>
                    </Field>
                    <Field label="Civilité" htmlFor={`${id}-civilite`}>
                      <SelectNative id={`${id}-civilite`} value={voyageur.civilite} onChange={(event) => maj({ civilite: event.target.value as "M" | "F" })}>
                        <option value="M">M.</option>
                        <option value="F">Mme</option>
                      </SelectNative>
                    </Field>
                    <Field label="Téléphone" htmlFor={`${id}-telephone`} hint={index === 0 ? "Contact de la vente" : "Facultatif"}>
                      <Input
                        id={`${id}-telephone`}
                        type="tel"
                        inputMode="tel"
                        autoComplete="off"
                        placeholder="+241 77 12 34 56"
                        value={voyageur.telephone}
                        onChange={(event) => maj({ telephone: event.target.value })}
                      />
                    </Field>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[13px] font-medium text-ink-muted">
                    <Armchair aria-hidden className="size-4" />
                    <span className="tabular">{voyageur.place ? `${voyageur.voiture ?? ""} · ${voyageur.place}` : "Sans place"}</span>
                    {note ? <Tag tone="info">{note}</Tag> : null}
                    <span className="tabular ml-auto text-[15px] font-semibold text-ink">
                      {recalcul ? "Recalcul…" : prix(index) !== undefined ? `${montant(prix(index)!)} XAF` : "—"}
                    </span>
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      </Panneau>
      <div className="grid items-start gap-4 md:grid-cols-2 2xl:grid-cols-1">
        <Panneau titre="Options" icone={SlidersHorizontal}>
          <div className="grid gap-1">
            <Switch
              label="Imprimer au guichet · un billet 80 mm par voyageur"
              checked={brouillon.imprimer}
              onCheckedChange={(valeur) => onOptions({ imprimer: valeur })}
            />
            <Switch
              label="Client conventionné · facturer à une entreprise"
              checked={brouillon.conventionne}
              onCheckedChange={(valeur) => onOptions({ conventionne: valeur })}
            />
          </div>
          <p className="text-[12.5px] text-ink-muted">
            Nom tel qu&apos;il figure sur la pièce d&apos;identité : le contrôleur le compare à bord.
          </p>
        </Panneau>
        {tenueActive ? <Tenue fin={tenueActive}>Places tenues encore</Tenue> : null}
      </div>
    </div>
  )
}
