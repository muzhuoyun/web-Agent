// ─────────────────────────────────────────────
// service-worker.js
// Extension 后台服务
// 职责：插件路由、调用 LLM API、连接本地服务器
// ─────────────────────────────────────────────

import { getRuntimeState, setPluginEnabled, loadPluginMeta, loadAllPluginsMeta } from './plugins/plugin-manifest.js'

// ─── 配置默认值 ───
const DEFAULT_CONFIG = {
  apiEndpoint: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
  serverUrl: 'ws://localhost:3456'
}

// ─── 全局状态 ───
let ws = null
let wsReconnectTimer = null
const activeStreams = new Map()  // streamId -> abortController

// ─────────────────────────────────────────────
//  初始化
// ─────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(['apiKey', 'apiEndpoint', 'model'], (items) => {
    const defaults = {}
    if (!items.apiKey) defaults.apiKey = DEFAULT_CONFIG.apiKey
    if (!items.apiEndpoint) defaults.apiEndpoint = DEFAULT_CONFIG.apiEndpoint
    if (!items.model) defaults.model = DEFAULT_CONFIG.model
    if (Object.keys(defaults).length > 0) chrome.storage.sync.set(defaults)
  })

  chrome.alarms.create('keepalive', { periodInMinutes: 4 })
})

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepalive') {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'PING' }))
    }
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      connectToLocalServer()
    }
    warmUpLLM() // 顺带保持 LLM 连接是热的
  }
})

