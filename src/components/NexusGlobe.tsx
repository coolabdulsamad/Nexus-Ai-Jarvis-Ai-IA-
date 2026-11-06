import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import SceneZoomControls from './SceneZoomControls'
import type { ZoomAction } from './SceneZoomControls'

const YELLOW = 0xf2c94c
const GOLD = 0xffe39a

function seededRandom(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

export default function NexusGlobe({ active = false }: { active?: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef(active)
  const zoomRef = useRef<(action: ZoomAction) => void>(() => undefined)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    activeRef.current = active
  }, [active])

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
    const random = seededRandom(7429)
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 100)
    const initialPosition = new THREE.Vector3(0, 0.25, 6.5)
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
    controls.rotateSpeed = 0.58
    controls.minDistance = 2.25
    controls.maxDistance = 12
    controls.autoRotate = !reducedMotion
    controls.autoRotateSpeed = 0.42

    const zoom = (action: ZoomAction) => {
      if (action === 'reset') {
        camera.position.copy(initialPosition)
        controls.target.set(0, 0, 0)
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

    const globe = new THREE.Group()
    globe.rotation.z = -0.14
    scene.add(globe)

    const core = new THREE.Mesh(
      new THREE.SphereGeometry(1.75, 40, 28),
      new THREE.MeshBasicMaterial({
        color: YELLOW,
        transparent: true,
        opacity: 0.025,
        blending: THREE.AdditiveBlending,
      }),
    )
    globe.add(core)

    const surfacePositions: number[] = []
    const surfaceColors: number[] = []
    const landColor = new THREE.Color(GOLD)
    const oceanColor = new THREE.Color(0x8a6a18)
    const goldenAngle = Math.PI * (3 - Math.sqrt(5))
    const surfaceCount = 26000
    for (let index = 0; index < surfaceCount; index += 1) {
      const y = 1 - (2 * (index + 0.5)) / surfaceCount
      const ring = Math.sqrt(Math.max(0, 1 - y * y))
      const phi = index * goldenAngle
      const x = Math.cos(phi) * ring
      const z = Math.sin(phi) * ring
      const terrain = Math.sin(x * 5.2 + z * 1.8)
        + Math.sin(z * 6.1 - y * 3.4) * 0.72
        + Math.cos((x - y) * 8.3) * 0.4
        + Math.sin((z + y) * 11.2) * 0.22
      const land = terrain > 0.24
      if (!land && random() > 0.2) continue
      const radius = land ? 1.825 : 1.805
      surfacePositions.push(x * radius, y * radius, z * radius)
      const color = land
        ? landColor.clone().multiplyScalar(0.68 + random() * 0.5)
        : oceanColor.clone().multiplyScalar(0.28 + random() * 0.32)
      surfaceColors.push(color.r, color.g, color.b)
    }
    const surfaceGeometry = new THREE.BufferGeometry()
    surfaceGeometry.setAttribute('position', new THREE.Float32BufferAttribute(surfacePositions, 3))
    surfaceGeometry.setAttribute('color', new THREE.Float32BufferAttribute(surfaceColors, 3))
    const surfaceMaterial = new THREE.PointsMaterial({
      size: 0.024,
      vertexColors: true,
      transparent: true,
      opacity: 0.94,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    globe.add(new THREE.Points(surfaceGeometry, surfaceMaterial))

    const gridMaterial = new THREE.LineBasicMaterial({ color: YELLOW, transparent: true, opacity: 0.075 })
    for (let latitude = -60; latitude <= 60; latitude += 30) {
      const angle = THREE.MathUtils.degToRad(latitude)
      const ringRadius = Math.cos(angle) * 1.815
      const points: THREE.Vector3[] = []
      for (let step = 0; step < 128; step += 1) {
        const theta = (step / 128) * Math.PI * 2
        points.push(new THREE.Vector3(
          Math.cos(theta) * ringRadius,
          Math.sin(angle) * 1.815,
          Math.sin(theta) * ringRadius,
        ))
      }
      globe.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), gridMaterial))
    }
    for (let longitude = 0; longitude < 6; longitude += 1) {
      const rotation = (longitude / 6) * Math.PI
      const points: THREE.Vector3[] = []
      for (let step = 0; step < 128; step += 1) {
        const theta = (step / 128) * Math.PI * 2
        const point = new THREE.Vector3(
          Math.cos(theta) * 1.815,
          Math.sin(theta) * 1.815,
          0,
        )
        point.applyAxisAngle(new THREE.Vector3(0, 1, 0), rotation)
        points.push(point)
      }
      globe.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), gridMaterial))
    }

    const dustPositions: number[] = []
    const dustColors: number[] = []
    for (let index = 0; index < 2600; index += 1) {
      const theta = random() * Math.PI * 2
      const y = random() * 2 - 1
      const ring = Math.sqrt(1 - y * y)
      const radius = 1.9 + Math.pow(random(), 2) * 0.65
      dustPositions.push(Math.cos(theta) * ring * radius, y * radius, Math.sin(theta) * ring * radius)
      const intensity = 0.22 + random() * 0.5
      dustColors.push(intensity, intensity * 0.77, intensity * 0.24)
    }
    const dustGeometry = new THREE.BufferGeometry()
    dustGeometry.setAttribute('position', new THREE.Float32BufferAttribute(dustPositions, 3))
    dustGeometry.setAttribute('color', new THREE.Float32BufferAttribute(dustColors, 3))
    const dust = new THREE.Points(dustGeometry, new THREE.PointsMaterial({
      size: 0.017,
      vertexColors: true,
      transparent: true,
      opacity: 0.58,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }))
    scene.add(dust)

    const arcCurves: THREE.CatmullRomCurve3[] = []
    for (let arc = 0; arc < 18; arc += 1) {
      const start = new THREE.Vector3(random() * 2 - 1, random() * 2 - 1, random() * 2 - 1).normalize()
      const end = new THREE.Vector3(random() * 2 - 1, random() * 2 - 1, random() * 2 - 1).normalize()
      const points: THREE.Vector3[] = []
      for (let step = 0; step <= 48; step += 1) {
        const progress = step / 48
        const point = start.clone().lerp(end, progress).normalize()
        point.multiplyScalar(1.84 + Math.sin(progress * Math.PI) * (0.18 + random() * 0.16))
        points.push(point)
      }
      const curve = new THREE.CatmullRomCurve3(points)
      arcCurves.push(curve)
      globe.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(curve.getPoints(72)),
        new THREE.LineBasicMaterial({
          color: arc % 3 === 0 ? GOLD : YELLOW,
          transparent: true,
          opacity: arc % 3 === 0 ? 0.3 : 0.12,
          blending: THREE.AdditiveBlending,
        }),
      ))
    }

    const packetPositions = new Float32Array(arcCurves.length * 3)
    const packetGeometry = new THREE.BufferGeometry()
    packetGeometry.setAttribute('position', new THREE.BufferAttribute(packetPositions, 3))
    const packets = new THREE.Points(packetGeometry, new THREE.PointsMaterial({
      color: GOLD,
      size: 0.055,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }))
    globe.add(packets)

    const makeOrbit = (radius: number, opacity: number) => {
      const curve = new THREE.EllipseCurve(0, 0, radius, radius, 0, Math.PI * 2)
      return new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(curve.getPoints(192).map((point) => new THREE.Vector3(point.x, point.y, 0))),
        new THREE.LineBasicMaterial({ color: YELLOW, transparent: true, opacity }),
      )
    }
    const orbitA = makeOrbit(2.42, 0.28)
    orbitA.rotation.set(1.15, 0.18, 0.2)
    scene.add(orbitA)
    const orbitB = makeOrbit(2.7, 0.1)
    orbitB.rotation.set(-0.76, 0.48, -0.25)
    scene.add(orbitB)

    const satellites = Array.from({ length: 4 }, (_, index) => {
      const satellite = new THREE.Mesh(
        new THREE.SphereGeometry(index === 0 ? 0.038 : 0.025, 10, 8),
        new THREE.MeshBasicMaterial({ color: index === 0 ? GOLD : YELLOW }),
      )
      scene.add(satellite)
      return satellite
    })

    const starPositions: number[] = []
    for (let index = 0; index < 900; index += 1) {
      const theta = random() * Math.PI * 2
      const y = random() * 2 - 1
      const ring = Math.sqrt(1 - y * y)
      const radius = 4 + random() * 8
      starPositions.push(Math.cos(theta) * ring * radius, y * radius, Math.sin(theta) * ring * radius)
    }
    const starGeometry = new THREE.BufferGeometry()
    starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3))
    const stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({
      color: 0xb69a50,
      size: 0.018,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
    }))
    scene.add(stars)

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
      const motion = reducedMotion ? 0 : 1
      controls.autoRotateSpeed = activeRef.current ? 1.05 : 0.42
      const pulse = activeRef.current ? 1 + Math.sin(seconds * 3.2) * 0.009 * motion : 1
      globe.scale.setScalar(pulse)
      surfaceMaterial.size = THREE.MathUtils.lerp(surfaceMaterial.size, activeRef.current ? 0.031 : 0.024, 0.06)
      dust.rotation.y = seconds * 0.018 * motion
      dust.rotation.x = Math.sin(seconds * 0.11) * 0.05 * motion
      stars.rotation.y = -seconds * 0.004 * motion
      arcCurves.forEach((curve, index) => {
        const point = curve.getPoint((seconds * (0.055 + index * 0.0015) + index / arcCurves.length) % 1)
        packetPositions[index * 3] = point.x
        packetPositions[index * 3 + 1] = point.y
        packetPositions[index * 3 + 2] = point.z
      })
      packetGeometry.attributes.position.needsUpdate = true
      satellites.forEach((satellite, index) => {
        const angle = seconds * (0.12 + index * 0.025) * motion + index * 1.7
        const radius = 2.35 + index * 0.16
        satellite.position.set(
          Math.cos(angle) * radius,
          Math.sin(angle * 1.35) * (0.52 + index * 0.13),
          Math.sin(angle) * radius,
        )
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
    return <div className="globe-fallback" role="img" aria-label="Yellow particle globe fallback"><span /><span /><span /></div>
  }

  return (
    <div className="nexus-globe globe-experience">
      <div
        ref={hostRef}
        className="scene-canvas-host"
        role="img"
        aria-label="Interactive yellow particle world. Drag to rotate and scroll or pinch to zoom."
      />
      <SceneZoomControls label="particle world" onAction={(action) => zoomRef.current(action)} />
    </div>
  )
}
