/**
 * Accès à Supabase avec la clé de service (uniquement côté serveur, dans les secrets GitHub).
 * API REST et Storage appelées directement, sans dépendance.
 */
const base = () => {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY doivent être définis (secrets GitHub).')
  return { url: url.replace(/\/$/, ''), headers: { apikey: key, Authorization: `Bearer ${key}` } }
}

async function check(res, what) {
  if (!res.ok) throw new Error(`Supabase ${what} : HTTP ${res.status} ${await res.text()}`)
  return res
}

/** Lit toute une table, par pages de 1000 lignes. */
export async function selectAll(table, columns = '*') {
  const { url, headers } = base()
  const out = []
  for (let from = 0; ; from += 1000) {
    const res = await check(
      await fetch(`${url}/rest/v1/${table}?select=${columns}`, { headers: { ...headers, Range: `${from}-${from + 999}`, 'Range-Unit': 'items' } }),
      `lecture ${table}`
    )
    const page = await res.json()
    out.push(...page)
    if (page.length < 1000) return out
  }
}

/** Insère ou met à jour, par paquets de 500. */
export async function upsert(table, rows, onConflict) {
  const { url, headers } = base()
  for (let i = 0; i < rows.length; i += 500)
    await check(
      await fetch(`${url}/rest/v1/${table}?on_conflict=${onConflict}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(rows.slice(i, i + 500))
      }),
      `écriture ${table}`
    )
}

export async function remove(table, column, values) {
  if (!values.length) return
  const { url, headers } = base()
  for (let i = 0; i < values.length; i += 200) {
    const list = values.slice(i, i + 200).map((v) => `"${String(v).replace(/"/g, '')}"`).join(',')
    await check(await fetch(`${url}/rest/v1/${table}?${column}=in.(${list})`, { method: 'DELETE', headers }), `suppression ${table}`)
  }
}

/** Dépose un fichier dans un bucket privé (remplace l'existant). */
export async function uploadObject(bucket, path, body, contentType) {
  const { url, headers } = base()
  await check(
    await fetch(`${url}/storage/v1/object/${bucket}/${path}`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': contentType, 'x-upsert': 'true', 'Cache-Control': 'no-cache' },
      body
    }),
    `dépôt ${bucket}/${path}`
  )
}
