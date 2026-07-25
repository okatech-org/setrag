import { Checkbox, FilterGroup, RangeFilter, SegmentedControl } from "@workspace/ui"

export const PanneauDeFiltres = () => (
  <div style={{ display: "grid", gap: 24, maxWidth: 260 }}>
    <FilterGroup label="Horaire de départ">
      <SegmentedControl
        label="Horaire de départ"
        value="matin"
        options={[
          { value: "matin", label: "Matin" },
          { value: "midi", label: "Midi" },
          { value: "soir", label: "Soir" },
        ]}
      />
    </FilterGroup>

    <FilterGroup label="Confort">
      <Checkbox label="Direct" defaultChecked />
      <Checkbox label="Prise électrique" />
      <Checkbox label="Espace bagages" />
    </FilterGroup>

    <FilterGroup label="Prix max">
      <RangeFilter
        defaultValue={[40500]}
        min={18000}
        max={54000}
        step={1500}
        valueLabel="jusqu'à 40 500 FCFA"
      />
    </FilterGroup>
  </div>
)
