import type { Metadata } from "next"
import Link from "next/link"
import {
  ArrowUpRight,
  BadgeCheck,
  Building2,
  FileText,
  LayoutDashboard,
  Mail,
  MapPin,
  Phone,
  ScanLine,
  ShieldCheck,
  Smartphone,
} from "lucide-react"

import { Button } from "@workspace/ui/components/button"

export const metadata: Metadata = {
  title: "Dossier SETRAG — NTSAGUI DIGITAL",
  description:
    "Démonstrateurs en ligne et propositions commerciales de NTSAGUI DIGITAL pour la digitalisation de la billettique du Transgabonais.",
  // Dossier commercial : accessible par lien, jamais listé par un moteur.
  robots: { index: false, follow: false },
}

/** Les trois applications déployées, dans l'ordre du parcours d'un billet. */
const APPLICATIONS = [
  {
    nom: "Billetterie voyageur",
    role: "Vente en ligne",
    href: "https://setrag-billetterie-web.vercel.app",
    icone: Smartphone,
    description:
      "Recherche d'itinéraire, choix de la classe, paiement mobile money ou carte, billet électronique QR consultable hors réseau.",
    points: ["Achat sans guichet", "Billet QR", "Installable sur mobile"],
  },
  {
    nom: "Contrôle à bord",
    role: "Équipes de contrôle",
    href: "https://setrag-controleur-web.vercel.app",
    icone: ScanLine,
    description:
      "Scan et validation des titres, procès-verbaux d'infraction, encaissement des amendes — en mode hors-ligne complet sur toute la voie.",
    points: ["Hors-ligne intégral", "PV et amendes", "Synchronisation différée"],
  },
  {
    nom: "Portail agent",
    role: "Guichet et back-office",
    href: "https://setrag-agent-web.vercel.app",
    icone: LayoutDashboard,
    description:
      "Vente au guichet, gestion des trains et des places, tarifs et yield management, états de caisse, reporting et gestion des rôles.",
    points: ["Vente guichet", "Inventaire des places", "États et KPI"],
  },
] as const

/** Les deux réponses aux cahiers des charges publiés par la SETRAG. */
const PROPOSITIONS = [
  {
    titre: "Système central de billettique",
    sousTitre: "Réponse au CDC « Projet Billettique » — remplacement de MOBIPASS",
    reference: "ND-PC-2026-011",
    href: "/documents/proposition-ntsagui-setrag-billettique.pdf",
    montant: "65 000 000",
    recurrent: "2 500 000",
    perimetre: [
      "Back-office full web (SaaS) — 47 500 000 FCFA",
      "Archivage du fonds documentaire — 17 500 000 FCFA",
    ],
  },
  {
    titre: "Applications Front-Office",
    sousTitre: "Réponse au CDC « Applications Front-Office » — vente en ligne et contrôle",
    reference: "ND-PC-2026-012",
    href: "/documents/proposition-ntsagui-setrag-front-office.pdf",
    montant: "85 000 000",
    recurrent: "1 750 000",
    perimetre: [
      "Billetterie publique web + iOS + Android — 55 000 000 FCFA",
      "Application contrôleur web + mobile — 30 000 000 FCFA",
    ],
  },
] as const

const CHIFFRES = [
  { valeur: "6 mois", legende: "Jusqu'à la mise en exploitation" },
  { valeur: "25", legende: "Gares et 89 points de vente couverts" },
  { valeur: "3", legende: "Applications déjà en ligne" },
  { valeur: "≥ 99,9 %", legende: "Disponibilité cible" },
] as const

const REFERENCES = [
  "Consulat Général du Gabon en France — plateforme consulaire (−50 % de temps de traitement)",
  "Conseil des Gabonais de France — plateforme web (+85 % de visibilité)",
  "Plateforme d'identité numérique (+20 % de connectivité)",
  "Consulat.ga — services pour la communauté gabonaise",
] as const

