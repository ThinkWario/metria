import { prisma } from '../../lib/prisma'

// 1x1 transparent GIF (35 bytes)
const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
)

export const trackingService = {
  async recordOpen(recipientId: string): Promise<void> {
    const recipient = await prisma.campaignRecipient.findUnique({
      where: { id: recipientId },
      select: { id: true, status: true }
    })
    if (!recipient) return
    if (recipient.status === 'PENDING' || recipient.status === 'SENT') {
      await prisma.campaignRecipient.update({
        where: { id: recipientId },
        data: { status: 'OPENED', openedAt: new Date() }
      })
    }
  },

  async recordClick(recipientId: string): Promise<void> {
    const recipient = await prisma.campaignRecipient.findUnique({
      where: { id: recipientId },
      select: { id: true, status: true }
    })
    if (!recipient) return
    if (recipient.status !== 'CLICKED') {
      await prisma.campaignRecipient.update({
        where: { id: recipientId },
        data: { status: 'CLICKED', clickedAt: new Date() }
      })
    }
  },

  pixel(): Buffer {
    return TRANSPARENT_GIF
  }
}
