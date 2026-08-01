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

// 从页面提取文本：TreeWalker 轻量遍历文本节点，跳过 script/style/noscript/template，压缩空白
// 比 innerText 更全（含隐藏元素），且不克隆 DOM、不触发布局（大页面高频调用不卡主线程——
// 克隆 documentElement 会持续阻塞主线程，导致 YouTube 等播放器 blob 时序错乱报 ERR_FILE_NOT_FOUND）
function extractPageText() {
  try {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: n => {
        const p = n.parentElement
        if (p && /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(p.tagName)) return NodeFilter.FILTER_REJECT
        return NodeFilter.FILTER_ACCEPT
      }
    })
    let out = ''
    while (walker.nextNode()) out += walker.currentNode.nodeValue + ' '
    return out.replace(/\s+/g, ' ').trim()
  } catch (e) {
    return document.body ? document.body.innerText : ''
  }
}

async function initPlugin(ctx) {
  const { api, config } = ctx
  console.log('[adult-guard] 插件已启动')

  // 只在顶层页面检测（iframe 里的空 body 会产生噪音）
  if (window.top !== window) { console.log('[adult-guard] 在 iframe 中，跳过检测'); return }

  // 关键词列表：从插件配置读取（JSON Schema array 字段），未配置或为空时用默认列表（中/英/日/韩各 100）
  const defaultKeywords = [
    // 中文
    '色情', '成人', '色情片', '色情视频', '色情网站', '色情内容', '色情图片', '色情小说', '色情漫画', '色情动画',
    'a片', 'av女优', '成人影片', '成人视频', '成人网站', '成人内容', '成人直播', '成人动漫', '三级片', '三级视频',
    '黄片', '黄色网站', '黄色小说', '黄色视频', '黄色漫画', '黄漫', '撸管', '手淫', '自慰', '打飞机',
    '口交', '肛交', '性交', '做爱', '爱爱', '啪啪啪', '一夜情', '约炮', '嫖娼', '卖淫',
    '妓女', '出台', '包养', '援交', '裸聊', '裸体', '裸露', '裸照', '裸图', '全裸',
    '半裸', '脱衣', '露点', '走光', '乳房', '奶子', '大奶', '巨乳', '乳交', '美胸',
    '阴道', '阴部', '阴唇', '阴蒂', '阴茎', '阳具', '肉棒', '鸡巴', '龟头', '精液',
    '射精', '内射', '颜射', '口爆', '吞精', '高潮', '潮吹', '发情', '骚货', '荡妇',
    '淫荡', '淫乱', '淫秽', '情色', '性爱', '性欲', '性奴', '调教', '捆绑', '露出',
    '里番', '本子', '无码', '福利', '种子', '磁力', '番号', '车牌', '主播', '直播间',
    // 英文
    'porn', 'xxx', 'adult', 'sex', 'sexy', 'sexual', 'nsfw', 'nude', 'nudes', 'naked',
    'nsfw content', 'pornhub', 'xvideos', 'xhamster', 'xnxx', 'onlyfans', 'fap', 'masturbate', 'masturbation', 'jerk off',
    'cum', 'cumshot', 'creampie', 'blowjob', 'oral sex', 'anal', 'anal sex', 'intercourse', 'fucking', 'fuck',
    'fucked', 'dick', 'dicks', 'cock', 'cocks', 'pussy', 'tits', 'boobs', 'big tits', 'breast',
    'ass', 'booty', 'milf', 'cougar', 'teen', 'loli', 'hentai', 'doujin', 'rule34', 'horny',
    'slut', 'whore', 'bitch', 'pornstar', 'camgirl', 'webcam', 'strip', 'striptease', 'stripchat', 'chaturbate',
    'myfreecams', 'livejasmin', 'bondage', 'bdsm', 'gangbang', 'threesome', 'orgy', 'incest', 'taboo', 'escort',
    'prostitute', 'hooker', 'casual sex', 'one night stand', 'sugar daddy', 'sugar baby', 'findom', 'femdom', 'pegging', 'squirting',
    'deep throat', 'facial', 'bukkake', 'no condom', 'sex chat', 'sex cam', 'sex toy', 'sexting', 'naked women', 'naked girl',
    'adult dating', 'porno', 'erotica', 'adult video', 'adult site', 'sex video', 'porn video', 'nude photo', 'nude pics', 'xxx video',
    // 日文
    'エロ', 'アダルト', 'エロ動画', 'エロサイト', 'アダルト動画', 'アダルトサイト', 'エロ漫画', 'エロアニメ', 'エロ画像', 'エロ小説',
    'セックス', '性行為', '性交', 'オナニー', '自慰', '手コキ', 'フェラ', 'クンニ', 'アナル', 'アナルセックス',
    '中出し', '口内発射', '顔射', 'ぶっかけ', '精子', '射精', '潮吹き', '膣', '陰部', '乳首',
    'おっぱい', '巨乳', '貧乳', '美乳', 'パイズリ', '素人', '熟女', '人妻', '未亡人', '女子校生',
    '女子高生', '美少女', 'ロリ', 'ロリコン', 'ショタ', '童貞', '処女', '男の娘', 'ふたなり', '逆レイプ',
    'レイプ', '凌辱', '調教', '緊縛', '奴隷', '痴女', '淫乱', '淫語', 'ハメ撮り', '個人撮影',
    '露出', '野外', 'スカトロ', '放尿', 'おもらし', 'オナホ', 'バイブ', 'ローター', 'ディルド', '電マ',
    '生ハメ', '生挿入', '乱交', '輪姦', '近親相姦', '母子', '父娘', '兄妹', '姉弟', '寝取られ',
    '浮気', '不倫', '風俗', 'ソープ', 'デリヘル', 'ピンクサロン', '援助交際', '売春', '同人誌', '同人',
    '裏本', '成年コミック', '無修正', '有修正', 'モザイク', 'エログッズ', 'アダルトグッズ', '性欲', '発情', '露出狂',
    // 韩文
    '야동', '야설', '야짤', '성인', '성인물', '성인사이트', '성인영상', '성인영화', '성인만화', '성인방송',
    '포르노', '섹스', '성관계', '성행위', '자위', '딸딸이', '수음', '펠라치오', '오럴', '애널',
    '항문', '질내사정', '사정', '정액', '가슴', '유방', '젖', '거유', '보지', '음부',
    '음경', '자지', '성기', '오나홀', '딜도', '바이브레이터', '콘돔', '나체', '알몸', '벗기',
    '노출', '유두', '음란', '음란물', '변태', '야하다', '야한', '섹시', '성욕', '발정',
    '창녀', '매춘', '성매매', '원조교제', '조건만남', '강간', '성폭행', '근친', '근친상간', '쓰리썸',
    '난교', '스와핑', '구속', '설교', '섹스파트너', '원나잇', '불륜', '간통', '에로', '에로영화',
    '헨타이', '동인지', '리얼돌', '성인용품', '섹스토이', '음부노출', '유방노출', '성기노출', '나신', '야한영화',
    '노모', '유모', '미시', '처녀', '순결', '쾌감', '오르가즘', '절정', '분수', '씨발',
    '좆', '씹', '섹시룩', '마스터베이션', '수간', '간음', '성교육', '성인인증', '청소년유해', '성인잡지'
  ]
  // 关键词 = 内置默认（400 词，硬编码不可改）+ 配置里用户追加的词
  let keywords = defaultKeywords
  if (Array.isArray(config.keywords)) {
    const extra = config.keywords.filter(s => typeof s === 'string' && s.trim())
    if (extra.length) keywords = defaultKeywords.concat(extra)
  }

  let blocked = false  // 已屏蔽则不再重复检测
  let lastSig = -1     // 上次检测时的内容指纹
  let llmRunning = false  // 上一轮 LLM 是否还在返回（不并发调用）
  let llmDirty = false    // LLM 运行期间内容又变化，待补检
  let prevShingles = null // 上一轮提交时的内容指纹（字符 bigram 集合）

  // FNV-1a 哈希（对提取后的文本做指纹，只用于判断内容是否变化）
  function fnvHash(text) {
    let h = 2166136261
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i)
      h = Math.imul(h, 16777619)
    }
    return h >>> 0
  }

  // 字符 bigram 集合（对中英文都有效的轻量文本指纹）
  function textShingles(text) {
    const set = new Set()
    if (text.length < 2) { if (text) set.add(text); return set }
    for (let i = 0; i < text.length - 1; i++) set.add(text.slice(i, i + 2))
    return set
  }

  // Jaccard 相似度（0~1）
  function shingleSimilarity(a, b) {
    let inter = 0
    for (const x of a) if (b.has(x)) inter++
    const union = a.size + b.size - inter
    return union ? inter / union : 1
  }

  // 检测当前页面内容（首次扫描 & 内容变化后都会调用）
  // preExtracted：observer 已提取好的文本（相似度与检测共用同一份，避免重复提取）
  async function runDetection(preExtracted) {
    if (blocked) return
    const text = preExtracted !== undefined ? preExtracted : extractPageText()
    const sig = fnvHash(text)
    if (sig === lastSig) { console.log('[adult-guard] 内容未变化，跳过检测'); return }
    lastSig = sig

    console.log('[adult-guard] 页面文本长度:', text.length)
    console.log('[adult-guard] 页面文本预览:', JSON.stringify(text.slice(0, 1000)))
    if (!text || text.length < 50) { console.log('[adult-guard] 页面文本过短(<50)，跳过检测'); return }

    const lower = text.toLowerCase()
    const hit = keywords.some(k => lower.includes(k))
    const hitKeywords = keywords.filter(k => lower.includes(k))
    console.log('[adult-guard] 关键词:', hit ? '命中 ' + JSON.stringify(hitKeywords) : '未命中')
    if (!hit) return

    console.log('[adult-guard] 调 LLM...')
    // 串行化：上一轮 LLM 未返回时不并发调用，标记待补检，返回后自动重检
    if (llmRunning) { console.log('[adult-guard] 上一轮 LLM 未返回，标记待补检'); llmDirty = true; return }
    llmRunning = true
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
    } finally {
      llmRunning = false
      if (llmDirty && !blocked) { llmDirty = false; console.log('[adult-guard] 补检上一轮期间的内容变化'); runDetection() }
    }
  }

  function blockPage() {
    blocked = true  // 先置位：清空 body 会触发 MutationObserver，被 blocked 挡住不会死循环
    console.log('[adult-guard] 屏蔽!')
    // document.open() 重置整个文档：销毁页面脚本上下文（定时器/事件监听），
    // 页面 JS 彻底停止（否则如 YouTube 会持续请求已失效的 blob URL 报 ERR_FILE_NOT_FOUND）
    try {
      document.open()
      document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>⚠️ 内容已屏蔽</title></head><body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;background:linear-gradient(135deg,#1a1a2e,#16213e,#0f3460)"><div style="text-align:center;padding:48px;max-width:500px;color:#fff"><div style="font-size:64px;margin-bottom:16px">🛡️</div><h1 style="color:#f87171;font-size:24px;margin-bottom:8px">内容已被屏蔽</h1><p style="color:rgba(255,255,255,.6);line-height:1.6">此页面已被 AI 内容过滤器自动屏蔽。</p><div style="margin-top:24px;padding:6px 16px;border-radius:20px;background:rgba(248,113,113,.15);color:#fca5a5;font-size:12px;display:inline-block;border:1px solid rgba(248,113,113,.2)">AI 内容安全卫士 · 实时守护</div></div></body></html>')
      document.close()
    } catch (e) {
      // 兜底：直接清空原内容
      document.body.innerHTML = ''
      document.body.style.cssText = 'margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:linear-gradient(135deg,#1a1a2e,#16213e,#0f3460)'
      document.body.innerHTML = '<div style="text-align:center;padding:48px;max-width:500px;color:#fff"><div style="font-size:64px;margin-bottom:16px">🛡️</div><h1 style="color:#f87171;font-size:24px;margin-bottom:8px">内容已被屏蔽</h1><p style="color:rgba(255,255,255,.6);line-height:1.6">此页面已被 AI 内容过滤器自动屏蔽。</p><div style="margin-top:24px;padding:6px 16px;border-radius:20px;background:rgba(248,113,113,.15);color:#fca5a5;font-size:12px;display:inline-block;border:1px solid rgba(248,113,113,.2)">AI 内容安全卫士 · 实时守护</div></div>'
    }
  }

  // 首次扫描
  await runDetection()
  // 初始化相似度基线（与检测同一份提取文本）
  prevShingles = textShingles(extractPageText())

  // DOM 变化事件：防抖 300ms（合并突变突刺）后，先用轻量哈希预筛（文本没变直接跳过，
  // 动画/样式/媒体加载等纯资源变化不触发提取），再对提取文本算相似度——
  //   · 与上一轮提交的提取文本相似度 > 0.8（微变）→ 忽略
  //   · 相似度 ≤ 0.8（页面切换/大改/实质新增）→ 提交
  // 基线只在提交时更新，缓慢漂移累积到差异够大也会被捕获；提交时把提取文本传给 runDetection（不重复提取）
  let recheckTimer = null
  let lastFastSig = -1
  const observer = new MutationObserver(() => {
    clearTimeout(recheckTimer)
    recheckTimer = setTimeout(() => {
      const t = (document.body ? document.body.textContent : '') || ''
      const fastSig = fnvHash(t)
      if (fastSig === lastFastSig) return  // 文本没变（如播放进度外的动画/资源变化），跳过
      lastFastSig = fastSig
      const text = extractPageText()
      const sh = textShingles(text)
      const sim = prevShingles ? shingleSimilarity(prevShingles, sh) : 0
      if (prevShingles && sim > 0.8) return
      prevShingles = sh
      runDetection(text)
    }, 300)
  })
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true })
}

// ===== 用户逻辑结束 =====
