// ═══════════════════════════════════════════
// 自动生成 — 色情内容屏蔽 (adult-guard)
// ═══════════════════════════════════════════

// ===== 框架注入 =====
;(() => {
  const api = window.__aiAPI
  if (!api) return
  api.getPluginConfig('adult-guard').then(meta => {
    if (meta && meta.enabled !== false) {
      (async function() {
        try {
          await initPlugin({ api, config: { ...meta.config, ...meta } })
          chrome.storage.local.remove('plugin_err_adult-guard')
        } catch (e) {
          chrome.storage.local.get('plugin_err_adult-guard', function(r) {
            var list = r['plugin_err_adult-guard'] || []
            list.push({ msg: e.message, time: Date.now(), url: location.href })
            if (list.length > 20) list.shift()
            chrome.storage.local.set({ 'plugin_err_adult-guard': list })
          })
        }
      })()
    }
  })
})()

// ===== 用户逻辑 =====
async function initPlugin(ctx) {
  const { api, config } = ctx
  console.log('[adult-guard] 插件已启动')

  const text = document.body.innerText
  if (!text || text.length < 50) return

  const keywords = [
    '成人', '色情', 'av', 'porn', 'xxx', '18禁', '成人影片',
    'fuck', 'sex', 'nude', 'naked', 'pussy', 'dick', 'cock',
    '成人電影', 'a片', '色情影片', '三级片', '黑料'
  ]
  const lower = text.toLowerCase()
  const hit = keywords.some(k => lower.includes(k))
  console.log('[adult-guard] 关键词:', hit ? '命中' : '未命中')
  if (!hit) return

  console.log('[adult-guard] 调 LLM...')
  try {
    const msg = [
      { role: 'system', content: config.systemPrompt || '你是一个内容审核助手，判断以下文字是否包含色情内容，只回答 true 或 false。' },
      { role: 'user', content: text.slice(0, 3000) }
    ]
    let result = ''
    for await (const chunk of api.createLLMStream(msg)) { result += chunk }
    console.log('[adult-guard] LLM:', result)
    if (result.toLowerCase().includes('true')) blockPage()
  } catch (e) {
    console.log('[adult-guard] LLM 失败:', e.message)
    if (hit) blockPage()
  }

  function blockPage() {
    console.log('[adult-guard] 屏蔽!')
    document.title = '⚠️ 内容已屏蔽'
    const o = document.createElement('div')
    o.id = 'ai-adult-guard-overlay'
    o.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483630;background:linear-gradient(135deg,#1a1a2e,#16213e,#0f3460);display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif'
    o.innerHTML = '<div style="background:rgba(255,255,255,.05);backdrop-filter:blur(10px);border-radius:24px;padding:48px;max-width:500px;text-align:center;box-shadow:0 25px 50px -12px rgba(0,0,0,.5)"><div style="font-size:64px;margin-bottom:16px">🛡️</div><h1 style="color:#f87171;font-size:24px;margin-bottom:8px">内容已被屏蔽</h1><p style="color:rgba(255,255,255,.6);line-height:1.6">此页面已被 AI 内容过滤器自动屏蔽。</p><div style="margin-top:24px;padding:6px 16px;border-radius:20px;background:rgba(248,113,113,.15);color:#fca5a5;font-size:12px;display:inline-block;border:1px solid rgba(248,113,113,.2)">AI 内容安全卫士 · 实时守护</div></div>'
    document.body.appendChild(o)
  }
}

// ===== 用户逻辑结束 =====
