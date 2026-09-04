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
      s.textContent = '.ai-ns-popup{all:initial;position:fixed;z-index:2147483640;width:480px;height:600px;max-width:96vw;max-height:92vh;min-width:280px;min-height:220px;resize:both;background:#fff;border:1px solid #e5e7eb;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.12);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:14px;line-height:1.6;color:#1f2937;overflow:hidden;opacity:0;transform:translateY(8px)scale(.97);transition:opacity .2s,transform .2s;pointer-events:none;display:flex;flex-direction:column}.ai-ns-popup-visible{opacity:1;transform:translateY(0)scale(1);pointer-events:auto}.ai-ns-header{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:#f8fafc;border-bottom:1px solid #e5e7eb;flex-shrink:0;cursor:grab;user-select:none}.ai-ns-close{all:unset;cursor:pointer;font-size:20px;line-height:1;color:#9ca3af;padding:0 4px;border-radius:4px}.ai-ns-close:hover{color:#ef4444;background:#fef2f2}.ai-ns-sel{padding:8px 14px;background:#fefce8;border-bottom:1px solid #fef08a;font-size:13px;color:#92400e;flex-shrink:0}.ai-ns-body{padding:14px;overflow-y:auto;flex:1;min-height:0;font-size:14px;line-height:1.7}.ai-ns-body code{font-family:monospace;background:#f3f4f6;padding:1px 5px;border-radius:4px;color:#be185d}.ai-ns-body pre{background:#f3f4f6;border:1px solid #e5e7eb;border-radius:8px;padding:12px;overflow-x:auto;margin:8px 0;font-size:13px}.ai-ns-err{color:#dc2626;font-size:13px;padding:8px;background:#fef2f2;border-radius:6px}.ai-ns-actions{display:flex;gap:6px;padding:8px 14px;border-top:1px solid #e5e7eb;background:#f8fafc;flex-shrink:0}.ai-ns-btn{all:unset;cursor:pointer;font-size:12px;padding:4px 10px;border-radius:6px;background:#fff;border:1px solid #d1d5db;color:#374151}.ai-ns-btn:hover{background:#f3f4f6}.ai-ns-input{display:flex;gap:8px;padding:10px 14px;border-bottom:1px solid #e5e7eb;background:#fff;flex-shrink:0;align-items:flex-end}.ai-ns-textarea{all:unset;flex:1;min-height:40px;max-height:88px;resize:none;font-size:13px;line-height:1.5;color:#1f2937;background:#f9fafb;border:1px solid #d1d5db;border-radius:8px;padding:8px 10px;box-sizing:border-box;font-family:inherit}.ai-ns-textarea:focus{border-color:#3b82f6;background:#fff;outline:none}.ai-ns-go{flex-shrink:0;padding:8px 14px;font-size:13px;border:none;border-radius:6px;background:#3b82f6;color:#fff;cursor:pointer}.ai-ns-go:hover{background:#2563eb}.ai-ns-q{font-size:13px;line-height:1.5;color:#374151;word-break:break-all}.ai-ns-sugs{display:flex;flex-direction:column;gap:6px;padding:8px 14px;border-bottom:1px solid #e5e7eb;background:#f8fafc;flex-shrink:0}.ai-ns-sugs-title{font-size:12px;color:#6b7280}.ai-ns-sugs-list{display:flex;flex-direction:column;gap:6px}.ai-ns-sug{all:unset;cursor:pointer;text-align:left;font-size:13px;line-height:1.5;padding:6px 10px;border-radius:8px;background:#fff;border:1px solid #d1d5db;color:#374151}.ai-ns-sug:hover{border-color:#3b82f6;background:#eff6ff;color:#1d4ed8}.ai-ns-body h1,.ai-ns-body h2,.ai-ns-body h3,.ai-ns-body h4{margin:12px 0 6px;font-weight:600;line-height:1.4;color:#111827}.ai-ns-body h1{font-size:17px}.ai-ns-body h2{font-size:16px}.ai-ns-body h3{font-size:15px}.ai-ns-body h4{font-size:13.5px;color:#4b5563}.ai-ns-body p{margin:0 0 8px}.ai-ns-body p:last-child{margin-bottom:0}.ai-ns-body ul,.ai-ns-body ol{margin:6px 0 8px;padding-left:22px}.ai-ns-body li{margin:3px 0}.ai-ns-body blockquote{margin:8px 0;padding:6px 12px;border-left:3px solid #d1d5db;background:#f9fafb;color:#4b5563}.ai-ns-body hr{border:none;border-top:1px solid #e5e7eb;margin:12px 0}.ai-ns-body a{color:#2563eb;text-decoration:underline}.ai-ns-tb{border-collapse:collapse;margin:8px 0;font-size:13px;width:100%;display:table}.ai-ns-tb th,.ai-ns-tb td{border:1px solid #e5e7eb;padding:5px 8px;text-align:left;vertical-align:top}.ai-ns-tb th{background:#f8fafc;font-weight:600}.ai-ns-body .ai-ns-task{opacity:.85;margin-right:2px}.ai-ns-tbwrap{overflow-x:auto;margin:8px 0}.ai-ns-max{font-size:14px}@media(prefers-color-scheme:dark){.ai-ns-popup{background:#1f2937;border-color:#374151;color:#e5e7eb}.ai-ns-header{background:#111827;border-color:#374151}.ai-ns-close{color:#6b7280}.ai-ns-close:hover{color:#f87171;background:#3b1a1a}.ai-ns-sel{background:#422006;border-color:#78350f;color:#fdba74}.ai-ns-body code{background:#374151;color:#f9a8d4}.ai-ns-body pre{background:#111827;border-color:#374151}.ai-ns-err{background:#450a0a;color:#fca5a5}.ai-ns-actions{background:#111827;border-color:#374151}.ai-ns-btn{background:#374151;border-color:#4b5563;color:#e5e7eb}.ai-ns-btn:hover{background:#4b5563}.ai-ns-input{background:#1f2937;border-color:#374151}.ai-ns-textarea{background:#111827;border-color:#4b5563;color:#e5e7eb}.ai-ns-textarea:focus{border-color:#3b82f6;background:#111827}.ai-ns-go{background:#3b82f6}.ai-ns-go:hover{background:#2563eb}.ai-ns-q{color:#d1d5db}.ai-ns-sugs{background:#111827;border-color:#374151}.ai-ns-sugs-title{color:#9ca3af}.ai-ns-sug{background:#1f2937;border-color:#4b5563;color:#e5e7eb}.ai-ns-sug:hover{border-color:#3b82f6;background:#1e3a8a;color:#bfdbfe}.ai-ns-body h1,.ai-ns-body h2,.ai-ns-body h3{color:#f3f4f6}.ai-ns-body h4{color:#9ca3af}.ai-ns-body blockquote{border-left-color:#4b5563;background:#111827;color:#9ca3af}.ai-ns-body hr{border-top-color:#374151}.ai-ns-body a{color:#93c5fd}.ai-ns-tb th,.ai-ns-tb td{border-color:#374151}.ai-ns-tb th{background:#111827}}'
      document.head.appendChild(s)
    }

    // 高亮选区，返回 span 数组（跨元素时一个文本节点一个 span）
    // 关键：跨元素选区绝不用 extractContents —— 它会把 <td>/<tr> 整块搬出表格，
    // 生成 <span><td>…</td></span> 这种非法结构，表格布局当场塌掉且无法还原。
    // 改为把选区按文本节点拆成子选区逐个包裹，每个 span 都留在原父元素内，DOM 结构不动。
    function highlight(range, ci) {
      const css = 'background:' + HC[ci] + ';border-radius:2px;outline:1px solid ' + BC[ci] + ';outline-offset:-1px'
      // 选区在单个文本节点内：直接包裹（最常见情况，走快路径）
      if (range.startContainer === range.endContainer && range.startContainer.nodeType === 3) {
        const s = document.createElement('span'); s.style.cssText = css
        try { range.surroundContents(s); return [s] } catch (e) { return [] }
      }
      // 跨元素：先收集所有相交的文本节点及其局部偏移
      const targets = []
      const root = range.commonAncestorContainer
      const walker = document.createTreeWalker(root.nodeType === 3 ? root.parentNode : root, NodeFilter.SHOW_TEXT, {
        acceptNode(n) {
          if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT
          const p = n.parentElement
          if (p && /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(p.tagName)) return NodeFilter.FILTER_REJECT
          return range.intersectsNode(n) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
        }
      })
      while (walker.nextNode()) {
        const n = walker.currentNode
        const so = n === range.startContainer ? range.startOffset : 0
        const eo = n === range.endContainer ? range.endOffset : n.nodeValue.length
        if (eo > so) targets.push({ n: n, so: so, eo: eo })
      }
      // 收集完才改 DOM：surroundContents 会切分文本节点，边遍历边改会让 walker 失效
      const spans = []
      targets.forEach(function(t) {
        try {
          const r = document.createRange(); r.setStart(t.n, t.so); r.setEnd(t.n, t.eo)
          const s = document.createElement('span'); s.style.cssText = css
          r.surroundContents(s); spans.push(s)
        } catch (e) {}
      })
      return spans
    }

    // 多个高亮 span 的合并外接矩形（视口坐标），用于定位弹窗和连接线锚点
    function unionRect(els) {
      let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity
      els.forEach(function(el) {
        if (!el || !el.isConnected) return
        const q = el.getBoundingClientRect()
        if (!q.width && !q.height) return
        if (q.left < l) l = q.left
        if (q.top < t) t = q.top
        if (q.right > r) r = q.right
        if (q.bottom > b) b = q.bottom
      })
      if (l === Infinity) return null
      return { left: l, top: t, right: r, bottom: b, width: r - l, height: b - t }
    }

    // segments: 字符串数组（Alt 多段选取）
    // ci 由调用方传入：原来这里自己随机取，导致弹窗边框色和高亮底色对不上，现在统一
    function createPopup(segments, ci) {
      const el = document.createElement('div'); el.className = 'ai-ns-popup'; el.style.borderColor = BC[ci]
      const headerBg = BC[ci] + '22' // 半透明底色
      const selHtml = segments.length > 1
        ? '<span style="font-weight:500;color:#a16207">已选 ' + segments.length + ' 段：</span>' + segments.map(function(s, i) {
            return '<div style="margin-top:4px"><span style="opacity:.55">' + (i + 1) + '.</span> <span style="font-style:italic">' + esc(trunc(s, 60)) + '</span></div>'
          }).join('')
        : '<span style="font-weight:500;color:#a16207">选中：</span><span style="font-style:italic">' + esc(trunc(segments[0] || '', 80)) + '</span>'
      el.innerHTML = '<div class="ai-ns-header" style="background:' + headerBg + ';border-bottom-color:' + BC[ci] + '"><span>🤖 名词解释</span><span style="display:flex;align-items:center;gap:2px"><button class="ai-ns-close ai-ns-max" data-action="max" title="最大化 / 还原">⤢</button><button class="ai-ns-close" data-action="close" title="关闭">&times;</button></span></div><div class="ai-ns-sel">' + selHtml + '</div><div class="ai-ns-sugs"><div class="ai-ns-sugs-title">💡 猜你想问（点击提问，或自定义）</div><div class="ai-ns-sugs-list"><div style="text-align:center;color:#9ca3af;font-size:12px;padding:6px 0">⏳ AI 生成建议中...</div></div></div><div class="ai-ns-input"><textarea class="ai-ns-textarea" rows="2" placeholder="或输入你的问题（留空提交则默认：结合上下文解释名词）"></textarea><button class="ai-ns-btn ai-ns-go" title="提交（Enter）">➤ 确定</button></div><div class="ai-ns-body"><div style="text-align:center;color:#6b7280;padding:16px 0">💬 点击上方候选问题，或输入提示词后点「确定」</div></div><div class="ai-ns-actions"><button class="ai-ns-btn" data-action="copy">📋 复制</button><button class="ai-ns-btn" data-action="save">💾 存知识库</button></div>'
      return { el, ci }
    }

    // 根据锚点矩形算出弹窗应在的位置（不直接写样式，供首次定位和滚动跟随复用）
    // 必须读实际尺寸而不是写死 380 —— 弹窗可 resize、可最大化，写死会让跟随定位算歪
    function autoPos(el, r) {
      const g = 12, vw = innerWidth, vh = innerHeight
      const w = el.offsetWidth || 480
      const h = el.offsetHeight || 600
      let l = r.left + r.width / 2 - w / 2, t = r.bottom + g
      if (l < 8) l = 8; if (l + w > vw - 8) l = vw - w - 8
      if (t + h > vh - 8) { t = r.top - h - g; if (t < 8) t = 8 }
      return { l: l, t: t }
    }

    function addLine(hles, popup, ci) {
      if (!svg) { svg = document.createElementNS('http://www.w3.org/2000/svg','svg'); svg.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:2147483645'; document.body.appendChild(svg) }
      const id = 'l' + Date.now() + Math.random().toString(36).slice(2,6); const p = document.createElementNS('http://www.w3.org/2000/svg','path')
      p.dataset.lid = id; p.setAttribute('stroke', BC[ci]); p.setAttribute('stroke-width','2.5'); p.setAttribute('fill','none'); p.setAttribute('opacity','0.6')
      svg.appendChild(p); upLine(id, hles, popup); return id
    }

    // fr 是高亮 span 数组（跨表格时有多个），取其合并外接矩形作为起点锚
    function upLine(id, hles, to) {
      const p = svg && svg.querySelector('path[data-lid="' + id + '"]'); if (!p) return
      const a = unionRect(hles)
      if (!a || !to || !to.isConnected) { p.style.display = 'none'; return }
      const b = to.getBoundingClientRect()
      if (!a.width || !b.width) { p.style.display = 'none'; return }
      p.style.display = ''
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

    // 极简 markdown 渲染：块级（代码块/标题/表格/列表/引用/分隔线/段落）+ 行内（码/粗/斜/链接）
    // 注意：流式输出会用「未闭合的半截 markdown」反复调用，所以每条规则都要容忍不完整结构
    // ── markdown 渲染 ──
    // 手写的极简渲染器，只覆盖 LLM 实际会输出的语法。三条硬约束：
    //   1. 流式友好：会被「半截 markdown」反复调用，规则不能因结构不完整而抛错或吞内容
    //   2. 先转义后拼标签：内容来自 LLM，统一先转义；链接只放行 http(s) 且加 noopener
    //   3. 中文友好：兼容「1.甲」无空格、全角「１．」、顿号「1、」这些国内模型常见写法
    function md(input) {
      const ESC = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      const HALF = t => String(t).replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFF10 + 48))

      const HEADING = /^ {0,3}(#{1,4})\s+(.*)$/
      const HR = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/
      const QUOTE = /^ {0,3}&gt;\s?(.*)$/ // 此时已转义，故匹配 &gt; 而非 >
      // 有序标记：限 1~2 位数字，避免把「2024.某事」这类年份行误判成列表
      const OL = /^[ \t]*([0-9０-９]{1,2})[ \t]*[.)．、）][ \t]*(?=\S)/
      // 无序标记：一律要求后随空格，否则行首的 *斜体* 会被当成列表项
      const UL = /^[ \t]*[-*+•][ \t]+(?=\S)/
      const TASK = /^\[([ xX])\][ \t]+/
      const TABLE_SEP = /^[ \t]*\|?[ \t]*:?-{2,}:?[ \t]*(\|[ \t]*:?-{2,}:?[ \t]*)*\|?[ \t]*$/
      const PLACEHOLDER = /^\u0000(\d+)\u0000$/

      // ① 先把围栏代码块抽成占位符，避免块内文字被行级规则改写；缺尾部 ``` 也照收（流式）
      const codeBlocks = []
      let text = String(input).replace(/```[^\n]*\n?([\s\S]*?)(?:```|$)/g, function(_, code) {
        codeBlocks.push('<pre><code>' + ESC(code.replace(/\n$/, '')) + '</code></pre>')
        return '\u0000' + (codeBlocks.length - 1) + '\u0000'
      })
      text = ESC(text)

      // ② 行内语法（粗体先于斜体，否则 **x** 会被斜体规则拆坏）
      function inline(t) {
        return t
          .replace(/`([^`]+)`/g, '<code>$1</code>')
          .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
          .replace(/(?<![*\w])\*([^*\n]+)\*(?![*\w])/g, '<em>$1</em>')
          .replace(/~~([^~]+)~~/g, '<del>$1</del>')
          .replace(/\[([^\][]*)\]\((https?:\/\/[^\s)]+)\)/g,
                   '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
      }

      const lines = text.split('\n')
      const html = []
      let i = 0

      const indentOf = l => (l.match(/^[ \t]*/) || [''])[0].replace(/\t/g, '    ').length
      const isList = l => OL.test(l) || UL.test(l)
      const isTableHead = (l, next) => l.indexOf('|') !== -1 && next !== undefined && TABLE_SEP.test(next)
      const startsBlock = (l, next) =>
        PLACEHOLDER.test(l) || HEADING.test(l) || HR.test(l) || QUOTE.test(l) || isList(l) || isTableHead(l, next)
      const splitRow = l => l.replace(/^[ \t]*\|/, '').replace(/\|[ \t]*$/, '').split('|').map(c => c.trim())

      // 表格：表头行 + |---|--- 分隔行 + 数据行；分隔行里的 :--: 决定各列对齐
      function takeTable(start) {
        const head = splitRow(lines[start])
        const aligns = splitRow(lines[start + 1]).map(function(c) {
          const l = c.charAt(0) === ':', r = c.charAt(c.length - 1) === ':'
          return l && r ? 'center' : r ? 'right' : l ? 'left' : ''
        })
        const cs = n => aligns[n] ? ' style="text-align:' + aligns[n] + '"' : ''
        let out = '<table class="ai-ns-tb"><thead><tr>'
        head.forEach(function(c, n) { out += '<th' + cs(n) + '>' + inline(c) + '</th>' })
        out += '</tr></thead><tbody>'
        let k = start + 2
        while (k < lines.length && lines[k].trim() && lines[k].indexOf('|') !== -1 && !TABLE_SEP.test(lines[k])) {
          out += '<tr>'
          splitRow(lines[k]).forEach(function(c, n) { out += '<td' + cs(n) + '>' + inline(c) + '</td>' })
          out += '</tr>'
          k++
        }
        return { html: out + '</tbody></table>', next: k }
      }

      // 列表：处理三件事
      //   · 条目间的空行 —— 不合并的话每项各成一个 <ol>，编号会全部从 1 重来
      //   · 缩进嵌套 —— 更深缩进的条目挂进上一个 <li>
      //   · 起始编号 —— 从 3. 开始就输出 start="3"，不强行从 1 数
      function takeList(start) {
        const first = lines[start]
        const base = indentOf(first)
        const ordered = OL.test(first)
        const marker = ordered ? OL : UL
        const startNum = ordered ? (parseInt(HALF(first.match(OL)[1]), 10) || 1) : 1
        const items = [] // 先不闭合 </li>，便于把子列表追加进去
        let k = start
        while (k < lines.length) {
          const line = lines[k]
          if (line.trim() && isList(line)) {
            const ind = indentOf(line)
            if (ind > base && items.length) { // 更深缩进 → 作为上一条目的子列表
              const sub = takeList(k)
              items[items.length - 1] += sub.html
              k = sub.next
              continue
            }
            if (ind < base || !marker.test(line)) break // 退回外层，或同层换了列表类型
            let body = line.replace(marker, '')
            const task = body.match(TASK)
            if (task) { // - [ ] / - [x] 任务列表
              body = '<span class="ai-ns-task">' + (/[xX]/.test(task[1]) ? '☑' : '☐') + '</span> ' + body.replace(TASK, '')
            }
            items.push('<li>' + inline(body))
            k++
            continue
          }
          if (!line.trim()) { // 空行：后面若还是本层同类条目就跨过去，继续同一个列表
            let j = k
            while (j < lines.length && !lines[j].trim()) j++
            if (j < lines.length && marker.test(lines[j]) && indentOf(lines[j]) === base) { k = j; continue }
          }
          break
        }
        const tag = ordered ? 'ol' : 'ul'
        const attr = ordered && startNum > 1 ? ' start="' + startNum + '"' : ''
        return { html: '<' + tag + attr + '>' + items.map(x => x + '</li>').join('') + '</' + tag + '>', next: k }
      }

      // ③ 逐块扫描（顺序有讲究：表格要在 HR 之前判，否则 |---|--- 会被当成分隔线）
      while (i < lines.length) {
        const line = lines[i]
        if (!line.trim()) { i++; continue }

        if (PLACEHOLDER.test(line)) { html.push(line); i++; continue } // 代码块占位，不包 <p>

        if (isTableHead(line, lines[i + 1])) { const r = takeTable(i); html.push(r.html); i = r.next; continue }

        const h = line.match(HEADING)
        if (h) { html.push('<h' + h[1].length + '>' + inline(h[2]) + '</h' + h[1].length + '>'); i++; continue }

        if (HR.test(line)) { html.push('<hr>'); i++; continue }

        if (QUOTE.test(line)) {
          const buf = []
          while (i < lines.length && QUOTE.test(lines[i])) { buf.push(inline(lines[i].match(QUOTE)[1])); i++ }
          html.push('<blockquote>' + buf.join('<br>') + '</blockquote>')
          continue
        }

        if (isList(line)) { const r = takeList(i); html.push(r.html); i = r.next; continue }

        // 普通段落：吃到空行或下一个块级起始为止，段内换行用 <br>
        const buf = []
        while (i < lines.length && lines[i].trim() && !startsBlock(lines[i], lines[i + 1])) { buf.push(inline(lines[i])); i++ }
        if (!buf.length) { buf.push(inline(line)); i++ } // 兜底，防止一行都没吃到而空转
        html.push('<p>' + buf.join('<br>') + '</p>')
      }

      // ④ 还原代码块
      return html.join('').replace(/\u0000(\d+)\u0000/g, function(_, n) { return codeBlocks[+n] })
    }

    function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML }
    function trunc(s, n) { return s.length <= n ? s : s.slice(0,n) + '...' }

    // ── Alt 多段选取 ──
    // 按住 Alt 期间每次选中只累积成一段（不弹窗），松开 Alt 才带着全部段落开一个弹窗。
    // 跨表格的需求由「分多次在单元格内选」满足，不需要让单个选区跨元素破坏结构。
    let acc = null // { segments: [], spans: [], ci, target, t }
    let altDown = false
    const ACC_STALE_MS = 30000 // 上一轮累积超过这么久没结束，视为 keyup 丢失，重新起一轮

    // Windows 上按 Alt 会让 Chrome 把焦点移到菜单栏并触发 window blur，
    // 那会被误判成「累积结束」导致第一段选完就弹窗。preventDefault 掉可避免。
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Alt') { altDown = true; e.preventDefault() }
    })

    // 累积期的浮动提示：让用户知道已选几段、怎么结束
    function accIndicator(n) {
      let el = document.getElementById('ai-ns-acc')
      if (!n) { if (el) el.remove(); return }
      if (!el) {
        el = document.createElement('div'); el.id = 'ai-ns-acc'
        el.style.cssText = 'all:initial;position:fixed;z-index:2147483646;left:50%;bottom:24px;transform:translateX(-50%);background:#1f2937;color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:13px;padding:7px 14px;border-radius:999px;box-shadow:0 4px 16px rgba(0,0,0,.25);pointer-events:none'
        document.body.appendChild(el)
      }
      el.textContent = '已选 ' + n + ' 段 · 松开 Alt 提问'
    }

    document.addEventListener('mouseup', function(e) {
      if (!e.altKey) return
      const sel = window.getSelection(); const text = sel.toString().trim()
      if (!text) return
      e.preventDefault(); injectStyles()
      let range
      try { range = sel.getRangeAt(0) } catch (_) { return }
      // 上一轮累积过期（Alt keyup 丢失导致悬空）→ 丢弃它的引用，另起一轮，避免莫名并进来
      if (acc && Date.now() - acc.t > ACC_STALE_MS) acc = null
      // 同一轮累积共用一个配色，视觉上表明这几段属于同一次提问
      if (!acc) acc = { segments: [], spans: [], ci: Math.floor(Math.random() * 12), target: e.target, t: 0 }
      const spans = highlight(range, acc.ci)
      if (!spans.length) return
      sel.removeAllRanges() // 清掉原生蓝色选区，避免和自绘高亮叠在一起
      acc.segments.push(text)
      acc.spans = acc.spans.concat(spans)
      acc.t = Date.now()
      accIndicator(acc.segments.length)
    })

    // 结束累积并提问
    function flushAcc() {
      if (!acc) return
      const a = acc; acc = null; accIndicator(0)
      if (a.segments.length) openPopup(a.segments, a.spans, a.ci, a.target)
    }
    document.addEventListener('keyup', function(e) {
      if (e.key !== 'Alt') return
      altDown = false
      flushAcc()
    })
    // Alt+Tab 切走时 keyup 可能收不到，靠 blur 兜底；
    // 但仅在 Alt 已松开时才认，否则会和上面那个「按 Alt 抢焦点」的 blur 混淆而提前弹窗
    addEventListener('blur', function() { if (!altDown) flushAcc() })

    function openPopup(segments, hles, ci, evTarget) {
      const text = segments.join(' / ') // 复制、存知识库等单值场景用的合并展示
      const popup = createPopup(segments, ci).el; document.body.appendChild(popup)

      // ── 弹窗跟随被解释词 ──
      // 弹窗是 position:fixed，若不监听滚动就会钉在屏幕上、和词脱开。
      // dragDX/DY 记录用户拖拽后相对自动位置的偏移，滚动时按同一偏移重算，
      // 从而保持「弹窗与词的相对位置固定」（含用户手动摆放的位置）。
      let dragDX = 0, dragDY = 0, followRaf = 0
      function follow() {
        const rect = unionRect(hles)
        if (!rect) { popup.style.visibility = 'hidden'; lo(lid, '0'); return }
        // 词整个滚出视口 → 隐藏弹窗，不让它孤零零留在屏幕上
        if (rect.bottom < 0 || rect.top > innerHeight || rect.right < 0 || rect.left > innerWidth) {
          popup.style.visibility = 'hidden'; lo(lid, '0'); return
        }
        popup.style.visibility = ''
        const p = autoPos(popup, rect)
        popup.style.left = (p.l + dragDX) + 'px'
        popup.style.top = (p.t + dragDY) + 'px'
        upLine(lid, hles, popup)
      }
      function onViewChange() {
        if (followRaf) return // rAF 节流，滚动时不做重复布局计算
        followRaf = requestAnimationFrame(function() { followRaf = 0; follow() })
      }

      const initRect = unionRect(hles) || { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }
      const ip = autoPos(popup, initRect)
      popup.style.left = ip.l + 'px'; popup.style.top = ip.t + 'px'
      requestAnimationFrame(function() { popup.classList.add('ai-ns-popup-visible') })
      const lid = addLine(hles, popup, ci)
      // capture 阶段监听：页面内层滚动容器（表格容器、侧栏等）的滚动也能捕获到
      addEventListener('scroll', onViewChange, true)
      addEventListener('resize', onViewChange)
      makeDrag(popup, function() {
        const rect = unionRect(hles)
        if (rect) {
          const p = autoPos(popup, rect)
          dragDX = (parseInt(popup.style.left) || 0) - p.l
          dragDY = (parseInt(popup.style.top) || 0) - p.t
        }
        upLine(lid, hles, popup)
      })

      // 最大化 / 还原：表格和长回答在小窗里很挤，给个一键铺满
      // 弹窗本身也支持右下角拖拽 resize（CSS resize:both），这里只是省掉手动拖的动作
      let maximized = false, prevSize = null
      const maxBtn = popup.querySelector('[data-action="max"]')
      maxBtn.onclick = function() {
        if (!maximized) {
          prevSize = { w: popup.style.width, h: popup.style.height }
          popup.style.width = Math.round(innerWidth * 0.94) + 'px'
          popup.style.height = Math.round(innerHeight * 0.9) + 'px'
          maxBtn.textContent = '⤡'
        } else {
          popup.style.width = prevSize && prevSize.w ? prevSize.w : ''
          popup.style.height = prevSize && prevSize.h ? prevSize.h : ''
          maxBtn.textContent = '⤢'
        }
        maximized = !maximized
        dragDX = 0; dragDY = 0 // 尺寸变了，之前记录的拖拽偏移不再有意义，回到自动定位
        follow()
      }

      const body = popup.querySelector('.ai-ns-body'); let content = ''
      const inputRow = popup.querySelector('.ai-ns-input'); const ta = popup.querySelector('.ai-ns-textarea')
      const sugsRow = popup.querySelector('.ai-ns-sugs'); const sugsList = popup.querySelector('.ai-ns-sugs-list')

      // 页面元信息（注意不要用变量名 md，会遮蔽外层的 markdown 渲染函数）
      function pageMeta() {
        const m = s => document.querySelector(s)?.content?.trim?.() || ''
        const h1 = document.querySelector('h1')?.textContent?.trim?.() || ''
        return `- 标题：${document.title}\n- H1：${h1}\n- 描述：${m('meta[name="description"]')}\n- 关键词：${m('meta[name="keywords"]')}`
      }
      // 取某段文字在页面中的前后文
      function ctxOf(selText, beforeN, afterN) {
        const full = document.body.innerText || ''
        const idx = full.indexOf(selText)
        const before = idx > 0 ? full.slice(Math.max(0, idx - beforeN), idx) : ''
        const after = idx >= 0 ? full.slice(idx + selText.length, idx + selText.length + afterN) : ''
        return { before: before, after: after }
      }

      // 构建上下文提示：userInput 留空则默认名词解释
      // 多段时逐段给各自的上下文（窗口收窄防止 prompt 膨胀），单段时保留原来更宽的窗口
      function buildPrompt(segs, userInput) {
        let head, context
        if (segs.length > 1) {
          head = `## 选中的 ${segs.length} 段内容\n\n` + segs.map(function(s, i) { return `${i + 1}. ${s}` }).join('\n')
          context = '## 页面上下文\n' + pageMeta() + '\n\n## 各段所在位置的上下文\n' + segs.map(function(s, i) {
            const c = ctxOf(s, 150, 200)
            return `### 第 ${i + 1} 段：${s}\n前文：...${c.before}\n后文：${c.after}...`
          }).join('\n\n')
        } else {
          head = `## 选中的内容\n\n${segs[0] || ''}`
          const c = ctxOf(segs[0] || '', 300, 600)
          context = '## 页面上下文\n' + pageMeta() + `\n\n## 选中前文\n...${c.before}\n\n## 选中后文\n${c.after}...`
        }
        if (!userInput) {
          return segs.length > 1
            ? `${head}\n\n${context}\n\n请结合上面的页面上下文，说明这几段内容分别是什么，以及它们之间的关系。`
            : `${head}\n\n${context}\n\n请结合上面的页面上下文，解释「${segs[0] || ''}」的含义，重点关注它与后文的关联。`
        }
        return `${head}\n\n${context}\n\n## 用户的要求\n\n${userInput}\n\n请结合上面的选中内容和页面上下文，根据用户的要求给出回答。`
      }

      // 猜你想问：LLM 根据页面上下文 + 选中词，揣测用户最可能问的 3 个问题
      const FALLBACK_SUGS = ['结合上下文解释这个名词', '总结这段内容', '翻译成英文']
      const FALLBACK_SUGS_MULTI = ['解释这几段并说明关系', '对比这几段的差异', '汇总成表格']
      function buildSuggestPrompt(segs) {
        const h1 = document.querySelector('h1')?.textContent?.trim?.() || ''
        const base = `页面标题：${document.title}\nH1：${h1}\n\n`
        if (segs.length > 1) {
          const body = segs.map(function(s, i) {
            const c = ctxOf(s, 100, 150)
            return `第 ${i + 1} 段：「${s}」\n  前文：...${c.before}\n  后文：${c.after}...`
          }).join('\n')
          return `用户在网页上先后选中了 ${segs.length} 段文字：\n${body}\n\n${base}请揣测用户最可能想问的 3 个问题（要体现这几段之间的关联，如对比、汇总、关系、解释等）。\n\n只输出 JSON 数组，3 个字符串，每个不超过 25 字，不要输出其他内容。`
        }
        const c = ctxOf(segs[0] || '', 200, 300)
        return `用户选中了网页上的文字：「${segs[0] || ''}」。\n\n${base}选中前文：...${c.before}\n选中后文：${c.after}...\n\n请揣测用户最可能想问的 3 个问题（覆盖多种意图，如解释、总结、翻译、联系上下文、扩展等，不要只给解释类）。\n\n只输出 JSON 数组，3 个字符串，每个不超过 25 字，不要输出其他内容。`
      }
      function parseSuggestions(raw) {
        const s = raw.indexOf('['); const e = raw.lastIndexOf(']')
        if (s !== -1 && e > s) {
          try {
            const arr = JSON.parse(raw.slice(s, e + 1))
            if (Array.isArray(arr)) return arr.filter(x => typeof x === 'string' && x.trim()).map(x => x.trim().slice(0, 25))
          } catch (err) {}
        }
        // 兜底：按行/逗号拆分，去掉序号圆点
        return raw.split(/[\n,]+/).map(x => x.replace(/^\s*(?:[-*\d.\s、)）]+)\s*/, '').trim()).filter(x => x.length >= 2 && x.length <= 25)
      }
      function renderSuggestions(opts) {
        sugsList.innerHTML = ''
        const list = (opts && opts.length ? opts : (segments.length > 1 ? FALLBACK_SUGS_MULTI : FALLBACK_SUGS)).slice(0, 3)
        list.forEach(o => {
          const b = document.createElement('button')
          b.className = 'ai-ns-sug'; b.textContent = o
          b.onclick = function() { startAsk(o) }
          sugsList.appendChild(b)
        })
      }
      async function generateSuggestions() {
        try {
          const msg = [{ role: 'system', content: config.systemPrompt || '' }, { role: 'user', content: buildSuggestPrompt(segments) }]
          let raw = ''
          for await (const chunk of api.createLLMStream(msg)) { raw += chunk }
          renderSuggestions(parseSuggestions(raw))
        } catch (err) {
          renderSuggestions(segments.length > 1 ? FALLBACK_SUGS_MULTI : FALLBACK_SUGS) // 建议生成失败时给默认 3 项兜底
        }
      }

      async function startAsk(userInput) {
        // 收起建议区与输入框，展示用户提出的问题（留空则默认名词解释，脚本层兜底不报错）
        sugsRow.style.display = 'none'
        const q = userInput || '（默认）结合上下文解释名词'
        inputRow.innerHTML = '<span class="ai-ns-q">💬 提问：' + esc(trunc(q, 60)) + '</span>'
        body.innerHTML = '<div style="text-align:center;color:#6b7280;padding:16px 0">🤔 思考中...</div>'
        const msg = [{ role: 'system', content: config.systemPrompt || '' }, { role: 'user', content: buildPrompt(segments, userInput) }]
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
      generateSuggestions() // 弹窗打开即后台生成候选问题，不阻塞用户输入

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
      hles[0].dataset.popupId = pid
      window.__popupTree.nodes[pid] = { id: pid, parentId: null, children: [], cleanup: null }
      // 检测父弹窗
      for (var k in window.__popupTree.nodes) {
        var n = window.__popupTree.nodes[k]
        if (n.el && n.el !== popup && n.el.contains(evTarget)) { window.__popupTree.nodes[pid].parentId = n.id; n.children.push(pid); break }
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
        removeEventListener('scroll', onViewChange, true)
        removeEventListener('resize', onViewChange)
        if (followRaf) { cancelAnimationFrame(followRaf); followRaf = 0 }
        // 逐个还原高亮 span：子节点移回原位后删掉 span，再 normalize 合并
        // 被 surroundContents 切分开的文本节点，让 DOM 回到选中前的形状
        hles.forEach(function(s) {
          const parent = s.parentNode
          if (!parent) return
          while (s.firstChild) parent.insertBefore(s.firstChild, s)
          parent.removeChild(s)
          parent.normalize()
        })
        rmLine(lid)
        popup.remove()
      }
      window.__popupTree.nodes[pid].cleanup = cleanup

      popup.querySelector('[data-action="close"]').onclick = treeCleanup
      popup.querySelector('[data-action="copy"]').onclick = function() { navigator.clipboard.writeText(content) }
      popup.querySelector('[data-action="save"]').onclick = function() { if (!content.trim()) return; api.saveToKB({ term: text, explanation: content, url: location.href, title: document.title, timestamp: Date.now() }) }
    }
  }
// ===== 用户逻辑结束 =====
})()
