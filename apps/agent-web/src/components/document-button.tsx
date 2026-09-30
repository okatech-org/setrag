"use client"

import { Loader2 } from "lucide-react"
import { useState, type ComponentProps, type ReactNode } from "react"
import { toast } from "sonner"

import { authClient } from "@workspace/api/auth-client"
import { Button } from "@workspace/ui/components/button"

/**
 * Télécharge une étude derrière la route `/documents/[name]`.
 *
 * Un lien `<a href>` ne conviendrait pas : la route exige le jeton Convex en
 * en-tête, que seul un `fetch` peut porter. Le fichier obtenu est remis au
 * navigateur par un lien objet éphémère.
 */
async function downloadDocument(file: string) {
  const { data } = await authClient.convex.token({
    fetchOptions: { throw: false },
  })
  if (!data?.token) {
    throw new Error("Votre session a expiré, reconnectez-vous.")
  }
  const response = await fetch(`/documents/${file}`, {
    headers: { Authorization: `Bearer ${data.token}` },
  })
  if (!response.ok) {
    throw new Error(
      response.status === 403
        ? "Ce document est réservé au personnel SETRAG."
        : "Le document n’a pas pu être récupéré."
    )
  }
  const url = URL.createObjectURL(await response.blob())
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = file
  anchor.rel = "noopener"
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function DocumentButton({
  file,
  children,
  ...props
}: Omit<ComponentProps<typeof Button>, "onClick" | "type" | "asChild"> & {
  file: string
  children: ReactNode
}) {
  const [pending, setPending] = useState(false)

  const handleClick = async () => {
    setPending(true)
    try {
      await downloadDocument(file)
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Téléchargement impossible."
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <Button
      type="button"
      {...props}
      disabled={pending || props.disabled}
      aria-busy={pending}
      onClick={() => void handleClick()}
    >
      {pending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
      {children}
    </Button>
  )
}
