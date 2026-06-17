import { Composio } from '@composio/core'

let _client: Composio | null = null

function getClient(): Composio {
  if (!_client) {
    _client = new Composio({ apiKey: process.env.COMPOSIO_API_KEY ?? '' })
  }
  return _client
}

export interface ConnectionRequest {
  redirectUrl: string
}

export async function initiateConnection(
  workspaceId: string,
  appName: string,
  callbackUrl: string
): Promise<ConnectionRequest> {
  const session = await getClient().create(workspaceId)
  const req = await session.authorize(appName.toLowerCase(), { callbackUrl })
  if (!req.redirectUrl) {
    throw new Error(`Composio no devolvió una URL de redirección para "${appName}"`)
  }
  return { redirectUrl: req.redirectUrl }
}
