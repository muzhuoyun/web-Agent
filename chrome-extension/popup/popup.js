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
  $('benchBtn').onclick = benchCurrent
  $('newProfileBtn').onclick = newProfile
  $('benchAllBtn').onclick = benchAll

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

    // 所有二值字段统一渲染为 toggle（boolean → format: 'checkbox'），递归覆盖嵌套结构
    const schema = makeBooleanCheckboxes(p.configSchema || { type: 'object', properties: {} })
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
    // 统一 description 挂载位置：jsoneditor 把 checkbox/输入框等基础类型字段的说明文字渲染在控件 div
    // 内部，而 array/object 等容器字段是字段容器的直接子节点——渲染完成后把前者也移到容器直接子节点，
    // 保证所有字段的说明文字都在「标题/控件之下独立一行」（p.je-form-input-label 是 description 的固定结构）
    const normalizeDescriptions = () => {
      container.querySelectorAll('p.je-form-input-label').forEach(p => {
        const field = p.closest('[data-schemapath]')
        if (!field || p.parentElement === field) return // 已是字段容器直接子节点（array/object）的跳过
        field.appendChild(p)
      })
    }
    if (cfgEditor.ready) normalizeDescriptions()
    else cfgEditor.on('ready', normalizeDescriptions)
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

// ─────────────────────────────────────────────
//  LLM 配置方案（多套并存 + 切换）
// ─────────────────────────────────────────────
// 关键设计：切换方案时，把该方案的值同时写回旧的扁平字段
// （apiEndpoint / apiKey / model）。这样 service worker 的 getConfig 和所有插件
// 都不需要任何改动 —— 方案只是设置页的一层组织方式，运行时读到的仍是「当前生效值」。
let profiles = []      // [{ id, name, apiEndpoint, apiKey, model }]
let activeId = ''
let editingId = ''     // 表单当前在编辑哪个方案；空串表示在新建
const latency = {}     // id -> { min, mid, max } 本次会话内的测速结果，不持久化

const newId = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

function currentFormConfig() {
  return {
    name: $('profileName').value.trim(),
    apiEndpoint: $('apiEndpoint').value.trim() || 'https://api.openai.com/v1',
    apiKey: $('apiKey').value.trim(),
    model: $('model').value === 'custom' ? $('customModel').value.trim() : $('model').value,
  }
}

function fillForm(p) {
  $('profileName').value = p.name || ''
  $('apiEndpoint').value = p.apiEndpoint || ''
  $('apiKey').value = p.apiKey || ''
  const known = Object.keys(MODEL_ENDPOINTS)
  $('model').value = known.includes(p.model) ? p.model : 'custom'
  $('customModelGroup').style.display = $('model').value === 'custom' ? 'block' : 'none'
  if ($('model').value === 'custom') $('customModel').value = p.model || ''
}

