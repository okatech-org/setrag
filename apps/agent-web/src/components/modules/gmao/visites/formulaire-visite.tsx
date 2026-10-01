"use client"

import { Search } from "lucide-react"
import { useState } from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/choice"
import { Field, Input, SelectNative } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import { dateHeure, messageErreur } from "@/components/gestion/referentiels/format"
import { FenetreFormulaire, texte } from "@/components/gestion/referentiels/formulaire"

import { FAMILLES, gmaoApi, STATUTS_ENGIN } from "../commun"

const sansAccents = (texteBrut: string) =>
  texteBrut
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()

/**
 * Ouverture d'une visite technique avant départ : circulation (facultative),
 * convoi, atelier, composition. La check-list suit les familles du convoi.
 */
export function DialogueOuvertureVisite({
  open,
  onOpenChange,
  tripId,
  onCree,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tripId?: string
  onCree: (resultat: { visiteId: string; numero: string }) => void
}) {
  const formulaires = useQuery(gmaoApi.queries.formulaires, open ? {} : "skip")
  const parc = useQuery(gmaoApi.queries.equipements, open ? {} : "skip")
  const ouvrir = useMutation(gmaoApi.mutations.ouvrirVisite)
  const [trajet, setTrajet] = useState(tripId ?? "")
  const [composition, setComposition] = useState<Set<string>>(new Set())
  const [recherche, setRecherche] = useState("")
  const [famille, setFamille] = useState("toutes")
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const trajetChoisi = formulaires?.trajets.find((candidat) => candidat.id === trajet)
  // Engins affectés au train de la circulation : composition proposée d'office.
  const affectes = trajetChoisi ? (parc ?? []).filter((engin) => engin.train === trajetChoisi.train && engin.statut !== "reforme") : []
  const q = sansAccents(recherche.trim())
  const engins = (formulaires?.engins ?? []).filter(
    (engin) => (famille === "toutes" || engin.famille === famille) && (!q || sansAccents(`${engin.numero} ${engin.serie}`).includes(q))
  )
  const choisis = (formulaires?.engins ?? []).filter((engin) => composition.has(engin.id))
  const indisponibles = choisis.filter((engin) => engin.statut !== "en_service")

  const basculer = (id: string, coche: boolean) =>
    setComposition((actuelle) => {
      const suivante = new Set(actuelle)
      if (coche) suivante.add(id)
      else suivante.delete(id)
      return suivante
    })

  return (
    <FenetreFormulaire
      open={open}
      onOpenChange={(ouvert) => {
        onOpenChange(ouvert)
        if (!ouvert) setErreur(null)
      }}
      titre="Ouvrir une visite avant départ"
      description="La check-list s'adapte aux familles du convoi. Le départ n'est autorisé qu'avec une visite signée et un convoi sans engin indisponible."
      libelleValider={`Ouvrir la visite (${composition.size} engin${composition.size > 1 ? "s" : ""})`}
      enCours={enCours}
      erreur={erreur}
      large
      onSubmit={async (donnees) => {
        setErreur(null)
        const atelierId = texte(donnees, "atelierId")
        if (!atelierId) {
          setErreur("Choisissez l'atelier qui réalise la visite.")
          return
        }
        if (composition.size === 0) {
          setErreur("Composez le convoi : cochez au moins un engin.")
          return
        }
        const convoi = texte(donnees, "convoi")
        if (!convoi && !trajet) {
          setErreur("Indiquez le convoi visité, ou choisissez la circulation.")
          return
        }
        setEnCours(true)
        try {
          const resultat = await ouvrir({
            tripId: (trajet || undefined) as never,
            convoi,
            atelierId: atelierId as never,
            equipementIds: [...composition] as never[],
          })
          onOpenChange(false)
          onCree({ visiteId: resultat.visiteId, numero: resultat.numero })
        } catch (cause) {
          setErreur(messageErreur(cause))
        } finally {
          setEnCours(false)
        }
      }}
    >
      {formulaires === undefined ? (
        <p role="status" className="text-small text-ink-muted">
          Chargement des circulations et du parc…
        </p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Circulation (facultatif)" hint="Départs des 12 dernières heures aux 48 prochaines">
              <SelectNative name="tripId" value={trajet} onChange={(event) => setTrajet(event.target.value)}>
                <option value="">Aucune — rame ou convoi hors horaire</option>
                {formulaires.trajets.map((candidat) => (
                  <option key={candidat.id} value={candidat.id}>
                    Train {candidat.train} — départ {dateHeure(candidat.departureAt)}
                  </option>
                ))}
              </SelectNative>
            </Field>
            <Field label="Convoi" hint={trajetChoisi ? `Par défaut : train ${trajetChoisi.train}` : "Numéro de train ou de rame fret"}>
              <Input name="convoi" maxLength={60} placeholder={trajetChoisi ? trajetChoisi.train : "Ex. Rame M12"} />
            </Field>
          </div>
          <Field label="Atelier qui visite">
            <SelectNative name="atelierId" required defaultValue={formulaires.ateliers.length === 1 ? formulaires.ateliers[0]!.id : ""}>
              <option value="">Choisir un atelier…</option>
              {formulaires.ateliers.map((atelier) => (
                <option key={atelier.id} value={atelier.id}>
                  {atelier.code} — {atelier.nom}
                </option>
              ))}
            </SelectNative>
          </Field>

          <fieldset className="grid gap-2">
            <legend className="mb-1 text-[13px] font-medium">Composition du convoi</legend>
            {affectes.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-surface-sunk px-3 py-2 text-[13.5px]">
                <span className="flex-1">
                  {affectes.length} engin(s) affecté(s) au train <span className="tabular">{trajetChoisi?.train}</span>.
                </span>
                <Button type="button" variant="secondary" size="sm" onClick={() => setComposition(new Set(affectes.map((engin) => engin.id)))}>
                  Reprendre cette composition
                </Button>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <label className="flex min-h-11 min-w-[200px] flex-1 items-center gap-2 rounded-md border border-line-strong bg-surface px-3 focus-within:border-accent-base focus-within:shadow-[var(--focus-ring)]">
                <Search aria-hidden className="size-4 text-ink-muted" />
                <span className="sr-only">Chercher un engin</span>
                <input
                  type="search"
                  value={recherche}
                  onChange={(event) => setRecherche(event.target.value)}
                  placeholder="Numéro ou série…"
                  className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-faint"
                />
              </label>
              <label className="sr-only" htmlFor="famille-composition">
                Famille
              </label>
              <select
                id="famille-composition"
                value={famille}
                onChange={(event) => setFamille(event.target.value)}
                className="min-h-11 rounded-md border border-line-strong bg-surface px-3 text-[14.5px]"
              >
                <option value="toutes">Toutes les familles</option>
                {Object.entries(FAMILLES).map(([cle, libelle]) => (
                  <option key={cle} value={cle}>
                    {libelle}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-muted">
              <span className="tabular">
                {composition.size} engin(s) dans le convoi · {engins.length} affiché(s)
              </span>
              {composition.size > 0 ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => setComposition(new Set())}>
                  Vider la composition
                </Button>
              ) : null}
            </div>
            {engins.length === 0 ? (
              <p className="text-small text-ink-muted">Aucun engin ne correspond à cette recherche.</p>
            ) : (
              <div className="grid max-h-72 gap-x-4 overflow-y-auto rounded-md border border-line px-3 sm:grid-cols-2">
                {engins.map((engin) => (
                  <Checkbox
                    key={engin.id}
                    label={`${engin.numero} — ${engin.serie}${engin.statut !== "en_service" ? ` · ${STATUTS_ENGIN[engin.statut].libelle.toLowerCase()}` : ""}`}
                    checked={composition.has(engin.id)}
                    onCheckedChange={(valeur) => basculer(engin.id, valeur === true)}
                  />
                ))}
              </div>
            )}
            {indisponibles.length > 0 ? (
              <InlineMessage tone="warning" title="Engin indisponible dans le convoi">
                {indisponibles.map((engin) => `${engin.numero} (${STATUTS_ENGIN[engin.statut].libelle.toLowerCase()})`).join(", ")} : le départ restera bloqué tant qu&apos;il
                fait partie du convoi.
              </InlineMessage>
            ) : null}
          </fieldset>
        </>
      )}
    </FenetreFormulaire>
  )
}
