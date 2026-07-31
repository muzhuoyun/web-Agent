// ─────────────────────────────────────────────
// server/src/index.js
// 本地后台服务（无界面）
// 职责：WebSocket 服务端 + 知识库 + 文件访问
// ─────────────────────────────────────────────

import { WebSocketServer } from 'ws'
import { createServer } from 'http'
import { readFile, writeFile, mkdir, access } from 'fs/promises'
import { existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import crypto from 'crypto'
import * as vm from 'vm'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, '..', 'data')
const KB_FILE = join(DATA_DIR, 'knowledge_base.json')
const EXTENSION_DIR = join(__dirname, '..', '..', 'chrome-extension')
const PLUGINS_DIR = join(EXTENSION_DIR, 'plugins')

// ─── 端口配置 ───
const WS_PORT = 3456
const HTTP_PORT = 3457

// ─── 全局状态 ───
let knowledgeBase = []      // 内存中的知识库
let extensionClients = new Set()  // 已连接的 extension
let hadClientBefore = false // 日志防抖

// ─── 广播给所有 Extension ───
function broadcastToExtensions(msg) {
  const json = JSON.stringify(msg)
  for (const ws of extensionClients) {
    try { ws.send(json) } catch (e) {}
  }
}

// ─────────────────────────────────────────────
//  启动
// ─────────────────────────────────────────────

console.log('╔══════════════════════════════════════════╗')
console.log('║     🤖 AI 浏览器助手 - 本地服务          ║')
console.log('╠══════════════════════════════════════════╣')
console.log(`║  WebSocket : ws://localhost:${WS_PORT}    `)
console.log(`║  HTTP      : http://localhost:${HTTP_PORT} `)
console.log(`║  数据目录  : ${DATA_DIR}                   `)
console.log('╚══════════════════════════════════════════╝')

// 确保数据目录存在
await ensureDataDir()

// 加载已有知识库
await loadKnowledgeBase()

// 启动 WebSocket 服务器
startWebSocketServer()

// 启动 HTTP 服务器（健康检查 + 管理）
startHttpServer()

// ─────────────────────────────────────────────
//  WebSocket 服务器
// ─────────────────────────────────────────────

function startWebSocketServer() {
  const wss = new WebSocketServer({ port: WS_PORT })

  wss.on('listening', () => {
    console.log(`[WS] 🟢 WebSocket 服务运行在 ws://localhost:${WS_PORT}`)
  })

  wss.on('connection', (ws) => {
    extensionClients.add(ws)

    if (!hadClientBefore) {
      console.log(`[WS] 🔵 Extension 已连接（共 ${extensionClients.size} 个）`)
      hadClientBefore = true
    }

    // 告知已连接
    ws.send(JSON.stringify({ type: 'SERVER_READY' }))

    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw)
        await handleMessage(ws, msg)
      } catch (e) {
        console.error('[WS] 消息解析错误:', e.message)
        ws.send(JSON.stringify({
          type: 'ERROR',
          message: '消息格式错误'
        }))
      }
    })

    ws.on('close', () => {
      extensionClients.delete(ws)
      if (extensionClients.size === 0) {
        console.log('[WS] 🔴 所有 Extension 已断开')
        hadClientBefore = false
      }
    })

    ws.on('error', (e) => {
      console.error('[WS] 连接错误:', e.message)
      extensionClients.delete(ws)
    })
  })

  wss.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      console.error(`[WS] ❌ 端口 ${WS_PORT} 已被占用`)
      console.error('[WS] 请检查是否已有实例在运行')
      process.exit(1)
    } else {
      console.error('[WS] 服务器错误:', e.message)
    }
  })
}

