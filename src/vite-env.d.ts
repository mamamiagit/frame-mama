/// <reference types="vite/client" />
interface Window { frame?: { getAppInfo: () => Promise<{ version: string; platform: string }>; openYouTube: () => Promise<void> } }
