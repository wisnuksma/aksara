// Aplikasi terpasang (PWA): pendaftaran service worker dan tombol "Pasang".
import { useEffect, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'

type Listener = (s: PwaState) => void
export interface PwaState {
  needRefresh: boolean   // ada versi baru
  offlineReady: boolean  // baru saja siap dipakai tanpa internet
}

let state: PwaState = { needRefresh: false, offlineReady: false }
const listeners = new Set<Listener>()
const emit = (s: Partial<PwaState>) => { state = { ...state, ...s }; listeners.forEach((l) => l(state)) }

let update: ((reload?: boolean) => Promise<void>) | null = null
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  update = registerSW({
    onNeedRefresh: () => emit({ needRefresh: true }),
    onOfflineReady: () => emit({ offlineReady: true }),
  })
}

export function usePwa() {
  const [s, setS] = useState(state)
  useEffect(() => { listeners.add(setS); return () => { listeners.delete(setS) } }, [])
  return {
    ...s,
    reload: () => update?.(true),
    dismiss: () => emit({ needRefresh: false, offlineReady: false }),
  }
}

// ----- Tombol pasang (Chrome) -----
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}
let deferred: InstallPromptEvent | null = null
const installListeners = new Set<() => void>()
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  deferred = e as InstallPromptEvent
  installListeners.forEach((l) => l())
})
window.addEventListener('appinstalled', () => { deferred = null; installListeners.forEach((l) => l()) })

export const isInstalled = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: window-controls-overlay)').matches

export const isChrome = () => {
  const brands = (navigator as Navigator & { userAgentData?: { brands: { brand: string }[] } }).userAgentData?.brands
  return !!brands?.some((b) => /Chrom/.test(b.brand)) || /Chrome\//.test(navigator.userAgent) && !/Edg\//.test(navigator.userAgent)
}

export function useInstall() {
  const [, tick] = useState(0)
  useEffect(() => {
    const l = () => tick((n) => n + 1)
    installListeners.add(l)
    return () => { installListeners.delete(l) }
  }, [])
  return {
    canPrompt: !!deferred,
    install: async () => {
      if (!deferred) return false
      await deferred.prompt()
      const { outcome } = await deferred.userChoice
      deferred = null
      tick((n) => n + 1)
      return outcome === 'accepted'
    },
  }
}
