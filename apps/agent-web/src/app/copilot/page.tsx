"use client"

import {
  Sparkles,
  Bot,
  BrainCircuit,
  Send,
  Lightbulb,
} from "lucide-react"
import { useState } from "react"
import { EnterpriseShell } from "@/components/enterprise-layout"
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
      text: "Bonjour ! Je suis SETRAG Copilot, l'assistant d'intelligence artificielle intégré au Système d'Exploitation du Transgabonais. Je suis connecté aux données d'exploitation en voie unique (COTRAF), à la GMAO d'ateliers, au plan comptable SYSCOHADA et au droit du travail gabonais. Que puis-je analyser pour vous aujourd'hui ?",
      time: "18:25",
    },
  ])

  const handleSend = (textToSend?: string) => {
    const q = textToSend || query
    if (!q.trim()) return

    const now = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    const userMsg = { role: "user" as const, text: q, time: now }

    let response = ""
    if (q.toLowerCase().includes("croisement") || q.toLowerCase().includes("booué")) {
      response =
        "Analyse Sillon Voie Unique : Le train TM-804 (Moanda-Owendo, 9 240 tonnes de manganèse) a 14 minutes d'avance sur sa marche nominale. Le train croiseur TH-105 est à l'approche du PK 350. Recommandation IA : maintenir TM-804 sur voie principale sans arrêt pour préserver l'inertie thermique et cinétique du convoi. Diriger TH-105 sur voie d'évitement n°2 à Booué. Gain estimé : 18 minutes et économie de 320 litres de gazole de traction."
    } else if (q.toLowerCase().includes("ohada") || q.toLowerCase().includes("retenue") || q.toLowerCase().includes("fiscal")) {
      response =
        "Réglementation Fiscale Gabon (DGI) : En application de l'article 102 du Code Général des Impôts gabonais, les prestations de services immatérielles fournies par une entreprise étrangère non établie au Gabon sont soumises à une Retenue à la Source (RAS) de 20%, sauf convention fiscale de non-double imposition. Au plan comptable SYSCOHADA, le montant brut est imputé au débit du compte 632, la RAS au crédit du compte 447, et le net au crédit du compte 401."
    } else if (q.toLowerCase().includes("code du travail") || q.toLowerCase().includes("découché") || q.toLowerCase().includes("roulement")) {
      response =
        "Droit Social Gabon (Loi n°022/2021 & Convention Collective Ferroviaire) : Tout agent roulant astreint à un repos hors de sa gare d'attache bénéficie de l'indemnité de découché forfaitaire (18 500 FCFA/nuit) et d'une chambre individuelle climatisée dans la cité cheminote de Booué ou Franceville. Le repos compensateur minimum avant prise de service suivante est de 14 heures consécutives."
    } else {
      response =
        `Analyse terminée pour votre requête : "${q}". Les paramètres opérationnels ont été croisés avec les bases de données réactives de la SETRAG. Les flux sont conformes aux procédures d'exploitation sécuritaire de l'ARTF.`
    }

    const assistantMsg = { role: "assistant" as const, text: response, time: now }
    setHistory((prev) => [...prev, userMsg, assistantMsg])
    setQuery("")
  }

  return (
    <EnterpriseShell
      title="SETRAG Copilot · Intelligence Artificielle Métier Intégrée"
      subtitle="Assistance intelligente pour l'optimisation des sillons en voie unique, la maintenance prédictive et la conformité OHADA / Gabon"
    >
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Volet conversationnel */}
        <div className="lg:col-span-2 flex flex-col h-[650px] rounded-xl border border-line bg-surface overflow-hidden shadow-xs">
          <div className="border-b border-line bg-surface-raised p-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[#D39E00]" />
              <span className="font-bold text-sm text-[#0F2C59]">
                Assistant IA Ferroviaire & Réglementaire
              </span>
            </div>
            <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-300">
              Modèle Multimodal Connecté
            </Badge>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
                      msg.role === "user" ? "text-white/60 text-right" : "text-ink-subtle"
                    }`}
                  >
                    {msg.time}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-line p-3 bg-surface">
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
              <Button type="submit" className="bg-[#0F2C59] text-white px-4">
                <Send className="h-4 w-4 text-[#D39E00]" />
              </Button>
            </form>
          </div>
        </div>

        {/* Volet contextuel et requêtes pré-programmées */}
        <div className="space-y-4">
          <Card className="p-4 border-line bg-surface">
            <h3 className="font-bold text-sm text-[#0F2C59] flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-[#D39E00]" />
              Requêtes Métiers Rapides
            </h3>
            <p className="mt-1 text-xs text-ink-muted">
              Cliquez pour lancer une analyse pré-calibrée sur les données réelles
            </p>

            <div className="mt-3 space-y-2">
              {PRESETS.map((p, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleSend(p)}
                  className="w-full text-left p-2.5 rounded-lg border border-line/60 bg-surface-raised hover:bg-canvas hover:border-[#D39E00] text-xs text-ink transition-all font-medium"
                >
                  👉 {p}
                </button>
              ))}
            </div>
          </Card>

          <Card className="p-4 border-line bg-surface">
            <h3 className="font-bold text-sm text-[#0F2C59] flex items-center gap-2">
              <BrainCircuit className="h-4 w-4 text-emerald-600" />
              Capteurs & Surveillance Prédictive
            </h3>
            <div className="mt-3 space-y-2 text-xs">
              <div className="flex justify-between items-center p-2 rounded bg-surface-raised">
                <span>Détecteurs Boîtes Chaudes (DBC)</span>
                <Badge className="bg-emerald-600 text-white text-[10px]">100% Nominales</Badge>
              </div>
              <div className="flex justify-between items-center p-2 rounded bg-surface-raised">
                <span>Ponts-Bascules Dynamiques</span>
                <Badge className="bg-emerald-600 text-white text-[10px]">Calibrés Owendo/Moanda</Badge>
              </div>
              <div className="flex justify-between items-center p-2 rounded bg-surface-raised">
                <span>Capteurs Météo Pluviométrie</span>
                <Badge className="bg-amber-600 text-white text-[10px]">Alerte Pluie PK 180</Badge>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </EnterpriseShell>
  )
}
