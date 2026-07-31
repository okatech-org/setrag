import "@testing-library/jest-dom/vitest"
// La base locale des billets s'ouvre dès qu'un écran hors ligne est monté :
// sans implantation d'IndexedDB, jsdom la refuse et le test échoue sur un
// détail sans rapport avec ce qu'il vérifie.
import "fake-indexeddb/auto"
import { afterEach, vi } from "vitest"
import { cleanup } from "@testing-library/react"

process.env.NEXT_PUBLIC_E2E_MODE = "1"

afterEach(() => {
  cleanup()
  window.sessionStorage.clear()
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

Object.defineProperty(window, "open", {
  writable: true,
  value: vi.fn(),
})
