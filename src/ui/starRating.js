// Moeilijkheidsgraad met sterren, per halve ster te geven (0,5 t/m 5).
// Bestaande standen met een heel getal (1-5) blijven gewoon kloppen.
// Klikken op de linkerhelft van een ster geeft een halve waarde, op de
// rechterhelft een hele; nogmaals klikken op de huidige waarde wist 'm weer.

export const MOEILIJKHEID_MAX = 5;

// "3,5" i.p.v. "3.5" — voor weergave in gewoon Nederlands.
export function formatMoeilijkheid(waarde) {
  return String(waarde).replace(".", ",");
}

export function renderStarRating(host, { value, onChange }) {
  const huidige = value ?? 0;
  host.innerHTML = "";
  for (let i = 1; i <= MOEILIJKHEID_MAX; i++) {
    const vulling = huidige >= i ? "100%" : huidige >= i - 0.5 ? "50%" : "0%";
    const span = document.createElement("span");
    span.className = "star";
    span.dataset.star = String(i);
    span.innerHTML = `<span class="star-fill" style="width:${vulling}">★</span>★`;
    span.addEventListener("click", (event) => {
      const rect = span.getBoundingClientRect();
      const linkerHelft = event.clientX - rect.left < rect.width / 2;
      const nieuw = linkerHelft ? i - 0.5 : i;
      onChange(huidige === nieuw ? null : nieuw);
    });
    host.appendChild(span);
  }
  host.title = huidige ? `Moeilijkheidsgraad: ${formatMoeilijkheid(huidige)} van ${MOEILIJKHEID_MAX}` : "Nog geen moeilijkheidsgraad";
}
