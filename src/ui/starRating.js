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
  const stars = [];
  // Tijdens het bewegen met de muis: toon in de sterren zelf welke waarde je bij
  // klikken zou geven (anders is 3 of 3,5 lastig te zien).

  function vulSterren(waarde) {
    stars.forEach((span, idx) => {
      const i = idx + 1;
      const vulling = waarde >= i ? "100%" : waarde >= i - 0.5 ? "50%" : "0%";
      span.firstChild.style.width = vulling;
    });
  }

  for (let i = 1; i <= MOEILIJKHEID_MAX; i++) {
    const span = document.createElement("span");
    span.className = "star";
    span.dataset.star = String(i);
    span.innerHTML = `<span class="star-fill" style="width:0%">★</span>★`;
    const waardeBij = (event) => {
      const rect = span.getBoundingClientRect();
      return event.clientX - rect.left < rect.width / 2 ? i - 0.5 : i;
    };
    span.addEventListener("mousemove", (event) => {
      const w = waardeBij(event);
      vulSterren(w);
    });
    span.addEventListener("click", (event) => {
      const nieuw = waardeBij(event);
      onChange(huidige === nieuw ? null : nieuw);
    });
    stars.push(span);
    host.appendChild(span);
  }
  vulSterren(huidige);
  host.addEventListener("mouseleave", () => {
    vulSterren(huidige);
  });
  host.title = huidige ? `Moeilijkheidsgraad: ${formatMoeilijkheid(huidige)} van ${MOEILIJKHEID_MAX}` : "Nog geen moeilijkheidsgraad";
}