const ENGAGEMENTS = [
  {
    titre: "Sécurité",
    texte:
      "SSO Active Directory (SAML 2 / OIDC), MFA généralisé, RBAC, chiffrement TLS 1.2+ et AES-256, protections OWASP Top 10, tests d'intrusion réguliers.",
  },
  {
    titre: "Propriété intellectuelle",
    texte:
      "Licence perpétuelle, irrévocable et exclusive à la SETRAG. Code source complet remis et tenu à jour, librement modifiable par la SETRAG ou tout tiers mandaté.",
  },
  {
    titre: "Réversibilité",
    texte:
      "Restitution intégrale des données en formats ouverts (CSV, JSON, XML), assistance à migration d'au moins trois mois, attestation d'effacement.",
  },
  {
    titre: "Ancrage local",
    texte:
      "Hébergement chez ST Digital, opérateur de datacenters présent au Gabon. Conformité loi n°025/2023 et déclaration APDVP, en plus du RGPD. TVA et CSS natives.",
  },
] as const

const CONTACTS = [
  {
    nom: "Gueylord Asted Pellen-Lakoumba",
    role: "Président",
    telephones: [
      { affichage: "+241 77 78 13 00", lien: "+24177781300" },
      { affichage: "+33 6 61 00 26 16", lien: "+33661002616" },
    ],
  },
  {
    nom: "Berny Itoutou",
    role: "Directeur technique",
    telephones: [{ affichage: "+33 6 66 10 08 23", lien: "+33666100823" }],
  },
] as const

