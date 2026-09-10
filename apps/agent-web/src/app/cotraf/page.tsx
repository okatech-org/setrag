"use client"

import { AlertOctagon, ArrowRightLeft, Shield, Send } from "lucide-react"
import { EnterpriseShell } from "@/components/enterprise-layout"
import { DemoDataNotice } from "@/components/demo-data-notice"
import { Card } from "@workspace/ui/components/card"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"

const STATIONS = [
  {
    pk: 0,
    name: "Owendo",
    cantons: "Voie Libre",
    tracks: 6,
    trains: ["Rame Express 211 (Quai 1)"],
  },
  { pk: 35, name: "Nkok (ZES)", cantons: "Voie Libre", tracks: 4, trains: [] },
  {
    pk: 182,
    name: "Ndjolé",
    cantons: "Cantonnement Actif",
    tracks: 3,
    trains: ["TM-806 (Remonte vide)"],
  },
  {
    pk: 252,
    name: "Lopé",
    cantons: "Voie Unique Occupée",
    tracks: 2,
    trains: ["TM-804 (Passage PK 284)"],
  },
  {
    pk: 338,
    name: "Booué (Centre)",
    cantons: "Régulation Centrale",
    tracks: 5,
    trains: ["TH-105 (Voie d'évitement)"],
  },
  {
    pk: 485,
    name: "Lastoursville",
    cantons: "Voie Libre",
    tracks: 3,
    trains: ["TF-312 (Grumier)"],
  },
  {
    pk: 608,
    name: "Moanda",
    cantons: "Voie Libre",
    tracks: 7,
    trains: ["Chargement Minerai"],
  },
  { pk: 648, name: "Franceville", cantons: "Terminus", tracks: 4, trains: [] },
]

export default function CotrafPage() {
  return (
    <EnterpriseShell
      title="Poste de Commande Centralisé (COTRAF) · Régulation Voie Unique"
      subtitle="Scénario de supervision des circulations, cantons et croisements sur la ligne Owendo–Franceville"
      actions={
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            className="border-red-500/40 text-red-700 dark:text-red-400"
          >
            <AlertOctagon className="mr-1.5 h-3.5 w-3.5" />
            Ordre Temporaire Ralentissement (OTR)
          </Button>
          <Button size="sm" className="bg-[#0F2C59] text-white">
            <Send className="mr-1.5 h-3.5 w-3.5 text-[#D39E00]" />
            Émettre Bulletin de Circulation
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <DemoDataNotice scope="Occupation des cantons, positions de trains et arbitrages simulés." />
        {/* Schéma synoptique de la voie unique */}
        <Card className="border-line bg-surface p-5">
          <div className="flex items-center justify-between border-b border-line pb-3">
            <div>
              <h2 className="text-base font-bold text-[#0F2C59]">
                Synoptique de la Ligne du Transgabonais (PK 0 à PK 648)
              </h2>
              <p className="text-xs text-ink-muted">
                Instantané simulé de l’occupation des cantons et gares de
                croisement
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className="bg-emerald-50 text-xs text-emerald-700"
              >
                Signalisation Électrique OK
              </Badge>
              <Badge
                variant="outline"
                className="bg-blue-50 text-xs text-blue-700"
              >
                Radio Sol-Train VHF OK
              </Badge>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            {STATIONS.map((s, idx) => (
              <div
                key={s.name}
                className="bg-surface-raised flex flex-col justify-between gap-2 rounded-lg border border-line/60 p-3 sm:flex-row sm:items-center"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0F2C59] font-mono text-xs font-bold text-white">
                    {idx + 1}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-[#0F2C59]">
                        {s.name}
                      </span>
                      <span className="text-ink-subtle font-mono text-xs">
                        PK {s.pk}
                      </span>
                    </div>
                    <span className="text-xs text-ink-muted">
                      {s.tracks} voies de gare
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {s.trains.length > 0 ? (
                    s.trains.map((t) => (
                      <Badge
                        key={t}
                        className="bg-[#0F2C59] font-mono text-xs text-white"
                      >
                        🚂 {t}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-ink-subtle text-xs italic">
                      Aucun convoi en gare
                    </span>
                  )}
                  <Badge variant="outline" className="text-xs font-medium">
                    {s.cantons}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Règles d'arbitrage de croisement en temps réel */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="border-line bg-surface p-4">
            <h3 className="flex items-center gap-2 text-sm font-bold text-[#0F2C59]">
              <ArrowRightLeft className="h-4 w-4 text-[#D39E00]" />
              Arbitrage Croisement : Gare de Booué (PK 338)
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-ink-muted">
              Croisement prévu à 19h15 :{" "}
              <strong>Train Minéralier TM-804</strong> (plein 9 240 t, priorité
              inertie) maintenu sur voie principale sans arrêt.{" "}
              <strong>Train Citerne TH-105</strong> engagé sur la voie
              d’évitement n°2 dès 18h55.
            </p>
            <div className="mt-3 flex gap-2">
              <Badge className="bg-emerald-600 text-[10px] text-white">
                Gain réseau : +18 min
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                Confirmé par régulateur
              </Badge>
            </div>
          </Card>

          <Card className="border-line bg-surface p-4">
            <h3 className="flex items-center gap-2 text-sm font-bold text-[#0F2C59]">
              <Shield className="h-4 w-4 text-blue-600" />
              Surveillance Traversée Parc National de la Lopé (PK 240-270)
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-ink-muted">
              Corridor écologique éléphants sous surveillance caméras et
              éco-gardes. Vitesse limitée à 45 km/h pour les trains de nuit.
              Aucune divagation signalée sur les dernières 24h.
            </p>
            <div className="mt-3 flex gap-2">
              <Badge className="bg-blue-600 text-[10px] text-white">
                Zone Éco-Sensible
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                Conforme ANPN / ARTF
              </Badge>
            </div>
          </Card>
        </div>
      </div>
    </EnterpriseShell>
  )
}
