// ─────────────────────────────────────────────
// add-plugin/install.js — 直接 HTTP 请求服务器
// ─────────────────────────────────────────────

const $ = id => document.getElementById(id)

// 暗色模式检测
const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches

// 初始化 CodeMirror
const metaEditor = CodeMirror.fromTextArea($('metaInput'), {
  theme: isDark ? 'material-darker' : 'default',
  lineNumbers: true, mode: 'application/json', indentUnit: 2, tabSize: 2, lineWrapping: true,
  placeholder: '{\n  "id": "my-plugin",\n  "name": "我的插件",\n  "icon": "🔌",\n  "description": "插件描述",\n  "triggers": ["alt-select"],\n  "systemPrompt": "你是一个AI助手，...",\n  "configSchema": {\n    "systemPrompt": { "type": "textarea", "label": "提示词" },\n    "temperature": { "type": "number", "label": "温度", "default": 0.7 }\n  }\n}'
})
const codeEditor = CodeMirror.fromTextArea($('codeInput'), {
  lineNumbers: true,
  mode: 'javascript',
  indentUnit: 2,
  tabSize: 2,
  lineWrapping: true,
  styleActiveLine: true,
  theme: isDark ? 'material-darker' : 'default',
  placeholder: 'async function initPlugin(ctx) {\n  const { api, config } = ctx\n\n  document.addEventListener("mouseup", async (e) => {\n    if (!e.altKey) return\n    const text = window.getSelection().toString().trim()\n    if (!text) return; e.preventDefault()\n    const msg = [\n      { role: "system", content: config.systemPrompt },\n      { role: "user", content: text }\n    ]\n    for await (const chunk of api.createLLMStream(msg)) {\n      console.log(chunk)\n    }\n  })\n}',
  extraKeys: { 'Ctrl-S': () => $('installBtn').click() }
})

// 页面加载时拉取已有插件列表
let existingPlugins = []
chrome.runtime.sendMessage({ type: 'GET_ALL_PLUGINS' }, res => { existingPlugins = res?.plugins || [] })

$('installBtn').onclick = async () => {
  const metaRaw = metaEditor.getValue().trim()
  const code = codeEditor.getValue().trim()
  const metaErrors = []
  const codeErrors = []

  hideStatus('metaStatus')
  hideStatus('codeStatus')
  hideStatus('installStatus')

  // 1. JSON 解析
  let meta
  try { meta = JSON.parse(metaRaw) } catch (e) { metaErrors.push('元数据 JSON 格式错误: ' + e.message) }

  // 2. 字段完整性检查
  if (meta) {
    if (!meta.id) metaErrors.push('缺少 id')
    else if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(meta.id)) metaErrors.push('id 只能包含英文、数字、-、_，且以字母开头')
    else if (existingPlugins.some(p => p.id === meta.id)) metaErrors.push('id "' + meta.id + '" 已被占用')
    if (!meta.name) metaErrors.push('缺少 name')
    if (!meta.triggers || !Array.isArray(meta.triggers) || meta.triggers.length === 0) metaErrors.push('缺少 triggers（触发方式，如 ["alt-select"]）')
  }
  if (!code) codeErrors.push('代码不能为空')

  if (metaErrors.length > 0) showStatus('metaStatus', metaErrors.join('\n'), 'error')
  if (codeErrors.length > 0) showStatus('codeStatus', codeErrors.join('\n'), 'error')
  if (metaErrors.length > 0 || codeErrors.length > 0) {
    showStatus('installStatus', '以上问题修复后重新点击安装', 'error')
    return
  }

  // 3. 直连服务器安装
  $('installBtn').disabled = true
  $('installBtn').textContent = '安装中...'
  showStatus('installStatus', '正在连接服务器...', '')

  try {
    const res = await fetch('http://localhost:3457/plugin/install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meta, code })
    })
    const result = await res.json()

    if (!result.success) {
      showStatus('codeStatus', (result.errors || ['未知错误']).join('\n'), 'error')
      showStatus('installStatus', '安装失败，请修复后重试', 'error')
    } else {
      showStatus('installStatus', '✅ 安装成功！扩展即将重启', 'success')
      setTimeout(() => chrome.runtime.sendMessage({ type: 'PLUGIN_RELOAD_REQUEST' }), 500)
    }
  } catch (e) {
    showStatus('installStatus', '连接服务器失败: ' + e.message, 'error')
  } finally {
    $('installBtn').disabled = false
    $('installBtn').textContent = '安装并验证'
  }
}

function showStatus(id, msg, type) {
  const el = $(id)
  el.textContent = msg
  el.className = 'status show ' + (type || '')
  el.style.display = 'block'
}

function hideStatus(id) {
  const el = $(id); if (el) { el.style.display = 'none'; el.className = 'status' }
}
