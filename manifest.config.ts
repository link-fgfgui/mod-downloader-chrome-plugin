import type { ManifestV3Export } from '@crxjs/vite-plugin'

const manifest: ManifestV3Export = {
  manifest_version: 3,
  name: '__MSG_extName__',
  description: '__MSG_extDescription__',
  version: '0.1.0',
  default_locale: 'zh_CN',
  action: {
    default_popup: 'index.html',
    default_title: '__MSG_extName__',
  },
  icons: {
    16: 'icons/icon-16.png',
    32: 'icons/icon-32.png',
    48: 'icons/icon-48.png',
    128: 'icons/icon-128.png',
  },
  background: {
    service_worker: 'src/background/service-worker.ts',
    type: 'module',
  },
  permissions: ['storage', 'tabs', 'scripting', 'windows'],
  host_permissions: ['https://www.mcmod.cn/*', 'https://modrinth.com/*', 'https://www.curseforge.com/*', 'https://legacy.curseforge.com/*', 'http://127.0.0.1:18801/*'],
  options_ui: {
    page: 'options.html',
    open_in_tab: true,
  },
}

export default manifest
