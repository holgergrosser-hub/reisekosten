/**
 * Google Apps Script (an ein Google Sheet gebunden)
 *
 * Erwartete Aufrufe aus der React-App (über Netlify-Proxy):
 * - GET  ?action=getReisezeiten&mitarbeiter=&vonDatum=&bisDatum=
 * - POST action=writeReisekosten  data=[{...rows}]
 * - POST action=clearMaster
 *
 * Deployment: Bereitstellen → Neue Bereitstellung → Web-App
 * - Ausführen als: Ich
 * - Zugriff: Jeder
 * - Die Web-App URL (endet auf /exec) in der App eintragen.
 *
 * WICHTIG: Quelle und Ziel sind getrennte Spreadsheets.
 * - SOURCE_SPREADSHEET_ID: Zeiterfassung-Daten (lesen)
 * - MASTER_SPREADSHEET_ID: Master Reisekosten (schreiben/leeren)
 * Optional:
 * - MASTER_SHEET_GID: Tab-GID im Master-Spreadsheet, falls du in einen bestehenden Tab schreiben willst.
 *
 * Empfehlung: IDs als Script Properties setzen:
 * Project Settings → Script Properties
 * - SOURCE_SPREADSHEET_ID
 * - MASTER_SPREADSHEET_ID
 * - MASTER_SHEET_GID (optional)
 */

// Optional: Defaults (können leer bleiben, wenn Script Properties gesetzt sind)
var SOURCE_SPREADSHEET_ID = '11sOb8k38DPf_y_a5z5tlhyk1hnel5X70hQd_eR08h5A';
var MASTER_SPREADSHEET_ID = '1fmNJwJYuq2tzFVskhr7xPUjnW4lwNy3f_ex0LKd730s';
// Optional: Wenn du in einen existierenden Tab im Master schreiben willst (gid aus der URL)
var MASTER_SHEET_GID = '';

// Optional: Firmen-/Adress-Lookup (separates Spreadsheet)
// In der Datei:
// - Spalte A (1): Firmenname
// - Spalte BS (71): Straße
// - Spalte BW (75): Ort
// - Spalte CA (79): PLZ
// Empfehlung: als Script Property setzen: FIRMA_LOOKUP_SPREADSHEET_ID
var FIRMA_LOOKUP_SPREADSHEET_ID = '1FWbeX3YeK9Uidyn9obKJ7z-J-zXX1h5PsXcfk_YHAyU';

var __firmaLookupCache = null;
var __firmaLookupCacheKey = 'firmaLookup_v1';

function doGet(e) {
  return route_(e);
}

function doPost(e) {
  return route_(e);
}

function route_(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) ? String(e.parameter.action) : '';

    // Friendly default response for manual browser tests
    if (!action) {
      return json_({
        status: 'ok',
        message: 'Reisekosten API bereit',
        actions: ['getReisezeiten', 'writeReisekosten', 'clearMaster']
      });
    }

    if (action === 'getReisezeiten') {
      var result = getReisezeiten_(e);
      return json_(result);
    }

    if (action === 'writeReisekosten') {
      var body = parseBody_(e);
      var rows = body.data ? JSON.parse(body.data) : [];
      var result2 = writeReisekosten_(rows);
      return json_(result2);
    }

    if (action === 'clearMaster') {
      var result3 = clearMaster_();
      return json_(result3);
    }

    return json_({ status: 'error', message: 'Unbekannte action: ' + action });
  } catch (err) {
    return json_({ status: 'error', message: err && err.message ? err.message : String(err) });
  }
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function parseBody_(e) {
  // Netlify-Proxy sendet x-www-form-urlencoded. Das landet in e.parameter.
  if (e && e.parameter && Object.keys(e.parameter).length) return e.parameter;

  // Fallback, falls direkt JSON gepostet wird.
  if (e && e.postData && e.postData.contents) {
    try {
      return JSON.parse(e.postData.contents);
    } catch (_) {
      return { raw: e.postData.contents };
    }
  }
  return {};
}

