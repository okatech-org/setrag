import { Coquille } from "@/coquille/coquille"
import { GardeSession } from "@/fonctionnalites/session/garde-session"
import { TerminalProvider } from "@/fonctionnalites/terminal/contexte-terminal"

/**
 * Coquille des écrans de contrôle.
 *
 * L'ordre des enveloppes compte : le contexte terminal entoure la garde de
 * session, car l'écran de verrouillage montre le bandeau de service et ce
 * qui reste à envoyer avant que l'agent ne rende son terminal.
 */
export default function ControleLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <TerminalProvider>
      <GardeSession>
        <Coquille>{children}</Coquille>
      </GardeSession>
    </TerminalProvider>
  )
}
