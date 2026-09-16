import { createServer } from 'node:http'
import { DatabaseSync } from 'node:sqlite'
import { stat, mkdir } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto'

const rootDir = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(rootDir, 'data')
const databasePath = path.join(dataDir, 'store-dashboard.sqlite')
const staticDir = path.join(rootDir, 'dist')
const port = Number(process.env.PORT || 5174)
const host = process.env.HOST || '0.0.0.0'

await mkdir(dataDir, { recursive: true })
const database = new DatabaseSync(databasePath)
database.exec(`
  CREATE TABLE IF NOT EXISTS app_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'observer')),
    created_at TEXT NOT NULL,
    last_login_at TEXT
  );
  CREATE TABLE IF NOT EXISTS observer_store_permissions (
    user_id TEXT NOT NULL,
    store_id TEXT NOT NULL,
    PRIMARY KEY(user_id, store_id)
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
`)

const userColumns = database.prepare('PRAGMA table_info(users)').all()
if (!userColumns.some((column) => column.name === 'last_login_at')) {
  database.exec('ALTER TABLE users ADD COLUMN last_login_at TEXT')
}

const userByUsername = database.prepare('SELECT * FROM users WHERE username = ?')
const userById = database.prepare('SELECT * FROM users WHERE id = ?')
const listUsers = database.prepare('SELECT id, username, role, created_at AS createdAt, last_login_at AS lastLoginAt FROM users ORDER BY created_at')
const insertUser = database.prepare('INSERT INTO users (id, username, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)')
const updatePassword = database.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
const updateLastLogin = database.prepare('UPDATE users SET last_login_at = ? WHERE id = ?')
const deleteUser = database.prepare("DELETE FROM users WHERE id = ? AND role = 'observer'")
const getPermissions = database.prepare('SELECT store_id AS storeId FROM observer_store_permissions WHERE user_id = ?')
const deletePermissions = database.prepare('DELETE FROM observer_store_permissions WHERE user_id = ?')
const insertPermission = database.prepare('INSERT OR IGNORE INTO observer_store_permissions (user_id, store_id) VALUES (?, ?)')
const sessionByHash = database.prepare('SELECT user_id AS userId, expires_at AS expiresAt FROM sessions WHERE token_hash = ?')
const insertSession = database.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
const deleteSession = database.prepare('DELETE FROM sessions WHERE token_hash = ?')

function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`
}
function verifyPassword(password, encoded) {
  const [salt, hash] = String(encoded).split(':')
  if (!salt || !hash) return false
  const actual = scryptSync(password, salt, 64)
  const expected = Buffer.from(hash, 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
function tokenHash(token) { return createHash('sha256').update(token).digest('hex') }
function createId(prefix) { return `${prefix}_${randomBytes(8).toString('hex')}` }
function publicUser(user) {
  if (!user) return null
  const permissions = user.role === 'observer' ? getPermissions.all(user.id).map((row) => row.storeId) : undefined
  return { id: user.id, username: user.username, role: user.role, allowedStoreIds: permissions }
}
function ensureAdmin() {
  const existing = userByUsername.get('wyb')
  if (!existing) insertUser.run(createId('user'), 'wyb', hashPassword('123456'), 'admin', new Date().toISOString())
}
ensureAdmin()

const getState = database.prepare('SELECT data, updated_at AS updatedAt FROM app_state WHERE id = 1')
const putState = database.prepare(`
  INSERT INTO app_state (id, data, updated_at) VALUES (1, ?, ?)
  ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
