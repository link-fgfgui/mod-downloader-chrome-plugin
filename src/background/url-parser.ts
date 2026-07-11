import type { ModInfo } from '../types'

export function parseModrinthUrl(url: string): ModInfo | null {
  const match = url.match(/modrinth\.com\/mod\/([^/?#]+)(?:\/version\/([^/?#]+))?/)
  if (!match) return null
  return {
    platform: 'modrinth',
    slug: match[1],
    url: `https://modrinth.com/mod/${match[1]}`,
    projectId: null,
    versionId: match[2] ?? null,
  }
}

export function parseCurseforgeUrl(url: string): ModInfo | null {
  const match = url.match(/curseforge\.com\/minecraft\/mc-mods\/([^/?#]+)(?:\/files\/(\d+))?/)
  if (!match) return null
  return {
    platform: 'curseforge',
    slug: match[1],
    url: `https://www.curseforge.com/minecraft/mc-mods/${match[1]}`,
    projectId: null,
    versionId: match[2] ?? null,
  }
}

export function extractModLinks(urls: string[]): string[] {
  const links: string[] = []

  for (const url of urls) {
    try {
      const parsed = new URL(url, 'https://www.mcmod.cn')
      if (parsed.hostname === 'modrinth.com' || ['curseforge.com', 'www.curseforge.com', 'legacy.curseforge.com'].includes(parsed.hostname)) {
        links.push(parsed.href)
        continue
      }
      if (parsed.hostname !== 'link.mcmod.cn' || !parsed.pathname.startsWith('/target/')) continue

      const encoded = parsed.pathname.slice('/target/'.length)
      const decoded = atob(decodeURIComponent(encoded))
      const target = new URL(decoded)
      if (target.hostname === 'modrinth.com' || ['curseforge.com', 'www.curseforge.com', 'legacy.curseforge.com'].includes(target.hostname)) {
        links.push(decoded)
      }
    } catch {
      // invalid URL/base64, skip
    }
  }

  return [...new Set(links)]
}

export function extractModLinksFromHtml(html: string): string[] {
  const urls: string[] = []
  const hrefPattern = /href="([^"]+)"/gi
  let match: RegExpExecArray | null
  while ((match = hrefPattern.exec(html)) !== null) urls.push(match[1])
  return extractModLinks(urls)
}

export function parseModUrl(url: string): ModInfo | null {
  if (url.includes('modrinth.com')) return parseModrinthUrl(url)
  if (url.includes('curseforge.com')) return parseCurseforgeUrl(url)
  return null
}

export function isMcmodUrl(url: string): boolean {
  return /www\.mcmod\.cn/.test(url)
}
