// ═══════════════════════════════════════════
// 自动生成 — 名词解释 (noun-explainer)
// ═══════════════════════════════════════════

// 全局弹窗树（跨 IIFE 共享）
window.__popupTree = window.__popupTree || { nextId: 1, nodes: {} }

;(() => {
  const api = window.__aiAPI
  if (!api) return
  api.getPluginConfig('noun-explainer').then(configMeta => {
    if (configMeta && configMeta.enabled !== false) {
      (async function() {
        try {
          await initPlugin({ api, config: { ...configMeta.config, ...configMeta } })
          chrome.storage.local.remove('plugin_err_noun-explainer')
        } catch (e) {
          chrome.storage.local.get('plugin_err_noun-explainer', function(r) {
            var list = r['plugin_err_noun-explainer'] || []
            list.push({ msg: e.message, time: Date.now(), url: location.href })
            if (list.length > 20) list.shift()
            chrome.storage.local.set({ 'plugin_err_noun-explainer': list })
          })
        }
      })()
    }
  })

// ===== 用户逻辑 =====
async function initPlugin(ctx) {
    const { api, config } = ctx

    let injected = false, svg = null
    const HC = ['rgba(59,130,246,0.25)','rgba(239,68,68,0.25)','rgba(34,197,94,0.25)','rgba(234,179,8,0.25)','rgba(168,85,247,0.25)','rgba(249,115,22,0.25)','rgba(236,72,153,0.25)','rgba(20,184,166,0.25)','rgba(99,102,241,0.25)','rgba(236,72,153,0.25)','rgba(132,204,22,0.25)','rgba(6,182,212,0.25)']
    const BC = ['#3b82f6','#ef4444','#22c55e','#eab308','#a855f7','#f97316','#ec4899','#14b8a6','#6366f1','#ec4899','#84cc16','#06b6d4']

    function injectStyles() {
      if (injected) return; injected = true
      const s = Object.assign(document.createElement('style'), { id: 'ai-ns' })
      s.textContent = '.ai-ns-popup{all:initial;position:fixed;z-index:2147483640;width:380px;max-height:460px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.12);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:14px;line-height:1.6;color:#1f2937;overflow:hidden;opacity:0;transform:translateY(8px)scale(.97);transition:opacity .2s,transform .2s;pointer-events:none;display:flex;flex-direction:column}.ai-ns-popup-visible{opacity:1;transform:translateY(0)scale(1);pointer-events:auto}.ai-ns-header{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:#f8fafc;border-bottom:1px solid #e5e7eb;flex-shrink:0;cursor:grab;user-select:none}.ai-ns-close{all:unset;cursor:pointer;font-size:20px;line-height:1;color:#9ca3af;padding:0 4px;border-radius:4px}.ai-ns-close:hover{color:#ef4444;background:#fef2f2}.ai-ns-sel{padding:8px 14px;background:#fefce8;border-bottom:1px solid #fef08a;font-size:13px;color:#92400e;flex-shrink:0}.ai-ns-body{padding:14px;overflow-y:auto;flex:1;min-height:0;font-size:14px;line-height:1.7}.ai-ns-body code{font-family:monospace;background:#f3f4f6;padding:1px 5px;border-radius:4px;color:#be185d}.ai-ns-body pre{background:#f3f4f6;border:1px solid #e5e7eb;border-radius:8px;padding:12px;overflow-x:auto;margin:8px 0;font-size:13px}.ai-ns-err{color:#dc2626;font-size:13px;padding:8px;background:#fef2f2;border-radius:6px}.ai-ns-actions{display:flex;gap:6px;padding:8px 14px;border-top:1px solid #e5e7eb;background:#f8fafc;flex-shrink:0}.ai-ns-btn{all:unset;cursor:pointer;font-size:12px;padding:4px 10px;border-radius:6px;background:#fff;border:1px solid #d1d5db;color:#374151}.ai-ns-btn:hover{background:#f3f4f6}.ai-ns-input{display:flex;gap:8px;padding:10px 14px;border-bottom:1px solid #e5e7eb;background:#fff;flex-shrink:0;align-items:flex-end}.ai-ns-textarea{all:unset;flex:1;min-height:40px;max-height:88px;resize:none;font-size:13px;line-height:1.5;color:#1f2937;background:#f9fafb;border:1px solid #d1d5db;border-radius:8px;padding:8px 10px;box-sizing:border-box;font-family:inherit}.ai-ns-textarea:focus{border-color:#3b82f6;background:#fff;outline:none}.ai-ns-go{flex-shrink:0;padding:8px 14px;font-size:13px;border:none;border-radius:6px;background:#3b82f6;color:#fff;cursor:pointer}.ai-ns-go:hover{background:#2563eb}@media(prefers-color-scheme:dark){.ai-ns-popup{background:#1f2937;border-color:#374151;color:#e5e7eb}.ai-ns-header{background:#111827;border-color:#374151}.ai-ns-close{color:#6b7280}.ai-ns-close:hover{color:#f87171;background:#3b1a1a}.ai-ns-sel{background:#422006;border-color:#78350f;color:#fdba74}.ai-ns-body code{background:#374151;color:#f9a8d4}.ai-ns-body pre{background:#111827;border-color:#374151}.ai-ns-err{background:#450a0a;color:#fca5a5}.ai-ns-actions{background:#111827;border-color:#374151}.ai-ns-btn{background:#374151;border-color:#4b5563;color:#e5e7eb}.ai-ns-btn:hover{background:#4b5563}.ai-ns-input{background:#1f2937;border-color:#374151}.ai-ns-textarea{background:#111827;border-color:#4b5563;color:#e5e7eb}.ai-ns-textarea:focus{border-color:#3b82f6;background:#111827}.ai-ns-go{background:#3b82f6}.ai-ns-go:hover{background:#2563eb}}'
      document.head.appendChild(s)
    }

    function highlight(range, ci) {
      const s = document.createElement('span'); s.style.cssText = 'background:' + HC[ci] + ';border-radius:2px;outline:1px solid ' + BC[ci] + ';outline-offset:-1px'
      try { range.surroundContents(s) } catch(e) { try { const f = range.extractContents(); s.appendChild(f); range.insertNode(s) } catch(_) { return null } }
      return s
    }

    function createPopup(text) {
      const ci = Math.floor(Math.random() * 12); const el = document.createElement('div'); el.className = 'ai-ns-popup'; el.style.borderColor = BC[ci]
      const headerBg = BC[ci] + '22' // 半透明底色
      el.innerHTML = '<div class="ai-ns-header" style="background:' + headerBg + ';border-bottom-color:' + BC[ci] + '"><span>🤖 名词解释</span><button class="ai-ns-close" data-action="close">&times;</button></div><div class="ai-ns-sel"><span style="font-weight:500;color:#a16207">选中：</span><span style="font-style:italic">' + esc(trunc(text,80)) + '</span></div><div class="ai-ns-input"><textarea class="ai-ns-textarea" rows="2" placeholder="输入提示词（留空则默认：结合上下文解释名词）"></textarea><button class="ai-ns-btn ai-ns-go" title="提交（Enter）">➤ 确定</button></div><div class="ai-ns-body"><div style="text-align:center;color:#6b7280;padding:16px 0">💬 输入提示词后点「确定」，留空默认名词解释</div></div><div class="ai-ns-actions"><button class="ai-ns-btn" data-action="copy">📋 复制</button><button class="ai-ns-btn" data-action="save">💾 存知识库</button></div>'
      return { el, ci }
    }

    function posPopup(el, r) {
      const w = 380, mh = 400, g = 12, vw = innerWidth, vh = innerHeight
      let l = r.left + r.width/2 - w/2, t = r.bottom + g
      if (l < 8) l = 8; if (l + w > vw - 8) l = vw - w - 8
      if (t + mh > vh - 8) { t = r.top - mh - g; if (t < 8) t = 8 }
      el.style.left = l + 'px'; el.style.top = t + 'px'
    }

    function addLine(hlEl, popup, ci) {
      if (!svg) { svg = document.createElementNS('http://www.w3.org/2000/svg','svg'); svg.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:2147483645'; document.body.appendChild(svg) }
      const id = 'l' + Date.now() + Math.random().toString(36).slice(2,6); const p = document.createElementNS('http://www.w3.org/2000/svg','path')
      p.dataset.lid = id; p.setAttribute('stroke', BC[ci]); p.setAttribute('stroke-width','2.5'); p.setAttribute('fill','none'); p.setAttribute('opacity','0.6')
      svg.appendChild(p); upLine(id, hlEl, popup); return id
    }

    function upLine(id, fr, to) {
      const p = svg && svg.querySelector('path[data-lid="' + id + '"]'); if (!p) return
      if (!fr || !fr.isConnected || !to || !to.isConnected) { p.style.display = 'none'; return }
      p.style.display = ''; const a = fr.getBoundingClientRect(), b = to.getBoundingClientRect()
      if (!a.width || !b.width) { p.style.display = 'none'; return }
      const pts = [[a.left+a.width/2,a.top],[a.left+a.width/2,a.bottom],[a.left,a.top+a.height/2],[a.right,a.top+a.height/2],[b.left+b.width/2,b.top],[b.left+b.width/2,b.bottom],[b.left,b.top+b.height/2],[b.right,b.top+b.height/2]]
      let bi = Infinity, x1, y1, x2, y2
      for (let i = 0; i < 4; i++) for (let j = 4; j < 8; j++) { const d = (pts[i][0]-pts[j][0])*(pts[i][0]-pts[j][0]) + (pts[i][1]-pts[j][1])*(pts[i][1]-pts[j][1]); if (d < bi) { bi = d; x1 = pts[i][0]; y1 = pts[i][1]; x2 = pts[j][0]; y2 = pts[j][1] } }
      const cp = Math.max(30, Math.min(Math.abs(y2-y1)*0.5, Math.abs(x2-x1)*0.5, 100))
      p.setAttribute('d', 'M ' + x1 + ' ' + y1 + ' C ' + x1 + ' ' + (y1+cp) + ', ' + x2 + ' ' + (y2-cp) + ', ' + x2 + ' ' + y2)
    }

    function rmLine(id) { const p = svg && svg.querySelector('path[data-lid="' + id + '"]'); if (p) p.remove(); if (svg && !svg.hasChildNodes()) { svg.remove(); svg = null } }
    function lo(id, o) { const p = svg && svg.querySelector('path[data-lid="' + id + '"]'); if (p) p.setAttribute('opacity', o) }

    function makeDrag(el, onMove) {
      const h = el.querySelector('.ai-ns-header'); if (!h) return; let dr = false, sx, sy, ol, ot
      h.addEventListener('mousedown', function(e) { if (e.target.closest('[data-action]')) return; dr = true; sx = e.clientX; sy = e.clientY; ol = parseInt(el.style.left) || 0; ot = parseInt(el.style.top) || 0; el.style.transition = 'none'; e.preventDefault() })
      document.addEventListener('mousemove', function(e) { if (!dr) return; el.style.left = (ol+e.clientX-sx)+'px'; el.style.top = (ot+e.clientY-sy)+'px'; if (onMove) onMove() })
      document.addEventListener('mouseup', function() { if (dr) { dr = false; el.style.transition = '' } })
    }

    function md(s) {
      let h = s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      h = h.replace(/```(\w*)\n?([\s\S]*?)```/g,'<pre><code>$2</code></pre>'); h = h.replace(/`([^`]+)`/g,'<code>$1</code>')
      h = h.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>'); h = h.replace(/(?<=^|[\s,.;:!?、(（])\*(.+?)\*(?=[\s,.;:!?)、）]|$)/g,'<em>$1</em>')
      return h.replace(/\n/g,'<br>')
    }

    function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML }
    function trunc(s, n) { return s.length <= n ? s : s.slice(0,n) + '...' }

    document.addEventListener('mouseup', async function(e) {
      if (!e.altKey) return; const sel = window.getSelection(); const text = sel.toString().trim()
      if (!text) return; e.preventDefault(); injectStyles()
      const range = sel.getRangeAt(0); const ci = Math.floor(Math.random() * 12)
      const hle = highlight(range, ci); if (!hle) return
      const popup = createPopup(text).el; document.body.appendChild(popup)
      posPopup(popup, hle.getBoundingClientRect())
      requestAnimationFrame(function() { popup.classList.add('ai-ns-popup-visible') })
      const lid = addLine(hle, popup, ci)
      makeDrag(popup, function() { upLine(lid, hle, popup) })

      const body = popup.querySelector('.ai-ns-body'); let content = ''
      const inputRow = popup.querySelector('.ai-ns-input'); const ta = popup.querySelector('.ai-ns-textarea')

      // 构建上下文提示：userInput 留空则默认名词解释
      function buildPrompt(selText, userInput) {
        const t = document.title, u = location.href
        const md = s => document.querySelector(s)?.content?.trim?.() || ''
        const h1 = document.querySelector('h1')?.textContent?.trim?.() || ''
        const full = document.body.innerText || ''
        const idx = full.indexOf(selText)
        const before = idx > 0 ? full.slice(Math.max(0, idx - 300), idx) : ''
        const after = idx >= 0 ? full.slice(idx + selText.length, idx + selText.length + 600) : ''
        const context = `## 页面上下文\n- 标题：${t}\n- H1：${h1}\n- 描述：${md('meta[name="description"]')}\n- 关键词：${md('meta[name="keywords"]')}\n\n## 选中前文\n...${before}\n\n## 选中后文\n${after}...`
        if (!userInput) return `## 选中的内容\n\n${selText}\n\n${context}\n\n请结合上面的页面上下文，解释「${selText}」的含义，重点关注它与后文的关联。`
        return `## 选中的内容\n\n${selText}\n\n${context}\n\n## 用户的要求\n\n${userInput}\n\n请结合上面的选中内容和页面上下文，根据用户的要求给出回答。`
      }

      async function startAsk(userInput) {
        inputRow.style.display = 'none'
        body.innerHTML = '<div style="text-align:center;color:#6b7280;padding:16px 0">🤔 思考中...</div>'
        const msg = [{ role: 'system', content: config.systemPrompt || '' }, { role: 'user', content: buildPrompt(text, userInput) }]
        try { for await (const chunk of api.createLLMStream(msg)) { content += chunk; body.innerHTML = md(content); body.scrollTop = body.scrollHeight } }
        catch (err) { body.innerHTML = '<div class="ai-ns-err">⚠️ ' + esc(err.message) + '</div>' }
      }

      // 确定按钮：留空 = 默认名词解释
      popup.querySelector('.ai-ns-go').onclick = function() { startAsk(ta.value.trim()) }
      ta.addEventListener('keydown', function(ev) {
        if (ev.isComposing) return // 中文输入法选词回车不触发
        if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); ev.stopPropagation(); startAsk(ta.value.trim()) }
        else if (ev.key === 'Escape') { ev.stopPropagation(); treeCleanup() }
      })
      ta.focus()

      function hideAll() { popup.style.display = 'none'; lo(lid, '0') }
      function showDim() { popup.style.display = ''; popup.style.opacity = '0.3'; lo(lid, '0.15') }
      function focus() { popup.style.opacity = '1'; lo(lid, '1') }
      popup.addEventListener('mousedown', function(e) { if(e.target.closest('[data-action]'))return; e.stopPropagation(); focus() })
      document.addEventListener('mousedown', showDim)
      let hidden = false
      document.addEventListener('keydown', dk = function(ev) {
        if (!ev.altKey) return
        if (ev.key === 'h') { hidden ? showDim() : hideAll(); hidden = !hidden; return }
        if (ev.key === 'c') { closeAll(); return }
      })

      // 注册到全局弹窗树
      var pid = window.__popupTree.nextId++
      hle.dataset.popupId = pid
      window.__popupTree.nodes[pid] = { id: pid, parentId: null, children: [], cleanup: null }
      // 检测父弹窗
      for (var k in window.__popupTree.nodes) {
        var n = window.__popupTree.nodes[k]
        if (n.el && n.el !== popup && n.el.contains(e.target)) { window.__popupTree.nodes[pid].parentId = n.id; n.children.push(pid); break }
      }
      window.__popupTree.nodes[pid].el = popup

      function closeAll() {
        // 从根节点开始递归关闭全部
        var allIds = Object.keys(window.__popupTree.nodes)
        allIds.forEach(function(id) {
          var n = window.__popupTree.nodes[id]
          if (n && n.cleanup) n.cleanup()
          delete window.__popupTree.nodes[id]
        })
      }

      function treeCleanup() {
        // 递归关闭所有子节点
        function closeChildren(id) {
          (window.__popupTree.nodes[id]?.children || []).slice().forEach(function(cid) {
            closeChildren(cid)
            if (window.__popupTree.nodes[cid]?.cleanup) window.__popupTree.nodes[cid].cleanup()
            delete window.__popupTree.nodes[cid]
          })
        }
        closeChildren(pid)
        window.__popupTree.nodes[pid].el = null
        if (window.__popupTree.nodes[pid]?.cleanup) window.__popupTree.nodes[pid].cleanup()
        delete window.__popupTree.nodes[pid]
      }

      function cleanup() {
        document.removeEventListener('mousedown', showDim)
        document.removeEventListener('keydown', dk)
        if (hle && hle.parentNode) {
          while (hle.firstChild) hle.parentNode.insertBefore(hle.firstChild, hle)
          hle.parentNode.removeChild(hle)
        }
        rmLine(lid)
        popup.remove()
      }
      window.__popupTree.nodes[pid].cleanup = cleanup

      popup.querySelector('[data-action="close"]').onclick = treeCleanup
      popup.querySelector('[data-action="copy"]').onclick = function() { navigator.clipboard.writeText(content) }
      popup.querySelector('[data-action="save"]').onclick = function() { if (!content.trim()) return; api.saveToKB({ term: text, explanation: content, url: location.href, title: document.title, timestamp: Date.now() }) }
    })
  }
// ===== 用户逻辑结束 =====
})()
