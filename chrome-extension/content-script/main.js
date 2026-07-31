// ─────────────────────────────────────────────
// content-script/main.js
// 基础设施 — 只提供工具函数，不参与事件或调度
// ─────────────────────────────────────────────

;(() => {
  'use strict'
  console.log('[AI Agent] API 已注入')

  // ─── LLM 流式 ───
  function createLLMStream(messages) {
    let port = null
    const queue = []
    let done = false, error = null
    let pending = null

    function init() {
      try { port = chrome.runtime.connect({ name: 'plugin-llm' }) } catch (e) { error = new Error('连接失败'); return }
      port.onMessage.addListener(msg => {
        switch (msg.type) {
          case 'CHUNK':
            if (pending) { pending({ value: msg.text, done: false }); pending = null }
            else queue.push(msg.text)
            break
          case 'DONE': done = true; port?.disconnect(); port = null
            if (pending) { pending({ value: undefined, done: true }); pending = null }; break
          case 'ERROR': error = new Error(msg.message); port?.disconnect(); port = null
            if (pending) { pending({ value: undefined, done: true }); pending = null }; break
        }
      })
      port.onDisconnect.addListener(() => { done = true; port = null; if (pending) { pending({ value: undefined, done: true }); pending = null } })
      port.postMessage({ type: 'LLM_STREAM', messages })
    }
    init()
    return {
      [Symbol.asyncIterator]() {
        return {
          next() {
            if (queue.length) return Promise.resolve({ value: queue.shift(), done: false })
            if (done) return Promise.resolve({ value: undefined, done: true })
            if (error) return Promise.reject(error)
            return new Promise(r => { pending = r })
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

  // ─── 存知识库 ───
  function saveToKB(data) {
    chrome.runtime.sendMessage({ type: 'SAVE_TO_KB', data }).catch(() => {})
  }

  // ─── 打开侧边栏（封装 SW 通信）───
  function openSidePanel(html, title) {
    chrome.storage.local.set({ sidepanel_data: { html, title, time: Date.now() } }, function() {
      chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL' })
    })
  }

  // ─── 暴露给插件 ───
  window.__aiAPI = { createLLMStream, getPageContext, getPluginConfig, isPluginEnabled, saveToKB, openSidePanel }
})()
