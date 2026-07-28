export type WalletPlatform = "ios" | "android" | "desktop"
export type WalletProvider = "apple" | "google"

export function detectWalletPlatform(userAgent: string): WalletPlatform {
  if (/Android/i.test(userAgent)) return "android"
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "ios"

  // Depuis iPadOS 13, Safari peut annoncer un Mac. La présence du tactile
  // permet de distinguer l'iPad d'un vrai ordinateur Apple.
  if (
    /Macintosh/i.test(userAgent) &&
    typeof navigator !== "undefined" &&
    navigator.maxTouchPoints > 1
  ) {
    return "ios"
  }
  return "desktop"
}

export function providersForPlatform(
  platform: WalletPlatform
): WalletProvider[] {
  if (platform === "ios") return ["apple"]
  if (platform === "android") return ["google"]
  return ["apple", "google"]
}
