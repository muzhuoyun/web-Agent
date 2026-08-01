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
  }
})

// ─────────────────────────────────────────────
//  WebSocket ↔ 本地服务器
// ─────────────────────────────────────────────

connectToLocalServer()

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
        await streamLLM(msg.messages, config, port, abortController.signal)
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

    case 'SAVE_TO_KB':
      handleSaveToKB(msg.data)
      sendResponse({ success: true })
      break

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

async function streamLLM(messages, config, port, signal) {
  const { apiEndpoint, apiKey, model } = config

  const response = await fetch(`${apiEndpoint}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      temperature: 0.7,
      max_tokens: 1000
    }),
    signal
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`API 错误 (${response.status}): ${err.slice(0, 200)}`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

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
        const json = JSON.parse(trimmed.slice(6))
        const content = json.choices?.[0]?.delta?.content
        if (content) port.postMessage({ type: 'CHUNK', text: content })
      } catch (e) { /* skip parse errors */ }
    }
  }

  port.postMessage({ type: 'DONE' })
}

// ─────────────────────────────────────────────
//  知识库 & 配置管理
// ─────────────────────────────────────────────

async function handleSaveToKB(data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'KB_SAVE', data }))
  }
  try {
    const existing = await chrome.storage.local.get('kb_cache')
    const kb = existing.kb_cache || []
    kb.push(data)
    if (kb.length > 200) kb.splice(0, kb.length - 200)
    await chrome.storage.local.set({ kb_cache: kb })
  } catch (e) { /* ignore */ }
}

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
