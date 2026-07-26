import { describe, expect, it } from "vitest"
import {
  EMPTY_MASK,
  MAX_SEGMENTS,
  SeatUnavailableError,
  SegmentCapacityError,
  applyBlock,
  availableForRange,
  countFreeSeats,
  decrementCounters,
  findFreeSeat,
  findFreeSeats,
  fullMask,
  incrementCounters,
  isRangeFree,
  limitingSegment,
  occupiedSegmentCount,
  occupiedSegments,
  occupy,
  release,
  removeBlock,
  segmentMask,
  type SeatOccupancy,
} from "./inventory"

/**
 * Desserte de référence : les gares du Transgabonais utilisées dans les
 * exemples du cahier des charges. 6 arrêts, donc 5 segments.
 *
 *   0 Owendo ─0─ 1 Ndjolé ─1─ 2 Booué ─2─ 3 Lastourville ─3─ 4 Moanda ─4─ 5 Franceville
 */
const OWENDO = 0
const NDJOLE = 1
const BOOUE = 2
const LASTOURVILLE = 3
const MOANDA = 4
const FRANCEVILLE = 5
const SEGMENTS = 5

/* ═══════════════════════ Construction du masque ══════════════════════════ */

describe("segmentMask — traduction d'un trajet en segments", () => {
  it("un trajet d'un arrêt au suivant occupe un seul segment", () => {
    expect(
      segmentMask({ fromIndex: OWENDO, toIndex: NDJOLE }, SEGMENTS),
    ).toBe(0b00001)
  })

  it("le trajet complet occupe tous les segments", () => {
    expect(
      segmentMask({ fromIndex: OWENDO, toIndex: FRANCEVILLE }, SEGMENTS),
    ).toBe(0b11111)
    expect(
      segmentMask({ fromIndex: OWENDO, toIndex: FRANCEVILLE }, SEGMENTS),
    ).toBe(fullMask(SEGMENTS))
  })

  it("l'arrêt de descente ne consomme pas de segment", () => {
    // Owendo → Booué : segments 0 et 1 seulement, pas le segment 2.
    const mask = segmentMask({ fromIndex: OWENDO, toIndex: BOOUE }, SEGMENTS)
    expect(occupiedSegments(mask, SEGMENTS)).toEqual([0, 1])
  })

  it("un trajet intermédiaire n'occupe que ses segments", () => {
    const mask = segmentMask(
      { fromIndex: NDJOLE, toIndex: LASTOURVILLE },
      SEGMENTS,
    )
    expect(occupiedSegments(mask, SEGMENTS)).toEqual([1, 2])
  })

  it("refuse un trajet de longueur nulle ou inversé", () => {
    expect(() =>
      segmentMask({ fromIndex: BOOUE, toIndex: BOOUE }, SEGMENTS),
    ).toThrow(RangeError)
    expect(() =>
      segmentMask({ fromIndex: FRANCEVILLE, toIndex: OWENDO }, SEGMENTS),
    ).toThrow(RangeError)
  })

  it("refuse un arrêt hors de la desserte", () => {
    expect(() =>
      segmentMask({ fromIndex: 0, toIndex: SEGMENTS + 1 }, SEGMENTS),
    ).toThrow(/hors desserte/)
    expect(() =>
      segmentMask({ fromIndex: -1, toIndex: 2 }, SEGMENTS),
    ).toThrow(RangeError)
  })

  it("refuse une desserte dépassant la capacité du masque binaire", () => {
    expect(() =>
      segmentMask({ fromIndex: 0, toIndex: 1 }, MAX_SEGMENTS + 1),
    ).toThrow(/cesse d'être fiable/)
  })

  it("refuse un nombre de segments non entier ou négatif", () => {
    expect(() => segmentMask({ fromIndex: 0, toIndex: 1 }, -1)).toThrow(
      /Nombre de segments invalide/,
    )
    expect(() => segmentMask({ fromIndex: 0, toIndex: 1 }, 2.5)).toThrow(
      /Nombre de segments invalide/,
    )
    expect(() => fullMask(-3)).toThrow(RangeError)
  })

  it("gère la desserte dégénérée sans segment", () => {
    expect(fullMask(0)).toBe(EMPTY_MASK)
    expect(occupiedSegments(0b1111, 0)).toEqual([])
  })

  it("supporte une desserte à la limite haute sans perte de bit", () => {
    const mask = segmentMask(
      { fromIndex: 0, toIndex: MAX_SEGMENTS },
      MAX_SEGMENTS,
    )
    expect(occupiedSegmentCount(mask)).toBe(MAX_SEGMENTS)
    expect(mask).toBeGreaterThan(0)
  })
})

/* ═══════════════ La propriété centrale : revente d'une place ═════════════ */

describe("Revente d'une place libérée en cours de route (CDC §7.5)", () => {
  it("Owendo→Booué puis Booué→Franceville tiennent sur la MÊME place", () => {
    const premier = segmentMask(
      { fromIndex: OWENDO, toIndex: BOOUE },
      SEGMENTS,
    )
    const second = segmentMask(
      { fromIndex: BOOUE, toIndex: FRANCEVILLE },
      SEGMENTS,
    )

    let place = EMPTY_MASK
    place = occupy(place, premier)
    expect(isRangeFree(place, second)).toBe(true)

    place = occupy(place, second)
    expect(place).toBe(fullMask(SEGMENTS))
    expect(occupiedSegments(place, SEGMENTS)).toEqual([0, 1, 2, 3, 4])
  })

  it("deux trajets qui se chevauchent ne tiennent pas sur la même place", () => {
    const premier = segmentMask(
      { fromIndex: OWENDO, toIndex: LASTOURVILLE },
      SEGMENTS,
    )
    const second = segmentMask(
      { fromIndex: BOOUE, toIndex: FRANCEVILLE },
      SEGMENTS,
    )
    const place = occupy(EMPTY_MASK, premier)

    expect(isRangeFree(place, second)).toBe(false)
    expect(() => occupy(place, second)).toThrow(SeatUnavailableError)
  })

  it("un chevauchement d'un seul segment suffit à bloquer", () => {
    const premier = segmentMask({ fromIndex: OWENDO, toIndex: BOOUE }, SEGMENTS)
    const second = segmentMask({ fromIndex: NDJOLE, toIndex: FRANCEVILLE }, SEGMENTS)
    const place = occupy(EMPTY_MASK, premier)
    expect(() => occupy(place, second)).toThrow(SeatUnavailableError)
  })

  it("trois voyageurs successifs peuvent se relayer sur une seule place", () => {
    let place = EMPTY_MASK
    place = occupy(place, segmentMask({ fromIndex: 0, toIndex: 1 }, SEGMENTS))
    place = occupy(place, segmentMask({ fromIndex: 1, toIndex: 3 }, SEGMENTS))
    place = occupy(place, segmentMask({ fromIndex: 3, toIndex: 5 }, SEGMENTS))
    expect(place).toBe(fullMask(SEGMENTS))
  })

  it("l'erreur indique les segments réellement en conflit", () => {
    const place = occupy(
      EMPTY_MASK,
      segmentMask({ fromIndex: OWENDO, toIndex: BOOUE }, SEGMENTS),
    )
    const demande = segmentMask({ fromIndex: NDJOLE, toIndex: MOANDA }, SEGMENTS)
    try {
      occupy(place, demande)
      expect.unreachable("la réservation aurait dû échouer")
    } catch (error) {
      expect(error).toBeInstanceOf(SeatUnavailableError)
      const e = error as SeatUnavailableError
      // Seul le segment 1 est partagé entre [0,1] et [1,2,3].
      expect(occupiedSegments(e.conflictingMask, SEGMENTS)).toEqual([1])
    }
  })
})

/* ═════════════════════ Occupation et libération ══════════════════════════ */

describe("occupy / release", () => {
  it("libérer annule exactement l'effet de réserver", () => {
    const demande = segmentMask(
      { fromIndex: NDJOLE, toIndex: MOANDA },
      SEGMENTS,
    )
    const initial = occupy(
      EMPTY_MASK,
      segmentMask({ fromIndex: OWENDO, toIndex: NDJOLE }, SEGMENTS),
    )
    const apres = occupy(initial, demande)
    expect(release(apres, demande)).toBe(initial)
  })

  it("libérer est idempotent — une annulation rejouée ne casse rien", () => {
    const demande = segmentMask({ fromIndex: OWENDO, toIndex: BOOUE }, SEGMENTS)
    const place = occupy(EMPTY_MASK, demande)
    const uneFois = release(place, demande)
    const deuxFois = release(uneFois, demande)
    expect(deuxFois).toBe(uneFois)
    expect(deuxFois).toBe(EMPTY_MASK)
  })

  it("libérer un segment jamais occupé ne lève pas", () => {
    expect(() =>
      release(EMPTY_MASK, segmentMask({ fromIndex: 0, toIndex: 2 }, SEGMENTS)),
    ).not.toThrow()
  })

  it("libérer un trajet n'affecte pas les autres voyageurs de la place", () => {
    const a = segmentMask({ fromIndex: 0, toIndex: 2 }, SEGMENTS)
    const b = segmentMask({ fromIndex: 2, toIndex: 5 }, SEGMENTS)
    let place = occupy(occupy(EMPTY_MASK, a), b)
    place = release(place, a)
    expect(occupiedSegments(place, SEGMENTS)).toEqual([2, 3, 4])
    expect(isRangeFree(place, a)).toBe(true)
  })

  it("réserver deux fois le même trajet échoue", () => {
    const demande = segmentMask({ fromIndex: 0, toIndex: 3 }, SEGMENTS)
    const place = occupy(EMPTY_MASK, demande)
    expect(() => occupy(place, demande)).toThrow(SeatUnavailableError)
  })
})

describe("Invariants sur des combinaisons exhaustives", () => {
  /**
   * Balayage systématique de tous les trajets possibles sur la desserte :
   * ces propriétés doivent tenir pour n'importe quel couple de trajets, pas
   * seulement pour les cas choisis à la main.
   */
  const tousLesTrajets = () => {
    const trajets: Array<{ from: number; to: number; mask: number }> = []
    for (let from = 0; from < SEGMENTS; from += 1) {
      for (let to = from + 1; to <= SEGMENTS; to += 1) {
        trajets.push({
          from,
          to,
          mask: segmentMask({ fromIndex: from, toIndex: to }, SEGMENTS),
        })
      }
    }
    return trajets
  }

  it("deux trajets sont compatibles si et seulement s'ils ne se chevauchent pas", () => {
    for (const a of tousLesTrajets()) {
      for (const b of tousLesTrajets()) {
        const chevauchement = a.from < b.to && b.from < a.to
        const place = occupy(EMPTY_MASK, a.mask)
        expect(isRangeFree(place, b.mask)).toBe(!chevauchement)
      }
    }
  })

  it("réserver puis libérer restitue toujours l'état initial", () => {
    for (const a of tousLesTrajets()) {
      for (const b of tousLesTrajets()) {
        if (a.from < b.to && b.from < a.to) continue
        const place = occupy(EMPTY_MASK, a.mask)
        const avecB = occupy(place, b.mask)
        expect(release(avecB, b.mask)).toBe(place)
      }
    }
  })

  it("le nombre de segments occupés correspond à la longueur du trajet", () => {
    for (const a of tousLesTrajets()) {
      expect(occupiedSegmentCount(a.mask)).toBe(a.to - a.from)
    }
  })
})

/* ═══════════════════ Sélection de places disponibles ═════════════════════ */

describe("findFreeSeat / findFreeSeats / countFreeSeats", () => {
  const trajetComplet = segmentMask(
    { fromIndex: OWENDO, toIndex: FRANCEVILLE },
    SEGMENTS,
  )
  const trajetFinal = segmentMask(
    { fromIndex: BOOUE, toIndex: FRANCEVILLE },
    SEGMENTS,
  )

  const places: SeatOccupancy[] = [
    { seatId: "12A", mask: segmentMask({ fromIndex: 0, toIndex: 2 }, SEGMENTS) },
    { seatId: "12B", mask: fullMask(SEGMENTS) },
    { seatId: "12C", mask: EMPTY_MASK },
    { seatId: "12D", mask: segmentMask({ fromIndex: 3, toIndex: 5 }, SEGMENTS) },
  ]

  it("trouve la première place libre sur le trajet demandé", () => {
    expect(findFreeSeat(places, trajetComplet)?.seatId).toBe("12C")
  })

  it("récupère une place libérée en cours de route", () => {
    // 12A est occupée d'Owendo à Booué, donc libre de Booué à Franceville.
    expect(findFreeSeat(places, trajetFinal)?.seatId).toBe("12A")
  })

  it("retourne null quand aucune place ne convient", () => {
    const completes: SeatOccupancy[] = [
      { seatId: "1A", mask: fullMask(SEGMENTS) },
      { seatId: "1B", mask: fullMask(SEGMENTS) },
    ]
    expect(findFreeSeat(completes, trajetComplet)).toBeNull()
  })

  it("compte correctement les places disponibles selon le trajet", () => {
    expect(countFreeSeats(places, trajetComplet)).toBe(1)
    expect(countFreeSeats(places, trajetFinal)).toBe(2) // 12A et 12C
  })

  it("sert un groupe entièrement ou pas du tout", () => {
    expect(findFreeSeats(places, trajetFinal, 2)).toHaveLength(2)
    expect(findFreeSeats(places, trajetFinal, 3)).toBeNull()
    expect(findFreeSeats(places, trajetComplet, 2)).toBeNull()
  })

  it("refuse un effectif absurde", () => {
    expect(() => findFreeSeats(places, trajetComplet, 0)).toThrow(RangeError)
    expect(() => findFreeSeats(places, trajetComplet, -2)).toThrow(RangeError)
  })
})

/* ═══════════════════ Compteurs dénormalisés par segment ══════════════════ */

describe("availableForRange — c'est le segment le plus chargé qui commande", () => {
  it("retient le minimum sur les segments empruntés", () => {
    const counters = [80, 12, 45, 60, 70]
    expect(
      availableForRange(counters, { fromIndex: OWENDO, toIndex: FRANCEVILLE }),
    ).toBe(12)
  })

  it("ignore les segments hors du trajet", () => {
    const counters = [0, 0, 45, 60, 70]
    expect(
      availableForRange(counters, { fromIndex: BOOUE, toIndex: FRANCEVILLE }),
    ).toBe(45)
  })

  it("désigne le segment limitant pour l'expliquer au guichet", () => {
    const counters = [80, 12, 45, 60, 70]
    expect(
      limitingSegment(counters, { fromIndex: OWENDO, toIndex: FRANCEVILLE }),
    ).toBe(1)
  })

  it("retourne zéro quand un segment est saturé", () => {
    const counters = [80, 0, 45, 60, 70]
    expect(
      availableForRange(counters, { fromIndex: OWENDO, toIndex: BOOUE }),
    ).toBe(0)
  })

  it("refuse un trajet invalide ou hors desserte", () => {
    const counters = [10, 10, 10, 10, 10]
    expect(() =>
      availableForRange(counters, { fromIndex: 3, toIndex: 3 }),
    ).toThrow(RangeError)
    expect(() =>
      availableForRange(counters, { fromIndex: 0, toIndex: 9 }),
    ).toThrow(/hors desserte/)
    expect(() =>
      availableForRange(counters, { fromIndex: -1, toIndex: 2 }),
    ).toThrow(/hors desserte/)
  })

  it("désigne le premier segment atteint en cas d'égalité de disponibilité", () => {
    // Tous les segments également chargés : le premier du trajet fait foi.
    const counters = [7, 7, 7, 7, 7]
    expect(
      limitingSegment(counters, { fromIndex: NDJOLE, toIndex: MOANDA }),
    ).toBe(NDJOLE)
  })
})

describe("decrementCounters / incrementCounters", () => {
  it("décrémente uniquement les segments empruntés", () => {
    const counters = [80, 80, 80, 80, 80]
    const apres = decrementCounters(
      counters,
      { fromIndex: OWENDO, toIndex: BOOUE },
      3,
    )
    expect(apres).toEqual([77, 77, 80, 80, 80])
  })

  it("laisse les compteurs d'origine intacts (immuabilité)", () => {
    const counters = [80, 80, 80, 80, 80]
    decrementCounters(counters, { fromIndex: 0, toIndex: 5 }, 10)
    expect(counters).toEqual([80, 80, 80, 80, 80])
  })

  it("refuse de descendre sous zéro — le garde-fou anti-survente", () => {
    const counters = [5, 2, 10, 10, 10]
    expect(() =>
      decrementCounters(counters, { fromIndex: OWENDO, toIndex: BOOUE }, 3),
    ).toThrow(SegmentCapacityError)
  })

  it("l'erreur de capacité porte le détail exploitable", () => {
    const counters = [5, 2, 10, 10, 10]
    try {
      decrementCounters(counters, { fromIndex: 0, toIndex: 2 }, 3)
      expect.unreachable("la vente aurait dû être refusée")
    } catch (error) {
      expect(error).toBeInstanceOf(SegmentCapacityError)
      const e = error as SegmentCapacityError
      expect(e.requested).toBe(3)
      expect(e.available).toBe(2)
    }
  })

  it("autorise exactement la dernière place disponible", () => {
    const counters = [1, 1, 1, 1, 1]
    const apres = decrementCounters(counters, { fromIndex: 0, toIndex: 5 }, 1)
    expect(apres).toEqual([0, 0, 0, 0, 0])
  })

  it("restitue les places à l'annulation", () => {
    const counters = [77, 77, 80, 80, 80]
    const apres = incrementCounters(
      counters,
      { fromIndex: OWENDO, toIndex: BOOUE },
      3,
    )
    expect(apres).toEqual([80, 80, 80, 80, 80])
  })

  it("plafonne à la capacité pour qu'une double libération ne crée pas de places", () => {
    const counters = [80, 80, 80, 80, 80]
    const apres = incrementCounters(
      counters,
      { fromIndex: 0, toIndex: 2 },
      5,
      80,
    )
    expect(apres).toEqual([80, 80, 80, 80, 80])
  })

  it("un cycle vente puis annulation revient à l'état initial", () => {
    const initial = [80, 80, 80, 80, 80]
    const range = { fromIndex: NDJOLE, toIndex: MOANDA }
    const vendu = decrementCounters(initial, range, 4)
    const annule = incrementCounters(vendu, range, 4, 80)
    expect(annule).toEqual(initial)
  })

  it("refuse un nombre de places invalide", () => {
    const counters = [10, 10, 10, 10, 10]
    expect(() =>
      decrementCounters(counters, { fromIndex: 0, toIndex: 2 }, 0),
    ).toThrow(RangeError)
    expect(() =>
      incrementCounters(counters, { fromIndex: 0, toIndex: 2 }, -1),
    ).toThrow(RangeError)
  })

  it("refuse une restitution sur un trajet invalide", () => {
    const counters = [10, 10, 10, 10, 10]
    expect(() =>
      incrementCounters(counters, { fromIndex: 3, toIndex: 3 }, 1),
    ).toThrow(/Trajet invalide/)
    expect(() =>
      incrementCounters(counters, { fromIndex: 4, toIndex: 2 }, 1),
    ).toThrow(/Trajet invalide/)
  })

  it("restitue sans plafond quand la capacité n'est pas précisée", () => {
    const counters = [0, 0, 0, 0, 0]
    const apres = incrementCounters(counters, { fromIndex: 0, toIndex: 2 }, 3)
    expect(apres).toEqual([3, 3, 0, 0, 0])
  })

  it("simule une journée de ventes sans jamais survendre", () => {
    const CAPACITE = 10
    let counters: number[] = Array(SEGMENTS).fill(CAPACITE)
    const ventes = [
      { fromIndex: 0, toIndex: 5, seats: 4 },
      { fromIndex: 0, toIndex: 2, seats: 3 },
      { fromIndex: 2, toIndex: 5, seats: 3 },
      { fromIndex: 1, toIndex: 3, seats: 2 },
    ]
    for (const vente of ventes) {
      counters = decrementCounters(
        counters,
        { fromIndex: vente.fromIndex, toIndex: vente.toIndex },
        vente.seats,
      )
    }
    // Aucun segment ne peut être négatif, par construction.
    for (const restant of counters) {
      expect(restant).toBeGreaterThanOrEqual(0)
      expect(restant).toBeLessThanOrEqual(CAPACITE)
    }
    // Segment 1 : 4 + 3 + 2 = 9 places vendues sur 10.
    expect(counters[1]).toBe(1)
    // La vente suivante sur ce segment doit être refusée au-delà d'une place.
    expect(() =>
      decrementCounters(counters, { fromIndex: 1, toIndex: 2 }, 2),
    ).toThrow(SegmentCapacityError)
  })
})

/* ═══════════════════════ Blocages opérationnels ══════════════════════════ */

describe("Blocage et déblocage de places", () => {
  it("un blocage rend la place indisponible comme une vente", () => {
    const blocage = segmentMask({ fromIndex: 0, toIndex: 5 }, SEGMENTS)
    const place = applyBlock(EMPTY_MASK, blocage)
    expect(isRangeFree(place, segmentMask({ fromIndex: 0, toIndex: 2 }, SEGMENTS))).toBe(
      false,
    )
  })

  it("un blocage peut ne porter que sur une partie du parcours", () => {
    const blocage = segmentMask({ fromIndex: BOOUE, toIndex: FRANCEVILLE }, SEGMENTS)
    const place = applyBlock(EMPTY_MASK, blocage)
    // Le début du parcours reste vendable.
    expect(
      isRangeFree(place, segmentMask({ fromIndex: OWENDO, toIndex: BOOUE }, SEGMENTS)),
    ).toBe(true)
  })

  it("lever un blocage ne libère pas les segments vendus", () => {
    const vendu = segmentMask({ fromIndex: 0, toIndex: 2 }, SEGMENTS)
    const blocage = segmentMask({ fromIndex: 0, toIndex: 5 }, SEGMENTS)
    const place = applyBlock(vendu, blocage)
    const apres = removeBlock(place, blocage, vendu)
    expect(occupiedSegments(apres, SEGMENTS)).toEqual([0, 1])
  })

  it("lever un blocage sur une place sans vente la libère entièrement", () => {
    const blocage = segmentMask({ fromIndex: 0, toIndex: 5 }, SEGMENTS)
    const place = applyBlock(EMPTY_MASK, blocage)
    expect(removeBlock(place, blocage, EMPTY_MASK)).toBe(EMPTY_MASK)
  })
})
