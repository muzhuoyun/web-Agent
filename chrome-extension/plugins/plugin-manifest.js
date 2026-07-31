// 自动生成 — 由服务器维护，请勿手动修改
// 注意：不再引入 index.js，配置通过 plugin.json 动态加载

const PLUGIN_IDS = ["adult-guard","noun-explainer"]

const runtimeState = {
  'adult-guard': { enabled: true },
  'noun-explainer': { enabled: true }
}

export function getRuntimeState(id) {
  return runtimeState[id] || { enabled: true }
}

export function setPluginEnabled(id, enabled) {
  if (runtimeState[id]) runtimeState[id].enabled = enabled
  else runtimeState[id] = { enabled }
}

export async function loadPluginMeta(id) {
  try {
    const res = await fetch(chrome.runtime.getURL('plugins/' + id + '/plugin.json'))
    return await res.json()
  } catch (_) { return null }
}

export async function loadAllPluginsMeta() {
  const metas = await Promise.all(PLUGIN_IDS.map(id => loadPluginMeta(id)))
  return metas.filter(m => m).map(m => ({ ...m, config: { ...runtimeState[m.id], ...(m.config || {}) } }))
}
