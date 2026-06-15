import { Composio } from 'composio-core'

let _client: Composio | null = null

function getClient(): Composio {
  if (!_client) {
    _client = new Composio({ apiKey: process.env.COMPOSIO_API_KEY ?? '' })
  }
  return _client
}

export interface ConnectionRequest {
  redirectUrl: string
  connectedAccountId?: string
  connectionStatus?: string
  waitUntilActive?: (timeout?: number) => Promise<any>
}

/**
 * Initiates an OAuth connection for a toolkit.
 * Returns the Composio Connect Link URL to redirect the user to.
 */
export async function initiateConnection(
  workspaceId: string,
  appName: string,
  redirectUri: string
): Promise<ConnectionRequest> {
  const entity = getClient().getEntity(workspaceId)
  return entity.initiateConnection({ appName, redirectUri }) as Promise<ConnectionRequest>
}

/**
 * Returns all active connections for a workspace.
 */
export async function getConnections(workspaceId: string): Promise<any[]> {
  try {
    const entity = getClient().getEntity(workspaceId)
    const connections = await entity.getConnections()
    return Array.isArray(connections) ? connections : []
  } catch {
    return []
  }
}
