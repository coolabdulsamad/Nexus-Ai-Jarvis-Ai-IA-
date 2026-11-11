import type { CommandResult, DirectoryEntry } from '@/types/nexus'

export interface PendingFollowUp {
  kind: 'system.folder' | 'assistant.reply'
  application: 'vscode' | 'files'
  directories: DirectoryEntry[]
}

export function followUpForResult(result: CommandResult): PendingFollowUp | null {
  if (result.follow_up?.kind === 'system.folder') {
    return {
      kind: 'system.folder',
      application: result.follow_up.application,
      directories: result.directories ?? [],
    }
  }
  if (result.intent === 'assistant.chat' && result.status === 'completed' && result.message.trim().endsWith('?')) {
    return { kind: 'assistant.reply', application: 'vscode', directories: [] }
  }
  return null
}

const ordinals: Record<string, number> = {
  first: 0,
  second: 1,
  third: 2,
  fourth: 3,
  fifth: 4,
  sixth: 5,
  seventh: 6,
  eighth: 7,
}

export function folderReplyCommand(text: string, pending: PendingFollowUp): string {
  const reply = text.trim()
  if (/^(?:cancel|stop|never mind|nevermind|nothing|forget it)[.!?]?$/i.test(reply)) return ''

  if (/^(?:please\s+)?(?:open|launch)\b/i.test(reply)) return reply
  const normalized = reply.toLowerCase().replace(/[.!?]/g, '').trim()
  const ordinal = normalized.match(/^(?:the\s+)?(first|second|third|fourth|fifth|sixth|seventh|eighth)(?:\s+one)?$/)
  const numeric = normalized.match(/^(?:number\s+|option\s+)?([1-8])$/)
  const index = ordinal ? ordinals[ordinal[1]] : numeric ? Number(numeric[1]) - 1 : -1
  const nameMatches = pending.directories.filter((directory) => normalized === directory.name.toLowerCase())
  const pathMatch = pending.directories.find((directory) => normalized === directory.path.toLowerCase())
  const selected = index >= 0
    ? pending.directories[index]
    : pathMatch ?? (nameMatches.length === 1 ? nameMatches[0] : undefined)
  const application = pending.application === 'files' ? 'File Manager' : 'VS Code'
  if (selected) return `Open folder ${selected.path} in ${application}`

  const folder = reply.replace(/^(?:the\s+)?(?:folder|directory)\s+/i, '').trim()
  if (!folder) return ''
  if (/\s+(?:in|with|using)\s+(?:vs\s*code|visual\s+studio\s+code|vscode|file\s+manager|files)\.?$/i.test(folder)) {
    return `Open folder ${folder}`
  }
  return `Open folder ${folder} in ${application}`
}
