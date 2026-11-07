import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  Activity,
  ArrowUpRight,
  AudioLines,
  BookOpen,
  Camera,
  CameraOff,
  Check,
  ChevronRight,
  CircleDot,
  Database,
  FileClock,
  Globe2,
  House,
  KeyRound,
  Menu,
  MessageSquareText,
  Mic,
  MonitorCog,
  Network,
  NotebookPen,
  Send,
  Settings,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Square,
  TerminalSquare,
  WifiOff,
  UserRound,
  X,
  XCircle,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import NexusGlobe from '@/components/NexusGlobe'
import NexusHumanoid from '@/components/NexusHumanoid'
import VoiceSettings from '@/components/VoiceSettings'
import { nexusApi } from '@/lib/api'
import { requestCameraStream, stopCameraStream } from '@/lib/camera'
import { eventLabel, formatTimestamp, shortId } from '@/lib/presentation'
import { useVoice } from '@/lib/useVoice'
import type {
  Approval,
  AssistantSettings,
  AvatarMode,
  AuditEvent,
  CameraSession,
  Capability,
  CommandResult,
  ConversationEntry,
  DevicePlatform,
  Health,
  MemoryRecord,
  Note,
  OwnedDevice,
} from '@/types/nexus'

const quickCommands = [
  'What time is it?',
  'System status',
  'Take a note: review the camera connector plan',
  'Remember preference: I prefer concise answers',
  'Search Google for local AI safety',
  'Show devices',
  'Home status',
  'Start camera preview',
  'Camera status',
  'Show Git status',
]

const defaultSettings: AssistantSettings = {
  assistant_name: 'Nexus',
  voice_enabled: true,
  voice_rate: 1,
  avatar_mode: 'globe',
}

function BrandMark({ small = false }: { small?: boolean }) {
  return (
    <span className={small ? 'brand-mark brand-mark-small' : 'brand-mark'} aria-hidden="true">
      <svg viewBox="0 0 40 40" fill="none">
        <path d="M10 29V11L30 29V11" stroke="currentColor" strokeWidth="2.5" />
        <circle cx="10" cy="10" r="2.5" fill="currentColor" />
        <circle cx="30" cy="30" r="2.5" fill="currentColor" />
      </svg>
    </span>
  )
}

function SectionHeading({
  eyebrow,
  title,
  icon: Icon,
  aside,
}: {
  eyebrow: string
  title: string
  icon: LucideIcon
  aside?: string
}) {
  return (
    <div className="section-heading">
      <div className="section-title-group">
        <Icon size={17} strokeWidth={1.6} />
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h2>{title}</h2>
        </div>
      </div>
      {aside && <span className="section-aside">{aside}</span>}
    </div>
  )
}

function EmptyState({ children }: { children: string }) {
  return (
    <div className="empty-state">
      <CircleDot size={16} />
      <span>{children}</span>
    </div>
  )
}

function approvalDetails(approval: Approval) {
  if (approval.action === 'note.create') {
    return {
      label: 'NOTE / CREATE',
      summary: approval.payload.content ?? '',
      payload: '',
      warning: 'Writes one note to your local database.',
      pendingLabel: 'Saving…',
    }
  }
  if (approval.action === 'memory.create') {
    const kind = approval.payload.kind ?? 'fact'
    return {
      label: `MEMORY / ${kind.toUpperCase()}`,
      summary: approval.payload.content ?? '',
      payload: '',
      warning: `Writes one ${kind} record to your local memory database.`,
      pendingLabel: 'Saving…',
    }
  }
  if (approval.action === 'device.register') {
    const platform = approval.payload.platform === 'iphone' ? 'iPhone' : 'Android'
    return {
      label: `DEVICE / ${platform.toUpperCase()}`,
      summary: `Register ${approval.payload.name ?? 'this device'} as an owned ${platform} device`,
      payload: 'Local record only · initial state: not connected',
      warning: 'Creates an approved local registry entry. It does not pair the device, bypass platform security or enable remote control.',
      pendingLabel: 'Registering…',
    }
  }
  if (approval.action === 'camera.preview') {
    return {
      label: 'CAMERA / VIDEO ONLY',
      summary: 'Start a local webcam preview in this browser',
      payload: 'Video on · Microphone off · Recording off · Frame storage none',
      warning: 'Approval does not activate the camera. Your browser will ask for camera permission separately, and Stop will release every video track.',
      pendingLabel: 'Approving…',
    }
  }
  if (approval.action === 'terminal.git_status') {
    return {
      label: 'TERMINAL / READ ONLY',
      summary: 'Inspect repository status',
      payload: approval.payload.display_command ?? 'git status --short --branch',
      warning: 'Runs once in the Nexus project root. Fixed arguments; no shell input or file changes.',
      pendingLabel: 'Running…',
    }
  }
  const searching = approval.action === 'browser.search'
  return {
    label: searching ? 'BROWSER / SEARCH' : 'BROWSER / NAVIGATE',
    summary: searching ? `Search Google for “${approval.payload.query ?? ''}”` : 'Open a browser destination',
    payload: approval.payload.url ?? '',
    warning: 'Opens this exact HTTP/HTTPS destination once. No clicking or further browsing is authorised.',
    pendingLabel: 'Opening…',
  }
}

