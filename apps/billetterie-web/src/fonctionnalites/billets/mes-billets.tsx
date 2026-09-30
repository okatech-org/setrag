"use client"

import { SearchIcon } from "lucide-react"
import Link from "next/link"
import { useMemo, useState, type CSSProperties } from "react"

import { Button } from "@workspace/ui/components/button"
import { EmptyState } from "@workspace/ui/components/empty-state"
import { Feuille } from "@workspace/ui/components/feuille"
import { SegmentedControl } from "@workspace/ui/components/segmented-control"

import { BarreApp, GrandTitre } from "@/coquille/barre-app"
import { AvisCopieLocale } from "@/fonctionnalites/hors-ligne/copie-locale"
import { useDonneesLocales } from "@/fonctionnalites/hors-ligne/donnees-locales"
import { adresseConnexion } from "@/fonctionnalites/tunnel/adresses"
import { useTravelerAuth } from "@/hooks/use-traveler-auth"

import { CarteDossier } from "./carte-dossier"
import { estAVenir, type Dossier } from "./dossier"
import { Attente, Conteneur } from "./elements"
import { FeuilleAnnulerOption } from "./feuilles"
import { useMaintenant } from "./horloge"
import { FormulaireRetrouver } from "./retrouver-reservation"

type Onglet = "a-venir" | "passes"

const mois = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "UTC",
  month: "long",
  year: "numeric",
})

/** « Septembre 2026 » : l'historique se lit par mois. */
function moisDe(date: string): string {
  const [a, m] = date.split("-").map(Number) as [number, number]
  const texte = mois.format(new Date(Date.UTC(a, m - 1, 15)))
  return texte.charAt(0).toUpperCase() + texte.slice(1)
}

function Liste({
  dossiers,
  maintenant,
  onAnnuler,
}: {
  dossiers: Dossier[]
  maintenant: number
  onAnnuler: (reference: string) => void
}) {
  return (
    <ul className="st-apparait grid gap-3 md:grid-cols-2 md:gap-4 xl:grid-cols-3">
      {dossiers.map((dossier, index) => (
        <li
          key={dossier.sale._id}
          style={{ "--i": index } as CSSProperties}
          className="min-w-0"
        >
          <CarteDossier
            dossier={dossier}
            maintenant={maintenant}
            onAnnuler={() => onAnnuler(dossier.sale.number)}
          />
        </li>
      ))}
    </ul>
  )
}

/** Visiteur sans compte : se connecter, ou retrouver une réservation. */
function SansCompte() {
  return (
    <div className="grid gap-4 md:grid-cols-2 md:items-start md:gap-6">
      <section
        aria-labelledby="billets-compte"
        className="grid gap-3 rounded-lg border border-line bg-surface p-5"
      >
        <h2 id="billets-compte" className="text-[18px] font-bold">
          Vos billets, même sans réseau
        </h2>
        <p className="text-small text-ink-muted">
          Connectez-vous : les billets de votre compte s&apos;enregistrent sur
          ce téléphone et restent lisibles sur le quai comme à bord, sans
          réseau.
        </p>
        <Button asChild size="lg" className="md:justify-self-start">
          <Link href={adresseConnexion("/billets")}>Se connecter</Link>
        </Button>
      </section>
      <section
        aria-labelledby="billets-retrouver"
        className="grid gap-3 rounded-lg border border-line bg-surface p-5"
      >
        <div className="grid gap-1">
          <h2 id="billets-retrouver" className="text-[18px] font-bold">
            Retrouver une réservation
          </h2>
          <p className="text-small text-ink-muted">
            Réservée sans compte ? Sa référence et le téléphone de contact
            suffisent.
          </p>
        </div>
        <FormulaireRetrouver />
      </section>
    </div>
  )
}

/**
 * L'onglet « Billets » : `/billets`.
 *
 * La liste vient uniquement des données locales (`useDonneesLocales`) : le
 * serveur quand il répond, sinon la copie de l'appareil. Aucune autre
 * requête ici — ce fournisseur, monté dans la coquille, enregistre les billets
 * même si le voyageur n'ouvre jamais cet écran avec du réseau.
 */
