import { describe, expect, it } from "vitest"
import {
  BARCODE_PREFIX,
  PAYLOAD_VERSION,
  composeBarcode,
  decodeBase45,
  decodeCbor,
  deserializePayload,
  encodeBase45,
  encodeCbor,
  parseBarcode,
  serializePayload,
  verifyScope,
  type TicketPayload,
} from "./barcode"

const BILLET: TicketPayload = {
  v: PAYLOAD_VERSION,
  k: 1,
  kind: "billet",
  ref: "BIL-2026-000123",
  trip: "j57abc1234567890",
  date: "2026-08-14",
  cls: "premiere",
  from: 0,
  to: 5,
  seat: "12A",
  exp: 1_786_000_000,
}

describe("CBOR", () => {
  it("encode les entiers positifs sur le plus petit en-tête possible", () => {
    expect([...encodeCbor(0)]).toEqual([0x00])
    expect([...encodeCbor(23)]).toEqual([0x17])
    expect([...encodeCbor(24)]).toEqual([0x18, 24])
    expect([...encodeCbor(255)]).toEqual([0x18, 255])
    expect([...encodeCbor(256)]).toEqual([0x19, 0x01, 0x00])
    expect([...encodeCbor(65_535)]).toEqual([0x19, 0xff, 0xff])
    expect([...encodeCbor(65_536)]).toEqual([0x1a, 0x00, 0x01, 0x00, 0x00])
  })

  it("fait l'aller-retour sur les valeurs du sous-ensemble supporté", () => {
    const cas = [
      0,
      1,
      23,
      24,
      1000,
      1_786_000_000,
      -1,
      -100,
      "",
      "SETRAG",
      "Ndjolé — accent et tiret cadratin",
      true,
      false,
      null,
      [1, 2, 3],
      [] as never[],
      { a: 1, b: "deux", c: [3] },
    ]
    for (const valeur of cas) {
      expect(decodeCbor(encodeCbor(valeur))).toEqual(valeur)
    }
  })

  it("produit un encodage canonique : l'ordre des clés ne compte pas", () => {
    const a = encodeCbor({ trip: "t", cls: "c", from: 0, ref: "r" })
    const b = encodeCbor({ ref: "r", from: 0, cls: "c", trip: "t" })
    expect([...a]).toEqual([...b])
  })

  it("omet les clés indéfinies plutôt que de les encoder", () => {
    const avec = encodeCbor({ a: 1, b: undefined })
    const sans = encodeCbor({ a: 1 })
    expect([...avec]).toEqual([...sans])
  })

  it("refuse les nombres non entiers", () => {
    expect(() => encodeCbor(1.5)).toThrow(/entiers/)
  })

  it("refuse des octets excédentaires après la valeur", () => {
    const bytes = new Uint8Array([...encodeCbor(1), 0x01])
    expect(() => decodeCbor(bytes)).toThrow(/excédentaires/)
  })

  it("refuse une fin de données prématurée", () => {
    expect(() => decodeCbor(new Uint8Array([0x18]))).toThrow(/fin de données/)
  })

  it("refuse une clé d'association non textuelle", () => {
    // Association d'un élément dont la clé est l'entier 1.
    expect(() => decodeCbor(new Uint8Array([0xa1, 0x01, 0x01]))).toThrow(
      /non textuelle/,
    )
  })
})

describe("Base45", () => {
  /** Vecteurs de la RFC 9285, section 4.4. */
  it("reproduit les vecteurs de la RFC 9285", () => {
    const vecteurs: ReadonlyArray<readonly [string, string]> = [
      ["AB", "BB8"],
      ["Hello!!", "%69 VD92EX0"],
      ["base-45", "UJCLQE7W581"],
      ["ietf!", "QED8WEX0"],
    ]
    for (const [clair, encode] of vecteurs) {
      const bytes = new TextEncoder().encode(clair)
      expect(encodeBase45(bytes)).toBe(encode)
      expect(new TextDecoder().decode(decodeBase45(encode))).toBe(clair)
    }
  })

  it("fait l'aller-retour sur toutes les longueurs jusqu'à 64 octets", () => {
    for (let n = 0; n <= 64; n += 1) {
      const bytes = new Uint8Array(n)
      for (let i = 0; i < n; i += 1) bytes[i] = (i * 37 + n) % 256
      expect([...decodeBase45(encodeBase45(bytes))]).toEqual([...bytes])
    }
  })

  it("couvre l'intégralité de la plage d'un octet", () => {
    const bytes = new Uint8Array(256)
    for (let i = 0; i < 256; i += 1) bytes[i] = i
    expect([...decodeBase45(encodeBase45(bytes))]).toEqual([...bytes])
  })

  it("refuse un caractère hors alphabet", () => {
    expect(() => decodeBase45("BB!")).toThrow(/caractère invalide/)
  })

  it("refuse une longueur impossible", () => {
    expect(() => decodeBase45("BBBB")).toThrow(/longueur invalide/)
  })

  it("refuse un triplet dépassant deux octets", () => {
    // ':::' = 44 + 44×45 + 44×2025 = 90 044, au-delà de 0xFFFF.
    expect(() => decodeBase45(":::")).toThrow(/hors bornes/)
  })

  it("refuse une paire finale dépassant un octet", () => {
    // '::' = 44 + 44×45 = 2024, au-delà de 0xFF.
    expect(() => decodeBase45("::")).toThrow(/hors bornes/)
  })
})

