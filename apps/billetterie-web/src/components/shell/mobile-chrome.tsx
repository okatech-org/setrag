"use client"

import * as React from "react"
import { usePathname } from "next/navigation"

import {
  type MobileChrome,
  mobileChromeForPath,
} from "@/components/shell/navigation"

interface Override {
  title?: string
  subtitle?: string
}

/** La surcharge retient la route qui l'a posée — voir `MobileChromeProvider`. */
type ScopedOverride = Override & { pathname: string }

const OverrideContext = React.createContext<
  ((override: ScopedOverride | null) => void) | null
>(null)
const ChromeContext = React.createContext<MobileChrome & Override>({
  variant: "hero",
})

/**
 * Chrome mobile — barre de titre et barre d'onglets.
 *
 * La route suffit à décider de la forme de l'écran ; seul le libellé peut
 * dépendre des données (« Billet B-4821 »), et la page le fournit alors par
 * `useMobileAppBar`.
 */
export function MobileChromeProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [override, setOverride] = React.useState<ScopedOverride | null>(null)

  const chrome = React.useMemo(() => {
    // La surcharge appartient à l'écran qui l'a posée. Plutôt que de la
    // réinitialiser dans un effet au changement de route — ce qui provoquerait
    // un rendu en cascade — on l'ignore dès qu'elle ne porte plus sur la route
    // courante : le titre du billet précédent ne survit pas à sa fermeture.
    const { pathname: from, ...values } = override ?? {}
    return {
      ...mobileChromeForPath(pathname),
      ...(from === pathname ? values : {}),
    }
  }, [pathname, override])

  return (
    <OverrideContext.Provider value={setOverride}>
      <ChromeContext.Provider value={chrome}>{children}</ChromeContext.Provider>
    </OverrideContext.Provider>
  )
}

export function useMobileChrome() {
  return React.useContext(ChromeContext)
}

/**
 * Renomme la barre de titre de l'écran courant.
 *
 * À appeler depuis le composant qui porte l'état de la page, jamais depuis une
 * de ses deux vues : celles-ci sont montées toutes les deux et se
 * disputeraient la surcharge.
 */
export function useMobileAppBar({ title, subtitle }: Override) {
  const setOverride = React.useContext(OverrideContext)
  const pathname = usePathname()

  React.useEffect(() => {
    if (!setOverride) return
    setOverride({ pathname, title, subtitle })
    return () => setOverride(null)
  }, [setOverride, pathname, title, subtitle])
}
