import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConversationList } from '../ConversationList'

const conv1 = {
  id: 'conv-1', status: 'OPEN' as const, messageCount: 1, isHandledByBot: true, unreadCount: 0,
  contact: { id: 'contact-1', name: 'Ana', phone: '+56900000001', status: 'LEAD', ltv: 0, source: 'MANUAL' },
  channel: { id: 'ch-1', platform: 'WHATSAPP', name: 'WhatsApp' }, createdAt: '2026-01-01T00:00:00.000Z'
}

function renderList(onDeleteConversation = vi.fn()) {
  render(
    <ConversationList
      conversations={[conv1]}
      selectedId={null}
      loading={false}
      onSelect={vi.fn()}
      statusFilter="OPEN"
      onStatusFilterChange={vi.fn()}
      search=""
      onSearchChange={vi.fn()}
      assignedToMe={false}
      onAssignedToMeChange={vi.fn()}
      onMarkAsUnread={vi.fn()}
      onDeleteConversation={onDeleteConversation}
    />
  )
  return { onDeleteConversation }
}

beforeEach(() => vi.clearAllMocks())

describe('ConversationList — delete conversation', () => {
  it('opens a confirm modal and calls onDeleteConversation only after confirming', async () => {
    const user = userEvent.setup()
    const { onDeleteConversation } = renderList()

    await user.click(screen.getByRole('button', { name: 'Opciones de conversación' }))
    await user.click(await screen.findByText('Eliminar conversación'))

    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('¿Eliminar conversación?')).toBeInTheDocument()
    expect(onDeleteConversation).not.toHaveBeenCalled()

    await user.click(within(dialog).getByRole('button', { name: 'Eliminar' }))

    expect(onDeleteConversation).toHaveBeenCalledWith('conv-1')
  })

  it('does not call onDeleteConversation when the modal is cancelled', async () => {
    const user = userEvent.setup()
    const { onDeleteConversation } = renderList()

    await user.click(screen.getByRole('button', { name: 'Opciones de conversación' }))
    await user.click(await screen.findByText('Eliminar conversación'))

    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))

    expect(onDeleteConversation).not.toHaveBeenCalled()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('shows the 3-dot menu even when the conversation has unread messages', async () => {
    const user = userEvent.setup()
    render(
      <ConversationList
        conversations={[{ ...conv1, unreadCount: 3 }]}
        selectedId={null}
        loading={false}
        onSelect={vi.fn()}
        statusFilter="OPEN"
        onStatusFilterChange={vi.fn()}
        search=""
        onSearchChange={vi.fn()}
        assignedToMe={false}
        onAssignedToMeChange={vi.fn()}
        onMarkAsUnread={vi.fn()}
        onDeleteConversation={vi.fn()}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Opciones de conversación' }))

    expect(await screen.findByText('Eliminar conversación')).toBeInTheDocument()
    expect(screen.queryByText('Marcar como no leído')).not.toBeInTheDocument()
  })
})
