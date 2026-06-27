import type { ModInfo, FilterConfig, ScanResult, SiteType } from '../types'
import { isMcmodUrl, parseModUrl, extractModLinksFromHtml } from './url-parser'

const SITE_HOSTS: Record<SiteType, string[]> = {
  mcmod: ['mcmod.cn'],
  modrinth: ['modrinth.com'],
  curseforge: ['www.curseforge.com', 'curseforge.com'],
}

const REMOTE_URL = 'http://127.0.0.1:18801'

interface RemotePayload {
  p: 'mr' | 'cf'
  id: string | null
  slug: string
  file: string
}

async function fetchPageContent(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url, { headers: { Accept: 'text/html' } })
    if (!resp.ok) return null
    return await resp.text()
  } catch {
    return null
  }
}

async function extractProjectIdFromTab(tabId: number): Promise<string | null> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')
        const href = canonical?.href ?? ''

        let m = href.match(/modrinth\.com\/project\/([^/?#]+)/)
        if (m) return m[1]

        m = href.match(/curseforge\.com\/minecraft\/mc-mods\/([^/?#]+)/)
        if (m) return m[1]

        const body = document.body?.innerText ?? ''
        m = body.match(/"project_id"\s*:\s*"([^"]+)"/)
        if (m) return m[1]

        m = body.match(/"identifier"\s*:\s*"(\d+)"/)
        if (m) return m[1]

        m = body.match(/data-project-id="(\d+)"/)
        if (m) return m[1]

        m = body.match(/maven\.modrinth:([A-Za-z0-9_-]+):/)
        if (m) return m[1]

        return null
      },
    })
    const val = results?.[0]?.result
    return typeof val === 'string' && val ? val : null
  } catch {
    return null
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

  if (isMcmod && allowedSites.includes('mcmod')) {
    const html = await fetchPageContent(url)
    if (html) {
      const links = extractModLinksFromHtml(html)
      const modInfos = links.map(link => parseModUrl(link)).filter((m): m is ModInfo => m != null)
      for (const mod of modInfos) {
        mod.originalTabUrl = url
        mods.push(mod)
      }
    }
  } else if (!isMcmod) {
    const mod = parseModUrl(url)
    if (mod) {
      mod.originalTabUrl = url
      mods.push(mod)
    }
  }

  // 仅对直接打开的 modrinth/curseforge 页面提取 projectId
  // mcmod 页面提取的 mod 来自不同平台，无法从当前 tab 获取各自的 projectId
  if (mods.length > 0 && !isMcmod) {
    const projectId = await extractProjectIdFromTab(tab.id)
    for (const mod of mods) {
      mod.projectId = projectId
    }
  }

  return mods
}

async function scanTabs(filter?: FilterConfig): Promise<ScanResult> {
  const mods: ModInfo[] = []
  const errors: string[] = []
  const allowedSites: SiteType[] = (filter?.sites && filter.sites.length > 0)
    ? filter.sites
    : ['mcmod', 'modrinth', 'curseforge']

  const queryInfo: chrome.tabs.QueryInfo = filter?.windowId != null
    ? { windowId: filter.windowId }
    : {}
  const tabs = await chrome.tabs.query(queryInfo)
  const tasks = tabs.map(async tab => {
    try {
      const tabMods = await processTab(tab, allowedSites)
      mods.push(...tabMods)
    } catch (e) {
      errors.push(`Tab ${tab.url}: ${e instanceof Error ? e.message : String(e)}`)
    }
  })

  await Promise.all(tasks)

  const seen = new Set<string>()
  const unique = mods.filter(m => {
    const key = `${m.platform}:${m.slug}:${m.versionId ?? ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return { mods: unique, errors }
}

async function scanAndSend(filter?: FilterConfig): Promise<ScanResult> {
  const result = await scanTabs(filter)

  try {
    await sendToRemote(result.mods)
  } catch (e) {
    result.errors.push(`发送到 ${REMOTE_URL} 失败: ${e instanceof Error ? e.message : String(e)}`)
  }

  return result
}

chrome.runtime.onMessage.addListener((message: { action: string }, _sender, sendResponse) => {
  ;(async () => {
    try {
      let result: ScanResult

      if (message.action === 'scanFiltered') {
        const data = await chrome.storage.local.get('filter')
        const filter = (data.filter as FilterConfig) || undefined
        result = await scanAndSend(filter)
      } else if (message.action === 'scanAll') {
        result = await scanAndSend()
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
