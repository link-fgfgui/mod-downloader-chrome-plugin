<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type { ModInfo, ScanResult } from './types'

const extensionName = ref('')
const loading = ref(false)
const results = ref<ModInfo[]>([])
const errors = ref<string[]>([])
const processed = ref(false)
const copied = ref(false)

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
  copied.value = false
  results.value = []
  errors.value = []

  try {
    const response: ScanResult = await chrome.runtime.sendMessage({ action: 'scanAll' })
    results.value = response.mods
    errors.value = response.errors
    if (response.mods.length) {
      copied.value = await copyToClipboard(response.mods)
      if (!copied.value) errors.value.push('复制到剪贴板失败')
    }
  } catch (e) {
    errors.value = [`错误: ${e instanceof Error ? e.message : String(e)}`]
  } finally {
    loading.value = false
    processed.value = true
  }
}

async function copyToClipboard(mods: ModInfo[]): Promise<boolean> {
  try {
    const text = mods.map(m => m.url).join('\n')
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
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
        {{ loading ? '处理中...' : '发送所有页面' }}
      </button>
    </section>

    <button type="button" class="link-btn" @click="openOptions">编辑筛选条件</button>

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
.popup {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
  width: 340px;
  min-height: 180px;
  background: #f6f8fb;
}

.header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.logo {
  width: 36px;
  height: 36px;
}

h1 {
  margin: 0;
  font-size: 16px;
  color: #17202a;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.btn-primary {
  width: 100%;
  padding: 10px;
  border: 0;
  border-radius: 8px;
  background: #1f7a5f;
  color: #fff;
  font-weight: 700;
  font-size: 14px;
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
  border-radius: 8px;
  background: #fff;
  overflow: hidden;
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
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
  max-height: 160px;
  overflow-y: auto;
}

.mod-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
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
</style>
