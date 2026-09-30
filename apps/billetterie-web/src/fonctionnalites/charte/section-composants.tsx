"use client"

import { useState } from "react"
import { ArrowLeftRightIcon, ArrowRightIcon, CreditCardIcon, SearchIcon, SmartphoneIcon, TrainFrontIcon } from "lucide-react"

import { Avatar } from "@workspace/ui/components/avatar"
import { Button } from "@workspace/ui/components/button"
import { Checkbox, Radio, RadioGroup, Switch } from "@workspace/ui/components/choice"
import { CodeOtp } from "@workspace/ui/components/code-otp"
import { Compteur } from "@workspace/ui/components/compteur"
import { EmptyState, SkeletonLines } from "@workspace/ui/components/empty-state"
import { Field, Input, SelectNative } from "@workspace/ui/components/field"
import { InlineMessage, ToastBar } from "@workspace/ui/components/inline-message"
import { Jours } from "@workspace/ui/components/jours"
import { LigneArrets } from "@workspace/ui/components/ligne-arrets"
import { SchemaLigne } from "@workspace/ui/components/schema-ligne"
import { SegmentedControl } from "@workspace/ui/components/segmented-control"
import { Stepper } from "@workspace/ui/components/stepper"
import { Tag } from "@workspace/ui/components/tag"
import { Voie } from "@workspace/ui/components/voie"
import { BandeauTrafic } from "@workspace/ui/voyage/bandeau-trafic"
import { Billet } from "@workspace/ui/voyage/billet"
import { CarteTrajet } from "@workspace/ui/voyage/carte-trajet"
import { ChoixCartes, MarqueOperateur } from "@workspace/ui/voyage/choix"
import { Recapitulatif } from "@workspace/ui/voyage/recapitulatif"
import { PastilleBillet, PastilleDesserte } from "@workspace/ui/voyage/statut"
import { TableauDeparts } from "@workspace/ui/voyage/tableau-departs"

import { Fiche, Section, SousTitre } from "./elements"

/*
 * Toutes les données de cette page sont des exemples : horaires, prix et
 * références sont fictifs. Les gares et leurs points kilométriques sont ceux
 * du référentiel ; la billetterie, elle, les lit dans le backend.
 */
const GARES = [
  ["Owendo", 0], ["Ntoum", 35], ["Andem", 57], ["Mbel", 85], ["Oyan", 118], ["Abanga", 148], ["Ndjolé", 182],
  ["Alembé", 202], ["Otoumbi", 226], ["Bissouma", 244], ["Ayem", 267], ["Lopé", 290], ["Offoué", 312],
  ["Booué", 338], ["Ivindo", 375], ["Mouyabi", 411], ["Milolé", 448], ["Lastourville", 484], ["Doumé", 514],
  ["Lifouta", 549], ["Mboungou Badouma", 584], ["Moanda", 619], ["Franceville", 669],
] as const
const MAJEURES = new Set(["Owendo", "Ndjolé", "Booué", "Lastourville", "Franceville"])

const JOURS = [
  { valeur: "2026-09-30", libelle: "Mer. 30", detail: "24 500" },
  { valeur: "2026-10-01", libelle: "Jeu. 1", detail: "24 500" },
  { valeur: "2026-10-02", libelle: "Ven. 2", detail: "22 000", etat: "meilleur" as const },
  { valeur: "2026-10-03", libelle: "Sam. 3", detail: "24 500" },
  { valeur: "2026-10-04", libelle: "Dim. 4", detail: "Complet", etat: "complet" as const },
  { valeur: "2026-10-05", libelle: "Lun. 5", detail: "24 500" },
  { valeur: "2026-10-06", libelle: "Mar. 6", detail: "24 500" },
]

function Bloc({ titre, children, fiches }: { titre: string; children: React.ReactNode; fiches?: React.ReactNode }) {
  return (
    <div className="grid gap-4">
      <SousTitre>{titre}</SousTitre>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 rounded-lg border border-line bg-surface p-4 md:p-6">
        {children}
        {fiches && <div className="grid gap-6 border-t border-line pt-5 md:grid-cols-2">{fiches}</div>}
      </div>
    </div>
  )
}

