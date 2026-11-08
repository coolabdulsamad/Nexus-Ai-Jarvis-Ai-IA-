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
  approve: (id: string, clientBrowser = false) => request<ApprovalResult>(`/api/approvals/${id}/approve`, {
    method: 'POST',
    body: JSON.stringify({ client_browser: clientBrowser }),
  }),
  reject: (id: string) => request<ApprovalResult>(`/api/approvals/${id}/reject`, { method: 'POST' }),
}
