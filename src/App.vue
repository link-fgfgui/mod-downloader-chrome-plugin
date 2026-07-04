<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type { ModInfo, ScanResult } from './types'
import { t, foundMods, confirmSend } from './i18n'

const extensionName = ref('')
const loading = ref(false)
const results = ref<ModInfo[]>([])
const errors = ref<string[]>([])
const processed = ref(false)
const pendingSuspended = ref<string[] | null>(null)
const skippedTabs = ref<string[]>([])

onMounted(async () => {
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    const manifest = chrome.runtime.getManifest()
    extensionName.value = manifest.name
  } else {
    extensionName.value = 'Mod Downloader'
  }
})

async function processAll() {
  loading.value = true
  processed.value = false
  results.value = []
  errors.value = []
  pendingSuspended.value = null
  skippedTabs.value = []

  try {
    let response: ScanResult = await chrome.runtime.sendMessage({ action: 'scanAll' })
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
    const response: ScanResult = await chrome.runtime.sendMessage({ action: 'scanAll', force: true })
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

function openOptions() {
  chrome.runtime.openOptionsPage()
}
</script>

<template>
  <main class="popup">
    <section class="header">
      <img class="logo" src="/icons/icon-128.png" alt="" />
      <div>
        <h1>{{ extensionName }}</h1>
      </div>
    </section>

    <section class="actions">
      <button type="button" class="btn-primary" :disabled="loading" @click="processAll">
        {{ loading ? t.processing : t.sendAll }}
      </button>
    </section>

    <button type="button" class="link-btn" @click="openOptions">{{ t.advancedSend }}</button>

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
          <button class="btn-primary" @click="acceptConfirm">{{ t.confirm }}</button>
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped>
.popup {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
  width: 280px;
  background: #f6f8fb;
}

.header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.logo {
  width: 28px;
  height: 28px;
}

h1 {
  margin: 0;
  font-size: 14px;
  color: #17202a;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.btn-primary {
  width: 100%;
  padding: 8px;
  border: 0;
  border-radius: 6px;
  background: #1f7a5f;
  color: #fff;
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
}

.btn-primary:hover { background: #17684f; }
.btn-primary:disabled { background: #94b8a8; cursor: default; }

.link-btn {
  background: none;
  border: none;
  color: #557086;
  font-size: 12px;
  cursor: pointer;
  text-align: left;
  padding: 0;
}

.link-btn:hover { color: #1f7a5f; }

.results {
  border: 1px solid #dbe4ed;
  border-radius: 6px;
  background: #fff;
  overflow: hidden;
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 10px;
  border-bottom: 1px solid #f0f0f0;
}

.result-count {
  font-size: 12px;
  font-weight: 700;
  color: #17202a;
}

.mod-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 140px;
  overflow-y: auto;
}

.mod-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  font-size: 12px;
  border-bottom: 1px solid #f5f5f5;
}

.mod-item:last-child { border-bottom: none; }

.platform-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 16px;
  border-radius: 3px;
  font-size: 9px;
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
  padding: 12px;
  text-align: center;
  color: #999;
  font-size: 13px;
}

.errors {
  padding: 8px 12px;
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
  padding: 6px 8px;
  margin-bottom: 8px;
}

.skipped-item {
  font-size: 11px;
  color: #dc2626;
  margin: 0 0 2px;
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
  border-radius: 8px;
  padding: 14px;
  width: 260px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
}

.modal-text {
  margin: 0 0 12px;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
  color: #333;
  font-family: inherit;
}

.modal-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.btn-cancel {
  padding: 6px 12px;
  border: 1px solid #dbe4ed;
  border-radius: 6px;
  background: #fff;
  color: #557086;
  font-size: 12px;
  cursor: pointer;
}

.btn-cancel:hover { background: #f6f8fb; }
</style>
