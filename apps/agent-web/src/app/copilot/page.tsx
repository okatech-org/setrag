"use client"

import { Sparkles, Bot, BrainCircuit, Send, Lightbulb } from "lucide-react"
import { useState } from "react"
import { EnterpriseShell } from "@/components/enterprise-layout"
import { DemoDataNotice } from "@/components/demo-data-notice"
import { Card } from "@workspace/ui/components/card"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import { Input } from "@workspace/ui/components/field"

const PRESETS = [
  "Optimiser le croisement du train minéralier TM-804 à Booué",
  "Vérifier le barème d'indemnité découché selon le Code du Travail gabonais",
  "Calculer la retenue à la source sur prestation technique étrangère (20%)",
  "Analyser la tendance d'usure des essieux au tour en fosse d'Owendo",
]

export default function CopilotPage() {
  const [query, setQuery] = useState("")
  const [history, setHistory] = useState<
    Array<{ role: "user" | "assistant"; text: string; time: string }>
  >([
    {
      role: "assistant",
      text: "Bonjour ! Je suis la démonstration de SETRAG Copilot. Je réponds à partir de scénarios synthétiques sur l'exploitation en voie unique, la maintenance et la conformité. Je ne suis connecté à aucune donnée opérationnelle réelle. Que puis-je illustrer pour vous ?",
      time: "18:25",
    },
  ])

  const handleSend = (textToSend?: string) => {
    const q = textToSend || query
    if (!q.trim()) return

    const now = new Date().toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    })
    const userMsg = { role: "user" as const, text: q, time: now }

    let response = ""
    if (
      q.toLowerCase().includes("croisement") ||
      q.toLowerCase().includes("booué")
    ) {
      response =
        "Analyse Sillon Voie Unique : Le train TM-804 (Moanda-Owendo, 9 240 tonnes de manganèse) a 14 minutes d'avance sur sa marche nominale. Le train croiseur TH-105 est à l'approche du PK 350. Recommandation IA : maintenir TM-804 sur voie principale sans arrêt pour préserver l'inertie thermique et cinétique du convoi. Diriger TH-105 sur voie d'évitement n°2 à Booué. Gain estimé : 18 minutes et économie de 320 litres de gazole de traction."
    } else if (
      q.toLowerCase().includes("ohada") ||
      q.toLowerCase().includes("retenue") ||
      q.toLowerCase().includes("fiscal")
    ) {
      response =
        "Démonstration de contrôle fiscal : identifier d'abord la nature de la prestation, la résidence du fournisseur, une éventuelle convention fiscale et le texte en vigueur. Le taux et les comptes ne doivent jamais être déduits de ce scénario : ils doivent provenir du référentiel fiscal daté, sourcé et validé par la DFC. La production reste bloquée tant que les mappings SAGE X3 et e-tax ne sont pas homologués."
    } else if (
      q.toLowerCase().includes("code du travail") ||
      q.toLowerCase().includes("découché") ||
      q.toLowerCase().includes("roulement")
    ) {
      response =
        "Démonstration de contrôle social : comparer le roulement, le repos observé, le lieu de découché et l'habilitation médicale aux règles datées du référentiel RH. Aucun montant d'indemnité ni seuil réglementaire n'est supposé par cette maquette ; la décision doit être confirmée par les textes et accords applicables chargés dans la GED."
    } else {
      response = `Illustration terminée pour votre requête : "${q}". La réponse repose uniquement sur le jeu de démonstration synthétique et ne constitue ni une décision d'exploitation, ni un avis de conformité.`
    }

    const assistantMsg = {
      role: "assistant" as const,
      text: response,
      time: now,
    }
    setHistory((prev) => [...prev, userMsg, assistantMsg])
    setQuery("")
  }

  return (
    <EnterpriseShell
      title="SETRAG Copilot · Intelligence Artificielle Métier Intégrée"
      subtitle="Assistance intelligente pour l'optimisation des sillons en voie unique, la maintenance prédictive et la conformité OHADA / Gabon"
    >
      <div className="space-y-6">
        <DemoDataNotice scope="Réponses préprogrammées et capteurs simulés, sans connexion aux outils métier réels.">
          Toute recommandation doit être validée par un responsable habilité.
        </DemoDataNotice>
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Volet conversationnel */}
          <div className="flex h-[650px] flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-xs lg:col-span-2">
            <div className="bg-surface-raised flex items-center justify-between border-b border-line p-3.5">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[#D39E00]" />
                <span className="text-sm font-bold text-[#0F2C59]">
                  Assistant IA Ferroviaire & Réglementaire
                </span>
              </div>
              <Badge
                variant="outline"
                className="border-emerald-300 bg-emerald-50 text-xs text-emerald-700"
              >
                Modèle Multimodal Connecté
              </Badge>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              {history.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex gap-3 ${
                    msg.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  {msg.role === "assistant" && (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0F2C59] text-white">
                      <Bot className="h-4 w-4 text-[#D39E00]" />
                    </div>
                  )}
                  <div
                    className={`max-w-xl rounded-xl p-3.5 text-xs leading-relaxed ${
                      msg.role === "user"
                        ? "bg-[#0F2C59] text-white"
                        : "bg-surface-raised border border-line text-ink"
                    }`}
                  >
                    <p>{msg.text}</p>
                    <span
                      className={`mt-1.5 block text-[10px] ${
                        msg.role === "user"
                          ? "text-right text-white/60"
                          : "text-ink-subtle"
                      }`}
                    >
                      {msg.time}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-line bg-surface p-3">
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  handleSend()
                }}
                className="flex gap-2"
              >
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Posez une question technique, opérationnelle ou juridique..."
                  className="text-xs"
                />
                <Button type="submit" className="bg-[#0F2C59] px-4 text-white">
                  <Send className="h-4 w-4 text-[#D39E00]" />
                </Button>
              </form>
            </div>
          </div>

          {/* Volet contextuel et requêtes pré-programmées */}
          <div className="space-y-4">
            <Card className="border-line bg-surface p-4">
              <h3 className="flex items-center gap-2 text-sm font-bold text-[#0F2C59]">
                <Lightbulb className="h-4 w-4 text-[#D39E00]" />
                Requêtes Métiers Rapides
              </h3>
              <p className="mt-1 text-xs text-ink-muted">
                Cliquez pour lancer une illustration pré-calibrée sur les
                données de démonstration
              </p>

              <div className="mt-3 space-y-2">
                {PRESETS.map((p, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleSend(p)}
                    className="bg-surface-raised w-full rounded-lg border border-line/60 p-2.5 text-left text-xs font-medium text-ink transition-all hover:border-[#D39E00] hover:bg-canvas"
                  >
                    👉 {p}
                  </button>
                ))}
              </div>
            </Card>

            <Card className="border-line bg-surface p-4">
              <h3 className="flex items-center gap-2 text-sm font-bold text-[#0F2C59]">
                <BrainCircuit className="h-4 w-4 text-emerald-600" />
                Capteurs & Surveillance Prédictive
              </h3>
              <div className="mt-3 space-y-2 text-xs">
                <div className="bg-surface-raised flex items-center justify-between rounded p-2">
                  <span>Détecteurs Boîtes Chaudes (DBC)</span>
                  <Badge className="bg-emerald-600 text-[10px] text-white">
                    100% Nominales
                  </Badge>
                </div>
                <div className="bg-surface-raised flex items-center justify-between rounded p-2">
                  <span>Ponts-Bascules Dynamiques</span>
                  <Badge className="bg-emerald-600 text-[10px] text-white">
                    Calibrés Owendo/Moanda
                  </Badge>
                </div>
                <div className="bg-surface-raised flex items-center justify-between rounded p-2">
                  <span>Capteurs Météo Pluviométrie</span>
                  <Badge className="bg-amber-600 text-[10px] text-white">
                    Alerte Pluie PK 180
                  </Badge>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </EnterpriseShell>
  )
}
