import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { Viseme } from '@/lib/speech'

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

export default function NexusHumanoid({
  active = false,
  listening = false,
  speaking = false,
  viseme = 'rest',
}: NexusHumanoidProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef({ active, listening, speaking, viseme })
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    stateRef.current = { active, listening, speaking, viseme }
  }, [active, listening, speaking, viseme])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' })
    } catch {
      queueMicrotask(() => setFailed(true))
      return
    }

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 60)
    camera.position.set(0, 0.1, 7.3)

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))
    renderer.setClearColor(0x000000, 0)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.15
    host.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.065
    controls.enablePan = false
    controls.enableZoom = false
    controls.target.set(0, -0.05, 0)
    controls.minPolarAngle = Math.PI * 0.38
    controls.maxPolarAngle = Math.PI * 0.62

    scene.add(new THREE.HemisphereLight(0xffedbd, 0x171b22, 1.5))
    const key = new THREE.DirectionalLight(0xffe2a0, 3.1)
    key.position.set(-3, 4, 5)
    scene.add(key)
    const rim = new THREE.PointLight(0xf2c94c, 16, 12)
    rim.position.set(3, 1, -1)
    scene.add(rim)
    const fill = new THREE.PointLight(0x8c9aa5, 7, 10)
    fill.position.set(-3, -1, 3)
    scene.add(fill)

    const skin = new THREE.MeshStandardMaterial({ color: 0xa99978, roughness: 0.58, metalness: 0.28 })
    const skinSoft = new THREE.MeshStandardMaterial({ color: 0xc1b28c, roughness: 0.72, metalness: 0.12 })
    const dark = new THREE.MeshStandardMaterial({ color: 0x181b1b, roughness: 0.35, metalness: 0.72 })
    const eyeWhite = new THREE.MeshStandardMaterial({ color: 0xe8e3d3, roughness: 0.3 })
    const irisMaterial = new THREE.MeshStandardMaterial({
      color: 0xf2c94c,
      emissive: 0x8a6710,
      emissiveIntensity: 1.1,
      roughness: 0.25,
    })
    const mouthMaterial = new THREE.MeshStandardMaterial({ color: 0x271b18, roughness: 0.8 })
    const lipMaterial = new THREE.MeshStandardMaterial({ color: 0x725a44, roughness: 0.65, metalness: 0.15 })

    const portrait = new THREE.Group()
    portrait.position.y = 0.05
    scene.add(portrait)

    const shoulders = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24), dark)
    shoulders.position.set(0, -1.72, -0.16)
    shoulders.scale.set(1.85, 0.48, 0.76)
    portrait.add(shoulders)

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.48, 0.85, 32), skin)
    neck.position.y = -1.05
    portrait.add(neck)
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.055, 10, 48), irisMaterial)
    collar.rotation.x = Math.PI / 2
    collar.position.y = -1.38
    portrait.add(collar)

    const head = new THREE.Group()
    head.position.y = 0.2
    portrait.add(head)

    const jaw = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), skin)
    jaw.position.set(0, -0.34, 0)
    jaw.scale.set(0.76, 0.67, 0.72)
    head.add(jaw)
    const cranium = new THREE.Mesh(new THREE.SphereGeometry(1.18, 48, 32), skinSoft)
    cranium.position.y = 0.25
    cranium.scale.set(0.88, 1.04, 0.8)
    head.add(cranium)

    const scalp = new THREE.Mesh(
      new THREE.SphereGeometry(1.195, 48, 16, 0, Math.PI * 2, 0, Math.PI * 0.34),
      dark,
    )
    scalp.position.y = 0.25
    scalp.scale.set(0.88, 1.04, 0.8)
    head.add(scalp)

    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 16), skin)
      ear.position.set(side * 1.02, 0.22, -0.02)
      ear.scale.set(0.48, 1, 0.55)
      head.add(ear)
      const temple = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.42, 12), irisMaterial)
      temple.position.set(side * 0.94, 0.42, 0.35)
      head.add(temple)
    }

    const eyelids: THREE.Mesh[] = []
    const irises: THREE.Group[] = []
    for (const side of [-1, 1]) {
      const eye = new THREE.Group()
      eye.position.set(side * 0.4, 0.52, 0.86)
      head.add(eye)
      const white = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18), eyeWhite)
      white.scale.set(0.24, 0.105, 0.075)
      eye.add(white)
      const iris = new THREE.Group()
      iris.position.z = 0.075
      const irisDisc = new THREE.Mesh(new THREE.CircleGeometry(0.067, 28), irisMaterial)
      iris.add(irisDisc)
      const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.028, 20), dark)
      pupil.position.z = 0.003
      iris.add(pupil)
      eye.add(iris)
      irises.push(iris)

      const eyelid = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.018, 0.035), skinSoft)
      eyelid.position.set(0, 0.11, 0.09)
      eye.add(eyelid)
      eyelids.push(eyelid)

      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.045, 0.05), dark)
      brow.position.set(side * 0.4, 0.79, 0.88)
      brow.rotation.z = side * -0.08
      head.add(brow)
    }

    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.44, 4), skin)
    nose.rotation.x = Math.PI / 2
    nose.rotation.y = Math.PI / 4
    nose.position.set(0, 0.14, 0.99)
    head.add(nose)

    const mouth = new THREE.Group()
    mouth.position.set(0, -0.34, 0.79)
    head.add(mouth)
    const mouthInterior = new THREE.Mesh(new THREE.CircleGeometry(0.31, 36), mouthMaterial)
    mouthInterior.scale.set(1, 0.2, 1)
    mouth.add(mouthInterior)
    const teeth = new THREE.Mesh(new THREE.BoxGeometry(0.37, 0.035, 0.012), eyeWhite)
    teeth.position.set(0, 0.025, 0.008)
    mouth.add(teeth)
    const lips = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.022, 10, 48), lipMaterial)
    lips.scale.set(1, 0.27, 1)
    lips.position.z = 0.012
    mouth.add(lips)

    const chinLight = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.025, 0.025), irisMaterial)
    chinLight.position.set(0, -0.75, 0.57)
    head.add(chinLight)

    const haloMaterial = new THREE.MeshBasicMaterial({ color: 0xf2c94c, transparent: true, opacity: 0.2 })
    const halo = new THREE.Mesh(new THREE.TorusGeometry(1.72, 0.008, 6, 128), haloMaterial)
    halo.position.set(0, 0.15, -0.85)
    scene.add(halo)
    const haloInner = new THREE.Mesh(new THREE.TorusGeometry(1.52, 0.005, 6, 128), haloMaterial.clone())
    haloInner.position.set(0, 0.15, -0.82)
    scene.add(haloInner)

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
      head.rotation.y = Math.sin(seconds * 0.48) * 0.045 * idle + (current.listening ? -0.045 : 0)
      head.rotation.x = Math.sin(seconds * 0.34) * 0.018 * idle
      portrait.position.y = 0.05 + Math.sin(seconds * 0.8) * 0.018 * idle
      halo.rotation.z = seconds * 0.035 * idle
      haloInner.rotation.z = -seconds * 0.025 * idle

      const blinkPhase = seconds % 4.8
      const blink = blinkPhase > 4.55 ? Math.sin(((blinkPhase - 4.55) / 0.25) * Math.PI) : 0
      eyelids.forEach((eyelid) => {
        eyelid.scale.y = 1 + blink * 12
        eyelid.position.y = 0.11 - blink * 0.1
      })
      irises.forEach((iris) => {
        iris.position.x = Math.sin(seconds * 0.3) * 0.015 * idle
        iris.position.y = current.listening ? 0.012 : 0
      })

      const speechWave = 0.3 + Math.abs(Math.sin(seconds * 12.4)) * 0.45
        + Math.abs(Math.sin(seconds * 7.1)) * 0.25
      const strength = current.speaking ? Math.max(0.14, visemeStrength[current.viseme]) : 0
      const openness = strength * speechWave
      mouthInterior.scale.y = 0.2 + openness * 1.45
      lips.scale.y = 0.27 + openness * 1.15
      lips.scale.x = current.viseme === 'round' ? 0.72 : 1
      teeth.visible = current.viseme === 'teeth' || openness > 0.38
      jaw.position.y = -0.34 - openness * 0.055
      irisMaterial.emissiveIntensity = current.active || current.listening || current.speaking ? 1.8 : 1.1

      controls.update()
      renderer.render(scene, camera)
    })

    return () => {
      renderer.setAnimationLoop(null)
      observer.disconnect()
      controls.dispose()
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
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
      <div className="humanoid-fallback" role="img" aria-label="Stylized humanoid Nexus face">
        <svg viewBox="0 0 320 320" aria-hidden="true">
          <circle cx="160" cy="150" r="125" fill="none" stroke="currentColor" opacity=".25" />
          <path d="M160 65c-60 0-82 48-72 112 8 54 38 86 72 86s64-32 72-86c10-64-12-112-72-112Z" fill="#a99978" />
          <path d="M100 135h45M175 135h45" stroke="#181b1b" strokeWidth="7" strokeLinecap="round" />
          <circle cx="126" cy="151" r="8" fill="#f2c94c" /><circle cx="194" cy="151" r="8" fill="#f2c94c" />
          <path d="M160 151l-10 43h20" fill="none" stroke="#725a44" strokeWidth="5" strokeLinejoin="round" />
          <ellipse cx="160" cy="218" rx="28" ry={speaking ? 14 : 4} fill="#271b18" stroke="#f2c94c" strokeWidth="2" />
        </svg>
      </div>
    )
  }

  return (
    <div
      ref={hostRef}
      className="nexus-humanoid"
      role="img"
      aria-label={`Interactive humanoid Nexus face. ${speaking ? 'Nexus is speaking.' : 'Drag to rotate.'}`}
    />
  )
}