// ─── 消息路由 ───
async function handleMessage(ws, msg) {
  switch (msg.type) {
    case 'KB_SAVE':
      await handleKBSave(ws, msg.data)
      break

    case 'KB_SEARCH':
      await handleKBSearch(ws, msg.query, msg.topK || 5)
      break

    case 'FILE_READ':
      await handleFileRead(ws, msg.path)
      break

    case 'FILE_LIST':
      await handleFileList(ws, msg.dir)
      break

    case 'PING':
      ws.send(JSON.stringify({ type: 'PONG' }))
      break

    case 'PLUGIN_RELOAD':
      // 收到插件管理命令 → 广播给所有 Extension
      broadcastToExtensions({ type: 'PLUGIN_RELOAD' })
      ws.send(JSON.stringify({ type: 'PLUGIN_RELOAD_ACK' }))
      break

    case 'PLUGIN_LIST':
      ws.send(JSON.stringify({
        type: 'PLUGIN_LIST_RESULT',
        plugins: await listPlugins()
      }))
      break

    case 'PLUGIN_INSTALL':
      try {
        const plugin = msg.plugin
        const meta = plugin?.meta || plugin
        const code = plugin?.code || ''

        if (!meta || !meta.id || !meta.name) {
          ws.send(JSON.stringify({ type: 'PLUGIN_INSTALL_ACK', error: '缺少必要字段 (id, name)' }))
          break
        }

        const result = await installPlugin(meta, code)
        ws.send(JSON.stringify({ type: 'PLUGIN_INSTALL_ACK', ...result }))
      } catch (e) {
        ws.send(JSON.stringify({ type: 'PLUGIN_INSTALL_ACK', error: e.message }))
      }
      break

    case 'PLUGIN_REMOVE':
      try {
        await removePlugin(msg.pluginId)
        ws.send(JSON.stringify({ type: 'PLUGIN_REMOVE_ACK', success: true }))
      } catch (e) {
        ws.send(JSON.stringify({ type: 'PLUGIN_REMOVE_ACK', error: e.message }))
      }
      break

    case 'PLUGIN_UPDATE_META':
      try {
        await updatePluginMeta(msg.plugin)
        ws.send(JSON.stringify({ type: 'PLUGIN_UPDATE_META_ACK', success: true }))
      } catch (e) {
        ws.send(JSON.stringify({ type: 'PLUGIN_UPDATE_META_ACK', error: e.message }))
      }
      break

    case 'ECHO':
      ws.send(JSON.stringify({ type: 'ECHO', data: msg.data }))
      break

    default:
      ws.send(JSON.stringify({
        type: 'ERROR',
        message: `未知消息类型: ${msg.type}`
      }))
  }
}

// ─────────────────────────────────────────────
//  知识库操作
// ─────────────────────────────────────────────

async function handleKBSave(ws, data) {
  try {
    const entry = {
      id: crypto.randomUUID(),
      term: data.term || '',
      explanation: data.explanation || '',
      content: data.content || data.explanation || '',
      url: data.url || '',
      title: data.title || '',
      timestamp: data.timestamp || Date.now()
    }

    // 计算嵌入向量（如果配置了 embedding API）
    try {
      entry.embedding = await getEmbedding(entry.content)
    } catch (e) {
      console.log('[KB] ⚠️ 嵌入计算失败（跳过向量索引）:', e.message)
      entry.embedding = null
    }

    knowledgeBase.push(entry)

    // 持久化
    await saveKnowledgeBase()

    console.log(`[KB] ✅ 已保存: "${entry.term || entry.content.slice(0, 40)}..."`)
    ws.send(JSON.stringify({
      type: 'KB_SAVE_RESULT',
      success: true,
      id: entry.id,
      count: knowledgeBase.length
    }))
  } catch (e) {
    console.error('[KB] ❌ 保存失败:', e.message)
    ws.send(JSON.stringify({
      type: 'KB_SAVE_RESULT',
      success: false,
      message: e.message
    }))
  }
}

