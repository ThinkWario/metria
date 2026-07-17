import { describe, it, expect, vi, beforeEach } from 'vitest'

const startChatMock = vi.fn()
const sendMessageMock = vi.fn()
const getGenerativeModelMock = vi.fn()

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel(...args: unknown[]) {
      return getGenerativeModelMock(...args)
    }
  }
}))

import { geminiProvider, transcribeAudio } from '../providers/gemini.provider'

beforeEach(() => {
  vi.clearAllMocks()
  getGenerativeModelMock.mockReturnValue({ startChat: startChatMock })
  startChatMock.mockReturnValue({ sendMessage: sendMessageMock })
  sendMessageMock.mockResolvedValue({ response: { functionCalls: () => [], text: () => 'ok' } })
})

describe('geminiProvider.chat', () => {
  it('drops leading assistant-only turns so history never starts with role "model"', async () => {
    // Reproduces the "Biorn" prod incident: a bot-initiated greeting with no
    // preceding logged customer turn made history = [{role: 'assistant', ...}],
    // which Gemini's SDK rejects with "First content should be with role 'user'".
    await geminiProvider.chat({
      system: 'sys',
      messages: [
        { role: 'assistant', content: '¡Hola! Soy el Asistente DrillChile.' },
        { role: 'user', content: 'Super' }
      ],
      tools: []
    })

    expect(startChatMock).toHaveBeenCalledWith(expect.objectContaining({ history: [] }))
  })

  it('keeps a normal user-first alternating history intact', async () => {
    await geminiProvider.chat({
      system: 'sys',
      messages: [
        { role: 'user', content: 'Hola' },
        { role: 'assistant', content: 'Bienvenida' },
        { role: 'user', content: 'Super' }
      ],
      tools: []
    })

    expect(startChatMock).toHaveBeenCalledWith(expect.objectContaining({
      history: [
        { role: 'user', parts: [{ text: 'Hola' }] },
        { role: 'model', parts: [{ text: 'Bienvenida' }] }
      ]
    }))
  })

  it('trims multiple leading assistant turns up to the first user turn', async () => {
    await geminiProvider.chat({
      system: 'sys',
      messages: [
        { role: 'assistant', content: 'saludo 1' },
        { role: 'assistant', content: 'saludo 2' },
        { role: 'user', content: 'primera respuesta real' },
        { role: 'assistant', content: 'siguiente' },
        { role: 'user', content: 'Super' }
      ],
      tools: []
    })

    expect(startChatMock).toHaveBeenCalledWith(expect.objectContaining({
      history: [
        { role: 'user', parts: [{ text: 'primera respuesta real' }] },
        { role: 'model', parts: [{ text: 'siguiente' }] }
      ]
    }))
  })
})

describe('transcribeAudio', () => {
  it('sends inline audio data to Gemini and returns the trimmed transcript', async () => {
    const generateContentMock = vi.fn().mockResolvedValue({
      response: { text: () => '  hola quiero cotizar  ' }
    })
    getGenerativeModelMock.mockReturnValue({ startChat: startChatMock, generateContent: generateContentMock })

    const result = await transcribeAudio('QUJDRA==', 'audio/ogg; codecs=opus')

    expect(result).toBe('hola quiero cotizar')
    expect(generateContentMock).toHaveBeenCalledWith([
      expect.objectContaining({ text: expect.any(String) }),
      { inlineData: { mimeType: 'audio/ogg; codecs=opus', data: 'QUJDRA==' } }
    ])
  })

  it('returns empty string instead of throwing when Gemini fails', async () => {
    const generateContentMock = vi.fn().mockRejectedValue(new Error('quota exceeded'))
    getGenerativeModelMock.mockReturnValue({ startChat: startChatMock, generateContent: generateContentMock })

    const result = await transcribeAudio('QUJDRA==', 'audio/ogg')

    expect(result).toBe('')
  })
})
