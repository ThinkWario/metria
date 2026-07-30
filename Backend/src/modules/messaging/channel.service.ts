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
  // A plain overwrite of `config` silently drops keys the submitted form
  // doesn't know about (e.g. isAiEnabled, set only by the native WhatsApp
  // 'ready' handler) — merge onto the existing config so saving Cloud API
  // credentials from the settings form doesn't turn the AI bot off as a
  // side effect. Submitted keys still win over stored ones.
  const existing = await prisma.channel.findUnique({
    where: { workspaceId_platform: { workspaceId, platform: data.platform } },
    select: { config: true }
  })
  const mergedConfig = { ...(existing?.config as Record<string, unknown> ?? {}), ...data.config }

  return prisma.channel.upsert({
    where: {
      workspaceId_platform: {
        workspaceId,
        platform: data.platform
      }
    },
    update: {
      name: data.name,
      config: mergedConfig,
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
