"use client"

import { authClient } from "@workspace/api/auth-client"

import { effacerDonneesLocales } from "./db"

/**
 * Ferme la session ET efface les billets enregistrés sur l'appareil.
 *
 * Les deux gestes ne se séparent pas : un billet porte un nom, un trajet et un
 * code de contrôle, et le téléphone qui l'a téléchargé peut être prêté,
 * revendu ou perdu. La déconnexion est le seul signal FIABLE de fin d'usage —
 * l'absence de session, elle, peut simplement vouloir dire qu'il n'y a plus de
 * réseau pour la revalider, moment où il faut au contraire garder les billets.
 *
 * L'effacement passe en premier : si la session tombe et que l'effacement
 * échoue ensuite, les données resteraient sur un appareil que plus personne ne
 * peut identifier.
 */
export async function seDeconnecter(): Promise<void> {
  await effacerDonneesLocales().catch(() => {
    // Base indisponible : rien à effacer, la déconnexion doit aboutir.
  })
  await authClient.signOut()
}
