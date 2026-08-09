# Eliminar conversación desde el Inbox (soft-delete)

## Contexto

El menú de 3 puntos en `ConversationList.tsx` (Inbox) hoy solo ofrece "Marcar como no leído", y solo aparece cuando la conversación ya está leída (`unreadCount === 0`). Se pide agregar una opción "Eliminar conversación" en ese mismo menú, con modal de confirmación/cancelación.

## Decisión: soft-delete

El backend ya expone `DELETE /messaging/conversations/:conversationId` (gateado a planes PRO/SCALE), pero hace `prisma.conversation.delete(...)` — borrado físico. Se cambia a soft-delete (`deletedAt`) para poder recuperar datos y no perder historial de mensajes/CRM.

## Cambios de datos

`Conversation` (schema.prisma) gana `deletedAt DateTime? @map("deleted_at")`.

- `getConversations` (inbox.service.ts): agrega `deletedAt: null` al `where` para que las conversaciones eliminadas no aparezcan en ningún filtro de estado (OPEN/PENDING/CLOSED/ALL).
- `deleteConversation` (inbox.service.ts): en vez de `.delete()`, hace `.update({ data: { deletedAt: new Date() } })`.
- `processInboundMessage` (message.service.ts): la búsqueda de conversación existente es por `workspaceId_channelId_externalId`, sin filtrar por `deletedAt` — si un contacto vuelve a escribir a una conversación eliminada, hoy la encontraría "existente" (oculta) y el mensaje entraría sin que nadie lo vea. Se agrega revival: si la conversación encontrada tiene `deletedAt` seteado, se limpia (`deletedAt: null`) y se trata como `isNewConversation = true` para que emita `conversation:new` y reaparezca en la UI.
- Fuera de alcance: cualquier otro listado de conversaciones (CRM, analíticas) no se toca — la eliminación solo afecta la visibilidad en el Inbox.

## Cambios de frontend

**`ConversationList.tsx`**
- El trigger del menú de 3 puntos pasa a mostrarse siempre que exista `onMarkAsUnread` o `onDeleteConversation` (hoy solo se muestra si `unreadCount === 0`).
- Item "Marcar como no leído" sigue condicionado a `unreadCount === 0`.
- Nuevo item "Eliminar conversación" (ícono `Trash2`, texto rojo/destructivo), siempre visible.
- Clic en "Eliminar conversación" no borra directo: abre un `AlertDialog` (mismo patrón que `CrmContactsClient.tsx`) con título "¿Eliminar conversación?", descripción indicando que se oculta del Inbox (no se pierden los mensajes), botones Cancelar / Eliminar.
- Estado del modal (`conversationToDelete: string | null`) vive en `ConversationList`.

**`useInbox.ts`**
- Nueva función `deleteConversation(conversationId)`: optimista — remueve la conversación de `conversations`; llama `DELETE /messaging/conversations/:id`; si falla, revierte (reinserta) y deja que el llamador muestre el error.
- Si la conversación eliminada era la seleccionada (`selectedId`), se limpia la selección.

**`InboxClient.tsx`**
- Pasa `onDeleteConversation={deleteConversation}` a `ConversationList`.
- Envuelve la llamada con toast: éxito "Conversación eliminada", error "No se pudo eliminar la conversación" (cubre el caso 403 por plan no habilitado).

## Testing

- Backend: test de `deleteConversation` verificando que setea `deletedAt` y que `getConversations` ya no la retorna.
- Backend: test de revival en `processInboundMessage` — mensaje entrante a conversación con `deletedAt` seteado limpia el campo y dispara `conversation:new`.
- Frontend: test de `ConversationList` — el ítem "Eliminar conversación" abre el modal; confirmar llama `onDeleteConversation`; cancelar no lo llama.
- Frontend: test de `useInbox.deleteConversation` — optimista + rollback en error.

## Migración

Requiere `npm run db:push` en `Backend/` contra Postgres local (`docker compose up -d` primero) antes de poder probar end-to-end.
