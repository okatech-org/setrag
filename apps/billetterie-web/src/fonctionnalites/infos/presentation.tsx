import {
  ArrowUpRightIcon,
  BadgeCheckIcon,
  Building2Icon,
  FileTextIcon,
  LayoutDashboardIcon,
  MailIcon,
  MapPinIcon,
  PhoneIcon,
  ScanLineIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
  type LucideIcon,
} from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { LogoAnime } from "@workspace/ui/marque"

import { SectionInfo, Texte } from "./elements"

/**
 * Dossier de présentation remis à SETRAG.
 *
 * Tout ce qui s'affiche ici vient des deux propositions commerciales
 * (public/documents/*.pdf, réf. ND-PC-2026-011 et ND-PC-2026-012), du cahier
 * des charges « Projet billettique » ou des applications elles-mêmes.
 *
 * Retiré par rapport à l'ancienne page : l'hébergement chez un opérateur
 * présent au Gabon, que les propositions annoncent mais que le déploiement
 * actuel (Convex, région US) ne reflète pas, et « 25 gares » — le cahier des
 * charges recense 23 gares et une agence (§7.4).
 */

/** Les trois applications déployées, dans l'ordre du parcours d'un billet. */
const APPLICATIONS: {
  nom: string
  role: string
  href: string
  icone: LucideIcon
  description: string
  points: string[]
}[] = [
  {
    nom: "Billetterie voyageur",
    role: "Vente en ligne",
    href: "https://setrag-billetterie-web.vercel.app",
    icone: SmartphoneIcon,
    description:
      "Recherche d’itinéraire, choix de la classe, paiement Mobile Money ou carte, billet à code Aztec lisible sans réseau.",
    points: [
      "Achat sans guichet",
      "Billet à code Aztec",
      "Installable sur mobile",
    ],
  },
  {
    nom: "Contrôle à bord",
    role: "Équipes de contrôle",
    href: "https://setrag-controleur-web.vercel.app",
    icone: ScanLineIcon,
    description:
      "Scan et validation des titres, procès-verbaux d’infraction, encaissement des amendes, en mode hors ligne complet sur toute la voie.",
    points: [
      "Hors ligne intégral",
      "PV et amendes",
      "Synchronisation différée",
    ],
  },
  {
    nom: "Portail agent",
    role: "Guichet et back-office",
    href: "https://setrag-agent-web.vercel.app",
    icone: LayoutDashboardIcon,
    description:
      "Vente au guichet, gestion des trains et des places, tarifs et yield management, états de caisse, reporting et gestion des rôles.",
    points: [
      "Vente au guichet",
      "Inventaire des places",
      "États et indicateurs",
    ],
  },
]

/** Les deux réponses aux cahiers des charges publiés par SETRAG. */
const PROPOSITIONS = [
  {
    titre: "Système central de billettique",
    sousTitre:
      "Réponse au cahier des charges « Projet Billettique », remplacement de MOBIPASS",
    reference: "ND-PC-2026-011",
    href: "/documents/proposition-ntsagui-setrag-billettique.pdf",
    montant: "65 000 000",
    recurrent: "2 500 000",
    perimetre: [
      ["Back-office full web (SaaS)", "47 500 000"],
      ["Archivage du fonds documentaire", "17 500 000"],
    ],
  },
  {
    titre: "Applications Front-Office",
    sousTitre:
      "Réponse au cahier des charges « Applications Front-Office », vente en ligne et contrôle",
    reference: "ND-PC-2026-012",
    href: "/documents/proposition-ntsagui-setrag-front-office.pdf",
    montant: "85 000 000",
    recurrent: "1 750 000",
    perimetre: [
      ["Billetterie publique web, iOS et Android", "55 000 000"],
      ["Application contrôleur web et mobile", "30 000 000"],
    ],
  },
] as const

const CHIFFRES = [
  {
    valeur: "6 mois",
    legende:
      "Jusqu’à la mise en exploitation, délai fixé par le cahier des charges",
  },
  {
    valeur: "89",
    legende:
      "Postes de vente et de supervision recensés dans 23 gares et une agence",
  },
  { valeur: "3", legende: "Applications déjà en ligne" },
  { valeur: "≥ 99,9 %", legende: "Disponibilité cible" },
] as const

const REFERENCES = [
  "Consulat Général du Gabon en France : plateforme consulaire (−50 % de temps de traitement)",
  "Conseil des Gabonais de France : plateforme web (+85 % de visibilité)",
  "Plateforme d’identité numérique (+20 % de connectivité)",
  "Consulat.ga : services pour la communauté gabonaise",
] as const

