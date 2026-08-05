import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { mockFetchAPI } = vi.hoisted(() => ({ mockFetchAPI: vi.fn() }))
vi.mock('@/lib/api', () => ({ fetchAPI: mockFetchAPI }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { WhatsAppTemplatesPanel } from '../WhatsAppTemplatesPanel'

const CATALOG = [
  { key: 'contact.name', label: 'Nombre del lead', example: 'Juan Pérez' },
  { key: 'contact.phone', label: 'Teléfono del lead', example: '+56912345678' }
]

const EMPTY_LIST = { templates: [], openingTemplateId: null, technicalVisitTemplateId: null, visitConfirmationTemplateId: null }

beforeEach(() => {
  vi.clearAllMocks()
  mockFetchAPI.mockImplementation((endpoint: string) => {
    if (endpoint === '/messaging/whatsapp/templates/variable-catalog') return Promise.resolve({ catalog: CATALOG })
    if (endpoint === '/messaging/whatsapp/templates') return Promise.resolve(EMPTY_LIST)
    return Promise.resolve({})
  })
})

describe('WhatsAppTemplatesPanel — variable mapping', () => {
  it('renders one variable select per {{n}} detected in the body text', async () => {
    const user = userEvent.setup()
    render(<WhatsAppTemplatesPanel />)

    const body = await screen.findByLabelText(/Texto/i)
    await user.type(body, 'Hola {{{{1}}, tu contacto es {{{{2}}')

    await waitFor(() => {
      expect(screen.getAllByText('Elegir variable')).toHaveLength(2)
    })
  })

  it('blocks submit until every detected variable has a mapping selected', async () => {
    const user = userEvent.setup()
    render(<WhatsAppTemplatesPanel />)

    await user.type(await screen.findByLabelText(/^Nombre$/i), 'saludo_test')
    await user.type(await screen.findByLabelText(/Texto/i), 'Hola {{{{1}}')
    await user.click(screen.getByRole('button', { name: /crear y enviar a revisión/i }))

    expect(mockFetchAPI).not.toHaveBeenCalledWith('/messaging/whatsapp/templates', expect.objectContaining({ method: 'POST' }))
  })
})
