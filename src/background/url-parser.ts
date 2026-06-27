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

export function extractModLinksFromHtml(html: string): string[] {
  const links: string[] = []

  const directPattern = /href="(https?:\/\/(?:modrinth\.com|curseforge\.com)[^"]*)"/gi
  let match
  while ((match = directPattern.exec(html)) !== null) {
    links.push(match[1])
  }

  const proxyPattern = /href="(?:https?:)?\/\/link\.mcmod\.cn\/target\/([A-Za-z0-9+/=]+)"/gi
  while ((match = proxyPattern.exec(html)) !== null) {
    try {
      const decoded = atob(match[1])
      if (decoded.includes('modrinth.com') || decoded.includes('curseforge.com')) {
        links.push(decoded)
      }
    } catch {
      // invalid base64, skip
    }
  }

  return [...new Set(links)]
}

export function parseModUrl(url: string): ModInfo | null {
  if (url.includes('modrinth.com')) return parseModrinthUrl(url)
  if (url.includes('curseforge.com')) return parseCurseforgeUrl(url)
  return null
}

export function isMcmodUrl(url: string): boolean {
  return /mcmod\.cn/.test(url)
}
