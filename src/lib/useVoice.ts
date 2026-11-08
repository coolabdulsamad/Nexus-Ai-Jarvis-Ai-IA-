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

function recognitionConstructor(): RecognitionConstructor | undefined {
  if (typeof window === 'undefined') return undefined
  const speechWindow = window as SpeechWindow
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition
}

export function extractWakeCommand(transcript: string, wakeWord: string): { matched: boolean; command: string } {
  const escaped = wakeWord.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (!escaped) return { matched: false, command: '' }
  const match = transcript.trim().match(new RegExp(`^(?:(?:hey|ok|okay)\\s+)?${escaped}\\b[\\s,.:;—-]*(.*)$`, 'i'))
  return { matched: Boolean(match), command: match?.[1]?.trim() ?? '' }
}

export function useVoice() {
  const recognitionRef = useRef<RecognitionLike | null>(null)
  const recognitionModeRef = useRef<'push' | 'wake' | null>(null)
  const wakeDesiredRef = useRef(false)
  const wakeWordRef = useRef('Nexus')
  const wakeCallbackRef = useRef<(text: string) => void>(() => undefined)
  const wakeArmedUntilRef = useRef(0)
  const wakeRestartRef = useRef<number | null>(null)
  const beginWakeRef = useRef<() => void>(() => undefined)
  const speakingRef = useRef(false)
  const [listening, setListening] = useState(false)
  const [wakeActive, setWakeActive] = useState(false)
  const [wakeEnabled, setWakeEnabled] = useState(false)
  const [wakeHeard, setWakeHeard] = useState(false)
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

  const scheduleWakeRestart = useCallback(() => {
    clearWakeRestart()
    if (!wakeDesiredRef.current || speakingRef.current || recognitionRef.current) return
    wakeRestartRef.current = window.setTimeout(() => {
      wakeRestartRef.current = null
      beginWakeRef.current()
    }, 350)
  }, [clearWakeRestart])

  const pauseWakeWord = useCallback(() => {
    clearWakeRestart()
    if (recognitionModeRef.current === 'wake') {
      recognitionRef.current?.abort()
      recognitionRef.current = null
      recognitionModeRef.current = null
    }
    setWakeActive(false)
  }, [clearWakeRestart])

  const stopWakeWord = useCallback(() => {
    wakeDesiredRef.current = false
    setWakeEnabled(false)
    wakeArmedUntilRef.current = 0
    setWakeHeard(false)
    pauseWakeWord()
  }, [pauseWakeWord])

  const resumeWakeWord = useCallback(() => {
    if (wakeDesiredRef.current && !speakingRef.current && !recognitionRef.current) scheduleWakeRestart()
  }, [scheduleWakeRestart])

  const stopSpeaking = useCallback(() => {
    speakingRef.current = false
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel()
    setSpeaking(false)
    setViseme('rest')
    resumeWakeWord()
  }, [resumeWakeWord])

  const stopListening = useCallback(() => {
    if (recognitionModeRef.current === 'wake') {
      stopWakeWord()
      return
    }
    recognitionRef.current?.abort()
    recognitionRef.current = null
    recognitionModeRef.current = null
    setListening(false)
  }, [stopWakeWord])

  const startListening = useCallback((onFinal: (text: string) => void) => {
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
    recognitionRef.current = recognition
    recognitionModeRef.current = 'push'
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = 'en-US'

    recognition.onstart = () => setListening(true)
    recognition.onend = () => {
      setListening(false)
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null
        recognitionModeRef.current = null
      }
    }
    recognition.onerror = (event) => {
      setListening(false)
      if (event.error !== 'aborted') setVoiceError(speechErrorMessage(event.error))
    }
    recognition.onresult = (event) => {
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
        setTranscript(completed)
        recognition.stop()
        onFinal(completed)
      }
    }

    try {
      recognition.start()
    } catch {
      setListening(false)
      setVoiceError('The microphone could not start. Wait a moment, then try again.')
    }
  }, [stopSpeaking, stopWakeWord])

  const beginWakeWord = useCallback(() => {
    const Constructor = recognitionConstructor()
    if (!Constructor || !wakeDesiredRef.current || speakingRef.current || recognitionRef.current) return
    const recognition = new Constructor()
    recognitionRef.current = recognition
    recognitionModeRef.current = 'wake'
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'

    const dispatch = (text: string) => {
      if (!text.trim()) return
      wakeArmedUntilRef.current = 0
      setWakeHeard(false)
      setTranscript(text.trim())
      recognition.stop()
      wakeCallbackRef.current(text.trim())
    }

    recognition.onstart = () => {
      setWakeActive(true)
      setVoiceError('')
    }
    recognition.onend = () => {
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null
        recognitionModeRef.current = null
      }
      setWakeActive(false)
      if (wakeDesiredRef.current && !speakingRef.current) scheduleWakeRestart()
    }
    recognition.onerror = (event) => {
      if (event.error === 'aborted' || event.error === 'no-speech') return
      setWakeActive(false)
      setVoiceError(speechErrorMessage(event.error))
      if (['not-allowed', 'service-not-allowed', 'audio-capture', 'network', 'language-not-supported'].includes(event.error)) {
        wakeDesiredRef.current = false
        setWakeEnabled(false)
        setWakeHeard(false)
      }
    }
    recognition.onresult = (event) => {
      let interim = ''
      let final = ''
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]
        if (result.isFinal) final += result[0].transcript
        else interim += result[0].transcript
      }
      const completed = final.trim()
      const heard = completed || interim.trim()
      const extracted = extractWakeCommand(heard, wakeWordRef.current)
      if (extracted.matched) {
        if (completed && extracted.command) {
          dispatch(extracted.command)
        } else if (completed) {
          wakeArmedUntilRef.current = Date.now() + 8000
          setWakeHeard(true)
          setTranscript(`${wakeWordRef.current} heard. Say your command…`)
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
      setWakeActive(false)
      setVoiceError('The wake-word microphone session could not start. Wait a moment, then try again.')
    }
  }, [scheduleWakeRestart])

  useEffect(() => {
    beginWakeRef.current = beginWakeWord
  }, [beginWakeWord])

  const startWakeWord = useCallback((wakeWord: string, onFinal: (text: string) => void) => {
    if (!recognitionConstructor()) {
      setVoiceError('Wake-word listening needs browser speech recognition. Text commands remain available.')
      return
    }
    stopSpeaking()
    recognitionRef.current?.abort()
    recognitionRef.current = null
    recognitionModeRef.current = null
    wakeWordRef.current = wakeWord.trim()
    wakeCallbackRef.current = onFinal
    wakeDesiredRef.current = true
    setWakeEnabled(true)
    wakeArmedUntilRef.current = 0
    setWakeHeard(false)
    setVoiceError('')
    setTranscript(`Waiting for “${wakeWord.trim()}”…`)
    beginWakeRef.current()
  }, [stopSpeaking])

  const speak = useCallback((text: string, enabled: boolean, rate: number) => {
    pauseWakeWord()
    if (!enabled || !text.trim()) {
      speakingRef.current = false
      resumeWakeWord()
      return
    }
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      speakingRef.current = false
      setVoiceError('Spoken replies are not supported by this browser. Text responses remain available.')
      resumeWakeWord()
      return
    }

    recognitionRef.current?.abort()
    recognitionRef.current = null
    recognitionModeRef.current = null
    setListening(false)
    window.speechSynthesis.cancel()
    setVoiceError('')

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = rate
    utterance.pitch = 0.96
    const voices = window.speechSynthesis.getVoices()
    utterance.voice = voices.find((voice) => voice.default && voice.lang.startsWith('en'))
      ?? voices.find((voice) => voice.lang.startsWith('en'))
      ?? null

    utterance.onstart = () => setSpeaking(true)
    utterance.onboundary = (event) => {
      setSpeaking(true)
      setViseme(visemeForCharacter(text[event.charIndex] ?? ''))
    }
    utterance.onend = () => {
      speakingRef.current = false
      setSpeaking(false)
      setViseme('rest')
      resumeWakeWord()
    }
    utterance.onerror = (event) => {
      speakingRef.current = false
      setSpeaking(false)
      setViseme('rest')
      if (event.error !== 'canceled' && event.error !== 'interrupted') {
        setVoiceError(`Spoken reply stopped (${event.error}). The text response is still available.`)
      }
      resumeWakeWord()
    }

    speakingRef.current = true
    setSpeaking(true)
    setViseme('open')
    window.speechSynthesis.speak(utterance)
  }, [pauseWakeWord, resumeWakeWord])

  useEffect(() => () => {
    wakeDesiredRef.current = false
    clearWakeRestart()
    recognitionRef.current?.abort()
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel()
  }, [clearWakeRestart])

  return {
    recognitionSupported,
    synthesisSupported,
    listening,
    wakeActive,
    wakeEnabled,
    wakeHeard,
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
