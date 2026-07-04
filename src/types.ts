export interface ModInfo {
  platform: 'modrinth' | 'curseforge'
  slug: string
  url: string
  projectId: string | null
  versionId: string | null
  originalTabUrl?: string
}

export type SiteType = 'mcmod' | 'modrinth' | 'curseforge'

export interface FilterConfig {
  windowId: number | null
  sites: SiteType[]
  tabStartIndex?: number | null
}

export type MessageAction = 'scanAll' | 'scanFiltered'

export interface ScanMessage {
  action: MessageAction
  force?: boolean
}

export interface ScanResult {
  mods: ModInfo[]
  errors: string[]
  needConfirm?: boolean
  suspendedTabs?: string[]
}

export const ALL_SITES: SiteType[] = ['mcmod', 'modrinth', 'curseforge']

export const SITE_LABELS: Record<SiteType, string> = {
  mcmod: 'MCMod',
  modrinth: 'Modrinth',
  curseforge: 'CurseForge',
}
