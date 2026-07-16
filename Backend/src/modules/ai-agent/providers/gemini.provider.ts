import { GoogleGenerativeAI } from '@google/generative-ai'
import type { ChatMessage, ChatResult, LLMProvider, ToolDeclaration } from './types'

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || '')

const CHAT_MODEL = process.env.GEMINI_CHAT_MODEL || 'gemini-2.5-flash'
const EMBED_MODEL = process.env.GEMINI_EMBED_MODEL || 'gemini-embedding-001'

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

export const geminiProvider: LLMProvider = {
  async chat({ system, messages, tools }) {
    const model = genAI.getGenerativeModel({
      model: CHAT_MODEL,
      tools: [{ functionDeclarations: tools }] as any
    })
    // Gemini requires the first history turn to be 'user'. A conversation whose
    // logged messages start with a bot-initiated turn (e.g. a proactive greeting
    // with no preceding customer message) would otherwise produce a 'model'-first
    // history and hard-fail with "First content should be with role 'user'".
    const historySource = messages.slice(0, -1)
    const firstUserIndex = historySource.findIndex(m => m.role === 'user')
    const history = (firstUserIndex === -1 ? [] : historySource.slice(firstUserIndex)).map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }]
    }))
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
  }
}
