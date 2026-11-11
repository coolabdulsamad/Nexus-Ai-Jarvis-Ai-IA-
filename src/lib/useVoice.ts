import { useCallback, useEffect, useRef, useState } from 'react'
import { speechErrorMessage, visemeForCharacter } from './speech'
import type { Viseme } from './speech'

interface RecognitionResultLike {
  isFinal: boolean
  0: { transcript: string }
}

interface RecognitionEventLike {
  resultIndex: number
  results: { length: number; [index: number]: RecognitionResultLike }
}

interface RecognitionErrorLike {
  error: string
}

interface RecognitionLike {
  continuous: boolean
  interimResults: boolean
  lang: string
  onstart: (() => void) | null
  onend: (() => void) | null
  onerror: ((event: RecognitionErrorLike) => void) | null
  onresult: ((event: RecognitionEventLike) => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

type RecognitionConstructor = new () => RecognitionLike

type SpeechWindow = Window & {
  SpeechRecognition?: RecognitionConstructor
  webkitSpeechRecognition?: RecognitionConstructor
}

export type VoiceState =
  | 'idle'
  | 'push_listening'
  | 'wake_listening'
  | 'wake_followup'
  | 'processing'
  | 'speaking'
  | 'followup_listening'

const NEXUS_RECOGNITION_VARIANTS = new Set([
  'nexus', 'nextus', 'nexis', 'nexxus', 'nex us', 'next us', 'next to', 'nex to',
])

function recognitionConstructor(): RecognitionConstructor | undefined {
  if (typeof window === 'undefined') return undefined
  const speechWindow = window as SpeechWindow
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition
}

function normalizedTokens(value: string): string[] {
  return tokenizeSpeech(value).map((token) => token.normalized)
}

function tokenizeSpeech(value: string): { normalized: string; end: number }[] {
  return [...value.toLowerCase().matchAll(/[a-z0-9]+/g)].map((match) => ({
    normalized: match[0],
    end: (match.index ?? 0) + match[0].length,
  }))
}

export function parseWakePhrases(value: string | string[]): string[] {
  const phrases = Array.isArray(value) ? value : value.split(/[,\n]/)
  const unique = new Map<string, string>()
  phrases.forEach((phrase) => {
    const cleaned = phrase.trim()
    if (cleaned) unique.set(normalizedTokens(cleaned).join(' '), cleaned)
  })
  return [...unique.values()].slice(0, 8)
}

function editDistanceWithinOne(left: string, right: string): boolean {
  if (Math.abs(left.length - right.length) > 1) return false
  if (left === right) return true
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row]
    for (let column = 1; column <= right.length; column += 1) {
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1),
      )
    }
    previous = current
  }
  return previous[right.length] <= 1
}

export function extractWakeCommand(
  transcript: string,
  wakeWords: string | string[],
): { matched: boolean; command: string } {
  const spokenTokens = tokenizeSpeech(transcript)
  const tokens = spokenTokens.map((token) => token.normalized)
  const phrases = parseWakePhrases(wakeWords)
    .map((phrase) => normalizedTokens(phrase))
    .filter((phrase) => phrase.length)
    .sort((left, right) => right.length - left.length)
  let bestConsumed = 0

  phrases.forEach((phrase) => {
    const offsets = [0]
    if (['hey', 'ok', 'okay'].includes(tokens[0]) && phrase[0] !== tokens[0]) offsets.push(1)
    offsets.forEach((offset) => {
      let consumed = 0
      const direct = phrase.every((token, index) => tokens[offset + index] === token)
      if (direct) {
        consumed = offset + phrase.length
      } else if (phrase.length === 1) {
        const candidate = tokens[offset] ?? ''
        const pair = `${candidate} ${tokens[offset + 1] ?? ''}`.trim()
        const isNexusVariant = phrase[0] === 'nexus'
          && (NEXUS_RECOGNITION_VARIANTS.has(candidate) || NEXUS_RECOGNITION_VARIANTS.has(pair))
        const boundedVariant = candidate.length >= 4 && phrase[0].length >= 5
          && editDistanceWithinOne(candidate, phrase[0])
        if (isNexusVariant || boundedVariant) {
          consumed = offset + (NEXUS_RECOGNITION_VARIANTS.has(pair) && pair !== candidate ? 2 : 1)
        }
      }
      if (consumed > bestConsumed) bestConsumed = consumed
    })
  })

  return bestConsumed
    ? {
      matched: true,
      command: transcript.slice(spokenTokens[bestConsumed - 1].end).replace(/^[\s,.:;—-]+/, '').trim(),
    }
    : { matched: false, command: '' }
}

