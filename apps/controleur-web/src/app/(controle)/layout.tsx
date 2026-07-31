import { SessionGuard } from "@/components/session-guard"
import { TabBar } from "@/components/tab-bar"
import { TerminalProvider } from "@/components/terminal-provider"

/**
 * Coquille des écrans de contrôle.
 *
 * L'ordre des enveloppes compte : le contexte terminal entoure la garde de
 * session, car l'écran de verrouillage a besoin de connaître la file d'envoi
 * pour annoncer ce qui reste à envoyer avant que l'agent ne rende son
 * terminal.
 */
export default function ControleLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <TerminalProvider>
      <SessionGuard>
        <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-canvas">
          <div className="flex flex-1 flex-col">{children}</div>
          <TabBar />
        </div>
      </SessionGuard>
    </TerminalProvider>
  )
}
