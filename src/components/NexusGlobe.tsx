import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

const YELLOW = 0xf2c94c

export default function NexusGlobe({ active = false }: { active?: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100)
    camera.position.set(0, 0.15, 6.6)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0x000000, 0)
    host.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.055
    controls.enablePan = false
    controls.enableZoom = false
    controls.autoRotate = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    controls.autoRotateSpeed = active ? 1.15 : 0.48

    const globe = new THREE.Group()
    globe.rotation.z = -0.17
    scene.add(globe)

    const core = new THREE.Mesh(
      new THREE.SphereGeometry(1.79, 32, 24),
      new THREE.MeshBasicMaterial({ color: YELLOW, transparent: true, opacity: 0.035 }),
    )
    globe.add(core)

    const wireframe = new THREE.Mesh(
      new THREE.SphereGeometry(1.82, 32, 20),
      new THREE.MeshBasicMaterial({
        color: YELLOW,
        wireframe: true,
        transparent: true,
        opacity: 0.13,
      }),
    )
    globe.add(wireframe)

    const positions: number[] = []
    const radius = 1.84
    for (let latitude = 1; latitude < 24; latitude += 1) {
      const phi = (latitude / 24) * Math.PI
      const longitudeCount = Math.max(12, Math.round(Math.sin(phi) * 58))
      for (let longitude = 0; longitude < longitudeCount; longitude += 1) {
        const theta = (longitude / longitudeCount) * Math.PI * 2
        positions.push(
          radius * Math.sin(phi) * Math.cos(theta),
          radius * Math.cos(phi),
          radius * Math.sin(phi) * Math.sin(theta),
        )
      }
    }
    const pointsGeometry = new THREE.BufferGeometry()
    pointsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    const points = new THREE.Points(
      pointsGeometry,
      new THREE.PointsMaterial({
        color: YELLOW,
        size: 0.028,
        transparent: true,
        opacity: 0.92,
        blending: THREE.AdditiveBlending,
      }),
    )
    globe.add(points)

    const makeOrbit = (orbitRadius: number, opacity: number) => {
      const curve = new THREE.EllipseCurve(0, 0, orbitRadius, orbitRadius, 0, Math.PI * 2)
      const geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(160))
      return new THREE.LineLoop(
        geometry,
        new THREE.LineBasicMaterial({ color: YELLOW, transparent: true, opacity }),
      )
    }
    const orbitA = makeOrbit(2.24, 0.32)
    orbitA.rotation.x = 1.17
    orbitA.rotation.y = 0.25
    scene.add(orbitA)
    const orbitB = makeOrbit(2.46, 0.12)
    orbitB.rotation.x = -0.72
    orbitB.rotation.y = 0.48
    scene.add(orbitB)

    const satellite = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xffe69a }),
    )
    scene.add(satellite)

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
      const angle = time * 0.00022
      satellite.position.set(Math.cos(angle) * 2.24, Math.sin(angle) * 0.68, Math.sin(angle) * 2.08)
      controls.update()
      renderer.render(scene, camera)
    })

    return () => {
      renderer.setAnimationLoop(null)
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
  }, [active])

  return (
    <div
      ref={hostRef}
      className="nexus-globe"
      role="img"
      aria-label="Interactive yellow Nexus globe. Drag to rotate."
    />
  )
}
