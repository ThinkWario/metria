import { Request, Response } from 'express'
import { prisma } from '../../lib/prisma'
import { AuthRequest } from '../../middleware/auth'
import { createMetaTemplate, listMetaTemplates, deleteMetaTemplate } from './channels/whatsappTemplates.client'
import { TEMPLATE_VARIABLE_CATALOG, isKnownVariableKey, ROLE_VARIABLE_REQUIREMENTS, arraysEqual } from './templateVariables'

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
    res.json({
      templates,
      openingTemplateId: config.openingTemplateId ?? null,
      technicalVisitTemplateId: config.technicalVisitTemplateId ?? null,
      visitConfirmationTemplateId: config.visitConfirmationTemplateId ?? null
    })
  } catch (err) {
    console.error('[Templates] list error:', err)
    res.status(500).json({ error: 'Error al listar plantillas' })
  }
}

export async function createTemplateHandler(req: Request, res: Response): Promise<void> {
  try {
    const workspaceId = (req as AuthRequest).user!.workspaceId as string
    const { name, language, category, bodyText, variables, buttons } = req.body as {
      name?: string; language?: string; category?: string; bodyText?: string; variables?: string[]; buttons?: string[]
    }
    if (!name || !bodyText) { res.status(400).json({ error: 'name y bodyText son obligatorios' }); return }

    const varIndexes = [...bodyText.matchAll(/\{\{(\d+)\}\}/g)].map(m => parseInt(m[1], 10))
    const maxVar = varIndexes.length > 0 ? Math.max(...varIndexes) : 0

    if (variables !== undefined) {
      if (variables.length !== maxVar) {
        res.status(400).json({ error: `El texto tiene ${maxVar} variable(s) pero se mapearon ${variables.length}` })
        return
      }
      const unknownKey = variables.find(key => !isKnownVariableKey(key))
      if (unknownKey) {
        res.status(400).json({ error: `Variable desconocida: ${unknownKey}` })
        return
      }
    }

    const channel = await getWhatsAppChannel(workspaceId)
    if (!channel) { res.status(404).json({ error: 'No hay un canal WhatsApp conectado' }); return }

    const config = channel.config as Record<string, string>
    if (!config.wabaId) { res.status(400).json({ error: 'Falta configurar el WABA ID del canal' }); return }
    if (!config.accessToken) { res.status(400).json({ error: 'Falta configurar el access token del canal' }); return }

    const resolvedLanguage = language || 'es'
    const resolvedCategory = category || 'MARKETING'

    const meta = await createMetaTemplate(config.wabaId, config.accessToken, {
      name, language: resolvedLanguage, category: resolvedCategory, bodyText, variables, buttons
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

/** Debug: returns the raw Meta template list (all statuses), including rows never saved locally. */
export async function listMetaTemplatesRawHandler(req: Request, res: Response): Promise<void> {
  try {
    const workspaceId = (req as AuthRequest).user!.workspaceId as string
    const channel = await getWhatsAppChannel(workspaceId)
    if (!channel) { res.status(404).json({ error: 'No hay un canal WhatsApp conectado' }); return }

    const config = channel.config as Record<string, string>
    if (!config.wabaId || !config.accessToken) { res.status(400).json({ error: 'Falta configurar wabaId/accessToken del canal' }); return }

    const remote = await listMetaTemplates(config.wabaId, config.accessToken)
    res.json({ templates: remote })
  } catch (err: any) {
    console.error('[Templates] meta-raw error:', err)
    res.status(502).json({ error: err?.message ?? 'Error al listar plantillas de Meta' })
  }
}

/**
 * Adopts a template that exists on Meta but has no local row — happens when the
 * client disconnects between the Meta create call succeeding and the Prisma
 * insert running (createTemplateHandler does them sequentially, not atomically).
 * Meta's template list doesn't return body text, so the caller supplies it —
 * it must match what was actually submitted to Meta for the variables to be right.
 */
export async function importMetaTemplateHandler(req: Request, res: Response): Promise<void> {
  try {
    const workspaceId = (req as AuthRequest).user!.workspaceId as string
    const { name, bodyText, variables } = req.body as { name?: string; bodyText?: string; variables?: string[] }
    if (!name || !bodyText) { res.status(400).json({ error: 'name y bodyText son obligatorios' }); return }

    const varIndexes = [...bodyText.matchAll(/\{\{(\d+)\}\}/g)].map(m => parseInt(m[1], 10))
    const maxVar = varIndexes.length > 0 ? Math.max(...varIndexes) : 0
    if (variables !== undefined) {
      if (variables.length !== maxVar) {
        res.status(400).json({ error: `El texto tiene ${maxVar} variable(s) pero se mapearon ${variables.length}` })
        return
      }
      const unknownKey = variables.find(key => !isKnownVariableKey(key))
      if (unknownKey) {
        res.status(400).json({ error: `Variable desconocida: ${unknownKey}` })
        return
      }
    }

    const channel = await getWhatsAppChannel(workspaceId)
    if (!channel) { res.status(404).json({ error: 'No hay un canal WhatsApp conectado' }); return }

    const config = channel.config as Record<string, string>
    if (!config.wabaId || !config.accessToken) { res.status(400).json({ error: 'Falta configurar wabaId/accessToken del canal' }); return }

    const existing = await prisma.whatsAppTemplate.findFirst({ where: { channelId: channel.id, name } })
    if (existing) { res.status(409).json({ error: 'Ya existe una plantilla local con ese nombre' }); return }

    const remote = await listMetaTemplates(config.wabaId, config.accessToken)
    const match = remote.find(r => r.name === name)
    if (!match) { res.status(404).json({ error: 'No se encontró esa plantilla en Meta' }); return }

    const template = await prisma.whatsAppTemplate.create({
      data: {
        workspaceId,
        channelId: channel.id,
        name: match.name,
        language: match.language,
        category: match.category,
        bodyText,
        variables: variables ?? undefined,
        status: match.status,
        metaTemplateId: match.id,
        rejectedReason: match.rejectedReason ?? null
      }
    })
    res.status(201).json(template)
  } catch (err: any) {
    console.error('[Templates] import error:', err)
    res.status(500).json({ error: err?.message ?? 'Error al importar la plantilla' })
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

    // Clear any role pointer left dangling by the delete — a stale id here makes
    // every future send for that role throw "Template not found" instead of the
    // role simply falling back to unconfigured.
    const roleKeys = ['openingTemplateId', 'technicalVisitTemplateId', 'visitConfirmationTemplateId'] as const
    const clearedConfig = { ...config }
    let hadDanglingRole = false
    for (const key of roleKeys) {
      if (clearedConfig[key] === id) {
        clearedConfig[key] = null as unknown as string
        hadDanglingRole = true
      }
    }
    if (hadDanglingRole) {
      await prisma.channel.update({ where: { id: channel.id }, data: { config: clearedConfig } })
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
    if (template.variables !== null) {
      const templateVars = template.variables as string[]
      const required = ROLE_VARIABLE_REQUIREMENTS.openingTemplateId
      if (!arraysEqual(templateVars, required)) {
        res.status(400).json({
          error: `Esta plantilla usa variables [${templateVars.join(', ')}] pero este rol requiere [${required.join(', ')}]`
        })
        return
      }
    }

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

const ASSIGNABLE_TEMPLATE_ROLES = ['technicalVisitTemplateId', 'visitConfirmationTemplateId'] as const
type AssignableTemplateRole = typeof ASSIGNABLE_TEMPLATE_ROLES[number]

/**
 * Assigns (or clears, when id is null) an APPROVED template to a channel-level
 * automation role. Currently just the technical-visit alert sent to the
 * workspace's internal notifyPhone (the handoff-to-executive template lives on
 * the bot agent instead — see updateAgentHandoffConfig in bot.service.ts).
 * Kept generic over role/config-key for whichever channel-level role comes next.
 */
export async function setTemplateRoleHandler(req: Request, res: Response): Promise<void> {
  try {
    const workspaceId = (req as AuthRequest).user!.workspaceId as string
    const { role } = req.params
    const { templateId } = req.body as { templateId?: string | null }

    if (!ASSIGNABLE_TEMPLATE_ROLES.includes(role as AssignableTemplateRole)) {
      res.status(400).json({ error: 'Rol de plantilla inválido' }); return
    }

    const channel = await getWhatsAppChannel(workspaceId)
    if (!channel) { res.status(404).json({ error: 'No hay un canal WhatsApp conectado' }); return }

    if (templateId) {
      const template = await prisma.whatsAppTemplate.findFirst({ where: { id: templateId, channelId: channel.id } })
      if (!template) { res.status(404).json({ error: 'Plantilla no encontrada' }); return }
      if (template.status !== 'APPROVED') { res.status(400).json({ error: 'Solo una plantilla APPROVED puede asignarse' }); return }
      if (template.variables !== null) {
        const templateVars = template.variables as string[]
        const required = ROLE_VARIABLE_REQUIREMENTS[role]
        if (required && !arraysEqual(templateVars, required)) {
          res.status(400).json({
            error: `Esta plantilla usa variables [${templateVars.join(', ')}] pero este rol requiere [${required.join(', ')}]`
          })
          return
        }
      }
    }

    const config = channel.config as Record<string, string>
    const updated = await prisma.channel.update({
      where: { id: channel.id },
      data: { config: { ...config, [role]: templateId ?? null } }
    })
    res.json({ [role]: (updated.config as Record<string, string>)[role] ?? null })
  } catch (err) {
    console.error('[Templates] set role error:', err)
    res.status(500).json({ error: 'Error al asignar la plantilla' })
  }
}

export async function getTemplateVariableCatalogHandler(req: Request, res: Response): Promise<void> {
  res.json({ catalog: TEMPLATE_VARIABLE_CATALOG })
}
