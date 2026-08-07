// ─────────────────────────────────────────────
// popup/popup.js — 插件商店首页
// ─────────────────────────────────────────────

let plugins = []
let cfgEditor = null        // 插件详情页的 JSONEditor 实例
let jsonEditorPromise = null

// ─── DOM ───
const $ = id => document.getElementById(id)
const page = name => document.getElementById(`page-${name}`)

function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  page(name).classList.add('active')
}

// ─── 初始化 ───
document.addEventListener('DOMContentLoaded', async () => {
  await loadPlugins()
  checkServerStatus()

  // 添加插件 → 开新标签页，关掉 popup
  $('gotoAdd').onclick = () => {
    chrome.tabs.create({ url: 'add-plugin/index.html' })
    window.close()
  }
  $('gotoSettings').onclick = () => { showPage('settings'); loadSettings() }
  $('detailBack').onclick = () => { showPage('home'); loadPlugins() }

  // 设置页返回
  $('settingsBack').onclick = () => showPage('home')

  // 保存设置
  $('saveBtn').onclick = saveSettings
  $('testBtn').onclick = testConnection

  // 模型切换
  $('model').onchange = () => {
    $('customModelGroup').style.display = $('model').value === 'custom' ? 'block' : 'none'
  }

})

// ─────────────────────────────────────────────
//  插件列表
// ─────────────────────────────────────────────

let pluginErrors = {}

async function loadPlugins() {
  try {
    const res = await chrome.runtime.sendMessage({ type: 'GET_ALL_PLUGINS' })
    plugins = res.plugins || []
  } catch (e) {
    plugins = []
  }
  // 加载各插件的运行错误
  pluginErrors = {}
  for (const p of plugins) {
    try {
      const key = 'plugin_err_' + p.id
      const data = await chrome.storage.local.get(key)
      if (data[key] && data[key].length > 0) pluginErrors[p.id] = data[key]
    } catch (_) {}
  }
  renderPlugins()
}

function renderPlugins() {
  const list = $('pluginList')
  if (plugins.length === 0) {
    list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted)">暂无插件</div>'
    return
  }
  list.innerHTML = plugins.map(p => {
    const valid = p.valid !== false
    const labels = p.triggerLabels || {}
    const triggerText = (p.triggers || []).map(t => labels[t] || t).join(', ')
    const errors = pluginErrors[p.id]
    const errCount = errors ? errors.length : 0
    return `
    <div class="plugin-card" data-id="${p.id}" style="${valid ? '' : 'opacity:0.6'}">
      <span class="plugin-icon" style="position:relative">
        ${valid ? (p.icon || '🔌') : '⚠️'}
        ${errCount > 0 ? '<span style="position:absolute;top:-4px;right:-8px;background:#ef4444;color:#fff;font-size:10px;border-radius:8px;padding:1px 5px;min-width:16px;text-align:center">!</span>' : ''}
      </span>
      <div class="plugin-info">
        <div class="plugin-name">${esc(p.name || p.id)} ${errCount > 0 ? '<span style="color:#ef4444;font-size:11px">(有错误)</span>' : ''}</div>
        <div class="plugin-desc">${valid ? esc(p.description || '') : '⚠️ 插件配置不完整或代码有误，点击修复'}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px">触发: ${triggerText}</div>
      </div>
      <button class="toggle ${p.config?.enabled !== false ? 'on' : ''}" data-id="${p.id}" data-toggle ${valid ? '' : 'disabled'}</button>
    </div>`
  }).join('')

  list.querySelectorAll('.plugin-card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('[data-toggle]')) return
      showDetail(card.dataset.id)
    })
  })
  list.querySelectorAll('[data-toggle]').forEach(btn => {
    if (btn.disabled) return
    btn.addEventListener('click', async e => {
      e.stopPropagation()
      const id = btn.dataset.id
      const on = !btn.classList.contains('on')
      btn.classList.toggle('on', on)
      await chrome.runtime.sendMessage({
        type: 'UPDATE_PLUGIN_CONFIG',
        pluginId: id,
        config: { enabled: on }
      })
    })
  })
}

