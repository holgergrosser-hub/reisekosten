import React, { useState, useCallback, useMemo } from 'react'
import * as XLSX from 'xlsx'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseTimeStr(val) {
  if (!val) return ''
  if (typeof val === 'number') {
    // Excel time fraction
    const totalMinutes = Math.round(val * 24 * 60)
    const h = Math.floor(totalMinutes / 60)
    const m = totalMinutes % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }
  if (typeof val === 'string') {
    const m = val.match(/(\d{1,2}):(\d{2})/)
    if (m) return `${m[1].padStart(2, '0')}:${m[2]}`
  }
  return ''
}

function calcDuration(von, bis) {
  if (!von || !bis) return ''
  const [hv, mv] = von.split(':').map(Number)
  const [hb, mb] = bis.split(':').map(Number)
  if (isNaN(hv) || isNaN(hb)) return ''
  let mins = (hb * 60 + mb) - (hv * 60 + mv)
  if (mins < 0) mins += 24 * 60
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function formatDate(val) {
  if (!val) return ''
  if (val instanceof Date) {
    return val.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }
  if (typeof val === 'number') {
    const d = new Date((val - 25569) * 86400000)
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }
  if (typeof val === 'string' && val.match(/\d{4}-\d{2}-\d{2}/)) {
    const d = new Date(val)
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }
  return String(val).substring(0, 10)
}

function parseKunde(kundeStr) {
  if (!kundeStr) return { reiseziel: '', kunde: '', anlass: '' }
  // Format: "Firmenname-Kategorie-Jahr" or just a name
  // Extract from Weitere Reiseinformationen or Reisedaten for Reiseziel
  const parts = String(kundeStr).split('-')
  if (parts.length >= 3) {
    const firma = parts.slice(0, parts.length - 2).join('-').trim()
    const anlass = parts[parts.length - 2].trim()
    return { kunde: firma, anlass, reiseziel: '' }
  }
  return { kunde: kundeStr, anlass: '', reiseziel: '' }
}

function isHotel(reisedaten) {
  if (!reisedaten) return false
  return String(reisedaten).toLowerCase().includes('übernachtung')
}

function getTransportType(reisedaten) {
  if (!reisedaten) return ''
  const r = String(reisedaten).toLowerCase()
  if (r.includes('auto privat')) return 'Auto Privat'
  if (r.includes('auto firma')) return 'Auto Firma'
  if (r.includes('bahn')) return 'Bahn/ÖPNV'
  return reisedaten
}

// ─── Parse Excel ──────────────────────────────────────────────────────────────

function parseZeiterfassung(workbook) {
  const sheetName = 'Formularantworten 1'
  const ws = workbook.Sheets[sheetName]
  if (!ws) throw new Error(`Sheet "${sheetName}" nicht gefunden`)

  const rows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: true })

  const reiseRows = rows.filter(r => {
    const zeit = r['Welche Zeit soll erfasst werden?']
    return zeit && String(zeit).trim() === 'Reisezeiten'
  })

  return reiseRows.map((r, idx) => {
    const parsed = parseKunde(r['Kunde'])
    const vonDate = formatDate(r['Reisedaten von'] || r['Datum'])
    const bisDate = formatDate(r['Reisedaten bis'] || r['Datum'])
    const uhrVon = parseTimeStr(r['Start um'])
    const uhrBis = parseTimeStr(r['Ende um'])
    const std = calcDuration(uhrVon, uhrBis)
    const privatKm = r['Wenn Auto Privat km angeben']
    const reisedaten = r['Reisedaten']
    const hotel = isHotel(reisedaten)

    return {
      id: idx,
      mitarbeiter: r['Mitarbeiter'] || '',
      reiseziel: parsed.reiseziel || '',
      kunde: parsed.kunde,
      anlass: parsed.anlass,
      datumVon: vonDate,
      datumBis: bisDate,
      uhrVon,
      uhrBis,
      std,
      privatKm: privatKm || '',
      transport: getTransportType(reisedaten),
      hotel: hotel,
      reisedatenRaw: reisedaten || '',
      weitereInfo: r['Weitere Reiseinformationen'] || '',
      originalKunde: r['Kunde'] || '',
      // Editable fields
      dibaBeleg: '',
      privatPkw: '',
      hotelKosten: '',
      bewirtung: '',
      bargeld: '',
      verpflegung: '',
      eigPsch: '',
    }
  })
}

