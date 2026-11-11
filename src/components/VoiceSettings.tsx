import { useState } from 'react'
import type { FormEvent } from 'react'
import { AudioLines, BrainCircuit, Check, Globe2, Play, ShieldCheck, Square, UserRound, X } from 'lucide-react'
import type { AssistantSettings, ModelStatus } from '@/types/nexus'

interface VoiceSettingsProps {
  settings: AssistantSettings
  modelStatus: ModelStatus | null
  version: string
  speaking: boolean
  onClose: () => void
  onSave: (settings: AssistantSettings) => Promise<void>
  onPreview: (settings: AssistantSettings) => void
  onStop: () => void
}

export default function VoiceSettings({
  settings,
  modelStatus,
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
    if (!draft.model_name.trim()) {
      setError('Enter the Ollama model to use.')
      return
    }
    if (draft.wake_word.split(/[,\n]/).filter((phrase) => phrase.trim()).length > 8) {
      setError('Use no more than eight comma-separated wake phrases.')
      return
    }
    if (draft.wake_word.split(/[,\n]/).some((phrase) => phrase.trim().length < 2)) {
      setError('Enter wake phrases with at least two characters each.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onSave({
        ...draft,
        assistant_name: draft.assistant_name.trim(),
        model_name: draft.model_name.trim(),
        wake_word: draft.wake_word.trim(),
      })
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
        <span className="eyebrow yellow">ASSISTANT, MODEL & VOICE</span>
        <h2 id="settings-title">Make Nexus yours.</h2>
        <p>These preferences are stored in your local SQLite database. Model and microphone availability are checked separately.</p>

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

          <div className="wake-word-settings">
            <label htmlFor="wake-word">Wake phrases</label>
            <textarea
              id="wake-word"
              value={draft.wake_word}
              onChange={(event) => setDraft({ ...draft, wake_word: event.target.value })}
              maxLength={240}
              rows={2}
              autoComplete="off"
              placeholder="Nexus, Hey, Computer"
            />
            <p>Separate up to eight phrases with commas. “Nexus” also accepts bounded recognition variants such as “nextus” and “next to.” Enable listening explicitly from the main console; it is never restored after reload.</p>
            <label htmlFor="speech-locale">Recognition language</label>
            <select
              id="speech-locale"
              value={draft.speech_locale}
              onChange={(event) => setDraft({ ...draft, speech_locale: event.target.value as AssistantSettings['speech_locale'] })}
            >
              <option value="en-NG">English (Nigeria) — en-NG</option>
              <option value="en-US">English (United States) — en-US</option>
              <option value="en-GB">English (United Kingdom) — en-GB</option>
            </select>
            <p>en-NG may improve accent handling where the browser speech service supports it. Actual recognition support varies by browser and operating system.</p>
          </div>

          <div className="model-settings-block">
            <div className="model-settings-heading">
              <BrainCircuit size={17} />
              <span><strong>Local conversation model</strong><small>Ollama inference · not training or self-modification</small></span>
            </div>
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={draft.model_enabled}
                onChange={(event) => setDraft({ ...draft, model_enabled: event.target.checked })}
              />
              <span><strong>Enable free-form AI conversation</strong><small>Known action requests still use validated commands and approvals.</small></span>
            </label>
            <label htmlFor="model-name">Ollama model</label>
            <input
              id="model-name"
              list="installed-ollama-models"
              value={draft.model_name}
              onChange={(event) => setDraft({ ...draft, model_name: event.target.value })}
              maxLength={100}
              autoComplete="off"
              disabled={!draft.model_enabled}
              placeholder="qwen2.5:3b"
            />
            <datalist id="installed-ollama-models">
              {modelStatus?.installed_models.map((model) => <option key={model} value={model} />)}
            </datalist>
            <p className={`model-settings-status model-settings-${modelStatus?.state ?? 'unavailable'}`}>
              {modelStatus?.detail ?? 'Model status has not been checked yet.'}
            </p>
          </div>

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
        <div className="settings-safety"><ShieldCheck size={18} /><span>Speech recognition is not speaker identification, so “only my voice” is not falsely enabled here. Browser speech services may process audio off-device. Sensitive actions still require explicit approval.</span></div>
      </section>
    </div>
  )
}
