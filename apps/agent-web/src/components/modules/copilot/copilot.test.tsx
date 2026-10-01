import { render, screen } from "@testing-library/react"
import type { ComponentProps } from "react"
import { describe, expect, it, vi } from "vitest"

vi.mock("@workspace/api/hooks", () => ({
  useQuery: () => undefined,
  useMutation: () => vi.fn(),
  useAction: () => vi.fn(),
}))

import { MessageAssistant } from "./ecran"

type Message = ComponentProps<typeof MessageAssistant>["message"]

function message(partiel: Partial<Message>): Message {
  return {
    _id: "m1" as Message["_id"],
    requestId: "r1",
    role: "assistant",
    contenu: "",
    statut: "termine",
    erreur: null,
    sources: [],
    outils: [],
    provider: "openai",
    model: "modele-test",
    retour: null,
    createdAt: Date.parse("2026-10-01T08:00:00Z"),
    ...partiel,
  }
}

describe("Copilot — rendu d'une réponse", () => {
  it("cite ses sources avec un lien vers la donnée, et montre les outils refusés", () => {
    render(
      <MessageAssistant
        actions={[]}
        message={message({
          contenu: "Aucune vente le 30 septembre (source : Ventes du jour).",
          sources: [{ outil: "ventes_du_jour", libelle: "Ventes du 2026-09-30", lien: "/gestion/recettes", detail: "0 vente" }],
          outils: [
            { nom: "ventes_du_jour", libelle: "Ventes du jour", statut: "ok" },
            { nom: "caisses_a_viser", libelle: "Caisses à viser", statut: "refuse" },
          ],
        })}
      />
    )
    expect(screen.getByRole("link", { name: /Ventes du 2026-09-30/ })).toHaveAttribute("href", "/gestion/recettes")
    expect(screen.getByText(/Caisses à viser · refusé/)).toBeInTheDocument()
    expect(screen.getByRole("group", { name: /vous a-t-elle aidé/ })).toBeInTheDocument()
  })

  it("dit clairement qu'il n'est pas configuré, sans fausse réponse", () => {
    render(<MessageAssistant actions={[]} message={message({ statut: "non_configure", contenu: "La variable OPENAI_API_KEY est absente." })} />)
    expect(screen.getByText("Copilot n'est pas configuré.")).toBeInTheDocument()
    expect(screen.queryByRole("group", { name: /vous a-t-elle aidé/ })).toBeNull()
  })

  it("signale une conversation d'exemple et n'en sollicite pas l'évaluation", () => {
    render(<MessageAssistant actions={[]} message={message({ provider: "exemple", contenu: "Conversation d'exemple." })} />)
    expect(screen.getByText("Conversation d'exemple")).toBeInTheDocument()
    expect(screen.queryByRole("group", { name: /vous a-t-elle aidé/ })).toBeNull()
  })

  it("annonce une réponse interrompue", () => {
    render(<MessageAssistant actions={[]} message={message({ statut: "erreur", erreur: "Relancez votre question." })} />)
    expect(screen.getByText("Réponse interrompue.")).toBeInTheDocument()
  })

  it("présente une écriture à confirmer, sans rien enregistrer", () => {
    render(
      <MessageAssistant
        message={message({ contenu: "Proposition prête." })}
        actions={[
          {
            _id: "a1" as never,
            requestId: "r1",
            outil: "proposer_action_audit",
            libelle: "Inscrire au plan d'actions",
            entree: {
              titre: "Revue des accès",
              constat: "Accès non revus.",
              recommandation: "Revue trimestrielle.",
              gravite: "moderee",
              direction: "DSI",
              echeance: "2026-12-31",
            },
            statut: "a_confirmer",
            resultat: null,
            createdAt: 0,
            decideLe: null,
          },
        ]}
      />
    )
    expect(screen.getByText("Rien n'est encore enregistré")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Confirmer l.inscription/ })).toBeInTheDocument()
    expect(screen.getByText("Systèmes d'information")).toBeInTheDocument()
  })
})
