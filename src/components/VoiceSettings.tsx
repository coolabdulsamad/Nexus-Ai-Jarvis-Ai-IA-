import { useState } from 'react'
import type { FormEvent } from 'react'
import { AudioLines, Check, Globe2, Play, ShieldCheck, Square, UserRound, X } from 'lucide-react'
import type { AssistantSettings } from '@/types/nexus'

interface VoiceSettingsProps {
  settings: AssistantSettings
  version: string
  speaking: boolean
  onClose: () => void
  onSave: (settings: AssistantSettings) => Promise<void>
  onPreview: (settings: AssistantSettings) => void
  onStop: () => void
}

export default function VoiceSettings({
  settings,
  version,
  speaking,
  onClose,
  onSave,
  onPreview,
  onStop,
}: VoiceSettingsProps) {
  const [draft, setDraft] = useState(settings)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!draft.assistant_name.trim()) {
      setError('Enter a name for your assistant.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onSave({ ...draft, assistant_name: draft.assistant_name.trim() })
      onClose()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Settings could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <button className="modal-close" onClick={onClose} aria-label="Close voice and core settings"><X size={19} /></button>
        <AudioLines size={30} className="settings-symbol" />
        <span className="eyebrow yellow">VOICE & CORE SETTINGS</span>
        <h2 id="settings-title">Make Nexus yours.</h2>
        <p>These preferences are stored in your local SQLite database. Microphone access still requires a separate browser prompt.</p>

        <form className="settings-form" onSubmit={save}>
          <label htmlFor="assistant-name">Assistant name</label>
          <input
            id="assistant-name"
            autoFocus
            value={draft.assistant_name}
            onChange={(event) => setDraft({ ...draft, assistant_name: event.target.value })}
            maxLength={40}
            autoComplete="off"
          />

          <fieldset>
            <legend>Visual assistant</legend>
            <div className="settings-avatar-options">
              <button
                type="button"
                className={draft.avatar_mode === 'globe' ? 'selected' : ''}
                onClick={() => setDraft({ ...draft, avatar_mode: 'globe' })}
                aria-pressed={draft.avatar_mode === 'globe'}
              >
                <Globe2 size={18} /> Globe {draft.avatar_mode === 'globe' && <Check size={14} />}
              </button>
              <button
                type="button"
                className={draft.avatar_mode === 'humanoid' ? 'selected' : ''}
                onClick={() => setDraft({ ...draft, avatar_mode: 'humanoid' })}
                aria-pressed={draft.avatar_mode === 'humanoid'}
              >
                <UserRound size={18} /> Humanoid {draft.avatar_mode === 'humanoid' && <Check size={14} />}
              </button>
            </div>
          </fieldset>

          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={draft.voice_enabled}
              onChange={(event) => setDraft({ ...draft, voice_enabled: event.target.checked })}
            />
            <span><strong>Spoken responses</strong><small>Speak command results aloud. You can interrupt at any time.</small></span>
          </label>

          <div className="rate-heading">
            <label htmlFor="voice-rate">Speech rate</label>
            <output htmlFor="voice-rate">{draft.voice_rate.toFixed(1)}×</output>
          </div>
          <input
            id="voice-rate"
            className="rate-slider"
            type="range"
            min="0.7"
            max="1.4"
            step="0.1"
            value={draft.voice_rate}
            onChange={(event) => setDraft({ ...draft, voice_rate: Number(event.target.value) })}
          />

          <div className="voice-preview-row">
            <button type="button" onClick={() => onPreview(draft)} disabled={speaking}>
              <Play size={15} /> Preview voice
            </button>
            {speaking && <button type="button" onClick={onStop}><Square size={14} /> Stop</button>}
          </div>

          {error && <p className="settings-error" role="alert">{error}</p>}
          <button className="save-settings" type="submit" disabled={saving}>
            {saving ? 'Saving locally…' : 'Save settings'}
          </button>
        </form>

        <dl className="core-details compact">
          <div><dt>API</dt><dd>127.0.0.1:8000</dd></div>
          <div><dt>Database</dt><dd>data/nexus.db</dd></div>
          <div><dt>Version</dt><dd>{version}</dd></div>
        </dl>
        <div className="settings-safety"><ShieldCheck size={18} /><span>Voice identity is not authorisation. Sensitive actions still require explicit approval.</span></div>
      </section>
    </div>
  )
}
