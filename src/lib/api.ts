import type {
  Approval,
  ApprovalResult,
  AuditEvent,
  Capability,
  CommandResult,
  Health,
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
  approvals: async (status?: string) =>
    (await request<{ approvals: Approval[] }>(`/api/approvals${status ? `?status=${status}` : ''}`)).approvals,
  audit: async () => (await request<{ events: AuditEvent[] }>('/api/audit?limit=60')).events,
  command: (text: string) =>
    request<CommandResult>('/api/commands', { method: 'POST', body: JSON.stringify({ text }) }),
  approve: (id: string) => request<ApprovalResult>(`/api/approvals/${id}/approve`, { method: 'POST' }),
  reject: (id: string) => request<ApprovalResult>(`/api/approvals/${id}/reject`, { method: 'POST' }),
}