// ─────────────────────────────────────────────
//  插件详情
// ─────────────────────────────────────────────

// 懒加载 JSONEditor + FontAwesome 图标样式（只在打开详情页时加载，保持弹窗启动速度）
function loadJSONEditor() {
  if (window.JSONEditor) return Promise.resolve()
  if (!jsonEditorPromise) {
    jsonEditorPromise = new Promise((resolve, reject) => {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = chrome.runtime.getURL('vendor/fontawesome/css/all.min.css')
      document.head.appendChild(link)
      const s = document.createElement('script')
      s.src = chrome.runtime.getURL('vendor/jsoneditor/jsoneditor.js')
      s.onload = () => resolve()
      s.onerror = () => reject(new Error('JSONEditor 加载失败'))
      document.head.appendChild(s)
    })
  }
  return jsonEditorPromise
}

function showDetail(id) {
  const p = plugins.find(x => x.id === id)
  if (!p) return

  $('detailIcon').textContent = p.icon || '🔌'
  $('detailTitle').textContent = p.name || p.id
  const triggers = { 'alt-select': 'Alt+选中', 'alt-h': 'Alt+H 隐藏', 'action-icon': '工具栏图标' }
  const triggerText = (p.triggers || []).map(t => triggers[t] || t).join(', ')
  $('detailMeta').textContent = `ID: ${p.id}  v${p.version || '1.0.0'}  |  触发: ${triggerText}`

  // 显示运行错误
  const errors = pluginErrors[id]
  const errorEl = $('detailError')
  if (errors && errors.length > 0) {
    const last = errors[errors.length - 1]
    errorEl.style.display = 'block'
    errorEl.textContent = '⚠️ 错误: ' + last.msg + '\n' + new Date(last.time).toLocaleString()
  } else {
    errorEl.style.display = 'none'
  }

  $('cfgName').value = p.name || ''
  $('cfgDesc').value = p.description || ''
  $('detailStatus').className = 'status'

  // 懒加载 JSONEditor，渲染配置表单（基于 configSchema）
  loadJSONEditor().then(async () => {
    // 用 GET_PLUGIN_META 的合并配置预填（含存储覆盖值），失败时退回列表数据
    let config = p.config || {}
    try {
      const res = await chrome.runtime.sendMessage({ type: 'GET_PLUGIN_META', pluginId: id })
      if (res?.meta) config = res.meta.config || {}
    } catch (_) {}

    const schema = p.configSchema || { type: 'object', properties: {} }
    // 只传配置中实际存在的属性，缺失键由 JSONEditor 用 schema default 填充
    const startval = {}
    for (const key of Object.keys(schema.properties || {})) {
      if (config[key] !== undefined) startval[key] = config[key]
    }

    if (cfgEditor) { try { cfgEditor.destroy() } catch (_) {} }
    const container = $('cfgDynamicFields')
    container.innerHTML = ''
    cfgEditor = new JSONEditor(container, {
      schema,
      startval,
      theme: 'html',
      iconlib: 'fontawesome5',
      disable_edit_json: true,
      disable_collapse: true,
      disable_properties: true,
      disable_array_delete_all_rows: true,
      disable_array_delete_last_row: true
    })
  }).catch(e => {
    $('cfgDynamicFields').innerHTML =
      `<div style="padding:8px 12px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);border-radius:6px;color:var(--danger);font-size:12px">配置编辑器加载失败: ${esc(e.message)}</div>`
  })

  $('cfgSaveBtn').onclick = async () => {
    if (!cfgEditor) return showDetailStatus('配置编辑器尚未加载', 'error')
    if (!cfgEditor.ready) await new Promise(r => cfgEditor.on('ready', r)) // 初始化是异步的，等 ready
    const errs = cfgEditor.validate()
    if (errs && errs.length) {
      return showDetailStatus('配置无效: ' + errs.map(e => e.message).join('; '), 'error')
    }
    const btn = $('cfgSaveBtn')
    btn.disabled = true
    try {
      const updates = { id, name: $('cfgName').value.trim(), description: $('cfgDesc').value.trim(), ...cfgEditor.getValue() }
      await chrome.runtime.sendMessage({ type: 'UPDATE_PLUGIN_META', plugin: updates })
      showDetailStatus('✅ 已保存', 'success')
    } catch (e) {
      showDetailStatus('保存失败', 'error')
    } finally {
      btn.disabled = false
    }
  }

  $('cfgEditBtn').onclick = () => {
    chrome.tabs.create({ url: `edit-plugin/index.html?id=${id}` })
    window.close()
  }

  showPage('detail')
}

