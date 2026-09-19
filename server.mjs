import { createServer } from 'node:http'
import { stat } from 'node:fs/promises'
import { createReadStream, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto'
import mysql from 'mysql2/promise'

const rootDir = path.dirname(fileURLToPath(import.meta.url))
if (existsSync(path.join(rootDir, '.env'))) {
  process.loadEnvFile?.(path.join(rootDir, '.env'))
}
const staticDir = path.join(rootDir, 'dist')
const port = Number(process.env.PORT || 5174)
const host = process.env.HOST || '0.0.0.0'
for (const name of ['MYSQL_HOST', 'MYSQL_USER', 'MYSQL_PASSWORD', 'MYSQL_DATABASE']) if (!process.env[name]) throw new Error(`缺少必需的环境变量 ${name}`)
const pool = mysql.createPool({ host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306), user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE, waitForConnections: true, connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT || 10), charset: 'utf8mb4', ssl: process.env.MYSQL_SSL === 'true' ? {} : undefined })
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS app_state (id TINYINT UNSIGNED PRIMARY KEY, data LONGTEXT NOT NULL, updated_at DATETIME(3) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS users (id VARCHAR(64) PRIMARY KEY, username VARCHAR(191) NOT NULL UNIQUE, password_hash VARCHAR(255) NOT NULL, role VARCHAR(16) NOT NULL, can_edit_data TINYINT(1) NOT NULL DEFAULT 0, can_manage_stores TINYINT(1) NOT NULL DEFAULT 0, created_at DATETIME(3) NOT NULL, last_login_at DATETIME(3) NULL, INDEX users_role_idx (role)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS observer_store_permissions (user_id VARCHAR(64) NOT NULL, store_id VARCHAR(191) NOT NULL, PRIMARY KEY(user_id, store_id), CONSTRAINT permissions_user_fk FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS sessions (token_hash CHAR(64) PRIMARY KEY, user_id VARCHAR(64) NOT NULL, expires_at DATETIME(3) NOT NULL, INDEX sessions_expires_idx (expires_at), CONSTRAINT sessions_user_fk FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS templates (id TINYINT UNSIGNED PRIMARY KEY, filename VARCHAR(255) NOT NULL, file_data MEDIUMBLOB NOT NULL, file_size INT UNSIGNED NOT NULL, updated_at DATETIME(3) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
]
async function query(sql, params = []) { const [rows] = await pool.execute(sql, params); return rows }
async function one(sql, params = []) { return (await query(sql, params))[0] || null }
async function initDatabase() {
  for (const statement of SCHEMA) await pool.query(statement)
  const columns = await query('SELECT column_name AS name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = \'users\'')
  if (!columns.some((column) => column.name === 'can_edit_data')) await query('ALTER TABLE users ADD COLUMN can_edit_data TINYINT(1) NOT NULL DEFAULT 0')
  if (!columns.some((column) => column.name === 'can_manage_stores')) await query('ALTER TABLE users ADD COLUMN can_manage_stores TINYINT(1) NOT NULL DEFAULT 0')
  await query('DELETE FROM sessions WHERE expires_at <= UTC_TIMESTAMP(3)')
}
function hashPassword(password, salt = randomBytes(16).toString('hex')) { return `${salt}:${scryptSync(password, salt, 64).toString('hex')}` }
function verifyPassword(password, encoded) { const [salt, hash] = String(encoded).split(':'); if (!salt || !hash) return false; const actual = scryptSync(password, salt, 64); const expected = Buffer.from(hash, 'hex'); return actual.length === expected.length && timingSafeEqual(actual, expected) }
function tokenHash(token) { return createHash('sha256').update(token).digest('hex') }
function createId(prefix) { return `${prefix}_${randomBytes(8).toString('hex')}` }
async function permissions(userId) { return (await query('SELECT store_id AS storeId FROM observer_store_permissions WHERE user_id = ?', [userId])).map((row) => row.storeId) }
async function publicUser(user) { return user ? { id: user.id, username: user.username, role: user.role, allowedStoreIds: user.role === 'observer' ? await permissions(user.id) : undefined, canEditData: user.role === 'admin' || Boolean(user.can_edit_data), canManageStores: user.role === 'admin' || Boolean(user.can_manage_stores) } : null }
async function ensureAdmin() { if (!await one('SELECT id FROM users WHERE username = ?', ['wyb'])) { await query('INSERT INTO users (id, username, password_hash, role, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP(3))', [createId('user'), 'wyb', hashPassword(process.env.DEFAULT_ADMIN_PASSWORD || '123456'), 'admin']); console.warn('已创建默认管理员 wyb，请立即修改密码') } }
await initDatabase(); await ensureAdmin()
function sendJson(response, status, body) { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': response.req?.headers.origin || '*', 'Access-Control-Allow-Credentials': 'true' }); response.end(JSON.stringify(body)) }
function sessionToken(request) { const match = (request.headers.cookie || '').match(/(?:^|;\s*)session=([^;]+)/); if (!match) return null; try { return decodeURIComponent(match[1]) } catch { return null } }
async function sessionUser(request) { const token = sessionToken(request); if (!token) return null; return one('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP(3)', [tokenHash(token)]) }
async function requireUser(request, response, role) { const user = await sessionUser(request); if (!user) { sendJson(response, 401, { message: '请先登录' }); return null } if (role && user.role !== role) { sendJson(response, 403, { message: '没有权限执行此操作' }); return null } return user }
function setCookie(response, token, maxAge) { response.setHeader('Set-Cookie', `session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`) }
function validData(value) { return Boolean(value && typeof value === 'object' && Array.isArray(value.stores) && Array.isArray(value.records) && Array.isArray(value.targets)) }
function canEditData(user) { return user.role === 'admin' || Boolean(user.can_edit_data) }
function canManageStores(user) { return user.role === 'admin' || Boolean(user.can_manage_stores) }
async function visibleStoreIds(user, data) {
  if (user.role === 'admin') return new Set(data.stores.map((store) => store.id))
  const granted = new Set(await permissions(user.id))
  return new Set(data.stores.filter((store) => store.ownerUserId === user.id || granted.has(store.id)).map((store) => store.id))
}
function writableStoreIds(user, data) {
  if (user.role === 'admin') return new Set(data.stores.map((store) => store.id))
  return new Set(data.stores.filter((store) => store.ownerUserId === user.id).map((store) => store.id))
}
function storeNameForObserver(user, name) {
  const prefix = `${user.username}-`
  const raw = String(name || '').trim()
  return raw.toLocaleLowerCase().startsWith(prefix.toLocaleLowerCase()) ? `${prefix}${raw.slice(prefix.length)}` : `${prefix}${raw}`
}
function mergeObserverData(current, incoming, user, writableIds, allowCreateStores, allowEditRecords) {
  const currentById = new Map(current.stores.map((store) => [store.id, store]))
  const incomingStores = Array.isArray(incoming.stores) ? incoming.stores : []
  const incomingStoreIds = new Set(incomingStores.map((store) => store.id))
  const deletedOwnedStoreIds = allowCreateStores ? new Set([...writableIds].filter((storeId) => !incomingStoreIds.has(storeId))) : new Set()
  const stores = current.stores.filter((store) => !writableIds.has(store.id) || incomingStoreIds.has(store.id) || !allowCreateStores).map((store) => {
    if (!writableIds.has(store.id) || !allowCreateStores) return store
    const next = incomingStores.find((item) => item.id === store.id)
    return next ? { ...store, ...next, name: store.ownerUserId === user.id ? storeNameForObserver(user, next.name) : store.name, ownerUserId: store.ownerUserId } : store
  })
  for (const raw of incomingStores) {
    if (currentById.has(raw.id)) continue
    if (!allowCreateStores) continue
    const store = { ...raw, name: storeNameForObserver(user, raw.name), ownerUserId: user.id }
    stores.push(store)
    writableIds.add(store.id)
  }
  const records = allowEditRecords
    ? current.records.filter((record) => !writableIds.has(record.storeId) || incoming.records.some((item) => item.id === record.id))
    : current.records.filter((record) => !deletedOwnedStoreIds.has(record.storeId))
  for (const record of allowEditRecords ? incoming.records.filter((item) => writableIds.has(item.storeId)) : []) {
    const index = records.findIndex((item) => item.id === record.id)
    if (index >= 0) records[index] = record
    else records.push(record)
  }
  const targets = allowEditRecords
    ? current.targets.filter((target) => !writableIds.has(target.storeId) || incoming.targets.some((item) => item.id === target.id))
    : current.targets.filter((target) => !deletedOwnedStoreIds.has(target.storeId))
  for (const target of allowEditRecords ? incoming.targets.filter((item) => writableIds.has(item.storeId)) : []) {
    const index = targets.findIndex((item) => item.id === target.id)
    if (index >= 0) targets[index] = target
    else targets.push(target)
  }
  return { ...current, stores, records, targets }
}
async function readBody(request) { let body = ''; for await (const chunk of request) { body += chunk; if (body.length > 20 * 1024 * 1024) throw new Error('请求数据超过 20 MB') }; return JSON.parse(body) }
async function readRawBody(request, limit = 10 * 1024 * 1024) {
  const chunks = []
  let total = 0
  for await (const chunk of request) {
    total += chunk.length
    if (total > limit) throw new Error(`请求大小超过限制 (${Math.round(limit / (1024 * 1024))}MB)`)
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}
function parseMultipartFormData(buffer, boundary) {
  const bBuf = Buffer.from('--' + boundary)
  let start = buffer.indexOf(bBuf)
  if (start === -1) return null
  start += bBuf.length
  if (buffer[start] === 13 && buffer[start + 1] === 10) start += 2
  const headerEnd = buffer.indexOf(Buffer.from('\r\n\r\n'), start)
  if (headerEnd === -1) return null
  const headerStr = buffer.subarray(start, headerEnd).toString('utf8')
  const filenameMatch = headerStr.match(/filename\*?=(?:UTF-8'')?"?([^";\r\n]+)"?/i)
  let filename = filenameMatch ? filenameMatch[1].trim() : 'template.xlsx'
  try { filename = decodeURIComponent(filename) } catch {}
  const dataStart = headerEnd + 4
  const nextBoundary = buffer.indexOf(bBuf, dataStart)
  if (nextBoundary === -1) return null
  let dataEnd = nextBoundary
  if (buffer[dataEnd - 2] === 13 && buffer[dataEnd - 1] === 10) dataEnd -= 2
  const data = buffer.subarray(dataStart, dataEnd)
  return { filename, data }
}
const mimeTypes = { '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' }
async function serveStatic(response, pathname) { const requested = pathname === '/' ? '/index.html' : pathname; const filePath = path.resolve(staticDir, `.${requested}`); if (!filePath.startsWith(`${staticDir}${path.sep}`)) { response.writeHead(400); response.end('Bad request'); return }; try { const fileStat = await stat(filePath); if (!fileStat.isFile()) throw new Error('not file'); response.writeHead(200, { 'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream', 'Cache-Control': filePath.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable' }); createReadStream(filePath).pipe(response) } catch { if (pathname.includes('.')) { response.writeHead(404); response.end('Not found'); return }; await serveStatic(response, '/index.html') } }

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)
    if (url.pathname === '/api/data' && request.method === 'OPTIONS') { response.writeHead(204, { 'Access-Control-Allow-Origin': request.headers.origin || '*', 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }); response.end(); return }
    if (url.pathname === '/api/auth/login' && request.method === 'POST') { const payload = await readBody(request); const user = await one('SELECT * FROM users WHERE username = ?', [String(payload?.username || '').trim()]); if (!user || !verifyPassword(String(payload?.password || ''), user.password_hash)) { sendJson(response, 401, { message: '用户名或密码错误' }); return }; const token = randomBytes(32).toString('hex'); await query('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)', [tokenHash(token), user.id, new Date(Date.now() + 7 * 86400000)]); await query('UPDATE users SET last_login_at = UTC_TIMESTAMP(3) WHERE id = ?', [user.id]); setCookie(response, token, 7 * 86400); sendJson(response, 200, { user: await publicUser(user) }); return }
    if (url.pathname === '/api/auth/logout' && request.method === 'POST') { const token = sessionToken(request); if (token) await query('DELETE FROM sessions WHERE token_hash = ?', [tokenHash(token)]); setCookie(response, '', 0); sendJson(response, 200, { ok: true }); return }
    if (url.pathname === '/api/auth/me' && request.method === 'GET') { const user = await requireUser(request, response); if (user) sendJson(response, 200, { user: await publicUser(user) }); return }
    if (url.pathname === '/api/auth/change-password' && request.method === 'POST') {
      const payload = await readBody(request)
      const username = String(payload?.username || '').trim()
      const oldPassword = String(payload?.oldPassword || '')
      const newPassword = String(payload?.newPassword || '')
      const user = await one('SELECT * FROM users WHERE username = ?', [username])
      if (!user || !verifyPassword(oldPassword, user.password_hash)) { sendJson(response, 401, { message: '账号或旧密码错误' }); return }
      if (newPassword.length < 6) { sendJson(response, 400, { message: '新密码至少 6 位' }); return }
      await query('UPDATE users SET password_hash = ? WHERE id = ?', [hashPassword(newPassword), user.id])
      await query('DELETE FROM sessions WHERE user_id = ?', [user.id])
      sendJson(response, 200, { ok: true }); return
    }
    if (url.pathname === '/api/users' && request.method === 'GET') { if (!await requireUser(request, response, 'admin')) return; const users = await query('SELECT id, username, role, can_edit_data AS canEditData, can_manage_stores AS canManageStores, created_at AS createdAt, last_login_at AS lastLoginAt FROM users ORDER BY created_at'); sendJson(response, 200, { users: await Promise.all(users.map(async (user) => ({ ...user, allowedStoreIds: await permissions(user.id), canEditData: Boolean(user.canEditData), canManageStores: Boolean(user.canManageStores) }))) }); return }
    if (url.pathname === '/api/users' && request.method === 'POST') { if (!await requireUser(request, response, 'admin')) return; const payload = await readBody(request); const username = String(payload?.username || '').trim(); const password = String(payload?.password || ''); if (!username || !password) { sendJson(response, 400, { message: '用户名和密码不能为空' }); return }; try { const id = createId('user'); await query('INSERT INTO users (id, username, password_hash, role, can_edit_data, can_manage_stores, created_at) VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3))', [id, username, hashPassword(password), 'observer', payload?.canEditData ? 1 : 0, payload?.canManageStores ? 1 : 0]); for (const storeId of Array.isArray(payload?.allowedStoreIds) ? payload.allowedStoreIds : []) await query('INSERT IGNORE INTO observer_store_permissions (user_id, store_id) VALUES (?, ?)', [id, String(storeId)]); sendJson(response, 201, { user: await publicUser(await one('SELECT * FROM users WHERE id = ?', [id])) }) } catch (error) { sendJson(response, 400, { message: error?.code === 'ER_DUP_ENTRY' ? '用户名已存在' : '创建用户失败' }) }; return }
    const passwordMatch = url.pathname.match(/^\/api\/users\/([^/]+)\/password$/); if (passwordMatch && request.method === 'PUT') { if (!await requireUser(request, response, 'admin')) return; const user = await one('SELECT * FROM users WHERE id = ?', [passwordMatch[1]]); if (!user) { sendJson(response, 404, { message: '用户不存在' }); return }; const payload = await readBody(request); const password = String(payload?.password || ''); if (!password) { sendJson(response, 400, { message: '新密码不能为空' }); return }; await query('UPDATE users SET password_hash = ? WHERE id = ?', [hashPassword(password), user.id]); sendJson(response, 200, { ok: true }); return }
    const permissionMatch = url.pathname.match(/^\/api\/users\/([^/]+)\/permissions$/); if (permissionMatch) { if (!await requireUser(request, response, 'admin')) return; const user = await one('SELECT * FROM users WHERE id = ?', [permissionMatch[1]]); if (!user || user.role !== 'observer') { sendJson(response, 404, { message: '观察者不存在' }); return }; if (request.method === 'GET') { sendJson(response, 200, { allowedStoreIds: await permissions(user.id), canEditData: Boolean(user.can_edit_data), canManageStores: Boolean(user.can_manage_stores) }); return }; if (request.method === 'PUT') { const payload = await readBody(request); const connection = await pool.getConnection(); try { await connection.beginTransaction(); await connection.execute('DELETE FROM observer_store_permissions WHERE user_id = ?', [user.id]); for (const storeId of Array.isArray(payload?.allowedStoreIds) ? payload.allowedStoreIds : []) await connection.execute('INSERT IGNORE INTO observer_store_permissions (user_id, store_id) VALUES (?, ?)', [user.id, String(storeId)]); await connection.execute('UPDATE users SET can_edit_data = ?, can_manage_stores = ? WHERE id = ?', [payload?.canEditData ? 1 : 0, payload?.canManageStores ? 1 : 0, user.id]); await connection.commit() } catch (error) { await connection.rollback(); throw error } finally { connection.release() }; sendJson(response, 200, { allowedStoreIds: await permissions(user.id), canEditData: Boolean(payload?.canEditData), canManageStores: Boolean(payload?.canManageStores) }); return } }
    const deleteMatch = url.pathname.match(/^\/api\/users\/([^/]+)$/); if (deleteMatch && request.method === 'DELETE') { if (!await requireUser(request, response, 'admin')) return; await query("DELETE FROM users WHERE id = ? AND role = 'observer'", [deleteMatch[1]]); sendJson(response, 200, { ok: true }); return }
    if (url.pathname === '/api/data' && request.method === 'GET') { const user = await requireUser(request, response); if (!user) return; const row = await one('SELECT data, updated_at AS updatedAt FROM app_state WHERE id = 1'); if (!row) { sendJson(response, 404, { message: '数据库尚未初始化，请先录入或导入数据' }); return }; const data = JSON.parse(row.data); if (user.role === 'observer') { const allowed = await visibleStoreIds(user, data); data.stores = data.stores.filter((store) => allowed.has(store.id)); data.records = data.records.filter((record) => allowed.has(record.storeId)); data.targets = data.targets.filter((target) => allowed.has(target.storeId)) }; sendJson(response, 200, { data, updatedAt: row.updatedAt }); return }
    if (url.pathname === '/api/data' && request.method === 'PUT') { const user = await requireUser(request, response); if (!user || (!canEditData(user) && !canManageStores(user))) { if (user) sendJson(response, 403, { message: '当前账号没有可写入的权限' }); return }; const payload = await readBody(request); if (!validData(payload?.data)) { sendJson(response, 400, { message: '数据格式无效' }); return }; const currentRow = await one('SELECT data FROM app_state WHERE id = 1'); const current = currentRow ? JSON.parse(currentRow.data) : { stores: [], records: [], targets: [], seeded: false }; const nextData = user.role === 'admin' ? payload.data : mergeObserverData(current, payload.data, user, writableStoreIds(user, current), canManageStores(user), canEditData(user)); const names = nextData.stores.map((store) => String(store.name || '').trim().toLocaleLowerCase()); if (new Set(names).size !== names.length) { sendJson(response, 400, { message: '门店名称重复，请修改后再保存' }); return }; const updatedAt = new Date(); await query('INSERT INTO app_state (id, data, updated_at) VALUES (1, ?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = VALUES(updated_at)', [JSON.stringify(nextData), updatedAt]); sendJson(response, 200, { data: nextData, updatedAt }); return }
    if (url.pathname === '/api/template/meta' && request.method === 'GET') {
      const user = await requireUser(request, response);
      if (!user) return;
      if (!canEditData(user) && !canManageStores(user)) {
        sendJson(response, 403, { message: '没有权限查看模板' });
        return;
      }
      const row = await one('SELECT filename, file_size AS size, updated_at AS updatedAt FROM templates WHERE id = 1');
      if (!row) {
        sendJson(response, 200, { exists: false });
        return;
      }
      sendJson(response, 200, { exists: true, filename: row.filename, size: row.size, updatedAt: row.updatedAt });
      return;
    }
    if (url.pathname === '/api/template' && request.method === 'GET') {
      const user = await requireUser(request, response);
      if (!user) return;
      if (!canEditData(user) && !canManageStores(user)) {
        sendJson(response, 403, { message: '没有权限下载模板' });
        return;
      }
      const row = await one('SELECT filename, file_data AS fileData, file_size AS size FROM templates WHERE id = 1');
      if (!row) {
        sendJson(response, 404, { message: '暂未上传模板文件' });
        return;
      }
      const encodedName = encodeURIComponent(row.filename);
      response.writeHead(200, {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Length': row.size,
        'Content-Disposition': `attachment; filename="${encodedName}"; filename*=UTF-8''${encodedName}`,
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': response.req?.headers.origin || '*',
        'Access-Control-Allow-Credentials': 'true',
      });
      response.end(row.fileData);
      return;
    }
    if (url.pathname === '/api/template' && request.method === 'POST') {
      if (!await requireUser(request, response, 'admin')) return;
      const contentType = request.headers['content-type'] || '';
      const boundaryMatch = contentType.match(/boundary=([^;]+)/i);
      if (!boundaryMatch) {
        sendJson(response, 400, { message: '无效的表单数据类型' });
        return;
      }
      const boundary = boundaryMatch[1].trim().replace(/^["']|["']$/g, '');
      let rawBuffer;
      try {
        rawBuffer = await readRawBody(request, 6 * 1024 * 1024);
      } catch (err) {
        sendJson(response, 413, { message: err.message || '文件过大' });
        return;
      }
      const parsed = parseMultipartFormData(rawBuffer, boundary);
      if (!parsed || !parsed.data || parsed.data.length === 0) {
        sendJson(response, 400, { message: '未找到上传的文件数据' });
        return;
      }
      const filename = parsed.filename;
      if (!filename.toLowerCase().endsWith('.xlsx')) {
        sendJson(response, 400, { message: '仅支持上传 .xlsx 格式的模板文件' });
        return;
      }
      if (parsed.data.length > 5 * 1024 * 1024) {
        sendJson(response, 400, { message: '模板文件大小不能超过 5MB' });
        return;
      }
      const updatedAt = new Date();
      await query(
        'INSERT INTO templates (id, filename, file_data, file_size, updated_at) VALUES (1, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE filename = VALUES(filename), file_data = VALUES(file_data), file_size = VALUES(file_size), updated_at = VALUES(updated_at)',
        [filename, parsed.data, parsed.data.length, updatedAt]
      );
      sendJson(response, 200, {
        message: '模板上传成功',
        filename,
        size: parsed.data.length,
        updatedAt,
      });
      return;
    }
    if (url.pathname.startsWith('/api/')) { sendJson(response, 404, { message: '接口不存在' }); return }
    await serveStatic(response, url.pathname)
  } catch (error) { console.error(error); if (!response.headersSent) sendJson(response, 500, { message: '服务器内部错误' }) }
})
server.listen(port, host, () => console.log(`Store dashboard server listening on http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`))
process.on('SIGTERM', async () => { await pool.end(); server.close(() => process.exit(0)) })
process.on('SIGINT', async () => { await pool.end(); server.close(() => process.exit(0)) })
