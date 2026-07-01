/**
 * Mirrors Backend/src/lib/menuVisibility.ts's HIDEABLE_MENU_KEYS. Used by
 * the superadmin toggle UI (Task 5) to render human labels; app-sidebar.tsx
 * and integration-hub.tsx only need the filter function below.
 */
export const HIDEABLE_MENU_KEYS: { key: string; label: string }[] = [
  { key: 'nav:control-center', label: 'Centro de Control' },
  { key: 'nav:inbox', label: 'Inbox (Chats)' },
  { key: 'nav:ai-agent', label: 'Agente IA' },
  { key: 'nav:messaging-channels', label: 'Canales de Mensajería' },
  { key: 'nav:finances', label: 'Finanzas E-commerce' },
  { key: 'nav:sales-channels', label: 'Canales de Venta' },
  { key: 'nav:meta-ads', label: 'Meta Ads' },
  { key: 'nav:google-ads', label: 'Google Ads (Beta)' },
  { key: 'nav:tiktok-ads', label: 'TikTok Ads' },
  { key: 'nav:logistics', label: 'Logística & Operaciones' },
  { key: 'nav:tech-settings', label: 'Configuración Técnica' },
  { key: 'integration:whatsapp', label: 'WhatsApp Native (integración)' },
  { key: 'integration:google', label: 'Google Ads (integración)' },
  { key: 'integration:shopify', label: 'Shopify Store (integración)' },
]

export function filterHiddenItems<T extends { key: string }>(items: T[], hiddenKeys: string[]): T[] {
  if (hiddenKeys.length === 0) return items
  return items.filter((item) => !hiddenKeys.includes(item.key))
}
