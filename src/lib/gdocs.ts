// Kirim ke Google Docs: unggah .docx ke Google Drive milik pengguna dan minta
// Drive mengubahnya menjadi Google Docs. Izin: drive.file (hanya file yang
// dibuat Aksara, bukan seluruh Drive).
const GIS = 'https://accounts.google.com/gsi/client'
const SCOPE = 'https://www.googleapis.com/auth/drive.file'
const KEY = 'aksara-google-client-id'

export const getClientId = () => { try { return localStorage.getItem(KEY) || '' } catch { return '' } }
export const setClientId = (v: string) => { try { localStorage.setItem(KEY, v.trim()) } catch { /* abaikan */ } }

interface TokenResponse { access_token?: string; expires_in?: number; error?: string; error_description?: string }
interface TokenClient { requestAccessToken: (o?: { prompt?: string }) => void }
type GoogleNS = { accounts: { oauth2: { initTokenClient: (o: { client_id: string; scope: string; callback: (r: TokenResponse) => void; error_callback?: (e: { type: string; message?: string }) => void }) => TokenClient } } }

let scriptPromise: Promise<void> | null = null
function loadGis(): Promise<void> {
  if ((window as unknown as { google?: GoogleNS }).google?.accounts?.oauth2) return Promise.resolve()
  scriptPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = GIS
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => { scriptPromise = null; reject(new Error('Tidak bisa memuat layanan masuk Google. Periksa koneksi internet.')) }
    document.head.appendChild(s)
  })
  return scriptPromise
}

let cached: { token: string; until: number } | null = null

/** Minta izin akses (jendela Google). Harus dipanggil dari klik pengguna. */
export async function getAccessToken(clientId: string): Promise<string> {
  if (cached && cached.until > Date.now() + 60_000) return cached.token
  await loadGis()
  const google = (window as unknown as { google: GoogleNS }).google
  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (r) => {
        if (r.error || !r.access_token) { reject(new Error(r.error_description || r.error || 'Izin Google ditolak.')); return }
        cached = { token: r.access_token, until: Date.now() + (r.expires_in ?? 3000) * 1000 }
        resolve(r.access_token)
      },
      error_callback: (e) => reject(new Error(e.type === 'popup_closed' ? 'Jendela masuk Google ditutup.' : e.message || 'Tidak bisa masuk ke Google.')),
    })
    client.requestAccessToken()
  })
}

/** Unggah .docx dan jadikan Google Docs. Mengembalikan tautan dokumennya. */
export async function uploadAsGoogleDoc(token: string, name: string, docx: Blob): Promise<string> {
  const boundary = 'aksara' + Math.random().toString(36).slice(2)
  const meta = { name, mimeType: 'application/vnd.google-apps.document' }
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
    `--${boundary}\r\nContent-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document\r\n\r\n`,
    docx,
    `\r\n--${boundary}--`,
  ])
  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  })
  if (res.status === 401) { cached = null; throw new Error('Izin Google kedaluwarsa. Coba kirim lagi.') }
  if (!res.ok) {
    const err = await res.json().catch(() => null) as { error?: { message?: string } } | null
    throw new Error(err?.error?.message ? `Google Drive menolak: ${err.error.message}` : `Google Drive menolak (kode ${res.status}).`)
  }
  const j = await res.json() as { id: string; webViewLink?: string }
  return j.webViewLink || `https://docs.google.com/document/d/${j.id}/edit`
}
