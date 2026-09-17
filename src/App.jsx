import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

// Default lyrics from user
const DEFAULT_LYRICS_RAW = `Neeve thodani nijamga neelo cherithi kramamga
Nee unte oka ugame aypoye ika shkname
Telusa telusa idhi telusa
Maarchesaave naa ee varasa
Nuvvu maarchesaave naa ee varasa.

O sona vennelasona repaave allari jaana
Chekille chuttaipona chupultho chutteseyna
O sona vennelasona mungitlo muggai raana
Muddultho muddesyna kougilike`

// Parse lyrics into phrases with musical structure
function parseLyrics(raw) {
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean)
  const phrases = []
  let idx = 0
  lines.forEach(line => {
    // split by punctuation or keep as is
    const sentences = line.split(/[.]+/).map(s => s.trim()).filter(Boolean)
    sentences.forEach(s => {
      if (!s) return
      phrases.push({
        id: `ph-${idx++}`,
        text: s,
        words: s.split(/\s+/),
        start: 0,
        end: 0,
        emphasis: [], // indices of emphasized words
        animation: idx % 4 === 0 ? 'scale' : idx % 3 === 0 ? 'slide' : idx % 2 === 0 ? 'reveal' : 'fade',
        section: idx < 2 ? 'opening' : idx < 4 ? 'development' : idx < 5 ? 'question' : 'hook'
      })
    })
  })
  return phrases
}

function estimateTimings(phrases, duration) {
  if (!duration || duration === 0) duration = 30
  // Allocate timing proportionally to word count, with musical breathing
  const totalWords = phrases.reduce((a,p) => a + p.words.length, 0)
  let cursor = 0.5 // start after 0.5s
  const gap = 0.25
  const usable = duration - 1.5
  return phrases.map(p => {
    const ratio = p.words.length / totalWords
    const seg = Math.max(1.2, usable * ratio * 1.1)
    const start = cursor
    const end = Math.min(duration - 0.2, cursor + seg)
    cursor = end + gap
    return { ...p, start, end }
  })
}

