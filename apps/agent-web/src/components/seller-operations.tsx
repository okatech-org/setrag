/**
 * Écrans de suivi du guichet : après-vente, caisse, ventes manuelles. Chacun
 * vit dans `guichet/` ; ce module les expose aux pages de `/vente`.
 */
export { OperationsPageClient } from "./guichet/apres-vente"
export { CashPageClient } from "./guichet/caisse"
export { ManualSalesPageClient } from "./guichet/ventes-manuelles"
