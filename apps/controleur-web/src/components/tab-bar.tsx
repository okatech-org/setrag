"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { AlertTriangle, Home, ListOrdered, ScanLine } from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"

import { useTerminal } from "./terminal-provider"

/**
 * Barre d'onglets basse.
 *
 * Quatre destinations, pas une de plus : elles se prennent au pouce, d'une
 * main, dans une voiture en mouvement. Chaque cible fait au moins 56 px de
 * haut — au-dessus du plancher de 44 px du design system, parce qu'ici on
 * vise en marchant.
 */
const TABS = [
  { href: "/tournee", label: "Accueil", icon: Home },
  { href: "/scan", label: "Scan", icon: ScanLine },
  { href: "/historique", label: "Historique", icon: ListOrdered, badge: true },
  { href: "/incident", label: "Incident", icon: AlertTriangle },
] as const

export function TabBar() {
  const pathname = usePathname()
  const { queue } = useTerminal()

  return (
    <nav
      aria-label="Navigation principale"
      className="safe-bottom sticky bottom-0 z-20 border-t border-line bg-surface"
    >
      <ul className="flex">
        {TABS.map(({ href, label, icon: Icon, ...rest }) => {
          const active =
            pathname === href || pathname.startsWith(`${href}/`)
          const badge = "badge" in rest && rest.badge ? queue.total : 0
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex min-h-14 flex-col items-center justify-center gap-1 py-2 text-[12px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-accent",
                  active ? "text-accent-ink" : "text-ink-muted"
                )}
              >
                <Icon aria-hidden className="size-[22px]" />
                {label}
                {badge > 0 && (
                  <span
                    className="absolute top-1 right-[22%] min-w-5 rounded-pill bg-danger px-1.5 text-[11px] leading-5 font-semibold text-ink-inverse tabular"
                    aria-label={`${badge} écritures en attente d'envoi`}
                  >
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
