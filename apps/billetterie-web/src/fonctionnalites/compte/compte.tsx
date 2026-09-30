"use client"

import {
  BadgePercentIcon,
  BellIcon,
  BellRingIcon,
  ChevronRightIcon,
  CircleHelpIcon,
  FileTextIcon,
  LuggageIcon,
  PaletteIcon,
  MessageCircleIcon,
  NotebookPenIcon,
  ShieldCheckIcon,
  UsersIcon,
} from "lucide-react"
import Link from "next/link"

import { useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Avatar } from "@workspace/ui/components/avatar"
import { SkeletonLines } from "@workspace/ui/components/empty-state"
import { Skeleton } from "@workspace/ui/components/skeleton"

import { BarreApp, GrandTitre } from "@/coquille/barre-app"
import { nomAffiche } from "@/coquille/compte-rapide"
import {
  ecritureNationale,
  emailTechnique,
} from "@/fonctionnalites/connexion/identifiant"
import { useOnline } from "@/hooks/use-online"
import { useTravelerAuth } from "@/hooks/use-traveler-auth"
import { voyageurMoi } from "@/lib/titulaire"

import { LigneDeconnexion } from "./deconnexion"
import {
  CompteSupprime,
  HorsReseau,
  InvitationConnexion,
  Ligne,
  Section,
  type ProfilVoyageur,
} from "./elements"
import { LigneAffichage } from "./theme"

/** Le moyen de joindre le voyageur, tel qu'il l'a donné : téléphone d'abord. */
export function contactPrincipal(user: ProfilVoyageur["user"]) {
  if (user.phone) return { texte: ecritureNationale(user.phone), mono: true }
  if (user.email && !emailTechnique(user.email))
    return { texte: user.email, mono: false }
  return null
}

function CarteProfil({ profil }: { profil: ProfilVoyageur }) {
  const { user } = profil
  const nomee = Boolean(user.firstName?.trim() || user.lastName?.trim())
  const nom = nomAffiche(user)
  const contact = contactPrincipal(user)
  return (
    <Link
      href="/compte/profil"
      aria-label={`Profil — ${nom}`}
      className="flex min-h-[84px] items-center gap-3 rounded-md border border-line bg-surface p-4 transition-colors duration-[var(--dur-fast)] hover:bg-surface-sunk"
    >
      <Avatar name={nom} size="lg" className="size-[52px] text-[17px]" />
      <span className="grid min-w-0 flex-1 gap-0.5">
        <b className="truncate text-[17px] font-bold">{nom}</b>
        {nomee ? (
          contact && (
            <span
              className={
                contact.mono
                  ? "tabular truncate text-[13px] text-ink-muted"
                  : "truncate text-[13px] font-medium text-ink-muted"
              }
            >
              {contact.texte}
            </span>
          )
        ) : (
          <span className="text-[13px] font-medium text-accent-ink">
            Ajoutez votre nom : il figure sur vos billets
          </span>
        )}
      </span>
      <ChevronRightIcon
        className="size-5 shrink-0 text-ink-faint"
        aria-hidden
      />
    </Link>
  )
}

function EspaceConnecte({ profil }: { profil: ProfilVoyageur }) {
  const nonLues = useQuery(api.functions.notificationCenter.unreadCount, {})
  const voyageurs = useQuery(api.functions.customers.listSavedPassengers, {})
  const notes = useQuery(api.ai.memory.listMine, {})
  // « Vous » compte parmi les voyageurs : le titulaire en est le premier.
  const nombreVoyageurs =
    voyageurs === undefined
      ? undefined
      : voyageurs.length + (voyageurMoi(profil.user) ? 1 : 0)
  return (
    <>
      <CarteProfil profil={profil} />
      <Section>
        <Ligne
          icone={UsersIcon}
          libelle="Voyageurs enregistrés"
          fin={nombreVoyageurs || undefined}
          href="/compte/voyageurs"
        />
        <Ligne
          icone={BellIcon}
          libelle="Notifications"
          fin={
            nonLues ? `${nonLues} non lue${nonLues > 1 ? "s" : ""}` : undefined
          }
          href="/notifications"
        />
      </Section>
      <Section titre="Réglages">
        <Ligne
          icone={BellRingIcon}
          libelle="Alertes et notifications"
          detail="Où et pour quoi vous prévenir"
          href="/compte/preferences"
        />
        <LigneAffichage />
        <Ligne
          icone={NotebookPenIcon}
          libelle="Ce que Ruban retient"
          detail="Vos préférences et habitudes de voyage"
          fin={notes?.length || undefined}
          href="/compte/ruban"
        />
        <Ligne
          icone={MessageCircleIcon}
          libelle="Messageries reliées"
          detail="Ruban sur Telegram, WhatsApp…"
          href="/compte/messageries"
        />
        <Ligne
          icone={ShieldCheckIcon}
          libelle="Mes données et consentements"
          detail="Accords, export, suppression du compte"
          href="/compte/donnees"
        />
      </Section>
    </>
  )
}

function Informations() {
  return (
    <Section titre="Informations">
      <Ligne icone={CircleHelpIcon} libelle="Aide" href="/aide" />
      <Ligne
        icone={BadgePercentIcon}
        libelle="Tarifs et réductions"
        href="/tarifs"
      />
      <Ligne icone={LuggageIcon} libelle="Bagages et colis" href="/bagages" />
      <Ligne
        icone={FileTextIcon}
        libelle="Conditions générales"
        href="/conditions"
      />
      <Ligne icone={PaletteIcon} libelle="Charte graphique" href="/charte" />
    </Section>
  )
}

/**
 * L'onglet « Compte ». Connecté : le profil, puis les réglages en listes,
 * comme dans une app. Sinon : une invitation à se connecter, et ce qui reste
 * utile sans compte — l'affichage et les informations.
 */
export function Compte() {
  const { isLoading, isAuthenticated, isProfileReady, profile } =
    useTravelerAuth()
  const enLigne = useOnline()

  let principal: React.ReactNode
  if (isLoading) {
    principal = (
      <>
        <Skeleton className="h-[86px] rounded-md" />
        <SkeletonLines />
      </>
    )
  } else if (!isAuthenticated) {
    principal = (
      <>
        {enLigne ? (
          <InvitationConnexion titre="Connectez-vous pour retrouver vos billets">
            Les billets achetés connecté vous suivent d&apos;un appareil à
            l&apos;autre, et vos voyageurs habituels restent enregistrés.
          </InvitationConnexion>
        ) : (
          <HorsReseau />
        )}
        <Section titre="Réglages">
          <LigneAffichage />
        </Section>
      </>
    )
  } else if (profile && !profile.user.isActive) {
    principal = <CompteSupprime />
  } else if (!isProfileReady || !profile) {
    principal = <Skeleton className="h-[86px] rounded-md" />
  } else {
    principal = <EspaceConnecte profil={profile} />
  }

  return (
    <>
      <BarreApp logo />
      <div className="mx-auto w-full max-w-[1240px] px-4 pt-2 pb-8 md:px-8 md:pt-10 md:pb-16">
        <GrandTitre className="mb-5 md:mb-8">
          <span className="md:hidden">Compte</span>
          <span className="hidden md:inline">Mon compte</span>
        </GrandTitre>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 md:grid-cols-2 md:items-start md:gap-8">
          <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
            {principal}
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
            <Informations />
            {isAuthenticated && profile?.user.isActive && (
              <Section>
                <LigneDeconnexion />
              </Section>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
