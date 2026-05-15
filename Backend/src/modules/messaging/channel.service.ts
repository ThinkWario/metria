import { prisma } from '../../lib/prisma'
import { MessagingPlatform } from './types'

export interface ChannelConfig {
  platform: MessagingPlatform
  name: string
  config: Record<string, any>
  status?: string
}

export async function getChannels(workspaceId: string) {
  return prisma.channel.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' }
  })
}

export async function upsertChannelConfig(workspaceId: string, data: ChannelConfig) {
  return prisma.channel.upsert({
    where: {
      workspaceId_platform: {
        workspaceId,
        platform: data.platform
      }
    },
    update: {
      name: data.name,
      config: data.config,
      status: data.status || 'CONNECTED'
    },
    create: {
      workspaceId,
      platform: data.platform,
      name: data.name,
      config: data.config,
      status: data.status || 'CONNECTED'
    }
  })
}
