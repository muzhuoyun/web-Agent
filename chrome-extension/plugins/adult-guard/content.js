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

// 检测人机验证页（Cloudflare Managed Challenge / Turnstile 等）：验证页的文本不是真实页面内容，
// 专注模式若拿它判定会得到不可信结果并污染缓存，检测到后必须等待验证通过（或页面重载）再判定
function isChallengePage() {
  try {
    const title = (document.title || '').toLowerCase()
    const text = (document.body ? document.body.textContent : '').slice(0, 3000).toLowerCase()
    if (/just a moment|attention required|checking your browser|verify you are human|正在检查|验证您的浏览器|人机验证/.test(title)) return true
    if (/checking your browser|verify you are human|just a moment/i.test(text)) return true
    return !!document.querySelector('#challenge-running, #cf-challenge-running, iframe[src*="challenges.cloudflare.com"]')
  } catch (e) {
    return false
  }
}

// 判断是否局域网/内网页面：localhost、回环地址、私有网段（10/8、172.16/12、192.168/16）、
// 链路本地（169.254/16、IPv6 fe80::）以及保留的本地域名后缀（.local 为 mDNS、.lan 为常见路由器域名、.internal 为 RFC 8375 保留内网域名）
function isLanHost() {
  try {
    const host = (location.hostname || '').toLowerCase().replace(/^\[|\]$/g, '') // 去掉 IPv6 地址的方括号
    if (!host) return false
    if (host === 'localhost' || host.endsWith('.localhost')) return true
    if (host === '::1' || host === '0:0:0:0:0:0:0:1' || host.startsWith('fe80:')) return true
    if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true
    const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
    if (m) {
      const a = +m[1], b = +m[2]
      if (a === 10) return true
      if (a === 192 && b === 168) return true
      if (a === 172 && b >= 16 && b <= 31) return true
      if (a === 169 && b === 254) return true
      return false
    }
    return host.endsWith('.local') || host.endsWith('.lan') || host.endsWith('.internal')
  } catch (e) {
    return false
  }
}

