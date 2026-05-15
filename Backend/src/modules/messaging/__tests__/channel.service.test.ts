import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getChannels, upsertChannelConfig } from '../channel.service'
import { prisma } from '../../../lib/prisma'

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    channel: {
      findMany: vi.fn(),
      upsert: vi.fn()
    }
  }
}))

const WORKSPACE_ID = 'ws-1'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Channel Service', () => {
  describe('getChannels', () => {
    it('returns a list of channels for the given workspace', async () => {
      const mockChannels = [
        { id: 'ch-1', workspaceId: WORKSPACE_ID, platform: 'WHATSAPP', name: 'WhatsApp Main', status: 'CONNECTED' },
        { id: 'ch-2', workspaceId: WORKSPACE_ID, platform: 'INSTAGRAM', name: 'Instagram Main', status: 'CONNECTED' }
      ]
      vi.mocked(prisma.channel.findMany).mockResolvedValue(mockChannels as any)

      const result = await getChannels(WORKSPACE_ID)

      expect(prisma.channel.findMany).toHaveBeenCalledWith({
        where: { workspaceId: WORKSPACE_ID },
        orderBy: { createdAt: 'desc' }
      })
      expect(result).toEqual(mockChannels)
    })
  })

  describe('upsertChannelConfig', () => {
    it('upserts channel configuration for the given workspace and platform', async () => {
      const configData = {
        platform: 'MESSENGER' as any,
        name: 'Messenger Main',
        config: { pageAccessToken: 'token-123', pageId: 'page-123' },
        status: 'CONNECTED'
      }
      const mockUpserted = { id: 'ch-3', ...configData, workspaceId: WORKSPACE_ID }
      vi.mocked(prisma.channel.upsert).mockResolvedValue(mockUpserted as any)

      const result = await upsertChannelConfig(WORKSPACE_ID, configData)

      expect(prisma.channel.upsert).toHaveBeenCalledWith({
        where: {
          workspaceId_platform: {
            workspaceId: WORKSPACE_ID,
            platform: configData.platform
          }
        },
        update: {
          name: configData.name,
          config: configData.config,
          status: configData.status
        },
        create: {
          workspaceId: WORKSPACE_ID,
          platform: configData.platform,
          name: configData.name,
          config: configData.config,
          status: configData.status
        }
      })
      expect(result).toEqual(mockUpserted)
    })
  })
})
