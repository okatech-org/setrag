/**
 * Gabarit des e-mails envoyés au voyageur, à la charte SETRAG.
 *
 * Une messagerie n'est pas un navigateur : pas de feuille de style, pas de
 * SVG (Gmail les retire), pas de dégradé fiable. D'où un tableau, des styles
 * en ligne, le logo en PNG servi par la billetterie
 * (`/marque/setrag-logo.png`, fabriqué par `bun run icones`) et, sans logo,
 * le ruban en neuf cases de couleur pleine plutôt qu'en `linear-gradient`.
 *
 * Couleurs : conversion sRGB des valeurs oklch de
 * `packages/ui/src/styles/tokens.css` — portage, pas seconde source de
 * vérité. Polices : celles de la charte en tête de pile ; la plupart des
 * messageries retomberont sur Helvetica ou Arial, sans rien casser.
 */

const COULEURS = {
  /** --c-canvas · oklch(0.985 0.004 257) */
  fond: "#F8FAFD",
  /** --c-surface */
  surface: "#FFFFFF",
  /** --c-surface-sunk · oklch(0.965 0.008 257) */
  creux: "#F0F4F9",
  /** --c-line · oklch(0.905 0.012 257) */
  filet: "#DBE0E8",
  /** --c-ink · oklch(0.22 0.025 257) */
  texte: "#131B26",
  /** --c-ink-muted · oklch(0.5 0.02 257) */
  attenue: "#5C646F",
  /** --brand-indigo · oklch(0.189 0.103 295.7) — titres éditoriaux */
  indigo: "#1A003B",
  /** --brand-bleu · oklch(0.441 0.144 257) */
  bleu: "#0F50A0",
} as const

/**
 * Le ruban (vert → jaune → bleu, interpolé en oklch) : les étapes de
 * `DEGRADES.clair` de `@workspace/ui/marque/traces`.
 */
const RUBAN = [
  "#029E60",
  "#5EB157",
  "#95C24D",
  "#C9D245",
  "#FCDF49",
  "#85D168",
  "#00B395",
  "#0086AC",
  "#0F50A0",
] as const

export const POLICE_TEXTE =
  "'Schibsted Grotesk', 'Helvetica Neue', Helvetica, Arial, sans-serif"
export const POLICE_MONO =
  "'IBM Plex Mono', ui-monospace, Menlo, Consolas, monospace"

export function echapperHtml(valeur: string): string {
  return valeur
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

/** Paragraphe courant. */
export function paragraphe(html: string): string {
  return `<p style="margin:0 0 14px;font-size:16px;line-height:1.55;color:${COULEURS.texte}">${html}</p>`
}

/** Référence, code : en mono, comme sur le billet. */
export function mono(texte: string): string {
  return `<span style="font-family:${POLICE_MONO};font-weight:600;letter-spacing:0.02em">${echapperHtml(texte)}</span>`
}

/** Code à usage unique, en grand, dans une case creusée. */
export function codeUnique(code: string): string {
  return (
    `<p style="margin:4px 0 18px;padding:14px 18px;border-radius:12px;background:${COULEURS.creux};` +
    `font-family:${POLICE_MONO};font-size:30px;font-weight:600;letter-spacing:6px;color:${COULEURS.texte}">` +
    `${echapperHtml(code)}</p>`
  )
}

/**
 * Le message complet. `siteUrl` absent (déploiement sans SITE_URL) : le logo
 * cède la place au nom, écrit.
 */
export function courriel(o: {
  titre: string
  /** HTML déjà échappé. */
  corps: string
  siteUrl?: string
}): string {
  const site = o.siteUrl?.replace(/\/$/, "")
  const logo = site
    ? `<img src="${echapperHtml(`${site}/marque/setrag-logo.png`)}" width="200" height="102" alt="SETRAG — Société d’Exploitation du Transgabonais" style="display:block;border:0;width:200px;height:auto">`
    : `<span style="font-family:${POLICE_TEXTE};font-size:26px;font-weight:800;font-style:italic;color:${COULEURS.bleu}">SETRAG</span>`
  // Le logo porte déjà son ruban ; sans lui, le ruban seul signe le message.
  const ruban = site
    ? ""
    : `<tr><td style="padding:0 32px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>` +
      RUBAN.map(
        (couleur) =>
          `<td style="height:4px;line-height:4px;font-size:0;background:${couleur}">&nbsp;</td>`,
      ).join("") +
      `</tr></table></td></tr>`

  return (
    `<!doctype html><html lang="fr"><body style="margin:0;padding:0;background:${COULEURS.fond}">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COULEURS.fond}"><tr><td align="center" style="padding:24px 12px">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${COULEURS.surface};border:1px solid ${COULEURS.filet};border-radius:20px;font-family:${POLICE_TEXTE};color:${COULEURS.texte}">` +
    `<tr><td style="padding:28px 32px 18px">${logo}</td></tr>` +
    ruban +
    `<tr><td style="padding:${site ? 8 : 26}px 32px 12px">` +
    `<h1 style="margin:0 0 16px;font-size:24px;line-height:1.2;font-weight:700;color:${COULEURS.indigo}">${echapperHtml(o.titre)}</h1>` +
    o.corps +
    `</td></tr>` +
    `<tr><td style="padding:16px 32px 26px;border-top:1px solid ${COULEURS.filet};font-size:13px;line-height:1.5;color:${COULEURS.attenue}">` +
    `SETRAG — Société d’Exploitation du Transgabonais</td></tr>` +
    `</table></td></tr></table></body></html>`
  )
}
