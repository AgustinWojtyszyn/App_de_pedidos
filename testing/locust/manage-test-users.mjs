import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '../..')
dotenv.config({ path: path.join(root, '.env') })

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const ADMIN_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
const PUBLIC_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
const PREAUTH = process.env.LOCUST_PREAUTH === '1'
const PREAUTH_INTERVAL_MS = Math.max(Number(process.env.LOCUST_PREAUTH_INTERVAL_MS || 650), 250)
const COUNT = Number(process.env.LOCUST_TEST_USERS || 250)
const PASSWORD = process.env.LOCUST_TEST_PASSWORD || 'LocustTest-2026!'
const COMPANY_SLUG = process.env.LOCUST_COMPANY_SLUG || 'epse'
const LOCATION = process.env.LOCUST_LOCATION || 'Padre Bueno'
const PREFIX = 'locust.load.'
const DOMAIN = '@servifood.test'
const CSV_PATH = path.join(__dirname, '.users.csv')

if (!SUPABASE_URL || !ADMIN_KEY) {
  console.error('Faltan VITE_SUPABASE_URL/SUPABASE_URL o SUPABASE_SECRET_KEY (también se acepta SUPABASE_SERVICE_ROLE_KEY) en .env')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, ADMIN_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

const publicSupabase = PUBLIC_KEY
  ? createClient(SUPABASE_URL, PUBLIC_KEY, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
    })
  : null

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))
const todayArgentina = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/San_Juan',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date())

const emailFor = (index) => `${PREFIX}${String(index).padStart(4, '0')}${DOMAIN}`

async function listSyntheticAuthUsers() {
  const found = []
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    const users = data?.users || []
    found.push(...users.filter(user => (user.email || '').startsWith(PREFIX)))
    if (users.length < 1000) break
  }
  return found
}

async function ensureUser(index, existingByEmail) {
  const email = emailFor(index)
  let user = existingByEmail.get(email)

  if (!user) {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: `Locust Test ${index}` }
    })
    if (error) throw error
    user = data.user
  } else {
    const { data, error } = await supabase.auth.admin.updateUserById(user.id, {
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: `Locust Test ${index}` }
    })
    if (error) throw error
    user = data.user
  }

  const { error: profileError } = await supabase
    .from('users')
    .upsert({
      id: user.id,
      email,
      full_name: `Locust Test ${index}`,
      role: 'user'
    }, { onConflict: 'id' })
  if (profileError) throw profileError

  const { error: dailyProfileError } = await supabase
    .from('user_daily_company_profiles')
    .upsert({
      user_id: user.id,
      active_date: todayArgentina(),
      company_slug: COMPANY_SLUG,
      location: LOCATION
    }, { onConflict: 'user_id,active_date' })

  if (dailyProfileError && dailyProfileError.code !== '42P01') {
    throw dailyProfileError
  }

  return {
    email,
    password: PASSWORD,
    company_slug: COMPANY_SLUG,
    location: LOCATION,
    user_id: user.id,
    access_token: ''
  }
}

async function preauthenticate(row) {
  if (!publicSupabase) {
    throw new Error('LOCUST_PREAUTH=1 requiere VITE_SUPABASE_PUBLISHABLE_KEY/SUPABASE_PUBLISHABLE_KEY')
  }

  for (let attempt = 1; attempt <= 8; attempt += 1) {
    const { data, error } = await publicSupabase.auth.signInWithPassword({
      email: row.email,
      password: row.password
    })

    const accessToken = data?.session?.access_token || ''
    const userId = data?.user?.id || row.user_id || ''

    if (!error && accessToken && userId) {
      return { ...row, access_token: accessToken, user_id: userId }
    }

    const rateLimited =
      error?.status === 429 ||
      error?.code === 'over_request_rate_limit' ||
      /rate limit/i.test(error?.message || '')

    if (!rateLimited || attempt === 8) {
      throw error || new Error(`No se pudo preautenticar ${row.email}`)
    }

    const backoff = Math.min(10000, attempt * 1500)
    console.log(`  Auth limitado para ${row.email}; reintento ${attempt}/8 en ${backoff} ms`)
    await sleep(backoff)
  }

  throw new Error(`No se pudo preautenticar ${row.email}`)
}

async function seed() {
  console.log(`Creando/actualizando ${COUNT} usuarios Locust...`)
  const existing = await listSyntheticAuthUsers()
  const existingByEmail = new Map(existing.map(user => [user.email, user]))
  const rows = []

  for (let start = 1; start <= COUNT; start += 10) {
    const batch = []
    for (let index = start; index < Math.min(start + 10, COUNT + 1); index += 1) {
      batch.push(ensureUser(index, existingByEmail))
    }
    const result = await Promise.all(batch)
    rows.push(...result)
    console.log(`  ${rows.length}/${COUNT}`)
    if (rows.length < COUNT) await sleep(250)
  }

  let finalRows = rows
  if (PREAUTH) {
    console.log(`Preautenticando ${rows.length} sesiones a ritmo controlado...`)
    finalRows = []
    for (let index = 0; index < rows.length; index += 1) {
      const sessionRow = await preauthenticate(rows[index])
      finalRows.push(sessionRow)
      if ((index + 1) % 10 === 0 || index + 1 === rows.length) {
        console.log(`  sesiones listas: ${index + 1}/${rows.length}`)
      }
      if (index + 1 < rows.length) await sleep(PREAUTH_INTERVAL_MS)
    }
  }

  const header = 'email,password,company_slug,location,user_id,access_token\n'
  const body = finalRows
    .map(row => [
      row.email,
      row.password,
      row.company_slug,
      row.location,
      row.user_id || '',
      row.access_token || ''
    ]
      .map(value => `"${String(value).replaceAll('"', '""')}"`).join(','))
    .join('\n')
  fs.writeFileSync(CSV_PATH, header + body + '\n', 'utf8')

  console.log(`OK: ${finalRows.length} usuarios ficticios listos${PREAUTH ? ' con sesión precargada' : ''}.`)
  console.log(`Credenciales locales: ${CSV_PATH}`)
}

async function cleanup() {
  console.log('Eliminando datos Locust...')

  const { error: ordersError } = await supabase
    .from('orders')
    .delete()
    .like('customer_email', `${PREFIX}%${DOMAIN}`)
  if (ordersError) throw ordersError

  const users = await listSyntheticAuthUsers()
  for (let start = 0; start < users.length; start += 10) {
    const batch = users.slice(start, start + 10)
    await Promise.all(batch.map(async user => {
      const { error } = await supabase.auth.admin.deleteUser(user.id)
      if (error) throw error
    }))
    console.log(`  usuarios eliminados: ${Math.min(start + 10, users.length)}/${users.length}`)
    if (start + 10 < users.length) await sleep(250)
  }

  if (fs.existsSync(CSV_PATH)) fs.unlinkSync(CSV_PATH)
  console.log('OK: pedidos y usuarios ficticios Locust eliminados.')
}

const command = process.argv[2] || 'seed'
if (command === 'seed') {
  await seed()
} else if (command === 'cleanup') {
  await cleanup()
} else {
  console.error('Uso: node testing/locust/manage-test-users.mjs [seed|cleanup]')
  process.exit(1)
}
