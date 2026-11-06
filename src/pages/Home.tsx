import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import {
  Activity,
  ArrowUpRight,
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
  MonitorCog,
  Network,
  NotebookPen,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  X,
  XCircle,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import NexusGlobe from '@/components/NexusGlobe'
import { nexusApi } from '@/lib/api'
import { eventLabel, formatTimestamp, shortId } from '@/lib/presentation'
import type {
  Approval,
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
  const [command, setCommand] = useState('')
  const [result, setResult] = useState<CommandResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pendingAction, setPendingAction] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const [nextHealth, nextCapabilities, nextNotes, nextApprovals, nextAudit] = await Promise.all([
        nexusApi.health(),
        nexusApi.capabilities(),
        nexusApi.notes(),
        nexusApi.approvals('pending'),
        nexusApi.audit(),
      ])
      setHealth(nextHealth)
      setCapabilities(nextCapabilities)
      setNotes(nextNotes)
      setApprovals(nextApprovals)
      setAudit(nextAudit)
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

  const submitCommand = async (event?: FormEvent) => {
    event?.preventDefault()
    const text = command.trim()
    if (!text || busy) return
    setBusy(true)
    setError('')
    try {
      const nextResult = await nexusApi.command(text)
      setResult(nextResult)
      setCommand('')
      await refresh()
    } catch (commandError) {
      setError(commandError instanceof Error ? commandError.message : 'Command failed safely.')
    } finally {
      setBusy(false)
    }
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
            <span>Core details</span>
          </button>
          <div className="local-only-note">
            <KeyRound size={15} />
            <span>Local only<br />No open ports</span>
          </div>
          <span className="build-number">FOUNDATION / 0.1.0</span>
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
            <span className="breadcrumb">PERSONAL INTELLIGENCE <ChevronRight size={13} /> CORE 01</span>
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
                  <span className="eyebrow yellow">NEXUS / LOCAL INTELLIGENCE</span>
                  <h1>Your world.<br /><span>Under your command.</span></h1>
                </div>
                <span className="phase-badge">PHASE 01</span>
              </div>
              <NexusGlobe active={busy} />
              <div className="globe-caption">
                <span className="globe-mode"><Sparkles size={14} /> {busy ? 'PROCESSING REQUEST' : 'AWAITING YOUR COMMAND'}</span>
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
              <p className="command-intro">Start with a local request. Nexus will explain anything that needs your approval before it happens.</p>

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
                    placeholder="Tell Nexus what you need…"
                    rows={4}
                    maxLength={2000}
                    disabled={busy}
                  />
                  <span className="input-hint">⌘ / CTRL + ENTER</span>
                </div>
                <button className="send-button" type="submit" disabled={!command.trim() || busy}>
                  <span>{busy ? 'Processing safely' : 'Send to Nexus'}</span>
                  {busy ? <Activity size={18} className="spin" /> : <Send size={18} />}
                </button>
              </form>

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
            <span>FOUNDATION COMPLETE <span className="footer-dot">·</span> VOICE & CONNECTORS FOLLOW NEXT</span>
          </footer>
        </div>
      </main>

      {settingsOpen && (
        <div className="modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSettingsOpen(false)
        }}>
          <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <button className="modal-close" onClick={() => setSettingsOpen(false)} aria-label="Close core details"><X size={19} /></button>
            <BrandMark />
            <span className="eyebrow yellow">CORE DETAILS</span>
            <h2 id="settings-title">Local by design.</h2>
            <p>The foundation runs on your machine. Notes, command outcomes and approval decisions are stored in SQLite; no cloud account is required.</p>
            <dl className="core-details">
              <div><dt>API</dt><dd>127.0.0.1:8000</dd></div>
              <div><dt>Interface</dt><dd>localhost:3000</dd></div>
              <div><dt>Database</dt><dd>data/nexus.db</dd></div>
              <div><dt>Version</dt><dd>{health?.version ?? 'Unavailable'}</dd></div>
            </dl>
            <div className="settings-safety"><ShieldCheck size={18} /><span>Sensitive connectors will use the same request → review → approval → audit path.</span></div>
          </section>
        </div>
      )}
    </div>
  )
}
