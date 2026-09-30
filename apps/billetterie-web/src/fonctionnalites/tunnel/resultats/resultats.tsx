"use client"

import { useSearchParams } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { Feuille } from "@workspace/ui/components/feuille"

import { BarreApp } from "@/coquille/barre-app"
import { useNaviguer } from "@/coquille/filet-navigation"
import { FormulaireRecherche } from "@/fonctionnalites/recherche/formulaire-recherche"
import { useGares } from "@/fonctionnalites/reference/use-reference"
import { useToday } from "@/hooks/use-today"
import { dateDeService, dateRelative } from "@/lib/format"
import { libelleVoyageurs, lireRecherche } from "@/lib/recherche"

import { adresseResultats } from "../adresses"
import { EcranMessage, EnTeteTunnel, Page, SqueletteTunnel } from "../etapes"
import { ListeResultats } from "./liste"

/**
 * Étape 1 du tunnel : les trains d'un jour pour une recherche lue dans
 * l'adresse (`/resultats?de=OWE&a=FCV&le=…&adultes=1&enfants=0`). Une
 * adresse incomplète renvoie à l'accueil, en le disant.
 */
export function Resultats() {
  const parametres = useSearchParams()
  const recherche = useMemo(() => lireRecherche(parametres), [parametres])
  const naviguer = useNaviguer()
  const instant = useToday()
  const aujourdhui = instant === null ? null : dateDeService(instant)
  const { gares, parCode } = useGares()
  const depart = parCode(recherche?.de)
  const arrivee = parCode(recherche?.a)

  const invalide =
    recherche === null || (gares !== undefined && (!depart || !arrivee))
  const renvoye = useRef(false)
  useEffect(() => {
    if (!invalide || renvoye.current) return
    renvoye.current = true
    toast("Cette recherche est incomplète. Choisissez vos gares et votre date.")
    naviguer("/", { remplacer: true })
  }, [invalide, naviguer])

  // Modifier la recherche : une feuille sur mobile, le formulaire sous l'en-tête ailleurs.
  const [modifier, setModifier] = useState<null | "feuille" | "panneau">(null)
  const cle = recherche ? adresseResultats(recherche) : ""
  const [cleVue, setCleVue] = useState(cle)
  if (cle !== cleVue) {
    setCleVue(cle)
    setModifier(null)
  }

  if (invalide) {
    return (
      <>
        <BarreApp titre="Recherche" retour="/" />
        <Page className="py-8">
          <EcranMessage
            titre="Cette recherche est incomplète."
            description="Retour à l'accueil pour choisir vos gares et votre date."
          />
        </Page>
      </>
    )
  }

  if (!recherche || !depart || !arrivee || !aujourdhui) {
    return (
      <>
        <BarreApp titre="Trains disponibles" retour="/" />
        <SqueletteTunnel />
      </>
    )
  }

  const titre = `${depart.name} → ${arrivee.name}`
  const resume = `${libelleVoyageurs(recherche)} · ${dateRelative(recherche.le, aujourdhui)}`

  return (
    <>
      <BarreApp
        titre={titre}
        sousTitre={resume}
        retour="/"
        actions={
          <Button
            variant="ghost"
            onClick={() => setModifier("feuille")}
            aria-haspopup="dialog"
          >
            Modifier
          </Button>
        }
      />
      <EnTeteTunnel
        etape={0}
        etapesMobile={false}
        titre={titre}
        detail={resume}
        action={
          <Button
            variant="ghost"
            aria-expanded={modifier === "panneau"}
            onClick={() =>
              setModifier((m) => (m === "panneau" ? null : "panneau"))
            }
          >
            {modifier === "panneau" ? "Fermer" : "Modifier"}
          </Button>
        }
      />
      {modifier === "panneau" && (
        <Page className="hidden pt-1 pb-5 md:block">
          <FormulaireRecherche initiale={recherche} />
        </Page>
      )}
      <Feuille
        open={modifier === "feuille"}
        onOpenChange={(ouvert) => setModifier(ouvert ? "feuille" : null)}
        titre="Modifier la recherche"
      >
        <FormulaireRecherche initiale={recherche} />
      </Feuille>
      <ListeResultats
        key={cle}
        recherche={recherche}
        depart={depart}
        arrivee={arrivee}
        aujourdhui={aujourdhui}
        masquerAction={modifier !== null}
      />
    </>
  )
}
