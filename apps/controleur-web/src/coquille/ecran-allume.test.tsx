import { renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useEcranAllume } from "./ecran-allume"

/** Laisse passer les promesses en attente. */
const attendre = () => new Promise((resolve) => setTimeout(resolve, 0))

/**
 * Le crochet branché sur le vrai `navigator` de jsdom, dont on simule
 * `wakeLock`. Le démontage est ce qui se passe au verrouillage du terminal :
 * la coquille disparaît derrière l'écran de verrouillage.
 */
describe("useEcranAllume", () => {
  const release = vi.fn(async () => undefined)
  const request = vi.fn(async () => ({
    released: false,
    release,
    addEventListener: vi.fn(),
  }))

  beforeEach(() => {
    Object.defineProperty(navigator, "wakeLock", {
      configurable: true,
      value: { request },
    })
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    })
  })

  afterEach(() => {
    Reflect.deleteProperty(navigator, "wakeLock")
    Reflect.deleteProperty(document, "visibilityState")
  })

  it("tient l'écran allumé, puis le rend au verrouillage du terminal", async () => {
    const { unmount } = renderHook(() => useEcranAllume(true))
    await attendre()
    expect(request).toHaveBeenCalledWith("screen")

    unmount()
    expect(release).toHaveBeenCalledOnce()
  })

  it("le rend en quittant la tournée", async () => {
    const { rerender } = renderHook(({ actif }) => useEcranAllume(actif), {
      initialProps: { actif: true },
    })
    await attendre()
    rerender({ actif: false })
    expect(release).toHaveBeenCalledOnce()
  })

  it("ne demande rien hors tournée", async () => {
    renderHook(() => useEcranAllume(false))
    await attendre()
    expect(request).not.toHaveBeenCalled()
  })

  it("ne casse rien sur un navigateur sans l'API", async () => {
    Reflect.deleteProperty(navigator, "wakeLock")
    const { unmount } = renderHook(() => useEcranAllume(true))
    await attendre()
    expect(() => unmount()).not.toThrow()
  })
})
