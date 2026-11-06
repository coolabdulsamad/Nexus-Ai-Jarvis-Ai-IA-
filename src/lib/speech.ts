export type Viseme = 'rest' | 'closed' | 'teeth' | 'wide' | 'open' | 'round'

export function visemeForCharacter(character: string): Viseme {
  const letter = character.toLowerCase()
  if ('mbp'.includes(letter)) return 'closed'
  if ('fv'.includes(letter)) return 'teeth'
  if ('ouwq'.includes(letter)) return 'round'
  if ('aey'.includes(letter)) return 'open'
  if (/[a-z]/.test(letter)) return 'wide'
  return 'rest'
}

export function speechErrorMessage(code: string): string {
  const messages: Record<string, string> = {
    'not-allowed': 'Microphone permission was denied. Allow it in the browser or continue with text.',
    'service-not-allowed': 'The browser blocked its speech service. Continue with text or try another browser.',
    'audio-capture': 'No working microphone was found. Check your input device and try again.',
    'no-speech': 'No speech was detected. Try again and speak after the listening indicator appears.',
    network: 'The browser speech service could not be reached. Text commands still work offline.',
    'language-not-supported': 'This browser does not support the selected recognition language.',
  }
  return messages[code] ?? `Voice input stopped (${code || 'unknown error'}). You can continue with text.`
}
