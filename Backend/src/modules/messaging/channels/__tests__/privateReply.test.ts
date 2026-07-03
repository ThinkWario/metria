import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sendPrivateReply } from '../privateReply'

beforeEach(() => vi.stubGlobal('fetch', vi.fn()))
afterEach(() => vi.restoreAllMocks())

describe('sendPrivateReply', () => {
  it('posts a private reply to the given comment id', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, status: 200, json: async () => ({}) } as Response)

    await sendPrivateReply('page-token-123', 'comment-456', 'Hola! Te escribimos por privado 🙌')

    expect(fetch).toHaveBeenCalledWith(
      'https://graph.facebook.com/v19.0/comment-456/private_replies',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer page-token-123' }),
        body: JSON.stringify({ message: 'Hola! Te escribimos por privado 🙌' })
      })
    )
  })

  it('throws with the response body when the API call fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 400, text: async () => 'Bad Request' } as Response)

    await expect(sendPrivateReply('page-token-123', 'comment-456', 'Hola'))
      .rejects.toThrow('Private reply API error 400: Bad Request')
  })
})
