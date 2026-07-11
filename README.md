# Mod Downloader Extension

Mod Downloader 桌面应用程序的浏览器扩展，从 MCMod、Modrinth、CurseForge 页面自动解析 Mod 信息。

[隐私政策 / Privacy Policy](https://link-fgfgui.github.io/mod-downloader-chrome-plugin/)

## 架构

```
src/
  types.ts              # 共享类型定义
  App.vue               # Popup 页面（主界面）
  Options.vue           # 选项页面（筛选条件编辑）
  options.ts            # 选项页入口
  main.ts               # Popup 入口
  style.css             # 全局样式
  background/
    service-worker.ts   # 后台逻辑（标签扫描、消息处理）
    url-parser.ts       # URL 解析工具函数
```

## 数据类型

```typescript
// 站点类型
type SiteType = 'mcmod' | 'modrinth' | 'curseforge'

// 解析后的 Mod 信息
interface ModInfo {
  platform: 'modrinth' | 'curseforge'
  slug: string           // Mod 标识符
  url: string            // 标准化 URL
  projectId: string | null // 平台项目 ID
  versionId: string | null // 指定的版本/文件 ID
  originalTabUrl?: string // 来源标签页 URL
}

// 扫描结果
interface ScanResult {
  mods: ModInfo[]
  errors: string[]
}
```

## 核心流程

```
Popup 按钮点击
    │
    ▼
chrome.runtime.sendMessage()
    │
    ▼
service-worker 接收消息
    │
    ├─ action: "scanAll"      → 扫描所有三个站点
    └─ action: "scanFiltered" → 按保存的窗口、标签页位置和站点筛选
    │
    ▼
scanAndSend()
    │
    ├─ 1. scanTabs() 遍历标签页
    │     │
    │     ▼
    │   processTab() 逐个处理
    │     ├─ mcmod.cn → 读取已打开 tab 的 HTML → 提取首个 modrinth/curseforge 链接 → 解析
    │     ├─ modrinth.com → 直接解析 URL + 从 canonical/body 补充 projectId/slug
    │     └─ curseforge.com → 直接解析 URL + 从 canonical/body 补充 projectId/slug
    │     │
    │     ▼
    │   去重（按 platform:slug:versionId）
    │
    └─ 2. sendToRemote() 发送 POST 请求
          │
          ▼
        POST http://127.0.0.1:18801
        Body: [{"p":"mr","id":null,"slug":"xxx","file":""}, ...]
```

## URL 解析规则

### Modrinth

匹配路径: `/mod/`

```
https://modrinth.com/mod/fabric-api → { platform: 'modrinth', slug: 'fabric-api' }
https://modrinth.com/mod/sodium/version/abc123 → { platform: 'modrinth', slug: 'sodium', versionId: 'abc123' }
```

直接打开的 Modrinth 页面会通过 `extractFromTab` 从页面 DOM 补充 `projectId`（canonical `/project/<base62>` / `maven.modrinth:<id>:` / `"project_id":"<base62>"`）与 `versionId`（canonical `/version/<id>` / `maven.modrinth:<id>:<versionId>`）。

### CurseForge

匹配路径: `/minecraft/mc-mods/`（支持 `www.curseforge.com` 与 `legacy.curseforge.com`）

```
https://www.curseforge.com/minecraft/mc-mods/jei → { platform: 'curseforge', slug: 'jei' }
https://www.curseforge.com/minecraft/mc-mods/jei/files/123456 → { platform: 'curseforge', slug: 'jei', versionId: '123456' }
https://legacy.curseforge.com/minecraft/mc-mods/jei → { platform: 'curseforge', slug: 'jei' }
```

直接打开的 CurseForge 页面会通过 `extractFromTab` 从页面 DOM 补充 `projectId`（`data-project-id` / `project-id` / `"identifier"` / `"projectId"` / `"project_id"` 多正则兜底）与 `versionId`（canonical `/files/<id>`，legacy 页面兜底 `Elerium.ProjectFileDetails.projectFileID`）。

### MCMod

不直接解析 URL，而是：
1. 检测 URL 含 `www.mcmod.cn`（仅匹配 www 子域，其他子域忽略）
2. 通过 `chrome.scripting.executeScript` 读取已打开 tab 的 `document.links`
3. 解析并筛选其中的外链：
   - 直接 `href="https://modrinth.com/..."` / `href="https://curseforge.com/..."`
   - 代理 `href="//link.mcmod.cn/target/<base64>"`，base64 解码后得到真实 URL
4. 按出现顺序取第一个能解析为 Modrinth/CurseForge 的链接（一个 mcmod 页面只产出一个 mod）

## 筛选配置

存储位置: `chrome.storage.local` key `filter`

```typescript
interface FilterConfig {
  windowId: number | null // null = 全部窗口
  sites: SiteType[]       // 启用的站点，默认全部
  tabStartIndex?: number | null // 仅扫描此标签页之后的标签页
}
```

选项页面（Options.vue）支持：
- 选择扫描窗口（全部 / 指定窗口）
- 选择从指定标签页之后开始扫描
- 勾选/取消站点（MCMod / Modrinth / CurseForge）
- 自动保存到 `chrome.storage.local`

Popup 的"发送所有页面"无视筛选条件扫描全部；Options 的"高级发送"按筛选条件扫描。

## 远程 API

扫描完成后自动向本地服务发送 POST 请求：

```
POST http://127.0.0.1:18801
Content-Type: application/json

[
  { "p": "mr", "id": null, "slug": "ae2",      "file": "" },
  { "p": "cf", "id": null, "slug": "jei",       "file": "123456" }
]
```

| 字段 | 说明 |
|------|------|
| `p`  | 平台代码：`mr` = Modrinth，`cf` = CurseForge |
| `id` | 项目 ID（Modrinth 为 base62 project-id，CurseForge 为数字 project-id，未提取到时为 `null`） |
| `slug` | Mod 标识符（URL 中的 slug） |
| `file` | 版本 ID（`versionId`，对应 Modrinth `/mod/<slug>/version/<id>` 或 CurseForge `/files/<id>`，未指定时为空串） |

## 权限

```json
{
  "permissions": ["storage", "tabs", "scripting", "windows"],
  "host_permissions": [
    "https://www.mcmod.cn/*",
    "https://modrinth.com/*",
    "https://www.curseforge.com/*",
    "https://legacy.curseforge.com/*",
    "http://127.0.0.1:18801/*"
  ]
}
```

- `storage`: 筛选配置持久化
- `tabs`: 查询所有标签页 URL
- `scripting`: 向已打开的 tab 注入脚本读取 DOM（取代 fetch）
- `windows`: 枚举窗口供 Options 页面选择
- `host_permissions`: 在 mcmod/modrinth/curseforge 页面注入脚本读取 DOM；`http://127.0.0.1:18801/*` 用于将解析后的 Mod 信息发送到本地运行的 Mod 下载工具（数据不离开本机）

## 开发

```bash
npm run dev     # 开发模式（热更新）
npm run build   # 构建到 dist/
```

加载扩展: Chrome → `chrome://extensions` → 开发者模式 → 加载已解包的扩展程序 → 选择 `dist/` 目录