// ─────────────────────────────────────────────
//  LLM 连接预热
// ─────────────────────────────────────────────
// 方舟把响应头压到「首 token 就绪」才发（实测首字仅比响应头晚 1ms），
// 所以单看响应头分不出建连和排队。但两段式屏蔽给了对照：
// 第二段输入大几倍却比第一段快约 280ms，差额大致就是首个请求的
// DNS + TLS + 路由建立成本。这里在 SW 启动和每次 keepalive 唤醒时朝同一 host
// 打一个极小的请求把连接预热好，真正的审核请求直接复用，省掉那段握手。
// 用 GET /models 而不是真的 chat 请求：同样能完成握手并进连接池，但不产生 token 费用。
let lastWarmAt = 0
async function warmUpLLM() {
  if (Date.now() - lastWarmAt < 30000) return // 30s 内不重复预热
  try {
    const { apiEndpoint, apiKey } = await getConfig()
    if (!apiKey) return // 没配 key 时预热无意义；注意不能在此之前就打时间戳，
                        // 否则未配置期间的这次空跑会把后续 30s 的预热一起挡掉
    lastWarmAt = Date.now()
    const t = Date.now()
    const res = await fetch(`${apiEndpoint}/models`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${apiKey}` },
      cache: 'no-store'
    })
    console.log(`[SW] 🔥 LLM 连接预热完成 ${Date.now() - t}ms (HTTP ${res.status})`)
  } catch (e) {
    // 端点不提供 /models 也无妨：TLS 握手已完成，连接照样进了池子
    console.log('[SW] 🔥 预热请求未成功，但连接可能已建立:', e.message)
  }
}

// ─────────────────────────────────────────────
//  WebSocket ↔ 本地服务器
// ─────────────────────────────────────────────

connectToLocalServer()
// SW 每次被唤醒（含冷启动）都预热一次 —— 连接池是随 SW 生命周期一起消失的
warmUpLLM()

function connectToLocalServer() {
  chrome.storage.sync.get('serverUrl', ({ serverUrl = DEFAULT_CONFIG.serverUrl }) => {
    try {
      ws = new WebSocket(serverUrl)
      ws.onopen = () => { clearTimeout(wsReconnectTimer) }
      ws.onmessage = (event) => {
        try { handleServerMessage(JSON.parse(event.data)) } catch (e) {}
      }
      ws.onclose = () => {
        ws = null
        wsReconnectTimer = setTimeout(connectToLocalServer, 5000)
      }
      ws.onerror = () => ws?.close()
    } catch (e) {
      wsReconnectTimer = setTimeout(connectToLocalServer, 10000)
    }
  })
}

function handleServerMessage(msg) {
  switch (msg.type) {
    case 'PLUGIN_RELOAD':
      // 服务器通知：插件已更新
      console.log('[SW] 插件已更新，检查是否有打开的弹窗...')
      delayedReload()
      break

    case 'PLUGIN_UPDATE':
      // 单个插件已更新（只对运行时不重启生效）
      console.log('[SW] 插件更新:', msg.pluginId)
      break
  }
}

// ─────────────────────────────────────────────
//  消息路由（处理 Content Script 请求）
// ─────────────────────────────────────────────

// 流式连接（用于 LLM 流式输出）
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'plugin-llm') return

  const streamId = crypto.randomUUID()
  const abortController = new AbortController()
  activeStreams.set(streamId, abortController)

  port.onMessage.addListener(async (msg) => {
    if (msg.type === 'CANCEL') {
      abortController.abort()
      activeStreams.delete(streamId)
      return
    }

    if (msg.type === 'LLM_STREAM') {
      try {
        const config = await getConfig()
        if (!config.apiKey) {
          port.postMessage({ type: 'ERROR', message: '请先在插件设置中填写 API Key' })
          return
        }
        await streamLLM(msg.messages, config, port, abortController.signal, msg.options)
      } catch (e) {
        if (e.name === 'AbortError') return
        port.postMessage({ type: 'ERROR', message: e.message || '请求失败' })
      } finally {
        activeStreams.delete(streamId)
      }
    }
  })

  port.onDisconnect.addListener(() => {
    const ctrl = activeStreams.get(streamId)
    if (ctrl) { ctrl.abort(); activeStreams.delete(streamId) }
  })
})

// 普通消息（知识库、配置等）
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {
    case 'GET_ALL_PLUGINS':
      loadAllPluginsMeta().then(plugins => sendResponse({ plugins }))
      return true

    case 'GET_PLUGIN_META':
      (async () => {
        const meta = await loadPluginMeta(msg.pluginId)
        const state = getRuntimeState(msg.pluginId)
        const stored = await chrome.storage.local.get(`plugin_cfg_${msg.pluginId}`)
        const overrides = stored[`plugin_cfg_${msg.pluginId}`] || {}
        // 从 configSchema.properties 构建默认配置
        const defaults = {}
        if (meta?.configSchema?.properties) {
          for (const [key, spec] of Object.entries(meta.configSchema.properties)) {
            if (spec && typeof spec === 'object' && spec.default !== undefined) defaults[key] = spec.default
          }
        }
        sendResponse({
          meta: meta ? {
            ...meta,
            ...overrides,
            enabled: state?.enabled !== false,
            config: { ...defaults, ...meta, ...state, ...overrides }
          } : null
        })
      })()
      return true

    case 'GET_CONFIG':
      getConfig().then(sendResponse)
      return true

    case 'UPDATE_CONFIG':
      chrome.storage.sync.set(msg.config, () => sendResponse({ success: true }))
      return true

    case 'UPDATE_PLUGIN_CONFIG':
      updatePluginConfig(msg.pluginId, msg.config)
      if (msg.config?.enabled !== undefined) setPluginEnabled(msg.pluginId, msg.config.enabled)
      sendResponse({ success: true })
      return true

    case 'ADD_PLUGIN':
      handleAddPlugin(msg.plugin, sendResponse)
      return true

    case 'REMOVE_PLUGIN':
      handleRemovePlugin(msg.pluginId)
      sendResponse({ success: true })
      break

    case 'OPEN_SIDE_PANEL':
      // 注意：不要在这里加任何 await/异步操作，否则手势会丢失
      chrome.sidePanel.open({ tabId: sender.tab.id })
      sendResponse({ success: true })
      break

    case 'PLUGIN_RELOAD_REQUEST':
      console.log('[SW] 收到重载请求，即将重启')
      setTimeout(() => chrome.runtime.reload(), 1000)
      sendResponse({ success: true })
      break

    case 'UPDATE_PLUGIN_META':
      // 保存到本地存储（不触发重载）
      if (msg.plugin?.id) {
        const { id, ...config } = msg.plugin
        chrome.storage.local.set({ [`plugin_cfg_${id}`]: config }).then(() => {
          // 可选同步到服务器
          if (ws && ws.readyState === WebSocket.OPEN) {
            try { ws.send(JSON.stringify({ type: 'PLUGIN_UPDATE_META', plugin: msg.plugin })) } catch (_) {}
          }
          sendResponse({ success: true })
        })
      } else {
        sendResponse({ success: true })
      }
      return true
  }
})

// ─────────────────────────────────────────────
//  LLM 流式调用
// ─────────────────────────────────────────────

// 插件任务（内容审核 / 名词解释 / 猜你想问）都不需要推理。
// 思考 token 有两重代价：拖长首字延迟（流式管道要等思考吐完才出正文），
// 且通常计入 max_tokens —— 吃满额度时正文会是空的，调用方却拿不到任何报错。
// 各家参数名不一致，这里带上方舟/DeepSeek 系认的两种写法；
// 万一某个端点不认这些字段直接报 400，下面会去掉它们重试一次，保证不至于整体不可用。
const NO_THINKING = { thinking: { type: 'disabled' }, reasoning_effort: 'minimal' }

async function streamLLM(messages, config, port, signal, options) {
  const { apiEndpoint, apiKey, model } = config
  const t0 = Date.now()
  // 采样参数默认值偏向「生成类」任务；审核/分类可由调用方用 options 覆盖
  // （max_tokens 开太大在部分推理网关上会参与批调度、拖慢排队；temperature 不为 0
  //   会让同一段文字的判定结果在多次调用间摇摆）
  const base = { model, messages, stream: true, temperature: 0.7, max_tokens: 1000, ...(options || {}) }

  const send = body => fetch(`${apiEndpoint}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify(body),
    signal
  })

  let response = await send({ ...base, ...NO_THINKING })
  if (response.status === 400) {
    const err = await response.text()
    console.log('[SW] ⚠️ 关思考参数被拒绝，去掉后重试:', err.slice(0, 160))
    response = await send(base)
  }

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`API 错误 (${response.status}): ${err.slice(0, 200)}`)
  }
  const tHeaders = Date.now()

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let firstContentAt = 0, contentChars = 0, reasoningChars = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed === 'data: [DONE]') continue
      if (!trimmed.startsWith('data: ')) continue

      try {
        const delta = JSON.parse(trimmed.slice(6)).choices?.[0]?.delta || {}
        // 思考内容仍然不转发（对这些任务无用，且 adult-guard 用 includes('true')
        // 判定，思考里出现 true 字样会导致误屏蔽），但要统计出来用于定位延迟
        const reasoning = delta.reasoning_content || delta.reasoning || delta.thinking
        if (reasoning) reasoningChars += String(reasoning).length
        if (delta.content) {
          if (!firstContentAt) firstContentAt = Date.now()
          contentChars += delta.content.length
          port.postMessage({ type: 'CHUNK', text: delta.content })
        }
      } catch (e) { /* skip parse errors */ }
    }
  }

  // 距上次预热的间隔：用来判断这次请求是否复用了热连接，从而判断预热到底有没有用
  const sinceWarm = lastWarmAt ? `${t0 - lastWarmAt}ms前预热` : '未预热'
  console.log(`[SW][LLM] ${model} 响应头 ${tHeaders - t0}ms | 首字 ${firstContentAt ? firstContentAt - t0 : '—'}ms | 总耗时 ${Date.now() - t0}ms | 输入 ${JSON.stringify(messages).length} 字 | 正文 ${contentChars} 字 | 思考 ${reasoningChars} 字 | ${sinceWarm}`)
  if (reasoningChars) console.log(`[SW][LLM] ⚠️ 仍收到 ${reasoningChars} 字思考内容 —— 该模型未接受关思考参数，这段时间是白等的`)
  if (!contentChars) console.log('[SW][LLM] ⚠️ 正文为空 —— 可能思考吃满了 max_tokens，调用方会当成「未命中」处理')

  port.postMessage({ type: 'DONE' })
}

