import { useEffect, useState } from "react"
import { AccessibilityInfo } from "react-native"

/** « Réduire les animations » du système : le ruban se pose sans glisser. */
export function useMouvementReduit() {
  const [reduit, setReduit] = useState(false)

  useEffect(() => {
    let actif = true
    void AccessibilityInfo.isReduceMotionEnabled().then((valeur) => {
      if (actif) setReduit(valeur)
    })
    const abonnement = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduit)
    return () => {
      actif = false
      abonnement.remove()
    }
  }, [])

  return reduit
}