async function handleKBSearch(ws, query, topK) {
  try {
    if (knowledgeBase.length === 0) {
      ws.send(JSON.stringify({
        type: 'KB_SEARCH_RESULT',
        results: [],
        total: 0
      }))
      return
    }

    // 计算查询的嵌入向量
    let queryEmb = null
    try {
      queryEmb = await getEmbedding(query)
    } catch (e) {
      // 无法嵌入时，用关键词匹配
      console.log('[KB] ⚠️ 查询嵌入失败，使用关键词搜索:', e.message)
    }

    let results
    if (queryEmb) {
      // 向量相似度搜索
      const scored = knowledgeBase
        .filter(e => e.embedding)
        .map(entry => ({
          ...entry,
          score: cosineSimilarity(queryEmb, entry.embedding)
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)

      results = scored
    } else {
      // 关键词降级搜索
      const keywords = query.toLowerCase().split(/\s+/)
      const scored = knowledgeBase
        .map(entry => {
          const text = (entry.term + ' ' + entry.explanation + ' ' + entry.content).toLowerCase()
          const score = keywords.filter(k => text.includes(k)).length / keywords.length
          return { ...entry, score }
        })
        .filter(e => e.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)

      results = scored
    }

    ws.send(JSON.stringify({
      type: 'KB_SEARCH_RESULT',
      results,
      total: results.length
    }))
  } catch (e) {
    console.error('[KB] ❌ 搜索失败:', e.message)
    ws.send(JSON.stringify({
      type: 'KB_SEARCH_RESULT',
      error: e.message,
      results: []
    }))
  }
}

// ─────────────────────────────────────────────
//  文件操作
// ─────────────────────────────────────────────

async function handleFileRead(ws, filePath) {
  try {
    if (!filePath || filePath.includes('..')) {
      ws.send(JSON.stringify({
        type: 'FILE_ERROR',
        message: '路径不合法'
      }))
      return
    }

    const content = await readFile(filePath, 'utf-8')
    const stat = await access(filePath).then(() => true).catch(() => false)

    ws.send(JSON.stringify({
      type: 'FILE_CONTENT',
      path: filePath,
      content,
      size: Buffer.byteLength(content, 'utf-8')
    }))
  } catch (e) {
    ws.send(JSON.stringify({
      type: 'FILE_ERROR',
      message: `读取失败: ${e.message}`
    }))
  }
}

async function handleFileList(ws, dirPath) {
  try {
    const { readdir, stat } = await import('fs/promises')
    const items = await readdir(dirPath || DATA_DIR, { withFileTypes: true })
    const files = items.map(item => ({
      name: item.name,
      isDir: item.isDirectory(),
      path: join(dirPath || DATA_DIR, item.name)
    }))

    ws.send(JSON.stringify({
      type: 'FILE_LIST_RESULT',
      path: dirPath || DATA_DIR,
      files
    }))
  } catch (e) {
    ws.send(JSON.stringify({
      type: 'FILE_ERROR',
      message: `列出目录失败: ${e.message}`
    }))
  }
}

// ─────────────────────────────────────────────
//  嵌入向量（调用 OpenAI 兼容 API）
// ─────────────────────────────────────────────

async function getEmbedding(text) {
  const trimmed = text.slice(0, 8000)
  if (!trimmed.trim()) throw new Error('空文本无法嵌入')

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY || ''}`
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: trimmed
    })
  })

  if (!response.ok) {
    throw new Error(`Embedding API: ${response.status}`)
  }

  const data = await response.json()
  return data.data[0].embedding
}

// ─────────────────────────────────────────────
//  向量搜索工具
// ─────────────────────────────────────────────

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0

  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

// ─────────────────────────────────────────────
//  插件管理
// ─────────────────────────────────────────────

async function listPlugins() {
  try {
    const { readdir } = await import('fs/promises')
    const items = await readdir(PLUGINS_DIR, { withFileTypes: true })
    const plugins = []
    for (const item of items) {
      if (item.isDirectory()) {
        const jsonPath = join(PLUGINS_DIR, item.name, 'plugin.json')
        if (existsSync(jsonPath)) {
          const json = await readFile(jsonPath, 'utf-8')
          plugins.push(JSON.parse(json))
        }
      }
    }
    return plugins
  } catch (e) {
    return []
  }
}

async function installPlugin(meta, code) {
  const validation = { valid: true, errors: [], warnings: [] }

  // 1. 验证元数据
  if (!meta.id || !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(meta.id)) {
    validation.valid = false; validation.errors.push('插件 ID 无效')
  }
  if (!meta.name) { validation.valid = false; validation.errors.push('缺少插件名称') }

  // 2. 语法检查（含行号定位）
  if (code) {
    try { vm.compileFunction(code) } catch (e) {
      validation.valid = false
      const line = e.stack ? (e.stack.match(/:(\d+)/) || [])[1] : null
      validation.errors.push((line ? '第 ' + line + ' 行: ' : '') + e.message)
    }
  } else {
    validation.valid = false; validation.errors.push('代码不能为空')
  }

  // 校验不通过 → 直接返回，不写任何文件
  if (!validation.valid) return { success: false, errors: validation.errors, warnings: [] }

  // 通过校验后，才创建目录和文件
  const dir = join(PLUGINS_DIR, meta.id)
  await mkdir(dir, { recursive: true })

  // 生成 content.js（框架注入 + 用户代码）
  const contentJs = `// ═══════════════════════════════════════════
// 自动生成 — ${meta.name} (${meta.id})
// ═══════════════════════════════════════════

;(() => {
  const api = window.__aiAPI
  if (!api) return
  api.getPluginConfig('${meta.id}').then(meta => {
    if (meta && meta.enabled !== false) {
      (async function() {
        try { await initPlugin({ api, config: { ...meta.config, ...meta } }); chrome.storage.local.remove('plugin_err_${meta.id}') }
        catch (e) { chrome.storage.local.get('plugin_err_${meta.id}', function(r) {
          var list = r['plugin_err_${meta.id}'] || []
          list.push({ msg: e.message, time: Date.now(), url: location.href })
          if (list.length > 20) list.shift()
          chrome.storage.local.set({ 'plugin_err_${meta.id}': list }) })
        }
      })()
    }
  })

// ===== 用户逻辑 =====
${code}
// ===== 用户逻辑结束 =====
})()`

  // 4. 保存 plugin.json
  const pluginJson = {
    id: meta.id,
    name: meta.name,
    version: meta.version || '1.0.0',
    icon: meta.icon || '🔌',
    description: meta.description || '',
    triggers: meta.triggers || ['alt-select'],
    systemPrompt: meta.systemPrompt || (meta.config?.systemPrompt) || '',
    configSchema: meta.configSchema || { systemPrompt: { type: 'textarea', label: '系统提示词' } },
    valid: validation.valid,
    errors: validation.errors
  }
  await writeFile(join(dir, 'plugin.json'), JSON.stringify(pluginJson, null, 2), 'utf-8')

  // 5. 保存 content.js
  await writeFile(join(dir, 'content.js'), contentJs, 'utf-8')

  // 6. 更新 manifest（让插件出现在列表里）
  await updatePluginManifest()

  if (validation.valid) {
    broadcastToExtensions({ type: 'PLUGIN_RELOAD' })
  } else {
    console.log(`[Plugin] ⚠️ ${meta.id} 校验未通过，已安装但不触发重载`)
  }

  return { success: validation.valid, errors: validation.errors, warnings: validation.warnings }
}

async function removePlugin(id) {
  const { rm } = await import('fs/promises')
  const dir = join(PLUGINS_DIR, id)
  if (existsSync(dir)) {
    await rm(dir, { recursive: true, force: true })
  }
  await updatePluginManifest()
  broadcastToExtensions({ type: 'PLUGIN_RELOAD' })
}

async function updatePluginMeta(plugin) {
  const jsonPath = join(PLUGINS_DIR, plugin.id, 'plugin.json')
  if (!existsSync(jsonPath)) throw new Error('插件不存在')
  const raw = await readFile(jsonPath, 'utf-8')
  const meta = JSON.parse(raw)

  // 动态保存所有传入字段（排除 id 和 configSchema）
  for (const key of Object.keys(plugin)) {
    if (key === 'id' || key === 'configSchema') continue
    meta[key] = plugin[key]
  }

  await writeFile(jsonPath, JSON.stringify(meta, null, 2), 'utf-8')
  await updatePluginManifest()
}

async function updatePluginManifest() {
  const plugins = await listPlugins()
  const manifestPath = join(PLUGINS_DIR, 'plugin-manifest.js')
  let code = `// 自动生成 — 由服务器维护，请勿手动修改
// 注意：不再引入 index.js，配置通过 plugin.json 动态加载

const PLUGIN_IDS = ${JSON.stringify(plugins.map(p => p.id))}

const runtimeState = {
${plugins.map(p => `  '${p.id}': { enabled: true }`).join(',\n')}
}

export function getRuntimeState(id) {
  return runtimeState[id] || { enabled: true }
}

export function setPluginEnabled(id, enabled) {
  if (runtimeState[id]) runtimeState[id].enabled = enabled
  else runtimeState[id] = { enabled }
}

export async function loadPluginMeta(id) {
  try {
    const res = await fetch(chrome.runtime.getURL('plugins/' + id + '/plugin.json'))
    return await res.json()
  } catch (_) { return null }
}

export async function loadAllPluginsMeta() {
  const metas = await Promise.all(PLUGIN_IDS.map(id => loadPluginMeta(id)))
  return metas.filter(m => m).map(m => ({ ...m, config: { ...runtimeState[m.id], ...(m.config || {}) } }))
}
`

  await writeFile(manifestPath, code, 'utf-8')
  console.log(`[Plugin] 📝 已更新插件清单: ${plugins.length} 个插件`)

  // 更新 manifest.json 的 content_scripts 列表
  const extManifestPath = join(EXTENSION_DIR, 'manifest.json')
  try {
    const manifestRaw = await readFile(extManifestPath, 'utf-8')
    const manifest = JSON.parse(manifestRaw)
    if (manifest.content_scripts && manifest.content_scripts[0]) {
      const baseJs = ['content-script/main.js']
      for (const p of plugins) {
        const cp = join(PLUGINS_DIR, p.id, 'content.js')
        if (existsSync(cp)) {
          baseJs.push(`plugins/${p.id}/content.js`)
        }
      }
      manifest.content_scripts[0].js = baseJs
      await writeFile(extManifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8')
      console.log(`[Plugin] 📝 已更新 manifest.json: ${plugins.length} 个插件`)
    }
  } catch (e) {
    console.error('[Plugin] ❌ 更新 manifest.json 失败:', e.message)
  }
}

// ─────────────────────────────────────────────
//  持久化
// ─────────────────────────────────────────────

async function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true })
    console.log(`[Data] 📁 创建数据目录: ${DATA_DIR}`)
  }
}

async function loadKnowledgeBase() {
  try {
    if (existsSync(KB_FILE)) {
      const raw = await readFile(KB_FILE, 'utf-8')
      knowledgeBase = JSON.parse(raw)
      console.log(`[KB] 📚 已加载知识库: ${knowledgeBase.length} 条记录`)
    } else {
      console.log('[KB] 📚 知识库为空（新文件）')
      knowledgeBase = []
    }
  } catch (e) {
    console.error('[KB] ❌ 加载知识库失败:', e.message)
    knowledgeBase = []
  }
}

async function saveKnowledgeBase() {
  try {
    // 移除非持久化字段（如 embedding 向量太大，可选择性保存）
    const toSave = knowledgeBase.map(({ embedding, ...rest }) => rest)
    await writeFile(KB_FILE, JSON.stringify(toSave, null, 2), 'utf-8')
  } catch (e) {
    console.error('[KB] ❌ 持久化失败:', e.message)
  }
}

// ─────────────────────────────────────────────
//  HTTP 服务器（健康检查 + 管理界面占位）
// ─────────────────────────────────────────────

function startHttpServer() {
  const server = createServer((req, res) => {
    // 设置 CORS（方便开发调试）
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    // 插件安装 POST 接口
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

    if (req.method === 'POST' && req.url === '/plugin/install') {
      let body = ''
      req.on('data', chunk => body += chunk)
      req.on('end', async () => {
        try {
          const { meta, code } = JSON.parse(body)
          const result = await installPlugin(meta, code)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(result))
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, errors: [e.message] }))
        }
      })
      return
    }

    // 插件更新 POST 接口
    if (req.method === 'POST' && req.url === '/plugin/update') {
      let body = ''
      req.on('data', chunk => body += chunk)
      req.on('end', async () => {
        try {
          const { meta, code } = JSON.parse(body)
          if (!meta || !meta.id || !existsSync(join(PLUGINS_DIR, meta.id))) {
            res.writeHead(404); res.end(JSON.stringify({ success: false, errors: ['插件不存在'] })); return
          }
          // 用 installPlugin 重写插件文件
          const result = await installPlugin(meta, code)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(result))
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, errors: [e.message] }))
        }
      })
      return
    }

    switch (req.url) {
      case '/':
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          name: 'AI Agent Server',
          version: '0.1.0',
          status: 'running',
          wsPort: WS_PORT,
          kbCount: knowledgeBase.length,
          clients: extensionClients.size
        }))
        break

      case '/plugins':
        listPlugins().then(plugins => {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ plugins }))
        })
        break

      case '/plugins/regenerate':
        updatePluginManifest().then(() => {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: true }))
        })
        break

      case '/plugins/reload':
        broadcastToExtensions({ type: 'PLUGIN_RELOAD' })
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: true, message: '已通知 Extension 重载' }))
        break

      case '/health':
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }))
        break

      case '/stats':
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          knowledgeBase: {
            total: knowledgeBase.length,
            lastUpdate: knowledgeBase[knowledgeBase.length - 1]?.timestamp || null
          },
          server: {
            uptime: process.uptime(),
            memory: process.memoryUsage().heapUsed,
            wsClients: extensionClients.size
          }
        }))
        break

      default:
        res.writeHead(404)
        res.end('Not Found')
    }
  })

  server.listen(HTTP_PORT, () => {
    console.log(`[HTTP] 🟢 HTTP 服务运行在 http://localhost:${HTTP_PORT}`)
    console.log('[HTTP]   GET /        — 服务信息')
    console.log('[HTTP]   GET /health  — 健康检查')
    console.log('[HTTP]   GET /stats   — 统计信息')
  })

  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      console.log(`[HTTP] ⚠️ HTTP 端口 ${HTTP_PORT} 被占用，跳过`)
    } else {
      console.error('[HTTP] 错误:', e.message)
    }
  })
}

// ─────────────────────────────────────────────
//  优雅退出
// ─────────────────────────────────────────────

process.on('SIGINT', async () => {
  console.log('\n[Server] 👋 正在关闭...')
  await saveKnowledgeBase()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  console.log('\n[Server] 👋 收到终止信号...')
  await saveKnowledgeBase()
  process.exit(0)
})

process.on('uncaughtException', async (e) => {
  console.error('[Server] 💥 未捕获异常:', e.message)
  await saveKnowledgeBase()
  process.exit(1)
})
