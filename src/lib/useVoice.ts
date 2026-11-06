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

export function useVoice() {
  const recognitionRef = useRef<RecognitionLike | null>(null)
  const [listening, setListening] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [viseme, setViseme] = useState<Viseme>('rest')
  const [voiceError, setVoiceError] = useState('')
  const [recognitionSupported] = useState(() => Boolean(recognitionConstructor()))
  const [synthesisSupported] = useState(
    () => typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window,
  )

  const stopSpeaking = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel()
    setSpeaking(false)
    setViseme('rest')
  }, [])

  const stopListening = useCallback(() => {
    recognitionRef.current?.abort()
    recognitionRef.current = null
    setListening(false)
  }, [])

  const startListening = useCallback((onFinal: (text: string) => void) => {
    const Constructor = recognitionConstructor()
    if (!Constructor) {
      setVoiceError('Voice input is not supported by this browser. Text commands remain available.')
      return
    }

    stopSpeaking()
    recognitionRef.current?.abort()
    setVoiceError('')
    setTranscript('')

    const recognition = new Constructor()
    recognitionRef.current = recognition
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = 'en-US'

    recognition.onstart = () => setListening(true)
    recognition.onend = () => {
      setListening(false)
      if (recognitionRef.current === recognition) recognitionRef.current = null
    }
    recognition.onerror = (event) => {
      setListening(false)
      setVoiceError(speechErrorMessage(event.error))
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
  }, [stopSpeaking])

  const speak = useCallback((text: string, enabled: boolean, rate: number) => {
    if (!enabled || !text.trim()) return
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setVoiceError('Spoken replies are not supported by this browser. Text responses remain available.')
      return
    }

    recognitionRef.current?.abort()
    recognitionRef.current = null
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
      setSpeaking(false)
      setViseme('rest')
    }
    utterance.onerror = (event) => {
      setSpeaking(false)
      setViseme('rest')
      if (event.error !== 'canceled' && event.error !== 'interrupted') {
        setVoiceError(`Spoken reply stopped (${event.error}). The text response is still available.`)
      }
    }

    setSpeaking(true)
    setViseme('open')
    window.speechSynthesis.speak(utterance)
  }, [])

  useEffect(() => () => {
    recognitionRef.current?.abort()
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel()
  }, [])

  return {
    recognitionSupported,
    synthesisSupported,
    listening,
    speaking,
    transcript,
    viseme,
    voiceError,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
    clearVoiceError: () => setVoiceError(''),
  }
}
