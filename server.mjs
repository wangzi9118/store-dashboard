import { createServer } from 'node:http'
import { DatabaseSync } from 'node:sqlite'
import { stat, mkdir, rename, unlink } from 'node:fs/promises'
import { createReadStream, createWriteStream } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto'

const rootDir = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(rootDir, 'data')
const databasePath = path.join(dataDir, 'store-dashboard.sqlite')
const staticDir = path.join(rootDir, 'dist')
const port = Number(process.env.PORT || 5174)
const host = process.env.HOST || '0.0.0.0'

const SCHEMA = `
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
`

let database
let userByUsername, userById, listUsers, insertUser, updatePassword, updateLastLogin, deleteUser
let getPermissions, deletePermissions, insertPermission
let sessionByHash, insertSession, deleteSession
let getState, putState

async function openDatabase() {
  await mkdir(dataDir, { recursive: true })
  database = new DatabaseSync(databasePath)
  database.exec(SCHEMA)

  const userColumns = database.prepare('PRAGMA table_info(users)').all()
  if (!userColumns.some((column) => column.name === 'last_login_at')) {
    database.exec('ALTER TABLE users ADD COLUMN last_login_at TEXT')
  }

  userByUsername = database.prepare('SELECT * FROM users WHERE username = ?')
  userById = database.prepare('SELECT * FROM users WHERE id = ?')
  listUsers = database.prepare('SELECT id, username, role, created_at AS createdAt, last_login_at AS lastLoginAt FROM users ORDER BY created_at')
  insertUser = database.prepare('INSERT INTO users (id, username, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)')
  updatePassword = database.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
  updateLastLogin = database.prepare('UPDATE users SET last_login_at = ? WHERE id = ?')
  deleteUser = database.prepare("DELETE FROM users WHERE id = ? AND role = 'observer'")
  getPermissions = database.prepare('SELECT store_id AS storeId FROM observer_store_permissions WHERE user_id = ?')
  deletePermissions = database.prepare('DELETE FROM observer_store_permissions WHERE user_id = ?')
  insertPermission = database.prepare('INSERT OR IGNORE INTO observer_store_permissions (user_id, store_id) VALUES (?, ?)')
  sessionByHash = database.prepare('SELECT user_id AS userId, expires_at AS expiresAt FROM sessions WHERE token_hash = ?')
  insertSession = database.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
  deleteSession = database.prepare('DELETE FROM sessions WHERE token_hash = ?')
  getState = database.prepare('SELECT data, updated_at AS updatedAt FROM app_state WHERE id = 1')
  putState = database.prepare(`
    INSERT INTO app_state (id, data, updated_at) VALUES (1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
  `)
}

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
async function ensureAdmin() {
  const existing = userByUsername.get('wyb')
  if (!existing) insertUser.run(createId('user'), 'wyb', hashPassword('123456'), 'admin', new Date().toISOString())
}

await openDatabase()
await ensureAdmin()

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
  if (url.pathname === '/api/database/export' && request.method === 'GET') {
    if (!requireUser(request, response, 'admin')) return
    const backupPath = path.join(dataDir, `store-dashboard-export-${Date.now()}.sqlite`)
    try {
      database.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`)
      const fileStat = await stat(backupPath)
      response.writeHead(200, {
        'Content-Type': 'application/vnd.sqlite3',
        'Content-Disposition': 'attachment; filename="store-dashboard.sqlite"',
        'Content-Length': fileStat.size,
        'Cache-Control': 'no-store',
      })
      const stream = createReadStream(backupPath)
      stream.on('error', () => { try { response.end() } catch { /* 客户端已断开 */ } })
      stream.on('end', () => { void unlink(backupPath).catch(() => {}) })
      stream.pipe(response)
    } catch (error) {
      void unlink(backupPath).catch(() => {})
      sendJson(response, 500, { message: error instanceof Error ? error.message : '导出数据库失败' })
    }
    return
  }

  if (url.pathname === '/api/database/import' && request.method === 'POST') {
    if (!requireUser(request, response, 'admin')) return
    const tmpPath = path.join(dataDir, `store-dashboard-import-${Date.now()}.sqlite`)
    let out
    try {
      out = createWriteStream(tmpPath)
      const sizeLimit = 200 * 1024 * 1024
      let total = 0
      let tooBig = false
      for await (const chunk of request) {
        total += chunk.length
        if (total > sizeLimit) { tooBig = true; break }
        if (!out.write(chunk)) { await new Promise((resolve) => out.once('drain', resolve)) }
      }
      if (tooBig) { sendJson(response, 413, { message: '数据库文件超过 200 MB' }); return }
      out.end()
      await new Promise((resolve, reject) => { out.on('finish', resolve); out.on('error', reject) })

      // 校验文件确实是本系统的 SQLite 数据库
      let probe = null
      try {
        probe = new DatabaseSync(tmpPath)
        const tables = probe.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name)
        for (const table of ['app_state', 'users', 'observer_store_permissions', 'sessions']) {
          if (!tables.includes(table)) { sendJson(response, 400, { message: `缺少数据表 ${table}，不是本系统的数据库文件` }); return }
        }
        const admin = probe.prepare("SELECT count(*) AS c FROM users WHERE role = 'admin'").get()
        if (!admin || admin.c < 1) { sendJson(response, 400, { message: '导入的数据库没有管理员账号，导入后无法登录' }); return }
      } catch (error) {
        if (response.headersSent) throw error
        if (probe) { try { probe.close() } catch { /* 已关闭 */ } }
        void unlink(tmpPath).catch(() => {})
        sendJson(response, 400, { message: '不是有效的 SQLite 数据库文件' })
        return
      }
      probe.close()

      // 先安全导出当前库作为备份，再替换
      const backupPath = path.join(dataDir, `store-dashboard-backup-${Date.now()}.sqlite`)
      try { database.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`) } catch { /* 备份失败仍允许导入 */ }
      database.close()
      try {
        await rename(tmpPath, databasePath)
      } catch (error) {
        await openDatabase()
        void unlink(backupPath).catch(() => {})
        sendJson(response, 500, { message: error instanceof Error ? error.message : '替换数据库文件失败' })
        return
      }
      await openDatabase()
      sendJson(response, 200, { ok: true, backup: path.basename(backupPath) })
    } catch (error) {
      void unlink(tmpPath).catch(() => {})
      if (!response.headersSent) sendJson(response, 500, { message: error instanceof Error ? error.message : '导入数据库失败' })
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
