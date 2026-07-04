<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import type { FilterConfig, ModInfo, ScanResult, SiteType } from './types'
import { ALL_SITES, SITE_LABELS } from './types'
import { t, foundMods, windowLabel, confirmSend } from './i18n'

interface WinInfo {
  id: number
  label: string
}

interface TabInfo {
  index: number
  title: string
}

const windows = ref<WinInfo[]>([])
const windowId = ref<number | null>(null)
const tabStartIndex = ref<number | null>(null)
const tabsInWindow = ref<TabInfo[]>([])
const sites = ref<SiteType[]>([...ALL_SITES])
const loading = ref(false)
const results = ref<ModInfo[]>([])
const errors = ref<string[]>([])
const processed = ref(false)
const pendingSuspended = ref<string[] | null>(null)
const skippedTabs = ref<string[]>([])

async function refreshTabs(winId: number | null) {
  if (winId == null) {
    tabsInWindow.value = []
    tabStartIndex.value = null
    return
  }
  const tabs = await chrome.tabs.query({ windowId: winId })
  tabsInWindow.value = tabs
    .filter(tab => tab.index != null)
    .map(tab => ({ index: tab.index!, title: tab.title || tab.url || '(no title)' }))
    .sort((a, b) => a.index - b.index)
  // 越界重置
  if (tabStartIndex.value != null && tabStartIndex.value >= tabsInWindow.value.length) {
    tabStartIndex.value = null
  }
}

onMounted(async () => {
  const wins = await chrome.windows.getAll()
  windows.value = wins.map((w, i) => ({
    id: w.id!,
    label: `${windowLabel(i + 1)}${w.focused ? ` (${t.current})` : ''}`,
  }))

  const data = await chrome.storage.local.get('filter')
  const filter = data.filter as FilterConfig | undefined
  if (filter) {
    windowId.value = filter.windowId
    sites.value = filter.sites.length > 0 ? [...filter.sites] : [...ALL_SITES]
    tabStartIndex.value = filter.tabStartIndex ?? null
  }
  await refreshTabs(windowId.value)
})

watch(windowId, async (newWin) => {
  await refreshTabs(newWin)
  saveFilter()
})

function saveFilter() {
  const filter: FilterConfig = {
    windowId: windowId.value,
    sites: sites.value,
    tabStartIndex: windowId.value == null ? null : tabStartIndex.value,
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
  results.value = []
  errors.value = []
  pendingSuspended.value = null
  skippedTabs.value = []

  try {
    let response: ScanResult = await chrome.runtime.sendMessage({ action: 'scanFiltered' })
    if (response.needConfirm && response.suspendedTabs?.length) {
      pendingSuspended.value = response.suspendedTabs
      loading.value = false
      return
    }
    results.value = response.mods
    errors.value = response.errors
    skippedTabs.value = response.suspendedTabs ?? []
  } catch (e) {
    errors.value = [`${t.errorPrefix}: ${e instanceof Error ? e.message : String(e)}`]
  } finally {
    loading.value = false
    processed.value = true
  }
}

async function acceptConfirm() {
  pendingSuspended.value = null
  loading.value = true
  try {
    const response: ScanResult = await chrome.runtime.sendMessage({ action: 'scanFiltered', force: true })
    results.value = response.mods
    errors.value = response.errors
    skippedTabs.value = response.suspendedTabs ?? []
  } catch (e) {
    errors.value = [`${t.errorPrefix}: ${e instanceof Error ? e.message : String(e)}`]
  } finally {
    loading.value = false
    processed.value = true
  }
}

function cancelConfirm() {
  pendingSuspended.value = null
  processed.value = true
  results.value = []
  errors.value = []
  skippedTabs.value = []
}
</script>

<template>
  <main class="options-page">
    <h1>Mod Downloader</h1>
    <p class="subtitle">{{ t.subtitle }}</p>

    <section class="filter-section">
      <div class="filter-row">
        <label class="filter-label">{{ t.scanWindow }}</label>
        <select class="filter-select" v-model="windowId" @change="saveFilter">
          <option :value="null">{{ t.allWindows }}</option>
          <option v-for="w in windows" :key="w.id" :value="w.id">{{ w.label }}</option>
        </select>
      </div>

      <div v-if="windowId != null" class="filter-row">
        <label class="filter-label">{{ t.startAfterTab }}</label>
        <select class="filter-select" v-model="tabStartIndex" @change="saveFilter">
          <option :value="null">{{ t.fromBeginning }}</option>
          <option v-for="tab in tabsInWindow" :key="tab.index" :value="tab.index">
            {{ tab.index + 1 }}. {{ tab.title.length > 45 ? tab.title.slice(0, 45) + '...' : tab.title }}
          </option>
        </select>
      </div>

      <div class="filter-row">
        <label class="filter-label">{{ t.scanSites }}</label>
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
      {{ loading ? t.processing : t.advancedSend }}
    </button>

    <section v-if="processed" class="results">
      <div v-if="skippedTabs.length" class="skipped-warning">
        <p v-for="u in skippedTabs" :key="u" class="skipped-item">{{ u }}: {{ t.tabSuspended }}</p>
      </div>

      <div class="result-header">
        <span class="result-count">{{ foundMods(results.length) }}</span>
      </div>

      <ul v-if="results.length" class="mod-list">
        <li v-for="(mod, i) in results" :key="i" class="mod-item">
          <span class="platform-badge" :class="mod.platform">
            {{ mod.platform === 'modrinth' ? 'MR' : 'CF' }}
          </span>
          <a :href="mod.url" target="_blank" class="mod-slug">{{ mod.slug }}</a>
        </li>
      </ul>
      <p v-else class="empty">{{ t.noMods }}</p>

      <div v-if="errors.length" class="errors">
        <p v-for="(err, i) in errors" :key="i" class="error-item">{{ err }}</p>
      </div>
    </section>

    <div v-if="pendingSuspended" class="modal-overlay" @click.self="cancelConfirm">
      <div class="modal">
        <pre class="modal-text">{{ confirmSend(pendingSuspended) }}</pre>
        <div class="modal-actions">
          <button class="btn-cancel" @click="cancelConfirm">{{ t.cancel }}</button>
          <button class="btn-send btn-confirm" @click="acceptConfirm">{{ t.confirm }}</button>
        </div>
      </div>
    </div>
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
  min-width: 160px;
  max-width: 100%;
  padding: 8px 12px;
  border: 1px solid #dbe4ed;
  border-radius: 6px;
  font-size: 13px;
  background: #fff;
  color: #17202a;
  cursor: pointer;
  outline: none;
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
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

.skipped-warning {
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 6px;
  padding: 8px 10px;
  margin-bottom: 10px;
}

.skipped-item {
  font-size: 12px;
  color: #dc2626;
  margin: 0 0 3px;
  word-break: break-all;
}

.skipped-item:last-child { margin-bottom: 0; }

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal {
  background: #fff;
  border-radius: 10px;
  padding: 20px;
  width: 420px;
  max-width: 90vw;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
}

.modal-text {
  margin: 0 0 16px;
  font-size: 13px;
  white-space: pre-wrap;
  word-break: break-all;
  color: #333;
  font-family: inherit;
}

.modal-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

.btn-cancel {
  padding: 8px 16px;
  border: 1px solid #dbe4ed;
  border-radius: 6px;
  background: #fff;
  color: #557086;
  font-size: 13px;
  cursor: pointer;
}

.btn-cancel:hover { background: #f6f8fb; }

.btn-confirm { margin-bottom: 0; }
</style>
