"use client"

import * as React from "react"
import { Apple, WalletCards } from "lucide-react"

import { Button } from "@workspace/ui/components/button"

import {
  detectWalletPlatform,
  providersForPlatform,
  type WalletProvider,
} from "@/lib/wallet-platform"

export function TicketWalletButtons({
  ticketNumber,
  disabled,
  loading,
  onAdd,
  compact = false,
}: {
  ticketNumber: string
  disabled: boolean
  loading: boolean
  onAdd: (provider: WalletProvider) => void
  compact?: boolean
}) {
  const [platform, setPlatform] =
    React.useState<ReturnType<typeof detectWalletPlatform>>("desktop")

  React.useEffect(() => {
    setPlatform(detectWalletPlatform(navigator.userAgent))
  }, [])

  return (
    <div
      className={
        compact ? "grid gap-s-2" : "flex flex-wrap items-center gap-s-2"
      }
      aria-label={`Wallet du billet ${ticketNumber}`}
    >
      {providersForPlatform(platform).map((provider) => (
        <Button
          key={provider}
          type="button"
          size="sm"
          block={compact}
          variant={provider === "apple" ? "primary" : "secondary"}
          className={
            provider === "apple"
              ? "bg-black text-white hover:bg-black/90"
              : undefined
          }
          disabled={disabled}
          onClick={() => onAdd(provider)}
        >
          {provider === "apple" ? <Apple /> : <WalletCards />}
          {loading
            ? "Préparation…"
            : provider === "apple"
              ? "Ajouter à Apple Wallet"
              : "Ajouter à Google Wallet"}
        </Button>
      ))}
    </div>
  )
}
