// Netlify Function: Proxy für Google Apps Script (umgeht CORS)
exports.handler = async function(event) {
  const GAS_URL = process.env.GAS_URL || event.queryStringParameters?.gasUrl

  if (!GAS_URL) {
    return { statusCode: 400, body: JSON.stringify({ status: 'error', message: 'GAS_URL fehlt' }) }
  }

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  }

  // OPTIONS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' }
  }

  try {
    let targetUrl = GAS_URL
    let fetchOptions = { redirect: 'follow' }

    if (event.httpMethod === 'GET') {
      // GET: Query-Parameter weiterleiten (außer gasUrl)
      const params = { ...event.queryStringParameters }
      delete params.gasUrl
      const qs = new URLSearchParams(params).toString()
      if (qs) targetUrl += '?' + qs
      fetchOptions.method = 'GET'

    } else if (event.httpMethod === 'POST') {
      // POST: Body als FormData weiterleiten
      const body = JSON.parse(event.body || '{}')
      const formData = new URLSearchParams()
      Object.entries(body).forEach(([k, v]) => formData.append(k, typeof v === 'object' ? JSON.stringify(v) : v))
      fetchOptions.method = 'POST'
      fetchOptions.body = formData.toString()
      fetchOptions.headers = { 'Content-Type': 'application/x-www-form-urlencoded' }
    }

    const res = await fetch(targetUrl, fetchOptions)
    const text = await res.text()

    return { statusCode: 200, headers, body: text }

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ status: 'error', message: err.message })
    }
  }
}
