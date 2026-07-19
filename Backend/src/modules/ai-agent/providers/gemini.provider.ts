import { GoogleGenerativeAI } from '@google/generative-ai'
import type { ChatMessage, ChatResult, JSONSchemaObject, LLMProvider, ToolDeclaration } from './types'

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || '')

const CHAT_MODEL = process.env.GEMINI_CHAT_MODEL || 'gemini-2.5-flash'
const EMBED_MODEL = process.env.GEMINI_EMBED_MODEL || 'gemini-embedding-001'

const TRANSCRIBE_PROMPT =
  process.env.GEMINI_TRANSCRIBE_PROMPT ||
  'Transcribe este audio exactamente a texto. Devuelve SOLO la transcripción, sin comillas, ' +
  'sin prefijos como "Transcripción:" y sin explicaciones adicionales.'

function wrapResult(chat: any, response: any): ChatResult {
  const calls = response.functionCalls() || []
  return {
    text: calls.length ? null : response.text(),
    toolCalls: calls.map((c: any) => ({ name: c.name, args: c.args })),
    async submitToolResults(results) {
      const parts = results.map(r => ({ functionResponse: { name: r.name, response: r.response } }))
      const next = await chat.sendMessage(parts)
      return wrapResult(chat, next.response)
    }
  }
}

// Gemini requires the first history turn to be 'user'. A conversation whose
// logged messages start with a bot-initiated turn (e.g. a proactive greeting
// with no preceding customer message) would otherwise produce a 'model'-first
// history and hard-fail with "First content should be with role 'user'".
function buildGeminiHistory(messages: ChatMessage[]) {
  const historySource = messages.slice(0, -1)
  const firstUserIndex = historySource.findIndex(m => m.role === 'user')
  return (firstUserIndex === -1 ? [] : historySource.slice(firstUserIndex)).map(m => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.content }]
  }))
}

export const geminiProvider: LLMProvider = {
  async chat({ system, messages, tools }) {
    const model = genAI.getGenerativeModel({
      model: CHAT_MODEL,
      tools: [{ functionDeclarations: tools }] as any
    })
    const history = buildGeminiHistory(messages)
    const last = messages[messages.length - 1]
    const chat = model.startChat({
      history: history as any,
      systemInstruction: { role: 'system', parts: [{ text: system }] }
    })
    const result = await chat.sendMessage(last?.content ?? '')
    return wrapResult(chat, result.response)
  },

  async embed(texts) {
    const model = genAI.getGenerativeModel({ model: EMBED_MODEL })
    const res = await model.batchEmbedContents({
      requests: texts.map(t => ({ content: { role: 'user', parts: [{ text: t }] } }))
    })
    return res.embeddings.map(e => e.values)
  },

  async extract<T>({ system, messages, schema }: { system: string; messages: ChatMessage[]; schema: JSONSchemaObject }): Promise<T | null> {
    try {
      const model = genAI.getGenerativeModel({
        model: CHAT_MODEL,
        generationConfig: { responseMimeType: 'application/json', responseSchema: schema as any }
      })
      const history = buildGeminiHistory(messages)
      const last = messages[messages.length - 1]
      const chat = model.startChat({
        history: history as any,
        systemInstruction: { role: 'system', parts: [{ text: system }] }
      })
      const result = await chat.sendMessage(last?.content ?? '')
      return JSON.parse(result.response.text()) as T
    } catch (err) {
      console.error('[Gemini] extract() failed:', err)
      return null
    }
  }
}

export async function transcribeAudio(data: string, mimeType: string): Promise<string> {
  try {
    const model = genAI.getGenerativeModel({ model: CHAT_MODEL })
    const result = await model.generateContent([
      { text: TRANSCRIBE_PROMPT },
      { inlineData: { mimeType, data } }
    ])
    return result.response.text().trim()
  } catch (err) {
    console.error('[Gemini] Audio transcription failed:', err)
    return ''
  }
}
