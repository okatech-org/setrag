import { SearchSlot } from "@workspace/ui"

export const Champs = () => (
  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", maxWidth: 640 }}>
    <SearchSlot label="Départ" className="flex-[1_1_180px]">
      <span className="flex h-14 items-center overflow-hidden rounded-md border border-line-strong px-4 text-[16px] font-medium">
        Owendo (toutes gares)
      </span>
    </SearchSlot>
    <SearchSlot label="Arrivée" className="flex-[1_1_180px]">
      <span className="flex h-14 items-center overflow-hidden rounded-md border border-line-strong px-4 text-[16px] font-medium">
        Franceville
      </span>
    </SearchSlot>
  </div>
)
