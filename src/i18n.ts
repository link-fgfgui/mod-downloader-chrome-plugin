// 封装 chrome.i18n.getMessage，提供组件用的 t 对象与带参函数
function msg(key: string, substitutions?: string[]): string {
  if (typeof chrome !== 'undefined' && chrome.i18n) {
    return chrome.i18n.getMessage(key, substitutions) || key
  }
  return key
}

export const t = {
  sendAll: msg('sendAll'),
  advancedSend: msg('advancedSend'),
  processing: msg('processing'),
  noMods: msg('noMods'),
  errorPrefix: msg('errorPrefix'),
  subtitle: msg('subtitle'),
  scanWindow: msg('scanWindow'),
  allWindows: msg('allWindows'),
  scanSites: msg('scanSites'),
  current: msg('current'),
  cancel: msg('cancel'),
  confirm: msg('confirm'),
  tabSuspended: msg('tabSuspended'),
  startAfterTab: msg('startAfterTab'),
  fromBeginning: msg('fromBeginning'),
}

export function foundMods(n: number): string {
  return msg('foundMods', [String(n)])
}

export function windowLabel(n: number): string {
  return msg('windowLabel', [String(n)])
}

export function confirmSend(tabs: string[]): string {
  return msg('confirmSend', [tabs.join('\n')])
}
