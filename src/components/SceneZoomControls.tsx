import { Minus, Plus, RotateCcw } from 'lucide-react'

export type ZoomAction = 'in' | 'out' | 'reset'

interface SceneZoomControlsProps {
  label: string
  onAction: (action: ZoomAction) => void
}

export default function SceneZoomControls({ label, onAction }: SceneZoomControlsProps) {
  return (
    <div className="scene-zoom-controls" role="group" aria-label={`${label} camera controls`}>
      <button type="button" onClick={() => onAction('in')} aria-label={`Zoom into ${label}`} title="Zoom in">
        <Plus size={15} />
      </button>
      <button type="button" onClick={() => onAction('out')} aria-label={`Zoom out of ${label}`} title="Zoom out">
        <Minus size={15} />
      </button>
      <button type="button" onClick={() => onAction('reset')} aria-label={`Reset ${label} view`} title="Reset view">
        <RotateCcw size={14} />
      </button>
    </div>
  )
}
