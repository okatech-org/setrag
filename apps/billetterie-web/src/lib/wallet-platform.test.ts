import { describe, expect, it } from "vitest"

import { detectWalletPlatform, providersForPlatform } from "./wallet-platform"

describe("wallet-platform", () => {
  it("propose uniquement Apple Wallet sur iPhone", () => {
    expect(
      detectWalletPlatform(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)"
      )
    ).toBe("ios")
    expect(providersForPlatform("ios")).toEqual(["apple"])
  })

  it("propose uniquement Google Wallet sur Android", () => {
    expect(
      detectWalletPlatform("Mozilla/5.0 (Linux; Android 15; Pixel 9)")
    ).toBe("android")
    expect(providersForPlatform("android")).toEqual(["google"])
  })

  it("laisse le choix sur ordinateur", () => {
    expect(detectWalletPlatform("Mozilla/5.0 (X11; Linux x86_64)")).toBe(
      "desktop"
    )
    expect(providersForPlatform("desktop")).toEqual(["apple", "google"])
  })
})
