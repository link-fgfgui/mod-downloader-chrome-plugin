# Mod Downloader Chrome Extension

从 MCMod、Modrinth、CurseForge 页面自动解析 Mod 信息的 Chrome 扩展。

## 架构

```
src/
  types.ts              # 共享类型定义
  App.vue               # Popup 页面（主界面）
  Options.vue           # 选项页面（预设编辑）
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
  originalTabUrl?: string // 来源标签页 URL
}

// 预设配置
interface Preset {
  id: string
  name: string
  sites: SiteType[]      // 包含的站点列表
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
    └─ action: "scanByPreset" → 按预设站点筛选
    │
    ▼
scanAndSend()
    │
    ├─ 1. scanTabs() 遍历标签页
    │     │
    │     ▼
    │   processTab() 逐个处理
    │     ├─ mcmod.cn → fetch HTML → 提取 modrinth/curseforge 链接 → 解析
    │     ├─ modrinth.com → 直接解析 URL
    │     └─ curseforge.com → 直接解析 URL
    │     │
    │     ▼
    │   去重（按 platform:slug）
    │
    └─ 2. sendToRemote() 发送 POST 请求
          │
          ▼
        POST http://127.0.0.1:18801
        Body: [{"p":"mr","id":null,"slug":"xxx","file":"xxx"}, ...]
```

## URL 解析规则

### Modrinth

匹配路径: `/mod/`

```
https://modrinth.com/mod/fabric-api → { platform: 'modrinth', slug: 'fabric-api' }
https://modrinth.com/mod/sodium/version/abc123 → { platform: 'modrinth', slug: 'sodium', versionId: 'abc123' }
```

### CurseForge

匹配路径: `/minecraft/mc-mods/`

```
https://www.curseforge.com/minecraft/mc-mods/jei → { platform: 'curseforge', slug: 'jei' }
```

### MCMod

不直接解析 URL，而是：
1. 检测 `mcmod.cn` 域名
2. Fetch 页面 HTML
3. 正则提取所有 `href` 中包含 `modrinth.com` 或 `curseforge.com` 的链接
4. 对提取的链接套用上述 Modrinth/CurseForge 解析

## 预设管理

存储位置: `chrome.storage.local` key `presets`

默认预设:
| ID | 名称 | 站点 |
|---|---|---|
| all | 全部站点 | mcmod, modrinth, curseforge |
| modrinth | Modrinth | modrinth |
| curseforge | CurseForge | curseforge |
| mcmod | MCMod | mcmod |

选项页面支持:
- 添加/删除预设
- 双击名称重命名
- 勾选/取消站点复选框
- 自动保存

## 远程 API

扫描完成后自动向本地服务发送 POST 请求：

```
POST http://127.0.0.1:18801
Content-Type: application/json

[
  { "p": "mr", "id": null, "slug": "ae2",      "file": "ae2" },
  { "p": "cf", "id": null, "slug": "jei",       "file": "jei" }
]
```

| 字段 | 说明 |
|------|------|
| `p`  | 平台代码：`mr` = Modrinth，`cf` = CurseForge |
| `id` | 保留字段，当前为 `null` |
| `slug` | Mod 标识符 |
| `file` | 文件名（当前与 slug 相同） |

## 权限

```json
{
  "permissions": ["storage", "tabs"],
  "host_permissions": ["https://mcmod.cn/*", "http://127.0.0.1:18801/*"]
}
```

- `storage`: 预设持久化
- `tabs`: 查询所有标签页 URL
- `host_permissions`: fetch mcmod.cn 页面 + 发送 POST 到本地服务

## 开发

```bash
npm run dev     # 开发模式（热更新）
npm run build   # 构建到 dist/
```

加载扩展: Chrome → `chrome://extensions` → 开发者模式 → 加载已解包的扩展程序 → 选择 `dist/` 目录
