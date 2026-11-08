import { describe, expect, it } from 'vitest'
import { extractWakeCommand } from './useVoice'

describe('wake-word command extraction', () => {
  it('accepts the configured word with a command and optional hey prefix', () => {
    expect(extractWakeCommand('Nexus, open Documents in VS Code', 'Nexus')).toEqual({
      matched: true,
      command: 'open Documents in VS Code',
    })
    expect(extractWakeCommand('Hey Jarvis what time is it?', 'Jarvis')).toEqual({
      matched: true,
      command: 'what time is it?',
    })
  })

  it('recognizes the wake word alone without inventing a command', () => {
    expect(extractWakeCommand('Okay Nexus', 'Nexus')).toEqual({ matched: true, command: '' })
  })

  it('does not trigger on a name in the middle of unrelated speech', () => {
    expect(extractWakeCommand('Please tell Nexus about this', 'Nexus').matched).toBe(false)
    expect(extractWakeCommand('open VS Code', 'Nexus').matched).toBe(false)
  })

  it('supports a custom multiword wake phrase safely', () => {
    expect(extractWakeCommand('Hey Computer — system status', 'Computer')).toEqual({
      matched: true,
      command: 'system status',
    })
    expect(extractWakeCommand('My Nexus, what is the time', 'My Nexus')).toEqual({
      matched: true,
      command: 'what is the time',
    })
  })
})
