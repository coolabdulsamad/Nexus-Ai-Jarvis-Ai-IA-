export type CommandStatus =
  | 'completed'
  | 'approval_required'
  | 'rejected'
  | 'unavailable'
  | 'unsupported'

export interface Health {
  status: 'online'
  service: string
  version: string
  database: string
  time: string
  notes: number
  pending_approvals: number
  audit_events: number
}

export interface Capability {
  id: string
  label: string
  status: 'available' | 'planned'
  tier: number
  description: string
}

export interface Note {
  id: string
  content: string
  created_at: string
}

export interface Approval {
  id: string
  command_id: string
  action: string
  payload: { content?: string }
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  resolved_at: string | null
}

export interface AuditEvent {
  id: number
  event_type: string
  subject_id: string | null
  status: string
  detail: string
  created_at: string
}

export interface CommandResult {
  command_id: string
  intent: string
  status: CommandStatus
  message: string
  approval?: Approval
}

export interface ApprovalResult extends Approval {
  note: Note | null
  message: string
}
