// edit-plugin/editor.js
const $ = id => document.getElementById(id)
const params = new URLSearchParams(location.search)
const pluginId = params.get('id')

const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
const cmTheme = isDark ? 'material-darker' : 'default'

const metaEditor = CodeMirror.fromTextArea(document.getElementById('editMeta'), {
  lineNumbers: true, mode: 'application/json', indentUnit: 2, tabSize: 2, lineWrapping: true, theme: cmTheme
})
const codeEditor = CodeMirror.fromTextArea(document.getElementById('editCode'), {
  lineNumbers: true, mode: 'javascript', indentUnit: 2, tabSize: 2,
  lineWrapping: true, styleActiveLine: true, theme: cmTheme,
  extraKeys: { 'Ctrl-S': () => $('saveBtn').click() }
})

if (!pluginId) { $('loading').textContent = '缺少插件 ID 参数' } else { loadPlugin(pluginId) }

async function loadPlugin(id) {
  try {
    const res = await chrome.runtime.sendMessage({ type: 'GET_PLUGIN_META', pluginId: id })
    const meta = res?.meta
    if (!meta) { $('loading').textContent = '插件未找到'; return }

    $('loading').style.display = 'none'
    $('editor').style.display = 'flex'

    // 初始化分栏拖拽
    ;(function() {
      var s = document.getElementById('splitter'), l = document.getElementById('leftPane')
      if (!s || !l) return
      var drag = false, sx, sw
      s.addEventListener('mousedown', function(e){ drag=true; sx=e.clientX; sw=l.offsetWidth; document.body.style.cursor='col-resize'; document.body.style.userSelect='none' })
      document.addEventListener('mousemove', function(e){ if(!drag)return; var nw=sw+e.clientX-sx, p=nw/document.getElementById('body').offsetWidth*100; if(p<20)p=20; if(p>50)p=50; l.style.flex='0 0 '+p+'%' })
      document.addEventListener('mouseup', function(){ if(drag){ drag=false; document.body.style.cursor=''; document.body.style.userSelect='' } })
    })()

    $('pluginMeta').textContent = `${meta.name} (v${meta.version || '1.0.0'}) · ID: ${id}`

    // 元数据 JSON
    const metaObj = { id, name: meta.name, icon: meta.icon, description: meta.description,
      triggers: meta.triggers, systemPrompt: meta.systemPrompt, configSchema: meta.configSchema }
    metaEditor.setValue(JSON.stringify(metaObj, null, 2))

    // 核心代码
    try {
      const text = await (await fetch(chrome.runtime.getURL(`plugins/${id}/content.js`))).text()
      const match = text.match(/\/\/ ===== 用户逻辑 =====\r?\n([\s\S]*?)\r?\n\/\/ ===== 用户逻辑结束 =====/)
      codeEditor.setValue(match ? match[1].trim() : text)
    } catch (_) {
      codeEditor.setValue('// 无法加载源码')
    }

    // 显示运行错误
    try {
      const errKey = 'plugin_err_' + id
      const errData = await chrome.storage.local.get(errKey)
      const errors = errData[errKey]
      if (errors && errors.length > 0) {
        const last = errors[errors.length - 1]
        $('detailError').style.display = 'block'
        $('detailError').textContent = '⚠️ ' + last.msg + '\n' + new Date(last.time).toLocaleString()
      }
    } catch (_) {}

    $('saveBtn').onclick = savePlugin
    $('deleteBtn').onclick = deletePlugin
  } catch (e) {
    $('loading').textContent = '加载失败: ' + e.message
  }
}

async function savePlugin() {
  const metaRaw = metaEditor.getValue().trim()
  const code = codeEditor.getValue().trim()
  const errors = []

  let meta
  try { meta = JSON.parse(metaRaw) } catch (e) { errors.push('元数据 JSON 格式错误: ' + e.message) }
  if (meta) {
    if (!meta.id || !meta.name || !meta.triggers || meta.triggers.length === 0) errors.push('缺少必要字段（id, name, triggers）')
  }
  if (!code) errors.push('代码不能为空')

  if (errors.length > 0) {
    $('detailError').style.display = 'block'
    $('detailError').textContent = errors.join('\n')
    return
  }

  $('saveBtn').disabled = true; $('saveBtn').textContent = '保存中...'

  try {
    const res = await fetch('http://localhost:3457/plugin/update', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meta, code })
    })
    const result = await res.json()

    if (!result.success) {
      $('detailError').style.display = 'block'
      $('detailError').textContent = (result.errors || ['未知错误']).join('\n')
    } else {
      $('detailError').style.display = 'none'
      showStatus('✅ 保存成功！扩展即将重启', 'success')
      setTimeout(() => chrome.runtime.sendMessage({ type: 'PLUGIN_RELOAD_REQUEST' }), 500)
    }
  } catch (e) {
    showStatus('连接服务器失败: ' + e.message, 'error')
  } finally {
    $('saveBtn').disabled = false; $('saveBtn').textContent = '保存并验证'
  }
}

async function deletePlugin() {
  if (!confirm('确定删除此插件？')) return
  await chrome.runtime.sendMessage({ type: 'REMOVE_PLUGIN', pluginId })
  showStatus('已删除，扩展即将重启', 'success')
  chrome.runtime.sendMessage({ type: 'PLUGIN_RELOAD_REQUEST' })
}

function showStatus(msg, type) {
  const el = $('editStatus'); el.textContent = msg; el.className = 'status show ' + (type || '')
}
