import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three-stdlib'

const STATUS_COLORS = {
  clean: 0x1EC8B0,
  moderate: 0xFFC72C,
  avoid: 0xFF3B30,
  _loading: 0x888888,
}

const STATUS_EMISSIVE = {
  clean: 0x0a6b5a,
  moderate: 0x996600,
  avoid: 0x991100,
  _loading: 0x444444,
}

function latLngToXY(lat, lng, minLat, maxLat, minLng, maxLng, scale = 80) {
  const x = ((lng - minLng) / (maxLng - minLng) - 0.5) * scale
  const z = -((lat - minLat) / (maxLat - minLat) - 0.5) * scale
  return [x, 0, z]
}

function PinLabel({ name, score, status }) {
  return null
}

export default function WorldView3D({
  beaches = [],
  lang = 'fr',
  onBeachClick = () => {},
  onPremium = () => {},
  isPremium = false,
  updatedAt = null,
  track = () => {},
  onClose = () => {},
}) {
  const containerRef = useRef(null)
  const rendererRef = useRef(null)
  const sceneRef = useRef(null)
  const cameraRef = useRef(null)
  const controlsRef = useRef(null)
  const pinsRef = useRef(new Map())
  const wavesRef = useRef(null)
  const oceanRef = useRef(null)
  const veilleurRef = useRef(null)
  const rafRef = useRef(null)
  const [hovered, setHovered] = useState(null)
  const [cameraReady, setCameraReady] = useState(false)

  const bounds = useMemo(() => {
    if (!beaches.length) return { minLat: 14.4, maxLat: 16.5, minLng: -61.8, maxLng: -61.0 }
    const lats = beaches.map(b => b.lat).filter(Boolean)
    const lngs = beaches.map(b => b.lng).filter(Boolean)
    if (!lats.length || !lngs.length) return { minLat: 14.4, maxLat: 16.5, minLng: -61.8, maxLng: -61.0 }
    const pad = 0.05
    return {
      minLat: Math.min(...lats) - pad,
      maxLat: Math.max(...lats) + pad,
      minLng: Math.min(...lngs) - pad,
      maxLng: Math.max(...lngs) + pad,
    }
  }, [beaches])

  const sceneInit = useCallback(() => {
    if (!containerRef.current || sceneRef.current) return
    const el = containerRef.current
    const w = el.clientWidth
    const h = el.clientHeight

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0a1620)
    scene.fog = new THREE.FogExp2(0x0a1620, 0.008)

    const camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 500)
    camera.position.set(0, 35, 50)
    camera.lookAt(0, 0, 0)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setSize(w, h)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.0
    el.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.minDistance = 15
    controls.maxDistance = 120
    controls.maxPolarAngle = Math.PI / 2.15
    controls.enablePan = true
    controls.screenSpacePanning = false

    const ambient = new THREE.AmbientLight(0xffffff, 0.35)
    scene.add(ambient)

    const sun = new THREE.DirectionalLight(0xFFC72C, 1.2)
    sun.position.set(40, 60, 20)
    sun.castShadow = true
    sun.shadow.camera.left = -60
    sun.shadow.camera.right = 60
    sun.shadow.camera.top = 60
    sun.shadow.camera.bottom = -60
    sun.shadow.mapSize.width = 1024
    sun.shadow.mapSize.height = 1024
    scene.add(sun)

    const moon = new THREE.DirectionalLight(0x9ADCD4, 0.2)
    moon.position.set(-30, 50, -20)
    scene.add(moon)

    const oceanGeo = new THREE.PlaneGeometry(200, 200, 80, 80)
    const oceanMat = new THREE.MeshStandardMaterial({
      color: 0x0c4a6e,
      roughness: 0.3,
      metalness: 0.4,
      transparent: true,
      opacity: 0.85,
    })
    const ocean = new THREE.Mesh(oceanGeo, oceanMat)
    ocean.rotation.x = -Math.PI / 2
    ocean.position.y = -0.5
    ocean.receiveShadow = true
    scene.add(ocean)
    oceanRef.current = ocean

    const shoreGeo = new THREE.PlaneGeometry(200, 200, 40, 40)
    const shoreMat = new THREE.MeshStandardMaterial({
      color: 0xC2B280,
      roughness: 0.9,
      metalness: 0.0,
    })
    const shore = new THREE.Mesh(shoreGeo, shoreMat)
    shore.rotation.x = -Math.PI / 2
    shore.position.y = -0.3
    shore.position.z = -70
    scene.add(shore)

    const veilleurGroup = new THREE.Group()
    const bodyGeo = new THREE.CylinderGeometry(0.8, 1.2, 1.5, 8)
    const bodyMat = new THREE.MeshPhongMaterial({ color: 0x5b3a8e, shininess: 80 })
    veilleurGroup.add(new THREE.Mesh(bodyGeo, bodyMat))

    const eyeGeo = new THREE.SphereGeometry(0.4, 16, 16)
    const eyeMat = new THREE.MeshPhongMaterial({ color: 0xFFC72C, emissive: 0xFFC72C, emissiveIntensity: 0.7 })
    const eye = new THREE.Mesh(eyeGeo, eyeMat)
    eye.position.y = 1.2
    veilleurGroup.add(eye)

    const wingGeo = new THREE.BoxGeometry(1.2, 0.08, 0.4)
    const wingMat = new THREE.MeshPhongMaterial({ color: 0x0A1714 })
    const wl = new THREE.Mesh(wingGeo, wingMat)
    wl.position.set(-1.2, 0, 0)
    wl.rotation.z = -0.15
    veilleurGroup.add(wl)
    const wr = new THREE.Mesh(wingGeo, wingMat)
    wr.position.set(1.2, 0, 0)
    wr.rotation.z = 0.15
    veilleurGroup.add(wr)

    const antGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.2, 4)
    const antMat = new THREE.MeshPhongMaterial({ color: 0x009E8E })
    const ant = new THREE.Mesh(antGeo, antMat)
    ant.position.y = 2.0
    veilleurGroup.add(ant)

    veilleurGroup.position.set(0, 18, -10)
    veilleurGroup.castShadow = true
    scene.add(veilleurGroup)
    veilleurRef.current = veilleurGroup

    sceneRef.current = scene
    cameraRef.current = camera
    rendererRef.current = renderer
    controlsRef.current = controls
    setCameraReady(true)

    let frame = 0
    let paused = false
    const animate = () => {
      rafRef.current = requestAnimationFrame(animate)
      if (paused) return
      controls.update()
      frame++

      if (oceanRef.current) {
        const pos = oceanRef.current.geometry.attributes.position
        const t = Date.now() * 0.0008
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i)
          const y = pos.getY(i)
          pos.setZ(i, Math.sin(x * 0.08 + t) * 0.4 + Math.cos(y * 0.06 + t * 0.7) * 0.3)
        }
        pos.needsUpdate = true
        oceanRef.current.geometry.computeVertexNormals()
      }

      if (veilleurRef.current && frame % 2 === 0) {
        const t = Date.now() * 0.001
        veilleurRef.current.position.y = 18 + Math.sin(t * 0.4) * 1.5
        veilleurRef.current.rotation.y = Math.sin(t * 0.25) * 0.08
      }

      renderer.render(scene, camera)
    }
    animate()

    const onResize = () => {
      if (!containerRef.current) return
      const nw = containerRef.current.clientWidth
      const nh = containerRef.current.clientHeight
      camera.aspect = nw / nh
      camera.updateProjectionMatrix()
      renderer.setSize(nw, nh)
    }
    window.addEventListener('resize', onResize)

    const onVisibility = () => { paused = document.hidden }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', onVisibility)
      cancelAnimationFrame(rafRef.current)
      controls.dispose()
      renderer.dispose()
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement)
      sceneRef.current = null
      rendererRef.current = null
      cameraRef.current = null
    }
  }, [])

  useEffect(() => {
    const cleanup = sceneInit()
    return cleanup
  }, [sceneInit])

  useEffect(() => {
    if (!sceneRef.current || !cameraReady) return
    const scene = sceneRef.current

    pinsRef.current.forEach((group) => {
      scene.remove(group)
      group.traverse(child => {
        if (child.geometry) child.geometry.dispose()
        if (child.material) child.material.dispose()
      })
    })
    pinsRef.current.clear()

    if (!beaches.length) return

    const { minLat, maxLat, minLng, maxLng } = bounds

    beaches.forEach((beach) => {
      if (!beach.lat || !beach.lng) return
      const [x, , z] = latLngToXY(beach.lat, beach.lng, minLat, maxLat, minLng, maxLng)
      const status = beach.status || '_loading'
      const color = STATUS_COLORS[status]
      const emissive = STATUS_EMISSIVE[status]

      const pinGeo = new THREE.ConeGeometry(0.6, 2, 8)
      const pinMat = new THREE.MeshPhongMaterial({
        color, emissive, emissiveIntensity: 0.5, shininess: 80,
      })
      const pin = new THREE.Mesh(pinGeo, pinMat)
      pin.position.set(x, 2, z)
      pin.castShadow = true

      const dotGeo = new THREE.SphereGeometry(0.25, 12, 12)
      const dotMat = new THREE.MeshPhongMaterial({ color, emissive, emissiveIntensity: 0.8 })
      const dot = new THREE.Mesh(dotGeo, dotMat)
      dot.position.set(x, 3.2, z)

      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      canvas.width = 256
      canvas.height = 96
      ctx.font = 'bold 28px sans-serif'
      ctx.fillStyle = '#FFFFFF'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(beach.name || '', 128, 32)
      if (beach.score != null) {
        ctx.font = 'bold 22px sans-serif'
        ctx.fillStyle = color === 0x1EC8B0 ? '#4ADE80' : color === 0xFFC72C ? '#FBBF24' : '#F87171'
        ctx.fillText(String(beach.score), 128, 64)
      }

      const tex = new THREE.CanvasTexture(canvas)
      const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false })
      const sprite = new THREE.Sprite(spriteMat)
      sprite.scale.set(5, 2, 1)
      sprite.position.set(x, 5, z)

      const group = new THREE.Group()
      group.add(pin)
      group.add(dot)
      group.add(sprite)
      group.userData = { beach }
      scene.add(group)
      pinsRef.current.set(beach.id || beach.name, group)
    })
  }, [beaches, bounds, cameraReady])

  useEffect(() => {
    if (!containerRef.current || !cameraRef.current || !sceneRef.current) return
    const raycaster = new THREE.Raycaster()
    const mouse = new THREE.Vector2()
    const el = containerRef.current
    let lastMove = 0
    let touchStartX = 0, touchStartY = 0, touchMoved = false

    const hitTest = (cx, cy) => {
      const rect = el.getBoundingClientRect()
      mouse.x = ((cx - rect.left) / rect.width) * 2 - 1
      mouse.y = -((cy - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(mouse, cameraRef.current)
      const cones = Array.from(pinsRef.current.values()).map(g => g.children[0])
      const hits = raycaster.intersectObjects(cones)
      return hits.length > 0 ? hits[0].object.parent.userData.beach : null
    }

    const onMove = (e) => {
      const now = Date.now()
      if (now - lastMove < 50) return
      lastMove = now
      const b = hitTest(e.clientX, e.clientY)
      if (b) { setHovered(b); el.style.cursor = 'pointer' }
      else { setHovered(null); el.style.cursor = 'grab' }
    }

    const onClick = (e) => {
      const b = hitTest(e.clientX, e.clientY)
      if (b) { try { track('sg_3d_pin_click', { beach: b.name, status: b.status }) } catch (_) {}; onBeachClick(b) }
    }

    const onTouchStart = (e) => {
      if (e.touches.length !== 1) return
      touchStartX = e.touches[0].clientX
      touchStartY = e.touches[0].clientY
      touchMoved = false
    }

    const onTouchMove = (e) => {
      if (e.touches.length !== 1) return
      const dx = e.touches[0].clientX - touchStartX
      const dy = e.touches[0].clientY - touchStartY
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) touchMoved = true
    }

    const onTouchEnd = (e) => {
      if (touchMoved) return
      if (e.changedTouches.length !== 1) return
      const t = e.changedTouches[0]
      const b = hitTest(t.clientX, t.clientY)
      if (b) { try { track('sg_3d_pin_tap', { beach: b.name, status: b.status }) } catch (_) {}; onBeachClick(b) }
    }

    el.addEventListener('mousemove', onMove)
    el.addEventListener('click', onClick)
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: true })
    el.addEventListener('touchend', onTouchEnd)
    return () => {
      el.removeEventListener('mousemove', onMove)
      el.removeEventListener('click', onClick)
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.style.cursor = 'default'
    }
  }, [onBeachClick, track, cameraReady])

  const close = useCallback(() => {
    try { track('sg_3d_close', {}) } catch (_) {}
    onClose()
  }, [onClose, track])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1500, background: '#0a1620' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      <div style={{
        position: 'absolute', top: 12, left: 12, right: 12,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        pointerEvents: 'none', zIndex: 10,
      }}>
        <button onClick={close} style={{
          pointerEvents: 'auto',
          background: 'rgba(13,17,23,.85)', border: '1.5px solid rgba(255,199,44,.3)',
          borderRadius: 12, padding: '10px 18px', color: '#FFC72C',
          fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 700, fontSize: 14,
          cursor: 'pointer', backdropFilter: 'blur(8px)',
        }}>
          ← {_t(lang, 'Retour carte', 'Back to map', 'Volver al mapa')}
        </button>
        <div style={{
          background: 'rgba(13,17,23,.75)', borderRadius: 10, padding: '6px 14px',
          color: 'rgba(255,255,255,.6)', fontSize: 12, backdropFilter: 'blur(6px)',
          fontFamily: "'Bricolage Grotesque',sans-serif",
        }}>
          {beaches.length} {_t(lang, 'plages', 'beaches', 'playas')} · 3D
        </div>
      </div>
      {hovered && (
        <div style={{
          position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(13,17,23,.92)', border: '1px solid rgba(255,199,44,.25)',
          borderRadius: 14, padding: '12px 20px', color: '#EAF7F4',
          fontFamily: "'Bricolage Grotesque',sans-serif", fontSize: 14,
          pointerEvents: 'none', zIndex: 10, backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', gap: 12, minWidth: 180,
        }}>
          <span style={{
            width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
            background: hovered.status === 'clean' ? '#1EC8B0' : hovered.status === 'moderate' ? '#FFC72C' : '#FF3B30',
            boxShadow: `0 0 8px ${hovered.status === 'clean' ? '#1EC8B0' : hovered.status === 'moderate' ? '#FFC72C' : '#FF3B30'}`,
          }} />
          <span>
            <strong>{hovered.name}</strong>
            {hovered.score != null && <span style={{ opacity: .6, marginLeft: 6 }}>{hovered.score}/100</span>}
          </span>
        </div>
      )}
      {updatedAt && (
        <div style={{
          position: 'absolute', bottom: 12, right: 12, fontSize: 10,
          color: 'rgba(255,255,255,.3)', fontFamily: "'Bricolage Grotesque',sans-serif",
        }}>
          {_t(lang, 'Données satellite', 'Satellite data', 'Datos satelitales')} · {new Date(updatedAt).toLocaleDateString()}
        </div>
      )}
    </div>
  )
}

function _t(lang, fr, en, es) {
  return lang === 'en' ? en : lang === 'es' ? es : fr
}