function renderProfiles() {
  const box = $('profileList')
  if (!profiles.length) {
    box.innerHTML = '<div class="profile-empty">还没有保存的方案 —— 在下方填好后点「保存方案」即可创建。</div>'
    return
  }
  box.innerHTML = ''
  profiles.forEach(p => {
    const row = document.createElement('div')
    row.className = 'profile-row' + (p.id === activeId ? ' active' : '')
    const lat = latency[p.id]
    row.innerHTML =
      '<div class="profile-main">' +
        '<div class="profile-name">' + (p.id === activeId ? '✓ ' : '') + esc(p.name || '(未命名)') + '</div>' +
        '<div class="profile-meta">' + esc(p.model || '?') + ' · ' + esc((p.apiEndpoint || '').replace(/^https?:\/\//, '')) + '</div>' +
      '</div>' +
      (lat ? '<div class="profile-lat">中位 ' + lat.mid + 'ms<br>' + lat.min + '–' + lat.max + 'ms</div>' : '') +
      '<div class="profile-del" data-del="' + p.id + '" title="删除">✕</div>'
    row.onclick = ev => {
      if (ev.target.dataset.del) return
      activateProfile(p.id)
    }
    row.querySelector('[data-del]').onclick = ev => { ev.stopPropagation(); deleteProfile(p.id) }
    box.appendChild(row)
  })
}

// 把某个方案设为当前生效，并同步进扁平字段供 SW / 插件读取
function activateProfile(id) {
  const p = profiles.find(x => x.id === id)
  if (!p) return
  activeId = id
  editingId = id
  fillForm(p)
  chrome.storage.sync.set({ llmProfiles: profiles, activeProfileId: activeId }, () => {
    chrome.runtime.sendMessage({
      type: 'UPDATE_CONFIG',
      config: { apiEndpoint: p.apiEndpoint, apiKey: p.apiKey, model: p.model }
    }, () => {
      renderProfiles()
      showSettingsStatus('✅ 已切换到「' + (p.name || '未命名') + '」', 'success')
    })
  })
}

function deleteProfile(id) {
  const p = profiles.find(x => x.id === id)
  if (!p) return
  profiles = profiles.filter(x => x.id !== id)
  if (editingId === id) { editingId = ''; }
  const wasActive = activeId === id
  if (wasActive) activeId = profiles.length ? profiles[0].id : ''
  chrome.storage.sync.set({ llmProfiles: profiles, activeProfileId: activeId }, () => {
    // 删掉的正好是生效方案 → 把接班的那个同步进扁平字段，避免运行时还指向已删配置
    if (wasActive && activeId) return activateProfile(activeId)
    renderProfiles()
    showSettingsStatus('已删除「' + (p.name || '未命名') + '」', '')
  })
}

async function loadSettings() {
  try {
    const store = await chrome.storage.sync.get(['llmProfiles', 'activeProfileId'])
    profiles = Array.isArray(store.llmProfiles) ? store.llmProfiles : []
    activeId = store.activeProfileId || ''

    // 迁移：旧版只有扁平配置，首次进来时把它收成一个默认方案，避免设置「凭空消失」
    if (!profiles.length) {
      const cfg = await chrome.runtime.sendMessage({ type: 'GET_CONFIG' })
      if (cfg && cfg.apiKey) {
        const p = { id: newId(), name: '默认', apiEndpoint: cfg.apiEndpoint, apiKey: cfg.apiKey, model: cfg.model }
        profiles = [p]; activeId = p.id
        await chrome.storage.sync.set({ llmProfiles: profiles, activeProfileId: activeId })
      }
    }
    if (!activeId && profiles.length) activeId = profiles[0].id

    const act = profiles.find(p => p.id === activeId)
    editingId = act ? act.id : ''
    fillForm(act || { apiEndpoint: '', apiKey: '', model: 'gpt-4o-mini' })
    renderProfiles()
  } catch (e) {}
}

function saveSettings() {
  const cfg = currentFormConfig()
  if (!cfg.apiKey) return showSettingsStatus('⚠️ 请填写 API Key', 'error')
  if (!cfg.name) cfg.name = cfg.model || '未命名'

  const existing = profiles.find(p => p.id === editingId)
  if (existing) {
    Object.assign(existing, cfg)
  } else {
    const p = Object.assign({ id: newId() }, cfg)
    profiles.push(p)
    editingId = p.id
    if (!activeId) activeId = p.id // 第一个方案自动生效
  }
  delete latency[editingId] // 配置变了，旧的测速结果不再代表它
  chrome.storage.sync.set({ llmProfiles: profiles, activeProfileId: activeId }, () => {
    // 编辑的正是生效方案 → 同步扁平字段，否则运行时还在用旧值
    if (editingId === activeId) {
      const p = profiles.find(x => x.id === activeId)
      chrome.runtime.sendMessage({ type: 'UPDATE_CONFIG', config: { apiEndpoint: p.apiEndpoint, apiKey: p.apiKey, model: p.model } }, () => {
        renderProfiles(); showSettingsStatus('✅ 已保存并生效', 'success')
      })
    } else {
      renderProfiles(); showSettingsStatus('✅ 已保存（点上方该行可切为生效）', 'success')
    }
  })
}

function newProfile() {
  editingId = ''
  fillForm({ apiEndpoint: '', apiKey: '', model: 'gpt-4o-mini' })
  $('profileName').value = ''
  $('benchResult').textContent = ''
  renderProfiles()
  showSettingsStatus('填好后点「保存方案」创建', '')
  $('profileName').focus()
}

// ─── 延迟测量 ───
// 测的是首字延迟（TTFB）：请求发出到收到第一个内容 token。
// 参数刻意和 adult-guard 的审核调用保持一致（max_tokens 小、temperature 0、关思考），
// 这样测出来的数就是屏蔽链路实际会遇到的延迟，而不是一个漂亮但无关的数字。
async function measureOnce(cfg, signal) {
  const t0 = performance.now()
  const res = await fetch(`${cfg.apiEndpoint}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      model: cfg.model, stream: true, max_tokens: 8, temperature: 0,
      thinking: { type: 'disabled' }, reasoning_effort: 'minimal',
      messages: [{ role: 'user', content: '只回答 true 或 false：这段话包含色情内容吗？今天天气很好。' }]
    }),
    signal
  })
  if (!res.ok) throw new Error('HTTP ' + res.status)
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const txt = dec.decode(value, { stream: true })
      // 收到第一个真正的内容增量才算首字（跳过 role 之类的空 delta）
      for (const line of txt.split('\n')) {
        const s = line.trim()
        if (!s.startsWith('data: ') || s === 'data: [DONE]') continue
        try {
          const d = JSON.parse(s.slice(6)).choices?.[0]?.delta
          if (d && d.content) return performance.now() - t0
        } catch (_) {}
      }
    }
  } finally {
    try { await reader.cancel() } catch (_) {}
  }
  return performance.now() - t0 // 没解析到内容增量时退回总耗时
}

async function measure(cfg, runs) {
  const vals = []
  for (let i = 0; i < runs; i++) vals.push(await measureOnce(cfg))
  vals.sort((a, b) => a - b)
  const r = n => Math.round(n)
  return { min: r(vals[0]), mid: r(vals[Math.floor((vals.length - 1) / 2)]), max: r(vals[vals.length - 1]), all: vals.map(r) }
}

async function benchCurrent() {
  const cfg = currentFormConfig()
  if (!cfg.apiKey) return showSettingsStatus('⚠️ 请填写 API Key', 'error')
  const btn = $('benchBtn')
  btn.disabled = true; btn.textContent = '测速中...'
  $('benchResult').textContent = ''
  try {
    const RUNS = 5
    const s = await measure(cfg, RUNS)
    if (editingId) { latency[editingId] = s; renderProfiles() }
    $('benchResult').innerHTML =
      `<b>${esc(cfg.model)}</b> 首字延迟（${RUNS} 次）<br>最快 ${s.min}ms · 中位 <b>${s.mid}ms</b> · 最慢 ${s.max}ms<br>` +
      `<span style="opacity:.7">全部：${s.all.join(' / ')}ms</span>`
    showSettingsStatus('✅ 测速完成', 'success')
  } catch (e) {
    $('benchResult').textContent = ''
    showSettingsStatus('❌ 测速失败: ' + e.message, 'error')
  } finally {
    btn.disabled = false; btn.textContent = '⏱ 测延迟'
  }
}

async function benchAll() {
  if (!profiles.length) return showSettingsStatus('⚠️ 还没有保存的方案', 'error')
  const btn = $('benchAllBtn')
  btn.disabled = true
  const RUNS = 3
  for (let i = 0; i < profiles.length; i++) {
    const p = profiles[i]
    btn.textContent = `测速 ${i + 1}/${profiles.length}...`
    if (!p.apiKey) continue
    try {
      latency[p.id] = await measure(p, RUNS)
    } catch (e) {
      latency[p.id] = { min: 0, mid: 0, max: 0, all: [], err: e.message }
    }
    renderProfiles()
  }
  btn.disabled = false; btn.textContent = '⏱ 全部测延迟'
  const ok = profiles.filter(p => latency[p.id] && latency[p.id].mid).sort((a, b) => latency[a.id].mid - latency[b.id].mid)
  $('benchResult').innerHTML = ok.length
    ? '按中位首字延迟排序（每个 ' + RUNS + ' 次）：<br>' + ok.map((p, i) =>
        `${i + 1}. <b>${esc(p.name || '未命名')}</b> ${latency[p.id].mid}ms（${latency[p.id].min}–${latency[p.id].max}ms）· ${esc(p.model)}`).join('<br>')
    : '没有可用的测速结果'
  showSettingsStatus('✅ 全部测速完成', 'success')
}

async function testConnection() {
  const config = currentFormConfig()
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

// boolean 字段统一渲染为 checkbox（popup CSS 再样式化为 toggle 开关），避免默认的 true/false 下拉框。
// 递归处理 properties/items/patternProperties/additionalProperties 中的所有 boolean 节点；
// 深拷贝后注入，不改动插件原始 schema。
function makeBooleanCheckboxes(schema) {
  const clone = JSON.parse(JSON.stringify(schema))
  const walk = node => {
    if (!node || typeof node !== 'object') return
    if (node.type === 'boolean') node.format = 'checkbox'
    if (node.properties && typeof node.properties === 'object') {
      for (const key of Object.keys(node.properties)) walk(node.properties[key])
    }
    if (Array.isArray(node.items)) { for (const it of node.items) walk(it) }
    else if (node.items && typeof node.items === 'object') walk(node.items)
    if (node.patternProperties && typeof node.patternProperties === 'object') {
      for (const key of Object.keys(node.patternProperties)) walk(node.patternProperties[key])
    }
    if (node.additionalProperties && typeof node.additionalProperties === 'object') walk(node.additionalProperties)
  }
  walk(clone)
  return clone
}
