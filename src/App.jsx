import React, { useState, useCallback, useMemo } from 'react'
import * as XLSX from 'xlsx'

async function fetchReisezeiten(gasUrl, params = {}) {
  const url = new URL(gasUrl)
  url.searchParams.set('action', 'getReisezeiten')
  if (params.mitarbeiter) url.searchParams.set('mitarbeiter', params.mitarbeiter)
  if (params.vonDatum)    url.searchParams.set('vonDatum', params.vonDatum)
  if (params.bisDatum)    url.searchParams.set('bisDatum', params.bisDatum)
  const res = await fetch(url.toString(), { redirect: 'follow' })
  const text = await res.text()
  try { return JSON.parse(text) }
  catch { throw new Error('Ungültige Antwort: ' + text.substring(0, 200)) }
}

async function pushToSheets(gasUrl, rows) {
  const formData = new FormData()
  formData.append('action', 'writeReisekosten')
  formData.append('data', JSON.stringify(rows))
  const res = await fetch(gasUrl, { method: 'POST', body: formData, redirect: 'follow' })
  const text = await res.text()
  try { return JSON.parse(text) } catch { return { status: 'ok', message: text } }
}

async function clearMasterSheet(gasUrl) {
  const formData = new FormData()
  formData.append('action', 'clearMaster')
  const res = await fetch(gasUrl, { method: 'POST', body: formData, redirect: 'follow' })
  const text = await res.text()
  try { return JSON.parse(text) } catch { return { status: 'ok' } }
}

