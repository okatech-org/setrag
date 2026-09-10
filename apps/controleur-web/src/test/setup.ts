import "fake-indexeddb/auto"
import { cleanup } from "@testing-library/react"
import { afterEach, vi } from "vitest"

afterEach(() => {
  cleanup()
  if (typeof window.localStorage?.clear === "function") {
    window.localStorage.clear()
  }
  if (typeof window.sessionStorage?.clear === "function") {
    window.sessionStorage.clear()
  }
  vi.clearAllMocks()
})

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})
