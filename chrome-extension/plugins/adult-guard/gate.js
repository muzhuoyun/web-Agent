// ═══════════════════════════════════════════
// adult-guard 严格模式门控
// ═══════════════════════════════════════════
// 由 service worker 在「严格模式开启」时动态注册（runAt: document_start），关闭时注销。
//
// 为什么不是「整页幕布」：幕布是一次性、全页面的开关，只能管首屏 ——
// 揭开之后由 XHR 塞进来的内容完全没人检查；而且「谁来揭、什么时候揭」还会和
// 专注模式抢同一块布。改为按块门控：body 的直接子节点默认不可见，逐个放行。
//
// 为什么只管直接子节点：完整覆盖要写成 body *:not([data-ag-ok]):not([data-ag-ok] *)，
// 带后代组合子的否定是最贵的选择器之一，每次 DOM 变动都要对全页元素重算样式，
// 几万节点的页面上是几十毫秒级。只管直接子节点则是很便宜的子组合子，
// 且给容器打标记即可让整棵子树放行（后代不被规则命中）。
// 代价是「塞进已放行容器里的深层动态内容」漏出门控 —— 那部分靠主脚本的
// MutationObserver 兜（本地关键词扫描 1~2ms，可以每次变动都跑）。
//
// 与主脚本共享同一个 isolated world，因此 window.__agGate 可以互相看到。
;(() => {
  const STYLE_ID = 'ai-ag-gate'
  const ATTR = 'data-ag-ok'
  if (document.getElementById(STYLE_ID)) return

  const style = document.createElement('style')
  style.id = STYLE_ID
  // visibility 而非 display:none —— 保留布局盒，IntersectionObserver 与尺寸测量照常工作，
  // 站点的懒加载不会因此失效（代价是会记录到用户其实没看见的曝光）
  style.textContent = 'body > *:not([' + ATTR + ']) { visibility: hidden !important }'
  ;(document.head || document.documentElement).appendChild(style)

  let released = false
  function release(why) {
    if (released) return
    released = true
    clearTimeout(timer)
    const el = document.getElementById(STYLE_ID)
    if (el) el.remove()
    // 放行后把标记摘掉：属性留在页面上会持续和框架的重渲染纠缠
    try {
      document.querySelectorAll('[' + ATTR + ']').forEach(n => n.removeAttribute(ATTR))
    } catch (e) {}
    console.log('[adult-guard][严格] 门控已全部放行：' + why)
  }

  // 兜底：内容绝不能永久不可见。主脚本可能因为插件被禁用、局域网白名单、
  // 扩展重载失联等原因根本不会来放行；而门控坏掉的表现是「某几块内容不见了」，
  // 用户无从诊断，所以超时必须无条件放行并把卡住的节点打出来。
  const TIMEOUT_MS = 5000
  const timer = setTimeout(() => {
    if (released) return
    const stuck = [...document.querySelectorAll('body > *:not([' + ATTR + '])')]
      .map(n => n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + (n.className && typeof n.className === 'string' ? '.' + n.className.trim().split(/\s+/)[0] : ''))
    console.log('[adult-guard][严格] ⚠️ 门控超时自动放行，未收到结论。卡住的顶层节点：' + (stuck.join(', ') || '（无）'))
    release('超时兜底')
  }, TIMEOUT_MS)

  window.__agGate = {
    active() { return !released && !!document.getElementById(STYLE_ID) },
    // 放行单个顶层节点
    approve(el) { try { el.setAttribute(ATTR, '1') } catch (e) {} },
    // 当前仍被挡着的顶层节点
    pending() {
      try { return [...document.querySelectorAll('body > *:not([' + ATTR + '])')] } catch (e) { return [] }
    },
    // 判断某个节点是不是我们打的标记造成的变动，供主脚本过滤自身产生的 mutation，
    // 避免和已有的几个 MutationObserver 互相触发空转
    isOwnAttr(name) { return name === ATTR },
    release
  }
})()
