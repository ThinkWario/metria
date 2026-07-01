import type { Deal } from '@/components/crm/CreateDealModal'

export type SortColumn = 'title' | 'contact' | 'value' | 'stage' | 'probability' | 'expectedCloseAt'
export type SortDirection = 'asc' | 'desc'

export function sortDeals(deals: Deal[], column: SortColumn, direction: SortDirection): Deal[] {
  const factor = direction === 'asc' ? 1 : -1
  return [...deals].sort((a, b) => {
    switch (column) {
      case 'title':
        return a.title.localeCompare(b.title) * factor
      case 'contact':
        return a.contact.name.localeCompare(b.contact.name) * factor
      case 'value':
        return (parseFloat(a.value) - parseFloat(b.value)) * factor
      case 'stage':
        return a.stage.name.localeCompare(b.stage.name) * factor
      case 'probability':
        return ((a.probability ?? 0) - (b.probability ?? 0)) * factor
      case 'expectedCloseAt': {
        const aTime = a.expectedCloseAt ? new Date(a.expectedCloseAt).getTime() : 0
        const bTime = b.expectedCloseAt ? new Date(b.expectedCloseAt).getTime() : 0
        return (aTime - bTime) * factor
      }
      default:
        return 0
    }
  })
}
