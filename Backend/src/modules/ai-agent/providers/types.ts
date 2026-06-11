export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ToolDeclaration {
  name: string
  description: string
  parameters: Record<string, unknown> // JSON-schema-like, provider adapts it
}

export interface ToolCall {
  name: string
  args: Record<string, any>
}

export interface ChatResult {
  text: string | null
  toolCalls: ToolCall[]
  /** Continue the same turn by feeding tool results back. */
  submitToolResults(results: { name: string; response: object }[]): Promise<ChatResult>
}

export interface LLMProvider {
  chat(input: { system: string; messages: ChatMessage[]; tools: ToolDeclaration[] }): Promise<ChatResult>
  embed(texts: string[]): Promise<number[][]>
}