export function MesBillets() {
  const { isAuthenticated, isLoading } = useTravelerAuth()
  const { dossiers, depuisLeCache, chargement, enLigne, recuLe } =
    useDonneesLocales()
  const maintenant = useMaintenant()
  const [onglet, setOnglet] = useState<Onglet>("a-venir")
  const [annulation, setAnnulation] = useState<string | null>(null)
  const [retrouver, setRetrouver] = useState(false)

  const { aVenir, passes } = useMemo(() => {
    if (maintenant === null) return { aVenir: [], passes: [] }
    const depart = (dossier: Dossier) => dossier.trip?.departureAt ?? 0
    const tries = [...dossiers].sort((a, b) => depart(a) - depart(b))
    return {
      aVenir: tries.filter((dossier) => estAVenir(dossier, maintenant)),
      passes: tries
        .filter((dossier) => !estAVenir(dossier, maintenant))
        .reverse(),
    }
  }, [dossiers, maintenant])

  const groupes = useMemo(() => {
    const parMois = new Map<string, Dossier[]>()
    for (const dossier of passes) {
      const cle = dossier.trip ? moisDe(dossier.trip.serviceDate) : "Sans date"
      parMois.set(cle, [...(parMois.get(cle) ?? []), dossier])
    }
    return [...parMois.entries()]
  }, [passes])

  /**
   * Les billets enregistrés priment sur l'état de la session : hors réseau,
   * elle ne peut pas être revalidée et le voyageur paraît déconnecté alors
   * qu'il tient ses billets en gare.
   */
  const etat =
    dossiers.length > 0
      ? "liste"
      : chargement
        ? "chargement"
        : !enLigne
          ? "hors-reseau"
          : isLoading
            ? "chargement"
            : !isAuthenticated
              ? "sans-compte"
              : "vide"

  return (
    <>
      <BarreApp logo />
      <Conteneur className="md:pt-10">
        <div className="grid gap-4 md:flex md:items-center md:justify-between">
          <GrandTitre>
            <span className="md:hidden">Billets</span>
            <span className="max-md:hidden">Mes billets</span>
          </GrandTitre>
          {etat === "liste" && (
            <SegmentedControl
              label="Période"
              size="touch"
              className="w-full md:w-auto"
              value={onglet}
              onValueChange={(valeur) => setOnglet(valeur as Onglet)}
              options={[
                {
                  value: "a-venir",
                  label:
                    aVenir.length > 0
                      ? `À venir · ${aVenir.length}`
                      : "À venir",
                },
                { value: "passes", label: "Passés" },
              ]}
            />
          )}
        </div>

        {depuisLeCache && (
          <AvisCopieLocale
            recuLe={recuLe}
            enLigne={enLigne}
            objet="Vos billets"
          />
        )}

        {etat === "chargement" && (
          <Attente phrase="Chargement de vos billets…" lignes={3} />
        )}

        {etat === "hors-reseau" && (
          <EmptyState
            title="Hors réseau"
            description="Aucun billet n'est enregistré sur ce téléphone. Ceux d'un compte s'y gardent dès la première ouverture avec du réseau."
          />
        )}

        {etat === "sans-compte" && <SansCompte />}

        {etat === "vide" && (
          <EmptyState
            title="Aucun billet pour le moment"
            description="Vos réservations apparaîtront ici, et resteront lisibles sans réseau."
            action={
              <Button asChild>
                <Link href="/">
                  <SearchIcon aria-hidden />
                  Chercher un train
                </Link>
              </Button>
            }
          />
        )}

        {etat === "liste" && maintenant === null && (
          <Attente phrase="Chargement de vos billets…" lignes={3} />
        )}

        {etat === "liste" && maintenant !== null && onglet === "a-venir" && (
          <>
            {aVenir.length > 0 ? (
              <Liste
                dossiers={aVenir}
                maintenant={maintenant}
                onAnnuler={setAnnulation}
              />
            ) : (
              <EmptyState
                title="Aucun voyage à venir"
                description="Vos voyages passés restent consultables dans l'onglet « Passés »."
                action={
                  <Button asChild>
                    <Link href="/">
                      <SearchIcon aria-hidden />
                      Chercher un train
                    </Link>
                  </Button>
                }
              />
            )}
          </>
        )}

        {etat === "liste" && maintenant !== null && onglet === "passes" && (
          <>
            {groupes.length === 0 ? (
              <EmptyState
                title="Aucun voyage passé"
                description="Vos voyages s'afficheront ici une fois faits, avec les réservations annulées."
                action={
                  <Button
                    variant="secondary"
                    onClick={() => setOnglet("a-venir")}
                  >
                    Voir les voyages à venir
                  </Button>
                }
              />
            ) : (
              groupes.map(([libelle, liste]) => (
                <section
                  key={libelle}
                  aria-label={libelle}
                  className="grid gap-3"
                >
                  <h2 className="text-[12px] font-bold tracking-[0.06em] text-ink-muted uppercase">
                    {libelle}
                  </h2>
                  <Liste
                    dossiers={liste}
                    maintenant={maintenant}
                    onAnnuler={setAnnulation}
                  />
                </section>
              ))
            )}
          </>
        )}

        {(etat === "liste" || etat === "vide") && isAuthenticated && (
          <button
            type="button"
            onClick={() => setRetrouver(true)}
            className="min-h-11 justify-self-center text-[14px] font-semibold text-accent-ink underline-offset-4 hover:underline md:justify-self-start"
          >
            Une réservation faite sans compte ? La retrouver
          </button>
        )}
      </Conteneur>

      <FeuilleAnnulerOption
        reference={annulation ?? ""}
        contact={null}
        ouvert={annulation !== null}
        onOuvertChange={(ouvert) => !ouvert && setAnnulation(null)}
      />
      <Feuille
        open={retrouver}
        onOpenChange={setRetrouver}
        titre="Retrouver une réservation"
        description="Sa référence et le téléphone donné au moment de réserver."
      >
        <FormulaireRetrouver principal />
      </Feuille>
    </>
  )
}