function getReisezeiten_(e) {
  var ss = getSourceSpreadsheet_();
  var sheet = ss.getSheetByName('Formularantworten 1');
  if (!sheet) throw new Error('Sheet "Formularantworten 1" nicht gefunden');

  var firmaLookup = getFirmaLookup_();

  var values = sheet.getDataRange().getValues();
  if (!values || values.length < 2) {
    return { status: 'ok', total: 0, mitarbeiterList: [], rows: [] };
  }

  var headers = values[0].map(function(h) { return String(h || '').trim(); });
  var idx = indexByHeader_(headers);

  var filterMitarbeiter = (e && e.parameter && e.parameter.mitarbeiter) ? String(e.parameter.mitarbeiter).trim() : '';
  var vonDatum = (e && e.parameter && e.parameter.vonDatum) ? String(e.parameter.vonDatum).trim() : '';
  var bisDatum = (e && e.parameter && e.parameter.bisDatum) ? String(e.parameter.bisDatum).trim() : '';

  var rows = [];
  var mitarbeiterSet = {};

  for (var r = 1; r < values.length; r++) {
    var row = values[r];

    // "Reisezeiten" erkennen: wenn irgendwo exakt "Reisezeit"/"Reisezeiten" vorkommt.
    if (!isReisezeitRow_(row)) continue;

    var mitarbeiter = getCell_(row, idx.mitarbeiter);
    if (filterMitarbeiter && mitarbeiter !== filterMitarbeiter) continue;

    var datumVon = getCell_(row, idx.reisedatenVon);
    var datumBis = getCell_(row, idx.reisedatenBis);
    var datumVonIso = toIsoDate_(datumVon);
    var datumBisIso = toIsoDate_(datumBis) || datumVonIso;

    if (vonDatum && datumVonIso && datumVonIso < vonDatum) continue;
    if (bisDatum && datumBisIso && datumBisIso > bisDatum) continue;

    var startUm = toTime_(getCell_(row, idx.startUm));
    var endeUm = toTime_(getCell_(row, idx.endeUm));

    var kundeAnlass = parseKundeAnlass_(getCell_(row, idx.firmeAnlassJahr));
    var reiseInfo = getCell_(row, idx.reisedaten);
    var privatKm = getCell_(row, idx.privatKm);

    var hotel = /\bmit\s+übernachtung\b/i.test(reiseInfo || '');

    mitarbeiterSet[mitarbeiter] = true;

    var kunde = kundeAnlass.kunde;
    var addr = kunde ? firmaLookup[normalizeFirma_(kunde)] : null;
    var plz = addr && addr.plz ? String(addr.plz).trim() : '';
    var ort = addr && addr.ort ? String(addr.ort).trim() : '';
    var strasse = addr && addr.strasse ? String(addr.strasse).trim() : '';
    var ortTeil = (plz || ort) ? String((plz ? plz + ' ' : '') + (ort || '')).trim() : '';
    var reisezielAuto = String([ortTeil, strasse].filter(function(x){ return x && String(x).trim(); }).join(', ')).trim();

    rows.push({
      mitarbeiter: mitarbeiter,
      reiseziel: reisezielAuto,
      kunde: kunde,
      anlass: kundeAnlass.anlass,
      datumVon: datumVonIso,
      datumBis: datumBisIso,
      uhrVon: startUm,
      uhrBis: endeUm,
      std: calcHours_(startUm, endeUm),
      transport: privatKm ? 'Auto Privat' : '',
      privatKm: privatKm,
      privatPkw: '',
      hotel: hotel,
      hotelKosten: '',
      dibaBeleg: '',
      bewirtung: '',
      bargeld: '',
      verpflegung: '',
      eigPsch: '',
      bemerkung: '',
      weitereInfo: reiseInfo || ''
    });
  }

  var mitarbeiterList = Object.keys(mitarbeiterSet).filter(function(x){ return x; }).sort();

  return {
    status: 'ok',
    total: rows.length,
    mitarbeiterList: mitarbeiterList,
    rows: rows
  };
}

