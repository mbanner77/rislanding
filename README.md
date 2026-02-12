# Einfache Landingpage (RIS)

Diese Landingpage ist als **statische Ein-Seiten-Anwendung** konzipiert. Du kannst deinen bereits vorbereiteten HTML/CSS-Code direkt in die Struktur einfügen, ohne Build-Tool oder Framework.

## Struktur

- `index.html` – Einstiegspunkt der Seite, inklusive Grundgerüst (SEO/OG-Meta-Tags, Basis-Layout).
- `styles.css` – Zentrales Stylesheet mit responsivem Layout und Typografie.
- `script.js` – Kleines optionales JavaScript (aktuelles Jahr im Footer, URL-Parameter-Helfer).
- `assets/` – (optional) Ordner für Bilder, Logos, Favicon etc. – einfach selbst anlegen.

## Deinen vorhandenen Code einfügen

1. **Wenn dein Code eine vollständige HTML-Seite ist**:
   - Öffne `index.html`.
   - Kopiere aus deiner bestehenden Datei nur den **Inhalt von `<body>...</body>`**.
   - Ersetze im Template den Bereich im `<body>` (Hero/Content/CTA-Kommentare) mit deinem Body-Inhalt.
   - Ergänze bei Bedarf im `<head>` weitere Meta-Tags, Fonts oder Favicons.

2. **Wenn dein Code nur einzelne Blöcke/Sektionen enthält**:
   - Füge diese an den markierten Stellen in `index.html` ein (Hero, Content-Blocks, CTA-Bereich).
   - Passe Klassen- und ID-Namen nach Bedarf an `styles.css` an – oder überschreibe die Styles.

## Lokal testen

1. Ordner öffnen (z.B. in VS Code/Cursor).
2. `index.html` im Browser öffnen (Doppelklick oder „Open with Live Server“).
3. Darstellung auf **Desktop- und Mobilbreite** prüfen (DevTools, Responsive Mode).

## Deployment (z.B. GitHub Pages)

1. Neues Repository auf GitHub anlegen (z.B. `ris-landingpage`).
2. Dateien `index.html`, `styles.css`, `script.js` (und ggf. `assets/`) ins Repo legen und committen.
3. In den Repository-Einstellungen **GitHub Pages** aktivieren:
   - Source: Branch `main` (oder `master`).
   - Ordner: `/ (root)`.
4. Warten, bis GitHub die Seite gebaut hat; anschließend ist sie unter einer URL wie  
   `https://dein-github-name.github.io/ris-landingpage/` erreichbar.

Stelle sicher, dass alle Pfade zu Assets **relativ** sind (z.B. `./assets/bild.png`), damit sie sowohl lokal als auch auf GitHub Pages funktionieren.

