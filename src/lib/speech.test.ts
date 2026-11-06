import { describe, expect, it } from 'vitest'
import { speechErrorMessage, visemeForCharacter } from './speech'

describe('speech presentation helpers', () => {
  it('maps groups of sounds to visible mouth shapes', () => {
    expect(visemeForCharacter('m')).toBe('closed')
    expect(visemeForCharacter('F')).toBe('teeth')
    expect(visemeForCharacter('o')).toBe('round')
    expect(visemeForCharacter('a')).toBe('open')
    expect(visemeForCharacter('t')).toBe('wide')
    expect(visemeForCharacter(' ')).toBe('rest')
  })

  it('explains microphone denial without hiding the text fallback', () => {
    expect(speechErrorMessage('not-allowed')).toContain('Microphone permission was denied')
    expect(speechErrorMessage('not-allowed')).toContain('continue with text')
    expect(speechErrorMessage('network')).toContain('Text commands still work')
  })
})
