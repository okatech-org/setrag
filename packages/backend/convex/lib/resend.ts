import { Resend } from "@convex-dev/resend"

import { components } from "../_generated/api"

/**
 * Client durable commun aux e-mails transactionnels.
 *
 * Le mode test reste actif par défaut. En production, il faut explicitement
 * poser RESEND_TEST_MODE=false après validation du domaine d'envoi.
 */
export const transactionalEmail = new Resend(components.resend, {
  testMode: process.env.RESEND_TEST_MODE !== "false",
})
