/**
 * Canonical set of hideable UI surfaces a SUPER_ADMIN can toggle off per
 * workspace (nav items in the sidebar, integration cards in Configuración
 * Técnica). Namespaced so both surfaces share one flat list on Workspace.
 */
export const HIDEABLE_MENU_KEYS = [
  'nav:control-center',
  'nav:inbox',
  'nav:ai-agent',
  'nav:messaging-channels',
  'nav:finances',
  'nav:sales-channels',
  'nav:meta-ads',
  'nav:google-ads',
  'nav:tiktok-ads',
  'nav:logistics',
  'nav:tech-settings',
  'integration:whatsapp',
  'integration:google',
  'integration:shopify',
] as const

export type HideableMenuKey = typeof HIDEABLE_MENU_KEYS[number]

export function isValidMenuKey(key: string): key is HideableMenuKey {
  return (HIDEABLE_MENU_KEYS as readonly string[]).includes(key)
}