export function useVoice() {
  const recognitionRef = useRef<RecognitionLike | null>(null)
  const recognitionModeRef = useRef<'push' | 'wake' | 'followup' | null>(null)
  const wakeDesiredRef = useRef(false)
  const wakePhrasesRef = useRef<string[]>(['Nexus', 'Hey'])
  const speechLocaleRef = useRef('en-NG')
  const wakeCallbackRef = useRef<(text: string) => void>(() => undefined)
  const wakeArmedUntilRef = useRef(0)
  const followUpUntilRef = useRef(0)
  const wakeRestartRef = useRef<number | null>(null)
  const followUpTimerRef = useRef<number | null>(null)
  const beginWakeRef = useRef<() => void>(() => undefined)
  const speakingRef = useRef(false)
  const speechFollowUpRef = useRef(false)
  const speechIdRef = useRef(0)
  const [voiceState, setVoiceState] = useState<VoiceState>('idle')
  const [wakeEnabled, setWakeEnabled] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [viseme, setViseme] = useState<Viseme>('rest')
  const [voiceError, setVoiceError] = useState('')
  const [recognitionSupported] = useState(() => Boolean(recognitionConstructor()))
  const [synthesisSupported] = useState(
    () => typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window,
  )

  const clearWakeRestart = useCallback(() => {
    if (wakeRestartRef.current !== null) window.clearTimeout(wakeRestartRef.current)
    wakeRestartRef.current = null
  }, [])

  const clearFollowUpTimer = useCallback(() => {
    if (followUpTimerRef.current !== null) window.clearTimeout(followUpTimerRef.current)
    followUpTimerRef.current = null
  }, [])

  const scheduleWakeRestart = useCallback(() => {
    clearWakeRestart()
    if (!wakeDesiredRef.current || speakingRef.current || recognitionRef.current) return
    wakeRestartRef.current = window.setTimeout(() => {
      wakeRestartRef.current = null
      beginWakeRef.current()
    }, 250)
  }, [clearWakeRestart])

  const pauseWakeWord = useCallback(() => {
    clearWakeRestart()
    clearFollowUpTimer()
    wakeArmedUntilRef.current = 0
    followUpUntilRef.current = 0
    if (recognitionModeRef.current === 'wake' || recognitionModeRef.current === 'followup') {
      recognitionRef.current?.abort()
      recognitionRef.current = null
      recognitionModeRef.current = null
    }
    setVoiceState(wakeDesiredRef.current ? 'processing' : 'idle')
  }, [clearFollowUpTimer, clearWakeRestart])

  const resumeWakeWord = useCallback(() => {
    if (!wakeDesiredRef.current) {
      setVoiceState('idle')
      return
    }
    if (speakingRef.current || recognitionRef.current) return
    const followUp = Date.now() < followUpUntilRef.current
    setVoiceState(followUp ? 'followup_listening' : 'wake_listening')
    scheduleWakeRestart()
  }, [scheduleWakeRestart])

  const resumeAfterSpeech = useCallback(() => {
    if (speechFollowUpRef.current && wakeDesiredRef.current) {
      speechFollowUpRef.current = false
      followUpUntilRef.current = Date.now() + 12000
      setVoiceState('followup_listening')
      setTranscript('Listening for your reply… no wake phrase is needed.')
      clearFollowUpTimer()
      followUpTimerRef.current = window.setTimeout(() => {
        followUpTimerRef.current = null
        followUpUntilRef.current = 0
        if (recognitionModeRef.current === 'followup') {
          recognitionRef.current?.abort()
          recognitionRef.current = null
          recognitionModeRef.current = null
        }
        if (wakeDesiredRef.current && !speakingRef.current) {
          setVoiceState('wake_listening')
          setTranscript('Reply window closed. Say a wake phrase to start again.')
          scheduleWakeRestart()
        }
      }, 12000)
      scheduleWakeRestart()
      return
    }
    speechFollowUpRef.current = false
    resumeWakeWord()
  }, [clearFollowUpTimer, resumeWakeWord, scheduleWakeRestart])

  const stopSpeaking = useCallback(() => {
    speechIdRef.current += 1
    speechFollowUpRef.current = false
    speakingRef.current = false
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel()
    setSpeaking(false)
    setViseme('rest')
    resumeWakeWord()
  }, [resumeWakeWord])

  const stopWakeWord = useCallback(() => {
    wakeDesiredRef.current = false
    setWakeEnabled(false)
    speechFollowUpRef.current = false
    pauseWakeWord()
  }, [pauseWakeWord])

  const stopListening = useCallback(() => {
    if (recognitionModeRef.current === 'wake' || recognitionModeRef.current === 'followup') {
      stopWakeWord()
      return
    }
    recognitionRef.current?.abort()
    recognitionRef.current = null
    recognitionModeRef.current = null
    setVoiceState('idle')
  }, [stopWakeWord])

  const startListening = useCallback((onFinal: (text: string) => void, locale = 'en-NG') => {
    const Constructor = recognitionConstructor()
    if (!Constructor) {
      setVoiceError('Voice input is not supported by this browser. Text commands remain available.')
      return
    }

    stopWakeWord()
    stopSpeaking()
    recognitionRef.current?.abort()
    recognitionRef.current = null
    recognitionModeRef.current = null
    setVoiceError('')
    setTranscript('')

    const recognition = new Constructor()
    let handled = false
    recognitionRef.current = recognition
    recognitionModeRef.current = 'push'
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = locale

    recognition.onstart = () => setVoiceState('push_listening')
    recognition.onend = () => {
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null
        recognitionModeRef.current = null
        setVoiceState('idle')
      }
    }
    recognition.onerror = (event) => {
      if (event.error !== 'aborted') setVoiceError(speechErrorMessage(event.error))
    }
    recognition.onresult = (event) => {
      if (handled) return
      let interim = ''
      let final = ''
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]
        if (result.isFinal) final += result[0].transcript
        else interim += result[0].transcript
      }
      if (interim) setTranscript(interim.trim())
      const completed = final.trim()
      if (completed) {
        handled = true
        setTranscript(completed)
        setVoiceState('processing')
        recognition.stop()
        onFinal(completed)
      }
    }

    try {
      recognition.start()
    } catch {
      recognitionRef.current = null
      recognitionModeRef.current = null
      setVoiceState('idle')
      setVoiceError('The microphone could not start. Wait a moment, then try again.')
    }
  }, [stopSpeaking, stopWakeWord])

  const beginWakeWord = useCallback(() => {
    const Constructor = recognitionConstructor()
    if (!Constructor || !wakeDesiredRef.current || speakingRef.current || recognitionRef.current) return
    const recognition = new Constructor()
    const mode = Date.now() < followUpUntilRef.current ? 'followup' : 'wake'
    let handled = false
    recognitionRef.current = recognition
    recognitionModeRef.current = mode
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = speechLocaleRef.current

    const dispatch = (text: string) => {
      if (!text.trim() || handled) return
      handled = true
      clearFollowUpTimer()
      wakeArmedUntilRef.current = 0
      followUpUntilRef.current = 0
      setVoiceState('processing')
      setTranscript(text.trim())
      recognition.stop()
      wakeCallbackRef.current(text.trim())
    }

    recognition.onstart = () => {
      setVoiceState(mode === 'followup' ? 'followup_listening' : Date.now() < wakeArmedUntilRef.current ? 'wake_followup' : 'wake_listening')
      setVoiceError('')
    }
    recognition.onend = () => {
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null
        recognitionModeRef.current = null
      }
      if (wakeDesiredRef.current && !speakingRef.current && !handled) {
        setVoiceState(Date.now() < followUpUntilRef.current ? 'followup_listening' : Date.now() < wakeArmedUntilRef.current ? 'wake_followup' : 'wake_listening')
        scheduleWakeRestart()
      }
    }
    recognition.onerror = (event) => {
      if (event.error === 'aborted' || event.error === 'no-speech') return
      setVoiceError(speechErrorMessage(event.error))
      if (['not-allowed', 'service-not-allowed', 'audio-capture', 'network', 'language-not-supported'].includes(event.error)) {
        wakeDesiredRef.current = false
        followUpUntilRef.current = 0
        setWakeEnabled(false)
        setVoiceState('idle')
      }
    }
    recognition.onresult = (event) => {
      if (handled) return
      let interim = ''
      let final = ''
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]
        if (result.isFinal) final += result[0].transcript
        else interim += result[0].transcript
      }
      const completed = final.trim()
      const heard = completed || interim.trim()

      if (mode === 'followup' && Date.now() < followUpUntilRef.current) {
        if (completed) dispatch(completed)
        else if (interim) setTranscript(interim.trim())
        return
      }

      const extracted = extractWakeCommand(heard, wakePhrasesRef.current)
      if (extracted.matched) {
        if (completed && extracted.command) {
          dispatch(extracted.command)
        } else if (completed) {
          wakeArmedUntilRef.current = Date.now() + 10000
          setVoiceState('wake_followup')
          setTranscript('Wake phrase heard. Say your command…')
          clearFollowUpTimer()
          followUpTimerRef.current = window.setTimeout(() => {
            followUpTimerRef.current = null
            wakeArmedUntilRef.current = 0
            if (wakeDesiredRef.current && !speakingRef.current && recognitionModeRef.current === 'wake') {
              setVoiceState('wake_listening')
              setTranscript('Command window closed. Say a wake phrase to start again.')
            }
          }, 10000)
        } else {
          setTranscript(heard)
        }
        return
      }
      if (completed && Date.now() < wakeArmedUntilRef.current) {
        dispatch(completed)
      } else if (!completed && interim) {
        setTranscript(interim.trim())
      }
    }

    try {
      recognition.start()
    } catch {
      recognitionRef.current = null
      recognitionModeRef.current = null
      setVoiceState('wake_listening')
      setVoiceError('The wake-word microphone session could not start. Wait a moment, then try again.')
    }
  }, [clearFollowUpTimer, scheduleWakeRestart])

  useEffect(() => {
    beginWakeRef.current = beginWakeWord
  }, [beginWakeWord])

  const startWakeWord = useCallback((
    wakeWords: string | string[],
    onFinal: (text: string) => void,
    locale = 'en-NG',
  ) => {
    if (!recognitionConstructor()) {
      setVoiceError('Wake-word listening needs browser speech recognition. Text commands remain available.')
      return
    }
    stopSpeaking()
    recognitionRef.current?.abort()
    recognitionRef.current = null
    recognitionModeRef.current = null
    wakePhrasesRef.current = parseWakePhrases(wakeWords)
    speechLocaleRef.current = locale
    wakeCallbackRef.current = onFinal
    wakeDesiredRef.current = true
    setWakeEnabled(true)
    wakeArmedUntilRef.current = 0
    followUpUntilRef.current = 0
    setVoiceError('')
    setVoiceState('wake_listening')
    setTranscript(`Waiting for ${wakePhrasesRef.current.map((phrase) => `“${phrase}”`).join(' or ')}…`)
    beginWakeRef.current()
  }, [stopSpeaking])

  const speak = useCallback((text: string, enabled: boolean, rate: number, followUp = false) => {
    pauseWakeWord()
    speechFollowUpRef.current = followUp && wakeDesiredRef.current
    const speechId = speechIdRef.current + 1
    speechIdRef.current = speechId
    if (!enabled || !text.trim()) {
      speakingRef.current = false
      resumeAfterSpeech()
      return
    }
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      speakingRef.current = false
      setVoiceError('Spoken replies are not supported by this browser. Text responses remain available.')
      resumeAfterSpeech()
      return
    }

    recognitionRef.current?.abort()
    recognitionRef.current = null
    recognitionModeRef.current = null
    window.speechSynthesis.cancel()
    setVoiceError('')

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = rate
    utterance.pitch = 0.96
    const voices = window.speechSynthesis.getVoices()
    utterance.voice = voices.find((voice) => voice.default && voice.lang.startsWith('en'))
      ?? voices.find((voice) => voice.lang.startsWith('en'))
      ?? null

    utterance.onstart = () => {
      if (speechIdRef.current === speechId) setVoiceState('speaking')
    }
    utterance.onboundary = (event) => {
      if (speechIdRef.current !== speechId) return
      setVoiceState('speaking')
      setViseme(visemeForCharacter(text[event.charIndex] ?? ''))
    }
    utterance.onend = () => {
      if (speechIdRef.current !== speechId) return
      speakingRef.current = false
      setSpeaking(false)
      setViseme('rest')
      resumeAfterSpeech()
    }
    utterance.onerror = (event) => {
      if (speechIdRef.current !== speechId) return
      speakingRef.current = false
      setSpeaking(false)
      setViseme('rest')
      if (event.error !== 'canceled' && event.error !== 'interrupted') {
        setVoiceError(`Spoken reply stopped (${event.error}). The text response is still available.`)
      }
      resumeAfterSpeech()
    }

    speakingRef.current = true
    setSpeaking(true)
    setVoiceState('speaking')
    setViseme('open')
    window.speechSynthesis.speak(utterance)
  }, [pauseWakeWord, resumeAfterSpeech])

  useEffect(() => () => {
    wakeDesiredRef.current = false
    speechIdRef.current += 1
    clearWakeRestart()
    clearFollowUpTimer()
    recognitionRef.current?.abort()
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel()
  }, [clearFollowUpTimer, clearWakeRestart])

  return {
    recognitionSupported,
    synthesisSupported,
    voiceState,
    listening: voiceState === 'push_listening',
    wakeActive: ['wake_listening', 'wake_followup', 'followup_listening'].includes(voiceState),
    wakeEnabled,
    wakeHeard: voiceState === 'wake_followup',
    followUpListening: voiceState === 'followup_listening',
    speaking,
    transcript,
    viseme,
    voiceError,
    startListening,
    stopListening,
    startWakeWord,
    stopWakeWord,
    suspendWakeWord: pauseWakeWord,
    resumeWakeWord,
    speak,
    stopSpeaking,
    clearVoiceError: () => setVoiceError(''),
  }
}
