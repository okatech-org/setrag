import { describe, expect, it } from "vitest"

import { etatDuBandeau, type EntreeBandeau } from "./bandeau"

const SYNCHRO = Date.parse("2026-09-30T11:52:00+01:00")
const MAINTENANT = Date.parse("2026-09-30T15:54:00+01:00")

function entree(patch: Partial<EntreeBandeau> = {}): EntreeBandeau {
  return {
    online: true,
    authenticated: true,
    syncing: false,
    progress: null,
    queue: { total: 0, failed: 0 },
    lastSyncAt: SYNCHRO,
    ...patch,
  }
}

describe("Bandeau de service", () => {
  it("en ligne, rien n'attend : l'heure de la dernière confirmation", () => {
    expect(etatDuBandeau(entree(), MAINTENANT)).toEqual({
      ton: "en-ligne",
      titre: "En ligne",
      detail: "tout est envoyé",
      fin: "synchro 11:52",
    })
  })

  it("hors ligne, le nombre à envoyer, sans alarme", () => {
    expect(
      etatDuBandeau(
        entree({ online: false, queue: { total: 7, failed: 0 } }),
        MAINTENANT
      )
    ).toMatchObject({
      ton: "hors-ligne",
      titre: "Hors ligne",
      compte: 7,
      detail: "à envoyer",
      fin: "synchro 11:52",
    })
  })

  it("pendant l'envoi : l'avancement et le lot", () => {
    expect(
      etatDuBandeau(
        entree({
          syncing: true,
          progress: { sent: 2, total: 9, batch: 3, batchCount: 4 },
        }),
        MAINTENANT
      )
    ).toMatchObject({
      ton: "envoi",
      titre: "Envoi",
      detail: "2 sur 9",
      fin: "lot 3 sur 4",
    })
  })

  it("réseau sans session : la reprise sera automatique", () => {
    expect(
      etatDuBandeau(
        entree({ authenticated: false, queue: { total: 7, failed: 0 } }),
        MAINTENANT
      )
    ).toMatchObject({
      ton: "session",
      titre: "Session non reconnue",
      compte: 7,
      fin: "reprise auto.",
    })
  })

  it("en échec : rien n'est perdu, le prochain essai est annoncé", () => {
    expect(
      etatDuBandeau(
        entree({
          queue: { total: 2, failed: 2 },
          nextRetryAt: MAINTENANT + 29_200,
        }),
        MAINTENANT
      )
    ).toMatchObject({
      ton: "echec",
      titre: "2 en échec",
      detail: "conservés",
      fin: "nouvel essai 30 s",
    })
  })

  it("avant toute synchronisation, ne prétend pas que tout est envoyé", () => {
    expect(
      etatDuBandeau(entree({ lastSyncAt: undefined }), MAINTENANT)
    ).toMatchObject({
      detail: "rien à envoyer",
      fin: undefined,
    })
  })
})