function getFirmaLookup_() {
  if (__firmaLookupCache) return __firmaLookupCache;

  // Try Script Cache first (fast, survives across executions)
  try {
    var cached = CacheService.getScriptCache().get(__firmaLookupCacheKey);
    if (cached) {
      __firmaLookupCache = JSON.parse(cached) || {};
      return __firmaLookupCache;
    }
  } catch (_) {
    // ignore cache errors
  }

  var id = getPropOrConst_('FIRMA_LOOKUP_SPREADSHEET_ID', FIRMA_LOOKUP_SPREADSHEET_ID);
  if (!id) {
    __firmaLookupCache = {};
    return __firmaLookupCache;
  }

  var ss;
  try {
    ss = SpreadsheetApp.openById(id);
  } catch (e) {
    // Nicht hart failen – dann läuft die App weiterhin, nur ohne Auto-Felder.
    __firmaLookupCache = {};
    return __firmaLookupCache;
  }

  var sheet = ss.getSheets()[0];
  if (!sheet) {
    __firmaLookupCache = {};
    return __firmaLookupCache;
  }

  var lastRow = sheet.getLastRow();
  if (!lastRow || lastRow < 2) {
    __firmaLookupCache = {};
    return __firmaLookupCache;
  }

  // Single read: A..CA (79 columns). Much faster than multiple range calls.
  var data = sheet.getRange(1, 1, lastRow, 79).getValues();

  var map = {};
  for (var r = 0; r < data.length; r++) {
    var row = data[r];
    var firmaRaw = row[0];
    if (!firmaRaw) continue;
    var firma = String(firmaRaw).trim();
    if (!firma) continue;

    // Header-Zeile heuristisch überspringen
    if (r === 0 && /^firma(name)?$/i.test(firma)) continue;

    var key = normalizeFirma_(firma);
    if (!key) continue;

    // Erste gefundene Adresse gewinnt (kein Override)
    if (!map[key]) {
      map[key] = {
        // BS=71 -> index 70, BW=75 -> index 74, CA=79 -> index 78
        strasse: row[70] || '',
        ort: row[74] || '',
        plz: row[78] || ''
      };
    }
  }

  __firmaLookupCache = map;

  // Store in cache for 6 hours
  try {
    CacheService.getScriptCache().put(__firmaLookupCacheKey, JSON.stringify(map), 21600);
  } catch (_) {
    // ignore cache errors
  }
  return __firmaLookupCache;
}

function normalizeFirma_(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\u00a0/g, ' ');
}

function writeReisekosten_(rows) {
  if (!rows || !rows.length) return { status: 'error', message: 'Keine Daten zum Schreiben' };

  var ss = getMasterSpreadsheet_();
  var sheet = getMasterSheet_(ss);

  var headers = ['Mitarbeiter','Reiseziel','Kunde','Anlaß','Datum Von','Datum bis',
    'Uhr von','Uhr bis','Std.','DIBA-Belege','Privat km','Privat PKW',
    'Hotel','Bewirtung','Bargeld','Verpflegung','Eig Psch','Bemerkung'];

  // Header sicherstellen
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else {
    var existing = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    if (existing.join('|') !== headers.join('|')) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
  }

  var values = rows.map(function(r) {
    return [
      r.mitarbeiter || '',
      r.reiseziel || '',
      r.kunde || '',
      r.anlass || '',
      r.datumVon || '',
      r.datumBis || '',
      r.uhrVon || '',
      r.uhrBis || '',
      r.std || '',
      r.dibaBeleg || '',
      r.privatKm || '',
      r.privatPkw || '',
      r.hotelKosten || '',
      r.bewirtung || '',
      r.bargeld || '',
      r.verpflegung || '',
      r.eigPsch || '',
      r.bemerkung || ''
    ];
  });

  var startRow = sheet.getLastRow() + 1;
  sheet.getRange(startRow, 1, values.length, headers.length).setValues(values);

  var sheetUrl = ss.getUrl() + '#gid=' + sheet.getSheetId();
  return { status: 'ok', message: values.length + ' Zeilen geschrieben', sheetUrl: sheetUrl };
}

function clearMaster_() {
  var ss = getMasterSpreadsheet_();
  var sheet = getMasterSheet_(ss);
  if (!sheet) return { status: 'ok', message: 'Master Sheet nicht gefunden' };

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow <= 1 || lastCol === 0) return { status: 'ok', message: 'Master ist bereits leer' };

  sheet.getRange(2, 1, lastRow - 1, lastCol).clearContent();
  return { status: 'ok', message: 'Master Sheet geleert' };
}

function indexByHeader_(headers) {
  function find_(names) {
    for (var i = 0; i < names.length; i++) {
      var name = names[i];
      var idx = headers.indexOf(name);
      if (idx >= 0) return idx;
    }
    return -1;
  }

  // Mehrere Varianten abdecken ("Firme" vs "Firma")
  return {
    mitarbeiter: find_(['Mitarbeiter']),
    firmeAnlassJahr: find_(['Firme-Anlass-Jahr','Firma-Anlass-Jahr']),
    reisedatenVon: find_(['Reisedaten von','Reisedaten Von','Reisedaten_von']),
    reisedatenBis: find_(['Reisedaten bis','Reisedaten Bis','Reisedaten_bis']),
    startUm: find_(['Start um','Start Um','Start']),
    endeUm: find_(['Ende um','Ende Um','Ende']),
    privatKm: find_(['Wenn Auto Privat km angeben','Privat km','Privat Km']),
    reisedaten: find_(['Reisedaten','Reise Daten'])
  };
}