export function SectionComposants() {
  const [trajet, setTrajet] = useState<string | null>("express")
  const [classe, setClasse] = useState("DEUXIEME")
  const [paiement, setPaiement] = useState("airtel_money")
  const [otp, setOtp] = useState("4821")
  const [adultes, setAdultes] = useState(1)
  const [enfants, setEnfants] = useState(1)
  const [jour, setJour] = useState("2026-10-02")
  const [periode, setPeriode] = useState("a-venir")
  // Un rebours d'exemple, fixé une fois : le rendu reste pur.
  const [tenueExemple] = useState(() => Date.now() + 13 * 60_000)

  return (
    <Section
      id="composants"
      numero="08"
      titre="Les composants"
      intro="Tous les composants de la billetterie, tels qu'ils vivent dans packages/ui. Ce qui s'affiche ici est ce que voit le voyageur : même code, mêmes états. Les horaires et les prix sont des exemples."
    >
      <Bloc
        titre="Actions"
        fiches={
          <>
            <Fiche titre="Bouton" chemin="components/button" regles={[["Variantes", "primaire, secondaire, fantôme, danger, noir (Wallet)"], ["Hauteur", "44 px au moins (md), 52 px (lg)"], ["En attente", "le libellé reste, une rame passe dessous"]]}>
              Pastille. Un seul primaire par écran : celui qui fait avancer le voyage.
            </Fiche>
            <Fiche titre="Bouton rond" regles={[["Tailles", "36, 44, 52 px"], ["Libellé", "toujours un aria-label"]]}>
              Inverser deux gares, fermer, revenir.
            </Fiche>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg">
            <SearchIcon />
            Rechercher
          </Button>
          <Button variant="secondary">Modifier</Button>
          <Button variant="ghost">
            Voir les arrêts
            <ArrowRightIcon />
          </Button>
          <Button variant="danger">Annuler la réservation</Button>
          <Button variant="noir">Ajouter à Apple Wallet</Button>
          <Button variant="secondary" disabled>
            Indisponible
          </Button>
          <Button variant="secondary" size="icon" aria-label="Inverser départ et arrivée">
            <ArrowLeftRightIcon />
          </Button>
          <Button variant="secondary" loading>
            Envoi du code
          </Button>
        </div>
      </Bloc>

      <Bloc
        titre="Saisie"
        fiches={
          <>
            <Fiche titre="Champ" chemin="components/field" regles={[["Hauteur", "52 px, rayon 12"], ["États", "repos, focus (anneau 3 px), erreur, désactivé"], ["Erreur", "écrite : ce qu'il faut faire, pas seulement ce qui ne va pas"]]}>
              Le libellé au-dessus, l’aide dessous, l’erreur écrite. Aucune secousse.
            </Fiche>
            <Fiche titre="Code, compteur, jours" regles={[["Code", "un seul champ réel, lu automatiquement par le téléphone"], ["Compteur", "chiffre en mono, bornes désactivées"], ["Jours", "le ruban glisse sous le jour choisi"]]} />
          </>
        }
      >
        <div className="grid gap-5 md:grid-cols-3">
          <Field label="Nom" hint="Tel qu'écrit sur la pièce d'identité">
            <Input defaultValue="Moussavou" autoComplete="family-name" />
          </Field>
          <Field label="Téléphone Airtel Money" error="Numéro incomplet : 9 chiffres après +241.">
            <Input defaultValue="+241 07 12 3" inputMode="tel" />
          </Field>
          <Field label="Classe" disabled>
            <SelectNative defaultValue="2">
              <option value="2">Deuxième classe</option>
              <option value="1">Première classe</option>
            </SelectNative>
          </Field>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          <div className="grid content-start gap-1">
            <Checkbox label="J'accepte les conditions générales de vente" defaultChecked />
            <Switch label="Alertes de retard" defaultChecked />
          </div>
          <RadioGroup defaultValue="sms" aria-label="Recevoir le code par">
            <Radio value="sms" label="Par SMS" />
            <Radio value="email" label="Par e-mail" />
          </RadioGroup>
          <div className="grid content-start gap-3">
            <SegmentedControl
              label="Période"
              value={periode}
              onValueChange={setPeriode}
              options={[
                { value: "a-venir", label: "À venir" },
                { value: "passes", label: "Passés" },
              ]}
            />
            <div className="flex items-center justify-between gap-3 text-[15px]">
              Adultes
              <Compteur label="Adultes" valeur={adultes} onChange={setAdultes} min={1} />
            </div>
            <div className="flex items-center justify-between gap-3 text-[15px]">
              Enfants
              <Compteur label="Enfants" valeur={enfants} onChange={setEnfants} />
            </div>
          </div>
        </div>
        <div className="grid gap-5 md:grid-cols-[auto_1fr] md:items-end">
          <CodeOtp valeur={otp} onChange={setOtp} />
          <Jours jours={JOURS} valeur={jour} onChange={setJour} />
        </div>
      </Bloc>

      <Bloc
        titre="Statuts et messages"
        fiches={
          <>
            <Fiche titre="Pastille" chemin="components/tag · voyage/statut" regles={[["Règle", "toujours une icône et un mot ; le retard toujours chiffré"], ["Marque", "bleu sur jaune : mises en avant commerciales, jamais un statut"]]} />
            <Fiche titre="Bandeau d'information" chemin="voyage/bandeau-trafic" regles={[["Couleurs", "jaune sur bleu, comme le site (5,9:1)"], ["Texte", "ce qui change, puis ce qui reste acquis"]]} />
          </>
        }
      >
        <div className="flex flex-wrap gap-2">
          <PastilleDesserte statut="planifie" />
          <PastilleDesserte statut="a_lheure" />
          <PastilleDesserte statut="retarde" retard={12} />
          <PastilleDesserte statut="annule" />
          <PastilleDesserte statut="termine" />
          <Tag tone="marque">Meilleur prix</Tag>
          <Tag tone="filterOn" onRemove={() => undefined}>
            Express
          </Tag>
          <Tag tone="filterOff">Omnibus</Tag>
        </div>
        <div className="flex flex-wrap gap-2">
          <PastilleBillet statut="valide" />
          <PastilleBillet statut="en_attente" />
          <PastilleBillet statut="utilise" />
          <PastilleBillet statut="annule" />
          <PastilleBillet statut="rembourse" />
          <PastilleBillet statut="expire" />
        </div>
        <BandeauTrafic titre="Travaux entre Booué et Ivindo" lien={<a href="#composants">En savoir plus</a>}>
          samedi 3 octobre : les départs de l’après-midi partiront 25 min plus tard. Vos places sont conservées.
        </BandeauTrafic>
        <div className="grid gap-3 md:grid-cols-2">
          <InlineMessage tone="info" title="Paiement au guichet.">
            Réglez avant 18:00 demain, sinon les places sont libérées.
          </InlineMessage>
          <InlineMessage tone="success" title="Billets envoyés.">
            Vous les recevrez aussi par SMS.
          </InlineMessage>
          <InlineMessage tone="warning" title="Plus que 4 places.">
            En première classe, sur ce train.
          </InlineMessage>
          <InlineMessage tone="danger" title="Paiement refusé.">
            Le solde Airtel Money est insuffisant. Vos places restent tenues.
          </InlineMessage>
        </div>
        <ToastBar action="Voir">Billets ajoutés à Wallet</ToastBar>
      </Bloc>

      <Bloc
        titre="La voie et le ruban"
        fiches={
          <>
            <Fiche titre="Voie" chemin="components/voie" nouveau regles={[["États", "vide · pleine · attente, ou rempli 0 → 1"], ["Fonds", "clair · encre · bleu"]]} />
            <Fiche titre="Étapes" chemin="components/stepper" regles={[["Étapes", "des gares ; le ruban avance jusqu'à la courante"], ["Accessibilité", "« Étape 2 sur 4 » reste écrit"]]} />
          </>
        }
      >
        <div className="grid gap-4 md:grid-cols-4">
          {(
            [
              ["Vide", <Voie key="v" />],
              ["Pleine", <Voie key="p" etat="pleine" />],
              ["À moitié", <Voie key="m" rempli={0.5} />],
              ["Attente", <Voie key="a" etat="attente" />],
            ] as const
          ).map(([nom, voie]) => (
            <div key={nom} className="grid gap-2">
              <span className="text-caption text-ink-muted">{nom}</span>
              <div className="flex h-10 items-center">{voie}</div>
            </div>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex h-14 items-center rounded-md bg-brand-encre px-5">
            <Voie fond="encre" etat="pleine" />
          </div>
          <div className="flex h-14 items-center rounded-md bg-brand-bleu px-5">
            <Voie fond="bleu" etat="attente" />
          </div>
        </div>
        <Stepper steps={[{ label: "Trajet" }, { label: "Voyageurs" }, { label: "Paiement" }, { label: "Billet" }]} current={2} />
      </Bloc>

      <Bloc
        titre="Trajets et achat"
        fiches={
          <>
            <Fiche titre="Trajet" chemin="voyage/carte-trajet" regles={[["Ordre", "l'heure (mono 24), le prix, le reste en gris"], ["Choisi", "bordure accent + ruban 480 ms, les classes se déplient"], ["Supprimé", "heures barrées, le mot « Supprimé », non cliquable"]]} />
            <Fiche titre="Choix, récapitulatif" chemin="voyage/choix · voyage/recapitulatif" regles={[["Places", "affichées seulement sous 10"], ["Tenue", "rebours en mono, danger sous 2 min, sans clignoter"]]} />
          </>
        }
      >
        <div className="grid gap-3">
          <CarteTrajet
            depart={{ heure: "07:40", gare: "Owendo" }}
            arrivee={{ heure: "19:25", gare: "Franceville" }}
            duree="11 h 45"
            detail="6 arrêts"
            train="Express 201"
            pastilles={
              <>
                <PastilleDesserte statut="a_lheure" />
                <Tag tone="marque">Meilleur prix</Tag>
              </>
            }
            prix={{ montant: "22 000", avant: "dès", apres: "XAF" }}
            etat={trajet === "express" ? "choisi" : "defaut"}
            onChoisir={() => setTrajet((t) => (t === "express" ? null : "express"))}
          >
            <ChoixCartes
              label="Classe"
              colonnes={3}
              valeur={classe}
              onChange={setClasse}
              options={[
                { valeur: "DEUXIEME", libelle: "Deuxième", detail: "Sièges inclinables", fin: "22 000" },
                { valeur: "PREMIERE", libelle: "Première", detail: "Plus de place · 4 restantes", fin: "31 900" },
                { valeur: "VIP", libelle: "VIP", detail: "Salon, repas", fin: "Complet", indisponible: true },
              ]}
            />
          </CarteTrajet>
          <CarteTrajet
            depart={{ heure: "18:10", gare: "Owendo" }}
            arrivee={{ heure: "07:05", gare: "Franceville", lendemain: true }}
            duree="12 h 55"
            detail="21 arrêts"
            train="Omnibus 203"
            pastilles={<PastilleDesserte statut="retarde" retard={25} />}
            prix={{ montant: "19 500", avant: "dès", apres: "XAF" }}
            etat={trajet === "omnibus" ? "choisi" : "defaut"}
            onChoisir={() => setTrajet((t) => (t === "omnibus" ? null : "omnibus"))}
          />
          <CarteTrajet
            depart={{ heure: "10:20", gare: "Owendo" }}
            arrivee={{ heure: "21:40", gare: "Franceville" }}
            duree="11 h 20"
            train="Express 205"
            pastilles={<PastilleDesserte statut="annule" />}
            etat="supprime"
          />
        </div>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <ChoixCartes
            label="Moyen de paiement"
            valeur={paiement}
            onChange={setPaiement}
            options={[
              { valeur: "airtel_money", libelle: "Airtel Money", detail: "Validez sur votre téléphone", fin: <MarqueOperateur>airtel</MarqueOperateur> },
              { valeur: "moov_money", libelle: "Moov Money", detail: "Validez sur votre téléphone", fin: <MarqueOperateur>moov</MarqueOperateur> },
              { valeur: "carte", libelle: "Carte bancaire", detail: "Visa, Mastercard", fin: <MarqueOperateur><CreditCardIcon /></MarqueOperateur> },
            ]}
            sousChoix={
              paiement !== "carte" && (
                <Field label="Numéro à débiter" hint="Vous recevrez une demande de validation.">
                  <Input defaultValue="+241 07 12 34 56" inputMode="tel" />
                </Field>
              )
            }
          />
          <Recapitulatif
            titre="Owendo → Franceville"
            sousTitre="Ven. 2 oct. · 07:40 → 19:25 · Express 201"
            lignes={[
              { libelle: "1 adulte · 2e classe", montant: "22 000" },
              { libelle: "1 enfant · 2e classe", montant: "22 000" },
              { libelle: "Réduction enfant −50 %", montant: "−11 000", remise: true },
            ]}
            total="33 000 XAF"
            tenueJusqua={tenueExemple}
          />
        </div>
      </Bloc>

      <Bloc
        titre="Le billet"
        fiches={
          <>
            <Fiche titre="Billet" chemin="voyage/billet" regles={[["Fond", "encre, dans les deux thèmes"], ["Code", "Aztec signé, sur fond blanc, lisible hors réseau"], ["États", "valide, retard, utilisé, annulé, expiré"]]} />
            <Fiche titre="Découpe" regles={[["Voie", "remplace les pointillés"], ["Émission", "le ruban la traverse une fois, 720 ms"]]} />
          </>
        }
      >
        <div className="grid items-start gap-5 md:grid-cols-2">
          <Billet
            depart={{ heure: "07:40", gare: "Owendo" }}
            arrivee={{ heure: "19:25", gare: "Franceville" }}
            milieu="ven. 2 oct."
            train="Express 201"
            statut={<PastilleBillet statut="valide" />}
            fondDecoupe="var(--c-surface)"
            cases={[
              { libelle: "Voiture", valeur: "4" },
              { libelle: "Place", valeur: "32" },
              { libelle: "Classe", valeur: "2e" },
            ]}
            code="SETRAG-EXEMPLE-CHARTE-NON-VALABLE"
            legendeCode="RS-EXEMPLE · 1/2"
            pied={
              <>
                <span>Ariane Moussavou</span>
                <span>Adulte</span>
              </>
            }
          />
          <div className="grid gap-5">
            <Billet
              etat="utilise"
              depart={{ heure: "06:15", gare: "Ndjolé" }}
              arrivee={{ heure: "10:02", gare: "Booué" }}
              train="Omnibus 203 · 14 sept."
              statut={<PastilleBillet statut="utilise" />}
              fondDecoupe="var(--c-surface)"
            />
            <Billet
              etat="annule"
              depart={{ heure: "10:20", gare: "Owendo" }}
              arrivee={{ heure: "21:40", gare: "Franceville" }}
              train="Express 205 · 3 oct."
              statut={<PastilleBillet statut="annule" />}
              fondDecoupe="var(--c-surface)"
            />
          </div>
        </div>
      </Bloc>

      <Bloc
        titre="Suivi"
        fiches={
          <>
            <Fiche titre="Arrêts" chemin="components/ligne-arrets" nouveau regles={[["Heures", "réelle en gras, prévue barrée dessous"], ["Rame", "entre deux gares, d'après l'horaire et le retard"]]} />
            <Fiche titre="Schéma de ligne, départs" chemin="components/schema-ligne · voyage/tableau-departs" regles={[["Gares", "à leur point kilométrique réel"], ["Tableau", "comme en gare : fond encre, heures en jaune"]]} />
          </>
        }
      >
        <SchemaLigne
          gares={GARES.map(([nom, km]) => ({ nom, km, majeure: MAJEURES.has(nom) }))}
          segment={[0, 669]}
          trains={[
            { km: 150, libelle: "Express 201", sens: "aller" },
            { km: 420, libelle: "Omnibus 204", etat: "retard", sens: "retour" },
          ]}
        />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <LigneArrets
            rame={1.4}
            arrets={[
              { nom: "Owendo", heure: "07:40", km: 0, majeur: true, passe: true },
              { nom: "Ndjolé", heure: "10:52", heurePrevue: "10:40", km: 182, majeur: true, passe: true },
              { nom: "Lopé", heure: "12:26", heurePrevue: "12:14", km: 290 },
              { nom: "Booué", heure: "13:19", heurePrevue: "13:07", km: 338, majeur: true, mention: <Tag tone="accent">Vous</Tag> },
              { nom: "Lastourville", heure: "16:02", heurePrevue: "15:50", km: 484, majeur: true },
            ]}
          />
          <TableauDeparts
            titre="Départs d'Owendo"
            horloge="07:02"
            departs={[
              { cle: "201", heure: "07:40", destination: "Franceville", via: "Ndjolé, Booué, Lastourville", train: "Express 201", quai: "1", statut: <PastilleDesserte statut="a_lheure" /> },
              { cle: "203", heure: "18:35", heurePrevue: "18:10", destination: "Franceville", via: "Toutes gares", train: "Omnibus 203", quai: "2", statut: <PastilleDesserte statut="retarde" retard={25} /> },
            ]}
          />
        </div>
      </Bloc>

      <Bloc
        titre="États"
        fiches={
          <>
            <Fiche titre="État vide" chemin="components/empty-state" regles={[["Illustration", "le S gris, rame à quai : jamais animé"], ["Sortie", "toujours une action : un jour voisin, une recherche"]]} />
            <Fiche titre="Chargement" regles={[["Sous 1 s", "squelettes"], ["Au-delà", "la voie et une phrase"]]} />
          </>
        }
      >
        <div className="grid gap-5 md:grid-cols-2">
          <EmptyState
            title="Pas de train ce jour-là"
            description="Le prochain part samedi à 07:40."
            action={
              <Button variant="secondary">
                <TrainFrontIcon />
                Voir samedi
              </Button>
            }
          />
          <div className="grid content-center gap-6">
            <SkeletonLines />
            <div className="flex items-center gap-3">
              <Avatar name="Ariane Moussavou" />
              <Avatar name="Jean Ndong" size="lg" />
              <span className="inline-flex items-center gap-2 text-small text-ink-muted">
                <SmartphoneIcon className="size-4" aria-hidden />
                Avatars : initiales, jamais de couleur aléatoire
              </span>
            </div>
          </div>
        </div>
      </Bloc>
    </Section>
  )
}