function exportToExcel(rows) {
  const headers = ['Mitarbeiter','Reiseziel','Kunde','Anlaß','Datum Von','Datum bis',
    'Uhr von','Uhr bis','Std.','DIBA-Belege','Privat km','Privat PKW',
    'Hotel','Bewirtung','Bargeld','Verpflegung','Eig Psch','Bemerkung']
  const data = rows.map(r => [r.mitarbeiter,r.reiseziel,r.kunde,r.anlass,r.datumVon,
    r.datumBis,r.uhrVon,r.uhrBis,r.std,r.dibaBeleg,r.privatKm,r.privatPkw,
    r.hotelKosten,r.bewirtung,r.bargeld,r.verpflegung,r.eigPsch,r.bemerkung])
  const ws = XLSX.utils.aoa_to_sheet([headers, ...data])
  ws['!cols'] = headers.map((_, i) => ({ wch: i < 4 ? 28 : 12 }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Master Reisekosten')
  XLSX.writeFile(wb, 'Master_Reisekostenabrechnung.xlsx')
}

function Badge({ children, color = 'blue' }) {
  const c = { blue:'#dbeafe/#1e40af', green:'#dcfce7/#166534', orange:'#fed7aa/#9a3412', gray:'#f1f5f9/#475569' }
  const [bg, text] = (c[color] || c.gray).split('/')
  return <span style={{ background:bg, color:text, padding:'2px 8px', borderRadius:12, fontSize:11, fontWeight:600, whiteSpace:'nowrap' }}>{children}</span>
}

function Spinner() {
  return <div style={{ width:16, height:16, border:'2px solid #bfdbfe', borderTopColor:'#3b82f6', borderRadius:'50%', animation:'spin 0.7s linear infinite', display:'inline-block', verticalAlign:'middle' }} />
}

function EditCell({ value, onChange, placeholder = '' }) {
  return (
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{ width:'100%', border:'1px solid #e2e8f0', borderRadius:4, padding:'3px 6px',
        fontSize:12, background:'#fffbeb', outline:'none' }}
      onFocus={e => e.target.style.borderColor='#3b82f6'}
      onBlur={e => e.target.style.borderColor='#e2e8f0'}
    />
  )
}

function SetupScreen({ onConnect }) {
  const [url, setUrl] = useState(() => localStorage.getItem('gasUrl') || '')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)

  const handleTest = async () => {
    if (!url.trim()) return
    setTesting(true); setTestResult(null)
    try {
      const res = await fetchReisezeiten(url.trim())
      if (res.status === 'ok') {
        setTestResult({ ok: true, msg: `✅ Verbunden! ${res.total} Reisezeiten · ${res.mitarbeiterList?.length||0} Mitarbeiter` })
        localStorage.setItem('gasUrl', url.trim())
      } else {
        setTestResult({ ok: false, msg: '❌ ' + res.message })
      }
    } catch (e) { setTestResult({ ok: false, msg: '❌ ' + e.message }) }
    finally { setTesting(false) }
  }

  return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:24, background:'#f0f4ff' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <div style={{ fontSize:52, marginBottom:12 }}>🔗</div>
      <h1 style={{ fontSize:26, fontWeight:700, color:'#1e3a8a', marginBottom:4 }}>Reisekosten Auswertung</h1>
      <p style={{ color:'#64748b', marginBottom:32, fontSize:14 }}>Direkte Google Sheets Integration</p>

      <div style={{ width:'100%', maxWidth:560, background:'white', borderRadius:16, padding:32, boxShadow:'0 4px 20px rgba(0,0,0,0.08)' }}>
        <h2 style={{ fontSize:15, fontWeight:600, color:'#1e40af', marginBottom:16 }}>Google Apps Script URL eingeben</h2>
        <input value={url} onChange={e => setUrl(e.target.value)}
          placeholder="https://script.google.com/macros/s/..."
          style={{ width:'100%', padding:'10px 14px', borderRadius:8, border:'1.5px solid #e2e8f0',
            fontSize:13, outline:'none', marginBottom:12, fontFamily:'monospace' }}
          onFocus={e => e.target.style.borderColor='#3b82f6'}
          onBlur={e => e.target.style.borderColor='#e2e8f0'}
        />
        <div style={{ display:'flex', gap:10, marginBottom:16 }}>
          <button onClick={handleTest} disabled={!url||testing}
            style={{ flex:1, padding:'9px 0', borderRadius:8, background:'#f1f5f9', color:'#475569', fontSize:13, fontWeight:500, cursor:'pointer', border:'none' }}>
            {testing ? <><Spinner /> &nbsp;Teste...</> : '🔍 Verbindung testen'}
          </button>
          <button onClick={() => { localStorage.setItem('gasUrl', url.trim()); onConnect(url.trim()) }} disabled={!url}
            style={{ flex:1, padding:'9px 0', borderRadius:8, background:'#1d4ed8', color:'white', fontSize:13, fontWeight:600, cursor:'pointer', border:'none' }}>
            Verbinden & Laden →
          </button>
        </div>
        {testResult && (
          <div style={{ padding:'10px 14px', borderRadius:8,
            background:testResult.ok?'#f0fdf4':'#fff1f2', color:testResult.ok?'#166534':'#dc2626', fontSize:13 }}>
            {testResult.msg}
          </div>
        )}
      </div>

      <div style={{ marginTop:24, width:'100%', maxWidth:560, background:'white', borderRadius:14, padding:'20px 24px', boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
        <h3 style={{ fontSize:14, fontWeight:600, color:'#1e40af', marginBottom:12 }}>📋 Einmalige Einrichtung (nur einmal nötig)</h3>
        <ol style={{ paddingLeft:20, color:'#475569', fontSize:13, lineHeight:2.2 }}>
          <li>
            <a href="https://docs.google.com/spreadsheets/d/11sOb8k38DPf_y_a5z5tlhyk1hnel5X70hQd_eR08h5A/edit" target="_blank" style={{ color:'#1d4ed8' }}>
              Zeiterfassung Google Sheet öffnen →
            </a>
          </li>
          <li><strong>Erweiterungen → Apps Script</strong></li>
          <li>Inhalt von <code style={{ background:'#f1f5f9', padding:'1px 6px', borderRadius:4 }}>GoogleAppsScript.js</code> einfügen &amp; speichern</li>
          <li><strong>Bereitstellen → Neue Bereitstellung</strong><br />
            <span style={{ fontSize:12, color:'#64748b' }}>Typ: Web-App · Ausführen als: Ich · Zugriff: Jeder</span>
          </li>
          <li>URL kopieren und hier oben eintragen</li>
        </ol>
      </div>
    </div>
  )
}

export default function App() {
  const savedUrl = localStorage.getItem('gasUrl') || ''
  const [gasUrl, setGasUrl]          = useState(savedUrl)
  // Master Sheet URL – wird nach erstem Push vom Script dynamisch zurückgegeben, 
  // daher statisch auf bekannte Sheet-ID mit Tab-Anker
  const SHEET_ID = '11sOb8k38DPf_y_a5z5tlhyk1hnel5X70hQd_eR08h5A'
  const [masterSheetUrl, setMasterSheetUrl] = useState(
    `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit#gid=902971491`
  )
  const [connected, setConnected]    = useState(false)
  const [rows, setRows]              = useState([])
  const [mitarbeiterList, setMaList] = useState([])
  const [loading, setLoading]        = useState(false)
  const [pushing, setPushing]        = useState(false)
  const [clearing, setClearing]      = useState(false)
  const [error, setError]            = useState('')
  const [pushResult, setPushResult]  = useState(null)
  const [selectedRows, setSelected]  = useState(new Set())
  const [filters, setFilters]        = useState({ mitarbeiter:'', vonDatum:'', bisDatum:'', kunde:'' })

  const loadData = useCallback(async (url, params = {}) => {
    setLoading(true); setError(''); setPushResult(null)
    try {
      const res = await fetchReisezeiten(url, params)
      if (res.status !== 'ok') throw new Error(res.message)
      const withIds = res.rows.map((r, i) => ({ ...r, id: i }))
      setRows(withIds)
      setMaList(res.mitarbeiterList || [])
      setSelected(new Set(withIds.map(r => r.id)))
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [])

  const handleConnect = useCallback((url) => {
    setGasUrl(url); setConnected(true); loadData(url)
  }, [loadData])

  React.useEffect(() => {
    if (savedUrl && !connected) { setConnected(true); loadData(savedUrl) }
  }, [])

  const updateRow = useCallback((id, field, value) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r))
  }, [])

  const filteredRows = useMemo(() => rows.filter(r => {
    if (filters.mitarbeiter && r.mitarbeiter !== filters.mitarbeiter) return false
    if (filters.kunde && !r.kunde.toLowerCase().includes(filters.kunde.toLowerCase())) return false
    return true
  }), [rows, filters])

  const exportRows = useMemo(() => filteredRows.filter(r => selectedRows.has(r.id)), [filteredRows, selectedRows])

  const toggleRow = id => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleAll = () => setSelected(selectedRows.size === filteredRows.length ? new Set() : new Set(filteredRows.map(r => r.id)))

  const handlePush = async () => {
    if (!exportRows.length) return
    setPushing(true); setPushResult(null)
    try {
      const res = await pushToSheets(gasUrl, exportRows)
      if (res.sheetUrl) setMasterSheetUrl(res.sheetUrl)
      setPushResult({ ok: res.status === 'ok', msg: res.message, url: res.sheetUrl })
    } catch (e) { setPushResult({ ok: false, msg: e.message }) }
    finally { setPushing(false) }
  }

  const handleClear = async () => {
    if (!confirm('Master Reisekosten Sheet wirklich leeren? (Header bleibt)')) return
    setClearing(true)
    try {
      const res = await clearMasterSheet(gasUrl)
      setPushResult({ ok: true, msg: res.message || 'Master Sheet geleert' })
    } catch (e) { setPushResult({ ok: false, msg: e.message }) }
    finally { setClearing(false) }
  }

  if (!connected) return <SetupScreen onConnect={handleConnect} />

  return (
    <div style={{ minHeight:'100vh', padding:16, maxWidth:1700, margin:'0 auto' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        .row-sel  td { background: white !important; }
        .row-unsel td { background: #f8fafc !important; opacity: 0.4; }
        .row-hover:hover td { background: #eff6ff !important; cursor: default; }
        th { position:sticky; top:0; background:#1e3a8a; color:white; padding:7px 10px; text-align:left; font-size:11px; font-weight:600; white-space:nowrap; z-index:10; }
        td { padding:5px 10px; font-size:12px; border-bottom:1px solid #f1f5f9; vertical-align:middle; }
      `}</style>

      {/* Top Bar */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12, flexWrap:'wrap', gap:10 }}>
        <div>
          <h1 style={{ fontSize:19, fontWeight:700, color:'#1e3a8a', margin:0 }}>📋 Reisekosten Auswertung</h1>
          <a href={masterSheetUrl} target="_blank" style={{ color:'#1d4ed8', fontSize:12 }}>
            📊 Master Reisekosten öffnen →
          </a>
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
          {rows.length > 0 && <>
            <Badge color="blue">{rows.length} Einträge</Badge>
            <Badge color="green">{mitarbeiterList.length} Mitarbeiter</Badge>
            <Badge color="orange">{rows.filter(r=>r.hotel).length} Übernacht.</Badge>
          </>}
          <button onClick={() => { setConnected(false); setRows([]) }}
            style={{ padding:'7px 14px', borderRadius:8, background:'#f1f5f9', color:'#475569', fontSize:13, border:'none', cursor:'pointer' }}>⚙️ URL</button>
          <button onClick={() => exportToExcel(exportRows)} disabled={!exportRows.length}
            style={{ padding:'7px 14px', borderRadius:8, background:'#f1f5f9', color:'#475569', fontSize:13, border:'none', cursor:'pointer', opacity:exportRows.length?1:0.5 }}>
            ⬇️ Excel ({exportRows.length})
          </button>
          <button onClick={handleClear} disabled={clearing}
            style={{ padding:'7px 14px', borderRadius:8, background:'#fee2e2', color:'#dc2626', fontSize:13, border:'none', cursor:'pointer' }}>
            {clearing ? <Spinner /> : '🗑️ Master leeren'}
          </button>
          <button onClick={handlePush} disabled={pushing||!exportRows.length}
            style={{ padding:'7px 16px', borderRadius:8, background:'#16a34a', color:'white', fontSize:13, fontWeight:600, border:'none', cursor:'pointer', opacity:exportRows.length?1:0.5 }}>
            {pushing ? <><Spinner /> &nbsp;Schreibe...</> : `📤 → Google Sheets (${exportRows.length})`}
          </button>
        </div>
      </div>

      {/* Messages */}
      {error && <div style={{ marginBottom:10, padding:'10px 16px', background:'#fee2e2', color:'#dc2626', borderRadius:8, fontSize:13 }}>⚠️ {error}</div>}
      {pushResult && (
        <div style={{ marginBottom:10, padding:'10px 16px',
          background:pushResult.ok?'#f0fdf4':'#fff1f2', color:pushResult.ok?'#166534':'#dc2626',
          borderRadius:8, fontSize:13, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span>{pushResult.ok?'✅':'❌'} {pushResult.msg}</span>
          {pushResult.url && <a href={pushResult.url} target="_blank" style={{ color:'#1d4ed8', fontSize:12 }}>Sheet anzeigen →</a>}
        </div>
      )}

      {/* Filters */}
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center', padding:'10px 14px',
        background:'white', borderRadius:8, boxShadow:'0 1px 3px rgba(0,0,0,0.08)', marginBottom:12 }}>
        <span style={{ fontWeight:600, fontSize:13, color:'#475569' }}>🔍</span>
        <select value={filters.mitarbeiter} onChange={e => setFilters(f => ({...f, mitarbeiter:e.target.value}))}
          style={{ padding:'5px 10px', borderRadius:6, border:'1px solid #e2e8f0', fontSize:13 }}>
          <option value="">Alle Mitarbeiter</option>
          {mitarbeiterList.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <input type="date" value={filters.vonDatum} onChange={e => setFilters(f => ({...f, vonDatum:e.target.value}))}
          style={{ padding:'5px 10px', borderRadius:6, border:'1px solid #e2e8f0', fontSize:13 }} />
        <span style={{ color:'#94a3b8', fontSize:12 }}>–</span>
        <input type="date" value={filters.bisDatum} onChange={e => setFilters(f => ({...f, bisDatum:e.target.value}))}
          style={{ padding:'5px 10px', borderRadius:6, border:'1px solid #e2e8f0', fontSize:13 }} />
        <input type="text" value={filters.kunde} onChange={e => setFilters(f => ({...f, kunde:e.target.value}))}
          placeholder="Kunde..." style={{ padding:'5px 10px', borderRadius:6, border:'1px solid #e2e8f0', fontSize:13, minWidth:150 }} />
        <button onClick={() => setFilters({ mitarbeiter:'', vonDatum:'', bisDatum:'', kunde:'' })}
          style={{ padding:'5px 12px', borderRadius:6, background:'#f1f5f9', color:'#475569', fontSize:13, border:'none', cursor:'pointer' }}>✕</button>
        <button onClick={() => loadData(gasUrl)} disabled={loading}
          style={{ padding:'5px 12px', borderRadius:6, background:'#eff6ff', color:'#1d4ed8', fontSize:13, border:'none', cursor:'pointer' }}>
          {loading ? <Spinner /> : '🔄 Neu laden'}
        </button>
      </div>

      {/* Table */}
      <div style={{ background:'white', borderRadius:10, boxShadow:'0 1px 3px rgba(0,0,0,0.1)', overflow:'hidden' }}>
        {loading ? (
          <div style={{ padding:60, textAlign:'center', color:'#64748b' }}>
            <div style={{ marginBottom:12 }}><Spinner /></div>Lade aus Google Sheets...
          </div>
        ) : (
          <div style={{ overflowX:'auto', maxHeight:'calc(100vh - 270px)', overflowY:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', minWidth:1380 }}>
              <thead>
                <tr>
                  <th style={{ width:36 }}>
                    <input type="checkbox" checked={selectedRows.size===filteredRows.length&&filteredRows.length>0} onChange={toggleAll} />
                  </th>
                  <th>Mitarbeiter</th><th>Reiseziel</th><th>Kunde</th><th>Anlaß</th>
                  <th>Datum Von</th><th>Datum Bis</th><th>Uhr von</th><th>Uhr bis</th><th>Std.</th><th>Transport</th>
                  <th style={{ background:'#1e40af' }}>DIBA-Belege</th>
                  <th style={{ background:'#1e40af' }}>Privat km</th>
                  <th style={{ background:'#1e40af' }}>Hotel €</th>
                  <th style={{ background:'#1e40af' }}>Bewirtung €</th>
                  <th style={{ background:'#1e40af' }}>Bargeld €</th>
                  <th style={{ background:'#1e40af' }}>Verpfl. €</th>
                  <th style={{ background:'#1e40af' }}>Bemerkung</th>
                  <th>Info</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr><td colSpan={18} style={{ textAlign:'center', padding:48, color:'#94a3b8' }}>
                    {rows.length===0 ? 'Keine Daten — Bitte "Neu laden" klicken' : 'Keine Einträge für diesen Filter'}
                  </td></tr>
                ) : filteredRows.map(r => (
                  <tr key={r.id} className={`row-hover ${selectedRows.has(r.id)?'row-sel':'row-unsel'}`}>
                    <td><input type="checkbox" checked={selectedRows.has(r.id)} onChange={() => toggleRow(r.id)} /></td>
                    <td style={{ fontWeight:500, whiteSpace:'nowrap' }}>{r.mitarbeiter}</td>
                    <td style={{ minWidth:100 }}><EditCell value={r.reiseziel} onChange={v => updateRow(r.id,'reiseziel',v)} placeholder="PLZ Ort" /></td>
                    <td style={{ maxWidth:200 }}><div style={{ fontSize:11, color:'#1e40af', fontWeight:500 }}>{r.kunde}</div></td>
                    <td style={{ fontSize:11, color:'#64748b', whiteSpace:'nowrap' }}>{r.anlass}</td>
                    <td style={{ whiteSpace:'nowrap' }}>{r.datumVon}</td>
                    <td style={{ whiteSpace:'nowrap' }}>{r.datumBis}</td>
                    <td style={{ fontFamily:'monospace' }}>{r.uhrVon}</td>
                    <td style={{ fontFamily:'monospace' }}>{r.uhrBis}</td>
                    <td style={{ fontFamily:'monospace', fontWeight:600, color:'#1e40af' }}>{r.std}</td>
                    <td>
                      {r.transport && <Badge color={r.transport.includes('Privat')?'orange':r.transport.includes('Bahn')?'green':'blue'}>{r.transport.replace('Auto ','')}</Badge>}
                      {r.hotel && ' 🏨'}
                    </td>
                    <td style={{ minWidth:88 }}><EditCell value={r.dibaBeleg}   onChange={v => updateRow(r.id,'dibaBeleg',v)}   placeholder="Nr." /></td>
                    <td style={{ minWidth:76 }}><EditCell value={r.privatKm}    onChange={v => updateRow(r.id,'privatKm',v)}    placeholder="km" /></td>
                    <td style={{ minWidth:76 }}><EditCell value={r.hotelKosten} onChange={v => updateRow(r.id,'hotelKosten',v)} placeholder={r.hotel?'€':'-'} /></td>
                    <td style={{ minWidth:76 }}><EditCell value={r.bewirtung}   onChange={v => updateRow(r.id,'bewirtung',v)}   placeholder="€" /></td>
                    <td style={{ minWidth:76 }}><EditCell value={r.bargeld}     onChange={v => updateRow(r.id,'bargeld',v)}     placeholder="€" /></td>
                    <td style={{ minWidth:76 }}><EditCell value={r.verpflegung} onChange={v => updateRow(r.id,'verpflegung',v)} placeholder="€" /></td>
                    <td style={{ minWidth:120 }}><EditCell value={r.bemerkung} onChange={v => updateRow(r.id,'bemerkung',v)} placeholder="Bemerkung..." /></td>
                    <td style={{ fontSize:11, color:'#94a3b8', maxWidth:150 }}>
                      {r.weitereInfo && <span title={r.weitereInfo}>💬 {r.weitereInfo.substring(0,32)}{r.weitereInfo.length>32?'…':''}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ padding:'8px 16px', background:'#f8fafc', borderTop:'1px solid #e2e8f0', display:'flex', justifyContent:'space-between', fontSize:12, color:'#64748b' }}>
          <span>{filteredRows.length} von {rows.length} · {selectedRows.size} ausgewählt</span>
          <span>💡 Gelbe Felder editierbar · 📤 schreibt direkt in Google Sheet "Master Reisekosten"</span>
        </div>
      </div>
    </div>
  )
}