function getCell_(row, idx) {
  if (idx == null || idx < 0 || idx >= row.length) return '';
  var v = row[idx];
  if (v == null) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') return v;
  return String(v).trim();
}

function toIsoDate_(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  // Wenn schon ISO
  var s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // Versuche dd.mm.yyyy
  var m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) {
    var dd = ('0' + m[1]).slice(-2);
    var mm = ('0' + m[2]).slice(-2);
    return m[3] + '-' + mm + '-' + dd;
  }

  // Letzter Versuch: Date.parse
  var d = new Date(s);
  if (!isNaN(d.getTime())) {
    return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return '';
}

function toTime_(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'HH:mm');
  }
  var s = String(value).trim();
  // Normalisiere "H:MM" -> "HH:MM"
  var m = s.match(/^(\d{1,2})[:.](\d{2})/);
  if (m) return ('0' + m[1]).slice(-2) + ':' + m[2];
  return s;
}

function calcHours_(start, end) {
  if (!start || !end) return '';
  var m1 = start.match(/^(\d{2}):(\d{2})$/);
  var m2 = end.match(/^(\d{2}):(\d{2})$/);
  if (!m1 || !m2) return '';
  var s1 = parseInt(m1[1], 10) * 60 + parseInt(m1[2], 10);
  var s2 = parseInt(m2[1], 10) * 60 + parseInt(m2[2], 10);
  var diff = s2 - s1;
  if (diff < 0) diff += 24 * 60;
  var hours = diff / 60;
  return Math.round(hours * 100) / 100;
}

function parseKundeAnlass_(text) {
  var s = String(text || '').trim();
  if (!s) return { kunde: '', anlass: '' };

  // Erwartet: "Kunde - Anlass - Jahr" (Trennzeichen variieren)
  var parts = s.split(/\s*[-–|]\s*/).map(function(p){ return p.trim(); }).filter(function(p){ return p; });
  if (parts.length === 1) return { kunde: parts[0], anlass: '' };

  // Wenn letztes Part nur Jahr ist, wegwerfen
  if (/^\d{4}$/.test(parts[parts.length - 1])) parts.pop();
  var kunde = parts.shift();
  var anlass = parts.join(' - ');
  return { kunde: kunde, anlass: anlass };
}

function isReisezeitRow_(row) {
  for (var i = 0; i < row.length; i++) {
    var v = row[i];
    if (v == null) continue;
    var s = String(v).trim().toLowerCase();
    if (s === 'reisezeit' || s === 'reisezeiten' || s.indexOf('reisezeit') >= 0) return true;
  }
  return false;
}

function getSpreadsheet_() {
  // Backward-compat: bisheriger Name wird als SOURCE verwendet.
  return getSourceSpreadsheet_();
}

function getSourceSpreadsheet_() {
  var id = getPropOrConst_('SOURCE_SPREADSHEET_ID', SOURCE_SPREADSHEET_ID);
  if (id) return SpreadsheetApp.openById(id);

  // Fallback: Container-bound
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) {
    throw new Error('Quelle nicht gefunden. Setze SOURCE_SPREADSHEET_ID (Script Property) oder binde das Script an ein Google Sheet.');
  }
  return active;
}

function getMasterSpreadsheet_() {
  var id = getPropOrConst_('MASTER_SPREADSHEET_ID', MASTER_SPREADSHEET_ID);
  if (!id) {
    // Wenn kein Master gesetzt ist, default auf Source (damit bestehende Setups nicht sofort brechen)
    return getSourceSpreadsheet_();
  }
  return SpreadsheetApp.openById(id);
}

function getMasterSheet_(ss) {
  var gidStr = getPropOrConst_('MASTER_SHEET_GID', MASTER_SHEET_GID);
  var gid = gidStr ? parseInt(String(gidStr), 10) : NaN;

  if (!isNaN(gid)) {
    var byId = ss.getSheetById(gid);
    if (byId) return byId;
  }

  var sheet = ss.getSheetByName('Master Reisekosten');
  if (!sheet) sheet = ss.insertSheet('Master Reisekosten');
  return sheet;
}

function getPropOrConst_(propName, constValue) {
  var props = PropertiesService.getScriptProperties();
  var v = props.getProperty(propName);
  var s = (v && String(v).trim()) ? String(v).trim() : String(constValue || '').trim();
  return s;
}