async function initPlugin(ctx) {
  const { api, config } = ctx
  // performance.now() 以导航开始为零点，所以这个数就是「页面开始加载 → 插件真正跑起来」
  // 的空档。MV3 的 service worker 冷启动 + getPluginConfig 往返都算在里面，
  // 屏蔽延迟里有多少是白等在这一段，看这个数就知道。
  console.log(`[adult-guard] 插件已启动 | 距页面加载 ${Math.round(performance.now())}ms`)

  // ── 严格模式（按块门控）──
  // gate.js 在 document_start 把 body 的直接子节点默认隐藏，这里负责逐块放行。
  // 两级闸门：本地关键词扫描 1~2ms，可以对每次 DOM 变动都跑，无命中就立刻放行，人眼无感；
  // 只有命中才升级到 LLM（首字 0.4~2s，绝不可能每次变动都调）。
  //
  // 边界必须说清楚：本地闸门是文本关键词扫描，所以纯图片的成人页面、canvas/视频画面里的
  // 内容都会被瞬间放行。严格模式能保证的是「有文字证据的成人内容不会闪现」，
  // 而不是「不会看到成人内容」——它让检测更早，并不让检测更准。
  const gate = window.__agGate || null
  const strict = !!(config.strictMode && gate && gate.active())
  const release = why => { if (gate) gate.release(why) }
  if (strict) console.log('[adult-guard][严格] 门控已生效，内容按块放行')

  // 对仍被挡住的顶层块做本地扫描：干净的立刻放行，可疑的留着等 LLM 结论
  // 返回是否还有可疑块
  function gateSweep() {
    if (!strict || !gate.active()) return false
    let suspicious = 0, approved = 0
    gate.pending().forEach(function(el) {
      const t = (el.textContent || '')
      if (!t.trim()) { gate.approve(el); approved++; return } // 无文字（图片/容器）无从判断，放行
      const low = t.toLowerCase()
      const hit = keywords.some(k => cjkCount(k) > 0 ? low.includes(k) : new RegExp('\\b' + escapeReg(k) + '\\b', 'i').test(low))
      if (hit) suspicious++
      else { gate.approve(el); approved++ }
    })
    if (approved || suspicious) console.log(`[adult-guard][严格] 门控扫描：放行 ${approved} 块，可疑 ${suspicious} 块`)
    return suspicious > 0
  }

  // 只在顶层页面检测（iframe 里的空 body 会产生噪音）
  if (window.top !== window) { console.log('[adult-guard] 在 iframe 中，跳过检测'); return }

  // 屏蔽范围：局域网/内网页面默认不屏蔽（localhost、路由器后台、公司内网等），
  // 开启配置 blockLan 后局域网页面同样纳入检测
  if (!config.blockLan && isLanHost()) {
    console.log('[adult-guard] 局域网/内网页面，已放行（blockLan=false）')
    release('局域网白名单')
    return
  }

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
  // ===== 自更新词库（学习机制）=====
  // 关键词 = 内置默认（400 词，硬编码）+ 配置里用户追加的词 + 自动学习的词（屏蔽后由 LLM 挖掘，存本机）
  const dedupe = arr => Array.from(new Set(arr))
  function cjkCount(s) { let c = 0; for (const ch of s) if (ch >= '一' && ch <= '鿿') c++; return c } // 汉字计数，避免正则字符区间被编码破坏
  function escapeReg(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }
  // 通用词黑名单：单独出现时与色情无关，会误伤正常页面（金箍棒=孙悟空/白虎=麻将武侠/探花=科举/外围=新闻政治）
  // 精确匹配才拒绝，组合词如「色情直播」不受影响
  const GENERIC_WORDS = new Set(['直播', '美女', '视频', '图片', '模特', '网站', '在线', '成人', '金箍棒', '白虎', '探花', '外围', '资源', '系列', '专区'])
  function sanitizeKeyword(kw) {
    const s = String(kw || '').trim().toLowerCase() // 统一小写，与检测时的 lower.includes 一致
    if (!s || s.length < 2) return null // 单字（中/英）会命中牛奶/奶茶/assistant 等无关词，拒绝
    if (GENERIC_WORDS.has(s)) return null // 精确命中通用词黑名单
    // 词元级限制：含虚词/助词/代词等结构词的通常是句子片段，跨页面命中率极低，拒绝
    if (/[的了是在到着给就都也还又被把啊呢吗吧啦呀我你他她它们这那]/.test(s)) return null
    if (cjkCount(s) > 6) return null // 中文超过 6 字 → 描述性短语/句子片段
    if (s.length > 32) return null
    if (!/[\p{L}\p{N}]/u.test(s)) return null // 必须含字母/数字/汉字，排除纯符号
    return s
  }
  // 解析 LLM 返回的 JSON 数组（容错：代码块/前后缀文字；非 JSON 时退回提取引号字符串）
  function parseKeywords(raw) {
    const out = []
    const s = raw.indexOf('['); const e = raw.lastIndexOf(']')
    if (s !== -1 && e > s) {
      try {
        const arr = JSON.parse(raw.slice(s, e + 1))
        if (Array.isArray(arr)) for (const x of arr) if (typeof x === 'string' && x.trim()) out.push(x.trim())
      } catch (err) {}
    }
    if (!out.length) {
      const re = /"([^"]{1,40})"|'([^']{1,40})'/g; let m
      while ((m = re.exec(raw))) out.push((m[1] || m[2]).trim())
    }
    return out
  }

  const extraKw = Array.isArray(config.keywords) ? config.keywords.filter(s => typeof s === 'string' && s.trim()) : []
  let learnedKeywords = []
  try {
    const r = await chrome.storage.local.get('ag_learned_keywords')
    if (Array.isArray(r['ag_learned_keywords'])) {
      // 清理历史入库的低质词（旧版本可能已存入句子片段/通用词），写回避免重复清理
      const cleaned = r['ag_learned_keywords'].map(sanitizeKeyword).filter(Boolean)
      if (cleaned.length !== r['ag_learned_keywords'].length) {
        console.log('[adult-guard] 清理低质词库', r['ag_learned_keywords'].length - cleaned.length, '个（旧版本入库的句子片段/通用词）')
        learnedKeywords = cleaned
        chrome.storage.local.set({ ag_learned_keywords: cleaned })
      } else learnedKeywords = cleaned
    }
    console.log('[adult-guard] 已加载自动学习词库', learnedKeywords.length, '个')
  } catch (e) { console.log('[adult-guard] 加载学习词库失败:', e.message) }
  let keywords = dedupe(defaultKeywords.concat(extraKw, learnedKeywords))

  // ===== 负反馈机制（自动去除）=====
  // 关键词命中但 LLM 反复判定非成人 → 移出活跃词库，记入无关词列表（永久备忘，无论 LLM 如何推荐都不再加入）
  const FALSE_HIT_LIMIT = 5
  let falseCounts = {}
  let irrelevantKeywords = []
  try {
    const r = await chrome.storage.local.get(['ag_irrelevant_keywords', 'ag_keyword_false_counts'])
    if (Array.isArray(r['ag_irrelevant_keywords'])) irrelevantKeywords = r['ag_irrelevant_keywords']
    if (r['ag_keyword_false_counts'] && typeof r['ag_keyword_false_counts'] === 'object') falseCounts = r['ag_keyword_false_counts']
  } catch (e) { console.log('[adult-guard] 加载负反馈数据失败:', e.message) }
  const irrelevantSet = new Set(irrelevantKeywords)
  keywords = keywords.filter(k => !irrelevantSet.has(k)) // 无关词不再参与检测
  const persistNegative = async () => {
    try {
      await chrome.storage.local.set({ ag_keyword_false_counts: falseCounts, ag_irrelevant_keywords: irrelevantKeywords })
    } catch (e) { console.log('[adult-guard] 保存负反馈状态失败:', e.message) }
  }
  function penalizeHits(hits) {
    let changed = false
    for (const k of hits) {
      if (irrelevantSet.has(k)) continue
      falseCounts[k] = (falseCounts[k] || 0) + 1
      changed = true
      if (falseCounts[k] >= FALSE_HIT_LIMIT) {
        delete falseCounts[k]
        irrelevantKeywords.push(k); irrelevantSet.add(k)
        console.log('[adult-guard] 🚫 关键词反复误命中，移入无关词列表:', k)
      }
    }
    if (changed) {
      keywords = keywords.filter(k => !irrelevantSet.has(k))
      persistNegative()
    }
  }
  function resetFalseCounts(hits) {
    let changed = false
    for (const k of hits) if (falseCounts[k]) { delete falseCounts[k]; changed = true }
    if (changed) persistNegative()
  }

  let blocked = false  // 已屏蔽则不再重复检测
  let llmDown = false  // LLM 持续不可用（如扩展已重载），降级停止检测
  let llmFailStreak = 0 // 连续 LLM 失败次数
  let lastSig = -1     // 上次检测时的内容指纹
  let llmRunning = false  // 上一轮 LLM 是否还在返回（不并发调用）
  let llmDirty = false    // LLM 运行期间内容又变化，待补检
  let prevShingles = null // 上一轮提交时的内容指纹（字符 bigram 集合）

  // ===== 专注模式 =====
  // 开启后屏蔽以娱乐为主题的网站（游戏/漫画/短视频/直播等）；判定结果按网站(hostname)缓存，同网站不重复调 LLM
  const FOCUS_CACHE_KEY = 'ag_focus_cache'
  const FOCUS_CACHE_MAX = 500
  let focusCache = [] // [{ h: host, r: 'yes'|'no', t: 时间戳 }]
  try {
    const r = await chrome.storage.local.get(FOCUS_CACHE_KEY)
    if (Array.isArray(r[FOCUS_CACHE_KEY])) focusCache = r[FOCUS_CACHE_KEY]
  } catch (e) { console.log('[adult-guard] 加载专注模式缓存失败:', e.message) }
  const getFocusCache = host => { const e = focusCache.find(x => x.h === host); return e ? e.r : undefined }
  const setFocusCache = (host, result) => {
    focusCache = focusCache.filter(x => x.h !== host)
    focusCache.push({ h: host, r: result, t: Date.now() })
    if (focusCache.length > FOCUS_CACHE_MAX) focusCache = focusCache.sort((a, b) => a.t - b.t).slice(-FOCUS_CACHE_MAX) // 上限 500，超出淘汰最旧
    chrome.storage.local.set({ [FOCUS_CACHE_KEY]: focusCache }).catch(() => {})
  }
  let focusChecked = false // 当前页面只判定一次

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

  // 严格模式与专注模式的兼容处理
  // 幕布只由成人检测把关，而专注判定跑在 load 之后、还可能等 LLM 空闲（轮询上限 5 分钟）
  // 或卡在人机验证页轮询（60 秒）—— 让幕布等它意味着白屏一分钟，不可接受。
  // 折中：揭幕前顺手查一次专注模式的「缓存」结论。查缓存只需要 hostname、不调模型、
  // 零成本，足以消掉重复访问娱乐站时「先看到页面、几秒后才被屏蔽」的闪现；
  // 而未缓存的首次访问照旧揭幕，判定结果留给稍后的 runFocusCheck，只闪这一次。
  function releaseOrFocusBlock(why) {
    if (strict && config.focusMode) {
      const host = location.hostname.replace(/^www\./, '')
      if (getFocusCache(host) === 'yes') {
        focusChecked = true // 结论已由缓存给出，不必再让 runFocusCheck 跑一遍
        console.log('[adult-guard][严格] 专注模式缓存命中娱乐主题，直接屏蔽，不放行')
        blockPage(null, true, [], '专注模式 · 该网站以娱乐为主题', '请专心工作', 'focus')
        return
      }
    }
    release(why)
  }

  // 检测当前页面内容（首次扫描 & 内容变化后都会调用）
  // preExtracted：observer 已提取好的文本（相似度与检测共用同一份，避免重复提取）
  // 全链路分段计时：定位「屏蔽延迟」到底花在提取、关键词扫描、LLM 首字、还是渲染上
  async function runDetection(preExtracted) {
    if (blocked || llmDown) return
    const T = { start: performance.now() }
    const ms = t => Math.round(t) + 'ms'
    // 先做一遍按块门控：干净的块立刻放行（1~2ms，人眼无感），
    // 可疑的留着不放，等下面的判定给结论。这样即使全文判定要等一两秒，
    // 页面上无关的部分也已经正常显示了。
    gateSweep()
    const text = preExtracted !== undefined ? preExtracted : extractPageText()
    T.extract = performance.now() - T.start
    const sig = fnvHash(text)
    if (sig === lastSig) { console.log('[adult-guard] 内容未变化，跳过检测'); release('内容未变化'); return }
    lastSig = sig

    console.log('[adult-guard] 页面文本长度:', text.length)
    if (!text || text.length < 50) { console.log('[adult-guard] 页面文本过短(<50)，跳过检测'); release('文本过短，无需检测'); return }

    const tKw = performance.now()
    const lower = text.toLowerCase()
    // 中文关键词用包含匹配；英文/数字关键词用词边界匹配（\b），
    // 避免 ass 命中 assistant、cum 命中 custom、奶命中奶茶 等误屏蔽
    const hits = keywords.filter(k => cjkCount(k) > 0 ? lower.includes(k) : new RegExp('\\b' + escapeReg(k) + '\\b', 'i').test(lower))
    T.keyword = performance.now() - tKw
    console.log('[adult-guard] 关键词命中:', hits.length ? JSON.stringify(hits) : '无',
      `| 提取 ${ms(T.extract)} 扫描 ${ms(T.keyword)}（${keywords.length} 词 / ${text.length} 字）`)
    if (!hits.length) { releaseOrFocusBlock('关键词未命中'); return } // 严格模式下这里就放行，不调模型

    console.log('[adult-guard] 调 LLM...')
    // 串行化：上一轮 LLM 未返回时不并发调用，标记待补检，返回后自动重检
    if (llmRunning) { console.log('[adult-guard] 上一轮 LLM 未返回，标记待补检'); llmDirty = true; return }
    llmRunning = true

    // 审核是分类任务：只要几个字、且要求多次调用结果稳定
    const JUDGE_OPTS = { max_tokens: 8, temperature: 0 }
    const SYS = config.systemPrompt || '你是一个内容审核助手，判断以下文字是否包含色情内容，只回答 true 或 false。'
    async function judge(userContent, tag) {
      const t = performance.now()
      let out = '', tFirst = 0
      for await (const chunk of api.createLLMStream(
        [{ role: 'system', content: SYS }, { role: 'user', content: userContent }], JUDGE_OPTS)) {
        if (!tFirst) tFirst = performance.now()
        out += chunk
      }
      const stat = { first: tFirst ? tFirst - t : 0, total: performance.now() - t }
      console.log(`[adult-guard][${tag}] LLM: ${JSON.stringify(out)} | 输入 ${userContent.length} 字 | 首字 ${tFirst ? ms(stat.first) : '—'} 全部 ${ms(stat.total)}`)
      return { out: out, stat: stat }
    }

    try {
      // ── 严格模式：跳过窗口判定，直接一次全文检测 ──
      // 页面本来就被幕布藏着，没必要先用窗口抢时间；而窗口判定缺宏观语境、偏向屏蔽，
      // 在「结论直接决定显不显示」的场合更该用准确的那一次。
      if (strict) {
        const CTX = 20000
        const rs = await judge(text.slice(0, CTX), '严格·全文')
        T.s2First = rs.stat.first; T.s2Total = rs.stat.total
        llmFailStreak = 0
        if (!rs.out.trim()) {
          // 拿不到结论：宁可显示也不要空白，但用遮罩说明情况，并清指纹等重试
          console.log('[adult-guard][严格] ⚠️ 返回空正文，改用遮罩提示并等重试')
          release('复核无结论，转为遮罩提示')
          showMask()
          lastSig = -1
          return
        }
        if (rs.out.toLowerCase().includes('true')) {
          resetFalseCounts(hits)
          release('判定为成人内容，转为正式屏蔽')
          const tR = performance.now()
          blockPage(text, true, hits)
          console.log('[adult-guard][严格] ⏱ 链路耗时：' +
            `提取 ${ms(T.extract)} → 扫描 ${ms(T.keyword)} → 全文 首字 ${ms(T.s2First)}/全部 ${ms(T.s2Total)} → 渲染 ${ms(performance.now() - tR)}` +
            ` | 合计 ${ms(performance.now() - T.start)}`)
        } else {
          penalizeHits(hits)
          releaseOrFocusBlock('全文检测判否')
          console.log(`[adult-guard][严格] ⏱ 判否放行 | 全文 ${ms(T.s2Total)} | 白屏时长 ${ms(performance.now() - T.start)}`)
        }
        return
      }

      // ── 第一段：句子级窗口，快 ──
      // 只看命中词所在的句子，缺宏观语境，所以天然偏向屏蔽 —— 它的结论只用来「先罩住」，
      // 不直接删页面，误判的代价由第二段负责纠正。
      const window1 = sentencesAround(text, hits)
      const r1 = await judge(window1 || text.slice(0, STAGE1_MAX), '第一段·窗口')
      T.s1First = r1.stat.first; T.s1Total = r1.stat.total
      if (!r1.out.trim()) {
        console.log('[adult-guard] ⚠️ 第一段返回空正文，本轮不判定，等下次内容变化重试')
        lastSig = -1
        return
      }
      if (!r1.out.toLowerCase().includes('true')) {
        penalizeHits(hits) // 连窗口内都判否，说明这些词在本页确实无关
        console.log(`[adult-guard] ⏱ 第一段判否，未屏蔽 | 提取 ${ms(T.extract)} 扫描 ${ms(T.keyword)} 第一段 ${ms(T.s1Total)} | 合计 ${ms(performance.now() - T.start)}`)
        return
      }

      // 第一段成立 → 立刻遮挡，用户不用等第二段
      showMask()

      // ── 第二段：全文复核，准 ──
      // 不做片段截取，让 LLM 拿到宏观语境（如「防范色情信息」的科普文，窗口里全是敏感词
      // 但整体无害）。CTX_MAX 只是防止超长页面撑爆上下文/费用的安全上限，不是语义截取。
      const CTX_MAX = 20000
      if (text.length > CTX_MAX) console.log(`[adult-guard][第二段] 页面 ${text.length} 字，超过 ${CTX_MAX} 字安全上限，按上限送入`)
      const r2 = await judge(text.slice(0, CTX_MAX), '第二段·全文')
      T.s2First = r2.stat.first; T.s2Total = r2.stat.total
      llmFailStreak = 0 // 两段都通了，连接正常

      if (!r2.out.trim()) {
        // 复核拿不到结论：保留遮罩（第一段毕竟判成立），等内容变化后重试，不删页面
        console.log('[adult-guard] ⚠️ 第二段返回空正文，保留遮罩不删页面，等下次内容变化重试')
        lastSig = -1
        return
      }
      if (r2.out.toLowerCase().includes('true')) {
        resetFalseCounts(hits)
        hideMask('复核成立，转为正式屏蔽')
        const tRender = performance.now()
        blockPage(text, true, hits)
        console.log('[adult-guard] ⏱ 屏蔽链路耗时：' +
          `提取 ${ms(T.extract)} → 扫描 ${ms(T.keyword)} → 第一段 首字 ${ms(T.s1First)}/全部 ${ms(T.s1Total)} → 第二段 首字 ${ms(T.s2First)}/全部 ${ms(T.s2Total)} → 渲染 ${ms(performance.now() - tRender)}` +
          ` | 合计 ${ms(performance.now() - T.start)} | 遮罩出现于 ${ms(T.extract + T.keyword + T.s1Total)}`)
      } else {
        // 窗口内像、全文看不像 → 典型的语境误判，撤罩放行并给关键词记负反馈
        penalizeHits(hits)
        hideMask('全文复核判否，判定为语境误判')
        console.log(`[adult-guard] ⏱ 第一段成立但全文判否 | 第一段 ${ms(T.s1Total)} 第二段 ${ms(T.s2Total)} | 合计 ${ms(performance.now() - T.start)}`)
      }
    } catch (e) {
      console.log('[adult-guard] LLM 失败:', e.message, `| 耗时 ${ms(performance.now() - T.start)}`)
      llmFailStreak++
      if (llmFailStreak >= 3) {
        // 连续 3 次连接失败（如扩展被 reload 后旧标签页失联），停止检测避免误屏蔽，刷新页面恢复
        llmDown = true
        hideMask('已停止检测，不再保留遮挡') // 不再复核了，留着遮罩会永久挡住页面
        release('已停止检测') // 严格模式下必须揭幕，否则页面永久空白
        console.log('[adult-guard] 连续 3 次连接失败，扩展可能已重载，已停止检测（刷新页面恢复）')
        return
      }
      // 关键词命中但无法复核：保留/挂上遮罩即可，不做破坏性屏蔽，等重试
      // 严格模式下先揭幕再挂遮罩 —— 让用户看到「正在复核」的说明，而不是一片空白
      release('复核失败，转为遮罩提示')
      showMask()
      console.log('[adult-guard] 复核失败，暂以遮罩挡住，等下次内容变化重试')
      lastSig = -1
    } finally {
      llmRunning = false
      if (llmDirty && !blocked) { llmDirty = false; console.log('[adult-guard] 补检上一轮期间的内容变化'); runDetection() }
    }
  }

  let mining = false // 防止并发挖掘
  // 屏蔽后调用 LLM 从页面内容挖掘新关键词，并入自动学习词库（与硬编码词库联合用于后续检测）
  async function mineKeywords(pageText) {
    if (mining) return
    mining = true
    try {
      console.log('[adult-guard] 开始挖掘新关键词...')
      const msg = [
        { role: 'system', content: '你是关键词挖掘助手。只输出一个 JSON 字符串数组，不要输出任何其他内容。' },
        { role: 'user', content: '从下面的网页文本中，挖掘与色情、成人内容直接相关的**词条级**关键词（中/英/日/韩均可，如术语、行话、网站名、艺人名、番号等）。\n\n判断标准：**这个词能否作为词典里独立收录的词条**。\n\n严格要求：\n1. 只输出词语本身（2~6 个汉字，或 2~24 个英文字母/数字）；**不要输出单字**；**英文单词必须能独立成词**，不能是其他单词的一部分（如「ass」是 assistant 的一部分，不要输出）；**不要输出句子或描述性短语**\n2. 示例对比：\n   好词：「成人影院」「撸友导航」「射满」「无套后入」——词条，可独立收录\n   坏词：「腿在抖」「水流的到处都是」「被操哭着求饶的母狗」——句子/描述性短语，一律不要\n3. 排除单独出现时与色情无关的通用词（如「直播」「美女」「视频」「图片」「模特」「金箍棒」「白虎」「探花」「外围」），除非与色情词组合（如「色情直播」）\n4. 每个词必须直接出现在上面的文本中\n\n只输出 JSON 数组，例如：["词1","keyword2","site3"]\n\n网页文本：\n' + pageText.slice(0, 3000) }
      ]
      let raw = ''
      for await (const chunk of api.createLLMStream(msg)) { raw += chunk }
      // 客户端权威过滤：只保留不在硬编码/配置/已学习词库中的词（大小写归一，避免误入库）
      const known = new Set(keywords)
      const batch = new Set()
      const added = []
      const lowerText = pageText.toLowerCase()
      for (const kw of parseKeywords(raw)) {
        const s = sanitizeKeyword(kw)
        if (!s || known.has(s) || batch.has(s) || irrelevantSet.has(s)) continue // 无关词列表中的词永不重新加入
        if (!lowerText.includes(s)) continue // 词必须真实出现在页面文本中，防 LLM 幻觉造词
        batch.add(s); added.push(s)
      }
      if (!added.length) { console.log('[adult-guard] 未挖掘到新关键词'); return }
      learnedKeywords = dedupe(learnedKeywords.concat(added))
      if (learnedKeywords.length > 2000) learnedKeywords = learnedKeywords.slice(-2000) // 上限 2000，防止无界增长
      keywords = keywords.concat(added)
      try { await chrome.storage.local.set({ ag_learned_keywords: learnedKeywords }) } catch (e) { console.log('[adult-guard] 保存词库失败:', e.message) }
      console.log('[adult-guard] 已新增', added.length, '个关键词入库 | 联合词库总数:', keywords.length)
    } catch (e) {
      console.log('[adult-guard] 挖掘关键词失败:', e.message)
    } finally {
      mining = false
    }
  }

  const escHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  // 屏蔽页配色主题：danger=成人内容（警示红/深蓝紫），focus=专注模式（提醒琥珀/暖棕），视觉上明显区分
  // ── 两段式屏蔽的第一段：句子级窗口 ──
  // 只把命中词所在的整句挑出来给 LLM，提示词短、prefill 快，而且一定含证据
  // （原来切前 3000 字，命中词若在更后面就送不进去，等于让 LLM 盲判）
  const SENT_SPLIT = /(?<=[。！？；!?;\n])/
  const STAGE1_MAX = 1200 // 窗口总长上限，超出就不再往里塞句子
  function sentencesAround(text, hits) {
    const lowerHits = hits.map(h => h.toLowerCase())
    const parts = text.split(SENT_SPLIT)
    const picked = []
    let total = 0
    for (const raw of parts) {
      const s = raw.trim()
      if (s.length < 2) continue
      const low = s.toLowerCase()
      if (!lowerHits.some(h => low.includes(h))) continue
      // 单句过长时截断，避免一句话就吃满预算
      const seg = s.length > 300 ? s.slice(0, 300) + '…' : s
      if (total + seg.length > STAGE1_MAX) break
      picked.push(seg)
      total += seg.length
    }
    // 一句都没挑到（命中词跨句或落在无句读的长文本里）→ 退回命中词附近的字符窗口
    if (!picked.length) {
      const low = text.toLowerCase()
      for (const h of lowerHits) {
        const i = low.indexOf(h)
        if (i === -1) continue
        const seg = text.slice(Math.max(0, i - 120), i + h.length + 120)
        if (total + seg.length > STAGE1_MAX) break
        picked.push(seg)
        total += seg.length
      }
    }
    return picked.join('\n---\n')
  }

  // ── 临时遮罩 ──
  // 第一段判定成立后先把页面罩住（不破坏 DOM，可撤销），等第二段全文复核出结论：
  // 成立 → 走 blockPage 真正清掉内容；不成立 → 撤掉遮罩，页面照常。
  let maskEl = null, maskedMedia = []
  function showMask() {
    if (maskEl) return
    maskEl = document.createElement('div')
    maskEl.id = 'ai-ag-mask'
    maskEl.style.cssText = 'all:initial;position:fixed!important;inset:0!important;z-index:2147483647!important;display:flex!important;align-items:center;justify-content:center;background:linear-gradient(135deg,#1a1a2e,#16213e,#0f3460)!important;color:#fff!important;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif!important;text-align:center'
    maskEl.innerHTML = '<div style="padding:40px;max-width:460px"><div style="font-size:56px;margin-bottom:14px">🛡️</div><div style="font-size:19px;font-weight:600;color:#f87171;margin-bottom:10px">检测到可疑内容，正在复核…</div><div style="font-size:13px;color:rgba(255,255,255,.65);line-height:1.7">已先行遮挡该页面。AI 正在结合全文判断，若为误判会自动恢复显示。</div></div>'
    document.documentElement.appendChild(maskEl)
    // 遮罩挡不住声音，顺手暂停正在播放的音视频（不自动恢复，避免撤罩时突然出声）
    maskedMedia = []
    try {
      document.querySelectorAll('video,audio').forEach(function(m) {
        if (!m.paused) { m.pause(); maskedMedia.push(m) }
      })
    } catch (e) {}
    console.log('[adult-guard] 已挂临时遮罩，等待全文复核' + (maskedMedia.length ? `（暂停了 ${maskedMedia.length} 个媒体元素）` : ''))
  }
  function hideMask(why) {
    if (!maskEl) return
    maskEl.remove(); maskEl = null
    console.log('[adult-guard] 已撤除临时遮罩：' + why)
  }

  const PAGE_THEMES = {
    danger: { bg: 'linear-gradient(135deg,#1a1a2e,#16213e,#0f3460)', accent: '#f87171', badgeBg: 'rgba(248,113,113,.15)', badgeBorder: 'rgba(248,113,113,.2)' },
    focus:  { bg: 'linear-gradient(135deg,#1c1917,#2a2622,#3d3120)', accent: '#fbbf24', badgeBg: 'rgba(251,191,36,.15)', badgeBorder: 'rgba(251,191,36,.25)' }
  }
  function blockPage(pageText, confirmed, hits, reason, heading, theme) {
    // 既然要显示我们自己的屏蔽页，就必须先揭幕。正常路径 document.open() 会连幕布样式
    // 一起清掉，但降级分支（catch 里改 body.innerHTML）保留 documentElement，
    // 幕布会存活下来把屏蔽页自己挡成一片空白。
    release('转为屏蔽页')
    blocked = true  // 先置位：清空 body 会触发 MutationObserver，被 blocked 挡住不会死循环
    console.log('[adult-guard] 屏蔽!')
    // 屏蔽页展示屏蔽原因（专注模式）与命中的关键词（最多列 5 个），让用户知道屏蔽理由
    const hitAll = hits || []
    const title = heading || '内容已被屏蔽'   // 专注模式等特殊场景可自定义主标题（如「请专心工作」）
    const t = PAGE_THEMES[theme] || PAGE_THEMES.danger
    const reasonHtml = reason ? '<div style="margin-top:16px;color:rgba(255,255,255,.75);font-size:13px;line-height:1.8">' + escHtml(reason) + '</div>' : ''
    const hitHtml = hitAll.length
      ? '<div style="margin-top:16px;color:rgba(255,255,255,.75);font-size:13px;line-height:1.8;word-break:break-all">命中关键词：<span style="color:#fca5a5">' + hitAll.slice(0, 5).map(escHtml).join('、') + '</span>' + (hitAll.length > 5 ? ' 等 ' + hitAll.length + ' 个' : '') + '</div>'
      : ''
    const bodyHtml = '<div style="text-align:center;padding:48px;max-width:500px;color:#fff"><div style="font-size:64px;margin-bottom:16px">🛡️</div><h1 style="color:' + t.accent + ';font-size:24px;margin-bottom:8px">' + escHtml(title) + '</h1><p style="color:rgba(255,255,255,.6);line-height:1.6">此页面已被 AI 内容过滤器自动屏蔽。</p>' + reasonHtml + hitHtml + '<div style="margin-top:24px;padding:6px 16px;border-radius:20px;background:' + t.badgeBg + ';color:' + t.accent + ';font-size:12px;display:inline-block;border:1px solid ' + t.badgeBorder + '">AI 内容安全卫士 · 实时守护</div></div>'
    // document.open() 重置整个文档：销毁页面脚本上下文（定时器/事件监听），
    // 页面 JS 彻底停止（否则如 YouTube 会持续请求已失效的 blob URL 报 ERR_FILE_NOT_FOUND）
    try {
      document.open()
      document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>⚠️ ' + escHtml(title) + '</title></head><body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;background:' + t.bg + '">' + bodyHtml + '</body></html>')
      document.close()
    } catch (e) {
      // 兜底：直接清空原内容
      document.body.innerHTML = ''
      document.body.style.cssText = 'margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:' + t.bg
      document.body.innerHTML = bodyHtml
    }
    // 只有 LLM 确认为成人内容（confirmed）才挖掘新关键词；
    // 连接失败走兜底屏蔽时页面性质未确认，不挖词
    if (confirmed && pageText) mineKeywords(pageText)
  }

  // ===== 专注模式：判断网站是否以娱乐为主题 =====
  // 页面加载完毕后（load 事件 + 8s 兜底）调用；结果按 hostname 缓存，命中缓存不再调 LLM
  const FOCUS_TIMEOUT_MS = 300000 // 等待 LLM 空闲超过 5 分钟放弃本次判定
  const CHALLENGE_WAIT_MS = 60000 // 人机验证页最长等待 60s，超时放弃（保持放行，等用户手动刷新）
  let focusStart = 0
  async function runFocusCheck() {
    if (focusChecked || blocked || llmDown) return
    if (llmRunning) {
      if (Date.now() - focusStart > FOCUS_TIMEOUT_MS) { focusChecked = true; console.log('[adult-guard][专注] 等待超时，放弃本次判定'); return }
      setTimeout(runFocusCheck, 300) // 成人检测的 LLM 占用中，稍后重试（不并发调用）
      return
    }
    // 人机验证页：页面文本不可信，不判定不屏蔽不缓存；保持 focusChecked=false 轮询重查，
    // 覆盖两种形态——同页填充（Turnstile 通过后挑战特征消失）与整页重载（新上下文自动重新走 load 流程）
    if (isChallengePage()) {
      if (Date.now() - focusStart > CHALLENGE_WAIT_MS) { focusChecked = true; console.log('[adult-guard][专注] 人机验证等待超时，放弃本次判定'); return }
      console.log('[adult-guard][专注] 检测到人机验证页，等待验证通过...')
      setTimeout(runFocusCheck, 2000)
      return
    }
    focusChecked = true
    const host = location.hostname.replace(/^www\./, '')
    const cached = getFocusCache(host)
    if (cached === 'yes') { console.log('[adult-guard][专注] 缓存命中：娱乐主题，屏蔽'); blockPage(null, true, [], '专注模式 · 该网站以娱乐为主题', '请专心工作', 'focus'); return }
    if (cached === 'no') { console.log('[adult-guard][专注] 缓存命中：非娱乐主题，放行'); return }
    console.log('[adult-guard][专注] 调 LLM 判断网站主题...')
    llmRunning = true
    const tFocus = performance.now()
    try {
      const msg = [
        { role: 'system', content: '你是一个网站主题分类助手。判断给定网站是否「以娱乐为主题」，只回答 true 或 false，不要输出任何其他内容。\n\n以娱乐为主题：网站的核心功能就是提供娱乐消遣内容，如游戏、漫画、小说、影视、短视频、直播、音乐、色情等，用户打开它就是为了消遣。\n注意例外：YouTube、Bilibili 等综合视频平台虽然娱乐视频很多，但属于综合内容创作平台，不算以娱乐为主题；新闻、社交、工具、办公、购物、教育、金融类网站也不算。' },
        { role: 'user', content: '网址: ' + location.href + '\n\n页面文字（节选）:\n' + extractPageText().slice(0, 1500) }
      ]
      let result = ''
      let tFirst = 0
      // 同为 true/false 分类任务，用与成人审核一致的采样参数
      for await (const chunk of api.createLLMStream(msg, { max_tokens: 8, temperature: 0 })) {
        if (!tFirst) tFirst = performance.now()
        result += chunk
      }
      console.log('[adult-guard][专注] LLM:', JSON.stringify(result),
        `| 首字 ${tFirst ? Math.round(tFirst - tFocus) + 'ms' : '—'} 全部 ${Math.round(performance.now() - tFocus)}ms`)
      if (!result.trim()) { console.log('[adult-guard][专注] LLM 空响应，不缓存不屏蔽，刷新页面后重试'); return }
      const isEnt = /true/i.test(result)
      setFocusCache(host, isEnt ? 'yes' : 'no')
      if (isEnt) blockPage(null, true, [], '专注模式 · 该网站以娱乐为主题', '请专心工作', 'focus')
    } catch (e) {
      console.log('[adult-guard][专注] LLM 失败:', e.message)
      // 失败不屏蔽也不缓存——刷新页面后重新判定
    } finally {
      llmRunning = false
      if (llmDirty && !blocked) { llmDirty = false; console.log('[adult-guard] 补检上一轮期间的内容变化'); runDetection() }
    }
  }

  // DOM 变化事件：防抖 300ms（合并突变突刺）后，先用轻量哈希预筛（文本没变直接跳过，
  // 动画/样式/媒体加载等纯资源变化不触发提取），再对提取文本算相似度——
  //   · 与上一轮提交的提取文本相似度 > 0.8（微变）→ 忽略
  //   · 相似度 ≤ 0.8（页面切换/大改/实质新增）→ 提交
  // 基线只在提交时更新，缓慢漂移累积到差异够大也会被捕获；提交时把提取文本传给 runDetection（不重复提取）
  let recheckTimer = null
  let lastFastSig = -1
  const observer = new MutationObserver(() => {
    // 门控扫描要同步做：新插入的顶层块已被 CSS 规则默认挡住（无竞态），
    // 但若等下面 300ms 的防抖再放行，正常内容会白等这 300ms。
    // 这里只遍历「仍被挡住的顶层块」，代价极小。
    // 注意本 observer 没有订阅 attributes，所以我们打标记不会把自己再触发一遍。
    gateSweep()
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
  // 包成函数，供上面在首次检测「之前」调用
  function startObserver() {
    // 初始化相似度基线（与检测同一份提取文本）
    prevShingles = textShingles(extractPageText())
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true })
  }

  // 首次扫描
  // 注意顺序：observer 必须在此之前挂好（见下方 startObserver）。
  // runDetection 会 await LLM，而首次调用要等 0.4~2 秒 —— 若在它之后才挂 observer，
  // 这段时间里动态插入的内容就没人放行：CSS 已把它挡住，却等不到扫描，白挡一两秒。
  // 那恰好是最需要门控生效的窗口。
  startObserver()
  await runDetection()

  // 专注模式触发：页面加载完毕后判定一次（load 事件；8s 未触发 load 也兜底执行）
  if (config.focusMode) {
    focusStart = Date.now()
    if (document.readyState === 'complete') { setTimeout(runFocusCheck, 500) }
    else {
      window.addEventListener('load', runFocusCheck)
      setTimeout(runFocusCheck, 8000)
    }
  }


}

// ===== 用户逻辑结束 =====
