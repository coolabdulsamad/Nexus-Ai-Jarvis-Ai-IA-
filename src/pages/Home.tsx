import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import {
  Activity,
  ArrowUpRight,
  AudioLines,
  BookOpen,
  Check,
  ChevronRight,
  CircleDot,
  Database,
  FileClock,
  Globe2,
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
  Sparkles,
  Square,
  TerminalSquare,
  UserRound,
  X,
  XCircle,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import NexusGlobe from '@/components/NexusGlobe'
import NexusHumanoid from '@/components/NexusHumanoid'
import VoiceSettings from '@/components/VoiceSettings'
import { nexusApi } from '@/lib/api'
import { eventLabel, formatTimestamp, shortId } from '@/lib/presentation'
import { useVoice } from '@/lib/useVoice'
import type {
  Approval,
  AssistantSettings,
  AvatarMode,
  AuditEvent,
  Capability,
  CommandResult,
  Health,
  Note,
} from '@/types/nexus'

const quickCommands = [
  'What time is it?',
  'System status',
  'Take a note: review the camera connector plan',
  'Open Chrome and search Google',
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

export default function Home() {
  const [health, setHealth] = useState<Health | null>(null)
  const [capabilities, setCapabilities] = useState<Capability[]>([])
  const [notes, setNotes] = useState<Note[]>([])
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
      const [nextHealth, nextCapabilities, nextNotes, nextApprovals, nextAudit, nextSettings] = await Promise.all([
        nexusApi.health(),
        nexusApi.capabilities(),
        nexusApi.notes(),
        nexusApi.approvals('pending'),
        nexusApi.audit(),
        nexusApi.settings(),
      ])
      setHealth(nextHealth)
      setCapabilities(nextCapabilities)
      setNotes(nextNotes)
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
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSettingsOpen(false)
        setMobileNavOpen(false)
      }
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [])

  const executeCommand = async (text: string) => {
    const normalized = text.trim()
    if (!normalized || busy) return
    setBusy(true)
    setError('')
    try {
      const nextResult = await nexusApi.command(normalized)
      setResult(nextResult)
      setCommand('')
      speak(nextResult.message, settings.voice_enabled, settings.voice_rate)
      await refresh()
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
    setPendingAction(`${id}:${decision}`)
    setError('')
    try {
      const outcome = decision === 'approve' ? await nexusApi.approve(id) : await nexusApi.reject(id)
      setResult({
        command_id: outcome.command_id,
        intent: outcome.action,
        status: decision === 'approve' ? 'completed' : 'rejected',
        message: outcome.message,
      })
      speak(outcome.message, settings.voice_enabled, settings.voice_rate)
      await refresh()
    } catch (decisionError) {
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
    { id: 'notes', label: 'Memory', icon: NotebookPen, count: notes.length },
    { id: 'approvals', label: 'Approvals', icon: ShieldCheck, count: approvals.length },
    { id: 'audit', label: 'Audit trail', icon: FileClock },
    { id: 'connectors', label: 'Connectors', icon: Network },
  ]

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
          <span className="build-number">VOICE CORE / 0.2.0</span>
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
            <span className="breadcrumb">PERSONAL INTELLIGENCE <ChevronRight size={13} /> CORE 02</span>
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
                <span className="phase-badge">PHASE 02</span>
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
                <span>DRAG TO EXPLORE</span>
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
                </div>
              )}
            </div>
          </section>

          <div className="workspace-grid">
            <section id="notes" className="workspace-panel page-anchor">
              <SectionHeading eyebrow="PERSISTENT MEMORY" title="Local notes" icon={BookOpen} aside={`${notes.length} STORED`} />
              <div className="panel-body">
                {loading ? <EmptyState>Reading local memory…</EmptyState> : notes.length === 0 ? (
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
                    {approvals.map((approval) => (
                      <article className="approval-card" key={approval.id}>
                        <div className="approval-meta"><span>NOTE / CREATE</span><span>{shortId(approval.id)}</span></div>
                        <p>{approval.payload.content}</p>
                        <div className="approval-warning"><KeyRound size={13} /> Writes one note to your local database.</div>
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
                            <Check size={15} /> {pendingAction === `${approval.id}:approve` ? 'Saving…' : 'Approve'}
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
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
            <span>VOICE CORE ACTIVE <span className="footer-dot">·</span> CONNECTORS FOLLOW NEXT</span>
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
