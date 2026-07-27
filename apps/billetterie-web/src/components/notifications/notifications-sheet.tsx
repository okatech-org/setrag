"use client"

import * as React from "react"
import { X } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import {
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@workspace/ui/mobile/sheet"

import { NotificationsScreen } from "@/components/notifications/notifications-screen"

/**
 * Centre de notifications superposé au contenu courant.
 *
 * Sur mobile il remonte du bas, comme les autres actions contextuelles de
 * l'application. À partir du bureau, la même primitive devient un panneau
 * latéral : les notifications restent consultables sans quitter la page.
 */
export function NotificationsSheet({
  children,
}: {
  children: React.ReactElement
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent
        aria-describedby={undefined}
        className="md:inset-y-0 md:right-0 md:left-auto md:max-h-none md:w-[min(32rem,100vw)] md:rounded-none md:pt-s-5"
      >
        <SheetHeader className="grid-cols-[1fr_auto] items-center">
          <SheetTitle>Notifications</SheetTitle>
          <SheetClose asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Fermer les notifications"
            >
              <X aria-hidden />
            </Button>
          </SheetClose>
        </SheetHeader>
        <SheetBody className="pb-s-5">
          <NotificationsScreen />
        </SheetBody>
      </SheetContent>
    </Sheet>
  )
}
