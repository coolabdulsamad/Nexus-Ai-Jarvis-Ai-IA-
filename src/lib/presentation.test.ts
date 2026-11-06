import { describe, expect, it } from 'vitest'
import { eventLabel, formatTimestamp, shortId } from './presentation'

describe('presentation helpers', () => {
  it('makes audit event names readable', () => {
    expect(eventLabel('approval.approved')).toBe('Approval / Approved')
  })

  it('keeps identifiers compact', () => {
    expect(shortId('12345678-abcd')).toBe('12345678')
  })

  it('handles invalid timestamps without throwing', () => {
    expect(formatTimestamp('not-a-date')).toBe('Unknown time')
  })
})
