// Kleines JS-Setup für deine Landingpage
// --------------------------------------

// 1) Aktuelles Jahr im Footer setzen
const yearElement = document.getElementById('current-year');
if (yearElement) {
  yearElement.textContent = String(new Date().getFullYear());
}

// 2) URL-Parameter auslesen (z.B. aus dem Mail-Link mit UTM-Parametern)
//    Beispiel-URL: https://deine-domain.de/?campaign=newsletter_feb26&source=email

function getUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const result = {};
  for (const [key, value] of params.entries()) {
    result[key] = value;
  }
  return result;
}

// Beispiel-Nutzung: Du kannst diese Funktion anpassen oder entfernen,
// wenn du keine dynamischen Inhalte basierend auf Parametern brauchst.
const urlParams = getUrlParams();
// console.log('URL-Parameter:', urlParams);

// Optional: Wenn du z.B. einen versteckten Formularwert mit campaign füllen willst,
// kannst du so etwas nutzen:
//
// const hiddenCampaignInput = document.querySelector('input[name="campaign"]');
// if (hiddenCampaignInput && urlParams.campaign) {
//   hiddenCampaignInput.value = urlParams.campaign;
// }

