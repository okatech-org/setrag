"use client"

import { Eye, Lock } from "lucide-react"
import { useState } from "react"

import { useMutation } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { Field, Textarea } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import { useOperation } from "./elements"
import { FenetreFormulaire } from "./formulaire"
import { Pastille } from "./statuts"

/** Résultats de contrôle à bord, en clair. */
export const RESULTATS_CONTROLE: Record<string, { libelle: string; ton: "success" | "warning" | "danger" | "neutral" }> = {
  valide: { libelle: "Contrôlé", ton: "success" },
  deja_controle: { libelle: "Déjà contrôlé", ton: "success" },
  signature_invalide: { libelle: "Signature invalide", ton: "danger" },
  illisible: { libelle: "Code illisible", ton: "warning" },
  cle_hors_service: { libelle: "Clé hors service", ton: "warning" },
  mauvaise_desserte: { libelle: "Mauvaise desserte", ton: "danger" },
  hors_segment: { libelle: "Hors trajet", ton: "danger" },
  expire: { libelle: "Titre expiré", ton: "danger" },
  annule: { libelle: "Titre annulé", ton: "danger" },
  rembourse: { libelle: "Titre remboursé", ton: "danger" },
  non_paye: { libelle: "Non payé", ton: "danger" },
  inconnu: { libelle: "Hors manifeste", ton: "warning" },
}

export function TagControle({ controle, heure }: { controle: { result: string } | null; heure?: string }) {
  if (!controle) return <Pastille ton="warning">À contrôler</Pastille>
  const def = RESULTATS_CONTROLE[controle.result] ?? { libelle: controle.result, ton: "neutral" as const }
  return (
    <Pastille ton={def.ton}>
      {controle.result === "valide" && heure ? heure : def.libelle}
      {controle.result === "valide" && heure ? <span className="sr-only"> : contrôlé</span> : null}
    </Pastille>
  )
}

/**
 * Téléphone masqué, et son affichage complet sur motif écrit. Le motif part
 * au journal d'audit avec l'agent, l'heure et le billet.
 */
export function TelephoneMasque({ ticketId, masque, libelle = "le téléphone" }: { ticketId: string; masque: string | null; libelle?: string }) {
  const reveler = useMutation(api.functions.referentiels.revelerTelephone)
  const operation = useOperation()
  const [ouvert, setOuvert] = useState(false)
  const [numeros, setNumeros] = useState<{ telephone: string | null; urgence: string | null; contact: string | null } | null>(null)
  if (!masque) return <span className="text-ink-muted">—</span>
  return (
    // Le dialogue est rendu dans un portail, mais ses événements remontent
    // l'arbre React : on les arrête ici pour ne pas ouvrir la ligne du tableau.
    <span className="inline-flex flex-wrap items-center gap-1" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
      <span className="tabular whitespace-nowrap">{masque}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`Afficher ${libelle} en entier`}
        onClick={() => setOuvert(true)}
      >
        <Eye />
      </Button>
      <FenetreFormulaire
        open={ouvert}
        onOpenChange={(o) => {
          setOuvert(o)
          if (!o) setNumeros(null)
        }}
        titre="Afficher un numéro complet"
        description="Le motif, votre nom et l'heure sont inscrits au journal d'audit."
        libelleValider={
          numeros ? (
            "Fermer"
          ) : (
            <>
              <Eye />
              Afficher
            </>
          )
        }
        enCours={operation.enCours === "reveler"}
        erreur={operation.retour?.ton === "danger" ? operation.retour.detail : null}
        onSubmit={async (donnees) => {
          if (numeros) {
            setOuvert(false)
            setNumeros(null)
            return
          }
          const resultat = await operation.executer("reveler", () => reveler({ ticketId: ticketId as never, motif: String(donnees.get("motif") ?? "") }))
          if (resultat) setNumeros(resultat)
        }}
      >
        {numeros ? (
          <InlineMessage tone="info" title="Numéros du dossier">
            <span className="tabular block">Voyageur : {numeros.telephone ?? "—"}</span>
            <span className="tabular block">Urgence : {numeros.urgence ?? "—"}</span>
            <span className="tabular block">Contact de la vente : {numeros.contact ?? "—"}</span>
          </InlineMessage>
        ) : (
          <Field label="Motif de l'affichage" hint="Exemple : retard de 2 h, prévenir le voyageur." htmlFor={`motif-${ticketId}`}>
            <Textarea id={`motif-${ticketId}`} name="motif" required minLength={8} />
          </Field>
        )}
      </FenetreFormulaire>
    </span>
  )
}

export function MentionMasquage() {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Lock aria-hidden className="size-4" />
      Téléphones masqués : le numéro complet s’affiche sur demande motivée, tracée au journal.
    </span>
  )
}
