import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { Viseme } from '@/lib/speech'
import SceneZoomControls from './SceneZoomControls'
import type { ZoomAction } from './SceneZoomControls'

interface NexusHumanoidProps {
  active?: boolean
  listening?: boolean
  speaking?: boolean
  viseme?: Viseme
}

const visemeStrength: Record<Viseme, number> = {
  rest: 0,
  closed: 0.08,
  teeth: 0.32,
  wide: 0.62,
  open: 1,
  round: 0.82,
}

const YELLOW = 0xf2c94c
const PALE_GOLD = 0xffe8a6

function seededRandom(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function makeLine(points: THREE.Vector3[], color: number, opacity: number) {
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
    }),
  )
}

export default function NexusHumanoid({
  active = false,
  listening = false,
  speaking = false,
  viseme = 'rest',
}: NexusHumanoidProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef({ active, listening, speaking, viseme })
  const zoomRef = useRef<(action: ZoomAction) => void>(() => undefined)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    stateRef.current = { active, listening, speaking, viseme }
  }, [active, listening, speaking, viseme])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
    } catch {
      queueMicrotask(() => setFailed(true))
      return
    }

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const random = seededRandom(16016)
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 60)
    const initialPosition = new THREE.Vector3(0, 0.05, 6.4)
    camera.position.copy(initialPosition)

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8))
    renderer.setClearColor(0x000000, 0)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    host.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.065
    controls.enablePan = false
    controls.enableZoom = true
    controls.zoomSpeed = 0.72
    controls.rotateSpeed = 0.55
    controls.minDistance = 3.1
    controls.maxDistance = 10.5
    controls.target.set(0, -0.05, 0)
    controls.minPolarAngle = Math.PI * 0.3
    controls.maxPolarAngle = Math.PI * 0.7

    const zoom = (action: ZoomAction) => {
      if (action === 'reset') {
        camera.position.copy(initialPosition)
        controls.target.set(0, -0.05, 0)
      } else {
        const offset = camera.position.clone().sub(controls.target)
        const distance = THREE.MathUtils.clamp(
          offset.length() * (action === 'in' ? 0.78 : 1.28),
          controls.minDistance,
          controls.maxDistance,
        )
        camera.position.copy(controls.target).add(offset.normalize().multiplyScalar(distance))
      }
      controls.update()
    }
    zoomRef.current = zoom

    const portrait = new THREE.Group()
    portrait.position.y = 0.08
    scene.add(portrait)
    const head = new THREE.Group()
    head.position.y = 0.28
    portrait.add(head)

    const upperPositions: number[] = []
    const upperColors: number[] = []
    const jawPositions: number[] = []
    const jawColors: number[] = []
    const goldenAngle = Math.PI * (3 - Math.sqrt(5))
    const headCount = 20500
    for (let index = 0; index < headCount; index += 1) {
      const normalizedY = 1 - (2 * (index + 0.5)) / headCount
      const ring = Math.sqrt(Math.max(0, 1 - normalizedY * normalizedY))
      const phi = index * goldenAngle
      const jawTaper = normalizedY < -0.2
        ? 0.54 + Math.max(0, normalizedY + 1) * 0.57
        : 1
      const templeTaper = normalizedY > 0.55 ? 0.92 : 1
      const x = Math.cos(phi) * ring * 0.88 * jawTaper * templeTaper
      const y = normalizedY * 1.18
      const front = Math.max(0, Math.sin(phi))
      let z = Math.sin(phi) * ring * 0.69
      if (front > 0.2) {
        const leftSocket = Math.exp(-((x + 0.34) ** 2) / 0.045 - ((y - 0.47) ** 2) / 0.018)
        const rightSocket = Math.exp(-((x - 0.34) ** 2) / 0.045 - ((y - 0.47) ** 2) / 0.018)
        const noseBridge = Math.exp(-(x ** 2) / 0.012 - ((y - 0.18) ** 2) / 0.22)
        const noseTip = Math.exp(-(x ** 2) / 0.018 - ((y + 0.02) ** 2) / 0.018)
        const cheeks = Math.exp(-((Math.abs(x) - 0.47) ** 2) / 0.055 - ((y + 0.08) ** 2) / 0.08)
        const brow = Math.exp(-((Math.abs(x) - 0.33) ** 2) / 0.09 - ((y - 0.65) ** 2) / 0.012)
        z += front * (noseBridge * 0.19 + noseTip * 0.16 + cheeks * 0.09 + brow * 0.07)
        z -= front * (leftSocket + rightSocket) * 0.13
        const eyeOpening = ((Math.abs(x) - 0.34) / 0.22) ** 2 + ((y - 0.48) / 0.085) ** 2
        const mouthOpening = (x / 0.29) ** 2 + ((y + 0.36) / 0.07) ** 2
        if (eyeOpening < 1 || mouthOpening < 1) continue
      }
      const positions = normalizedY < -0.38 ? jawPositions : upperPositions
      const colors = normalizedY < -0.38 ? jawColors : upperColors
      positions.push(x, y, z)
      const intensity = 0.22 + front * 0.48 + random() * 0.26
      colors.push(intensity, intensity * 0.77, intensity * 0.24)
    }

    const makeHeadPoints = (positions: number[], colors: number[], size: number) => {
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
      return new THREE.Points(geometry, new THREE.PointsMaterial({
        size,
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }))
    }
    const upperHead = makeHeadPoints(upperPositions, upperColors, 0.019)
    const jaw = makeHeadPoints(jawPositions, jawColors, 0.019)
    head.add(upperHead, jaw)

    const facePositions: number[] = []
    const faceColors: number[] = []
    for (let index = 0; index < 4200; index += 1) {
      const angle = random() * Math.PI * 2
      const radius = Math.sqrt(random())
      const x = Math.cos(angle) * radius * 0.68
      const y = Math.sin(angle) * radius * 0.92 + 0.02
      const eyeOpening = ((Math.abs(x) - 0.34) / 0.24) ** 2 + ((y - 0.48) / 0.11) ** 2
      const mouthOpening = (x / 0.32) ** 2 + ((y + 0.36) / 0.11) ** 2
      if (eyeOpening < 1.05 || mouthOpening < 1.05) continue
      let z = 0.67 * Math.sqrt(Math.max(0.05, 1 - (x * x) / 0.82 - (y * y) / 1.72)) + 0.04
      z += Math.exp(-(x ** 2) / 0.015 - ((y - 0.16) ** 2) / 0.2) * 0.19
      z += Math.exp(-((Math.abs(x) - 0.47) ** 2) / 0.05 - ((y + 0.08) ** 2) / 0.09) * 0.07
      facePositions.push(x, y, z)
      const featureGlow = Math.exp(-(x ** 2) / 0.08) * 0.18
      const glow = 0.46 + (1 - radius) * 0.32 + featureGlow + random() * 0.18
      faceColors.push(glow, glow * 0.68, glow * 0.15)
    }
    const faceGeometry = new THREE.BufferGeometry()
    faceGeometry.setAttribute('position', new THREE.Float32BufferAttribute(facePositions, 3))
    faceGeometry.setAttribute('color', new THREE.Float32BufferAttribute(faceColors, 3))
    const faceMaterial = new THREE.PointsMaterial({
      size: 0.014,
      vertexColors: true,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    head.add(new THREE.Points(faceGeometry, faceMaterial))

    const contourMaterial = new THREE.LineBasicMaterial({
      color: YELLOW,
      transparent: true,
      opacity: 0.11,
      blending: THREE.AdditiveBlending,
    })
    for (let band = 0; band < 25; band += 1) {
      const normalizedY = -0.9 + (band / 24) * 1.82
      const ring = Math.sqrt(Math.max(0, 1 - normalizedY * normalizedY))
      const taper = normalizedY < -0.2 ? 0.54 + Math.max(0, normalizedY + 1) * 0.57 : 1
      const templeTaper = normalizedY > 0.55 ? 0.92 : 1
      const points: THREE.Vector3[] = []
      for (let step = 0; step < 96; step += 1) {
        const angle = (step / 96) * Math.PI * 2
        points.push(new THREE.Vector3(
          Math.cos(angle) * ring * 0.885 * taper * templeTaper,
          normalizedY * 1.18,
          Math.sin(angle) * ring * 0.7,
        ))
      }
      head.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), contourMaterial))
    }

    const dustPositions: number[] = []
    for (let index = 0; index < 2400; index += 1) {
      const angle = random() * Math.PI * 2
      const normalizedY = random() * 2 - 1
      const ring = Math.sqrt(1 - normalizedY * normalizedY)
      const radius = 0.95 + Math.pow(random(), 2) * 0.55
      dustPositions.push(
        Math.cos(angle) * ring * radius,
        normalizedY * 1.28,
        Math.sin(angle) * ring * radius * 0.82,
      )
    }
    const dustGeometry = new THREE.BufferGeometry()
    dustGeometry.setAttribute('position', new THREE.Float32BufferAttribute(dustPositions, 3))
    const dust = new THREE.Points(dustGeometry, new THREE.PointsMaterial({
      color: YELLOW,
      size: 0.018,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }))
    head.add(dust)

    const shoulderPositions: number[] = []
    const shoulderColors: number[] = []
    for (let index = 0; index < 9800; index += 1) {
      const theta = random() * Math.PI * 2
      const y = -1.22 - random() * 0.94
      const progress = (-1.22 - y) / 0.94
      const shoulderWidth = 0.46 + Math.sin(Math.min(1, progress * 1.35) * Math.PI * 0.72) * 1.16
      const taper = 1 - Math.max(0, progress - 0.68) * 0.48
      const x = Math.cos(theta) * shoulderWidth * taper
      const z = Math.sin(theta) * (0.34 + Math.sin(progress * Math.PI) * 0.18) - 0.12
      const surfaceNoise = (random() - 0.5) * 0.025
      shoulderPositions.push(x, y + surfaceNoise, z)
      const front = Math.max(0, Math.sin(theta))
      const intensity = 0.2 + front * 0.18 + random() * 0.42
      shoulderColors.push(intensity, intensity * 0.75, intensity * 0.22)
    }
    const shoulderGeometry = new THREE.BufferGeometry()
    shoulderGeometry.setAttribute('position', new THREE.Float32BufferAttribute(shoulderPositions, 3))
    shoulderGeometry.setAttribute('color', new THREE.Float32BufferAttribute(shoulderColors, 3))
    const shoulders = new THREE.Points(shoulderGeometry, new THREE.PointsMaterial({
      size: 0.017,
      vertexColors: true,
      transparent: true,
      opacity: 0.68,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }))
    portrait.add(shoulders)

    const neckPositions: number[] = []
    for (let index = 0; index < 1700; index += 1) {
      const theta = random() * Math.PI * 2
      const y = -1.36 + random() * 0.58
      const radius = 0.25 + (-0.78 - y) * 0.14
      neckPositions.push(Math.cos(theta) * radius, y, Math.sin(theta) * 0.27)
    }
    const neckGeometry = new THREE.BufferGeometry()
    neckGeometry.setAttribute('position', new THREE.Float32BufferAttribute(neckPositions, 3))
    portrait.add(new THREE.Points(neckGeometry, new THREE.PointsMaterial({
      color: YELLOW,
      size: 0.016,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })))

    for (let band = 0; band < 11; band += 1) {
      const progress = band / 10
      const y = -1.26 - progress * 0.86
      const width = (0.5 + Math.sin(Math.min(1, progress * 1.35) * Math.PI * 0.72) * 1.16)
        * (1 - Math.max(0, progress - 0.68) * 0.48)
      const points: THREE.Vector3[] = []
      for (let step = 0; step <= 80; step += 1) {
        const angle = Math.PI * (0.04 + (step / 80) * 0.92)
        points.push(new THREE.Vector3(
          Math.cos(angle) * width,
          y,
          Math.sin(angle) * (0.34 + Math.sin(progress * Math.PI) * 0.18) - 0.12,
        ))
      }
      portrait.add(makeLine(points, YELLOW, 0.09 + (1 - progress) * 0.08))
    }

    for (const side of [-1, 1]) {
      portrait.add(makeLine([
        new THREE.Vector3(side * 0.2, -1.22, 0.18),
        new THREE.Vector3(side * 0.54, -1.38, 0.34),
        new THREE.Vector3(side * 1.18, -1.49, 0.24),
      ], PALE_GOLD, 0.36))
    }

    const energyLines: THREE.Line[] = []
    for (let strand = 0; strand < 7; strand += 1) {
      const points: THREE.Vector3[] = []
      for (let step = 0; step <= 28; step += 1) {
        const progress = step / 28
        points.push(new THREE.Vector3(
          Math.sin(progress * 9 + strand) * (0.045 + strand * 0.009),
          -1.72 + progress * 1.05,
          0.52 + Math.cos(progress * 7 + strand) * 0.035,
        ))
      }
      const line = makeLine(points, strand === 3 ? PALE_GOLD : YELLOW, strand === 3 ? 0.8 : 0.32)
      portrait.add(line)
      energyLines.push(line)
    }

    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 20, 14),
      new THREE.MeshBasicMaterial({ color: PALE_GOLD, blending: THREE.AdditiveBlending }),
    )
    core.position.set(0, -1.68, 0.55)
    portrait.add(core)
    const coreRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.16, 0.006, 6, 64),
      new THREE.MeshBasicMaterial({ color: YELLOW, transparent: true, opacity: 0.7 }),
    )
    coreRing.position.copy(core.position)
    portrait.add(coreRing)

    const eyes: THREE.Group[] = []
    const irisMaterials: THREE.MeshBasicMaterial[] = []
    for (const side of [-1, 1]) {
      const eye = new THREE.Group()
      eye.position.set(side * 0.34, 0.48, 0.77)
      head.add(eye)
      const outlinePoints: THREE.Vector3[] = []
      for (let step = 0; step <= 48; step += 1) {
        const angle = (step / 48) * Math.PI * 2
        outlinePoints.push(new THREE.Vector3(Math.cos(angle) * 0.21, Math.sin(angle) * 0.072, 0))
      }
      eye.add(makeLine(outlinePoints, YELLOW, 0.72))
      const irisMaterial = new THREE.MeshBasicMaterial({
        color: PALE_GOLD,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
      })
      const iris = new THREE.Mesh(new THREE.CircleGeometry(0.047, 28), irisMaterial)
      iris.position.z = 0.012
      eye.add(iris)
      irisMaterials.push(irisMaterial)
      const pupil = new THREE.Mesh(
        new THREE.CircleGeometry(0.018, 20),
        new THREE.MeshBasicMaterial({ color: 0x211b09 }),
      )
      pupil.position.z = 0.018
      eye.add(pupil)
      eyes.push(eye)
      head.add(makeLine([
        new THREE.Vector3(side * 0.34 - 0.22, 0.69, 0.76),
        new THREE.Vector3(side * 0.34, 0.74, 0.8),
        new THREE.Vector3(side * 0.34 + 0.22, 0.69, 0.76),
      ], YELLOW, 0.52))
    }

    head.add(makeLine([
      new THREE.Vector3(0, 0.36, 0.82),
      new THREE.Vector3(-0.035, 0.08, 0.88),
      new THREE.Vector3(0.045, 0.035, 0.86),
    ], YELLOW, 0.38))

    const mouth = new THREE.Group()
    mouth.position.set(0, -0.36, 0.79)
    head.add(mouth)
    const mouthInterior = new THREE.Mesh(
      new THREE.CircleGeometry(0.285, 48),
      new THREE.MeshBasicMaterial({ color: 0x100e07, transparent: true, opacity: 0.9 }),
    )
    mouthInterior.scale.y = 0.16
    mouth.add(mouthInterior)
    const lipPositions: number[] = []
    for (let index = 0; index < 220; index += 1) {
      const angle = (index / 220) * Math.PI * 2
      const jitter = (random() - 0.5) * 0.012
      lipPositions.push(Math.cos(angle) * (0.29 + jitter), Math.sin(angle) * (0.095 + jitter), 0.012 + random() * 0.008)
    }
    const lipGeometry = new THREE.BufferGeometry()
    lipGeometry.setAttribute('position', new THREE.Float32BufferAttribute(lipPositions, 3))
    const lips = new THREE.Points(lipGeometry, new THREE.PointsMaterial({
      color: PALE_GOLD,
      size: 0.026,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }))
    lips.scale.y = 0.24
    mouth.add(lips)
    const teeth = makeLine([
      new THREE.Vector3(-0.18, 0.012, 0.024),
      new THREE.Vector3(0, 0.02, 0.026),
      new THREE.Vector3(0.18, 0.012, 0.024),
    ], PALE_GOLD, 0.65)
    mouth.add(teeth)

    const haloMaterial = new THREE.LineBasicMaterial({ color: YELLOW, transparent: true, opacity: 0.18 })
    const makeHalo = (radius: number) => {
      const points: THREE.Vector3[] = []
      for (let step = 0; step < 160; step += 1) {
        const angle = (step / 160) * Math.PI * 2
        points.push(new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius + 0.15, -0.72))
      }
      return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), haloMaterial)
    }
    const halo = makeHalo(1.55)
    const haloInner = makeHalo(1.36)
    scene.add(halo, haloInner)

    const resize = () => {
      const width = host.clientWidth
      const height = host.clientHeight
      renderer.setSize(width, height, false)
      camera.aspect = width / Math.max(height, 1)
      camera.updateProjectionMatrix()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    resize()

    renderer.setAnimationLoop((time) => {
      const seconds = time / 1000
      const current = stateRef.current
      const idle = reducedMotion ? 0 : 1
      head.rotation.y = Math.sin(seconds * 0.42) * 0.055 * idle + (current.listening ? -0.055 : 0)
      head.rotation.x = Math.sin(seconds * 0.31) * 0.022 * idle
      portrait.position.y = 0.08 + Math.sin(seconds * 0.75) * 0.018 * idle
      halo.rotation.z = seconds * 0.026 * idle
      haloInner.rotation.z = -seconds * 0.02 * idle
      dust.rotation.y = seconds * 0.025 * idle

      const blinkPhase = seconds % 4.6
      const blink = blinkPhase > 4.4 ? Math.sin(((blinkPhase - 4.4) / 0.2) * Math.PI) : 0
      eyes.forEach((eye, index) => {
        eye.scale.y = 1 - blink * 0.88
        eye.position.x = (index === 0 ? -0.34 : 0.34) + Math.sin(seconds * 0.3) * 0.009 * idle
      })

      const speechWave = 0.34 + Math.abs(Math.sin(seconds * 12.2)) * 0.42
        + Math.abs(Math.sin(seconds * 7.4)) * 0.24
      const strength = current.speaking ? Math.max(0.16, visemeStrength[current.viseme]) : 0
      const openness = strength * speechWave
      mouthInterior.scale.y = 0.16 + openness * 1.35
      lips.scale.y = 0.24 + openness * 1.6
      lips.scale.x = current.viseme === 'round' ? 0.7 : current.viseme === 'wide' ? 1.12 : 1
      teeth.visible = current.viseme === 'teeth' || openness > 0.34
      jaw.position.y = -openness * 0.07
      mouth.position.y = -0.36 - openness * 0.035
      faceMaterial.opacity = 0.66 + (current.speaking ? Math.sin(seconds * 8) * 0.08 + 0.12 : 0)
      irisMaterials.forEach((material) => {
        material.opacity = current.active || current.listening || current.speaking ? 1 : 0.82
      })
      core.scale.setScalar(1 + Math.sin(seconds * (current.speaking ? 7 : 2.4)) * 0.18 * idle)
      coreRing.rotation.z = seconds * 0.5 * idle
      energyLines.forEach((line, index) => {
        const material = line.material as THREE.LineBasicMaterial
        material.opacity = 0.24 + Math.abs(Math.sin(seconds * 3.2 + index)) * (current.speaking ? 0.62 : 0.26)
      })

      controls.update()
      renderer.render(scene, camera)
    })

    return () => {
      renderer.setAnimationLoop(null)
      zoomRef.current = () => undefined
      observer.disconnect()
      controls.dispose()
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Line) {
          object.geometry.dispose()
          const materials = Array.isArray(object.material) ? object.material : [object.material]
          materials.forEach((material) => material.dispose())
        }
      })
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])

  if (failed) {
    return (
      <div className="humanoid-fallback" role="img" aria-label="Stylized particle humanoid Nexus face">
        <svg viewBox="0 0 320 320" aria-hidden="true">
          <circle cx="160" cy="150" r="125" fill="none" stroke="currentColor" opacity=".25" />
          <path d="M160 65c-60 0-82 48-72 112 8 54 38 86 72 86s64-32 72-86c10-64-12-112-72-112Z" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="2 5" />
          <path d="M100 135h45M175 135h45" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
          <circle cx="126" cy="151" r="8" fill="currentColor" /><circle cx="194" cy="151" r="8" fill="currentColor" />
          <path d="M160 151l-10 43h20" fill="none" stroke="currentColor" strokeWidth="3" />
          <ellipse cx="160" cy="218" rx="28" ry={speaking ? 14 : 4} fill="#17140a" stroke="currentColor" strokeWidth="3" />
        </svg>
      </div>
    )
  }

  return (
    <div className="nexus-humanoid humanoid-experience">
      <div
        ref={hostRef}
        className="scene-canvas-host"
        role="img"
        aria-label={`Interactive particle humanoid Nexus face. ${speaking ? 'Nexus is speaking.' : 'Drag to rotate and scroll or pinch to zoom.'}`}
      />
      <SceneZoomControls label="humanoid" onAction={(action) => zoomRef.current(action)} />
    </div>
  )
}
