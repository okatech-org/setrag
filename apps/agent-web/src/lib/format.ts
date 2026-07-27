const xaf = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "XAF",
  currencyDisplay: "code",
  maximumFractionDigits: 0,
})

const time = new Intl.DateTimeFormat("fr-FR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Africa/Libreville",
})

export function formatXaf(value: number) {
  return xaf.format(value).replace("XAF", "FCFA")
}

export function formatTime(value: number | Date) {
  return time.format(value)
}

export function initials(firstName?: string, lastName?: string) {
  return `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase() || "AG"
}

export function sellerDisplayName(firstName?: string, lastName?: string) {
  if (!firstName && !lastName) return "Agent SETRAG"
  return `${firstName?.[0] ? `${firstName[0]}. ` : ""}${lastName ?? firstName}`.trim()
}

export function productLabel(product: string) {
  const labels: Record<string, string> = {
    billet: "Billet voyageur",
    bagage: "Bagage",
    colis: "Colis express",
    auto_accompagne: "Auto accompagné",
    funeraire: "Transport funéraire",
  }
  return labels[product] ?? product
}