function showDetailStatus(msg, type) {
  const el = $('detailStatus')
  el.textContent = msg; el.className = 'status show ' + (type || '')
}

// ─── 设置页 ───
const MODEL_ENDPOINTS = {
  'gpt-4o-mini': 'https://api.openai.com/v1', 'gpt-4o': 'https://api.openai.com/v1',
  'deepseek-v4-flash': 'https://api.deepseek.com/v1', 'qwen-plus': 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  'claude-sonnet-4-6': 'https://api.anthropic.com/v1', 'gemini-2.0-flash': 'https://generativelanguage.googleapis.com/v1beta/openai',
}

async function loadSettings() {
  try {
    const config = await chrome.runtime.sendMessage({ type: 'GET_CONFIG' })
    $('apiEndpoint').value = config.apiEndpoint || ''
    $('apiKey').value = config.apiKey || ''
    const known = Object.keys(MODEL_ENDPOINTS)
    $('model').value = known.includes(config.model) ? config.model : 'custom'
    $('customModelGroup').style.display = $('model').value === 'custom' ? 'block' : 'none'
    if ($('model').value === 'custom') $('customModel').value = config.model
  } catch (e) {}
}

function saveSettings() {
  const config = {
    apiEndpoint: $('apiEndpoint').value.trim() || 'https://api.openai.com/v1',
    apiKey: $('apiKey').value.trim(),
    model: $('model').value === 'custom' ? $('customModel').value.trim() : $('model').value,
  }
  if (!config.apiKey) return showSettingsStatus('⚠️ 请填写 API Key', 'error')
  chrome.runtime.sendMessage({ type: 'UPDATE_CONFIG', config }, () => {
    showSettingsStatus('✅ 已保存', 'success')
  })
}

async function testConnection() {
  const config = {
    apiEndpoint: $('apiEndpoint').value.trim() || 'https://api.openai.com/v1',
    apiKey: $('apiKey').value.trim(),
    model: $('model').value === 'custom' ? $('customModel').value.trim() : $('model').value,
  }
  if (!config.apiKey) return showSettingsStatus('⚠️ 请填写 API Key', 'error')
  $('testBtn').disabled = true; $('testBtn').textContent = '测试中...'
  try {
    const res = await fetch(`${config.apiEndpoint}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` },
      body: JSON.stringify({ model: config.model, messages: [{ role: 'user', content: 'hi' }], max_tokens: 20 })
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    showSettingsStatus('✅ 连接成功', 'success')
  } catch (e) {
    showSettingsStatus('❌ 失败: ' + e.message, 'error')
  } finally {
    $('testBtn').disabled = false; $('testBtn').textContent = '测试连接'
  }
}

function showSettingsStatus(msg, type) {
  const el = $('settingsStatus')
  el.textContent = msg; el.className = 'status show ' + (type || '')
}

// ─────────────────────────────────────────────
//  服务器状态
// ─────────────────────────────────────────────

function checkServerStatus() {
  let connected = false
  const ws = new WebSocket('ws://localhost:3456')
  ws.onopen = () => {
    connected = true
    $('serverDot').className = 'server-dot online'
    $('serverText').textContent = '本地服务器：🟢 已连接'
  }
  ws.onerror = () => {
    if (!connected) {
      $('serverDot').className = 'server-dot offline'
      $('serverText').textContent = '本地服务器：🔴 未运行'
    }
  }
  setTimeout(() => {
    if (!connected) {
      $('serverDot').className = 'server-dot offline'
      $('serverText').textContent = '本地服务器：🔴 未运行'
    }
  }, 1500)
}

// ─── 工具 ───
function esc(s) {
  const d = document.createElement('div'); d.textContent = s; return d.innerHTML
}