describe("charge utile", () => {
  it("fait l'aller-retour sans perte", () => {
    expect(deserializePayload(serializePayload(BILLET))).toEqual(BILLET)
  })

  it("reste compacte — moins de 120 octets, compression inutile", () => {
    expect(serializePayload(BILLET).length).toBeLessThan(120)
  })

  it("ne transporte aucune donnée personnelle", () => {
    const texte = new TextDecoder().decode(serializePayload(BILLET))
    for (const cle of ["nom", "prenom", "name", "tel", "phone", "email"]) {
      expect(texte).not.toContain(cle)
    }
  })

  it("accepte un billet debout, sans place attribuée", () => {
    const { seat: _seat, ...debout } = BILLET
    expect(deserializePayload(serializePayload(debout))).toEqual(debout)
    expect(deserializePayload(serializePayload(debout)).seat).toBeUndefined()
  })

  it("refuse une version de format inconnue", () => {
    expect(() => serializePayload({ ...BILLET, v: 99 })).toThrow(/Version/)
  })

  it("refuse une version de clé invalide", () => {
    expect(() => serializePayload({ ...BILLET, k: 0 })).toThrow(/clé/)
  })

  it("refuse une nature de titre inconnue", () => {
    expect(() =>
      serializePayload({
        ...BILLET,
        kind: "colis" as TicketPayload["kind"],
      }),
    ).toThrow(/Nature/)
  })

  it("refuse un titre sans numéro ni desserte", () => {
    expect(() => serializePayload({ ...BILLET, ref: "" })).toThrow(/Numéro/)
    expect(() => serializePayload({ ...BILLET, trip: "" })).toThrow(/Desserte/)
  })

  it("refuse un segment vide ou inversé", () => {
    expect(() => serializePayload({ ...BILLET, from: 5, to: 5 })).toThrow(
      /descente/,
    )
    expect(() => serializePayload({ ...BILLET, from: 5, to: 2 })).toThrow(
      /descente/,
    )
    expect(() => serializePayload({ ...BILLET, from: -1 })).toThrow(/montée/)
  })
})

describe("composition du code-barres", () => {
  const signature = new Uint8Array(64).fill(0xab)

  it("préfixe le code et le rend lisible en mode alphanumérique", () => {
    const code = composeBarcode(serializePayload(BILLET), signature)
    expect(code.startsWith(BARCODE_PREFIX)).toBe(true)
    expect(code.slice(BARCODE_PREFIX.length)).toMatch(
      /^[0-9A-Z $%*+\-./:]+$/,
    )
  })

  it("se relit intégralement", () => {
    const bytes = serializePayload(BILLET)
    const { payload, payloadBytes, signature: relue } = parseBarcode(
      composeBarcode(bytes, signature),
    )
    expect(payload).toEqual(BILLET)
    expect([...payloadBytes]).toEqual([...bytes])
    expect([...relue]).toEqual([...signature])
  })

  it("refuse une signature dont la taille n'est pas celle d'Ed25519", () => {
    expect(() =>
      composeBarcode(serializePayload(BILLET), new Uint8Array(32)),
    ).toThrow(/64/)
  })

  it("rejette un code étranger sans tenter de le décoder", () => {
    expect(() => parseBarcode("HC1:NCFOXN%TS3DH")).toThrow(/étranger/)
  })

  it("rejette un code tronqué de sa signature", () => {
    const nu = encodeBase45(serializePayload(BILLET))
    expect(() => parseBarcode(BARCODE_PREFIX + nu.slice(0, 30))).toThrow()
  })

  it("rejette un code réduit à sa seule signature", () => {
    expect(() =>
      parseBarcode(BARCODE_PREFIX + encodeBase45(new Uint8Array(64))),
    ).toThrow(/tronqué/)
  })
})

describe("vérification de portée", () => {
  const contexte = {
    tripId: BILLET.trip,
    currentStopIndex: 2,
    nowSeconds: 1_785_000_000,
  }

  it("valide un titre au bon endroit et au bon moment", () => {
    expect(verifyScope(BILLET, contexte)).toBe("valide")
  })

  it("valide à la gare de montée elle-même", () => {
    expect(verifyScope(BILLET, { ...contexte, currentStopIndex: 0 })).toBe(
      "valide",
    )
  })

  it("valide au dernier segment couvert", () => {
    expect(verifyScope(BILLET, { ...contexte, currentStopIndex: 4 })).toBe(
      "valide",
    )
  })

  it("refuse à la gare de descente : le trajet est achevé", () => {
    expect(verifyScope(BILLET, { ...contexte, currentStopIndex: 5 })).toBe(
      "hors_segment",
    )
  })

  it("refuse en amont de la gare de montée", () => {
    expect(
      verifyScope({ ...BILLET, from: 3, to: 6 }, contexte),
    ).toBe("hors_segment")
  })

  it("refuse un titre émis pour une autre desserte", () => {
    expect(verifyScope(BILLET, { ...contexte, tripId: "autre" })).toBe(
      "mauvaise_desserte",
    )
  })

  it("refuse un titre périmé", () => {
    expect(
      verifyScope(BILLET, { ...contexte, nowSeconds: BILLET.exp + 1 }),
    ).toBe("expire")
  })

  it("accepte encore un titre à la seconde exacte de son expiration", () => {
    expect(verifyScope(BILLET, { ...contexte, nowSeconds: BILLET.exp })).toBe(
      "valide",
    )
  })

  it("annonce la mauvaise desserte avant l'expiration", () => {
    // Un titre périmé ET pour une autre desserte : le motif le plus
    // explicite pour le voyageur est qu'il n'est pas dans le bon train.
    expect(
      verifyScope(BILLET, {
        tripId: "autre",
        currentStopIndex: 2,
        nowSeconds: BILLET.exp + 1,
      }),
    ).toBe("mauvaise_desserte")
  })
})
