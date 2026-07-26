import { describe, expect, it } from "vitest"
import {
  BARCODE_PREFIX,
  PAYLOAD_VERSION,
  encodeBase45,
  decodeBase45,
  serializePayload,
  type TicketPayload,
} from "../model/barcode"
import {
  CURRENT_KEY_VERSION,
  bytesToHex,
  hexToBytes,
  isUsingDemoKey,
  publicKeyHex,
  signTicket,
  verifyBarcode,
} from "./signature"

const BILLET: TicketPayload = {
  v: PAYLOAD_VERSION,
  k: CURRENT_KEY_VERSION,
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

describe("hexadécimal", () => {
  it("fait l'aller-retour", () => {
    const bytes = new Uint8Array([0x00, 0x0f, 0x7f, 0x80, 0xff])
    expect(bytesToHex(bytes)).toBe("000f7f80ff")
    expect([...hexToBytes("000f7f80ff")]).toEqual([...bytes])
  })
})

describe("clé de signature", () => {
  it("signale que la démonstration tourne sur la clé du dépôt", () => {
    // Aucune variable d'environnement n'est posée pendant les tests : c'est
    // exactement la situation d'un déploiement de démonstration.
    expect(isUsingDemoKey()).toBe(true)
  })

  it("dérive une clé publique de 32 octets, stable d'un appel à l'autre", () => {
    const a = publicKeyHex()
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(publicKeyHex()).toBe(a)
  })

  it("dérive la clé publique du vecteur RFC 8032", () => {
    // La clé de démonstration est celle du TEST 1 de la RFC 8032, §7.1 ;
    // sa clé publique y est spécifiée.
    expect(publicKeyHex()).toBe(
      "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a",
    )
  })

  it("refuse une clé mal formée", () => {
    const precedente = process.env.BARCODE_SIGNING_KEY_V1
    process.env.BARCODE_SIGNING_KEY_V1 = "pas-une-clé"
    try {
      expect(() => publicKeyHex()).toThrow(/64 caractères hexadécimaux/)
      expect(isUsingDemoKey()).toBe(false)
    } finally {
      if (precedente === undefined) delete process.env.BARCODE_SIGNING_KEY_V1
      else process.env.BARCODE_SIGNING_KEY_V1 = precedente
    }
  })
})

describe("signature d'un titre", () => {
  it("produit un code-barres vérifiable", () => {
    const { barcode, signatureHex, keyVersion } = signTicket(BILLET)
    expect(barcode.startsWith(BARCODE_PREFIX)).toBe(true)
    expect(signatureHex).toMatch(/^[0-9a-f]{128}$/)
    expect(keyVersion).toBe(CURRENT_KEY_VERSION)

    const verdict = verifyBarcode(barcode)
    expect(verdict.authentic).toBe(true)
    expect(verdict.error).toBeNull()
    expect(verdict.payload).toEqual(BILLET)
  })

  it("est déterministe : rejouer la mutation redonne le même code", () => {
    expect(signTicket(BILLET).barcode).toBe(signTicket(BILLET).barcode)
  })

  it("distingue deux titres qui ne diffèrent que par un champ", () => {
    const a = signTicket(BILLET).barcode
    const b = signTicket({ ...BILLET, seat: "12B" }).barcode
    expect(a).not.toBe(b)
  })

  it("tient dans un symbole Aztec de taille imprimable", () => {
    // Un Aztec pleine taille accepte plus de 2 000 caractères
    // alphanumériques ; la contrainte réelle est la lisibilité du symbole
    // imprimé sur un billet. Autour de 300 caractères, le symbole reste dans
    // les premières couches et se scanne sans zoom. Ce seuil garde la marge
    // et signalerait toute charge utile qui enflerait par mégarde.
    expect(signTicket(BILLET).barcode.length).toBeLessThan(400)
  })
})

describe("détection de la falsification", () => {
  it("rejette une charge utile modifiée après signature", () => {
    // On resigne un titre légitime, puis on greffe la signature valide sur
    // une charge utile différente : c'est la fraude que la signature doit
    // rendre impossible.
    const legitime = signTicket(BILLET)
    const brut = decodeBase45(legitime.barcode.slice(BARCODE_PREFIX.length))
    const signature = brut.subarray(brut.length - 64)

    const falsifie = serializePayload({ ...BILLET, cls: "vip" })
    const joint = new Uint8Array(falsifie.length + 64)
    joint.set(falsifie, 0)
    joint.set(signature, falsifie.length)

    const verdict = verifyBarcode(BARCODE_PREFIX + encodeBase45(joint))
    expect(verdict.authentic).toBe(false)
    expect(verdict.payload).toBeNull()
    expect(verdict.error).toBe("Signature non valide")
  })

  it("rejette une signature altérée d'un seul bit", () => {
    const brut = decodeBase45(
      signTicket(BILLET).barcode.slice(BARCODE_PREFIX.length),
    )
    brut[brut.length - 1] ^= 0x01
    const verdict = verifyBarcode(BARCODE_PREFIX + encodeBase45(brut))
    expect(verdict.authentic).toBe(false)
  })

  it("rejette un titre signé par une autre clé", () => {
    const { barcode } = signTicket(BILLET)
    const autreClePublique = hexToBytes(
      "3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c",
    )
    expect(verifyBarcode(barcode, autreClePublique).authentic).toBe(false)
  })

  it("distingue une clé retirée du service d'une contrefaçon", () => {
    // Un titre signé sous une version de clé antérieure reste parfaitement
    // authentique : il n'est simplement plus vérifiable avec la clé du jour.
    // Le confondre avec un faux ferait passer toute une rotation pour une
    // fraude de masse.
    const ancien = signTicket({ ...BILLET, k: CURRENT_KEY_VERSION + 1 })
    const verdict = verifyBarcode(ancien.barcode)
    expect(verdict.authentic).toBe(false)
    expect(verdict.error).toMatch(/hors service/)
  })

  it("vérifie tout de même si la clé publique lui est fournie", () => {
    // C'est ainsi qu'un terminal porteur des anciennes clés continue de
    // contrôler les titres émis avant la rotation.
    const ancien = signTicket({ ...BILLET, k: CURRENT_KEY_VERSION + 1 })
    const publique = hexToBytes(publicKeyHex())
    expect(verifyBarcode(ancien.barcode, publique).authentic).toBe(true)
  })

  it("rejette un code étranger sans planter", () => {
    const verdict = verifyBarcode("HC1:NCFOXN%TS3DH")
    expect(verdict.authentic).toBe(false)
    expect(verdict.error).toMatch(/étranger/)
  })

  it("rejette une chaîne vide", () => {
    expect(verifyBarcode("").authentic).toBe(false)
  })

  it("rejette un code dont l'encodage Base45 est corrompu", () => {
    const verdict = verifyBarcode(`${BARCODE_PREFIX}!!!`)
    expect(verdict.authentic).toBe(false)
    expect(verdict.error).toMatch(/Base45/)
  })
})
