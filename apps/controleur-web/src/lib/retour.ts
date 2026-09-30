/**
 * Retour physique d'un verdict : vibration et son.
 *
 * Le son est un réglage du terminal (`preferences.son`) : de nuit, des
 * voyageurs dorment, et un bip à chaque contrôle les réveillerait. La
 * vibration, elle, ne dérange que l'agent.
 *
 * Les sons sont synthétisés (Web Audio), pas des fichiers : rien à
 * télécharger, rien à précacher, et ils sont disponibles hors réseau.
 */

import { RETOUR_PHYSIQUE, type Famille } from "./verdicts"

let contexte: AudioContext | null = null

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  contexte ??= new Ctor()
  return contexte
}

/**
 * Déverrouille le son. Un navigateur ne joue un son qu'après un geste de
 * l'utilisateur : on l'appelle au premier toucher, bien avant le premier
 * verdict, qui arrive, lui, sans geste (lecture de la caméra).
 */
export function debloquerSon(): void {
  const ctx = audio()
  if (ctx && ctx.state === "suspended") void ctx.resume().catch(() => {})
}

function jouer(famille: Famille): void {
  const ctx = audio()
  if (!ctx) return
  let debut = ctx.currentTime + 0.01
  for (const note of RETOUR_PHYSIQUE[famille].notes) {
    const oscillateur = ctx.createOscillator()
    const volume = ctx.createGain()
    oscillateur.type = "sine"
    oscillateur.frequency.value = note.frequence
    const fin = debut + note.duree / 1000
    // Attaque et extinction courtes : un bip sans clic.
    volume.gain.setValueAtTime(0.0001, debut)
    volume.gain.exponentialRampToValueAtTime(0.35, debut + 0.012)
    volume.gain.exponentialRampToValueAtTime(0.0001, fin)
    oscillateur.connect(volume).connect(ctx.destination)
    oscillateur.start(debut)
    oscillateur.stop(fin + 0.02)
    debut = fin + (note.pause ?? 0) / 1000
  }
}

/** Vibration et son d'un verdict, selon sa famille et le réglage du son. */
export function retourDuVerdict(famille: Famille, options: { son: boolean }): void {
  const { vibration } = RETOUR_PHYSIQUE[famille]
  if (vibration && typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(vibration)
  }
  if (options.son) {
    try {
      jouer(famille)
    } catch {
      // Un terminal sans sortie audio ne doit pas interrompre le contrôle.
    }
  }
}
