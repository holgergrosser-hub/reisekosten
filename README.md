# Reisekosten Auswertung

React-Anwendung zur Auswertung der Zeiterfassung und Erstellung der Master Reisekostenabrechnung.

## Funktionen

- 📂 **Excel-Upload**: Zeiterfassung.xlsx hochladen (Drag & Drop)
- 🔍 **Automatische Extraktion**: Alle "Reisezeiten" aus "Formularantworten 1" werden erkannt
- ✏️ **Editierbar**: DIBA-Belege, km, Hotel, Bewirtung, Bargeld, Verpflegung direkt eingeben
- 🔎 **Filter**: Nach Mitarbeiter, Datum, Kunde filtern
- ✅ **Selektion**: Einzelne Zeilen für Export aus/abwählen
- ⬇️ **Excel Export**: Master Reisekostenabrechnung als .xlsx

## Felder aus Zeiterfassung

| Zeiterfassung (Spalte) | Master Reisekosten |
|------------------------|-------------------|
| Mitarbeiter | Mitarbeiter |
| Kunde (Firmename aus "Firme-Anlass-Jahr") | Kunde |
| Kunde (Anlass-Teil) | Anlaß |
| Reisedaten von | Datum Von |
| Reisedaten bis | Datum bis |
| Start um | Uhr von |
| Ende um | Uhr bis |
| (berechnet) | Std. |
| Wenn Auto Privat km angeben | Privat km |
| Reisedaten (enthält "Mit Übernachtung") | Hotel-Markierung |

## Deployment

### Netlify

1. GitHub Repo erstellen und Code pushen
2. In Netlify: "New site from Git" → GitHub Repo wählen
3. Build-Einstellungen werden automatisch aus `netlify.toml` gelesen:
   - Build command: `npm install && npm run build`
   - Publish dir: `dist`

### Lokal entwickeln

```bash
npm install
npm run dev
```

## Technologie

- React 18 + Vite
- SheetJS (xlsx) für Excel-Verarbeitung
- Kein Backend nötig – alles im Browser

## Google Apps Script

Die App erwartet eine Google Apps Script Web-App, die JSON zurückliefert.
Das passende Script liegt im Repo unter `GoogleAppsScript.js` (im Projekt-Root) und muss in Apps Script eingefügt und als Web-App (`/exec`) bereitgestellt werden.

Die Lösung arbeitet mit **zwei** Google Sheets:
- `SOURCE_SPREADSHEET_ID`: Zeiterfassung (lesen)
- `MASTER_SPREADSHEET_ID`: Master Reisekosten (schreiben/leeren)

Empfohlen: IDs als Script Properties setzen:
- `SOURCE_SPREADSHEET_ID`
- `MASTER_SPREADSHEET_ID`
- `MASTER_SHEET_GID` (optional, Tab-GID im Master, wenn ein bestehender Tab genutzt werden soll)