// ─────────────────────────────────────────────
//  配置管理
// ─────────────────────────────────────────────

function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['apiEndpoint', 'apiKey', 'model'], (items) => {
      resolve({
        apiEndpoint: items.apiEndpoint || DEFAULT_CONFIG.apiEndpoint,
        apiKey: items.apiKey || '',
        model: items.model || DEFAULT_CONFIG.model
      })
    })
  })
}

function updatePluginConfig(pluginId, config) {
  chrome.storage.local.set({ [`plugin_cfg_${pluginId}`]: config })
}

async function handleAddPlugin(plugin, sendResponse) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    sendResponse({ error: '本地服务器未连接' })
    return
  }
  try {
    // 等待服务器返回安装结果
    const result = await new Promise((resolve) => {
      const handler = (event) => {
        try {
          const msg = JSON.parse(event.data)
          if (msg.type === 'PLUGIN_INSTALL_ACK') {
            ws.removeEventListener('message', handler)
            resolve(msg)
          }
        } catch (_) {}
      }
      ws.addEventListener('message', handler)
      ws.send(JSON.stringify({ type: 'PLUGIN_INSTALL', plugin }))
      // 30 秒超时
      setTimeout(() => { ws.removeEventListener('message', handler); resolve({ error: '服务器超时' }) }, 30000)
    })

    if (result.error) {
      sendResponse({ error: result.error })
    } else {
      sendResponse({
        success: result.success,
        serverErrors: result.errors || [],
        warnings: result.warnings || []
      })
    }
  } catch (e) {
    sendResponse({ error: e.message })
  }
}

function handleRemovePlugin(pluginId) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'PLUGIN_REMOVE', pluginId }))
  }
}

async function delayedReload() {
  try {
    const tabs = await chrome.tabs.query({ url: ['<all_urls>'] })
    let hasPopups = false

    for (const tab of tabs) {
      try {
        const result = await chrome.tabs.sendMessage(tab.id, { type: 'CHECK_POPUPS' })
        if (result?.hasPopups) {
          hasPopups = true
          break
        }
      } catch (e) { /* tab 没有 content script */ }
    }

    if (hasPopups) {
      console.log('[SW] 检测到有打开的弹窗，延迟 30 秒后重载')
      setTimeout(() => chrome.runtime.reload(), 30000)
    } else {
      console.log('[SW] 无活动弹窗，立即重载')
      chrome.runtime.reload()
    }
  } catch (e) {
    console.log('[SW] 检测失败，立即重载')
    chrome.runtime.reload()
  }
}
