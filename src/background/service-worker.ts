import type { ModInfo, FilterConfig, ScanMessage, ScanResult, SiteType } from '../types'
import { isMcmodUrl, parseModUrl, extractModLinksFromHtml } from './url-parser'

const SITE_HOSTS: Record<SiteType, string[]> = {
  mcmod: ['www.mcmod.cn'],
  modrinth: ['modrinth.com'],
  curseforge: ['www.curseforge.com', 'legacy.curseforge.com'],
}

const REMOTE_URL = 'http://127.0.0.1:18801'

interface RemotePayload {
  p: 'mr' | 'cf'
  id: string | null
  slug: string
  file: string
}

async function fetchTabHtml(tabId: number): Promise<string> {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => document.documentElement.outerHTML,
  })
  const html = results?.[0]?.result
  if (typeof html !== 'string' || html.length === 0) {
    throw new Error('executeScript 未返回页面 HTML')
  }
  return html
}

interface TabExtractResult {
  slug: string | null
  projectId: string | null
  versionId: string | null
}

async function extractFromTab(tabId: number): Promise<TabExtractResult> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')
        const href = canonical?.href ?? ''
        // 用 outerHTML 而非 innerText，后者拿不到 <script> 内的 JSON
        const html = document.documentElement.outerHTML ?? ''

        let slug: string | null = null
        let projectId: string | null = null
        let versionId: string | null = null
        let m: RegExpMatchArray | null

        // ---- slug ----
        m = href.match(/curseforge\.com\/minecraft\/mc-mods\/([^/?#]+)/)
        if (m) slug = m[1]
        if (!slug) {
          m = href.match(/modrinth\.com\/mod\/([^/?#]+)/)
          if (m) slug = m[1]
        }

        // ---- projectId ----
        // modrinth: canonical /project/<base62>
        m = href.match(/modrinth\.com\/project\/([A-Za-z0-9]+)/)
        if (m) projectId = m[1]
        // curseforge legacy: data-project-id / project-id
        if (!projectId) {
          m = html.match(/data-project-id="(\d+)"/)
          if (m) projectId = m[1]
        }
        if (!projectId) {
          m = html.match(/\bproject-id="(\d+)"/)
          if (m) projectId = m[1]
        }
        // curseforge 新版: "identifier":"231484"
        if (!projectId) {
          m = html.match(/"identifier"\s*:\s*"?(\d+)"?/)
          if (m) projectId = m[1]
        }
        if (!projectId) {
          m = html.match(/"projectId"\s*:\s*"?(\d+)"?/)
          if (m) projectId = m[1]
        }
        // curseforge: "project_id":"231484"
        if (!projectId) {
          m = html.match(/"project_id"\s*:\s*"?(\d+)"?/)
          if (m) projectId = m[1]
        }
        // modrinth: maven.modrinth:<project-id>:
        if (!projectId) {
          m = html.match(/maven\.modrinth:([A-Za-z0-9_-]+):/)
          if (m) projectId = m[1]
        }
        // modrinth: "project_id":"<base62>"
        if (!projectId) {
          m = html.match(/"project_id"\s*:\s*"([A-Za-z0-9]{8,16})"/)
          if (m) projectId = m[1]
        }

        // ---- versionId / fileId ----
        // curseforge: canonical /files/<id>
        m = href.match(/\/files\/(\d+)/)
        if (m) versionId = m[1]
        // curseforge legacy: Elerium.ProjectFileDetails.projectFileID = "8260358"
        if (!versionId) {
          m = html.match(/projectFileID\s*=\s*"?(\d+)"?/)
          if (m) versionId = m[1]
        }
        // modrinth: canonical /version/<id>
        if (!versionId) {
          m = href.match(/\/version\/([^/?#]+)/)
          if (m) versionId = m[1]
        }
        // modrinth: maven.modrinth:<projectId>:<versionId>
        if (!versionId) {
          m = html.match(/maven\.modrinth:[A-Za-z0-9_-]+:([A-Za-z0-9_-]+)/)
          if (m) versionId = m[1]
        }

        return { slug, projectId, versionId }
      },
    })
    const val = results?.[0]?.result as TabExtractResult | undefined
    if (val && typeof val === 'object') {
      return {
        slug: val.slug || null,
        projectId: val.projectId || null,
        versionId: val.versionId || null,
      }
    }
    return { slug: null, projectId: null, versionId: null }
  } catch {
    return { slug: null, projectId: null, versionId: null }
  }
}

function toRemotePayload(mods: ModInfo[]): RemotePayload[] {
  return mods.map(m => ({
    p: m.platform === 'modrinth' ? 'mr' as const : 'cf' as const,
    id: m.projectId,
    slug: m.slug,
    file: m.versionId ?? '',
  }))
}

async function sendToRemote(mods: ModInfo[]): Promise<string | null> {
  if (mods.length === 0) return null
  const payload = toRemotePayload(mods)
  const resp = await fetch(REMOTE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  return await resp.text()
}

function isAllowedHost(url: string, hosts: string[]): boolean {
  try {
    const { hostname } = new URL(url)
    return hosts.some(h => hostname === h || hostname.endsWith('.' + h))
  } catch {
    return false
  }
}

async function processTab(tab: chrome.tabs.Tab, allowedSites: SiteType[]): Promise<ModInfo[]> {
  if (!tab.url || !tab.id) return []
  const url = tab.url

  const allHosts = allowedSites.flatMap(s => SITE_HOSTS[s])
  if (!isAllowedHost(url, allHosts)) return []

  const mods: ModInfo[] = []
  const isMcmod = isMcmodUrl(url)
  const suspended = !!(tab.discarded || tab.frozen)

  if (isMcmod && allowedSites.includes('mcmod')) {
    const html = await fetchTabHtml(tab.id)
    const links = extractModLinksFromHtml(html)
    // 每个 mcmod 页面代表一个模组，按 HTML 出现顺序取第一个即可
    for (const link of links) {
      const mod = parseModUrl(link)
      if (mod) {
        mod.originalTabUrl = url
        mods.push(mod)
        break
      }
    }
  } else if (!isMcmod) {
    const mod = parseModUrl(url)
    if (mod) {
      mod.originalTabUrl = url
      mods.push(mod)
    }
  }

  // 仅对直接打开的 modrinth/curseforge 页面提取 projectId/versionId
  // mcmod 页面提取的 mod 来自不同平台，无法从当前 tab 获取各自的 projectId
  // cf/mr 休眠时跳过 extractFromTab，URL parse 已提供基本信息
  if (mods.length > 0 && !isMcmod && !suspended) {
    const { slug, projectId, versionId } = await extractFromTab(tab.id)
    for (const mod of mods) {
      if (projectId) mod.projectId = projectId
      if (slug) mod.slug = slug
      if (versionId) mod.versionId = versionId
    }
  }

  return mods
}

async function scanTabs(filter?: FilterConfig): Promise<ScanResult> {
  const mods: ModInfo[] = []
  const errors: string[] = []
  const suspendedTabs: string[] = []
  const allowedSites: SiteType[] = (filter?.sites && filter.sites.length > 0)
    ? filter.sites
    : ['mcmod', 'modrinth', 'curseforge']

  const queryInfo: chrome.tabs.QueryInfo = filter?.windowId != null
    ? { windowId: filter.windowId }
    : {}
  let tabs = await chrome.tabs.query(queryInfo)
  // 从指定 index 之后开始遍历（仅对具体窗口生效）
  if (filter?.tabStartIndex != null && filter.tabStartIndex >= 0) {
    tabs = tabs.filter(tab => (tab.index ?? 0) > filter.tabStartIndex!)
  }
  const tasks = tabs.map(async tab => {
    try {
      // mcmod 休眠单独收集，不调 processTab（executeScript 会失败）
      if (tab.url && isMcmodUrl(tab.url) && allowedSites.includes('mcmod') && (tab.discarded || tab.frozen)) {
        suspendedTabs.push(tab.url)
        return []
      }
      return await processTab(tab, allowedSites)
    } catch (e) {
      errors.push(`Tab ${tab.url}: ${e instanceof Error ? e.message : String(e)}`)
      return []
    }
  })

  const taskResults = await Promise.all(tasks)
  // 按标签页原始顺序排列（Promise.all 并发完成顺序不确定）
  for (const tabMods of taskResults) {
    mods.push(...tabMods)
  }

  const seen = new Set<string>()
  const unique = mods.filter(m => {
    const key = `${m.platform}:${m.slug}:${m.versionId ?? ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return { mods: unique, errors, suspendedTabs }
}

async function scanAndSend(filter?: FilterConfig, force = false): Promise<ScanResult> {
  const result = await scanTabs(filter)

  // 有休眠 mcmod 且未强制发送时，返回 needConfirm 让用户确认
  if (!force && result.suspendedTabs && result.suspendedTabs.length > 0) {
    return { ...result, needConfirm: true }
  }

  try {
    await sendToRemote(result.mods)
  } catch (e) {
    result.errors.push(`发送到 ${REMOTE_URL} 失败: ${e instanceof Error ? e.message : String(e)}`)
  }

  return result
}

chrome.runtime.onMessage.addListener((message: ScanMessage, _sender, sendResponse) => {
  ;(async () => {
    try {
      let result: ScanResult

      if (message.action === 'scanFiltered') {
        const data = await chrome.storage.local.get('filter')
        const filter = (data.filter as FilterConfig) || undefined
        result = await scanAndSend(filter, message.force)
      } else if (message.action === 'scanAll') {
        result = await scanAndSend(undefined, message.force)
      } else {
        sendResponse({ mods: [], errors: [`未知 action: ${message.action}`] })
        return
      }

      sendResponse(result)
    } catch (e) {
      sendResponse({ mods: [], errors: [`扫描失败: ${e instanceof Error ? e.message : String(e)}`] })
    }
  })()
  return true
})
