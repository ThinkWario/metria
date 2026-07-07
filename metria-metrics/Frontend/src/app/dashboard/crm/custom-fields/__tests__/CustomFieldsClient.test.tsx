import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { mockFetchAPI } = vi.hoisted(() => ({ mockFetchAPI: vi.fn() }))
vi.mock('@/lib/api', () => ({ fetchAPI: mockFetchAPI }))

import CustomFieldsClient from '../CustomFieldsClient'

beforeEach(() => vi.clearAllMocks())

describe('CustomFieldsClient', () => {
  it('lists existing custom field definitions', async () => {
    mockFetchAPI.mockResolvedValueOnce([{ id: 'cf-1', key: 'rut', label: 'RUT' }])
    render(<CustomFieldsClient />)
    expect(await screen.findByText('RUT')).toBeInTheDocument()
  })

  it('creates a new definition', async () => {
    mockFetchAPI
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({ id: 'cf-2', key: 'comuna', label: 'Comuna' })
      .mockResolvedValueOnce([{ id: 'cf-2', key: 'comuna', label: 'Comuna' }])
    const user = userEvent.setup()
    render(<CustomFieldsClient />)

    await user.type(await screen.findByPlaceholderText(/nombre del campo/i), 'Comuna')
    await user.click(screen.getByRole('button', { name: /agregar/i }))

    await waitFor(() => expect(mockFetchAPI).toHaveBeenCalledWith('/crm/custom-fields', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ label: 'Comuna' })
    })))
    expect(await screen.findByText('Comuna')).toBeInTheDocument()
  })

  it('deletes a definition', async () => {
    mockFetchAPI
      .mockResolvedValueOnce([{ id: 'cf-1', key: 'rut', label: 'RUT' }])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([])
    const user = userEvent.setup()
    render(<CustomFieldsClient />)

    await user.click(await screen.findByRole('button', { name: /eliminar rut/i }))

    await waitFor(() => expect(mockFetchAPI).toHaveBeenCalledWith('/crm/custom-fields/cf-1', expect.objectContaining({ method: 'DELETE' })))
  })
})
