// ─────────────────────────────────────────────
// content-script/main.js
// 基础设施 — 只提供工具函数，不参与事件或调度
// ─────────────────────────────────────────────

;(() => {
  'use strict'
  console.log('[AI Agent] API 已注入')

  // ─── LLM 流式 ───
  // 清洗消息内容：页面文本可能含孤立代理对（截断的 emoji / 花体字母，常见于社交媒体用户名），
  // JSON.stringify 会把它序列化成 \uD835 这类转义，部分严格解析器（如 DeepSeek）会报
  // "unexpected end of hex escape"，统一替换为 U+FFFD 保证 JSON body 合法
  function sanitizeContent(s) {
    return String(s).replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '�')
  }

  function createLLMStream(messages) {
    let port = null
    const queue = []
    let done = false, error = null
    let pending = null

    function init() {
      try { port = chrome.runtime.connect({ name: 'plugin-llm' }) } catch (e) {
        // 扩展被 reload 后，旧标签页的 content script 无法再连接（context 失效），提示刷新页面
        error = new Error(chrome.runtime?.id === undefined ? '扩展已重载，请刷新页面后重试' : '连接失败')
        return
      }
      port.onMessage.addListener(msg => {
        switch (msg.type) {
          case 'CHUNK':
            if (pending) { const p = pending; pending = null; p.res({ value: msg.text, done: false }) }
            else queue.push(msg.text)
            break
          case 'DONE': done = true; port?.disconnect(); port = null
            if (pending) { const p = pending; pending = null; p.res({ value: undefined, done: true }) }; break
          case 'ERROR': error = new Error(msg.message); port?.disconnect(); port = null
            // 直接 reject 挂起的迭代（不依赖 disconnect 的 done 兜底），错误必须抛给调用方
            if (pending) { const p = pending; pending = null; p.rej(error) }; break
        }
      })
      port.onDisconnect.addListener(() => { done = true; port = null; if (pending) { const p = pending; pending = null; p.res({ value: undefined, done: true }) } })
      port.postMessage({ type: 'LLM_STREAM', messages: messages.map(m => ({ ...m, content: sanitizeContent(m.content) })) })
    }
    init()
    return {
      [Symbol.asyncIterator]() {
        return {
          next() {
            // error 优先于 done：SW 发 ERROR 时 onDisconnect 会把 done 置 true，
            // 若先查 done 会让 for await 静默结束，错误被吞、调用方拿到空结果
            if (error) return Promise.reject(error)
            if (queue.length) return Promise.resolve({ value: queue.shift(), done: false })
            if (done) return Promise.resolve({ value: undefined, done: true })
            return new Promise((res, rej) => { pending = { res, rej } })
          },
          return() { if (port) { try { port.postMessage({ type: 'CANCEL' }) } catch(_) {} try { port.disconnect() } catch(_) {} port = null } return Promise.resolve({ value: undefined, done: true }) }
        }
      }
    }
  }

  // ─── 页面上下文 ───
  function getPageContext(selectedText) {
    const md = s => document.querySelector(s)?.content?.trim?.() || ''
    const full = document.body.innerText || ''
    const idx = full.indexOf(selectedText)
    return {
      title: document.title, url: location.href,
      description: md('meta[name="description"]'), keywords: md('meta[name="keywords"]'),
      h1: document.querySelector('h1')?.textContent?.trim?.() || '',
      h2: document.querySelector('h2')?.textContent?.trim?.() || '',
      surrounding: idx !== -1 ? full.slice(Math.max(0,idx-500), idx+selectedText.length+500) : ''
    }
  }

  // ─── 带超时的 sendMessage（SW 不响应时不阻塞）───
  function sendMessageWithTimeout(msg, timeout = 3000) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), timeout)
      chrome.runtime.sendMessage(msg).then(r => { clearTimeout(timer); resolve(r) }).catch(() => { clearTimeout(timer); resolve(null) })
    })
  }

  async function getPluginConfig(pluginId) {
    try {
      const res = await sendMessageWithTimeout({ type: 'GET_PLUGIN_META', pluginId })
      return res?.meta || {}
    } catch (_) { return {} }
  }

  async function isPluginEnabled(pluginId) {
    try {
      const res = await sendMessageWithTimeout({ type: 'GET_PLUGIN_META', pluginId })
      return res?.meta?.enabled !== false
    } catch (_) { return true }
  }

  // ─── 打开侧边栏（封装 SW 通信）───
  function openSidePanel(html, title) {
    chrome.storage.local.set({ sidepanel_data: { html, title, time: Date.now() } }, function() {
      chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL' })
    })
  }

  // ─── 暴露给插件 ───
  window.__aiAPI = { createLLMStream, getPageContext, getPluginConfig, isPluginEnabled, openSidePanel }
})()