export default function Home() {
  const [health, setHealth] = useState<Health | null>(null)
  const [capabilities, setCapabilities] = useState<Capability[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [memories, setMemories] = useState<MemoryRecord[]>([])
  const [conversations, setConversations] = useState<ConversationEntry[]>([])
  const [devices, setDevices] = useState<OwnedDevice[]>([])
  const [cameraSessions, setCameraSessions] = useState<CameraSession[]>([])
  const [activeCameraSessionId, setActiveCameraSessionId] = useState<string | null>(null)
  const [cameraBusy, setCameraBusy] = useState(false)
  const [previewActive, setPreviewActive] = useState(false)
  const [cameraNotice, setCameraNotice] = useState('No camera access requested. Your camera is off.')
  const cameraStreamRef = useRef<MediaStream | null>(null)
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null)
  const cameraRequestRef = useRef(0)
  const activeCameraSessionRef = useRef<string | null>(null)
  const cameraNeedsStopRef = useRef(false)
  const [deviceName, setDeviceName] = useState('')
  const [devicePlatform, setDevicePlatform] = useState<DevicePlatform>('android')
  const [memoryView, setMemoryView] = useState<'notes' | 'typed' | 'timeline'>('notes')
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [audit, setAudit] = useState<AuditEvent[]>([])
  const [settings, setSettings] = useState<AssistantSettings>(defaultSettings)
  const [command, setCommand] = useState('')
  const [result, setResult] = useState<CommandResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pendingAction, setPendingAction] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsBusy, setSettingsBusy] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const {
    recognitionSupported,
    listening,
    speaking,
    transcript,
    viseme,
    voiceError,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
  } = useVoice()

  const refresh = useCallback(async () => {
    try {
      const [
        nextHealth,
        nextCapabilities,
        nextNotes,
        nextMemories,
        nextConversations,
        nextDevices,
        nextCameraSessions,
        nextApprovals,
        nextAudit,
        nextSettings,
      ] = await Promise.all([
        nexusApi.health(),
        nexusApi.capabilities(),
        nexusApi.notes(),
        nexusApi.memories(),
        nexusApi.conversations(),
        nexusApi.devices(),
        nexusApi.cameraSessions(),
        nexusApi.approvals('pending'),
        nexusApi.audit(),
        nexusApi.settings(),
      ])
      setHealth(nextHealth)
      setCapabilities(nextCapabilities)
      setNotes(nextNotes)
      setMemories(nextMemories)
      setConversations(nextConversations)
      setDevices(nextDevices)
      setCameraSessions(nextCameraSessions)
      setApprovals(nextApprovals)
      setAudit(nextAudit)
      setSettings(nextSettings)
      setError('')
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Cannot reach Nexus Local Core.')
    }
  }, [])

  useEffect(() => {
    void refresh().finally(() => setLoading(false))
    const interval = window.setInterval(() => void refresh(), 15000)
    return () => window.clearInterval(interval)
  }, [refresh])

  useEffect(() => {
    const releaseCamera = () => {
      cameraRequestRef.current += 1
      stopCameraStream(cameraStreamRef.current)
      cameraStreamRef.current = null
      if (cameraVideoRef.current) cameraVideoRef.current.srcObject = null
      const sessionId = activeCameraSessionRef.current
      if (sessionId && cameraNeedsStopRef.current) {
        cameraNeedsStopRef.current = false
        void nexusApi.cameraEvent(sessionId, 'stopped', true).catch(() => undefined)
      }
    }
    window.addEventListener('pagehide', releaseCamera)
    return () => {
      window.removeEventListener('pagehide', releaseCamera)
      releaseCamera()
    }
  }, [])

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSettingsOpen(false)
        setMobileNavOpen(false)
      }
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [])

  const updateCameraSession = (session: CameraSession) => {
    setCameraSessions((current) => [session, ...current.filter((item) => item.id !== session.id)])
  }

  const clearLocalCamera = () => {
    stopCameraStream(cameraStreamRef.current)
    cameraStreamRef.current = null
    if (cameraVideoRef.current) cameraVideoRef.current.srcObject = null
    setPreviewActive(false)
  }

  const startCameraPreview = async (session: CameraSession) => {
    if (cameraNeedsStopRef.current) {
      setCameraNotice('Stop the current preview or pending browser request before starting another one.')
      return
    }

    const requestId = cameraRequestRef.current + 1
    cameraRequestRef.current = requestId
    activeCameraSessionRef.current = session.id
    cameraNeedsStopRef.current = true
    setActiveCameraSessionId(session.id)
    updateCameraSession(session)
    setCameraBusy(true)
    setCameraNotice('Nexus approved the request. Waiting for your browser’s separate camera permission…')
    document.getElementById('camera')?.scrollIntoView({ behavior: 'smooth', block: 'start' })

    try {
      const stream = await requestCameraStream()
      if (cameraRequestRef.current !== requestId) {
        stopCameraStream(stream)
        return
      }

      cameraStreamRef.current = stream
      const handleTrackEnded = () => {
        if (cameraRequestRef.current !== requestId) return
        cameraRequestRef.current += 1
        cameraNeedsStopRef.current = false
        clearLocalCamera()
        setCameraBusy(false)
        setCameraNotice('The browser ended the camera track. The preview is no longer active.')
        void nexusApi.cameraEvent(session.id, 'stopped')
          .then((stopped) => {
            updateCameraSession(stopped)
            void refresh()
          })
          .catch((eventError: unknown) => {
            setError(eventError instanceof Error ? eventError.message : 'Could not record the ended camera session.')
          })
      }
      stream.getVideoTracks().forEach((track) => track.addEventListener('ended', handleTrackEnded, { once: true }))

      const video = cameraVideoRef.current
      if (!video) throw new Error('The camera preview element is unavailable.')
      video.srcObject = stream
      await video.play()
      if (cameraRequestRef.current !== requestId) {
        stopCameraStream(stream)
        return
      }

      const started = await nexusApi.cameraEvent(session.id, 'started')
      if (cameraRequestRef.current !== requestId) {
        stopCameraStream(stream)
        return
      }
      updateCameraSession(started)
      setPreviewActive(true)
      setCameraNotice('Live video-only preview. No microphone, recording, snapshots, uploads or stored frames.')
      void refresh()
    } catch (cameraError) {
      if (cameraRequestRef.current !== requestId) return
      clearLocalCamera()
      cameraNeedsStopRef.current = false
      const errorName = cameraError instanceof Error ? cameraError.name : ''
      const message = errorName === 'NotAllowedError'
        ? 'Camera permission was denied or dismissed. No preview is active.'
        : errorName === 'NotFoundError'
          ? 'No usable webcam was found. No preview is active.'
          : cameraError instanceof Error
            ? `${cameraError.message} No preview is active.`
            : 'The camera preview could not start. No preview is active.'
      setCameraNotice(message)
      try {
        updateCameraSession(await nexusApi.cameraEvent(session.id, 'unavailable'))
        void refresh()
      } catch (eventError) {
        setError(eventError instanceof Error ? eventError.message : 'The camera stopped, but its session state could not be recorded.')
      }
    } finally {
      if (cameraRequestRef.current === requestId) setCameraBusy(false)
    }
  }

  const stopCameraPreview = async () => {
    const sessionId = activeCameraSessionRef.current
    const shouldReport = cameraNeedsStopRef.current
    cameraRequestRef.current += 1
    cameraNeedsStopRef.current = false
    clearLocalCamera()
    setCameraBusy(false)
    setCameraNotice('Camera preview stopped. Every browser video track was released.')

    if (sessionId && shouldReport) {
      try {
        updateCameraSession(await nexusApi.cameraEvent(sessionId, 'stopped'))
        void refresh()
      } catch (stopError) {
        setError(stopError instanceof Error ? stopError.message : 'Camera tracks stopped, but the session update could not be saved.')
      }
    }
  }

  const executeCommand = async (text: string) => {
    const normalized = text.trim()
    if (!normalized || busy) return
    setBusy(true)
    setError('')
    try {
      const nextResult = await nexusApi.command(normalized)
      setResult(nextResult)
      setCommand('')
      if (nextResult.intent === 'memory.list') setMemoryView('typed')
      if (nextResult.intent === 'conversation.list') setMemoryView('timeline')
      if (nextResult.intent === 'device.list' || nextResult.intent === 'home.status') {
        document.getElementById('devices')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
      if (nextResult.intent === 'camera.preview' && nextResult.status === 'approval_required') {
        document.getElementById('approvals')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
      if (nextResult.intent === 'camera.status') {
        document.getElementById('camera')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
      speak(nextResult.message, settings.voice_enabled, settings.voice_rate)
      await refresh()
      return nextResult
    } catch (commandError) {
      setError(commandError instanceof Error ? commandError.message : 'Command failed safely.')
    } finally {
      setBusy(false)
    }
  }

  const submitCommand = (event?: FormEvent) => {
    event?.preventDefault()
    void executeCommand(command)
  }

  const registerDevice = async (event: FormEvent) => {
    event.preventDefault()
    const name = deviceName.trim()
    if (!name || busy) return
    const platformLabel = devicePlatform === 'iphone' ? 'iPhone' : 'Android'
    const registration = await executeCommand(`Register ${platformLabel} device: ${name}`)
    if (registration?.status === 'approval_required') {
      setDeviceName('')
      document.getElementById('approvals')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  const startVoice = () => {
    if (listening) {
      stopListening()
      return
    }
    startListening((text) => {
      setCommand(text)
      void executeCommand(text)
    })
  }

  const changeAvatar = async (avatarMode: AvatarMode) => {
    if (settingsBusy || avatarMode === settings.avatar_mode) return
    const previous = settings
    setSettings({ ...settings, avatar_mode: avatarMode })
    setSettingsBusy(true)
    try {
      setSettings(await nexusApi.updateSettings({ avatar_mode: avatarMode }))
      setError('')
    } catch (settingsError) {
      setSettings(previous)
      setError(settingsError instanceof Error ? settingsError.message : 'Could not change the visual assistant.')
    } finally {
      setSettingsBusy(false)
    }
  }

  const saveSettings = async (nextSettings: AssistantSettings) => {
    const saved = await nexusApi.updateSettings(nextSettings)
    setSettings(saved)
    if (!saved.voice_enabled) stopSpeaking()
  }

  const decide = async (id: string, decision: 'approve' | 'reject') => {
    const approval = approvals.find((item) => item.id === id)
    const browserAction = approval?.action.startsWith('browser.') ?? false
    const cameraAction = approval?.action === 'camera.preview'
    let approvedTab: Window | null = null

    if (decision === 'approve' && cameraAction && cameraNeedsStopRef.current) {
      setCameraNotice('Stop the current camera preview or pending browser request before approving another one.')
      document.getElementById('camera')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }

    if (decision === 'approve' && approval && browserAction) {
      approvedTab = window.open('about:blank', '_blank')
      if (!approvedTab) {
        const message = 'Your browser blocked the new tab. Allow pop-ups for Nexus, then approve again; the request is still pending.'
        setResult({
          command_id: approval.command_id,
          intent: approval.action,
          status: 'unavailable',
          message,
        })
        speak(message, settings.voice_enabled, settings.voice_rate)
        return
      }
      approvedTab.opener = null
    }

    setPendingAction(`${id}:${decision}`)
    setError('')
    try {
      const outcome = decision === 'approve'
        ? await nexusApi.approve(id, browserAction)
        : await nexusApi.reject(id)
      if (approvedTab) {
        if (outcome.command_status === 'completed' && outcome.payload.url) {
          approvedTab.location.replace(outcome.payload.url)
        } else {
          approvedTab.close()
        }
      }
      setResult({
        command_id: outcome.command_id,
        intent: outcome.action,
        status: outcome.command_status,
        message: outcome.message,
        output: outcome.output,
      })
      if (outcome.memory) setMemoryView('typed')
      speak(outcome.message, settings.voice_enabled, settings.voice_rate)
      await refresh()
      if (outcome.device) {
        document.getElementById('devices')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
      if (outcome.camera_session) void startCameraPreview(outcome.camera_session)
    } catch (decisionError) {
      approvedTab?.close()
      setError(decisionError instanceof Error ? decisionError.message : 'Could not resolve the request.')
    } finally {
      setPendingAction('')
    }
  }

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setMobileNavOpen(false)
  }

  const navItems: { id: string; label: string; icon: LucideIcon; count?: number }[] = [
    { id: 'console', label: 'Console', icon: TerminalSquare },
    { id: 'notes', label: 'Memory', icon: NotebookPen, count: notes.length + memories.length },
    { id: 'approvals', label: 'Approvals', icon: ShieldCheck, count: approvals.length },
    { id: 'camera', label: 'Camera & vision', icon: Camera, count: previewActive ? 1 : 0 },
    { id: 'devices', label: 'Devices & home', icon: Smartphone, count: devices.length },
    { id: 'audit', label: 'Audit trail', icon: FileClock },
    { id: 'connectors', label: 'Connectors', icon: Network },
  ]

  const selectedCameraSession = cameraSessions.find((session) => session.id === activeCameraSessionId) ?? cameraSessions[0]
  const cameraState = cameraBusy ? 'awaiting permission' : previewActive ? 'active' : selectedCameraSession?.status ?? 'off'
  const online = health?.status === 'online' && !error

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNavOpen ? 'sidebar-open' : ''}`}>
        <button className="brand" onClick={() => scrollTo('console')} aria-label="Nexus console home">
          <BrandMark />
          <span className="brand-word">NEXUS</span>
        </button>
        <nav className="primary-nav" aria-label="Console sections">
          <span className="nav-label">Workspace</span>
          {navItems.map(({ id, label, icon: Icon, count }, index) => (
            <button
              key={id}
              className={`nav-item ${index === 0 ? 'nav-item-active' : ''}`}
              onClick={() => scrollTo(id)}
            >
              <Icon size={18} strokeWidth={1.6} />
              <span>{label}</span>
              {typeof count === 'number' && count > 0 && <span className="nav-count">{count}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => setSettingsOpen(true)}>
            <Settings size={18} strokeWidth={1.6} />
            <span>Voice & core</span>
          </button>
          <div className="local-only-note">
            <KeyRound size={15} />
            <span>Local only<br />No open ports</span>
          </div>
          <span className="build-number">LOCAL CORE / 0.6.0</span>
        </div>
      </aside>

      {mobileNavOpen && <button className="nav-scrim" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation" />}

      <main className="main-shell">
        <header className="topbar">
          <div className="topbar-left">
            <button className="mobile-menu" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation">
              <Menu size={20} />
            </button>
            <BrandMark small />
            <span className="breadcrumb">PERSONAL INTELLIGENCE <ChevronRight size={13} /> CORE 06</span>
          </div>
          <div className="topbar-right">
            <span className="core-time">{health ? formatTimestamp(health.time) : 'CORE OFFLINE'}</span>
            <span className={`connection-status ${online ? 'is-online' : 'is-offline'}`}>
              <span className="status-dot" />
              {online ? 'LOCAL CORE ONLINE' : 'RECONNECTING'}
            </span>
          </div>
        </header>

        <div className="content-shell">
          {error && (
            <div className="error-banner" role="alert">
              <XCircle size={18} />
              <div><strong>Core connection needs attention</strong><span>{error}</span></div>
              <button onClick={() => void refresh()}>Retry</button>
            </div>
          )}

          <section id="console" className="console-grid page-anchor">
            <div className="globe-stage">
              <div className="stage-grid" aria-hidden="true" />
              <div className="stage-heading">
                <div>
                  <span className="eyebrow yellow">{settings.assistant_name.toUpperCase()} / LOCAL INTELLIGENCE</span>
                  <h1>Your world.<br /><span>Under your command.</span></h1>
                </div>
                <span className="phase-badge">PHASE 06</span>
              </div>
              <div className="avatar-switch" role="group" aria-label="Visual assistant mode">
                <button
                  className={settings.avatar_mode === 'globe' ? 'selected' : ''}
                  onClick={() => void changeAvatar('globe')}
                  aria-pressed={settings.avatar_mode === 'globe'}
                  disabled={settingsBusy}
                >
                  <Globe2 size={14} /> Globe
                </button>
                <button
                  className={settings.avatar_mode === 'humanoid' ? 'selected' : ''}
                  onClick={() => void changeAvatar('humanoid')}
                  aria-pressed={settings.avatar_mode === 'humanoid'}
                  disabled={settingsBusy}
                >
                  <UserRound size={14} /> Humanoid
                </button>
              </div>
              {settings.avatar_mode === 'globe' ? (
                <NexusGlobe active={busy || listening || speaking} />
              ) : (
                <NexusHumanoid active={busy} listening={listening} speaking={speaking} viseme={viseme} />
              )}
              <div className="globe-caption">
                <span className="globe-mode"><Sparkles size={14} /> {listening ? 'LISTENING' : speaking ? 'SPEAKING' : busy ? 'PROCESSING REQUEST' : 'AWAITING YOUR COMMAND'}</span>
                <span>DRAG · SCROLL · PINCH TO EXPLORE</span>
              </div>
              <div className="core-principles">
                <span><Database size={14} /> SQLite memory</span>
                <span><ShieldCheck size={14} /> Explicit consent</span>
                <span><MonitorCog size={14} /> Local core</span>
              </div>
            </div>

            <div className="command-panel">
              <div className="command-panel-heading">
                <span className="eyebrow">COMMAND INTERFACE</span>
                <span className="secure-label"><KeyRound size={12} /> PERMISSION GATED</span>
              </div>
              <h2>What are we doing next?</h2>
              <p className="command-intro">Start with a local request. {settings.assistant_name} will explain anything that needs your approval before it happens.</p>

              <form onSubmit={submitCommand} className="command-form">
                <label htmlFor="command-input">Your instruction</label>
                <div className="command-input-wrap">
                  <MessageSquareText size={19} />
                  <textarea
                    id="command-input"
                    value={command}
                    onChange={(event) => setCommand(event.target.value)}
                    onKeyDown={(event) => {
                      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') void submitCommand()
                    }}
                    placeholder={`Tell ${settings.assistant_name} what you need…`}
                    rows={4}
                    maxLength={2000}
                    disabled={busy}
                  />
                  <span className="input-hint">⌘ / CTRL + ENTER</span>
                </div>
                <button className="send-button" type="submit" disabled={!command.trim() || busy}>
                  <span>{busy ? 'Processing safely' : `Send to ${settings.assistant_name}`}</span>
                  {busy ? <Activity size={18} className="spin" /> : <Send size={18} />}
                </button>
              </form>

              <div className="voice-controls" aria-label="Voice controls">
                <button
                  className={`microphone-button ${listening ? 'is-listening' : ''}`}
                  onClick={startVoice}
                  disabled={!recognitionSupported || busy}
                  aria-pressed={listening}
                >
                  {listening ? <Square size={15} /> : <Mic size={16} />}
                  {listening ? 'Stop listening' : `Speak to ${settings.assistant_name}`}
                </button>
                <button className="voice-settings-button" onClick={() => setSettingsOpen(true)}>
                  <AudioLines size={16} /> Voice settings
                </button>
                {speaking && (
                  <button className="stop-speaking" onClick={stopSpeaking}>
                    <Square size={14} /> Stop speaking
                  </button>
                )}
              </div>
              <div className={`voice-status ${voiceError ? 'voice-status-error' : ''}`} aria-live="polite">
                {voiceError || (listening
                  ? transcript || 'Listening… speak now. Nothing is sent until speech is recognized.'
                  : speaking
                    ? `${settings.assistant_name} is speaking. Use Stop speaking to interrupt.`
                    : recognitionSupported
                      ? 'Microphone stays off until you choose Speak. Voice commands use the same approval path.'
                      : 'Voice input is unavailable in this browser. Text commands remain fully functional.')}
              </div>

              <div className="quick-commands">
                <span className="eyebrow">TRY A WORKING COMMAND</span>
                <div className="quick-command-list">
                  {quickCommands.map((suggestion) => (
                    <button key={suggestion} onClick={() => setCommand(suggestion)} disabled={busy}>
                      {suggestion}<ArrowUpRight size={13} />
                    </button>
                  ))}
                </div>
              </div>

              {result && (
                <div className={`command-result result-${result.status}`} aria-live="polite">
                  <div className="result-topline">
                    <span>{result.status.replaceAll('_', ' ')}</span>
                    <span>{shortId(result.command_id)}</span>
                  </div>
                  <p>{result.message}</p>
                  {result.output && <pre className="command-output">{result.output}</pre>}
                </div>
              )}
            </div>
          </section>

          <div className="workspace-grid">
            <section id="notes" className="workspace-panel page-anchor">
              <SectionHeading
                eyebrow="PERSISTENT MEMORY"
                title="Memory"
                icon={BookOpen}
                aside={`${notes.length + memories.length} RECORDS`}
              />
              <div className="memory-tabs" role="tablist" aria-label="Memory views">
                {([
                  ['notes', 'Notes', notes.length],
                  ['typed', 'Typed memory', memories.length],
                  ['timeline', 'Timeline', conversations.length],
                ] as const).map(([view, label, count]) => (
                  <button
                    id={`memory-tab-${view}`}
                    key={view}
                    role="tab"
                    aria-selected={memoryView === view}
                    aria-controls={`memory-panel-${view}`}
                    className={memoryView === view ? 'selected' : ''}
                    onClick={() => setMemoryView(view)}
                  >
                    {label}<span>{count}</span>
                  </button>
                ))}
              </div>
              <div
                className="panel-body memory-panel-body"
                id={`memory-panel-${memoryView}`}
                role="tabpanel"
                aria-labelledby={`memory-tab-${memoryView}`}
              >
                {loading ? <EmptyState>Reading local memory…</EmptyState> : memoryView === 'notes' ? (
                  notes.length === 0 ? (
                    <EmptyState>No saved notes. Ask Nexus to take a note.</EmptyState>
                  ) : (
                    <div className="notes-list">
                      {notes.slice(0, 6).map((note, index) => (
                        <article className="note-row" key={note.id}>
                          <span className="note-index">{String(index + 1).padStart(2, '0')}</span>
                          <div><p>{note.content}</p><time>{formatTimestamp(note.created_at)}</time></div>
                        </article>
                      ))}
                    </div>
                  )
                ) : memoryView === 'typed' ? (
                  memories.length === 0 ? (
                    <EmptyState>No typed memories. Try “Remember preference: I prefer concise answers”.</EmptyState>
                  ) : (
                    <div className="memory-list">
                      {memories.slice(0, 8).map((memory) => (
                        <article className="memory-row" key={memory.id}>
                          <span className={`memory-kind memory-kind-${memory.kind}`}>{memory.kind}</span>
                          <p>{memory.content}</p>
                          <time>{formatTimestamp(memory.created_at)}</time>
                        </article>
                      ))}
                    </div>
                  )
                ) : conversations.length === 0 ? (
                  <EmptyState>No commands yet. Your command and response history will appear here.</EmptyState>
                ) : (
                  <div className="conversation-list">
                    {conversations.slice(0, 10).map((entry) => (
                      <article className="conversation-row" key={entry.id}>
                        <span className={`timeline-marker status-${entry.status}`} aria-hidden="true" />
                        <div className="conversation-content">
                          <div className="conversation-meta">
                            <span>{entry.intent.replaceAll('.', ' / ')}</span>
                            <time>{formatTimestamp(entry.created_at)}</time>
                          </div>
                          <p className="conversation-input">{entry.input_text}</p>
                          <p className="conversation-response">{entry.response}</p>
                          <span className={`conversation-status status-${entry.status}`}>{entry.status.replaceAll('_', ' ')}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <section id="approvals" className="workspace-panel page-anchor">
              <SectionHeading eyebrow="HUMAN IN THE LOOP" title="Approval queue" icon={ShieldCheck} aside={`${approvals.length} PENDING`} />
              <div className="panel-body">
                {approvals.length === 0 ? (
                  <EmptyState>No pending requests. Nothing happens without you.</EmptyState>
                ) : (
                  <div className="approval-list">
                    {approvals.map((approval) => {
                      const details = approvalDetails(approval)
                      return (
                        <article className="approval-card" key={approval.id}>
                          <div className="approval-meta"><span>{details.label}</span><span>{shortId(approval.id)}</span></div>
                          <p>{details.summary}</p>
                          {details.payload && <code className="approval-payload">{details.payload}</code>}
                          <div className="approval-warning"><KeyRound size={13} /> {details.warning}</div>
                          <div className="approval-actions">
                            <button
                              className="reject-button"
                              onClick={() => void decide(approval.id, 'reject')}
                              disabled={Boolean(pendingAction)}
                            >
                              <X size={15} /> Reject
                            </button>
                            <button
                              className="approve-button"
                              onClick={() => void decide(approval.id, 'approve')}
                              disabled={Boolean(pendingAction)}
                            >
                              <Check size={15} /> {pendingAction === `${approval.id}:approve` ? details.pendingLabel : 'Approve'}
                            </button>
                          </div>
                        </article>
                      )
                    })}
                  </div>
                )}
              </div>
            </section>
          </div>

          <section id="camera" className="workspace-panel camera-section page-anchor">
            <SectionHeading
              eyebrow="CONSENT-BASED VISION"
              title="Camera & vision"
              icon={Camera}
              aside={cameraState.toUpperCase()}
            />
            <div className="camera-layout">
              <div className={`camera-preview-frame ${previewActive ? 'is-active' : ''}`}>
                <video
                  ref={cameraVideoRef}
                  className="camera-video"
                  autoPlay
                  muted
                  playsInline
                  aria-label="Live local webcam preview"
                />
                {!previewActive && (
                  <div className="camera-preview-placeholder">
                    {cameraBusy ? <Camera size={32} /> : <CameraOff size={32} />}
                    <strong>{cameraBusy ? 'Browser permission required' : 'Camera is not showing video'}</strong>
                    <span>{cameraBusy ? 'Allow or deny the browser prompt. You can also cancel this request.' : 'Approval alone never activates your webcam.'}</span>
                  </div>
                )}
                <div className={`camera-preview-state state-${cameraState.replaceAll(' ', '-')}`}>
                  <span className="status-dot" />
                  {cameraBusy ? 'WAITING FOR BROWSER' : previewActive ? 'LIVE · VIDEO ONLY' : cameraState.toUpperCase()}
                </div>
              </div>

              <div className="camera-controls">
                <span className="eyebrow">LOCAL BROWSER PREVIEW</span>
                <h3>Your camera stays under your control.</h3>
                <p>
                  Starting a preview needs a Nexus approval and then your browser’s camera permission. The session becomes active only when a real video stream starts.
                </p>
                <div className="camera-notice" role="status" aria-live="polite">{cameraNotice}</div>
                <div className="camera-action-row">
                  <button
                    className="camera-request-button"
                    onClick={() => void executeCommand('Start camera preview')}
                    disabled={busy || cameraBusy || previewActive}
                  >
                    <Camera size={16} /> Request camera preview
                  </button>
                  {(cameraBusy || previewActive) && (
                    <button className="camera-stop-button" onClick={() => void stopCameraPreview()}>
                      <Square size={14} /> {cameraBusy ? 'Cancel request' : 'Stop camera'}
                    </button>
                  )}
                </div>
                <ul className="camera-boundaries">
                  <li><Check size={13} /> Video only; microphone explicitly disabled</li>
                  <li><Check size={13} /> No recording, snapshots, uploads or frame API</li>
                  <li><Check size={13} /> Stop releases every browser media track</li>
                </ul>
              </div>
            </div>

            <div className="camera-session-history">
              <div className="camera-history-heading">
                <span className="eyebrow">BROWSER-REPORTED SESSIONS</span>
                <button onClick={() => void executeCommand('Camera status')} disabled={busy}>Check latest status</button>
              </div>
              {cameraSessions.length === 0 ? (
                <div className="camera-history-empty">No camera session exists. Nexus has not accessed a camera.</div>
              ) : (
                <div className="camera-session-list">
                  {cameraSessions.slice(0, 4).map((session) => (
                    <article className="camera-session-row" key={session.id}>
                      <span className={`camera-session-status status-${session.status}`}>{session.status}</span>
                      <code>{shortId(session.id)}</code>
                      <time>{formatTimestamp(session.updated_at)}</time>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>

          <div id="devices" className="device-home-grid page-anchor">
            <section className="workspace-panel device-panel">
              <SectionHeading
                eyebrow="OWNED DEVICES"
                title="Device registry"
                icon={Smartphone}
                aside={`${devices.length} REGISTERED`}
              />
              <div className="device-registry-body">
                <form className="device-registration" onSubmit={registerDevice}>
                  <div className="device-platform-select" role="group" aria-label="Device platform">
                    <button
                      type="button"
                      className={devicePlatform === 'android' ? 'selected' : ''}
                      aria-pressed={devicePlatform === 'android'}
                      onClick={() => setDevicePlatform('android')}
                    >
                      Android
                    </button>
                    <button
                      type="button"
                      className={devicePlatform === 'iphone' ? 'selected' : ''}
                      aria-pressed={devicePlatform === 'iphone'}
                      onClick={() => setDevicePlatform('iphone')}
                    >
                      iPhone
                    </button>
                  </div>
                  <label htmlFor="device-name">Device name</label>
                  <div className="device-name-row">
                    <input
                      id="device-name"
                      value={deviceName}
                      onChange={(event) => setDeviceName(event.target.value)}
                      placeholder="For example, Sam's phone"
                      maxLength={80}
                      disabled={busy}
                    />
                    <button type="submit" disabled={!deviceName.trim() || busy}>
                      Request registration
                    </button>
                  </div>
                  <p>Creates a local record only after approval. It does not pair or control the device.</p>
                </form>

                <div className="registered-devices" aria-live="polite">
                  {devices.length === 0 ? (
                    <div className="registry-empty">
                      <Smartphone size={18} />
                      <span>No owned devices registered. Android and iPhone are both supported as local registry entries.</span>
                    </div>
                  ) : devices.map((device) => (
                    <article className="device-row" key={device.id}>
                      <div className="device-row-heading">
                        <Smartphone size={17} />
                        <div><strong>{device.name}</strong><span>{device.label}</span></div>
                        <span className="not-connected"><WifiOff size={12} /> NOT CONNECTED</span>
                      </div>
                      <details>
                        <summary>Platform capabilities and limits</summary>
                        <div className="device-boundaries">
                          <div>
                            <span>AVAILABLE NOW</span>
                            <ul>{device.capabilities.map((capability) => <li key={capability}>{capability}</li>)}</ul>
                          </div>
                          <div>
                            <span>NOT ACTIVE</span>
                            <ul>{device.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul>
                          </div>
                        </div>
                      </details>
                    </article>
                  ))}
                </div>

                <div className="platform-declarations">
                  <div><strong>Android</strong><span>Companion-app integration required. No background control or lock action is active.</span></div>
                  <div><strong>iPhone</strong><span>Companion-app integration required. iOS platform restrictions remain in force.</span></div>
                </div>
              </div>
            </section>

            <section className="workspace-panel home-panel">
              <SectionHeading eyebrow="AUTHORISED HOME" title="Home & AC" icon={House} aside="NOT CONFIGURED" />
              <div className="home-status-body">
                <div className="home-connection-state">
                  <WifiOff size={24} />
                  <div>
                    <span className="eyebrow">CONNECTOR STATUS</span>
                    <h3>No home integration connected</h3>
                  </div>
                </div>
                <p className="home-status-copy">
                  Nexus has not contacted your AC or any other home device. Its current state is unknown; no success or sensor reading is being simulated.
                </p>
                <div className="home-requirements">
                  <span>BEFORE REAL CONTROL</span>
                  <ul>
                    <li>Configure a Home Assistant, Matter or vendor-authorised integration.</li>
                    <li>Select the exact owned device and its supported operations.</li>
                    <li>Keep a separate approval for every consequential control request.</li>
                  </ul>
                </div>
                <div className="home-check-actions">
                  <button onClick={() => void executeCommand('Home status')} disabled={busy}>
                    <House size={15} /> Check connector
                  </button>
                  <button onClick={() => void executeCommand('Turn on the AC')} disabled={busy}>
                    <WifiOff size={15} /> Test AC boundary
                  </button>
                </div>
                <p className="home-action-note">Both checks are safe while unconfigured. The AC test must return unavailable and change nothing.</p>
              </div>
            </section>
          </div>

          <section id="connectors" className="connector-section page-anchor">
            <SectionHeading eyebrow="CAPABILITY MAP" title="One core. Connectors with clear boundaries." icon={Globe2} aside="HONEST STATUS" />
            <div className="connector-list">
              {capabilities.map((capability) => (
                <article className="connector-row" key={capability.id}>
                  <span className={`capability-indicator ${capability.status}`} />
                  <div className="connector-name"><strong>{capability.label}</strong><span>{capability.description}</span></div>
                  <span className="tier-label">TIER {capability.tier}</span>
                  <span className={`capability-status ${capability.status}`}>{capability.status}</span>
                </article>
              ))}
            </div>
          </section>

          <section id="audit" className="audit-section page-anchor">
            <SectionHeading eyebrow="VERIFIABLE ACTIVITY" title="Audit trail" icon={Activity} aside={`${audit.length} RECENT EVENTS`} />
            <div className="audit-table" role="table" aria-label="Recent Nexus activity">
              <div className="audit-header" role="row">
                <span role="columnheader">Event</span><span role="columnheader">Detail</span><span role="columnheader">Status</span><span role="columnheader">Time</span>
              </div>
              {audit.length === 0 ? <EmptyState>No activity recorded yet.</EmptyState> : audit.slice(0, 10).map((event) => (
                <div className="audit-row" role="row" key={event.id}>
                  <span className="audit-event" role="cell"><Activity size={13} />{eventLabel(event.event_type)}</span>
                  <span className="audit-detail" role="cell">{event.detail}</span>
                  <span className={`audit-status status-${event.status}`} role="cell">{event.status}</span>
                  <time role="cell">{formatTimestamp(event.created_at)}</time>
                </div>
              ))}
            </div>
          </section>

          <footer className="page-footer">
            <span><BrandMark small /> NEXUS LOCAL CORE</span>
            <span>LOCAL CONNECTORS ACTIVE <span className="footer-dot">·</span> EXPLICIT APPROVAL REQUIRED</span>
          </footer>
        </div>
      </main>

      {settingsOpen && (
        <VoiceSettings
          settings={settings}
          version={health?.version ?? 'Unavailable'}
          speaking={speaking}
          onClose={() => setSettingsOpen(false)}
          onSave={saveSettings}
          onPreview={(draft) => speak(
            `Hello, I am ${draft.assistant_name}. Your local voice core is ready.`,
            true,
            draft.voice_rate,
          )}
          onStop={stopSpeaking}
        />
      )}
    </div>
  )
}
