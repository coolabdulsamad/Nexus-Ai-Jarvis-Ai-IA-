import type {
  Approval,
  ApprovalResult,
  AssistantSettings,
  AssistantSettingsUpdate,
  AuditEvent,
  Capability,
  CameraEvent,
  CameraSession,
  CommandResult,
  ConversationEntry,
  DirectorySearch,
  Health,
  MemoryRecord,
  ModelStatus,
  Note,
  OwnedDevice,
  SystemStatus,
} from '@/types/nexus'

const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { detail?: string } | null
    throw new Error(body?.detail ?? `Nexus core returned ${response.status}.`)
  }
  return (await response.json()) as T
}

export const nexusApi = {
  health: () => request<Health>('/api/health'),
  capabilities: async () => (await request<{ capabilities: Capability[] }>('/api/capabilities')).capabilities,
  notes: async () => (await request<{ notes: Note[] }>('/api/notes')).notes,
  memories: async () => (await request<{ memories: MemoryRecord[] }>('/api/memories')).memories,
  conversations: async () =>
    (await request<{ conversations: ConversationEntry[] }>('/api/conversations?limit=50')).conversations,
  devices: async () => (await request<{ devices: OwnedDevice[] }>('/api/devices')).devices,
  cameraSessions: async () => (await request<{ sessions: CameraSession[] }>('/api/camera/sessions')).sessions,
  cameraEvent: async (id: string, event: CameraEvent, keepalive = false) =>
    (await request<{ session: CameraSession }>(`/api/camera/sessions/${id}/events`, {
      method: 'POST',
      body: JSON.stringify({ event }),
      keepalive,
    })).session,
  approvals: async (status?: string) =>
    (await request<{ approvals: Approval[] }>(`/api/approvals${status ? `?status=${status}` : ''}`)).approvals,
  audit: async () => (await request<{ events: AuditEvent[] }>('/api/audit?limit=60')).events,
  assistantStatus: () => request<ModelStatus>('/api/assistant/status'),
  systemStatus: () => request<SystemStatus>('/api/system/status'),
  directories: (query = '') =>
    request<DirectorySearch>(`/api/system/directories?limit=20&query=${encodeURIComponent(query)}`),
  settings: () => request<AssistantSettings>('/api/settings'),
  updateSettings: (settings: AssistantSettingsUpdate) =>
    request<AssistantSettings>('/api/settings', { method: 'POST', body: JSON.stringify(settings) }),
  command: (text: string) =>
    request<CommandResult>('/api/commands', { method: 'POST', body: JSON.stringify({ text }) }),
  commandStream: async (text: string, onToken: (token: string) => void): Promise<CommandResult> => {
    const response = await fetch(`${API_BASE}/api/commands/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ text }),
    })
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { detail?: string } | null
      throw new Error(body?.detail ?? `Nexus core returned ${response.status}.`)
    }
    if (!response.body) throw new Error('This browser cannot stream the Nexus response. Reload and try again.')

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let finalResult: CommandResult | null = null
    let streamError = ''

    const consume = (block: string) => {
      const data = block.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('\n')
      if (!data) return
      const event = JSON.parse(data) as { type?: string; text?: string; message?: string } & CommandResult
      if (event.type === 'token' && event.text) onToken(event.text)
      if (event.type === 'error') streamError = event.message ?? 'The command could not be completed.'
      if (event.type === 'result') finalResult = event as CommandResult
    }

    while (true) {
      const { done, value } = await reader.read()
      buffer += decoder.decode(value, { stream: !done })
      const blocks = buffer.split(/\r?\n\r?\n/)
      buffer = blocks.pop() ?? ''
      blocks.forEach(consume)
      if (done) break
    }
    if (buffer.trim()) consume(buffer)
    if (streamError) throw new Error(streamError)
    if (!finalResult) throw new Error('Nexus ended the response without a result. No action was authorised.')
    return finalResult
  },
  approve: (id: string, clientBrowser = false) => request<ApprovalResult>(`/api/approvals/${id}/approve`, {
    method: 'POST',
    body: JSON.stringify({ client_browser: clientBrowser }),
  }),
  reject: (id: string) => request<ApprovalResult>(`/api/approvals/${id}/reject`, { method: 'POST' }),
}
