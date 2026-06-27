<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type { FilterConfig, ModInfo, ScanResult, SiteType } from './types'
import { ALL_SITES, SITE_LABELS } from './types'

interface WinInfo {
  id: number
  label: string
}

const windows = ref<WinInfo[]>([])
const windowId = ref<number | null>(null)
const sites = ref<SiteType[]>([...ALL_SITES])
const loading = ref(false)
const results = ref<ModInfo[]>([])
const errors = ref<string[]>([])
const processed = ref(false)
const copied = ref(false)

onMounted(async () => {
  const wins = await chrome.windows.getAll()
  windows.value = wins.map((w, i) => ({
    id: w.id!,
    label: `窗口 ${i + 1}${w.focused ? ' (当前)' : ''}`,
  }))

  const data = await chrome.storage.local.get('filter')
  const filter = data.filter as FilterConfig | undefined
  if (filter) {
    windowId.value = filter.windowId
    sites.value = filter.sites.length > 0 ? [...filter.sites] : [...ALL_SITES]
  }
})

function saveFilter() {
  const filter: FilterConfig = {
    windowId: windowId.value,
    sites: sites.value,
  }
  chrome.storage.local.set({ filter })
}

function toggleSite(site: SiteType) {
  const idx = sites.value.indexOf(site)
  if (idx >= 0) {
    sites.value.splice(idx, 1)
  } else {
    sites.value.push(site)
  }
  saveFilter()
}

async function sendFiltered() {
  saveFilter()
  loading.value = true
  processed.value = false
  copied.value = false
  results.value = []
  errors.value = []

  try {
    const response: ScanResult = await chrome.runtime.sendMessage({ action: 'scanFiltered' })
    results.value = response.mods
    errors.value = response.errors
    if (response.mods.length) {
      try {
        const text = response.mods.map(m => m.url).join('\n')
        await navigator.clipboard.writeText(text)
        copied.value = true
      } catch {
        errors.value.push('复制到剪贴板失败')
      }
    }
  } catch (e) {
    errors.value = [`错误: ${e instanceof Error ? e.message : String(e)}`]
  } finally {
    loading.value = false
    processed.value = true
  }
}
</script>

<template>
  <main class="options-page">
    <h1>Mod Downloader</h1>
    <p class="subtitle">配置筛选条件后发送。</p>

    <section class="filter-section">
      <div class="filter-row">
        <label class="filter-label">扫描窗口</label>
        <select class="filter-select" v-model="windowId" @change="saveFilter">
          <option :value="null">全部窗口</option>
          <option v-for="w in windows" :key="w.id" :value="w.id">{{ w.label }}</option>
        </select>
      </div>

      <div class="filter-row">
        <label class="filter-label">扫描站点</label>
        <div class="site-checks">
          <label v-for="site in ALL_SITES" :key="site" class="checkbox-label">
            <input
              type="checkbox"
              :checked="sites.includes(site)"
              @change="toggleSite(site)"
            />
            <span>{{ SITE_LABELS[site] }}</span>
          </label>
        </div>
      </div>
    </section>

    <button class="btn-send" :disabled="loading || sites.length === 0" @click="sendFiltered">
      {{ loading ? '处理中...' : '高级发送' }}
    </button>

    <section v-if="processed" class="results">
      <div class="result-header">
        <span class="result-count">找到 {{ results.length }} 个 Mod</span>
        <span v-if="results.length && copied" class="copied">已复制到剪贴板</span>
      </div>

      <ul v-if="results.length" class="mod-list">
        <li v-for="(mod, i) in results" :key="i" class="mod-item">
          <span class="platform-badge" :class="mod.platform">
            {{ mod.platform === 'modrinth' ? 'MR' : 'CF' }}
          </span>
          <a :href="mod.url" target="_blank" class="mod-slug">{{ mod.slug }}</a>
        </li>
      </ul>
      <p v-else class="empty">未找到相关 Mod 页面</p>

      <div v-if="errors.length" class="errors">
        <p v-for="(err, i) in errors" :key="i" class="error-item">{{ err }}</p>
      </div>
    </section>
  </main>
</template>

<style scoped>
.options-page {
  max-width: 640px;
  margin: 0 auto;
  padding: 32px 24px;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  color: #17202a;
  background: #f6f8fb;
  min-height: 100vh;
}

h1 {
  margin: 0 0 4px;
  font-size: 22px;
}

.subtitle {
  margin: 0 0 24px;
  color: #557086;
  font-size: 14px;
}

.filter-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 20px;
  background: #fff;
  border: 1px solid #dbe4ed;
  border-radius: 10px;
  padding: 16px;
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.filter-label {
  font-size: 13px;
  font-weight: 600;
  color: #557086;
  flex-shrink: 0;
  min-width: 72px;
}

.filter-select {
  flex: 1;
  padding: 8px 10px;
  border: 1px solid #dbe4ed;
  border-radius: 6px;
  font-size: 13px;
  background: #fff;
  color: #17202a;
  cursor: pointer;
  outline: none;
}

.filter-select:focus {
  border-color: #1f7a5f;
}

.site-checks {
  display: flex;
  gap: 16px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
  cursor: pointer;
}

.checkbox-label input {
  accent-color: #1f7a5f;
}

.btn-send {
  width: 100%;
  padding: 12px;
  border: 0;
  border-radius: 8px;
  background: #1f7a5f;
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s;
  margin-bottom: 20px;
}

.btn-send:hover:not(:disabled) { background: #17684f; }
.btn-send:disabled { background: #94b8a8; cursor: default; }

.results {
  background: #fff;
  border: 1px solid #dbe4ed;
  border-radius: 10px;
  overflow: hidden;
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  border-bottom: 1px solid #f0f0f0;
}

.result-count {
  font-size: 13px;
  font-weight: 700;
  color: #17202a;
}

.copied {
  font-size: 11px;
  color: #1f7a5f;
}

.mod-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 400px;
  overflow-y: auto;
}

.mod-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  font-size: 13px;
  border-bottom: 1px solid #f5f5f5;
}

.mod-item:last-child { border-bottom: none; }

.platform-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 18px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 800;
  color: #fff;
  flex-shrink: 0;
}

.platform-badge.modrinth { background: #1bd96a; }
.platform-badge.curseforge { background: #f16436; }

.mod-slug {
  color: #333;
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mod-slug:hover { color: #1f7a5f; }

.empty {
  padding: 16px;
  text-align: center;
  color: #999;
  font-size: 13px;
}

.errors {
  padding: 8px 16px;
  border-top: 1px solid #fee2e2;
}

.error-item {
  font-size: 11px;
  color: #dc2626;
  margin: 0 0 4px;
}
</style>
