// @vitest-environment node
import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { beforeAll, describe, expect, it } from "vitest"
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader"
import { encodeAztec, type AztecSymbol } from "./aztecRender"
import { PAYLOAD_VERSION, type TicketPayload } from "../model/barcode"
import { CURRENT_KEY_VERSION, signTicket } from "./signature"

/**
 * Ces tests ferment la boucle : on encode, on rastérise, puis on RELIT le
 * symbole avec un lecteur totalement indépendant — ZXing, celui-là même que
 * fait tourner un terminal de contrôle. Sans cette relecture, on vérifierait
 * seulement que notre code est d'accord avec lui-même.
 *
 * Environnement Node, et non `edge-runtime` : le module WebAssembly de ZXing
 * se charge depuis le disque.
 */

const require = createRequire(import.meta.url)

beforeAll(async () => {
  // Le WASM n'est pas déclaré dans les `exports` du paquet : on remonte
  // depuis le point d'entrée du lecteur jusqu'à le trouver.
  let dossier = dirname(require.resolve("zxing-wasm/reader"))
  let chemin = ""
  for (let i = 0; i < 6 && !chemin; i += 1) {
    const essai = join(dossier, "dist/reader/zxing_reader.wasm")
    if (existsSync(essai)) chemin = essai
    else dossier = dirname(dossier)
  }
  if (!chemin) throw new Error("zxing_reader.wasm introuvable")
  const wasm = await readFile(chemin)
  prepareZXingModule({
    overrides: {
      instantiateWasm(
        imports: WebAssembly.Imports,
        ready: (i: WebAssembly.Instance, m: WebAssembly.Module) => void,
      ) {
        WebAssembly.instantiate(wasm, imports).then((r) =>
          ready(r.instance, r.module),
        )
      },
    },
    fireImmediately: true,
  })
})

/**
 * Rend le symbole en image, marge blanche comprise.
 *
 * La marge n'est pas décorative : la spécification impose une zone de repos
 * autour du symbole, faute de quoi un lecteur peut ne pas en trouver les
 * bords.
 */
function toImage(symbol: AztecSymbol, zoom = 4, quiet = 4) {
  const width = (symbol.columns + 2 * quiet) * zoom
  const height = (symbol.rows + 2 * quiet) * zoom
  const data = new Uint8ClampedArray(width * height * 4).fill(255)

  for (const run of symbol.runs) {
    // La grille est indexée depuis le bas, l'image depuis le haut.
    const top = (symbol.rows - 1 - run.row + quiet) * zoom
    const left = (run.col + quiet) * zoom
    for (let y = top; y < top + zoom; y += 1) {
      for (let x = left; x < left + run.length * zoom; x += 1) {
        const o = (y * width + x) * 4
        data[o] = 0
        data[o + 1] = 0
        data[o + 2] = 0
      }
    }
  }
  return { data, width, height }
}

async function decode(symbol: AztecSymbol): Promise<string[]> {
  const results = await readBarcodes(toImage(symbol), {
    formats: ["Aztec"],
    tryHarder: true,
  })
  return results.map((r) => r.text)
}

const BILLET: TicketPayload = {
  v: PAYLOAD_VERSION,
  k: CURRENT_KEY_VERSION,
  kind: "billet",
  ref: "BIL-2026-000123",
  trip: "j57abc1234567890",
  date: "2026-08-14",
  cls: "PREMIERE",
  from: 0,
  to: 5,
  seat: "12A",
  exp: 1_786_000_000,
}

describe("symbole Aztec", () => {
  it("se relit à l'identique après rastérisation", async () => {
    const texte = signTicket(BILLET).barcode
    expect(await decode(encodeAztec(texte))).toEqual([texte])
  })

  it("reste carré et non vide", () => {
    const symbol = encodeAztec(signTicket(BILLET).barcode)
    expect(symbol.columns).toBe(symbol.rows)
    expect(symbol.runs.length).toBeGreaterThan(0)
    // Un Aztec est à peu près équilibré : ni presque blanc, ni presque noir.
    const encrés = symbol.runs.reduce((n, r) => n + r.length, 0)
    const total = symbol.columns * symbol.rows
    expect(encrés / total).toBeGreaterThan(0.3)
    expect(encrés / total).toBeLessThan(0.7)
  })

  it("supporte l'alphabet Base45 en entier", async () => {
    const texte = "SETRAG1:0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:"
    expect(await decode(encodeAztec(texte))).toEqual([texte])
  })

  it("grandit avec la charge sans jamais devenir illisible", async () => {
    let précédent = 0
    for (const n of [20, 100, 300, 600]) {
      const texte = "SETRAG1:" + "A".repeat(n)
      const symbol = encodeAztec(texte)
      expect(symbol.columns).toBeGreaterThanOrEqual(précédent)
      précédent = symbol.columns
      expect(await decode(symbol)).toEqual([texte])
    }
  })

  it("se relit encore avec des modules abîmés — la correction d'erreur joue", async () => {
    // On efface une bande, comme le ferait un pli ou une tache. À 30 % de
    // correction, le titre doit rester valable.
    const texte = signTicket(BILLET).barcode
    const symbol = encodeAztec(texte)
    const seuil = Math.floor(symbol.rows * 0.06)
    const abîmé: AztecSymbol = {
      ...symbol,
      runs: symbol.runs.filter((r) => r.row >= seuil),
    }
    expect(await decode(abîmé)).toEqual([texte])
  })

  it("refuse un texte impossible à encoder", () => {
    // Au-delà de la capacité maximale d'un Aztec, bwip-js échoue plutôt que
    // de produire un symbole tronqué.
    expect(() => encodeAztec("A".repeat(20_000))).toThrow()
  })
})
