const form = document.querySelector("#radar-filters");
const status = document.querySelector("#radar-filter-status");
const cards = [...document.querySelectorAll("#radar-cards article")];
const normalize = (value) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
const indexed = cards.map(card => ({ card, text: normalize(card.textContent) }));

function filter() {
  const query = normalize(form.elements.buscar.value);
  const theme = form.elements.tema.value;
  let results = 0;
  for (const { card, text } of indexed) {
    const match = (!theme || card.dataset.section === theme) && (!query || text.includes(query));
    card.hidden = !match;
    if (match) results += 1;
  }
  status.hidden = !query && !theme;
  status.textContent = results === 0 ? "No encontramos notas con esos filtros." : results === 1 ? "1 nota" : results + " notas";
}

form.hidden = false;
form.addEventListener("submit", (event) => event.preventDefault());
form.addEventListener("input", filter);
