import { DatabaseSync } from 'node:sqlite'
import mysql from 'mysql2/promise'
import path from 'node:path'

const sqlitePath = process.argv[2] || path.resolve('data/store-dashboard.sqlite')
for (const name of ['MYSQL_HOST', 'MYSQL_USER', 'MYSQL_PASSWORD', 'MYSQL_DATABASE']) if (!process.env[name]) throw new Error(`缺少环境变量 ${name}`)
function mysqlDateTime(value) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(String(value))
  if (Number.isNaN(date.getTime())) throw new Error(`无法解析时间：${value}`)
  return date.toISOString().slice(0, 23).replace('T', ' ')
}

const mysqlDb = await mysql.createConnection({
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  charset: 'utf8mb4',
  ssl: process.env.MYSQL_SSL === 'true' ? {} : undefined,
})
const schema = [
  `CREATE TABLE IF NOT EXISTS app_state (id TINYINT UNSIGNED PRIMARY KEY, data LONGTEXT NOT NULL, updated_at DATETIME(3) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS users (id VARCHAR(64) PRIMARY KEY, username VARCHAR(191) NOT NULL UNIQUE, password_hash VARCHAR(255) NOT NULL, role VARCHAR(16) NOT NULL, created_at DATETIME(3) NOT NULL, last_login_at DATETIME(3) NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS observer_store_permissions (user_id VARCHAR(64) NOT NULL, store_id VARCHAR(191) NOT NULL, PRIMARY KEY(user_id, store_id), CONSTRAINT permissions_user_fk FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS sessions (token_hash CHAR(64) PRIMARY KEY, user_id VARCHAR(64) NOT NULL, expires_at DATETIME(3) NOT NULL, CONSTRAINT sessions_user_fk FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
]
for (const statement of schema) await mysqlDb.query(statement)

const sqlite = new DatabaseSync(sqlitePath)
const users = sqlite.prepare('SELECT id, username, password_hash, role, created_at, last_login_at FROM users').all()
const permissions = sqlite.prepare('SELECT user_id, store_id FROM observer_store_permissions').all()
const state = sqlite.prepare('SELECT data, updated_at FROM app_state WHERE id = 1').get()
await mysqlDb.query('SET FOREIGN_KEY_CHECKS = 0')
for (const user of users) await mysqlDb.execute('INSERT INTO users (id, username, password_hash, role, created_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), role = VALUES(role), created_at = VALUES(created_at), last_login_at = VALUES(last_login_at)', [user.id, user.username, user.password_hash, user.role, mysqlDateTime(user.created_at), mysqlDateTime(user.last_login_at)])
for (const permission of permissions) await mysqlDb.execute('INSERT IGNORE INTO observer_store_permissions (user_id, store_id) VALUES (?, ?)', [permission.user_id, permission.store_id])
if (state) await mysqlDb.execute('INSERT INTO app_state (id, data, updated_at) VALUES (1, ?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = VALUES(updated_at)', [state.data, mysqlDateTime(state.updated_at)])
await mysqlDb.query('SET FOREIGN_KEY_CHECKS = 1')
console.log(`迁移完成：${users.length} 个账号，${permissions.length} 条门店权限${state ? '，已迁移业务数据' : ''}`)
sqlite.close()
await mysqlDb.end()
