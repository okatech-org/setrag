"use client"

import Link from "next/link"
import { toast } from "sonner"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { SkeletonLines } from "@workspace/ui/components/empty-state"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import { ecritureNationale } from "@/fonctionnalites/connexion/identifiant"
import { reseauDisponible } from "@/lib/reseau"

import {
  EnTeteSousPage,
  ExigeConnexion,
  LigneInterrupteur,
  Page,
  Section,
  type ProfilVoyageur,
} from "./elements"
import { ChoixTheme } from "./theme"

type Categorie = "retard" | "rappel" | "achat" | "remboursement"

const CATEGORIES: { valeur: Categorie; libelle: string; detail: string }[] = [
  {
    valeur: "retard",
    libelle: "Retards et suppressions",
    detail: "Quand l'horaire de votre train change, ou qu'il ne circule pas.",
  },
  {
    valeur: "rappel",
    libelle: "Rappel avant le départ",
    detail: "L'heure et la gare de votre prochain voyage.",
  },
  {
    valeur: "achat",
    libelle: "Achats et billets",
    detail: "Le paiement reçu, les billets émis.",
  },
  {
    valeur: "remboursement",
    libelle: "Remboursements",
    detail: "L'avancée d'un remboursement.",
  },
]

function Reglages({ profil }: { profil: ProfilVoyageur }) {
  const preferences = useQuery(api.functions.notificationCenter.preferences, {})
  const statut = useQuery(api.functions.devAuth.status, {})
  // Le réglage suit le geste du doigt : l'interrupteur bascule avant la
  // réponse du serveur, et revient si l'enregistrement échoue.
  const enregistrer = useMutation(
    api.functions.notificationCenter.setPreferences
  ).withOptimisticUpdate((local, args) => {
    local.setQuery(api.functions.notificationCenter.preferences, {}, args)
  })

  if (preferences === undefined) return <SkeletonLines />

  function changer(modif: Partial<typeof preferences>) {
    if (!preferences || !reseauDisponible()) return
    enregistrer({ ...preferences, ...modif }).catch(() =>
      toast.error("Réglage non enregistré. Réessayez dans un instant.")
    )
  }

  function basculer(categorie: Categorie, actif: boolean) {
    if (!preferences) return
    const sourdines = preferences.mutedCategories.filter((c) => c !== categorie)
    changer({ mutedCategories: actif ? sourdines : [...sourdines, categorie] })
  }

  const numero = profil.user.phone
  return (
    <>
      <InlineMessage
        tone="info"
        title="Les alertes automatiques ne sont pas encore en service."
      >
        Aucun SMS ni aucune notification ne part encore pour un retard ou un
        rappel. Vos choix sont gardés dans votre compte et s&apos;appliqueront à
        l&apos;ouverture du service. D&apos;ici là, l&apos;heure réelle de votre
        train se lit dans{" "}
        <Link
          href="/suivi"
          className="font-semibold underline underline-offset-2"
        >
          Suivi des trains
        </Link>
        .
      </InlineMessage>

      <Section titre="Où vous prévenir">
        <LigneInterrupteur
          libelle="Notifications sur le téléphone"
          detail="Sur l'écran du téléphone, même l'application fermée. Ici, les messages s'affichent aussi dans Notifications."
          checked={preferences.pushEnabled}
          onCheckedChange={(valeur) => changer({ pushEnabled: valeur })}
        />
        <LigneInterrupteur
          libelle="SMS"
          detail={
            <>
              {numero ? (
                <>
                  Au{" "}
                  <span className="tabular">{ecritureNationale(numero)}</span>.
                </>
              ) : (
                "Au numéro de votre profil : vous n'en avez pas encore donné."
              )}
              {statut &&
                !statut.smsDeliveryEnabled &&
                " Aucun service d'envoi de SMS n'est encore branché."}
            </>
          }
          checked={preferences.smsEnabled}
          onCheckedChange={(valeur) => changer({ smsEnabled: valeur })}
        />
      </Section>

      <Section titre="Pour quoi vous prévenir">
        {CATEGORIES.map((categorie) => (
          <LigneInterrupteur
            key={categorie.valeur}
            libelle={categorie.libelle}
            detail={categorie.detail}
            checked={!preferences.mutedCategories.includes(categorie.valeur)}
            onCheckedChange={(valeur) => basculer(categorie.valeur, valeur)}
          />
        ))}
      </Section>
      <p className="text-small -mt-3 px-1 text-ink-muted">
        Les offres commerciales se règlent à part, dans{" "}
        <Link
          href="/compte/donnees"
          className="font-semibold text-accent-ink underline-offset-2 hover:underline"
        >
          Mes données et consentements
        </Link>
        .
      </p>
    </>
  )
}

export function Preferences() {
  return (
    <>
      <EnTeteSousPage titre="Alertes et notifications" />
      <Page>
        <ExigeConnexion
          invitation={{
            titre: "Connectez-vous pour régler vos alertes",
            texte: "Vos réglages d'alertes sont rattachés à votre compte.",
          }}
        >
          {(profil) => <Reglages profil={profil} />}
        </ExigeConnexion>
        {/* Le thème vit sur l'appareil : il se règle même sans compte. */}
        <Section titre="Affichage">
          <li className="px-4 py-1">
            <ChoixTheme />
          </li>
        </Section>
      </Page>
    </>
  )
}
