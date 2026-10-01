"use client"

import { Switch } from "@workspace/ui/components/choice"
import { Feuille } from "@workspace/ui/components/feuille"
import { Field, Input } from "@workspace/ui/components/field"

import { Cases } from "@/composants/cases"
import { Note } from "@/coquille/ecran"
import { usePreferences } from "@/hooks/use-preferences"
import { modifierPreferences, type Preferences } from "@/lib/preferences"

/** Résumé d'une ligne des réglages : « Nuit auto. 18:30 → 06:00 · son coupé ». */
export function resumeAffichage(prefs: Preferences): string {
  const theme =
    prefs.theme === "auto"
      ? `Nuit auto. ${prefs.nuitDebut} → ${prefs.nuitFin}`
      : prefs.theme === "sombre"
        ? "Toujours sombre"
        : "Toujours clair"
  return [
    theme,
    prefs.son ? "son activé" : "son coupé",
    prefs.contraste && "contraste renforcé",
    !prefs.ecranAllume && "veille de l'écran autorisée",
  ]
    .filter(Boolean)
    .join(" · ")
}

/**
 * Affichage et son du terminal.
 *
 * Le thème sombre vient seul la nuit (18:30 → 06:00 par défaut, heures
 * réglables) ; l'agent peut le forcer. Le son des verdicts se coupe — des
 * voyageurs dorment. Le contraste renforcé sert en plein soleil, sur le quai.
 * L'écran reste allumé pendant la tournée, sauf si l'agent préfère ménager
 * la batterie. Le viseur, lui, reste toujours sombre.
 */
export function FeuilleAffichage({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const prefs = usePreferences()
  return (
    <Feuille
      open={open}
      onOpenChange={onOpenChange}
      titre="Affichage et son"
      description="Réglages de ce terminal. Le viseur reste toujours sombre."
    >
      <div className="grid gap-4 pb-2">
        <section className="grid gap-2">
          <Switch
            label="Thème de nuit automatique"
            checked={prefs.theme === "auto"}
            onCheckedChange={(auto) =>
              modifierPreferences({ theme: auto ? "auto" : "clair" })
            }
          />
          {prefs.theme === "auto" ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Sombre à partir de" htmlFor="nuit-debut">
                <Input
                  type="time"
                  className="tabular"
                  value={prefs.nuitDebut}
                  onChange={(event) =>
                    event.target.value &&
                    modifierPreferences({ nuitDebut: event.target.value })
                  }
                />
              </Field>
              <Field label="Clair à partir de" htmlFor="nuit-fin">
                <Input
                  type="time"
                  className="tabular"
                  value={prefs.nuitFin}
                  onChange={(event) =>
                    event.target.value &&
                    modifierPreferences({ nuitFin: event.target.value })
                  }
                />
              </Field>
            </div>
          ) : (
            <Cases
              label="Thème"
              options={[
                { valeur: "clair", libelle: "Clair" },
                { valeur: "sombre", libelle: "Sombre" },
              ]}
              valeur={prefs.theme}
              onChange={(theme) => modifierPreferences({ theme })}
            />
          )}
          <Note>
            Heures de Libreville. De nuit, l&apos;écran émet moins de lumière et
            consomme moins.
          </Note>
        </section>

        <section className="grid gap-1">
          <Switch
            label="Son des verdicts"
            checked={prefs.son}
            onCheckedChange={(son) => modifierPreferences({ son })}
          />
          <Note>
            Un bip aigu pour un titre accepté, deux pour « à vérifier », un son
            grave pour un refus, rien pour un code illisible. La vibration
            reste.
          </Note>
        </section>

        <section className="grid gap-1">
          <Switch
            label="Contraste renforcé"
            checked={prefs.contraste}
            onCheckedChange={(contraste) => modifierPreferences({ contraste })}
          />
          <Note>
            Pour le plein soleil : bordures pleines, textes secondaires passés
            en encre.
          </Note>
        </section>

        <section className="grid gap-1">
          <Switch
            label="Garder l'écran allumé pendant le contrôle"
            checked={prefs.ecranAllume}
            onCheckedChange={(ecranAllume) =>
              modifierPreferences({ ecranAllume })
            }
          />
          <Note>
            Pendant la tournée, l&apos;écran ne se met pas en veille entre deux
            voyageurs ; il s&apos;éteint au verrouillage du terminal. Cela use
            davantage la batterie : coupez-le si le terminal doit tenir la
            journée sans recharge.
          </Note>
        </section>
      </div>
    </Feuille>
  )
}
