import { describe, expect, it } from 'vitest'
import { folderReplyCommand, followUpForResult } from './conversation'
import type { CommandResult } from '@/types/nexus'

const pending = {
  kind: 'system.folder' as const,
  application: 'vscode' as const,
  directories: [
    { name: 'Projects', path: '/home/user/one/Projects', parent: '/home/user/one' },
    { name: 'Projects', path: '/home/user/two/Projects', parent: '/home/user/two' },
  ],
}

describe('conversational follow-up routing', () => {
  it('marks deterministic folder clarification and genuine model questions for follow-up', () => {
    const clarification: CommandResult = {
      command_id: 'one',
      intent: 'system.clarify_folder',
      status: 'completed',
      message: 'Which folder would you like to open with VS Code?',
      follow_up: { kind: 'system.folder', application: 'vscode' },
    }
    expect(followUpForResult(clarification)?.kind).toBe('system.folder')
    expect(followUpForResult({ ...clarification, intent: 'assistant.chat', message: 'Would you like details?', follow_up: undefined })?.kind).toBe('assistant.reply')
    expect(followUpForResult({ ...clarification, intent: 'assistant.chat', message: 'Here is the answer.', follow_up: undefined })).toBeNull()
  })

  it('turns a folder answer into the same validated command path', () => {
    expect(folderReplyCommand('Documents', pending)).toBe('Open folder Documents in VS Code')
    expect(folderReplyCommand('Documents in File Manager', pending)).toBe('Open folder Documents in File Manager')
  })

  it('selects an exact ambiguous choice by ordinal, number, name or path', () => {
    expect(folderReplyCommand('the first one', pending)).toBe('Open folder /home/user/one/Projects in VS Code')
    expect(folderReplyCommand('2', pending)).toBe('Open folder /home/user/two/Projects in VS Code')
    expect(folderReplyCommand('/home/user/two/Projects', pending)).toBe('Open folder /home/user/two/Projects in VS Code')
  })

  it('never turns cancellation into a launch request', () => {
    expect(folderReplyCommand('cancel', pending)).toBe('')
    expect(folderReplyCommand('never mind', pending)).toBe('')
  })
})
