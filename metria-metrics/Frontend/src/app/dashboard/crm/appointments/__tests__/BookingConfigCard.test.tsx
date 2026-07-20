import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { mockFetchAPI } = vi.hoisted(() => ({ mockFetchAPI: vi.fn() }))
vi.mock('@/lib/api', () => ({ fetchAPI: mockFetchAPI }))

import { BookingConfigCard } from '../BookingConfigCard'

beforeEach(() => {
  vi.clearAllMocks()
  mockFetchAPI.mockResolvedValue({
    bookingSlug: 'drillchile', bookingTitle: 'Agenda tu visita', bookingDurationMin: 30, notifyPhone: null
  })
})

describe('BookingConfigCard — notifyPhone', () => {
  it('shows the placeholder and loads an existing notifyPhone value', async () => {
    mockFetchAPI.mockResolvedValueOnce({
      bookingSlug: 'drillchile', bookingTitle: 'Agenda tu visita', bookingDurationMin: 30, notifyPhone: '+56912345678'
    })
    render(<BookingConfigCard />)

    const input = await screen.findByPlaceholderText('+56 9 1234 5678')
    expect(input).toHaveValue('+56912345678')
  })

  it('sends the trimmed notifyPhone on save', async () => {
    const user = userEvent.setup()
    render(<BookingConfigCard />)

    const input = await screen.findByPlaceholderText('+56 9 1234 5678')
    fireEvent.change(input, { target: { value: '+56 9 8888 7777' } })

    mockFetchAPI.mockResolvedValueOnce({
      bookingSlug: 'drillchile', bookingTitle: 'Agenda tu visita', bookingDurationMin: 30, notifyPhone: '+56 9 8888 7777'
    })
    await user.click(screen.getByRole('button', { name: /guardar cambios/i }))

    await waitFor(() => {
      expect(mockFetchAPI).toHaveBeenCalledWith('/scheduling/booking-config', expect.objectContaining({
        method: 'PATCH',
        body: expect.stringContaining('"notifyPhone":"+56 9 8888 7777"')
      }))
    })
  })
})
