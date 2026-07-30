import { Request, Response } from 'express'
import { prisma } from '../../lib/prisma'
import { AuthRequest } from '../../middleware/auth'
import { createMetaTemplate, listMetaTemplates, deleteMetaTemplate } from './channels/whatsappTemplates.client'

async function getWhatsAppChannel(workspaceId: string) {
  return prisma.channel.findFirst({ where: { workspaceId, platform: 'WHATSAPP', status: 'CONNECTED' } })
}

export async function listTemplatesHandler(req: Request, res: Response): Promise<void> {
  try {
    const workspaceId = (req as AuthRequest).user!.workspaceId as string
    const channel = await getWhatsAppChannel(workspaceId)
    if (!channel) { res.status(404).json({ error: 'No hay un canal WhatsApp conectado' }); return }

    const templates = await prisma.whatsAppTemplate.findMany({
      where: { channelId: channel.id },
      orderBy: { createdAt: 'desc' }
    })
    const config = channel.config as Record<string, string>
    res.json({ templates, openingTemplateId: config.openingTemplateId ?? null })
  } catch (err) {
    console.error('[Templates] list error:', err)
    res.status(500).json({ error: 'Error al listar plantillas' })
  }
}

export async function createTemplateHandler(req: Request, res: Response): Promise<void> {
  try {
    const workspaceId = (req as AuthRequest).user!.workspaceId as string
    const { name, language, category, bodyText, variables } = req.body as {
      name?: string; language?: string; category?: string; bodyText?: string; variables?: string[]
    }
    if (!name || !bodyText) { res.status(400).json({ error: 'name y bodyText son obligatorios' }); return }

    const channel = await getWhatsAppChannel(workspaceId)
    if (!channel) { res.status(404).json({ error: 'No hay un canal WhatsApp conectado' }); return }

    const config = channel.config as Record<string, string>
    if (!config.wabaId) { res.status(400).json({ error: 'Falta configurar el WABA ID del canal' }); return }
    if (!config.accessToken) { res.status(400).json({ error: 'Falta configurar el access token del canal' }); return }

    const resolvedLanguage = language || 'es'
    const resolvedCategory = category || 'MARKETING'

    const meta = await createMetaTemplate(config.wabaId, config.accessToken, {
      name, language: resolvedLanguage, category: resolvedCategory, bodyText
    })

    const template = await prisma.whatsAppTemplate.create({
      data: {
        workspaceId,
        channelId: channel.id,
        name,
        language: resolvedLanguage,
        category: resolvedCategory,
        bodyText,
        variables: variables ?? undefined,
        status: meta.status,
        metaTemplateId: meta.metaTemplateId
      }
    })
    res.status(201).json(template)
  } catch (err: any) {
    console.error('[Templates] create error:', err)
    res.status(502).json({ error: err?.message ?? 'Error al crear la plantilla en Meta' })
  }
}

export async function syncTemplatesHandler(req: Request, res: Response): Promise<void> {
  try {
    const workspaceId = (req as AuthRequest).user!.workspaceId as string
    const channel = await getWhatsAppChannel(workspaceId)
    if (!channel) { res.status(404).json({ error: 'No hay un canal WhatsApp conectado' }); return }

    const config = channel.config as Record<string, string>
    if (!config.wabaId || !config.accessToken) { res.status(400).json({ error: 'Falta configurar wabaId/accessToken del canal' }); return }

    const remote = await listMetaTemplates(config.wabaId, config.accessToken)
    const local = await prisma.whatsAppTemplate.findMany({ where: { channelId: channel.id } })

    await Promise.all(
      local.map(async t => {
        const match = remote.find(r => r.name === t.name && r.language === t.language)
        if (!match) return
        if (match.status === t.status && (match.rejectedReason ?? null) === (t.rejectedReason ?? null)) return
        await prisma.whatsAppTemplate.update({
          where: { id: t.id },
          data: { status: match.status, rejectedReason: match.rejectedReason ?? null }
        })
      })
    )

    const updated = await prisma.whatsAppTemplate.findMany({ where: { channelId: channel.id }, orderBy: { createdAt: 'desc' } })
    res.json({ templates: updated })
  } catch (err: any) {
    console.error('[Templates] sync error:', err)
    res.status(502).json({ error: err?.message ?? 'Error al sincronizar con Meta' })
  }
}

export async function deleteTemplateHandler(req: Request, res: Response): Promise<void> {
  try {
    const workspaceId = (req as AuthRequest).user!.workspaceId as string
    const { id } = req.params
    const channel = await getWhatsAppChannel(workspaceId)
    if (!channel) { res.status(404).json({ error: 'No hay un canal WhatsApp conectado' }); return }

    const template = await prisma.whatsAppTemplate.findFirst({ where: { id, channelId: channel.id } })
    if (!template) { res.status(404).json({ error: 'Plantilla no encontrada' }); return }

    const config = channel.config as Record<string, string>
    if (config.wabaId && config.accessToken) {
      await deleteMetaTemplate(config.wabaId, config.accessToken, template.name).catch(err => {
        // A template deleted in Meta's UI already, or a transient API error, must not
        // block removing the now-orphaned local row.
        console.error('[Templates] Meta delete failed, removing local row anyway:', err)
      })
    }
    await prisma.whatsAppTemplate.delete({ where: { id } })

    if (config.openingTemplateId === id) {
      await prisma.channel.update({
        where: { id: channel.id },
        data: { config: { ...config, openingTemplateId: null } }
      })
    }
    res.status(204).send()
  } catch (err) {
    console.error('[Templates] delete error:', err)
    res.status(500).json({ error: 'Error al borrar la plantilla' })
  }
}

export async function setOpeningTemplateHandler(req: Request, res: Response): Promise<void> {
  try {
    const workspaceId = (req as AuthRequest).user!.workspaceId as string
    const { id } = req.params
    const channel = await getWhatsAppChannel(workspaceId)
    if (!channel) { res.status(404).json({ error: 'No hay un canal WhatsApp conectado' }); return }

    const template = await prisma.whatsAppTemplate.findFirst({ where: { id, channelId: channel.id } })
    if (!template) { res.status(404).json({ error: 'Plantilla no encontrada' }); return }
    if (template.status !== 'APPROVED') { res.status(400).json({ error: 'Solo una plantilla APPROVED puede usarse como saludo inicial' }); return }

    const config = channel.config as Record<string, string>
    const updated = await prisma.channel.update({
      where: { id: channel.id },
      data: { config: { ...config, openingTemplateId: id } }
    })
    res.json({ openingTemplateId: (updated.config as Record<string, string>).openingTemplateId })
  } catch (err) {
    console.error('[Templates] set opening error:', err)
    res.status(500).json({ error: 'Error al asignar la plantilla de saludo' })
  }
}
