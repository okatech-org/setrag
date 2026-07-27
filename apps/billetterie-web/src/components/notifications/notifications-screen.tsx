"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { Switch } from "@workspace/ui/components/choice"
import { EmptyState, SkeletonLines } from "@workspace/ui/components/empty-state"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { SegmentedControl } from "@workspace/ui/components/segmented-control"
import { Tag } from "@workspace/ui/components/tag"
import { Chip, ChipScroller } from "@workspace/ui/mobile/chip-scroller"

import { useTravelerAuth } from "@/hooks/use-traveler-auth"

type Category = "retard" | "rappel" | "achat" | "remboursement"

const CATEGORIES: Array<{ value: Category; label: string }> = [
  { value: "retard", label: "Retards" },
  { value: "rappel", label: "Rappels" },
  { value: "achat", label: "Achats" },
  { value: "remboursement", label: "Remboursements" },
]

const CATEGORY_TONES: Record<
  Category,
  "warning" | "info" | "success" | "neutral"
> = {
  retard: "warning",
  rappel: "info",
  achat: "success",
  remboursement: "neutral",
}

const VIEWS = [
  { value: "liste", label: "Messages" },
  { value: "preferences", label: "Préférences" },
]

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Africa/Libreville",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
})

/**
 * Centre de notifications.
 *
 * Deux vues sous un même écran : les messages, et leur réglage. La maquette
 * met les préférences derrière l'action de la barre de titre ; un sélecteur
 * rend la bascule visible sans dépendre d'une icône que rien n'explique.
 */
export function NotificationsScreen() {
  const pathname = usePathname()
  const { isAuthenticated, isLoading, isProfileReady } = useTravelerAuth()
  const ready = isAuthenticated && isProfileReady

  const notifications = useQuery(
    api.functions.notificationCenter.list,
    ready ? {} : "skip"
  )
  const preferences = useQuery(
    api.functions.notificationCenter.preferences,
    ready ? {} : "skip"
  )
  const markRead = useMutation(api.functions.notificationCenter.markRead)
  const markAllRead = useMutation(api.functions.notificationCenter.markAllRead)
  const setPreferences = useMutation(
    api.functions.notificationCenter.setPreferences
  )

  const [view, setView] = React.useState("liste")
  const [filter, setFilter] = React.useState<Category | "toutes">("toutes")

  if (isLoading) return <SkeletonLines lines={4} />

  if (!isAuthenticated) {
    return (
      <EmptyState
        title="Connectez-vous pour voir vos notifications"
        description="Les alertes de retard et les reçus sont rattachés à votre compte."
        action={
          <Button asChild>
            <Link href={`/connexion?retour=${encodeURIComponent(pathname)}`}>
              Se connecter
            </Link>
          </Button>
        }
      />
    )
  }

  if (
    !isProfileReady ||
    notifications === undefined ||
    preferences === undefined
  )
    return <SkeletonLines lines={4} />

  const visible =
    filter === "toutes"
      ? notifications
      : notifications.filter((item) => item.category === filter)
  const unread = notifications.filter((item) => item.readAt === undefined)

  async function toggleCategory(category: Category, muted: boolean) {
    if (!preferences) return
    const mutedCategories = muted
      ? [...preferences.mutedCategories, category]
      : preferences.mutedCategories.filter((item) => item !== category)
    await setPreferences({
      pushEnabled: preferences.pushEnabled,
      smsEnabled: preferences.smsEnabled,
      mutedCategories,
    })
  }

  return (
    <div className="grid gap-s-4 *:min-w-0">
      <SegmentedControl
        size="touch"
        label="Vue des notifications"
        options={VIEWS}
        value={view}
        onValueChange={setView}
      />

      {view === "liste" ? (
        <>
          <ChipScroller label="Filtrer par type">
            <Chip
              selected={filter === "toutes"}
              onClick={() => setFilter("toutes")}
            >
              Toutes
            </Chip>
            {CATEGORIES.map((category) => (
              <Chip
                key={category.value}
                selected={filter === category.value}
                onClick={() => setFilter(category.value)}
              >
                {category.label}
              </Chip>
            ))}
          </ChipScroller>

          {unread.length > 0 && (
            <Button
              variant="ghost"
              className="justify-self-start"
              onClick={() => void markAllRead({})}
            >
              Tout marquer comme lu ({unread.length})
            </Button>
          )}

          {visible.length === 0 ? (
            <EmptyState
              title="Aucune notification"
              description={
                filter === "toutes"
                  ? "Les alertes de retard et les reçus d’achat apparaîtront ici."
                  : "Aucun message de ce type pour l’instant."
              }
            />
          ) : (
            <ul className="grid gap-s-2">
              {visible.map((item) => {
                const isUnread = item.readAt === undefined
                return (
                  <li key={item._id}>
                    <button
                      type="button"
                      onClick={() =>
                        isUnread
                          ? void markRead({ notificationId: item._id })
                          : undefined
                      }
                      aria-label={
                        isUnread
                          ? `${item.title} — marquer comme lu`
                          : item.title
                      }
                      className={
                        isUnread
                          ? "grid w-full gap-s-2 rounded-md border-[1.5px] border-accent-line bg-accent-soft p-s-4 text-left"
                          : "grid w-full gap-s-2 rounded-md border border-line bg-surface p-s-4 text-left"
                      }
                    >
                      <span className="flex items-center gap-s-2">
                        {item.category && (
                          <Tag tone={CATEGORY_TONES[item.category as Category]}>
                            {CATEGORIES.find((c) => c.value === item.category)
                              ?.label ?? item.category}
                          </Tag>
                        )}
                        <span className="tabular text-caption ml-auto text-ink-muted">
                          {dateFormatter.format(
                            item.sentAt ?? item._creationTime
                          )}
                        </span>
                      </span>
                      <span className="text-body font-semibold">
                        {item.title}
                      </span>
                      <span className="text-small text-ink-muted">
                        {item.body}
                      </span>
                      {isUnread && (
                        <span className="text-caption font-medium text-accent-ink">
                          Non lu — toucher pour marquer comme lu
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      ) : (
        <>
          <section className="grid gap-s-3 rounded-md border border-line bg-surface p-s-4">
            <h2 className="text-h4">Canaux</h2>
            <Switch
              checked={preferences.pushEnabled}
              onCheckedChange={(checked) =>
                void setPreferences({
                  pushEnabled: checked === true,
                  smsEnabled: preferences.smsEnabled,
                  mutedCategories: preferences.mutedCategories,
                })
              }
              label="Notifications push"
            />
            <Switch
              checked={preferences.smsEnabled}
              onCheckedChange={(checked) =>
                void setPreferences({
                  pushEnabled: preferences.pushEnabled,
                  smsEnabled: checked === true,
                  mutedCategories: preferences.mutedCategories,
                })
              }
              label="SMS"
            />
          </section>

          <section className="grid gap-s-3 rounded-md border border-line bg-surface p-s-4">
            <h2 className="text-h4">Types de message</h2>
            {CATEGORIES.map((category) => (
              <Switch
                key={category.value}
                checked={!preferences.mutedCategories.includes(category.value)}
                onCheckedChange={(checked) =>
                  void toggleCategory(category.value, checked !== true)
                }
                label={category.label}
              />
            ))}
          </section>

          <InlineMessage
            tone="info"
            title="Les alertes de sécurité restent envoyées."
          >
            La suppression d’une desserte et les informations de sûreté vous
            parviennent quels que soient ces réglages.
          </InlineMessage>
        </>
      )}
    </div>
  )
}
