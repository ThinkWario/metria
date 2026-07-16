import type { ChatMessage, ChatResult, LLMProvider, ToolCall, ToolDeclaration } from './types'
import { geminiProvider } from './gemini.provider'

const BASE_URL = process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1'
// moonshotai/kimi-k2.6 is catalog-listed but gated per-account on NVIDIA's
// side (confirmed via direct API test: 404 "Function not found for
// account" despite a valid key) — default to a model confirmed working
// with tool calls instead; override via env once Kimi access is granted.
const CHAT_MODEL = process.env.NVIDIA_CHAT_MODEL || 'minimaxai/minimax-m3'

interface OpenAiToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

interface OpenAiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: OpenAiToolCall[]
  tool_call_id?: string
}

function toOpenAiTools(tools: ToolDeclaration[]) {
  return tools.map(t => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.parameters }
  }))
}

async function callChatCompletions(messages: OpenAiMessage[], tools: ToolDeclaration[]) {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: CHAT_MODEL,
      messages,
      tools: toOpenAiTools(tools),
      max_tokens: 4096,
      temperature: 0.7
    })
  })
  if (!res.ok) throw new Error(`NVIDIA API error ${res.status}: ${await res.text()}`)
  const data = await res.json()
  const choice = data.choices?.[0]
  if (!choice) throw new Error('NVIDIA API returned no choices')
  return choice.message as OpenAiMessage
}

function toResult(messages: OpenAiMessage[], tools: ToolDeclaration[], assistantMsg: OpenAiMessage): ChatResult {
  const rawCalls = assistantMsg.tool_calls ?? []
  const toolCalls: ToolCall[] = rawCalls.map(c => ({
    name: c.function.name,
    args: c.function.arguments ? JSON.parse(c.function.arguments) : {}
  }))

  return {
    text: rawCalls.length ? null : (assistantMsg.content ?? null),
    toolCalls,
    async submitToolResults(results) {
      // Matched by position: ai.service.ts iterates result.toolCalls in order
      // and pushes responses in the same order, so rawCalls[i] <-> results[i].
      const toolMessages: OpenAiMessage[] = results.map((r, i) => ({
        role: 'tool',
        tool_call_id: rawCalls[i]?.id,
        content: JSON.stringify(r.response)
      }))
      const nextMessages = [...messages, assistantMsg, ...toolMessages]
      const nextAssistantMsg = await callChatCompletions(nextMessages, tools)
      return toResult(nextMessages, tools, nextAssistantMsg)
    }
  }
}

export const nvidiaProvider: LLMProvider = {
  async chat({ system, messages, tools }: { system: string; messages: ChatMessage[]; tools: ToolDeclaration[] }) {
    const openAiMessages: OpenAiMessage[] = [
      { role: 'system', content: system },
      ...messages.map(m => ({ role: m.role, content: m.content }) as OpenAiMessage)
    ]
    const assistantMsg = await callChatCompletions(openAiMessages, tools)
    return toResult(openAiMessages, tools, assistantMsg)
  },

  // NVIDIA's catalog doesn't carry a pinned embedding model for this project's
  // RAG index — reuse Gemini's embeddings regardless of chat provider so the
  // knowledge base stays on one consistent vector space across tests.
  embed: geminiProvider.embed
}
