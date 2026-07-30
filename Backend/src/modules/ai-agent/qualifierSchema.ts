import { SchemaType } from '@google/generative-ai'

export interface QualifierOutput {
  qualification?: {
    temperature?: 'COLD' | 'WARM' | 'HOT'
    type?: 'CURIOUS' | 'QUOTING' | 'READY_TO_BUY' | 'POST_SALE'
    score?: number
    data?: Record<string, string>
  }
  tags?: string[]
  statusChange?: 'LEAD' | 'PROSPECT' | 'CUSTOMER'
  deal?: { action: 'create' | 'move'; title?: string; value?: number; stageName?: string }
  needsHuman?: { value: boolean; reason?: string }
  stopFollowUps?: { value: boolean; reason?: string }
}

/**
 * Passed as Gemini's `responseSchema` (enforced) and serialized into NVIDIA's
 * system prompt as a best-effort instruction — see each provider's extract().
 * Every field is optional: the model omits whatever has no signal this turn,
 * and applyQualifierOutcome() must tolerate any subset being present.
 */
export const QUALIFIER_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    qualification: {
      type: SchemaType.OBJECT,
      properties: {
        temperature: { type: SchemaType.STRING, description: 'COLD | WARM | HOT' },
        type: { type: SchemaType.STRING, description: 'CURIOUS | QUOTING | READY_TO_BUY | POST_SALE' },
        score: { type: SchemaType.NUMBER, description: '0-100' },
        data: { type: SchemaType.OBJECT, description: 'Answers keyed by qualification question key, values as strings' }
      }
    },
    tags: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    statusChange: { type: SchemaType.STRING, description: 'LEAD | PROSPECT | CUSTOMER' },
    deal: {
      type: SchemaType.OBJECT,
      properties: {
        action: { type: SchemaType.STRING, description: "'create' | 'move'" },
        title: { type: SchemaType.STRING },
        value: { type: SchemaType.NUMBER },
        stageName: { type: SchemaType.STRING }
      }
    },
    needsHuman: {
      type: SchemaType.OBJECT,
      properties: {
        value: { type: SchemaType.BOOLEAN },
        reason: { type: SchemaType.STRING }
      }
    },
    stopFollowUps: {
      type: SchemaType.OBJECT,
      properties: {
        value: { type: SchemaType.BOOLEAN },
        reason: { type: SchemaType.STRING }
      }
    }
  }
}