const ENGAGEMENTS = [
  {
    titre: "Sécurité",
    texte:
      "SSO Active Directory (SAML 2 / OIDC), MFA généralisé, RBAC et moindre privilège, chiffrement TLS 1.2+ et AES-256, protections OWASP Top 10, tests d’intrusion réguliers.",
  },
  {
    titre: "Propriété intellectuelle",
    texte:
      "Licence perpétuelle, irrévocable et exclusive accordée à SETRAG. Code source complet remis et tenu à jour, librement modifiable par SETRAG ou tout tiers mandaté.",
  },
  {
    titre: "Réversibilité",
    texte:
      "Restitution intégrale des données en formats ouverts (CSV, JSON, XML), assistance à la migration pendant au moins trois mois, attestation d’effacement.",
  },
  {
    titre: "Conformité locale",
    texte:
      "Loi n° 025/2023 sur la protection des données personnelles et déclaration auprès de l’APDPVP, en complément du RGPD exigé par le cahier des charges. TVA et CSS paramétrées d’origine.",
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

function Montant({
  libelle,
  valeur,
  unite,
}: {
  libelle: string
  valeur: string
  unite: string
}) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-caption text-ink-muted">{libelle}</dt>
      <dd className="font-mono text-[20px] leading-tight font-semibold tabular-nums">
        {valeur}
      </dd>
      <dd className="text-caption text-ink-muted">{unite}</dd>
    </div>
  )
}

