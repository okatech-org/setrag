/**
 * Audit de contraste du bundle design-system.
 *
 * Les règles de la charte (« ink-faint réservé au texte ≥ 18 px », « aucune
 * information portée par la couleur seule ») ne valent que si elles sont
 * vérifiées : elles ont déjà été écrites puis violées dans une dizaine de
 * composants. Ce script les rend exécutables.
 *
 *   node .design-sync/check-contrast.mjs <url-du-bundle-servi>
 *
 * Sans navigateur automatisable, il fournit le script à coller dans la console
 * du navigateur intégré (`--emit`), qui produit le même verdict.
 */

const SNIPPET = `(async () => {
  await new Promise(r => setTimeout(r, 2500))
  const cv = document.createElement("canvas"); cv.width = cv.height = 1
  const ctx = cv.getContext("2d", { willReadFrequently: true })
  const rgb = c => { ctx.clearRect(0,0,1,1); ctx.fillStyle = "#000"; ctx.fillStyle = c
    ctx.fillRect(0,0,1,1); const d = ctx.getImageData(0,0,1,1).data; return [d[0],d[1],d[2]] }
  const lum = c => { const [r,g,b] = rgb(c).map(v => { v /= 255
    return v <= 0.03928 ? v/12.92 : ((v+0.055)/1.055) ** 2.4 })
    return 0.2126*r + 0.7152*g + 0.0722*b }
  const ratio = (a,b) => { const l1 = lum(a), l2 = lum(b)
    return (Math.max(l1,l2)+0.05) / (Math.min(l1,l2)+0.05) }
  const bgOf = (el,w) => { let e = el
    while (e) { const bc = w.getComputedStyle(e).backgroundColor
      if (bc && !/rgba\\(0, 0, 0, 0\\)|transparent/.test(bc)) return bc; e = e.parentElement }
    return "#ffffff" }
  const frames = [...document.querySelectorAll("iframe")]
  const bad = [], overflow = []
  for (const f of frames) {
    const name = (f.getAttribute("src")||"").split("/").pop().replace(".html","")
    const d = f.contentDocument; if (!d) continue; const w = d.defaultView
    for (const el of d.querySelectorAll("*")) {
      // débordement horizontal : un contenu plus large que son conteneur
      if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0) {
        const ov = w.getComputedStyle(el).overflowX
        if (ov === "visible") overflow.push({ name, txt: (el.textContent||"").trim().slice(0,24),
          scroll: el.scrollWidth, client: el.clientWidth })
      }
      if (el.children.length) continue
      const txt = (el.textContent||"").trim(); if (txt.length < 2) continue
      const cs = w.getComputedStyle(el)
      if (cs.visibility === "hidden" || cs.display === "none") continue
      const size = parseFloat(cs.fontSize), weight = parseInt(cs.fontWeight) || 400
      const large = size >= 24 || (size >= 18.66 && weight >= 700)
      const min = large ? 3 : 4.5
      const r = ratio(cs.color, bgOf(el,w))
      if (r < min) bad.push({ name, txt: txt.slice(0,24), ratio: +r.toFixed(2), min, size: Math.round(size) })
    }
  }
  return JSON.stringify({ contraste: bad.length, debordement: overflow.length,
    bad: bad.slice(0,20), overflow: overflow.slice(0,10) }, null, 1)
})()`

if (process.argv.includes("--emit")) {
  console.log(SNIPPET)
} else {
  console.log(
    "Sers le bundle, ouvre /.review.html dans le navigateur, et exécute :\n\n" +
      "  node .design-sync/check-contrast.mjs --emit\n\n" +
      "puis colle le script dans la console de la page.\n" +
      "Verdict attendu : { contraste: 0, debordement: 0 }."
  )
}
