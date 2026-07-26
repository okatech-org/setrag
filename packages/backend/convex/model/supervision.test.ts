import { describe, expect, it } from "vitest"
import {
  THRESHOLDS,
  classifyAccountingDays,
  classifyCashSessions,
  classifyDemoConfiguration,
  classifyOutbox,
  classifyStaleHolds,
  overallSeverity,
  sortFindings,
  type Finding,
} from "./supervision"

const MAINTENANT = 1_800_000_000_000
const HEURE = 3_600_000

function ilYA(heures: number): number {
  return MAINTENANT - heures * HEURE
}

describe("file de sortie", () => {
  it("ne signale rien quand tout est parti", () => {
    expect(
      classifyOutbox(
        [{ status: "envoye", attempts: 1, createdAt: ilYA(48) }],
        MAINTENANT,
      ),
    ).toEqual([])
  })

  it("ne signale rien pour un événement récent en attente", () => {
    expect(
      classifyOutbox(
        [{ status: "en_attente", attempts: 0, createdAt: ilYA(1) }],
        MAINTENANT,
      ),
    ).toEqual([])
  })

  it("avertit au-delà de six heures", () => {
    const f = classifyOutbox(
      [{ status: "en_attente", attempts: 0, createdAt: ilYA(8) }],
      MAINTENANT,
    )
    expect(f).toHaveLength(1)
    expect(f[0]!.code).toBe("outbox_attarde")
    expect(f[0]!.severity).toBe("avertissement")
  })

  it("passe en critique au-delà de trente-six heures", () => {
    const f = classifyOutbox(
      [{ status: "en_attente", attempts: 0, createdAt: ilYA(40) }],
      MAINTENANT,
    )
    expect(f).toHaveLength(1)
    expect(f[0]!.code).toBe("outbox_bloque")
    expect(f[0]!.severity).toBe("critique")
  })

  it("ne dédouble pas le constat quand les deux seuils sont franchis", () => {
    // Un événement bloqué dépasse aussi le seuil d'avertissement : il ne doit
    // apparaître qu'une fois, au niveau le plus grave.
    const f = classifyOutbox(
      [{ status: "en_attente", attempts: 0, createdAt: ilYA(40) }],
      MAINTENANT,
    )
    expect(f.map((x) => x.code)).toEqual(["outbox_bloque"])
  })

  it("signale un échec devenu persistant", () => {
    const f = classifyOutbox(
      [
        {
          status: "echec",
          attempts: THRESHOLDS.outboxFailedAttempts,
          createdAt: ilYA(2),
        },
      ],
      MAINTENANT,
    )
    expect(f.map((x) => x.code)).toEqual(["outbox_echec_persistant"])
  })

  it("laisse passer un échec encore transitoire", () => {
    expect(
      classifyOutbox(
        [{ status: "echec", attempts: 1, createdAt: ilYA(2) }],
        MAINTENANT,
      ),
    ).toEqual([])
  })

  it("compte les événements concernés, pas tous", () => {
    const f = classifyOutbox(
      [
        { status: "en_attente", attempts: 0, createdAt: ilYA(40) },
        { status: "en_attente", attempts: 0, createdAt: ilYA(40) },
        { status: "en_attente", attempts: 0, createdAt: ilYA(1) },
        { status: "envoye", attempts: 1, createdAt: ilYA(50) },
      ],
      MAINTENANT,
    )
    expect(f[0]!.count).toBe(2)
  })
})

describe("journées comptables", () => {
  it("signale une journée ouverte trop longtemps", () => {
    const f = classifyAccountingDays(
      [{ status: "ouverte", openedAt: ilYA(40) }],
      MAINTENANT,
    )
    expect(f[0]!.code).toBe("journee_non_cloturee")
    expect(f[0]!.severity).toBe("critique")
  })

  it("laisse tranquille la journée du jour", () => {
    expect(
      classifyAccountingDays(
        [{ status: "ouverte", openedAt: ilYA(5) }],
        MAINTENANT,
      ),
    ).toEqual([])
  })

  it("ignore les journées clôturées, si anciennes soient-elles", () => {
    expect(
      classifyAccountingDays(
        [{ status: "cloturee", openedAt: ilYA(500) }],
        MAINTENANT,
      ),
    ).toEqual([])
  })
})