export function Presentation() {
  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 pb-16 md:px-8">
      <header className="grid grid-cols-[minmax(0,1fr)] items-center gap-8 pt-4 pb-10 md:py-14 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="grid gap-4">
          <p className="text-mono-label text-ink-muted">
            NTSAGUI DIGITAL · Dossier SETRAG
          </p>
          <h1 className="text-h2 md:text-display">
            Digitaliser la billettique du Transgabonais
          </h1>
          <p className="text-body-lg max-md:text-body max-w-[58ch] text-ink-muted">
            NTSAGUI DIGITAL répond aux deux cahiers des charges de SETRAG, le
            système central de billettique et les applications front-office, sur
            une seule plateforme. Les trois applications ci-dessous sont en
            ligne.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Button asChild size="lg">
              <a href="#applications">Voir les applications</a>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <a href="#propositions">Consulter les propositions</a>
            </Button>
          </div>
        </div>
        <figure className="grid min-h-[220px] place-items-center rounded-lg border border-line bg-[var(--c-surface)] p-8">
          <LogoAnime className="w-full max-w-[420px]" />
        </figure>
      </header>

      <section
        aria-label="Le projet en chiffres"
        className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-4"
      >
        {CHIFFRES.map((chiffre) => (
          <div
            key={chiffre.legende}
            className="grid content-start gap-1.5 bg-surface p-5 md:p-6"
          >
            <p className="font-mono text-[26px] leading-none font-semibold tabular-nums md:text-[30px]">
              {chiffre.valeur}
            </p>
            <p className="text-small text-ink-muted">{chiffre.legende}</p>
          </div>
        ))}
      </section>

      <div className="mt-10 md:mt-14">
        <SectionInfo
          id="applications"
          numero="01"
          titre="Les applications"
          intro="Chaque carte ouvre l’application dans un nouvel onglet. Les données affichées sont des données de démonstration, et les paiements y sont simulés."
        >
          <div className="grid gap-4 md:grid-cols-3">
            {APPLICATIONS.map(
              ({ nom, role, href, icone: Icone, description, points }) => (
                <a
                  key={nom}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className="group grid content-start gap-4 rounded-lg border border-line bg-surface p-5 transition-colors duration-[var(--dur-fast)] hover:border-accent-line md:p-6"
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="grid size-11 place-items-center rounded-md bg-accent-soft text-accent-ink">
                      <Icone className="size-5" aria-hidden />
                    </span>
                    <ArrowUpRightIcon
                      className="size-5 text-ink-faint transition-colors group-hover:text-accent-ink"
                      aria-hidden
                    />
                  </span>
                  <span className="grid gap-1.5">
                    <span className="text-mono-label text-ink-muted">
                      {role}
                    </span>
                    <span className="text-h4">{nom}</span>
                  </span>
                  <span className="text-[14.5px] leading-relaxed text-ink-muted">
                    {description}
                  </span>
                  <span className="flex flex-wrap gap-1.5">
                    {points.map((point) => (
                      <span
                        key={point}
                        className="rounded-pill border border-line bg-canvas px-2.5 py-1 text-[12.5px] font-medium text-ink-muted"
                      >
                        {point}
                      </span>
                    ))}
                  </span>
                  <span className="inline-flex min-h-11 items-center gap-1.5 text-[15px] font-semibold text-accent-ink">
                    Ouvrir l’application
                    <span className="sr-only"> (nouvel onglet)</span>
                  </span>
                </a>
              )
            )}
          </div>
        </SectionInfo>

        <SectionInfo
          id="propositions"
          numero="02"
          titre="Les propositions"
          intro="Émises le 28 juillet 2026, valables 60 jours. Montants hors taxes, en francs CFA."
        >
          <div className="grid gap-4 md:grid-cols-2">
            {PROPOSITIONS.map((proposition) => (
              <article
                key={proposition.reference}
                className="grid content-start gap-5 rounded-lg border border-line bg-surface p-5 md:p-6"
              >
                <div className="flex items-start gap-4">
                  <span className="grid size-11 shrink-0 place-items-center rounded-md bg-accent-soft text-accent-ink">
                    <FileTextIcon className="size-5" aria-hidden />
                  </span>
                  <div className="grid min-w-0 gap-1">
                    <h3 className="text-h4">{proposition.titre}</h3>
                    <p className="text-small text-ink-muted">
                      {proposition.sousTitre}
                    </p>
                  </div>
                </div>
                <ul className="grid gap-2 border-t border-line pt-4">
                  {proposition.perimetre.map(([poste, montant]) => (
                    <li
                      key={poste}
                      className="grid grid-cols-[18px_minmax(0,1fr)_auto] items-baseline gap-2 text-[14.5px] text-ink-muted"
                    >
                      <BadgeCheckIcon
                        className="size-4 translate-y-0.5 text-accent-ink"
                        aria-hidden
                      />
                      <span>{poste}</span>
                      <span className="font-mono text-[13.5px] text-ink tabular-nums">
                        {montant}
                      </span>
                    </li>
                  ))}
                </ul>
                <dl className="grid grid-cols-2 gap-4 rounded-md bg-surface-sunk p-4">
                  <Montant
                    libelle="Réalisation"
                    valeur={proposition.montant}
                    unite="FCFA HT"
                  />
                  <Montant
                    libelle="Récurrent"
                    valeur={proposition.recurrent}
                    unite="FCFA HT par mois"
                  />
                </dl>
                <div className="grid gap-2">
                  <Button asChild variant="secondary" size="lg" block>
                    <a href={proposition.href} target="_blank" rel="noreferrer">
                      <FileTextIcon aria-hidden />
                      Ouvrir le PDF
                      <span className="sr-only"> (nouvel onglet)</span>
                    </a>
                  </Button>
                  <p className="text-caption text-ink-muted">
                    Réf.{" "}
                    <span className="tabular">{proposition.reference}</span> · 6
                    pages
                  </p>
                </div>
              </article>
            ))}
          </div>

          <div className="grid gap-4 rounded-lg border border-accent-line bg-accent-soft p-5 md:p-6">
            <p className="text-mono-label text-accent-ink">
              Notre recommandation
            </p>
            <h3 className="text-h4">
              Une seule plateforme pour les deux cahiers des charges
            </h3>
            <Texte className="text-ink">
              L’inventaire des places, le moteur tarifaire et le journal
              comptable sont indivisibles entre la vente au guichet, la vente en
              ligne et le contrôle à bord. Deux systèmes de deux prestataires
              reliés par des interfaces reconstituent les risques que ces
              cahiers des charges veulent éliminer : survente, double émission,
              écarts de caisse. Un socle unique, une gouvernance, une recette,
              un contrat de maintenance.
            </Texte>
            <dl className="grid gap-4 sm:grid-cols-3">
              <Montant
                libelle="Total réalisation"
                valeur="150 000 000"
                unite="FCFA HT"
              />
              <Montant
                libelle="Récurrent d’ensemble"
                valeur="4 250 000"
                unite="FCFA HT par mois"
              />
              <Montant
                libelle="Délai"
                valeur="6 mois"
                unite="les deux périmètres en parallèle"
              />
            </dl>
          </div>
        </SectionInfo>

        <SectionInfo id="qui" numero="03" titre="Qui sommes-nous">
          <div className="grid gap-8 lg:grid-cols-2">
            <div className="grid content-start gap-4">
              <Texte>
                NTSAGUI DIGITAL est un studio produit gabonais, basé à
                Libreville. Il conçoit, livre et exploite des plateformes SaaS.
                Un studio, pas une agence : les solutions livrées partent en
                production, et nous les exploitons et les maintenons dans la
                durée.
              </Texte>
              <Texte>
                Trois pôles : le développement de produits SaaS, la
                transformation digitale et l’intelligence artificielle
                appliquée. L’IA sert aussi notre chaîne de production (code
                assisté, tests automatisés), ce qui tient les délais et se
                retrouve dans nos prix.
              </Texte>
              <Button asChild variant="ghost" className="-ml-4 w-fit">
                <a href="https://ntsagui.com" target="_blank" rel="noreferrer">
                  ntsagui.com
                  <ArrowUpRightIcon aria-hidden />
                  <span className="sr-only"> (nouvel onglet)</span>
                </a>
              </Button>
            </div>
            <div className="grid content-start gap-3">
              <h3 className="text-h4">Références</h3>
              <ul className="grid gap-2">
                {REFERENCES.map((reference) => (
                  <li
                    key={reference}
                    className="flex gap-3 rounded-md border border-line bg-surface p-4 text-[14.5px] text-ink-muted"
                  >
                    <Building2Icon
                      className="mt-0.5 size-4 shrink-0 text-accent-ink"
                      aria-hidden
                    />
                    <span>{reference}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </SectionInfo>

        <SectionInfo id="engagements" numero="04" titre="Nos engagements">
          <div className="grid gap-6 sm:grid-cols-2">
            {ENGAGEMENTS.map((engagement) => (
              <div key={engagement.titre} className="flex gap-4">
                <span className="grid size-11 shrink-0 place-items-center rounded-md bg-success-soft text-success-ink">
                  <ShieldCheckIcon className="size-5" aria-hidden />
                </span>
                <div className="grid gap-1.5">
                  <h3 className="text-h4">{engagement.titre}</h3>
                  <p className="text-[14.5px] leading-relaxed text-ink-muted">
                    {engagement.texte}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </SectionInfo>

        <SectionInfo id="contacts" numero="05" titre="Nous joindre">
          <div className="grid gap-4 md:grid-cols-3">
            {CONTACTS.map((contact) => (
              <div
                key={contact.nom}
                className="grid content-start gap-2 rounded-lg border border-line bg-surface p-5 md:p-6"
              >
                <p className="text-mono-label text-ink-muted">{contact.role}</p>
                <h3 className="text-h4">{contact.nom}</h3>
                <ul className="grid">
                  {contact.telephones.map((telephone) => (
                    <li key={telephone.lien}>
                      <a
                        href={`tel:${telephone.lien}`}
                        className="inline-flex min-h-11 items-center gap-2 rounded-sm text-[15px] font-semibold text-accent-ink hover:underline"
                      >
                        <PhoneIcon className="size-4" aria-hidden />
                        <span className="tabular">{telephone.affichage}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <div className="grid content-start gap-2 rounded-lg border border-line bg-surface p-5 md:p-6">
              <p className="text-mono-label text-ink-muted">Siège</p>
              <h3 className="text-h4">Libreville, Gabon</h3>
              <p className="flex gap-2 text-[14.5px] text-ink-muted">
                <MapPinIcon
                  className="mt-0.5 size-4 shrink-0 text-accent-ink"
                  aria-hidden
                />
                <span>Batterie IV, rue des Résidences, BP 638</span>
              </p>
              <a
                href="mailto:contact@ntsagui.com"
                className="inline-flex min-h-11 items-center gap-2 rounded-sm text-[15px] font-semibold text-accent-ink hover:underline"
              >
                <MailIcon className="size-4" aria-hidden />
                contact@ntsagui.com
              </a>
            </div>
          </div>
        </SectionInfo>
      </div>

      <footer className="mt-10 grid gap-1.5 border-t border-line pt-6">
        <p className="text-caption text-ink-muted">
          NTSAGUI DIGITAL, SARL au capital de 5 000 000 FCFA · RCCM
          GA-LBV-01-2025-B12-01029 · NIF 2025 0102 2429 R · Batterie IV, rue des
          Résidences, BP 638, Libreville, Gabon
        </p>
        <p className="text-caption text-ink-muted">
          Document destiné à SETRAG, Société d’Exploitation du Transgabonais.
        </p>
      </footer>
    </div>
  )
}
