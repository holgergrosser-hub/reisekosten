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