// ─── Export to Excel ──────────────────────────────────────────────────────────

function exportToExcel(rows) {
  const headers = [
    'Mitarbeiter', 'Reiseziel', 'Kunde', 'Anlaß',
    'Datum Von', 'Datum bis', 'Uhr von', 'Uhr bis', 'Std.',
    'DIBA-Belege', 'Privat km', 'Privat PKW', 'Hotel', 'Bewirtung', 'Bargeld', 'Verpflegung', 'Eig Psch'
  ]

  const data = rows.map(r => [
    r.mitarbeiter,
    r.reiseziel,
    r.kunde,
    r.anlass,
    r.datumVon,
    r.datumBis,
    r.uhrVon,
    r.uhrBis,
    r.std,
    r.dibaBeleg,
    r.privatKm,
    r.privatPkw,
    r.hotelKosten,
    r.bewirtung,
    r.bargeld,
    r.verpflegung,
    r.eigPsch,
  ])

  const ws = XLSX.utils.aoa_to_sheet([headers, ...data])

  // Column widths
  ws['!cols'] = [
    { wch: 20 }, { wch: 20 }, { wch: 35 }, { wch: 25 },
    { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 8 },
    { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 10 }
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Master Reisekosten')
  XLSX.writeFile(wb, 'Master_Reisekostenabrechnung.xlsx')
}

// ─── Components ───────────────────────────────────────────────────────────────

function Badge({ children, color = 'blue' }) {
  const colors = {
    blue: { bg: '#dbeafe', text: '#1e40af' },
    green: { bg: '#dcfce7', text: '#166534' },
    orange: { bg: '#fed7aa', text: '#9a3412' },
    gray: { bg: '#f1f5f9', text: '#475569' },
  }
  const c = colors[color] || colors.gray
  return (
    <span style={{
      background: c.bg, color: c.text,
      padding: '2px 8px', borderRadius: 12,
      fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap'
    }}>
      {children}
    </span>
  )
}

function EditableCell({ value, onChange, type = 'text', placeholder = '' }) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%', border: '1px solid #e2e8f0',
        borderRadius: 4, padding: '3px 6px', fontSize: 12,
        background: '#fffbeb', outline: 'none',
        transition: 'border-color 0.15s'
      }}
      onFocus={e => e.target.style.borderColor = '#3b82f6'}
      onBlur={e => e.target.style.borderColor = '#e2e8f0'}
    />
  )
}

