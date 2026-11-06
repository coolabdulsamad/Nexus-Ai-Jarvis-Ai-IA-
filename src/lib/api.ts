import type {
  Approval,
  ApprovalResult,
  AssistantSettings,
  AssistantSettingsUpdate,
  AuditEvent,
  Capability,
  CommandResult,
  ConversationEntry,
  Health,
  MemoryRecord,
  Note,
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
  approvals: async (status?: string) =>
    (await request<{ approvals: Approval[] }>(`/api/approvals${status ? `?status=${status}` : ''}`)).approvals,
  audit: async () => (await request<{ events: AuditEvent[] }>('/api/audit?limit=60')).events,
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
