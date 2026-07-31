// ─────────────────────────────────────────────
// popup/popup.js — 插件商店首页
// ─────────────────────────────────────────────

let plugins = []

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

  // 动态渲染配置字段
  const schema = p.configSchema || {}
  const config = p.config || {}
  const fields = { systemPrompt: { type: 'textarea', label: '系统提示词' }, ...schema }
  const container = $('cfgDynamicFields')
  container.innerHTML = ''
  const fieldIds = {}

  for (const [key, spec] of Object.entries(fields)) {
    const id = 'cfg_' + key
    fieldIds[key] = id
    const val = p[key] !== undefined ? p[key] : (config[key] !== undefined ? config[key] : spec.default || '')

    const group = document.createElement('div')
    group.className = 'form-group'
    group.innerHTML = `<label>${spec.label || key}</label>`

    if (spec.type === 'textarea') {
      const ta = document.createElement('textarea')
      ta.id = id; ta.rows = 3; ta.value = val
      group.appendChild(ta)
    } else if (spec.type === 'select' && spec.options) {
      const sel = document.createElement('select'); sel.id = id
      spec.options.forEach(opt => {
        const o = document.createElement('option'); o.value = opt; o.textContent = opt
        if (opt === val) o.selected = true
        sel.appendChild(o)
      })
      group.appendChild(sel)
    } else {
      const input = document.createElement('input')
      input.id = id; input.type = spec.type || 'text'
      if (spec.min !== undefined) input.min = spec.min
      if (spec.max !== undefined) input.max = spec.max
      if (spec.step !== undefined) input.step = spec.step
      input.value = val
      group.appendChild(input)
    }
    container.appendChild(group)
  }

  $('cfgSaveBtn').onclick = async () => {
    const updates = { id, name: $('cfgName').value.trim(), description: $('cfgDesc').value.trim() }
    for (const key of Object.keys(fields)) {
      const el = document.getElementById(fieldIds[key])
      if (el) updates[key] = el.value
    }
    try {
      await chrome.runtime.sendMessage({ type: 'UPDATE_PLUGIN_META', plugin: updates })
      showDetailStatus('✅ 已保存', 'success')
    } catch (e) {
      showDetailStatus('保存失败', 'error')
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
  'deepseek-chat': 'https://api.deepseek.com/v1', 'qwen-plus': 'https://dashscope.aliyuncs.com/compatible-mode/v1',
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
