/**
 * Lecture des codes Aztec présentés au contrôle.
 *
 * Deux décodeurs, dans cet ordre :
 *
 *  1. `BarcodeDetector`, natif sur Chrome Android — le terminal de terrain.
 *     Il décode dans le processus du navigateur, sans rien télécharger ;
 *  2. `zxing-wasm`, servi DEPUIS L'APPLICATION et non depuis un CDN. Un
 *     décodeur qui exigerait le réseau serait inutile là où l'on contrôle.
 *
 * Et un troisième recours qui n'est pas un décodeur : la saisie manuelle. Une
 * caméra refusée ou un code déchiré ne doivent jamais bloquer un contrôle.
 */

const AZTEC_FORMATS = ["aztec", "qr_code", "data_matrix", "pdf417"] as const

interface DetectedBarcode {
  rawValue: string
}

interface BarcodeDetectorLike {
  detect: (source: CanvasImageSource | Blob) => Promise<DetectedBarcode[]>
}

type BarcodeDetectorCtor = new (options?: {
  formats?: readonly string[]
}) => BarcodeDetectorLike

declare global {
  interface Window {
    BarcodeDetector?: BarcodeDetectorCtor & {
      getSupportedFormats?: () => Promise<string[]>
    }
  }
}

let nativeDetector: BarcodeDetectorLike | null | undefined
let wasmReady = false

/** Prépare le décodeur natif, s'il existe et connaît l'Aztec. */
async function getNativeDetector(): Promise<BarcodeDetectorLike | null> {
  if (nativeDetector !== undefined) return nativeDetector
  nativeDetector = null
  if (typeof window === "undefined" || !window.BarcodeDetector) {
    return nativeDetector
  }
  try {
    const supported =
      (await window.BarcodeDetector.getSupportedFormats?.()) ?? []
    const formats = AZTEC_FORMATS.filter((f) => supported.includes(f))
    if (formats.length === 0) return nativeDetector
    nativeDetector = new window.BarcodeDetector({ formats })
  } catch {
    nativeDetector = null
  }
  return nativeDetector
}

/**
 * Charge le décodeur WebAssembly depuis l'application.
 *
 * L'import est dynamique : un mégaoctet de WebAssembly n'a pas à peser sur le
 * démarrage d'un terminal qui, la plupart du temps, dispose du décodeur natif.
 */
async function readWithWasm(source: ImageData): Promise<string | null> {
  const { prepareZXingModule, readBarcodes } = await import(
    "zxing-wasm/reader"
  )
  if (!wasmReady) {
    prepareZXingModule({
      overrides: { locateFile: () => "/wasm/zxing_reader.wasm" },
    })
    wasmReady = true
  }
  const results = await readBarcodes(source, {
    formats: ["Aztec", "QRCode", "DataMatrix", "PDF417"],
    tryHarder: true,
    maxNumberOfSymbols: 1,
  })
  return results[0]?.text ?? null
}

/** Décode l'image courante. Rend `null` quand aucun code n'est lisible. */
export async function decodeFrame(
  canvas: HTMLCanvasElement
): Promise<string | null> {
  const native = await getNativeDetector()
  if (native) {
    try {
      const codes = await native.detect(canvas)
      if (codes.length > 0 && codes[0]?.rawValue) return codes[0].rawValue
      return null
    } catch {
      // Le décodeur natif a rendu l'âme en cours de tournée : on bascule sur
      // le décodeur embarqué plutôt que d'interrompre le contrôle.
      nativeDetector = null
    }
  }

  const context = canvas.getContext("2d", { willReadFrequently: true })
  if (!context) return null
  const image = context.getImageData(0, 0, canvas.width, canvas.height)
  try {
    return await readWithWasm(image)
  } catch {
    return null
  }
}

export interface CameraHandle {
  stream: MediaStream
  /** Vrai si le terminal sait piloter la lampe de la caméra. */
  torchAvailable: boolean
  setTorch: (on: boolean) => Promise<void>
  stop: () => void
}

/** Ce que l'agent doit faire, et non ce que le navigateur a répondu. */
export interface CameraFailure {
  /** Ce qui s'est passé, en une phrase. */
  message: string
  /** Ce qu'il reste à tenter — vide quand plus rien n'est possible. */
  remedy: string
  /** Vrai si redemander l'autorisation a une chance d'aboutir. */
  retryable: boolean
}

/**
 * Traduction d'un refus de caméra.
 *
 * Le navigateur répond « Permission denied » ; un contrôleur, lui, a besoin de
 * savoir s'il doit toucher un réglage, changer de terminal, ou simplement
 * passer à la saisie manuelle. Le nom de l'erreur est stable d'un navigateur
 * à l'autre, contrairement à son message — c'est donc lui qu'on lit.
 */
export function describeCameraFailure(error: unknown): CameraFailure {
  const name = error instanceof Error ? error.name : ""
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return {
        message: "L'accès à la caméra a été refusé.",
        remedy:
          "Autorisez la caméra pour ce site dans les réglages du navigateur, puis réessayez.",
        // Un refus définitif ne se rouvre que par les réglages, mais un refus
        // par inadvertance se rattrape : on laisse la porte ouverte.
        retryable: true,
      }
    case "NotFoundError":
    case "OverconstrainedError":
      return {
        message: "Aucune caméra utilisable sur ce terminal.",
        remedy: "Le contrôle se poursuit par saisie du code ou par recherche.",
        retryable: false,
      }
    case "NotReadableError":
      return {
        message: "La caméra est déjà utilisée par une autre application.",
        remedy: "Fermez l'application qui l'occupe, puis réessayez.",
        retryable: true,
      }
    default:
      return {
        message: "La caméra n'a pas pu être ouverte.",
        remedy: "Réessayez, ou poursuivez par saisie du code.",
        retryable: true,
      }
  }
}

/**
 * Ouvre la caméra arrière.
 *
 * La caméra arrière est demandée explicitement : sur un terminal à deux
 * capteurs, la caméra frontale filmerait le contrôleur.
 */
export async function openCamera(): Promise<CameraHandle> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices) {
    // Même forme que les erreurs du navigateur, pour que la traduction
    // ci-dessus reste le seul endroit qui décide du message affiché.
    const absente = new Error("Caméra absente de ce terminal")
    absente.name = "NotFoundError"
    throw absente
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: false,
  })
  const [track] = stream.getVideoTracks()
  // `torch` ne figure pas dans les types standard : c'est une extension que
  // seuls les navigateurs mobiles exposent, et c'est précisément le terminal
  // visé — une voiture de nuit n'a pas d'autre éclairage.
  const capabilities = track?.getCapabilities?.() as
    | (MediaTrackCapabilities & { torch?: boolean })
    | undefined

  return {
    stream,
    torchAvailable: Boolean(capabilities?.torch),
    setTorch: async (on: boolean) => {
      if (!track) return
      await track.applyConstraints({
        advanced: [{ torch: on } as unknown as MediaTrackConstraintSet],
      })
    },
    stop: () => {
      for (const t of stream.getTracks()) t.stop()
    },
  }
}