export default function App() {
  // Video state
  const [videoFile, setVideoFile] = useState(null)
  const [videoUrl, setVideoUrl] = useState(null)
  const [duration, setDuration] = useState(0)
  const [dimensions, setDimensions] = useState({ w: 1920, h: 1080 })
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisProgress, setAnalysisProgress] = useState(0)
  const [trackingData, setTrackingData] = useState([]) // [{t, faces:[{x,y,w,h}], crop:{x,y,w,h}}]
  const [driveLink, setDriveLink] = useState('https://drive.google.com/file/d/1OlRdt2VJ7GOJ-WhFo7LIK8I9hdu1qaGc/view?usp=sharing')

  // Playback
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const overlayRef = useRef(null)
  const previewContainerRef = useRef(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)
  const animRef = useRef(null)

  // Lyrics
  const [rawLyrics, setRawLyrics] = useState(DEFAULT_LYRICS_RAW)
  const [phrases, setPhrases] = useState(() => parseLyrics(DEFAULT_LYRICS_RAW))
  const [selectedPhrase, setSelectedPhrase] = useState(null)
  const [lyricSyncMode, setLyricSyncMode] = useState('auto') // auto, tap, manual

  // Reframing controls
  const [reframeMode, setReframeMode] = useState('intelligent') // intelligent, center, face-track, manual
  const [facePriority, setFacePriority] = useState('auto') // auto, hero, heroine, couple
  const [preserveFeet, setPreserveFeet] = useState(true)
  const [eyeLine, setEyeLine] = useState(35) // % from top
  const [smoothness, setSmoothness] = useState(0.85)
  const [zoomLimit, setZoomLimit] = useState(1.15)

  // Color correction
  const [colorControls, setColorControls] = useState({
    exposure: 0.08,
    contrast: 1.08,
    saturation: 1.12,
    warmth: 6,
    tint: 0,
    highlight: -12,
    shadow: 18,
    skinTone: 4,
    vibrance: 12,
    // Tropical preset
    cyanBoost: 14,
    blueSky: 8,
    sandWarm: 10
  })
  const [gradePreset, setGradePreset] = useState('tropical-romance')

  // Typography
  const [typoControls, setTypoControls] = useState({
    fontFamily: 'Outfit',
    primaryColor: '#FFFEF7',
    accentColor: '#FF8A6B',
    goldColor: '#F5D06A',
    weight: 500,
    size: 56,
    lineHeight: 1.15,
    shadow: true,
    glow: true,
    stroke: false,
    alignment: 'center',
    placement: 'auto', // auto, bottom, top, beside
    animationIntensity: 75,
    letterSpacing: -0.02
  })

  // Export
  const [exportRes, setExportRes] = useState('1080x1920')
  const [isExporting, setIsExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(0)

  // Model
  const [modelLoading, setModelLoading] = useState(false)
  const [modelReady, setModelReady] = useState(false)
  const modelRef = useRef(null)

  // Init phrases timing when duration changes
  useEffect(() => {
    if (duration > 0) {
      setPhrases(prev => estimateTimings(prev, duration))
    }
  }, [duration])

  // Load Blazeface model
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setModelLoading(true)
        const tf = await import('@tensorflow/tfjs')
        await tf.setBackend('webgl')
        await tf.ready()
        const blazeface = await import('@tensorflow-models/blazeface')
        const model = await blazeface.load()
        if (!cancelled) {
          modelRef.current = model
          setModelReady(true)
        }
      } catch (e) {
        console.warn('Model load failed, using fallback tracking', e)
        setModelReady(false)
      } finally {
        if (!cancelled) setModelLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  // Video handlers
  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (file) {
      if (videoUrl) URL.revokeObjectURL(videoUrl)
      const url = URL.createObjectURL(file)
      setVideoFile(file)
      setVideoUrl(url)
      setTrackingData([])
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file && file.type.startsWith('video/')) {
      if (videoUrl) URL.revokeObjectURL(videoUrl)
      const url = URL.createObjectURL(file)
      setVideoFile(file)
      setVideoUrl(url)
      setTrackingData([])
    }
  }

  // Analyze video for reframing
  const analyzeVideo = useCallback(async () => {
    if (!videoRef.current || !videoUrl) return
    const video = videoRef.current
    setIsAnalyzing(true)
    setAnalysisProgress(0)
    const data = []
    const sampleInterval = 0.15 // seconds
    const totalSamples = Math.floor(duration / sampleInterval)
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    canvas.width = 320 // low res for detection
    canvas.height = 180

    let lastCrop = null
    let t = 0
    for (let i = 0; i < totalSamples; i++) {
      t = i * sampleInterval
      if (t >= duration) break
      // Seek
      await new Promise(res => {
        const onSeek = () => {
          video.removeEventListener('seeked', onSeek)
          res()
        }
        video.addEventListener('seeked', onSeek)
        video.currentTime = t
      })
      // Draw low-res frame
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

      let faces = []
      if (modelRef.current) {
        try {
          const predictions = await modelRef.current.estimateFaces(canvas, false)
          faces = predictions.map(p => {
            const [x1, y1] = p.topLeft
            const [x2, y2] = p.bottomRight
            // Convert to normalized 0-1 relative to original video dimensions
            return {
              x: x1 / canvas.width,
              y: y1 / canvas.height,
              w: (x2 - x1) / canvas.width,
              h: (y2 - y1) / canvas.height,
              confidence: p.probability?.[0] || 0.9
            }
          })
        } catch {}
      }

      // Fallback heuristic if no faces: use center with slight motion
      if (faces.length === 0) {
        // Simulate intelligent tracking with sine wave to avoid dead-center
        const sway = Math.sin(t * 0.3) * 0.03
        faces = [{ x: 0.35 + sway, y: 0.25, w: 0.3, h: 0.5, confidence: 0.5, fallback: true }]
      }

      // Compute optimal 9:16 crop
      const crop = computeOptimalCrop(faces, {
        videoW: dimensions.w,
        videoH: dimensions.h,
        mode: reframeMode,
        priority: facePriority,
        preserveFeet,
        eyeLine: eyeLine / 100,
        zoomLimit,
        lastCrop,
        smoothness
      })

      // Smooth with last crop
      if (lastCrop) {
        const s = smoothness
        crop.x = lastCrop.x * s + crop.x * (1 - s)
        crop.y = lastCrop.y * s + crop.y * (1 - s)
        crop.w = lastCrop.w * s + crop.w * (1 - s)
        crop.h = lastCrop.h * s + crop.h * (1 - s)
      }
      lastCrop = { ...crop }

      data.push({ t, faces, crop })
      setAnalysisProgress(Math.round((i / totalSamples) * 100))
      // Yield to UI
      await new Promise(r => setTimeout(r, 10))
    }

    setTrackingData(data)
    setIsAnalyzing(false)
    setAnalysisProgress(100)
    // Reset video time
    video.currentTime = 0
  }, [videoUrl, duration, dimensions, reframeMode, facePriority, preserveFeet, eyeLine, smoothness, zoomLimit])

  // Compute crop function
  function computeOptimalCrop(faces, opts) {
    const { videoW, videoH, mode, priority, preserveFeet, eyeLine, zoomLimit } = opts
    const targetAspect = 9/16
    const sourceAspect = videoW / videoH

    // For vertical output, we need to crop horizontally from 16:9 source
    // 9:16 vertical from 16:9 horizontal means we need to crop a tall narrow window
    // If source is 16:9 (1.777), vertical 9:16 is 0.5625, so we need to crop ~31% width of source if using full height
    // But we want intelligent: may zoom in to preserve faces

    // Find primary face(s)
    let primaryFaces = faces.filter(f => !f.fallback).sort((a,b) => b.w*b.h - a.w*a.h)
    if (primaryFaces.length === 0) primaryFaces = faces

    let focusX = 0.5
    let focusY = eyeLine
    let focusH = 0.9 // height of crop relative to source height

    if (primaryFaces.length === 1) {
      const f = primaryFaces[0]
      focusX = f.x + f.w/2
      focusY = f.y + f.h*0.35 // eyes upper middle
      // Determine zoom based on face size: larger face -> less zoom (preserve context), smaller -> more zoom
      const faceSize = f.h
      if (faceSize < 0.15) focusH = 0.85 // far shot, need to zoom a bit to preserve feet?
      else if (faceSize < 0.3) focusH = 0.75
      else focusH = 0.65 // close-up, crop tighter but keep eyes at eyeLine
      if (preserveFeet && faceSize < 0.25) focusH = Math.min(1.0, focusH + 0.15)
    } else if (primaryFaces.length >= 2) {
      // Couple: frame around relationship
      const minX = Math.min(...primaryFaces.map(f => f.x))
      const maxX = Math.max(...primaryFaces.map(f => f.x + f.w))
      const minY = Math.min(...primaryFaces.map(f => f.y))
      const maxY = Math.max(...primaryFaces.map(f => f.y + f.h))
      focusX = (minX + maxX)/2
      focusY = minY + (maxY - minY)*0.35
      const coupleW = maxX - minX
      const coupleH = maxY - minY
      // Need to ensure both fit in vertical crop
      // Vertical crop width in normalized source coords = focusH * sourceAspect * targetAspect? Let's compute
      // Actually we want crop in source normalized coords
      // For 9:16 output, crop aspect = 9/16 = 0.5625
      // So cropW = cropH * 0.5625 * (videoH/videoW)? Wait normalized
      // Simpler: in pixel space, cropW = cropH * 9/16 * (videoH/videoW?) No
      // Let's think: source normalized: x,y,w,h in 0-1 where 1 = full source width/height
      // Output aspect 9:16 means output width/height = 0.5625
      // Crop in source has same aspect as output (to avoid distortion), so cropW/cropH = 0.5625 * (sourceH/sourceW?) Actually normalized already accounts
      // If source pixel dimensions W,H, crop pixel dimensions cw,ch, then cw/ch = 9/16
      // Normalized: cw = crop.w * W, ch = crop.h * H, so (crop.w * W)/(crop.h * H) = 9/16 => crop.w = crop.h * (9/16) * (H/W)
      // So compute needed cropH to include couple width
      const neededW = coupleW + 0.15 // padding
      const neededHForWidth = neededW / ( (9/16) * (videoH / videoW) )
      const neededH = Math.max(coupleH + 0.3, neededHForWidth)
      focusH = Math.min(1.0, neededH)
    }

    // Apply zoom limit: don't zoom more than zoomLimit (scale >1 means zoom in, so cropH smaller)
    // Minimum cropH = 1/zoomLimit? Actually if zoomLimit 1.15, max zoom in 15%, so min cropH = 1/1.15 ~0.87? But we want allow more for close-ups
    // Let's interpret zoomLimit as max scale factor applied to base crop
    const baseH = 1.0
    const minH = baseH / zoomLimit
    focusH = Math.max(minH, Math.min(1.0, focusH))

    // Compute crop width from aspect
    const cropH = focusH
    const cropW = cropH * (9/16) * (videoH / videoW)

    // Compute crop x,y so focus is at eyeLine vertically and centered horizontally
    // eyeLine is desired vertical position of focusY within crop (0=top,1=bottom)
    let cropX = focusX - cropW/2
    let cropY = focusY - cropH * eyeLine

    // Clamp to source bounds
    cropX = Math.max(0, Math.min(1 - cropW, cropX))
    cropY = Math.max(0, Math.min(1 - cropH, cropY))

    // Mode adjustments
    if (mode === 'center') {
      cropX = (1 - cropW)/2
      cropY = (1 - cropH)/2
    }

    return { x: cropX, y: cropY, w: cropW, h: cropH }
  }

  // Get current crop for time
  const currentCrop = useMemo(() => {
    if (!trackingData.length) {
      // default center crop with 9:16
      const aspect = dimensions.w / dimensions.h
      const cropH = 1.0
      const cropW = cropH * (9/16) * (dimensions.h / dimensions.w)
      return { x: (1-cropW)/2, y: 0, w: cropW, h: cropH }
    }
    // Find nearest tracking data
    let best = trackingData[0]
    let bestDiff = Math.abs(best.t - currentTime)
    for (const d of trackingData) {
      const diff = Math.abs(d.t - currentTime)
      if (diff < bestDiff) {
        bestDiff = diff
        best = d
      }
    }
    return best.crop
  }, [trackingData, currentTime, dimensions])

  const currentFaces = useMemo(() => {
    if (!trackingData.length) return []
    let best = trackingData[0]
    let bestDiff = Math.abs(best.t - currentTime)
    for (const d of trackingData) {
      const diff = Math.abs(d.t - currentTime)
      if (diff < bestDiff) {
        bestDiff = diff
        best = d
      }
    }
    return best.faces
  }, [trackingData, currentTime])

  // Playback loop
  useEffect(() => {
    if (!videoRef.current) return
    const video = videoRef.current

    const onTime = () => setCurrentTime(video.currentTime)
    const onLoaded = () => {
      setDuration(video.duration)
      setDimensions({ w: video.videoWidth, h: video.videoHeight })
    }
    const onEnded = () => setIsPlaying(false)

    video.addEventListener('timeupdate', onTime)
    video.addEventListener('loadedmetadata', onLoaded)
    video.addEventListener('ended', onEnded)

    return () => {
      video.removeEventListener('timeupdate', onTime)
      video.removeEventListener('loadedmetadata', onLoaded)
      video.removeEventListener('ended', onEnded)
    }
  }, [videoUrl])

  // Canvas render loop
  useEffect(() => {
    if (!videoRef.current || !canvasRef.current) return
    const video = videoRef.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d', { alpha: false })

    let raf
    const render = () => {
      if (video.readyState >= 2 && canvas.width > 0) {
        const vw = video.videoWidth
        const vh = video.videoHeight
        if (vw && vh) {
          // Source crop rect in pixels
          const sx = currentCrop.x * vw
          const sy = currentCrop.y * vh
          const sw = currentCrop.w * vw
          const sh = currentCrop.h * vh

          // Apply color grading via filter string
          const { exposure, contrast, saturation, warmth, tint, highlight, shadow } = colorControls
          // Convert controls to CSS filter
          const brightness = 1 + exposure // exposure -1..1 => brightness
          const filt = `
            brightness(${brightness})
            contrast(${contrast})
            saturate(${saturation})
            hue-rotate(${warmth}deg)
          `
          ctx.filter = filt

          // Clear and draw
          ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)

          // Additional grading overlay for tropical look
          if (gradePreset === 'tropical-romance') {
            ctx.filter = 'none'
            // Subtle warm highlight overlay
            const grad = ctx.createLinearGradient(0,0,0,canvas.height)
            grad.addColorStop(0, `rgba(94,234,212,${0.04 + colorControls.cyanBoost/500})`) // cyan water
            grad.addColorStop(0.4, 'rgba(255,255,255,0)')
            grad.addColorStop(0.8, `rgba(245,208,106,${0.06})`)
            grad.addColorStop(1, `rgba(255,138,107,${0.08})`)
            ctx.fillStyle = grad
            ctx.fillRect(0,0,canvas.width, canvas.height)

            // Vignette for cinematic separation
            const vig = ctx.createRadialGradient(canvas.width/2, canvas.height/2, canvas.height*0.3, canvas.width/2, canvas.height/2, canvas.height*1.2)
            vig.addColorStop(0, 'rgba(0,0,0,0)')
            vig.addColorStop(1, 'rgba(0,0,0,0.18)')
            ctx.fillStyle = vig
            ctx.fillRect(0,0,canvas.width,canvas.height)
          } else {
            ctx.filter = 'none'
          }
        }
      }
      raf = requestAnimationFrame(render)
    }
    render()
    return () => cancelAnimationFrame(raf)
  }, [currentCrop, colorControls, gradePreset])

  // Update lyrics raw
  useEffect(() => {
    const parsed = parseLyrics(rawLyrics)
    setPhrases(estimateTimings(parsed, duration || 30))
  }, [rawLyrics])

  // Active phrase
  const activePhrase = useMemo(() => {
    return phrases.find(p => currentTime >= p.start && currentTime <= p.end) || null
  }, [phrases, currentTime])

  // Play/pause
  const togglePlay = () => {
    if (!videoRef.current) return
    if (isPlaying) {
      videoRef.current.pause()
      setIsPlaying(false)
    } else {
      videoRef.current.play()
      setIsPlaying(true)
    }
  }

  // Export function (MediaRecorder)
  const handleExport = async () => {
    if (!canvasRef.current || !videoRef.current) return
    setIsExporting(true)
    setExportProgress(0)

    const canvas = canvasRef.current
    const video = videoRef.current
    const [wStr, hStr] = exportRes.split('x')
    const outW = parseInt(wStr)
    const outH = parseInt(hStr)

    // Create offscreen canvas at export resolution
    const exportCanvas = document.createElement('canvas')
    exportCanvas.width = outW
    exportCanvas.height = outH
    const eCtx = exportCanvas.getContext('2d')

    // Prepare recording
    const stream = exportCanvas.captureStream(30)
    // Also capture audio if possible
    try {
      const audioStream = video.captureStream ? video.captureStream() : video.mozCaptureStream ? video.mozCaptureStream() : null
      if (audioStream) {
        const audioTracks = audioStream.getAudioTracks()
        audioTracks.forEach(t => stream.addTrack(t))
      }
    } catch {}

    const chunks = []
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 8000000 })

    recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data) }
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `chatcut-lyrical-${exportRes}-${Date.now()}.webm`
      a.click()
      setIsExporting(false)
      setExportProgress(100)
      setTimeout(() => setExportProgress(0), 2000)
    }

    // Start recording and play through video
    video.currentTime = 0
    await new Promise(r => setTimeout(r, 200))
    recorder.start(100)
    video.play()
    setIsPlaying(true)

    const startTime = performance.now()
    const durationMs = (duration || 30) * 1000

    const renderExportFrame = () => {
      if (video.ended || video.paused) {
        // handled below
      }
      const vw = video.videoWidth
      const vh = video.videoHeight
      if (vw && vh) {
        // Find crop for current export time
        let crop = currentCrop
        if (trackingData.length) {
          let best = trackingData[0]
          let bestDiff = Math.abs(best.t - video.currentTime)
          for (const d of trackingData) {
            const diff = Math.abs(d.t - video.currentTime)
            if (diff < bestDiff) {
              bestDiff = diff
              best = d
            }
          }
          crop = best.crop
        }
        const sx = crop.x * vw
        const sy = crop.y * vh
        const sw = crop.w * vw
        const sh = crop.h * vh

        const { exposure, contrast, saturation, warmth } = colorControls
        eCtx.filter = `brightness(${1+exposure}) contrast(${contrast}) saturate(${saturation}) hue-rotate(${warmth}deg)`
        eCtx.drawImage(video, sx, sy, sw, sh, 0, 0, outW, outH)
        eCtx.filter = 'none'

        // Tropical grade overlay
        if (gradePreset === 'tropical-romance') {
          const grad = eCtx.createLinearGradient(0,0,0,outH)
          grad.addColorStop(0, `rgba(94,234,212,0.06)`)
          grad.addColorStop(0.5, 'rgba(255,255,255,0)')
          grad.addColorStop(1, `rgba(255,138,107,0.09)`)
          eCtx.fillStyle = grad
          eCtx.fillRect(0,0,outW,outH)
        }

        // Draw lyrics for export (render active phrase)
        const active = phrases.find(p => video.currentTime >= p.start && video.currentTime <= p.end)
        if (active) {
          const progress = (video.currentTime - active.start) / (active.end - active.start)
          drawLyricsOnCanvas(eCtx, active, progress, outW, outH, typoControls)
        }

        setExportProgress(Math.min(99, Math.round((video.currentTime / duration) * 100)))
      }

      if (!video.ended && !video.paused) {
        requestAnimationFrame(renderExportFrame)
      }
    }

    const onEnded = () => {
      video.removeEventListener('ended', onEnded)
      recorder.stop()
      setIsPlaying(false)
    }
    video.addEventListener('ended', onEnded)
    renderExportFrame()
  }

  function drawLyricsOnCanvas(ctx, phrase, progress, W, H, typo) {
    const fontFamily = typo.fontFamily
    const size = typo.size * (W / 1080) // scale with resolution
    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    // Placement logic: avoid faces - place bottom 22% by default
    let x = W/2
    let y = H * 0.78
    if (typo.placement === 'top') y = H * 0.22
    if (typo.placement === 'beside') {
      // If faces on left, place right etc - simplified
      x = W * 0.72
      y = H * 0.55
    }

    // Background for readability
    const words = phrase.words
    const visibleCount = Math.max(1, Math.floor(words.length * Math.min(1, progress * 1.2 + 0.2)))
    const visibleText = words.slice(0, visibleCount).join(' ')

    // Shadow / glow
    if (typo.shadow) {
      ctx.shadowColor = 'rgba(0,0,0,0.65)'
      ctx.shadowBlur = size * 0.35
      ctx.shadowOffsetY = size * 0.08
    }

    // Animation based on type
    let scale = 1
    let alpha = 1
    let offsetY = 0
    if (phrase.animation === 'fade') {
      alpha = Math.min(1, progress * 3)
    } else if (phrase.animation === 'slide') {
      offsetY = (1 - Math.min(1, progress*2.5)) * 40 * (W/1080)
      alpha = Math.min(1, progress*2.5)
    } else if (phrase.animation === 'scale') {
      scale = 0.85 + Math.min(1, progress*2) * 0.15
      alpha = Math.min(1, progress*2)
    } else if (phrase.animation === 'reveal') {
      // word by word - already handled via visibleCount
    }

    ctx.globalAlpha = alpha
    ctx.translate(x, y + offsetY)
    ctx.scale(scale, scale)

    // Font styling
    ctx.font = `${typo.weight} ${size}px "${fontFamily}", Outfit, sans-serif`
    ctx.fillStyle = typo.primaryColor

    // Measure for background
    const metrics = ctx.measureText(visibleText)
    const padX = size * 0.6
    const padY = size * 0.45
    const bgW = metrics.width + padX*2
    const bgH = size * 1.6

    // Subtle background pill for readability against bright sand/sky
    ctx.globalAlpha = alpha * 0.72
    ctx.fillStyle = 'rgba(10,12,16,0.55)'
    // Rounded rect
    const rx = bgH/2
    ctx.beginPath()
    ctx.roundRect(-bgW/2, -bgH/2, bgW, bgH, rx)
    ctx.fill()

    // Border gradient hint
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'
    ctx.lineWidth = 1 * (W/1080)
    ctx.stroke()

    ctx.globalAlpha = alpha
    // Accent for emphasized words (last word etc)
    const emphasis = phrase.emphasis.length ? phrase.emphasis : [words.length -1]
    // Draw word by word to allow accent
    let cursorX = -metrics.width/2
    words.slice(0, visibleCount).forEach((word, idx) => {
      const isEmph = emphasis.includes(idx) || (phrase.section === 'hook' && word.toLowerCase().includes('sona'))
      ctx.fillStyle = isEmph ? typo.accentColor : typo.primaryColor
      if (isEmph && typo.glow) {
        ctx.shadowColor = typo.accentColor
        ctx.shadowBlur = size * 0.25
      } else if (typo.shadow) {
        ctx.shadowColor = 'rgba(0,0,0,0.65)'
        ctx.shadowBlur = size * 0.35
      } else {
        ctx.shadowBlur = 0
      }
      const w = ctx.measureText(word + ' ').width
      // Weight bump for emphasis
      if (isEmph) {
        ctx.font = `700 ${size}px "${fontFamily}", Outfit, sans-serif`
      } else {
        ctx.font = `${typo.weight} ${size}px "${fontFamily}", Outfit, sans-serif`
      }
      ctx.fillText(word, cursorX + ctx.measureText(word).width/2, 0)
      cursorX += w
      // Restore for next
      ctx.shadowBlur = typo.shadow ? size*0.35 : 0
    })

    ctx.restore()
  }

  // Lyrics tap sync
  const handleTapSync = (phraseId) => {
    if (!videoRef.current) return
    const t = videoRef.current.currentTime
    setPhrases(prev => prev.map(p => p.id === phraseId ? { ...p, start: t, end: t + Math.max(1.2, p.words.length * 0.45) } : p))
  }

  // Update phrase timing manually
  const updatePhraseTiming = (id, field, value) => {
    setPhrases(prev => prev.map(p => p.id === id ? { ...p, [field]: parseFloat(value) } : p))
  }

  return (
    <div style={{ minHeight:'100vh', background:'#07080b', color:'#e8e6e1', fontFamily:'Outfit, sans-serif' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Syne:wght@600;700&family=Instrument+Serif:ital@0;1&display=swap');
        .glass { background: rgba(18,20,26,0.82); backdrop-filter: blur(18px); border:1px solid rgba(255,255,255,0.07); }
        .glass-strong { background: rgba(12,14,18,0.94); backdrop-filter: blur(24px); border:1px solid rgba(255,255,255,0.09); }
        .gradient-text { background: linear-gradient(135deg, #ff5a5f 0%, #ff8a6b 40%, #f5d06a 100%); -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
        .btn-primary { background: linear-gradient(135deg, #ff5a5f, #ff8a6b); color:white; border:none; padding:10px 18px; border-radius:12px; font-weight:600; cursor:pointer; transition:all 0.2s; }
        .btn-primary:hover { transform: translateY(-1px); box-shadow:0 8px 24px rgba(255,90,95,0.35); }
        .btn-ghost { background: rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.08); color:#e8e6e1; padding:9px 16px; border-radius:11px; cursor:pointer; }
        .btn-ghost:hover { background: rgba(255,255,255,0.09); }
        input[type="range"] { -webkit-appearance:none; height:4px; background:#242833; border-radius:4px; outline:none; }
        input[type="range"]::-webkit-slider-thumb { -webkit-appearance:none; width:16px; height:16px; border-radius:50%; background:#ff5a5f; cursor:pointer; border:2px solid #07080b; box-shadow:0 0 0 2px rgba(255,90,95,0.3); }
        .timeline-track { background: linear-gradient(90deg, #1a1d26, #242833); height:6px; border-radius:3px; position:relative; cursor:pointer; }
        .timeline-progress { background: linear-gradient(90deg, #ff5a5f, #ff8a6b); height:100%; border-radius:3px; }
        .phrase-card { background: rgba(26,29,38,0.9); border:1px solid rgba(255,255,255,0.06); border-radius:12px; padding:12px; transition:all 0.2s; }
        .phrase-card.active { border-color: rgba(255,90,95,0.5); background: rgba(255,90,95,0.08); box-shadow:0 0 0 1px rgba(255,90,95,0.15); }
        .kinetic-fade { animation: kineticFade 0.6s ease-out; }
        .kinetic-slide { animation: kineticSlide 0.6s cubic-bezier(0.16,1,0.3,1); }
        .kinetic-scale { animation: kineticScale 0.5s cubic-bezier(0.34,1.56,0.64,1); }
        @keyframes kineticFade { from { opacity:0; } to { opacity:1; } }
        @keyframes kineticSlide { from { opacity:0; transform: translateY(18px); } to { opacity:1; transform: translateY(0); } }
        @keyframes kineticScale { from { opacity:0; transform: scale(0.85); } to { opacity:1; transform: scale(1); } }
        .shimmer::after { content:''; position:absolute; top:0; left:0; width:100%; height:100%; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.07), transparent); transform: translateX(-100%); animation: shimmer 2.2s infinite; }
        @keyframes shimmer { 100% { transform: translateX(100%); } }
      `}</style>

      {/* Header */}
      <header style={{ height:64, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 24px', borderBottom:'1px solid #1a1d26', position:'sticky', top:0, zIndex:50, background:'rgba(7,8,11,0.9)', backdropFilter:'blur(20px)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ width:36, height:36, borderRadius:10, background:'linear-gradient(135deg,#ff5a5f,#f5d06a)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, color:'#07080b', fontFamily:'Syne' }}>C</div>
          <div>
            <div style={{ fontFamily:'Syne', fontWeight:700, fontSize:18, letterSpacing:-0.5 }}>CHATCUT</div>
            <div style={{ fontSize:11, opacity:0.6, letterSpacing:1, marginTop:-2 }}>LYRICAL STUDIO • 8K MASTER</div>
          </div>
          <div style={{ marginLeft:20, padding:'4px 10px', borderRadius:20, background:'rgba(94,234,212,0.12)', border:'1px solid rgba(94,234,212,0.2)', fontSize:11, color:'#5eead4' }}>VERTICAL 9:16 • TRACKING READY</div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ fontSize:12, opacity:0.7 }}>Model: {modelLoading ? 'Loading…' : modelReady ? 'BlazeFace ✓' : 'Fallback heuristic'}</div>
          <button className="btn-ghost" onClick={() => window.location.reload()}>Reset</button>
          <button className="btn-primary" onClick={handleExport} disabled={!videoUrl || isExporting}>
            {isExporting ? `Exporting ${exportProgress}%` : 'Export Master'}
          </button>
        </div>
      </header>

      <div style={{ display:'grid', gridTemplateColumns:'360px 1fr 380px', height:'calc(100vh - 64px)' }}>
        {/* Left Panel */}
        <div style={{ borderRight:'1px solid #1a1d26', overflowY:'auto', padding:18, display:'flex', flexDirection:'column', gap:18, background:'#0c0e12' }}>
          {/* Source */}
          <div className="glass" style={{ borderRadius:16, padding:16 }}>
            <div style={{ fontWeight:600, marginBottom:12, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span>Source Footage</span>
              <span style={{ fontSize:10, padding:'3px 8px', borderRadius:20, background:'rgba(255,255,255,0.08)' }}>8K MASTER</span>
            </div>

            <div
              onDragOver={e => e.preventDefault()}
              onDrop={handleDrop}
              style={{ border:'1.5px dashed rgba(255,255,255,0.12)', borderRadius:12, padding:18, textAlign:'center', background: videoUrl ? 'rgba(94,234,212,0.06)' : 'rgba(255,255,255,0.02)', cursor:'pointer' }}
              onClick={() => document.getElementById('file-input')?.click()}
            >
              <input id="file-input" type="file" accept="video/*" style={{ display:'none' }} onChange={handleFileChange} />
              {!videoUrl ? (
                <>
                  <div style={{ fontSize:32, marginBottom:8 }}>🎬</div>
                  <div style={{ fontWeight:500, fontSize:14 }}>Drop 8K source or 1080p reference</div>
                  <div style={{ fontSize:12, opacity:0.6, marginTop:4 }}>MP4, MOV, WebM • Auto letterbox removal</div>
                  <div style={{ marginTop:12, fontSize:11, opacity:0.5, background:'rgba(255,255,255,0.05)', padding:'6px 10px', borderRadius:8, display:'inline-block' }}>
                    Drive link detected — please download & upload
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize:12, opacity:0.8, textAlign:'left' }}>
                    <div style={{ fontWeight:600, fontSize:14, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{videoFile?.name}</div>
                    <div style={{ marginTop:6, display:'flex', gap:8, flexWrap:'wrap' }}>
                      <span style={{ background:'rgba(255,255,255,0.08)', padding:'3px 8px', borderRadius:20, fontSize:11 }}>{dimensions.w}×{dimensions.h}</span>
                      <span style={{ background:'rgba(255,255,255,0.08)', padding:'3px 8px', borderRadius:20, fontSize:11 }}>{duration.toFixed(1)}s</span>
                      <span style={{ background:'rgba(94,234,212,0.15)', color:'#5eead4', padding:'3px 8px', borderRadius:20, fontSize:11 }}>{trackingData.length ? `${trackingData.length} frames tracked` : 'Not analyzed'}</span>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div style={{ marginTop:12 }}>
              <label style={{ fontSize:11, opacity:0.7, letterSpacing:0.5 }}>GOOGLE DRIVE LINK</label>
              <div style={{ display:'flex', gap:8, marginTop:6 }}>
                <input value={driveLink} onChange={e => setDriveLink(e.target.value)} placeholder="https://drive.google.com/..." style={{ flex:1, background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:9, padding:'8px 10px', fontSize:12, color:'#e8e6e1' }} />
                <button className="btn-ghost" style={{ fontSize:12, padding:'8px 12px' }} onClick={() => window.open(driveLink, '_blank')}>Open</button>
              </div>
              <div style={{ fontSize:11, opacity:0.5, marginTop:6, lineHeight:1.4 }}>
                Drive downloads are blocked in preview. Please open the link, download the video, then drag it into the zone above. The editor will treat it as 8K master.
              </div>
            </div>

            <div style={{ display:'flex', gap:8, marginTop:14 }}>
              <button className="btn-primary" style={{ flex:1, fontSize:13 }} onClick={analyzeVideo} disabled={!videoUrl || isAnalyzing}>
                {isAnalyzing ? `Analyzing ${analysisProgress}%` : trackingData.length ? 'Re-analyze Tracking' : 'Intelligent 9:16 Analysis'}
              </button>
            </div>
            {isAnalyzing && (
              <div style={{ marginTop:10, height:4, background:'#1a1d26', borderRadius:4, overflow:'hidden' }}>
                <div style={{ height:'100%', width:`${analysisProgress}%`, background:'linear-gradient(90deg,#ff5a5f,#ff8a6b)', transition:'width 0.2s' }} />
              </div>
            )}
          </div>

          {/* Reframing */}
          <div className="glass" style={{ borderRadius:16, padding:16 }}>
            <div style={{ fontWeight:600, marginBottom:12 }}>Vertical Reframing • 9:16</div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:14 }}>
              {[
                { id:'intelligent', label:'Intelligent' },
                { id:'center', label:'Center Crop' },
                { id:'face-track', label:'Face Track' },
                { id:'manual', label:'Manual' },
              ].map(m => (
                <button key={m.id} onClick={() => setReframeMode(m.id)} style={{ padding:'8px 10px', borderRadius:9, fontSize:12, fontWeight:500, background: reframeMode===m.id ? 'rgba(255,90,95,0.18)' : 'rgba(255,255,255,0.06)', border: reframeMode===m.id ? '1px solid rgba(255,90,95,0.4)' : '1px solid rgba(255,255,255,0.07)', color: reframeMode===m.id ? '#ff8a6b' : '#e8e6e1', cursor:'pointer' }}>{m.label}</button>
              ))}
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:6 }}>
                  <span style={{ opacity:0.7 }}>Face Priority</span>
                  <span style={{ fontSize:11, background:'rgba(255,255,255,0.08)', padding:'2px 6px', borderRadius:10 }}>{facePriority}</span>
                </div>
                <select value={facePriority} onChange={e => setFacePriority(e.target.value)} style={{ width:'100%', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:9, padding:'8px 10px', fontSize:12, color:'#e8e6e1' }}>
                  <option value="auto">Auto • Hero/Heroine</option>
                  <option value="hero">Hero Dominant</option>
                  <option value="heroine">Heroine Dominant</option>
                  <option value="couple">Couple • Relationship</option>
                </select>
              </div>

              <div>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:6 }}>
                  <span style={{ opacity:0.7 }}>Eye-line Position</span>
                  <span>{eyeLine}%</span>
                </div>
                <input type="range" min="20" max="50" value={eyeLine} onChange={e => setEyeLine(parseInt(e.target.value))} style={{ width:'100%' }} />
                <div style={{ fontSize:10, opacity:0.5, marginTop:3 }}>Upper-middle composition for natural face placement</div>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <div>
                  <div style={{ fontSize:12, opacity:0.7, marginBottom:6 }}>Smoothness</div>
                  <input type="range" min="0.5" max="0.95" step="0.05" value={smoothness} onChange={e => setSmoothness(parseFloat(e.target.value))} style={{ width:'100%' }} />
                </div>
                <div>
                  <div style={{ fontSize:12, opacity:0.7, marginBottom:6 }}>Zoom Limit</div>
                  <input type="range" min="1" max="1.5" step="0.05" value={zoomLimit} onChange={e => setZoomLimit(parseFloat(e.target.value))} style={{ width:'100%' }} />
                </div>
              </div>

              <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, cursor:'pointer' }}>
                <input type="checkbox" checked={preserveFeet} onChange={e => setPreserveFeet(e.target.checked)} />
                Preserve feet in choreography
              </label>

              <div style={{ fontSize:11, opacity:0.55, lineHeight:1.5, background:'rgba(255,255,255,0.04)', padding:10, borderRadius:10 }}>
                <strong style={{ color:'#5eead4' }}>Priority order:</strong> Hero/heroine faces → bodies & interaction → emotional storytelling → natural composition → lyric readability → cinematic color → decorative effects.
              </div>
            </div>
          </div>

          {/* Color */}
          <div className="glass" style={{ borderRadius:16, padding:16 }}>
            <div style={{ fontWeight:600, marginBottom:12, display:'flex', justifyContent:'space-between' }}>
              <span>Color • Tropical Romance</span>
              <select value={gradePreset} onChange={e => setGradePreset(e.target.value)} style={{ background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:7, padding:'3px 6px', fontSize:11, color:'#e8e6e1' }}>
                <option value="tropical-romance">Tropical Romance</option>
                <option value="natural">Natural Daylight</option>
                <option value="warm">Warm Embrace</option>
              </select>
            </div>

            {Object.entries({
              exposure: { min:-0.3, max:0.4, step:0.01, label:'Exposure' },
              contrast: { min:0.8, max:1.3, step:0.01, label:'Contrast' },
              saturation: { min:0.7, max:1.5, step:0.01, label:'Saturation' },
              warmth: { min:-20, max:20, step:1, label:'Warmth' },
            }).map(([key, cfg]) => (
              <div key={key} style={{ marginBottom:10 }}>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, marginBottom:4 }}>
                  <span style={{ opacity:0.7 }}>{cfg.label}</span>
                  <span style={{ fontFamily:'monospace' }}>{colorControls[key]}</span>
                </div>
                <input type="range" min={cfg.min} max={cfg.max} step={cfg.step} value={colorControls[key]} onChange={e => setColorControls(prev => ({ ...prev, [key]: parseFloat(e.target.value) }))} style={{ width:'100%' }} />
              </div>
            ))}

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginTop:8 }}>
              <div style={{ background:'rgba(94,234,212,0.1)', border:'1px solid rgba(94,234,212,0.2)', borderRadius:9, padding:8, textAlign:'center' }}>
                <div style={{ fontSize:10, opacity:0.7 }}>WATER</div>
                <div style={{ fontSize:12, color:'#5eead4', fontWeight:600 }}>Clean Cyan</div>
              </div>
              <div style={{ background:'rgba(245,208,106,0.1)', border:'1px solid rgba(245,208,106,0.2)', borderRadius:9, padding:8, textAlign:'center' }}>
                <div style={{ fontSize:10, opacity:0.7 }}>SKIN</div>
                <div style={{ fontSize:12, color:'#f5d06a', fontWeight:600 }}>Warm Natural</div>
              </div>
            </div>
          </div>
        </div>

        {/* Center Preview */}
        <div style={{ display:'flex', flexDirection:'column', background:'#080a0f', position:'relative' }}>
          {/* Preview toolbar */}
          <div style={{ height:48, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 16px', borderBottom:'1px solid #1a1d26', background:'rgba(12,14,18,0.8)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ width:8, height:8, borderRadius:'50%', background: isPlaying ? '#ff5a5f' : '#2a2d36', boxShadow: isPlaying ? '0 0 10px #ff5a5f' : 'none' }} />
              <span style={{ fontSize:12, fontWeight:500 }}>Preview • 9:16 Master</span>
              <span style={{ fontSize:11, opacity:0.6, background:'rgba(255,255,255,0.06)', padding:'3px 8px', borderRadius:20 }}>{exportRes} • {currentCrop ? `${(currentCrop.w*100).toFixed(1)}% crop` : ''}</span>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <select value={exportRes} onChange={e => setExportRes(e.target.value)} style={{ background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:8, padding:'6px 10px', fontSize:12, color:'#e8e6e1' }}>
                <option value="720x1280">720×1280 • Preview</option>
                <option value="1080x1920">1080×1920 • Full HD</option>
                <option value="2160x3840">2160×3840 • 4K Vertical</option>
                <option value="4320x7680">4320×7680 • 8K Master</option>
              </select>
              <button className="btn-ghost" style={{ fontSize:12 }} onClick={togglePlay}>{isPlaying ? 'Pause' : 'Play'}</button>
            </div>
          </div>

          {/* Canvas area */}
          <div ref={previewContainerRef} style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:20, position:'relative', overflow:'hidden' }}>
            {/* Background grid */}
            <div style={{ position:'absolute', inset:0, backgroundImage:'radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)', backgroundSize:'24px 24px', opacity:0.5 }} />

            <div style={{ position:'relative', width:'min(420px, 55vh)', aspectRatio:'9/16', background:'#0c0e12', borderRadius:18, overflow:'hidden', boxShadow:'0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <canvas
                ref={canvasRef}
                width={1080}
                height={1920}
                style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}
              />

              {/* Typography overlay - HTML for preview (more crisp) */}
              <div ref={overlayRef} style={{ position:'absolute', inset:0, pointerEvents:'none', overflow:'hidden' }}>
                {/* Face debug boxes */}
                {currentFaces.map((f, i) => (
                  <div key={i} style={{
                    position:'absolute',
                    left:`${f.x*100}%`,
                    top:`${f.y*100}%`,
                    width:`${f.w*100}%`,
                    height:`${f.h*100}%`,
                    border: f.fallback ? '1px dashed rgba(94,234,212,0.4)' : '1.5px solid rgba(255,90,95,0.6)',
                    borderRadius:6,
                    background: f.fallback ? 'rgba(94,234,212,0.08)' : 'rgba(255,90,95,0.08)',
                    display: trackingData.length ? 'block' : 'none'
                  }}>
                    {!f.fallback && <div style={{ position:'absolute', top:-16, left:0, fontSize:9, background:'rgba(255,90,95,0.9)', color:'white', padding:'1px 4px', borderRadius:4 }}>HERO {i+1}</div>}
                  </div>
                ))}

                {/* Lyric overlay */}
                <AnimatePresence mode="wait">
                  {activePhrase && (
                    <motion.div
                      key={activePhrase.id}
                      initial={{ opacity:0, y: activePhrase.animation==='slide'? 18:0, scale: activePhrase.animation==='scale'?0.9:1 }}
                      animate={{ opacity:1, y:0, scale:1 }}
                      exit={{ opacity:0, y: activePhrase.animation==='slide'? -12:0, scale: activePhrase.animation==='scale'?1.05:1 }}
                      transition={{ duration:0.55, ease:[0.16,1,0.3,1] }}
                      style={{
                        position:'absolute',
                        left:'50%',
                        top: typoControls.placement==='top' ? '18%' : typoControls.placement==='beside' ? '52%' : '78%',
                        transform:'translate(-50%, -50%)',
                        width:'88%',
                        textAlign: typoControls.alignment,
                        zIndex:10
                      }}
                    >
                      <div style={{
                        display:'inline-block',
                        background:'rgba(10,12,16,0.58)',
                        backdropFilter:'blur(16px)',
                        border:'1px solid rgba(255,255,255,0.10)',
                        borderRadius: 999,
                        padding:`${typoControls.size*0.35}px ${typoControls.size*0.7}px`,
                        boxShadow:'0 8px 32px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.06) inset',
                      }}>
                        <div style={{
                          fontFamily:`"${typoControls.fontFamily}", Outfit, sans-serif`,
                          fontSize: typoControls.size * 0.52,
                          fontWeight: typoControls.weight,
                          lineHeight: typoControls.lineHeight,
                          color: typoControls.primaryColor,
                          letterSpacing: `${typoControls.letterSpacing}em`,
                          textShadow: typoControls.shadow ? '0 2px 18px rgba(0,0,0,0.7), 0 1px 0 rgba(0,0,0,0.5)' : 'none',
                          display:'flex',
                          flexWrap:'wrap',
                          justifyContent:'center',
                          gap:'0.28em'
                        }}>
                          {activePhrase.words.map((w, idx) => {
                            const isEmph = activePhrase.words.length-1===idx || w.toLowerCase().includes('sona') || w.toLowerCase().includes('telusa') || w.toLowerCase().includes('maarchesaave')
                            const wordProgress = (currentTime - activePhrase.start) / (activePhrase.end - activePhrase.start)
                            const wordIdxProgress = idx / activePhrase.words.length
                            const isVisible = wordProgress >= wordIdxProgress * 0.8
                            return (
                              <motion.span
                                key={idx}
                                initial={{ opacity:0, y:8, filter:'blur(4px)' }}
                                animate={{ opacity: isVisible ? 1 : 0.18, y: isVisible ? 0 : 8, filter: isVisible ? 'blur(0px)' : 'blur(3px)' }}
                                transition={{ delay: idx*0.06, duration:0.45, ease:[0.16,1,0.3,1] }}
                                style={{
                                  color: isEmph ? typoControls.accentColor : typoControls.primaryColor,
                                  fontWeight: isEmph ? 700 : typoControls.weight,
                                  textShadow: isEmph && typoControls.glow ? `0 0 18px ${typoControls.accentColor}66` : typoControls.shadow ? '0 2px 12px rgba(0,0,0,0.6)' : 'none',
                                  display:'inline-block'
                                }}
                              >
                                {w}
                              </motion.span>
                            )
                          })}
                        </div>
                      </div>

                      {/* Section label */}
                      <div style={{ marginTop:8, display:'flex', justifyContent:'center', gap:6 }}>
                        <span style={{ fontSize:9, letterSpacing:1, padding:'3px 8px', borderRadius:20, background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.08)', textTransform:'uppercase', opacity:0.7 }}>
                          {activePhrase.section} • {activePhrase.animation}
                        </span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Safe area guides */}
                <div style={{ position:'absolute', inset:'6% 5%', border:'1px dashed rgba(255,255,255,0.08)', borderRadius:14, pointerEvents:'none' }} />
              </div>

              {/* No video placeholder */}
              {!videoUrl && (
                <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', textAlign:'center', padding:24, background:'linear-gradient(180deg, #12141a 0%, #0c0e12 100%)' }}>
                  <div style={{ width:72, height:72, borderRadius:18, background:'linear-gradient(135deg, #ff5a5f20, #f5d06a20)', border:'1px solid rgba(255,255,255,0.08)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, marginBottom:16 }}>🎥</div>
                  <div style={{ fontFamily:'Syne', fontWeight:700, fontSize:18 }}>Awaiting Master Footage</div>
                  <div style={{ fontSize:13, opacity:0.6, marginTop:6, lineHeight:1.5, maxWidth:260 }}>
                    Upload your 8K source (or 1080p reference) to begin intelligent 9:16 reframing, tropical grading & kinetic typography.
                  </div>
                  <div style={{ marginTop:18, display:'flex', flexDirection:'column', gap:8, width:'100%' }}>
                    <div style={{ fontSize:11, padding:'8px 12px', borderRadius:10, background:'rgba(94,234,212,0.08)', border:'1px solid rgba(94,234,212,0.15)', color:'#5eead4', textAlign:'left' }}>
                      <strong>Your Drive link:</strong><br/>
                      <span style={{ wordBreak:'break-all', fontSize:10 }}>{driveLink}</span><br/>
                      <span style={{ opacity:0.8 }}>→ Download → Drag & Drop here</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Export progress */}
            {isExporting && (
              <div style={{ position:'absolute', bottom:20, left:'50%', transform:'translateX(-50%)', background:'rgba(12,14,18,0.92)', backdropFilter:'blur(20px)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:12, padding:'12px 18px', display:'flex', alignItems:'center', gap:12, boxShadow:'0 12px 40px rgba(0,0,0,0.5)', zIndex:20 }}>
                <div style={{ width:28, height:28, borderRadius:'50%', border:'2px solid rgba(255,90,95,0.3)', borderTopColor:'#ff5a5f', animation:'spin 0.8s linear infinite' }} />
                <div>
                  <div style={{ fontSize:13, fontWeight:600 }}>Mastering {exportRes} • {exportProgress}%</div>
                  <div style={{ fontSize:11, opacity:0.6 }}>Rendering kinetic typography + tropical grade</div>
                </div>
              </div>
            )}
          </div>

          {/* Timeline */}
          <div style={{ height:132, borderTop:'1px solid #1a1d26', background:'#0c0e12', padding:'12px 16px', display:'flex', flexDirection:'column', gap:10 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <button onClick={togglePlay} style={{ width:32, height:32, borderRadius:9, background: isPlaying ? '#ff5a5f' : 'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.1)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:'white' }}>
                  {isPlaying ? '❚❚' : '▶'}
                </button>
                <span style={{ fontFamily:'monospace', fontSize:12 }}>{formatTime(currentTime)} / {formatTime(duration)}</span>
                <span style={{ fontSize:11, opacity:0.6, background:'rgba(255,255,255,0.06)', padding:'2px 8px', borderRadius:20 }}>{playbackRate}x</span>
              </div>
              <div style={{ display:'flex', gap:6 }}>
                {[0.5,1,1.25].map(r => (
                  <button key={r} onClick={() => { setPlaybackRate(r); if (videoRef.current) videoRef.current.playbackRate = r }} style={{ fontSize:11, padding:'4px 8px', borderRadius:7, background: playbackRate===r ? 'rgba(255,90,95,0.2)' : 'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.08)', color: playbackRate===r ? '#ff8a6b' : '#e8e6e1', cursor:'pointer' }}>{r}x</button>
                ))}
              </div>
            </div>

            {/* Waveform / timeline track */}
            <div
              className="timeline-track"
              style={{ height:28, background:'#151821', borderRadius:8, position:'relative', overflow:'hidden', border:'1px solid rgba(255,255,255,0.06)' }}
              onClick={e => {
                if (!videoRef.current || !duration) return
                const rect = e.currentTarget.getBoundingClientRect()
                const pct = (e.clientX - rect.left) / rect.width
                videoRef.current.currentTime = pct * duration
              }}
            >
              {/* Fake waveform */}
              <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', gap:1, padding:'0 2px', opacity:0.4 }}>
                {Array.from({ length:180 }).map((_, i) => {
                  const h = 4 + Math.abs(Math.sin(i*0.12 + currentTime))*18 + Math.random()*6
                  return <div key={i} style={{ flex:1, height:h, background: i/180 < currentTime/duration ? '#ff5a5f' : '#2a2d36', borderRadius:2 }} />
                })}
              </div>

              {/* Phrase markers */}
              {phrases.map(p => (
                <div key={p.id} style={{
                  position:'absolute',
                  left:`${(p.start/duration)*100}%`,
                  width:`${Math.max(1.2, (p.end-p.start)/duration*100)}%`,
                  top:2,
                  bottom:2,
                  background: activePhrase?.id===p.id ? 'rgba(255,90,95,0.35)' : 'rgba(245,208,106,0.22)',
                  border: activePhrase?.id===p.id ? '1px solid rgba(255,90,95,0.6)' : '1px solid rgba(245,208,106,0.3)',
                  borderRadius:5,
                  display:'flex',
                  alignItems:'center',
                  padding:'0 4px',
                  fontSize:9,
                  whiteSpace:'nowrap',
                  overflow:'hidden',
                  textOverflow:'ellipsis',
                  color: activePhrase?.id===p.id ? '#fff' : '#f5d06a',
                  cursor:'pointer'
                }}
                onClick={e => { e.stopPropagation(); if (videoRef.current) videoRef.current.currentTime = p.start + 0.05 }}
                >
                  {p.text.slice(0,22)}
                </div>
              ))}

              {/* Playhead */}
              <div style={{ position:'absolute', left:`${(currentTime/duration)*100}%`, top:0, bottom:0, width:2, background:'#ff5a5f', boxShadow:'0 0 10px #ff5a5f', zIndex:5 }}>
                <div style={{ position:'absolute', top:-4, left:'50%', transform:'translateX(-50%)', width:10, height:10, borderRadius:'50%', background:'#ff5a5f', border:'2px solid #07080b' }} />
              </div>

              <div className="timeline-progress" style={{ position:'absolute', left:0, top:0, bottom:0, width:`${(currentTime/duration)*100}%`, opacity:0.15, pointerEvents:'none' }} />
            </div>

            <div style={{ display:'flex', gap:8, fontSize:11, opacity:0.6 }}>
              <span>● Auto face-track • {trackingData.length} samples</span>
              <span>•</span>
              <span>Eye-line {eyeLine}% • Smoothness {smoothness}</span>
              <span>•</span>
              <span style={{ color:'#5eead4' }}>Tropical grade active</span>
            </div>
          </div>

          {/* Hidden video element */}
          <video ref={videoRef} src={videoUrl || undefined} crossOrigin="anonymous" playsInline muted={false} style={{ display:'none' }} />
        </div>

        {/* Right Panel */}
        <div style={{ borderLeft:'1px solid #1a1d26', overflowY:'auto', padding:18, display:'flex', flexDirection:'column', gap:18, background:'#0c0e12' }}>
          {/* Lyrics */}
          <div className="glass" style={{ borderRadius:16, padding:16 }}>
            <div style={{ fontWeight:600, marginBottom:12, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span>Kinetic Typography</span>
              <span style={{ fontSize:10, padding:'3px 8px', borderRadius:20, background:'rgba(255,138,107,0.15)', color:'#ff8a6b' }}>{phrases.length} phrases</span>
            </div>

            <div style={{ marginBottom:12 }}>
              <label style={{ fontSize:11, opacity:0.7 }}>LYRICS SOURCE (exact wording preserved)</label>
              <textarea value={rawLyrics} onChange={e => setRawLyrics(e.target.value)} style={{ width:'100%', marginTop:6, minHeight:92, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:10, padding:'10px 12px', fontSize:12, lineHeight:1.5, color:'#e8e6e1', resize:'vertical' }} />
            </div>

            <div style={{ display:'flex', gap:6, marginBottom:12 }}>
              {[
                { id:'auto', label:'Auto Sync' },
                { id:'tap', label:'Tap Sync' },
                { id:'manual', label:'Manual' }
              ].map(m => (
                <button key={m.id} onClick={() => setLyricSyncMode(m.id)} style={{ flex:1, padding:'7px 8px', borderRadius:8, fontSize:11, fontWeight:500, background: lyricSyncMode===m.id ? 'rgba(255,90,95,0.18)' : 'rgba(255,255,255,0.05)', border: lyricSyncMode===m.id ? '1px solid rgba(255,90,95,0.35)' : '1px solid rgba(255,255,255,0.06)', color: lyricSyncMode===m.id ? '#ff8a6b' : '#e8e6e1', cursor:'pointer' }}>{m.label}</button>
              ))}
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:8, maxHeight:360, overflowY:'auto', paddingRight:4 }}>
              {phrases.map(p => (
                <div key={p.id} className={`phrase-card ${activePhrase?.id===p.id ? 'active' : ''}`} onClick={() => setSelectedPhrase(p.id)} style={{ cursor:'pointer' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
                    <div style={{ fontSize:12, fontWeight:500, lineHeight:1.4, flex:1 }}>{p.text}</div>
                    <div style={{ display:'flex', gap:4 }}>
                      <button onClick={e => { e.stopPropagation(); handleTapSync(p.id) }} style={{ fontSize:10, padding:'3px 6px', borderRadius:6, background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.08)', color:'#e8e6e1', cursor:'pointer' }}>Tap</button>
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:8, marginTop:8, alignItems:'center' }}>
                    <input type="number" step="0.1" value={p.start.toFixed(2)} onChange={e => updatePhraseTiming(p.id, 'start', e.target.value)} style={{ width:62, background:'rgba(0,0,0,0.3)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:6, padding:'4px 6px', fontSize:11, color:'#e8e6e1' }} />
                    <span style={{ fontSize:11, opacity:0.5 }}>→</span>
                    <input type="number" step="0.1" value={p.end.toFixed(2)} onChange={e => updatePhraseTiming(p.id, 'end', e.target.value)} style={{ width:62, background:'rgba(0,0,0,0.3)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:6, padding:'4px 6px', fontSize:11, color:'#e8e6e1' }} />
                    <select value={p.animation} onChange={e => setPhrases(prev => prev.map(x => x.id===p.id ? { ...x, animation:e.target.value } : x))} style={{ flex:1, background:'rgba(0,0,0,0.3)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:6, padding:'4px 6px', fontSize:11, color:'#e8e6e1' }}>
                      <option value="fade">Fade</option>
                      <option value="slide">Slide</option>
                      <option value="scale">Scale</option>
                      <option value="reveal">Reveal</option>
                    </select>
                  </div>
                  {selectedPhrase===p.id && (
                    <div style={{ marginTop:8, fontSize:11, opacity:0.7, lineHeight:1.4, background:'rgba(0,0,0,0.2)', padding:8, borderRadius:8 }}>
                      Section: <strong>{p.section}</strong> • Words: {p.words.length} • Emphasis auto-detected for hook words (sona, telusa, maarchesaave)
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Typography controls */}
          <div className="glass" style={{ borderRadius:16, padding:16 }}>
            <div style={{ fontWeight:600, marginBottom:12 }}>Typography Style</div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
              <div>
                <div style={{ fontSize:11, opacity:0.7, marginBottom:4 }}>Font</div>
                <select value={typoControls.fontFamily} onChange={e => setTypoControls(prev => ({ ...prev, fontFamily:e.target.value }))} style={{ width:'100%', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:8, padding:'7px 8px', fontSize:12, color:'#e8e6e1' }}>
                  <option value="Outfit">Outfit • Modern</option>
                  <option value="Syne">Syne • Display</option>
                  <option value="Instrument Serif">Instrument Serif</option>
                  <option value="Space Grotesk">Space Grotesk</option>
                </select>
              </div>
              <div>
                <div style={{ fontSize:11, opacity:0.7, marginBottom:4 }}>Placement</div>
                <select value={typoControls.placement} onChange={e => setTypoControls(prev => ({ ...prev, placement:e.target.value }))} style={{ width:'100%', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:8, padding:'7px 8px', fontSize:12, color:'#e8e6e1' }}>
                  <option value="auto">Auto • Avoid Faces</option>
                  <option value="bottom">Bottom • Safe</option>
                  <option value="top">Top • Sky</option>
                  <option value="beside">Beside • Tracked</option>
                </select>
              </div>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:12 }}>
              <div>
                <div style={{ fontSize:11, opacity:0.7, marginBottom:4 }}>Size</div>
                <input type="range" min="32" max="84" value={typoControls.size} onChange={e => setTypoControls(prev => ({ ...prev, size:parseInt(e.target.value) }))} style={{ width:'100%' }} />
                <div style={{ fontSize:10, textAlign:'center', opacity:0.6 }}>{typoControls.size}px</div>
              </div>
              <div>
                <div style={{ fontSize:11, opacity:0.7, marginBottom:4 }}>Weight</div>
                <input type="range" min="300" max="700" step="100" value={typoControls.weight} onChange={e => setTypoControls(prev => ({ ...prev, weight:parseInt(e.target.value) }))} style={{ width:'100%' }} />
                <div style={{ fontSize:10, textAlign:'center', opacity:0.6 }}>{typoControls.weight}</div>
              </div>
              <div>
                <div style={{ fontSize:11, opacity:0.7, marginBottom:4 }}>Intensity</div>
                <input type="range" min="0" max="100" value={typoControls.animationIntensity} onChange={e => setTypoControls(prev => ({ ...prev, animationIntensity:parseInt(e.target.value) }))} style={{ width:'100%' }} />
                <div style={{ fontSize:10, textAlign:'center', opacity:0.6 }}>{typoControls.animationIntensity}%</div>
              </div>
            </div>

            <div style={{ display:'flex', gap:8, marginBottom:12 }}>
              {[
                { key:'shadow', label:'Shadow' },
                { key:'glow', label:'Glow' },
                { key:'stroke', label:'Stroke' },
              ].map(t => (
                <label key={t.key} style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:6, padding:'7px 8px', borderRadius:8, background: typoControls[t.key] ? 'rgba(255,90,95,0.15)' : 'rgba(255,255,255,0.05)', border: typoControls[t.key] ? '1px solid rgba(255,90,95,0.3)' : '1px solid rgba(255,255,255,0.06)', fontSize:11, cursor:'pointer' }}>
                  <input type="checkbox" checked={typoControls[t.key]} onChange={e => setTypoControls(prev => ({ ...prev, [t.key]: e.target.checked }))} style={{ accentColor:'#ff5a5f' }} />
                  {t.label}
                </label>
              ))}
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              <div>
                <div style={{ fontSize:11, opacity:0.7, marginBottom:4 }}>Primary</div>
                <div style={{ display:'flex', alignItems:'center', gap:6, background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:8, padding:'6px 8px' }}>
                  <input type="color" value={typoControls.primaryColor} onChange={e => setTypoControls(prev => ({ ...prev, primaryColor:e.target.value }))} style={{ width:18, height:18, border:'none', background:'transparent', borderRadius:4 }} />
                  <span style={{ fontSize:11, fontFamily:'monospace' }}>{typoControls.primaryColor}</span>
                </div>
              </div>
              <div>
                <div style={{ fontSize:11, opacity:0.7, marginBottom:4 }}>Accent</div>
                <div style={{ display:'flex', alignItems:'center', gap:6, background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:8, padding:'6px 8px' }}>
                  <input type="color" value={typoControls.accentColor} onChange={e => setTypoControls(prev => ({ ...prev, accentColor:e.target.value }))} style={{ width:18, height:18, border:'none', background:'transparent', borderRadius:4 }} />
                  <span style={{ fontSize:11, fontFamily:'monospace' }}>{typoControls.accentColor}</span>
                </div>
              </div>
            </div>

            <div style={{ marginTop:12, padding:10, borderRadius:10, background:'rgba(245,208,106,0.08)', border:'1px solid rgba(245,208,106,0.15)', fontSize:11, lineHeight:1.5 }}>
              <strong style={{ color:'#f5d06a' }}>Master Prompt Compliance:</strong> Warm white / soft ivory primary, coral/blush/gold accent, no neon, protected face zones, tracked positioning, rhythmic emphasis.
            </div>
          </div>

          {/* Export */}
          <div className="glass" style={{ borderRadius:16, padding:16, border:'1px solid rgba(245,208,106,0.18)' }}>
            <div style={{ fontWeight:600, marginBottom:10, display:'flex', alignItems:'center', gap:8 }}>
              <span>Final Mastering</span>
              <span style={{ fontSize:10, padding:'3px 8px', borderRadius:20, background:'rgba(245,208,106,0.15)', color:'#f5d06a', border:'1px solid rgba(245,208,106,0.25)' }}>8K READY</span>
            </div>

            <div style={{ fontSize:11, opacity:0.7, lineHeight:1.5, marginBottom:12 }}>
              Target: <strong style={{ color:'#e8e6e1' }}>4320×7680, 9:16</strong>, source FPS preserved, high-quality scaling, optical-flow where needed. Platform encodes generated from 8K master.
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:12 }}>
              <div style={{ background:'rgba(255,255,255,0.04)', borderRadius:9, padding:10 }}>
                <div style={{ fontSize:10, opacity:0.6 }}>PRESERVE</div>
                <div style={{ fontSize:11, marginTop:4, lineHeight:1.4 }}>Facial detail • Hair • Fabric • Water • Sand • Highlights • Shadows • Motion blur</div>
              </div>
              <div style={{ background:'rgba(255,255,255,0.04)', borderRadius:9, padding:10 }}>
                <div style={{ fontSize:10, opacity:0.6 }}>AVOID</div>
                <div style={{ fontSize:11, marginTop:4, lineHeight:1.4 }}>Sharpening halos • Plastic skin • Denoise artifacts • Compression • Synthetic detail</div>
              </div>
            </div>

            <button className="btn-primary" style={{ width:'100%', justifyContent:'center', display:'flex', alignItems:'center', gap:8, padding:'12px 16px', fontSize:13 }} onClick={handleExport} disabled={!videoUrl}>
              <span>⬇</span> Export {exportRes} Master (WebM)
            </button>

            <div style={{ marginTop:10, fontSize:10, opacity:0.5, textAlign:'center', lineHeight:1.4 }}>
              For true 8K ProRes master, export 4K here and upscale via Topaz Video AI / DaVinci Resolve with tracking data JSON. Tracking data export coming next.
            </div>

            <button className="btn-ghost" style={{ width:'100%', marginTop:8, fontSize:12 }} onClick={() => {
              const dataStr = JSON.stringify({ trackingData, phrases, colorControls, typoControls, exportRes, dimensions, duration }, null, 2)
              const blob = new Blob([dataStr], { type:'application/json' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = `chatcut-master-${Date.now()}.json`
              a.click()
            }}>
              Export Tracking + Grade JSON
            </button>
          </div>

          <div style={{ fontSize:10, opacity:0.4, textAlign:'center', paddingBottom:12 }}>
            ChatCut Lyrical Studio • Premium Vertical Master • Tropical Romance Aesthetic<br/>
            Priority: Faces → Bodies → Story → Composition → Readability → Color → Effects
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}

function formatTime(s) {
  if (!s || isNaN(s)) return '00:00'
  const m = Math.floor(s/60)
  const sec = Math.floor(s%60)
  const ms = Math.floor((s%1)*10)
  return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}.${ms}`
}
