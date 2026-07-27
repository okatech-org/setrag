"use client"

import { useTheme } from "next-themes"

import { Field, SelectNative } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { SegmentedControl } from "@workspace/ui/components/segmented-control"

const THEMES = [
  { value: "system", label: "Système" },
  { value: "light", label: "Clair" },
  { value: "dark", label: "Sombre" },
]

/**
 * Affichage et langue.
 *
 * Ces réglages ne sont pas synchronisés : le thème vit dans le stockage local
 * du navigateur, et le backend n'a pas de préférence d'affichage. Changer
 * d'appareil repart donc du réglage système, ce que l'écran annonce plutôt que
 * de le laisser découvrir.
 */
export function DisplayScreen() {
  const { theme, setTheme } = useTheme()

  return (
    <div className="grid gap-s-4 *:min-w-0">
      <section className="grid gap-s-3 rounded-md border border-line bg-surface p-s-4">
        <h2 className="text-h4">Thème</h2>
        <SegmentedControl
          size="touch"
          label="Thème de l’interface"
          options={THEMES}
          value={theme ?? "system"}
          onValueChange={setTheme}
        />
        <p className="text-caption text-ink-muted">
          « Système » suit le réglage clair ou sombre de votre téléphone.
        </p>
      </section>

      <section className="grid gap-s-3 rounded-md border border-line bg-surface p-s-4">
        <h2 className="text-h4">Langue</h2>
        <Field label="Langue de l’interface" htmlFor="display-language">
          <SelectNative id="display-language" value="fr" disabled>
            <option value="fr">Français</option>
          </SelectNative>
        </Field>
        <p className="text-caption text-ink-muted">
          L’interface n’est disponible qu’en français pour l’instant.
        </p>
      </section>

      <InlineMessage tone="info" title="Réglages propres à cet appareil.">
        Ils ne suivent pas votre compte : un autre téléphone repartira du
        réglage de son système.
      </InlineMessage>
    </div>
  )
}
