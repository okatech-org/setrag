"use client"

import { useMemo, useSyncExternalStore } from "react"

import type { SaleConfirmationData, TicketSaleDraft } from "@/lib/agent-data"

const DRAFT_KEY = "setrag:agent-web:ticket-sale-draft:v1"
const CONFIRMATION_KEY = "setrag:agent-web:last-confirmation:v1"

export function saveTicketSaleDraft(draft: TicketSaleDraft) {
  window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
}

export function readTicketSaleDraft(): TicketSaleDraft | null {
  if (typeof window === "undefined") return null
  const value = window.sessionStorage.getItem(DRAFT_KEY)
  if (!value) return null
  try {
    return JSON.parse(value) as TicketSaleDraft
  } catch {
    window.sessionStorage.removeItem(DRAFT_KEY)
    return null
  }
}

export function clearTicketSaleDraft() {
  if (typeof window === "undefined") return
  window.sessionStorage.removeItem(DRAFT_KEY)
}

export function saveSaleConfirmation(confirmation: SaleConfirmationData) {
  window.sessionStorage.setItem(CONFIRMATION_KEY, JSON.stringify(confirmation))
}

export function readSaleConfirmation(): SaleConfirmationData | null {
  if (typeof window === "undefined") return null
  const value = window.sessionStorage.getItem(CONFIRMATION_KEY)
  if (!value) return null
  try {
    return JSON.parse(value) as SaleConfirmationData
  } catch {
    window.sessionStorage.removeItem(CONFIRMATION_KEY)
    return null
  }
}

const subscribe = () => () => undefined
const serverSnapshot = () => null

function parseStored<T>(value: string | null): T | null {
  if (!value) return null
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

/** Hydration-safe access to the sale carried between the seller pages. */
export function useStoredTicketSaleDraft() {
  const raw = useSyncExternalStore(
    subscribe,
    () => window.sessionStorage.getItem(DRAFT_KEY),
    serverSnapshot
  )
  return useMemo(() => parseStored<TicketSaleDraft>(raw), [raw])
}

export function useStoredSaleConfirmation() {
  const raw = useSyncExternalStore(
    subscribe,
    () => window.sessionStorage.getItem(CONFIRMATION_KEY),
    serverSnapshot
  )
  return useMemo(() => parseStored<SaleConfirmationData>(raw), [raw])
}