`)

function sendJson(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': response.req?.headers.origin || '*',
    'Access-Control-Allow-Credentials': 'true',
  })
  response.end(JSON.stringify(body))
}

function getSessionUser(request) {
  const cookie = request.headers.cookie || ''
  const match = cookie.match(/(?:^|;\s*)session=([^;]+)/)
  if (!match) return null
  const row = sessionByHash.get(tokenHash(decodeURIComponent(match[1])))
  if (!row || new Date(row.expiresAt) <= new Date()) return null
  return userById.get(row.userId) || null
}
function requireUser(request, response, role) {
  const user = getSessionUser(request)
  if (!user) { sendJson(response, 401, { message: '请先登录' }); return null }
  if (role && user.role !== role) { sendJson(response, 403, { message: '没有权限执行此操作' }); return null }
  return user
}
function setCookie(response, token, maxAge) {
  response.setHeader('Set-Cookie', `session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`)
}

function isAppData(value) {
  return Boolean(value && typeof value === 'object'
    && Array.isArray(value.stores)
    && Array.isArray(value.records)
    && Array.isArray(value.targets))
}

async function readBody(request) {
  let body = ''
  for await (const chunk of request) {
    body += chunk
    if (body.length > 20 * 1024 * 1024) throw new Error('请求数据超过 20 MB')
  }
  return JSON.parse(body)
}

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
}

async function serveStatic(response, pathname) {
  const requestedPath = pathname === '/' ? '/index.html' : pathname
  const filePath = path.resolve(staticDir, `.${requestedPath}`)
  if (!filePath.startsWith(`${staticDir}${path.sep}`)) {
    response.writeHead(400)
    response.end('Bad request')
    return
  }
  try {
    const fileStat = await stat(filePath)
    if (!fileStat.isFile()) throw new Error('not a file')
    response.writeHead(200, {
      'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream',
      'Cache-Control': filePath.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable',
    })
    createReadStream(filePath).pipe(response)
  } catch {
    if (pathname.includes('.')) {
      response.writeHead(404)
      response.end('Not found')
      return
    }
    await serveStatic(response, '/index.html')
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)
  if (url.pathname === '/api/data' && request.method === 'OPTIONS') {
    response.writeHead(204, {
      'Access-Control-Allow-Origin': request.headers.origin || '*',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    })
    response.end()
    return
  }
  if (url.pathname === '/api/auth/login' && request.method === 'POST') {
    try {
      const payload = await readBody(request)
      const user = userByUsername.get(String(payload?.username || '').trim())
      if (!user || !verifyPassword(String(payload?.password || ''), user.password_hash)) {
        sendJson(response, 401, { message: '用户名或密码错误' }); return
      }
      const token = randomBytes(32).toString('hex')
      insertSession.run(tokenHash(token), user.id, new Date(Date.now() + 7 * 86400000).toISOString())
      updateLastLogin.run(new Date().toISOString(), user.id)
      setCookie(response, token, 7 * 86400)
      sendJson(response, 200, { user: publicUser(user) })
    } catch (error) { sendJson(response, 400, { message: error instanceof Error ? error.message : '登录失败' }) }
    return
  }
  if (url.pathname === '/api/auth/logout' && request.method === 'POST') {
    const cookie = request.headers.cookie || ''; const match = cookie.match(/(?:^|;\s*)session=([^;]+)/)
    if (match) deleteSession.run(tokenHash(decodeURIComponent(match[1])))
    setCookie(response, '', 0); sendJson(response, 200, { ok: true }); return
  }
  if (url.pathname === '/api/auth/me' && request.method === 'GET') {
    const user = requireUser(request, response); if (user) sendJson(response, 200, { user: publicUser(user) }); return
  }
  if (url.pathname === '/api/users' && request.method === 'GET') {
    if (!requireUser(request, response, 'admin')) return
    sendJson(response, 200, { users: listUsers.all().map((user) => ({ ...user, allowedStoreIds: getPermissions.all(user.id).map((row) => row.storeId) })) }); return
  }
  if (url.pathname === '/api/users' && request.method === 'POST') {
    if (!requireUser(request, response, 'admin')) return
    try { const payload = await readBody(request); const username = String(payload?.username || '').trim(); const password = String(payload?.password || '')
      if (!username || !password) { sendJson(response, 400, { message: '用户名和密码不能为空' }); return }
      const id = createId('user'); insertUser.run(id, username, hashPassword(password), 'observer', new Date().toISOString());
      for (const storeId of Array.isArray(payload?.allowedStoreIds) ? payload.allowedStoreIds : []) insertPermission.run(id, String(storeId))
      sendJson(response, 201, { user: publicUser(userById.get(id)) })
    } catch (error) { sendJson(response, 400, { message: error instanceof Error && error.message.includes('UNIQUE') ? '用户名已存在' : '创建用户失败' }) }
    return
  }
  const userMatch = url.pathname.match(/^\/api\/users\/([^/]+)(?:\/permissions)?$/)
  const passwordMatch = url.pathname.match(/^\/api\/users\/([^/]+)\/password$/)
  if (passwordMatch && request.method === 'PUT') {
    if (!requireUser(request, response, 'admin')) return
    const user = userById.get(passwordMatch[1])
    if (!user) { sendJson(response, 404, { message: '用户不存在' }); return }
    try {
      const payload = await readBody(request)
      const password = String(payload?.password || '')
      if (!password) { sendJson(response, 400, { message: '新密码不能为空' }); return }
      updatePassword.run(hashPassword(password), user.id)
      sendJson(response, 200, { ok: true })
    } catch (error) { sendJson(response, 400, { message: error instanceof Error ? error.message : '修改密码失败' }) }
    return
  }
  if (userMatch && url.pathname.endsWith('/permissions')) {
    if (!requireUser(request, response, 'admin')) return
    const user = userById.get(userMatch[1]); if (!user || user.role !== 'observer') { sendJson(response, 404, { message: '观察者不存在' }); return }
    if (request.method === 'GET') { sendJson(response, 200, { allowedStoreIds: getPermissions.all(user.id).map((row) => row.storeId) }); return }
    if (request.method === 'PUT') { try { const payload = await readBody(request); deletePermissions.run(user.id); for (const storeId of Array.isArray(payload?.allowedStoreIds) ? payload.allowedStoreIds : []) insertPermission.run(user.id, String(storeId)); sendJson(response, 200, { allowedStoreIds: getPermissions.all(user.id).map((row) => row.storeId) }) } catch { sendJson(response, 400, { message: '保存权限失败' }) } return }
  }
  const deleteMatch = url.pathname.match(/^\/api\/users\/([^/]+)$/)
  if (deleteMatch && request.method === 'DELETE') { if (!requireUser(request, response, 'admin')) return; deleteUser.run(deleteMatch[1]); sendJson(response, 200, { ok: true }); return }
  if (url.pathname === '/api/data' && request.method === 'GET') {
    const user = requireUser(request, response); if (!user) return
    const row = getState.get()
    if (!row) {
      sendJson(response, 404, { message: '数据库尚未初始化' })
      return
    }
    try {
      const data = JSON.parse(row.data)
      if (user.role === 'observer') { const allowed = new Set(getPermissions.all(user.id).map((item) => item.storeId)); data.stores = data.stores.filter((store) => allowed.has(store.id)); data.records = data.records.filter((record) => allowed.has(record.storeId)); data.targets = data.targets.filter((target) => allowed.has(target.storeId)) }
      sendJson(response, 200, { data, updatedAt: row.updatedAt })
    } catch {
      sendJson(response, 500, { message: '数据库中的数据格式无效' })
    }
    return
  }
  if (url.pathname === '/api/data' && request.method === 'PUT') {
    if (!requireUser(request, response, 'admin')) return
    try {
      const payload = await readBody(request)
      const data = payload?.data
      if (!isAppData(data)) {
        sendJson(response, 400, { message: '数据格式无效' })
        return
      }
      const updatedAt = new Date().toISOString()
      putState.run(JSON.stringify(data), updatedAt)
      sendJson(response, 200, { data, updatedAt })
    } catch (error) {
      sendJson(response, 400, { message: error instanceof Error ? error.message : '保存数据失败' })
    }
    return
  }
  if (url.pathname.startsWith('/api/')) {
    sendJson(response, 404, { message: '接口不存在' })
    return
  }
  await serveStatic(response, url.pathname)
})

server.listen(port, host, () => {
  console.log(`Store dashboard server listening on http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`)
  console.log(`SQLite database: ${databasePath}`)
})
