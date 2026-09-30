import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { ListeMessages, type Message } from "./notifications"

const MAINTENANT = Date.now()
const JOUR = 24 * 60 * 60 * 1000

function message({
  _id,
  ...partiel
}: Omit<Partial<Message>, "_id"> & { _id: string; title: string }): Message {
  return {
    _creationTime: MAINTENANT,
    userId: "utilisateur" as Message["userId"],
    channel: "in_app",
    body: "Corps du message.",
    ...partiel,
    _id: _id as Message["_id"],
  } as Message
}

describe("liste des notifications", () => {
  it("range les messages par jour et signale les non lus par un mot", () => {
    render(
      <ListeMessages
        onLire={() => {}}
        messages={[
          message({
            _id: "a",
            title: "Retard de 12 min",
            category: "retard",
            sentAt: MAINTENANT,
          }),
          message({
            _id: "b",
            title: "Paiement reçu",
            category: "achat",
            sentAt: MAINTENANT - JOUR,
            readAt: MAINTENANT,
          }),
        ]}
      />
    )

    const aujourdhui = screen.getByRole("region", { name: "Aujourd'hui" })
    expect(within(aujourdhui).getByText("Retard de 12 min")).toBeInTheDocument()
    expect(within(aujourdhui).getByText("Nouveau")).toBeInTheDocument()

    const hier = screen.getByRole("region", { name: "Hier" })
    expect(within(hier).getByText("Paiement reçu")).toBeInTheDocument()
    expect(within(hier).queryByText("Nouveau")).not.toBeInTheDocument()
  })

  it("marque un message comme lu quand on le touche", () => {
    const onLire = vi.fn()
    render(
      <ListeMessages
        onLire={onLire}
        messages={[
          message({
            _id: "a",
            title: "Rappel",
            category: "rappel",
            sentAt: MAINTENANT,
          }),
        ]}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: /Rappel/ }))
    expect(onLire).toHaveBeenCalledWith(expect.objectContaining({ _id: "a" }))
  })

  it("un message lu n'est plus un bouton", () => {
    render(
      <ListeMessages
        onLire={() => {}}
        messages={[
          message({
            _id: "a",
            title: "Rappel",
            sentAt: MAINTENANT,
            readAt: MAINTENANT,
          }),
        ]}
      />
    )
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })
})
