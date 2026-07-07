import { prisma } from '../../lib/prisma'

function slugify(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

export async function listDefinitions(workspaceId: string) {
  return prisma.contactCustomFieldDefinition.findMany({
    where: { workspaceId },
    orderBy: { order: 'asc' }
  })
}

export async function createDefinition(workspaceId: string, label: string) {
  const existing = await prisma.contactCustomFieldDefinition.findMany({ where: { workspaceId } })
  const baseKey = slugify(label)
  const existingKeys = new Set(existing.map(d => d.key))
  let key = baseKey
  let suffix = 1
  while (existingKeys.has(key)) {
    suffix++
    key = `${baseKey}_${suffix}`
  }

  return prisma.contactCustomFieldDefinition.create({
    data: { workspaceId, key, label, order: existing.length }
  })
}

export async function deleteDefinition(workspaceId: string, id: string) {
  const def = await prisma.contactCustomFieldDefinition.findFirst({ where: { id, workspaceId } })
  if (!def) throw new Error('Custom field not found')
  await prisma.contactCustomFieldDefinition.delete({ where: { id } })
}

export async function setContactCustomFields(workspaceId: string, contactId: string, values: Record<string, string>) {
  const [definitions, contact] = await Promise.all([
    listDefinitions(workspaceId),
    prisma.contact.findFirst({ where: { id: contactId, workspaceId } })
  ])
  if (!contact) throw new Error('Contact not found')

  const knownKeys = new Set(definitions.map(d => d.key))
  const filtered = Object.fromEntries(Object.entries(values).filter(([k]) => knownKeys.has(k)))
  const merged = { ...((contact.customFields as Record<string, string> | null) ?? {}), ...filtered }

  return prisma.contact.update({ where: { id: contactId }, data: { customFields: merged } })
}