export default function PresentationPage() {
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between gap-4 px-s-5 md:px-6">
          <div className="flex min-w-0 flex-col">
            <span className="text-mono-label text-ink">NTSAGUI DIGITAL</span>
            <span className="truncate text-caption text-ink-faint">
              Du logiciel qui transforme l&apos;activité
            </span>
          </div>
          <a
            href="#propositions"
            className="inline-flex min-h-target shrink-0 items-center gap-2 rounded-pill px-s-3 text-small font-semibold text-accent-ink hover:bg-accent-soft"
          >
            <FileText className="size-4" aria-hidden />
            <span className="hidden sm:inline">Propositions</span>
            <span className="sm:hidden">PDF</span>
          </a>
        </div>
      </header>

      <main>
        {/* — Ouverture — */}
        <section className="mx-auto w-full max-w-5xl px-s-5 py-s-10 md:px-6 md:py-s-16">
          <p className="text-mono-label text-accent-ink">
            SETRAG · Transgabonais
          </p>
          <h1 className="mt-s-3 text-h2 text-ink md:text-display">
            Digitaliser la billettique du Transgabonais
          </h1>
          <p className="mt-s-5 max-w-2xl text-body md:text-body-lg text-ink-muted">
            NTSAGUI DIGITAL répond aux deux cahiers des charges de la SETRAG —
            le système central de billettique et les applications front-office —
            sur une plateforme unifiée. Les trois applications ci-dessous sont
            déployées et consultables dès maintenant.
          </p>
          <div className="mt-s-8 flex flex-col gap-s-3 sm:flex-row">
            <Button asChild size="lg">
              <a href="#applications">Voir les applications</a>
            </Button>
            <Button asChild variant="secondary" size="lg">
              <a href="#propositions">Consulter les propositions</a>
            </Button>
          </div>
        </section>

        {/* — Chiffres d'ensemble — */}
        <section className="border-y border-line bg-surface">
          <div className="mx-auto grid w-full max-w-5xl grid-cols-2 gap-s-6 px-s-5 py-s-8 md:grid-cols-4 md:px-6">
            {CHIFFRES.map((chiffre) => (
              <div key={chiffre.legende}>
                <p className="tabular text-h3 text-ink">{chiffre.valeur}</p>
                <p className="mt-s-1 text-small text-ink-muted">
                  {chiffre.legende}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* — Les trois applications — */}
        <section
          id="applications"
          className="mx-auto w-full max-w-5xl scroll-mt-20 px-s-5 py-s-12 md:px-6 md:py-s-16"
        >
          <h2 className="text-h3 text-ink md:text-h2">Les applications</h2>
          <p className="mt-s-3 max-w-2xl text-body text-ink-muted">
            Chaque carte ouvre l&apos;application dans un nouvel onglet. Les
            données affichées sont des données de démonstration.
          </p>

          <div className="mt-s-8 grid gap-s-5 md:grid-cols-3">
            {APPLICATIONS.map((application) => {
              const Icone = application.icone
              return (
                <Link
                  key={application.nom}
                  href={application.href}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex flex-col gap-s-4 rounded-lg border border-line bg-surface p-s-6 transition-colors duration-200 ease-setrag hover:border-accent-line hover:bg-accent-soft/40"
                >
                  <div className="flex items-start justify-between gap-s-3">
                    <span className="flex size-11 items-center justify-center rounded-md bg-accent-soft text-accent-ink">
                      <Icone className="size-5" aria-hidden />
                    </span>
                    <ArrowUpRight
                      className="size-5 text-ink-faint transition-colors duration-200 ease-setrag group-hover:text-accent-ink"
                      aria-hidden
                    />
                  </div>

                  <div>
                    <p className="text-mono-label text-ink-faint">
                      {application.role}
                    </p>
                    <h3 className="mt-s-2 text-h4 text-ink">
                      {application.nom}
                    </h3>
                  </div>

                  <p className="text-small text-ink-muted">
                    {application.description}
                  </p>

                  <ul className="mt-auto flex flex-wrap gap-s-2 pt-s-2">
                    {application.points.map((point) => (
                      <li
                        key={point}
                        className="rounded-pill border border-line bg-canvas px-s-3 py-s-1 text-caption text-ink-muted"
                      >
                        {point}
                      </li>
                    ))}
                  </ul>

                  <span className="text-small font-semibold text-accent-ink">
                    Ouvrir l&apos;application
                  </span>
                </Link>
              )
            })}
          </div>
        </section>

        {/* — Les deux propositions commerciales — */}
        <section
          id="propositions"
          className="border-t border-line bg-surface-sunk"
        >
          <div className="mx-auto w-full max-w-5xl scroll-mt-20 px-s-5 py-s-12 md:px-6 md:py-s-16">
            <h2 className="text-h3 text-ink md:text-h2">
              Propositions commerciales
            </h2>
            <p className="mt-s-3 max-w-2xl text-body text-ink-muted">
              Émises le 28 juillet 2026, valables 60 jours. Montants hors taxes,
              en francs CFA.
            </p>

            <div className="mt-s-8 grid gap-s-5 md:grid-cols-2">
              {PROPOSITIONS.map((proposition) => (
                <article
                  key={proposition.reference}
                  className="flex flex-col gap-s-5 rounded-lg border border-line bg-surface p-s-6"
                >
                  <div className="flex items-start gap-s-4">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent-ink">
                      <FileText className="size-5" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-h4 text-ink">{proposition.titre}</h3>
                      <p className="mt-s-1 text-small text-ink-muted">
                        {proposition.sousTitre}
                      </p>
                    </div>
                  </div>

                  <ul className="grid gap-s-2 border-t border-line pt-s-4">
                    {proposition.perimetre.map((ligne) => (
                      <li
                        key={ligne}
                        className="flex gap-s-2 text-small text-ink-muted"
                      >
                        <BadgeCheck
                          className="mt-0.5 size-4 shrink-0 text-accent-ink"
                          aria-hidden
                        />
                        <span>{ligne}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="grid grid-cols-2 gap-s-4 rounded-md bg-canvas p-s-4">
                    <div>
                      <p className="text-caption text-ink-faint">Réalisation</p>
                      <p className="tabular mt-s-1 text-h4 text-ink">
                        {proposition.montant}
                      </p>
                      <p className="text-caption text-ink-faint">FCFA HT</p>
                    </div>
                    <div>
                      <p className="text-caption text-ink-faint">Récurrent</p>
                      <p className="tabular mt-s-1 text-h4 text-ink">
                        {proposition.recurrent}
                      </p>
                      <p className="text-caption text-ink-faint">
                        FCFA HT / mois
                      </p>
                    </div>
                  </div>

                  <div className="mt-auto flex flex-col gap-s-2">
                    <Button asChild variant="secondary" size="lg" block>
                      <a
                        href={proposition.href}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <FileText aria-hidden />
                        Ouvrir le PDF
                      </a>
                    </Button>
                    <p className="text-caption text-ink-faint">
                      Réf. {proposition.reference} · 6 pages
                    </p>
                  </div>
                </article>
              ))}
            </div>

            {/* La recommandation qui clôt les deux documents. */}
            <div className="mt-s-6 rounded-lg border border-accent-line bg-accent-soft p-s-6">
              <p className="text-mono-label text-accent-ink">
                Notre recommandation
              </p>
              <h3 className="mt-s-2 text-h4 text-ink">
                Une seule plateforme pour les deux cahiers des charges
              </h3>
              <p className="mt-s-3 max-w-3xl text-small text-ink-muted">
                L&apos;inventaire des places, le moteur tarifaire et le journal
                comptable sont indivisibles entre la vente au guichet, la vente
                en ligne et le contrôle à bord. Deux systèmes de deux
                prestataires reliés par des interfaces reconstituent les risques
                que ces cahiers des charges veulent éliminer : survente, double
                émission, écarts de caisse. Un socle unique, une gouvernance, une
                recette, un contrat de maintenance.
              </p>
              <dl className="mt-s-5 grid gap-s-4 sm:grid-cols-3">
                <div>
                  <dt className="text-caption text-ink-faint">
                    Total réalisation
                  </dt>
                  <dd className="tabular text-h4 text-ink">
                    150 000 000 FCFA HT
                  </dd>
                </div>
                <div>
                  <dt className="text-caption text-ink-faint">
                    Récurrent d&apos;ensemble
                  </dt>
                  <dd className="tabular text-h4 text-ink">
                    4 250 000 FCFA / mois
                  </dd>
                </div>
                <div>
                  <dt className="text-caption text-ink-faint">Délai</dt>
                  <dd className="tabular text-h4 text-ink">6 mois</dd>
                </div>
              </dl>
            </div>
          </div>
        </section>

        {/* — L'entreprise — */}
        <section className="mx-auto w-full max-w-5xl px-s-5 py-s-12 md:px-6 md:py-s-16">
          <div className="grid gap-s-10 md:grid-cols-2">
            <div>
              <h2 className="text-h3 text-ink md:text-h2">Qui sommes-nous</h2>
              <p className="mt-s-4 text-body text-ink-muted">
                NTSAGUI DIGITAL est un studio produit gabonais basé à Libreville,
                spécialisé dans la conception, la livraison et l&apos;exploitation
                de plateformes SaaS. Le positionnement est celui d&apos;un studio,
                pas d&apos;une agence : nous livrons des solutions en production,
                que nous exploitons et maintenons dans la durée.
              </p>
              <p className="mt-s-4 text-body text-ink-muted">
                Trois pôles d&apos;expertise : le développement de produits SaaS,
                la transformation digitale et l&apos;intelligence artificielle
                appliquée. Cette maîtrise irrigue notre chaîne de production — une
                productivité qui sécurise les délais et que nous répercutons dans
                nos prix.
              </p>
              <Button asChild variant="ghost" size="lg" className="mt-s-4 -ml-s-3">
                <a href="https://ntsagui.com" target="_blank" rel="noreferrer">
                  ntsagui.com
                  <ArrowUpRight aria-hidden />
                </a>
              </Button>
            </div>

            <div>
              <h3 className="text-h4 text-ink">Références</h3>
              <ul className="mt-s-4 grid gap-s-3">
                {REFERENCES.map((reference) => (
                  <li
                    key={reference}
                    className="flex gap-s-3 rounded-md border border-line bg-surface p-s-4 text-small text-ink-muted"
                  >
                    <Building2
                      className="mt-0.5 size-4 shrink-0 text-accent-ink"
                      aria-hidden
                    />
                    <span>{reference}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* — Engagements contractuels — */}
        <section className="border-t border-line bg-surface">
          <div className="mx-auto w-full max-w-5xl px-s-5 py-s-12 md:px-6 md:py-s-16">
            <h2 className="text-h3 text-ink md:text-h2">Nos engagements</h2>
            <div className="mt-s-8 grid gap-s-6 sm:grid-cols-2">
              {ENGAGEMENTS.map((engagement) => (
                <div key={engagement.titre} className="flex gap-s-4">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-success-soft text-success-ink">
                    <ShieldCheck className="size-5" aria-hidden />
                  </span>
                  <div>
                    <h3 className="text-h4 text-ink">{engagement.titre}</h3>
                    <p className="mt-s-2 text-small text-ink-muted">
                      {engagement.texte}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* — Contacts — */}
        <section className="mx-auto w-full max-w-5xl px-s-5 py-s-12 md:px-6 md:py-s-16">
          <h2 className="text-h3 text-ink md:text-h2">Nous joindre</h2>
          <div className="mt-s-8 grid gap-s-5 md:grid-cols-3">
            {CONTACTS.map((contact) => (
              <div
                key={contact.nom}
                className="rounded-lg border border-line bg-surface p-s-6"
              >
                <p className="text-mono-label text-ink-faint">{contact.role}</p>
                <h3 className="mt-s-2 text-h4 text-ink">{contact.nom}</h3>
                <ul className="mt-s-4 grid gap-s-1">
                  {contact.telephones.map((telephone) => (
                    <li key={telephone.lien}>
                      <a
                        href={`tel:${telephone.lien}`}
                        className="inline-flex min-h-target items-center gap-s-2 text-small font-semibold text-accent-ink hover:underline"
                      >
                        <Phone className="size-4" aria-hidden />
                        <span className="tabular">{telephone.affichage}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            <div className="rounded-lg border border-line bg-surface p-s-6">
              <p className="text-mono-label text-ink-faint">Siège</p>
              <h3 className="mt-s-2 text-h4 text-ink">Libreville, Gabon</h3>
              <p className="mt-s-2 flex gap-s-2 text-small text-ink-muted">
                <MapPin
                  className="mt-0.5 size-4 shrink-0 text-accent-ink"
                  aria-hidden
                />
                <span>Batterie IV, rue des Résidences, BP 638</span>
              </p>
              <a
                href="mailto:contact@ntsagui.com"
                className="mt-s-3 inline-flex min-h-target items-center gap-s-2 text-small font-semibold text-accent-ink hover:underline"
              >
                <Mail className="size-4" aria-hidden />
                contact@ntsagui.com
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-surface-sunk">
        <div className="mx-auto w-full max-w-5xl px-s-5 py-s-8 md:px-6">
          <p className="text-caption text-ink-faint">
            NTSAGUI DIGITAL — SARL au capital de 5 000 000 FCFA · RCCM
            GA-LBV-01-2025-B12-01029 · NIF 2025 0102 2429 R · Batterie IV, rue
            des Résidences, BP 638, Libreville, Gabon
          </p>
          <p className="mt-s-2 text-caption text-ink-faint">
            Document destiné à la SETRAG — Société d&apos;Exploitation du
            Transgabonais.
          </p>
        </div>
      </footer>
    </div>
  )
}