describe("sessions de caisse", () => {
  it("avertit sur une caisse ouverte plus de vingt-quatre heures", () => {
    const f = classifyCashSessions(
      [{ status: "ouverte", openedAt: ilYA(30) }],
      MAINTENANT,
    )
    expect(f[0]!.code).toBe("caisse_non_fermee")
    expect(f[0]!.severity).toBe("avertissement")
  })

  it("laisse passer une caisse ouverte le matin même", () => {
    expect(
      classifyCashSessions(
        [{ status: "ouverte", openedAt: ilYA(6) }],
        MAINTENANT,
      ),
    ).toEqual([])
  })

  it("ignore une caisse déjà validée", () => {
    expect(
      classifyCashSessions(
        [{ status: "validee", openedAt: ilYA(200) }],
        MAINTENANT,
      ),
    ).toEqual([])
  })
})

describe("réservations non libérées", () => {
  it("est critique : ce sont des places invendues", () => {
    const f = classifyStaleHolds(
      [{ priceLockedUntil: ilYA(3) }],
      MAINTENANT,
    )
    expect(f[0]!.code).toBe("reservations_non_liberees")
    expect(f[0]!.severity).toBe("critique")
  })

  it("tolère le délai de grâce, le cron ne passant pas en continu", () => {
    expect(
      classifyStaleHolds(
        [{ priceLockedUntil: MAINTENANT - 10 * 60_000 }],
        MAINTENANT,
      ),
    ).toEqual([])
  })

  it("ignore une vente sans échéance de blocage", () => {
    expect(classifyStaleHolds([{}], MAINTENANT)).toEqual([])
  })
})

describe("configuration de démonstration", () => {
  it("avertit tant que la clé du dépôt signe les titres", () => {
    const f = classifyDemoConfiguration({
      usingDemoSigningKey: true,
      provisionalFareCount: 0,
    })
    expect(f.map((x) => x.code)).toEqual(["cle_de_demonstration"])
    expect(f[0]!.action).toMatch(/BARCODE_SIGNING_KEY_V1/)
  })

  it("signale les barèmes provisoires sans en faire un incident", () => {
    const f = classifyDemoConfiguration({
      usingDemoSigningKey: false,
      provisionalFareCount: 91,
    })
    expect(f[0]!.code).toBe("bareme_provisoire")
    expect(f[0]!.severity).toBe("info")
    expect(f[0]!.count).toBe(91)
  })

  it("ne dit rien d'un déploiement correctement configuré", () => {
    expect(
      classifyDemoConfiguration({
        usingDemoSigningKey: false,
        provisionalFareCount: 0,
      }),
    ).toEqual([])
  })
})

describe("synthèse", () => {
  const f = (severity: Finding["severity"], count = 1): Finding => ({
    code: "x",
    severity,
    label: "",
    action: "",
    count,
  })

  it("retient la gravité la plus élevée", () => {
    expect(overallSeverity([f("info"), f("critique"), f("avertissement")])).toBe(
      "critique",
    )
    expect(overallSeverity([f("info"), f("avertissement")])).toBe(
      "avertissement",
    )
    expect(overallSeverity([f("info")])).toBe("info")
  })

  it("dit « info » quand il n'y a rien à signaler", () => {
    expect(overallSeverity([])).toBe("info")
  })

  it("trie du plus urgent au plus bénin", () => {
    const triés = sortFindings([f("info"), f("critique"), f("avertissement")])
    expect(triés.map((x) => x.severity)).toEqual([
      "critique",
      "avertissement",
      "info",
    ])
  })

  it("à gravité égale, place le plus nombreux en tête", () => {
    const triés = sortFindings([f("critique", 2), f("critique", 9)])
    expect(triés.map((x) => x.count)).toEqual([9, 2])
  })

  it("ne modifie pas le tableau reçu", () => {
    const source = [f("info"), f("critique")]
    sortFindings(source)
    expect(source.map((x) => x.severity)).toEqual(["info", "critique"])
  })
})
