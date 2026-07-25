import { Avatar, AppHeader } from "@workspace/ui"

export const Connecte = () => (
  <AppHeader
    brand={<span className="text-[18px] leading-none font-bold tracking-tight">SETRAG</span>}
    links={[
      { label: "Rechercher", href: "/recherche", active: true },
      { label: "Mes voyages", href: "/mes-billets" },
      { label: "Info trafic", href: "/trafic" },
      { label: "Aide", href: "/aide" },
    ]}
    actions={<Avatar name="Camille Roux" />}
  />
)
