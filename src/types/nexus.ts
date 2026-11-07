export type CommandStatus =
  | 'completed'
  | 'approval_required'
  | 'rejected'
  | 'unavailable'
  | 'unsupported'
  | 'failed'

export type AvatarMode = 'globe' | 'humanoid'

export interface AssistantSettings {
  assistant_name: string
  voice_enabled: boolean
  voice_rate: number
  avatar_mode: AvatarMode
}

export type AssistantSettingsUpdate = Partial<AssistantSettings>

export interface Health {
  status: 'online'
  service: string
  version: string
  database: string
  time: string
  notes: number
  pending_approvals: number
  audit_events: number
  memory_records: number
  conversations: number
  devices: number
  camera_sessions: number
}

export type CameraSessionStatus = 'approved' | 'active' | 'unavailable' | 'stopped'

export interface CameraSession {
  id: string
  approval_id: string
  status: CameraSessionStatus
  created_at: string
  updated_at: string
}

export type CameraEvent = 'started' | 'unavailable' | 'stopped'

export type DevicePlatform = 'android' | 'iphone'

export interface OwnedDevice {
  id: string
  name: string
  platform: DevicePlatform
  label: string
  connection_status: 'not_connected'
  capabilities: string[]
  limitations: string[]
  created_at: string
}

export type MemoryKind = 'preference' | 'application' | 'file' | 'device' | 'fact'

export interface MemoryRecord {
  id: string
  kind: MemoryKind
  content: string
  created_at: string
  updated_at: string
}

export interface ConversationEntry {
  id: string
  input_text: string
  intent: string
  status: CommandStatus | 'processing'
  response: string
  created_at: string
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
  payload: {
    content?: string
    kind?: MemoryKind
    url?: string
    query?: string
    display_command?: string
    working_directory?: string
    platform?: DevicePlatform
    name?: string
    video?: boolean
    audio?: boolean
    recording?: boolean
    storage?: 'none'
  }
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
  output?: string | null
  approval?: Approval
}

export interface ApprovalResult extends Approval {
  note: Note | null
  memory: MemoryRecord | null
  device: OwnedDevice | null
  camera_session: CameraSession | null
  message: string
  output: string | null
  command_status: CommandStatus
}