function FilterBar({ filters, setFilters, mitarbeiterList }) {
  return (
    <div style={{
      display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center',
      padding: '12px 16px', background: 'white', borderRadius: 8,
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: 16
    }}>
      <span style={{ fontWeight: 600, fontSize: 13, color: '#475569' }}>🔍 Filter:</span>

      <select
        value={filters.mitarbeiter}
        onChange={e => setFilters(f => ({ ...f, mitarbeiter: e.target.value }))}
        style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13 }}
      >
        <option value="">Alle Mitarbeiter</option>
        {mitarbeiterList.map(m => <option key={m} value={m}>{m}</option>)}
      </select>

      <input
        type="date"
        value={filters.vonDatum}
        onChange={e => setFilters(f => ({ ...f, vonDatum: e.target.value }))}
        style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13 }}
        placeholder="Von Datum"
      />
      <span style={{ color: '#94a3b8', fontSize: 13 }}>bis</span>
      <input
        type="date"
        value={filters.bisDatum}
        onChange={e => setFilters(f => ({ ...f, bisDatum: e.target.value }))}
        style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13 }}
      />

      <input
        type="text"
        value={filters.kunde}
        onChange={e => setFilters(f => ({ ...f, kunde: e.target.value }))}
        placeholder="Kunde suchen..."
        style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13, minWidth: 160 }}
      />

      <button
        onClick={() => setFilters({ mitarbeiter: '', vonDatum: '', bisDatum: '', kunde: '' })}
        style={{
          padding: '5px 12px', borderRadius: 6, background: '#f1f5f9',
          color: '#475569', fontSize: 13, fontWeight: 500
        }}
      >
        ✕ Zurücksetzen
      </button>
    </div>
  )
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [fileName, setFileName] = useState('')
  const [filters, setFilters] = useState({ mitarbeiter: '', vonDatum: '', bisDatum: '', kunde: '' })
  const [selectedRows, setSelectedRows] = useState(new Set())
  const [editingId, setEditingId] = useState(null)
  const [stats, setStats] = useState(null)

  const handleFile = useCallback((file) => {
    if (!file) return
    setLoading(true)
    setError('')
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result)
        const wb = XLSX.read(data, { type: 'array', cellDates: true })
        const parsed = parseZeiterfassung(wb)
        setRows(parsed)
        setFileName(file.name)
        setSelectedRows(new Set(parsed.map(r => r.id)))
        // Stats
        const mitarb = [...new Set(parsed.map(r => r.mitarbeiter).filter(Boolean))]
        setStats({
          total: parsed.length,
          mitarbeiter: mitarb.length,
          mitarbeiterList: mitarb,
          privatKmTotal: parsed.reduce((s, r) => s + (Number(r.privatKm) || 0), 0),
          hotelCount: parsed.filter(r => r.hotel).length,
        })
      } catch (err) {
        setError(`Fehler beim Lesen der Datei: ${err.message}`)
      } finally {
        setLoading(false)
      }
    }
    reader.readAsArrayBuffer(file)
  }, [])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file?.name.endsWith('.xlsx')) handleFile(file)
    else setError('Bitte eine .xlsx Datei hochladen')
  }, [handleFile])

  const updateRow = useCallback((id, field, value) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r))
  }, [])

  const mitarbeiterList = useMemo(() =>
    [...new Set(rows.map(r => r.mitarbeiter).filter(Boolean))].sort()
  , [rows])

  const filteredRows = useMemo(() => {
    return rows.filter(r => {
      if (filters.mitarbeiter && r.mitarbeiter !== filters.mitarbeiter) return false
      if (filters.kunde && !r.kunde.toLowerCase().includes(filters.kunde.toLowerCase())) return false
      return true
    })
  }, [rows, filters])

  const exportRows = useMemo(() => filteredRows.filter(r => selectedRows.has(r.id)), [filteredRows, selectedRows])

  const toggleRow = (id) => {
    setSelectedRows(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selectedRows.size === filteredRows.length) {
      setSelectedRows(new Set())
    } else {
      setSelectedRows(new Set(filteredRows.map(r => r.id)))
    }
  }

  // ── Render ──

  if (rows.length === 0) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        {/* Header */}
        <div style={{ marginBottom: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>📋</div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: '#1e3a8a', marginBottom: 4 }}>
            Reisekosten Auswertung
          </h1>
          <p style={{ color: '#64748b', fontSize: 15 }}>
            Zeiterfassung → Master Reisekostenabrechnung
          </p>
          <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 4 }}>
            QM-Dienstleistungen Holger Grosser
          </p>
        </div>

        {/* Upload Area */}
        <div
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          style={{
            width: '100%', maxWidth: 520,
            border: '2px dashed #93c5fd',
            borderRadius: 16, padding: '48px 32px',
            textAlign: 'center', background: 'white',
            cursor: 'pointer', transition: 'all 0.2s',
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'
          }}
          onClick={() => document.getElementById('fileInput').click()}
          onDragEnter={e => e.currentTarget.style.borderColor = '#3b82f6'}
          onDragLeave={e => e.currentTarget.style.borderColor = '#93c5fd'}
        >
          <div style={{ fontSize: 52, marginBottom: 16 }}>📂</div>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: '#1e40af', marginBottom: 8 }}>
            Zeiterfassung.xlsx hochladen
          </h2>
          <p style={{ color: '#64748b', fontSize: 14, marginBottom: 16 }}>
            Datei hierher ziehen oder klicken zum Auswählen
          </p>
          <p style={{ color: '#94a3b8', fontSize: 12 }}>
            Liest automatisch alle <strong>Reisezeiten</strong> aus "Formularantworten 1"
          </p>
          <input
            id="fileInput" type="file" accept=".xlsx"
            style={{ display: 'none' }}
            onChange={e => handleFile(e.target.files[0])}
          />
        </div>

        {loading && (
          <div style={{ marginTop: 24, display: 'flex', alignItems: 'center', gap: 10, color: '#3b82f6' }}>
            <div style={{ width: 20, height: 20, border: '2px solid #bfdbfe', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <span>Wird geladen...</span>
          </div>
        )}

        {error && (
          <div style={{ marginTop: 16, padding: '12px 20px', background: '#fee2e2', color: '#dc2626', borderRadius: 8, fontSize: 14 }}>
            ⚠️ {error}
          </div>
        )}

        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

        {/* Info Box */}
        <div style={{ marginTop: 32, maxWidth: 520, width: '100%', background: '#eff6ff', borderRadius: 12, padding: '20px 24px', border: '1px solid #bfdbfe' }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: '#1e40af', marginBottom: 12 }}>📌 So funktioniert es</h3>
          <ol style={{ paddingLeft: 18, color: '#475569', fontSize: 13, lineHeight: 1.8 }}>
            <li>Zeiterfassung.xlsx hochladen (Sheet: Formularantworten 1)</li>
            <li>Alle Reisezeiten werden automatisch extrahiert</li>
            <li>Optional: Belege, Hotel-Kosten, Bewirtung eintragen</li>
            <li>Nach Mitarbeiter / Datum / Kunde filtern</li>
            <li>Als Master-Reisekostenabrechnung exportieren</li>
          </ol>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', padding: '16px', maxWidth: 1600, margin: '0 auto' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        .row-hover:hover { background: #f8fafc !important; }
        .btn-primary { background: #1d4ed8; color: white; padding: 8px 18px; border-radius: 8px; font-size: 14px; font-weight: 600; transition: background 0.15s; }
        .btn-primary:hover { background: #1e40af; }
        .btn-secondary { background: #f1f5f9; color: #475569; padding: 8px 18px; border-radius: 8px; font-size: 14px; font-weight: 500; transition: background 0.15s; }
        .btn-secondary:hover { background: #e2e8f0; }
        th { position: sticky; top: 0; background: #1e3a8a; color: white; padding: 8px 10px; text-align: left; font-size: 11px; font-weight: 600; white-space: nowrap; z-index: 10; }
        td { padding: 6px 10px; font-size: 12px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
      `}</style>

      {/* Top Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1e3a8a' }}>
            📋 Reisekosten Auswertung
          </h1>
          <p style={{ color: '#64748b', fontSize: 13 }}>{fileName}</p>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {stats && (
            <>
              <Badge color="blue">{stats.total} Einträge</Badge>
              <Badge color="green">{stats.mitarbeiter} Mitarbeiter</Badge>
              {stats.hotelCount > 0 && <Badge color="orange">{stats.hotelCount} Übernachtungen</Badge>}
              {stats.privatKmTotal > 0 && <Badge color="gray">{stats.privatKmTotal} Privat-km</Badge>}
            </>
          )}

          <button
            className="btn-secondary"
            onClick={() => { setRows([]); setFileName(''); setStats(null); setFilters({ mitarbeiter: '', vonDatum: '', bisDatum: '', kunde: '' }) }}
          >
            🔄 Neue Datei
          </button>

          <button
            className="btn-primary"
            onClick={() => exportToExcel(exportRows)}
            disabled={exportRows.length === 0}
            style={{ opacity: exportRows.length === 0 ? 0.5 : 1 }}
          >
            ⬇️ Excel Export ({exportRows.length})
          </button>
        </div>
      </div>

      {/* Filters */}
      <FilterBar filters={filters} setFilters={setFilters} mitarbeiterList={mitarbeiterList} />

      {/* Table */}
      <div style={{ background: 'white', borderRadius: 10, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1300 }}>
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input
                    type="checkbox"
                    checked={selectedRows.size === filteredRows.length && filteredRows.length > 0}
                    onChange={toggleAll}
                    style={{ cursor: 'pointer' }}
                  />
                </th>
                <th>Mitarbeiter</th>
                <th>Reiseziel</th>
                <th>Kunde</th>
                <th>Anlaß</th>
                <th>Datum Von</th>
                <th>Datum Bis</th>
                <th>Uhr von</th>
                <th>Uhr bis</th>
                <th>Std.</th>
                <th>Transport</th>
                <th style={{ background: '#1e40af' }}>DIBA-Belege</th>
                <th style={{ background: '#1e40af' }}>Privat km</th>
                <th style={{ background: '#1e40af' }}>Hotel €</th>
                <th style={{ background: '#1e40af' }}>Bewirtung €</th>
                <th style={{ background: '#1e40af' }}>Bargeld €</th>
                <th style={{ background: '#1e40af' }}>Verpfl. €</th>
                <th>Info</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={18} style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
                    Keine Einträge gefunden
                  </td>
                </tr>
              ) : filteredRows.map(r => (
                <tr
                  key={r.id}
                  className="row-hover"
                  style={{
                    background: selectedRows.has(r.id) ? 'white' : '#fafafa',
                    opacity: selectedRows.has(r.id) ? 1 : 0.5
                  }}
                >
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedRows.has(r.id)}
                      onChange={() => toggleRow(r.id)}
                      style={{ cursor: 'pointer' }}
                    />
                  </td>
                  <td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{r.mitarbeiter}</td>
                  <td>
                    <EditableCell
                      value={r.reiseziel}
                      onChange={v => updateRow(r.id, 'reiseziel', v)}
                      placeholder="PLZ Ort"
                    />
                  </td>
                  <td style={{ maxWidth: 220 }}>
                    <div style={{ fontSize: 11, color: '#1e40af', fontWeight: 500 }}>{r.kunde}</div>
                  </td>
                  <td style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap' }}>{r.anlass}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{r.datumVon}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{r.datumBis}</td>
                  <td style={{ whiteSpace: 'nowrap', fontFamily: 'monospace' }}>{r.uhrVon}</td>
                  <td style={{ whiteSpace: 'nowrap', fontFamily: 'monospace' }}>{r.uhrBis}</td>
                  <td style={{ fontFamily: 'monospace', fontWeight: 600, color: '#1e40af' }}>{r.std}</td>
                  <td>
                    {r.transport && (
                      <Badge color={r.transport.includes('Privat') ? 'orange' : r.transport.includes('Bahn') ? 'green' : 'blue'}>
                        {r.transport.replace('Auto ', '')}
                      </Badge>
                    )}
                  </td>
                  {/* Editable cost fields */}
                  <td style={{ minWidth: 90 }}>
                    <EditableCell value={r.dibaBeleg} onChange={v => updateRow(r.id, 'dibaBeleg', v)} placeholder="Nr." />
                  </td>
                  <td style={{ minWidth: 80 }}>
                    <EditableCell value={r.privatKm} onChange={v => updateRow(r.id, 'privatKm', v)} placeholder="km" type="number" />
                  </td>
                  <td style={{ minWidth: 80 }}>
                    <EditableCell value={r.hotelKosten} onChange={v => updateRow(r.id, 'hotelKosten', v)} placeholder={r.hotel ? '€' : '-'} />
                  </td>
                  <td style={{ minWidth: 80 }}>
                    <EditableCell value={r.bewirtung} onChange={v => updateRow(r.id, 'bewirtung', v)} placeholder="€" />
                  </td>
                  <td style={{ minWidth: 80 }}>
                    <EditableCell value={r.bargeld} onChange={v => updateRow(r.id, 'bargeld', v)} placeholder="€" />
                  </td>
                  <td style={{ minWidth: 80 }}>
                    <EditableCell value={r.verpflegung} onChange={v => updateRow(r.id, 'verpflegung', v)} placeholder="€" />
                  </td>
                  <td style={{ maxWidth: 160, fontSize: 11, color: '#94a3b8' }}>
                    {r.weitereInfo && (
                      <span title={r.weitereInfo}>
                        💬 {r.weitereInfo.substring(0, 30)}{r.weitereInfo.length > 30 ? '…' : ''}
                      </span>
                    )}
                    {r.hotel && <div><Badge color="orange">🏨 Hotel</Badge></div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div style={{ padding: '10px 16px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontSize: 13, color: '#64748b' }}>
            {filteredRows.length} von {rows.length} Einträgen • {selectedRows.size} ausgewählt für Export
          </span>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>
            💡 Gelbe Felder (DIBA-Belege, Kosten) sind editierbar
          </span>
        </div>
      </div>
    </div>
  )
}
