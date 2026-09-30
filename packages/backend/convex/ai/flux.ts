/**
 * Regroupement des écritures du flux d'une réponse de Ruban.
 *
 * Le fournisseur envoie le texte par petits morceaux (quelques caractères).
 * Écrire chacun dans `assistantMessages` coûterait une mutation par morceau :
 * on les regroupe. Le premier morceau part tout de suite (le voyageur voit
 * Ruban commencer), les suivants au plus toutes les `intervalleMs`, et
 * `vider()` écrit le reste en fin d'étape. Chaque écriture porte le texte
 * entier : une écriture perdue ou réordonnée ne corrompt rien.
 *
 * Module pur : ni Convex, ni fournisseur. L'écriture est injectée.
 */

/** Intervalle par défaut entre deux écritures, dans la fourchette 150–300 ms. */
export const INTERVALLE_FLUX_MS = 200

/** Séparation entre les textes de deux étapes (avant et après un outil). */
const SEPARATEUR_ETAPES = "\n\n"

export class RegroupeurFlux {
  private texteComplet = ""
  private dernierEcrit = ""
  private derniereEcriture: number | null = null
  private blocOuvert = false
  private nombreEcritures = 0

  constructor(
    private readonly options: {
      /** Écrit le texte entier de la réponse (mutation Convex). */
      ecrire: (texte: string) => Promise<unknown>
      intervalleMs?: number
      /**
       * `false` : rien n'est écrit en cours de route (messageries, qui
       * n'envoient que le message final) ; le texte s'accumule seulement.
       */
      diffuser?: boolean
      maintenant?: () => number
    }
  ) {}

  /** Texte reçu jusqu'ici, étapes séparées par une ligne vide. */
  texte(): string {
    return this.texteComplet
  }

  /** Nombre de mutations d'écriture effectuées. */
  ecritures(): number {
    return this.nombreEcritures
  }

  /** Ajoute un morceau ; écrit si le premier morceau arrive ou si l'intervalle est écoulé. */
  async ajouter(morceau: string): Promise<void> {
    if (!morceau) return
    if (this.blocOuvert && this.texteComplet.trim()) {
      this.texteComplet += SEPARATEUR_ETAPES
    }
    this.blocOuvert = false
    this.texteComplet += morceau
    if (this.options.diffuser === false) return
    const maintenant = (this.options.maintenant ?? Date.now)()
    const intervalle = this.options.intervalleMs ?? INTERVALLE_FLUX_MS
    if (
      this.derniereEcriture === null ||
      maintenant - this.derniereEcriture >= intervalle
    ) {
      await this.ecrireMaintenant(maintenant)
    }
  }

  /**
   * Une nouvelle étape commence (après des appels d'outils) : son texte
   * s'écrira après une ligne vide, seulement s'il y en a un.
   */
  nouvelleEtape(): void {
    this.blocOuvert = true
  }

  /** Écrit ce qui n'a pas encore été écrit (fin d'étape, erreur). */
  async vider(): Promise<void> {
    if (this.options.diffuser === false) return
    await this.ecrireMaintenant((this.options.maintenant ?? Date.now)())
  }

  private async ecrireMaintenant(maintenant: number): Promise<void> {
    if (this.texteComplet === this.dernierEcrit) return
    const texte = this.texteComplet
    this.derniereEcriture = maintenant
    this.dernierEcrit = texte
    this.nombreEcritures += 1
    await this.options.ecrire(texte)
  }
}
