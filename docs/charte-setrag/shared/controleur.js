// Contrôle à bord — pictogrammes des quatre familles de verdict.
// Une forme par famille : cercle (accepté), triangle (à vérifier), octogone
// (refusé), cadre en tirets (lecture impossible). La forme et le mot portent
// l'information ; la couleur ne fait que la renforcer.

const OCTOGONE = "20.5,4.3 43.5,4.3 59.7,20.5 59.7,43.5 43.5,59.7 20.5,59.7 4.3,43.5 4.3,20.5"

const PICTOS = {
  ok: `<circle cx="32" cy="32" r="29" class="pf"/><path d="M19.5 33.5l8.5 8.5 17-18.5" class="pg" stroke-width="6.5"/>`,
  vigilance:
    `<path d="M28.2 7.6a4.4 4.4 0 0 1 7.6 0l24.3 42.8A4.4 4.4 0 0 1 56.3 57H7.7a4.4 4.4 0 0 1-3.8-6.6z" class="pf"/>` +
    `<path d="M32 23v15" class="pg" stroke-width="6.5"/><circle cx="32" cy="47.5" r="3.9" class="pgf"/>`,
  refus: `<polygon points="${OCTOGONE}" class="pf arrondi"/><path d="M22.5 22.5l19 19M41.5 22.5l-19 19" class="pg" stroke-width="6.5"/>`,
  lecture: `<rect x="5" y="5" width="54" height="54" rx="12" class="pl" stroke-dasharray="8 6"/><path d="M17 32h30" class="pg" stroke-width="5"/>`,
}

document.querySelectorAll("[data-picto]").forEach((el) => {
  el.classList.add("picto")
  el.innerHTML = `<svg viewBox="0 0 64 64" aria-hidden="true">${PICTOS[el.dataset.picto] ?? ""}</svg>`
})
