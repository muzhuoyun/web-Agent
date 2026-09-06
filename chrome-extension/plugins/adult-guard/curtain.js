// ═══════════════════════════════════════════
// adult-guard 严格模式幕布
// ═══════════════════════════════════════════
// 由 service worker 在「严格模式开启」时动态注册（runAt: document_start），
// 关闭时注销。目的是在首次绘制之前就把页面藏起来，等 adult-guard 完成
// 全文检测后再决定放行还是屏蔽 —— 主检测脚本跑在 document_end，
// 那时首屏已经画出来了，只靠它做不到「渲染延后」，最多闪一下。
//
// 与主脚本共享同一个 isolated world，因此 window.__agCurtain 可以互相看到。
;(() => {
  const ID = 'ai-ag-curtain'
  if (document.getElementById(ID)) return

  const style = document.createElement('style')
  style.id = ID
  // visibility 而不是 display:none —— 保留布局与资源加载，放行时不会重排闪动
  style.textContent = 'html{visibility:hidden!important}'
  // document_start 时 head 可能还不存在，挂到 documentElement 上最稳
  ;(document.head || document.documentElement).appendChild(style)

  // 兜底：页面绝不能永久空白。主脚本可能因为插件被禁用、局域网白名单、
  // 扩展重载失联等原因根本不会来揭幕，超时后自行放行。
  const TIMEOUT_MS = 8000
  const timer = setTimeout(() => {
    if (document.getElementById(ID)) {
      document.getElementById(ID).remove()
      console.log('[adult-guard][严格] 幕布超时自动放行（未收到检测结论）')
    }
  }, TIMEOUT_MS)

  window.__agCurtain = {
    // 主脚本调用它揭幕；重复调用无害
    lift(why) {
      clearTimeout(timer)
      const el = document.getElementById(ID)
      if (el) { el.remove(); console.log('[adult-guard][严格] 幕布已揭开：' + why) }
    },
    // 已经被揭开（或从未挂上）时返回 false，供主脚本判断是否处在严格模式
    active() { return !!document.getElementById(ID) }
  }
})()
