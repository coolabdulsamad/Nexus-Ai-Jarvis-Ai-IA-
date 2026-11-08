import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { AppWindow, Check, Code2, Folder, FolderSearch, Monitor, Search, ShieldCheck, WifiOff } from 'lucide-react'
import { nexusApi } from '@/lib/api'
import type { DirectoryEntry, SystemStatus } from '@/types/nexus'

interface SystemControlProps {
  busy: boolean
  onCommand: (text: string) => void
}

export default function SystemControl({ busy, onCommand }: SystemControlProps) {
  const [status, setStatus] = useState<SystemStatus | null>(null)
  const [query, setQuery] = useState('')
  const [directories, setDirectories] = useState<DirectoryEntry[]>([])
  const [searched, setSearched] = useState(false)
  const [searching, setSearching] = useState(false)
  const [truncated, setTruncated] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    nexusApi.systemStatus()
      .then(setStatus)
      .catch((statusError: unknown) => setError(statusError instanceof Error ? statusError.message : 'System connector status is unavailable.'))
  }, [])

  const search = async (event: FormEvent) => {
    event.preventDefault()
    const normalized = query.trim()
    if (!normalized || searching) return
    setSearching(true)
    setError('')
    try {
      const result = await nexusApi.directories(normalized)
      setDirectories(result.directories)
      setTruncated(result.truncated)
      setSearched(true)
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : 'Folder discovery failed safely.')
    } finally {
      setSearching(false)
    }
  }

  const openFolder = (directory: DirectoryEntry, application: 'vscode' | 'files' = 'vscode') => {
    onCommand(`Open folder ${directory.path} in ${application === 'vscode' ? 'VS Code' : 'File Manager'}`)
  }

  return (
    <section id="system" className="workspace-panel system-section page-anchor">
      <div className="system-heading">
        <div>
          <span className="eyebrow yellow">LOCAL SYSTEM CONNECTOR</span>
          <h2>Open real apps and folders.</h2>
          <p>Discover directory names within configured roots, then approve the exact launch. Nexus never turns these requests into arbitrary shell commands.</p>
        </div>
        <ShieldCheck size={30} />
      </div>

      <div className="system-layout">
        <div className="system-discovery">
          <div className="system-subheading"><FolderSearch size={17} /><strong>Bounded folder discovery</strong><span>DEPTH {status?.discovery.max_depth ?? 2}</span></div>
          <form className="folder-search" onSubmit={search}>
            <label htmlFor="folder-query">Folder name</label>
            <div>
              <Search size={16} />
              <input
                id="folder-query"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Projects, Documents, Nexus…"
                maxLength={100}
              />
              <button type="submit" disabled={!query.trim() || searching}>{searching ? 'Searching…' : 'Find folders'}</button>
            </div>
          </form>
          <div className="discovery-roots">
            <span>SEARCH ROOTS</span>
            {status?.roots.length ? status.roots.map((root) => <code key={root}>{root}</code>) : <code>Checking configured roots…</code>}
          </div>

          <div className="directory-results" aria-live="polite">
            {searched && directories.length === 0 && (
              <div className="directory-empty"><Folder size={18} /><span>No visible matching directory was found within the bounded search. Nothing was opened.</span></div>
            )}
            {directories.map((directory) => (
              <article className="directory-row" key={directory.path}>
                <Folder size={18} />
                <div><strong>{directory.name}</strong><code>{directory.path}</code></div>
                <button onClick={() => openFolder(directory)} disabled={busy}><Code2 size={14} /> VS Code</button>
                <button className="directory-files-button" onClick={() => openFolder(directory, 'files')} disabled={busy} aria-label={`Open ${directory.name} in file manager`}><Folder size={14} /></button>
              </article>
            ))}
            {truncated && <p className="directory-truncated">The bounded scan stopped early. Narrow the folder name for a more precise result.</p>}
          </div>
          <ul className="system-boundaries">
            <li><Check size={13} /> Directory metadata only; file contents are never read</li>
            <li><Check size={13} /> Hidden directories and symlinks skipped; 600-entry scan cap</li>
            <li><Check size={13} /> Every launch needs a separate approval with its exact path</li>
          </ul>
        </div>

        <div className="system-side">
          <div className="app-launcher">
            <div className="system-subheading"><AppWindow size={17} /><strong>Fixed app catalog</strong></div>
            {status?.applications.map((application) => (
              <div className="app-launch-row" key={application.id}>
                <div>{application.id === 'vscode' ? <Code2 size={20} /> : <Folder size={20} />}<span><strong>{application.label}</strong><small>{application.installed ? 'Detected on PATH' : 'Not detected on PATH'}</small></span></div>
                <button onClick={() => onCommand(`Open ${application.label}`)} disabled={busy || !application.installed}>Request open</button>
              </div>
            )) ?? <p className="system-loading">Checking local applications…</p>}
          </div>

          <div className="screen-boundary-card">
            <div><Monitor size={21} /><span><strong>Screen & multi-monitor</strong><small>NOT CONFIGURED</small></span></div>
            <p>{status?.screen_awareness.detail ?? 'No screen connector has been activated.'}</p>
            <span className="screen-off"><WifiOff size={13} /> CAPTURE OFF · CLICKING OFF</span>
          </div>
        </div>
      </div>
      {error && <p className="system-error" role="alert">{error}</p>}
      <p className="system-config-note">Set <code>NEXUS_SYSTEM_ROOTS</code> before startup to choose different discovery roots. Separate multiple roots with your operating system’s path separator.</p>
    </section>
  )
}
