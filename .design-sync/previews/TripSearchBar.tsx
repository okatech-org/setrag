import { Tag, TripSearchBar } from "@workspace/ui"

const Valeur = ({ children }: { children: React.ReactNode }) => (
  <span className="flex h-14 items-center overflow-hidden rounded-md border border-line-strong px-4 text-[16px] leading-tight font-medium text-ellipsis whitespace-nowrap">
    {children}
  </span>
)

export const Complete = () => (
  <TripSearchBar
    onSwap={() => {}}
    onSubmit={() => {}}
    origin={<Valeur>Owendo (toutes gares)</Valeur>}
    destination={<Valeur>Franceville</Valeur>}
    dates={
      <span className="flex h-14 items-center gap-2 overflow-hidden rounded-md border border-line-strong px-4">
        <span className="tabular text-[15px] leading-none font-medium">ven. 07/08</span>
        <span className="text-[15px] leading-none text-ink-faint">→</span>
        <span className="tabular text-[15px] leading-none font-medium">dim. 09/08</span>
      </span>
    }
    passengers={<Valeur>2 adultes, 1 enfant</Valeur>}
    shortcuts={
      <>
        <Tag tone="neutral">Carte Jeune</Tag>
        <Tag tone="neutral">+ Ajouter une carte</Tag>
      </>
    }
  />
)

export const AllerSimple = () => (
  <TripSearchBar
    kind="aller_simple"
    onSubmit={() => {}}
    origin={<Valeur>Franceville</Valeur>}
    destination={<Valeur>Owendo</Valeur>}
    dates={<span className="flex h-14 items-center rounded-md border border-line-strong px-4"><span className="tabular text-[15px] font-medium">dim. 09/08</span></span>}
    passengers={<Valeur>1 adulte</Valeur>}
  />
)
