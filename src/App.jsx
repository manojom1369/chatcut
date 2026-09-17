import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

// Default lyrics - exact as provided
const DEFAULT_LYRICS_RAW = `Neeve thodani nijamga neelo cherithi kramamga
Nee unte oka ugame aypoye ika shkname
Telusa telusa idhi telusa
Maarchesaave naa ee varasa
Nuvvu maarchesaave naa ee varasa.

O sona vennelasona repaave allari jaana
Chekille chuttaipona chupultho chutteseyna
O sona vennelasona mungitlo muggai raana
Muddultho muddesyna kougilike`

function parseLyrics(raw) {
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean)
  const phrases = []
  let idx = 0
  lines.forEach(line => {
    const sentences = line.split(/[.]+/).map(s => s.trim()).filter(Boolean)
    sentences.forEach(s => {
      if (!s) return
      const words = s.split(/\s+/).map((w, wi) => ({
        text: w,
        start: 0,
        end: 0,
        id: `w-${idx}-${wi}`
      }))
      phrases.push({
        id: `ph-${idx++}`,
        text: s,
        words,
        start: 0,
        end: 0,
        emphasis: [],
        animation: idx % 4 === 0 ? 'scale' : idx % 3 === 0 ? 'slide' : idx % 2 === 0 ? 'reveal' : 'fade',
        section: idx < 2 ? 'opening' : idx < 4 ? 'development' : idx < 5 ? 'question' : 'hook',
        vocalEnergy: 0,
        mouthOpen: 0
      })
    })
  })
  return phrases
}

function estimateTimings(phrases, duration) {
  if (!duration || duration === 0) duration = 32
  const totalChars = phrases.reduce((a,p) => a + p.text.length, 0)
  let cursor = 0.3
  const gap = 0.18
  const usable = duration - 0.8
  return phrases.map(p => {
    const ratio = p.text.length / totalChars
    // Telugu lyrics: longer phrases need more time, hook needs emphasis
    let seg = Math.max(1.0, usable * ratio * 1.15)
    if (p.section === 'hook') seg *= 1.1
    if (p.section === 'question') seg *= 0.95
    const start = cursor
    const end = Math.min(duration - 0.1, cursor + seg)
    cursor = end + gap
    // Word-level timing
    const wordDur = (end - start) / p.words.length
    const wordsWithTime = p.words.map((w, i) => ({
      ...w,
      start: start + i * wordDur,
      end: start + (i+1) * wordDur
    }))
    return { ...p, start, end, words: wordsWithTime }
  })
}

// Audio analysis for vocal detection
async function analyzeAudioEnergy(videoFile) {
  try {
    const arrayBuffer = await videoFile.arrayBuffer()
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    const decoded = await audioCtx.decodeAudioData(arrayBuffer.slice(0))
    const channelData = decoded.getChannelData(0)
    const sampleRate = decoded.sampleRate
    const duration = decoded.duration
    
    // Compute RMS energy in 100ms windows
    const windowSize = Math.floor(sampleRate * 0.1) // 100ms
    const energy = []
    const vocalSegments = []
    
    for (let i = 0; i < channelData.length; i += windowSize) {
      let sum = 0
      const end = Math.min(i + windowSize, channelData.length)
      for (let j = i; j < end; j++) {
        sum += channelData[j] * channelData[j]
      }
      const rms = Math.sqrt(sum / (end - i))
      const time = i / sampleRate
      energy.push({ t: time, v: rms })
    }
    
    // Normalize energy 0-1
    const maxEnergy = Math.max(...energy.map(e => e.v))
    const normalized = energy.map(e => ({ ...e, v: e.v / (maxEnergy || 1) }))
    
    // Detect vocal segments: threshold + smoothing
    const threshold = 0.08
    let inVocal = false
    let segStart = 0
    let smoothed = []
    
    // Smooth with moving average
    for (let i = 0; i < normalized.length; i++) {
      const win = 3
      let sum = 0, count = 0
      for (let k = Math.max(0, i-win); k <= Math.min(normalized.length-1, i+win); k++) {
        sum += normalized[k].v
        count++
      }
      smoothed.push({ t: normalized[i].t, v: sum/count })
    }
    
    for (let i = 0; i < smoothed.length; i++) {
      const isVocal = smoothed[i].v > threshold
      if (isVocal && !inVocal) {
        segStart = smoothed[i].t
        inVocal = true
      } else if (!isVocal && inVocal) {
        // Check if silence is long enough to end segment
        let silenceDur = 0
        for (let j = i; j < Math.min(smoothed.length, i+8); j++) {
          if (smoothed[j].v < threshold) silenceDur += 0.1
          else break
        }
        if (silenceDur > 0.35) {
          vocalSegments.push({ start: segStart, end: smoothed[i].t, energy: smoothed.slice(Math.floor(segStart*10), i).reduce((a,b) => a+b.v,0) / Math.max(1, i-Math.floor(segStart*10)) })
          inVocal = false
        }
      }
    }
    if (inVocal) {
      vocalSegments.push({ start: segStart, end: duration, energy: 0.5 })
    }
    
    // Merge very short segments
    const merged = []
    for (let seg of vocalSegments) {
      if (seg.end - seg.start < 0.4) continue // too short, likely noise
      if (merged.length && seg.start - merged[merged.length-1].end < 0.3) {
        merged[merged.length-1].end = seg.end
      } else {
        merged.push(seg)
      }
    }
    
    await audioCtx.close()
    return { energy: smoothed, vocalSegments: merged, duration }
  } catch (e) {
    console.warn('Audio analysis failed', e)
    return null
  }
}

export default function App() {
  // Video
  const [videoFile, setVideoFile] = useState(null)
  const [videoUrl, setVideoUrl] = useState(null)
  const [duration, setDuration] = useState(0)
  const [dimensions, setDimensions] = useState({ w: 1920, h: 1080 })
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisProgress, setAnalysisProgress] = useState(0)
  const [trackingData, setTrackingData] = useState([])
  const [driveLink] = useState('https://drive.google.com/file/d/1OlRdt2VJ7GOJ-WhFo7LIK8I9hdu1qaGc/view?usp=sharing')
  
  // Audio analysis
  const [audioAnalysis, setAudioAnalysis] = useState(null)
  const [isAnalyzingAudio, setIsAnalyzingAudio] = useState(false)
  const [vocalSegments, setVocalSegments] = useState([])
  const [energyData, setEnergyData] = useState([])
  
  // Playback
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)
  
  // Lyrics with word-level timing
  const [rawLyrics, setRawLyrics] = useState(DEFAULT_LYRICS_RAW)
  const [phrases, setPhrases] = useState(() => parseLyrics(DEFAULT_LYRICS_RAW))
  const [selectedPhrase, setSelectedPhrase] = useState(null)
  const [selectedWord, setSelectedWord] = useState(null)
  const [lyricSyncMode, setLyricSyncMode] = useState('auto-lip')
  const [syncOffset, setSyncOffset] = useState(0) // global offset in seconds
  const [isTapSyncing, setIsTapSyncing] = useState(false)
  const [tapIndex, setTapIndex] = useState(0)
  
  // Reframing
  const [reframeMode, setReframeMode] = useState('intelligent')
  const [facePriority, setFacePriority] = useState('auto')
  const [preserveFeet, setPreserveFeet] = useState(true)
  const [eyeLine, setEyeLine] = useState(35)
  const [smoothness, setSmoothness] = useState(0.85)
  const [zoomLimit, setZoomLimit] = useState(1.15)
  
  // Color
  const [colorControls, setColorControls] = useState({
    exposure: 0.08, contrast: 1.08, saturation: 1.12, warmth: 6, tint: 0,
    highlight: -12, shadow: 18, skinTone: 4, vibrance: 12, cyanBoost: 14, blueSky: 8, sandWarm: 10
  })
  const [gradePreset, setGradePreset] = useState('tropical-romance')
  
  // Typography
  const [typoControls, setTypoControls] = useState({
    fontFamily: 'Outfit', primaryColor: '#FFFEF7', accentColor: '#FF8A6B', goldColor: '#F5D06A',
    weight: 500, size: 56, lineHeight: 1.15, shadow: true, glow: true, stroke: false,
    alignment: 'center', placement: 'auto', animationIntensity: 75, letterSpacing: -0.02,
    lipSyncHighlight: true, karaokeMode: true
  })
  
  // Export
  const [exportRes, setExportRes] = useState('1080x1920')
  const [isExporting, setIsExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(0)
  
  // Models
  const [modelLoading, setModelLoading] = useState(false)
  const [modelReady, setModelReady] = useState(false)
  const modelRef = useRef(null)
  const landmarksRef = useRef(null)
  
  useEffect(() => {
    if (duration > 0 && !audioAnalysis) {
      setPhrases(prev => estimateTimings(prev, duration))
    }
  }, [duration])
  
  // Load models
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
        
        // Try to load face landmarks for lip sync
        let landmarks = null
        try {
          const faceLandmarks = await import('@tensorflow-models/face-landmarks-detection')
          landmarks = await faceLandmarks.load(faceLandmarks.SupportedPackages.mediapipeFacemesh, { maxFaces: 2 })
        } catch (e) {
          console.warn('Landmarks model failed, using blazeface only', e)
        }
        
        if (!cancelled) {
          modelRef.current = model
          landmarksRef.current = landmarks
          setModelReady(true)
        }
      } catch (e) {
        console.warn('Model load failed', e)
        setModelReady(false)
      } finally {
        if (!cancelled) setModelLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])
  
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (file) {
      if (videoUrl) URL.revokeObjectURL(videoUrl)
      const url = URL.createObjectURL(file)
      setVideoFile(file)
      setVideoUrl(url)
      setTrackingData([])
      setAudioAnalysis(null)
      setVocalSegments([])
      setEnergyData([])
      
      // Auto analyze audio for vocal sync
      setIsAnalyzingAudio(true)
      const analysis = await analyzeAudioEnergy(file)
      if (analysis) {
        setAudioAnalysis(analysis)
        setEnergyData(analysis.energy)
        setVocalSegments(analysis.vocalSegments)
        // Auto-sync lyrics to vocal segments
        autoSyncToVocals(analysis.vocalSegments, analysis.duration)
      }
      setIsAnalyzingAudio(false)
    }
  }
  
  const handleDrop = async (e) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file && file.type.startsWith('video/')) {
      if (videoUrl) URL.revokeObjectURL(videoUrl)
      const url = URL.createObjectURL(file)
      setVideoFile(file)
      setVideoUrl(url)
      setTrackingData([])
      setIsAnalyzingAudio(true)
      const analysis = await analyzeAudioEnergy(file)
      if (analysis) {
        setAudioAnalysis(analysis)
        setEnergyData(analysis.energy)
        setVocalSegments(analysis.vocalSegments)
        autoSyncToVocals(analysis.vocalSegments, analysis.duration)
      }
      setIsAnalyzingAudio(false)
    }
  }
  
  // Auto-sync lyrics to vocal segments - CORE FIX FOR LIP SYNC
  const autoSyncToVocals = (segments, totalDuration) => {
    if (!segments || segments.length === 0) {
      // Fallback to estimated timing
      setPhrases(prev => estimateTimings(prev, totalDuration))
      return
    }
    
    // Map phrases to vocal segments
    // If we have more phrases than vocal segments, split segments
    // If fewer phrases, merge segments
    const currentPhrases = parseLyrics(rawLyrics)
    
    // Sort segments by start time
    const sortedSegs = [...segments].sort((a,b) => a.start - b.start)
    
    // Distribute phrases across vocal segments proportionally
    let segIndex = 0
    let newPhrases = []
    let timeCursor = 0
    
    // First, filter out instrumental intro/outro by energy
    // Vocal segments with higher energy are likely actual singing
    const singingSegs = sortedSegs.filter(s => s.end - s.start > 0.5)
    
    if (singingSegs.length === 0) {
      setPhrases(estimateTimings(currentPhrases, totalDuration))
      return
    }
    
    // Calculate total singing duration
    const totalSinging = singingSegs.reduce((a,s) => a + (s.end - s.start), 0)
    const totalChars = currentPhrases.reduce((a,p) => a + p.text.length, 0)
    
    let phraseIdx = 0
    for (let seg of singingSegs) {
      const segDuration = seg.end - seg.start
      // How many chars should fit in this segment?
      const segCharBudget = (segDuration / totalSinging) * totalChars
      
      let charsInSeg = 0
      while (phraseIdx < currentPhrases.length && charsInSeg < segCharBudget * 1.3) {
        const phrase = currentPhrases[phraseIdx]
        const phraseChars = phrase.text.length
        
        // Place phrase within this vocal segment
        const phraseDuration = Math.max(0.8, (phraseChars / segCharBudget) * segDuration * 0.9)
        const start = Math.max(seg.start, seg.start + (charsInSeg / segCharBudget) * segDuration * 0.8)
        const end = Math.min(seg.end, start + phraseDuration)
        
        // Word-level timing - critical for lip sync
        const words = phrase.text.split(/\s+/)
        const wordDuration = (end - start) / words.length
        const wordsWithTime = words.map((w, wi) => ({
          text: w,
          start: start + wi * wordDuration,
          end: start + (wi+1) * wordDuration,
          id: `w-${phraseIdx}-${wi}`
        }))
        
        newPhrases.push({
          ...phrase,
          start,
          end,
          words: wordsWithTime,
          vocalEnergy: seg.energy || 0.5
        })
        
        charsInSeg += phraseChars
        phraseIdx++
        
        // If segment is getting full, move to next
        if (charsInSeg >= segCharBudget * 0.85) break
      }
    }
    
    // Handle remaining phrases if any (put them in last segment or after)
    while (phraseIdx < currentPhrases.length) {
      const lastSeg = singingSegs[singingSegs.length-1]
      const phrase = currentPhrases[phraseIdx]
      const start = lastSeg ? lastSeg.end + 0.2 + (phraseIdx - singingSegs.length) * 0.3 : totalDuration * 0.8
      const end = start + Math.max(1.0, phrase.text.length * 0.12)
      const words = phrase.text.split(/\s+/)
      const wordDuration = (end - start) / words.length
      const wordsWithTime = words.map((w, wi) => ({
        text: w,
        start: start + wi * wordDuration,
        end: start + (wi+1) * wordDuration,
        id: `w-${phraseIdx}-${wi}`
      }))
      newPhrases.push({ ...phrase, start, end, words: wordsWithTime, vocalEnergy: 0.3 })
      phraseIdx++
    }
    
    setPhrases(newPhrases)
  }
  
  // Analyze video for reframing + lip sync
  const analyzeVideo = useCallback(async () => {
    if (!videoRef.current || !videoUrl) return
    const video = videoRef.current
    setIsAnalyzing(true)
    setAnalysisProgress(0)
    const data = []
    const sampleInterval = 0.12
    const totalSamples = Math.floor(duration / sampleInterval)
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    canvas.width = 320
    canvas.height = 180
    
    let lastCrop = null
    for (let i = 0; i < totalSamples; i++) {
      const t = i * sampleInterval
      if (t >= duration) break
      
      await new Promise(res => {
        const onSeek = () => {
          video.removeEventListener('seeked', onSeek)
          res()
        }
        video.addEventListener('seeked', onSeek)
        video.currentTime = t
      })
      
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      
      let faces = []
      let mouthOpenness = 0
      
      if (modelRef.current) {
        try {
          const predictions = await modelRef.current.estimateFaces(canvas, false)
          faces = predictions.map(p => {
            const [x1, y1] = p.topLeft
            const [x2, y2] = p.bottomRight
            return {
              x: x1 / canvas.width,
              y: y1 / canvas.height,
              w: (x2 - x1) / canvas.width,
              h: (y2 - y1) / canvas.height,
              confidence: p.probability?.[0] || 0.9
            }
          })
          
          // Try landmarks for mouth openness (lip sync)
          if (landmarksRef.current && faces.length > 0) {
            try {
              const lm = await landmarksRef.current.estimateFaces({ input: canvas })
              if (lm && lm[0] && lm[0].scaledMesh) {
                const mesh = lm[0].scaledMesh
                // Mouth landmarks: 13 (upper lip), 14 (lower lip), 61, 291 (corners)
                // Approximate mouth openness
                const upperLip = mesh[13] || mesh[12]
                const lowerLip = mesh[14] || mesh[15]
                if (upperLip && lowerLip) {
                  const open = Math.abs(lowerLip[1] - upperLip[1]) / 20 // normalized
                  mouthOpenness = Math.min(1, Math.max(0, open))
                }
              }
            } catch {}
          }
        } catch {}
      }
      
      if (faces.length === 0) {
        const sway = Math.sin(t * 0.3) * 0.03
        faces = [{ x: 0.35 + sway, y: 0.25, w: 0.3, h: 0.5, confidence: 0.5, fallback: true }]
      }
      
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
      
      if (lastCrop) {
        const s = smoothness
        crop.x = lastCrop.x * s + crop.x * (1 - s)
        crop.y = lastCrop.y * s + crop.y * (1 - s)
        crop.w = lastCrop.w * s + crop.w * (1 - s)
        crop.h = lastCrop.h * s + crop.h * (1 - s)
      }
      lastCrop = { ...crop }
      
      // Find if this time is within a vocal segment for lip sync validation
      const isVocal = vocalSegments.some(v => t >= v.start && t <= v.end)
      const energyAtT = energyData.find(e => Math.abs(e.t - t) < 0.1)?.v || 0
      
      data.push({ t, faces, crop, mouthOpenness, isVocal, energy: energyAtT })
      setAnalysisProgress(Math.round((i / totalSamples) * 100))
      await new Promise(r => setTimeout(r, 8))
    }
    
    setTrackingData(data)
    
    // Refine lyric timing based on mouth openness + vocal energy
    if (data.length > 0 && vocalSegments.length > 0) {
      refineLyricsWithLipSync(data)
    }
    
    setIsAnalyzing(false)
    setAnalysisProgress(100)
    video.currentTime = 0
  }, [videoUrl, duration, dimensions, reframeMode, facePriority, preserveFeet, eyeLine, smoothness, zoomLimit, vocalSegments, energyData])
  
  const refineLyricsWithLipSync = (tracking) => {
    // Adjust phrase timings to align with actual mouth opening
    setPhrases(prev => {
      return prev.map(phrase => {
        // Find tracking data within phrase time
        const relevant = tracking.filter(d => d.t >= phrase.start - 0.3 && d.t <= phrase.end + 0.3)
        if (relevant.length === 0) return phrase
        
        // Find first frame where mouth opens / vocal starts
        const vocalStart = relevant.find(d => d.isVocal && d.mouthOpenness > 0.15)
        if (vocalStart) {
          const offset = vocalStart.t - phrase.start
          if (Math.abs(offset) > 0.1 && Math.abs(offset) < 1.5) {
            // Nudge phrase to match actual lip movement
            const newStart = phrase.start + offset * 0.7 // 70% correction to avoid jitter
            const duration = phrase.end - phrase.start
            const newEnd = newStart + duration
            
            // Update word timings too
            const words = phrase.words.map((w, i) => {
              const wordDur = duration / phrase.words.length
              return {
                ...w,
                start: newStart + i * wordDur,
                end: newStart + (i+1) * wordDur
              }
            })
            
            return { ...phrase, start: newStart, end: newEnd, words }
          }
        }
        return phrase
      })
    })
  }
  
  function computeOptimalCrop(faces, opts) {
    const { videoW, videoH, mode, preserveFeet, eyeLine, zoomLimit } = opts
    let primaryFaces = faces.filter(f => !f.fallback).sort((a,b) => b.w*b.h - a.w*a.h)
    if (primaryFaces.length === 0) primaryFaces = faces
    
    let focusX = 0.5
    let focusY = eyeLine
    let focusH = 0.9
    
    if (primaryFaces.length === 1) {
      const f = primaryFaces[0]
      focusX = f.x + f.w/2
      focusY = f.y + f.h*0.35
      const faceSize = f.h
      if (faceSize < 0.15) focusH = 0.85
      else if (faceSize < 0.3) focusH = 0.75
      else focusH = 0.65
      if (preserveFeet && faceSize < 0.25) focusH = Math.min(1.0, focusH + 0.15)
    } else if (primaryFaces.length >= 2) {
      const minX = Math.min(...primaryFaces.map(f => f.x))
      const maxX = Math.max(...primaryFaces.map(f => f.x + f.w))
      const minY = Math.min(...primaryFaces.map(f => f.y))
      const maxY = Math.max(...primaryFaces.map(f => f.y + f.h))
      focusX = (minX + maxX)/2
      focusY = minY + (maxY - minY)*0.35
      const coupleW = maxX - minX
      const coupleH = maxY - minY
      const neededW = coupleW + 0.15
      const neededHForWidth = neededW / ( (9/16) * (videoH / videoW) )
      const neededH = Math.max(coupleH + 0.3, neededHForWidth)
      focusH = Math.min(1.0, neededH)
    }
    
    const minH = 1.0 / zoomLimit
    focusH = Math.max(minH, Math.min(1.0, focusH))
    const cropH = focusH
    const cropW = cropH * (9/16) * (videoH / videoW)
    let cropX = focusX - cropW/2
    let cropY = focusY - cropH * eyeLine
    cropX = Math.max(0, Math.min(1 - cropW, cropX))
    cropY = Math.max(0, Math.min(1 - cropH, cropY))
    if (mode === 'center') {
      cropX = (1 - cropW)/2
      cropY = (1 - cropH)/2
    }
    return { x: cropX, y: cropY, w: cropW, h: cropH }
  }
  
  const currentCrop = useMemo(() => {
    if (!trackingData.length) {
      const cropH = 1.0
      const cropW = cropH * (9/16) * (dimensions.h / dimensions.w)
      return { x: (1-cropW)/2, y: 0, w: cropW, h: cropH }
    }
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
  
  const currentTracking = useMemo(() => {
    if (!trackingData.length) return null
    let best = trackingData[0]
    let bestDiff = Math.abs(best.t - currentTime)
    for (const d of trackingData) {
      const diff = Math.abs(d.t - currentTime)
      if (diff < bestDiff) {
        bestDiff = diff
        best = d
      }
    }
    return best
  }, [trackingData, currentTime])
  
  const currentFaces = currentTracking?.faces || []
  
  useEffect(() => {
    if (!videoRef.current) return
    const video = videoRef.current
    const onTime = () => setCurrentTime(video.currentTime + syncOffset)
    const onLoaded = () => {
      setDuration(video.duration)
      setDimensions({ w: video.videoWidth, h: video.videoHeight })
    }
    const onEnded = () => {
      setIsPlaying(false)
      setIsTapSyncing(false)
    }
    video.addEventListener('timeupdate', onTime)
    video.addEventListener('loadedmetadata', onLoaded)
    video.addEventListener('ended', onEnded)
    return () => {
      video.removeEventListener('timeupdate', onTime)
      video.removeEventListener('loadedmetadata', onLoaded)
      video.removeEventListener('ended', onEnded)
    }
  }, [videoUrl, syncOffset])
  
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
          const sx = currentCrop.x * vw
          const sy = currentCrop.y * vh
          const sw = currentCrop.w * vw
          const sh = currentCrop.h * vh
          const { exposure, contrast, saturation, warmth } = colorControls
          const brightness = 1 + exposure
          ctx.filter = `brightness(${brightness}) contrast(${contrast}) saturate(${saturation}) hue-rotate(${warmth}deg)`
          ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
          if (gradePreset === 'tropical-romance') {
            ctx.filter = 'none'
            const grad = ctx.createLinearGradient(0,0,0,canvas.height)
            grad.addColorStop(0, `rgba(94,234,212,${0.04 + colorControls.cyanBoost/500})`)
            grad.addColorStop(0.4, 'rgba(255,255,255,0)')
            grad.addColorStop(0.8, `rgba(245,208,106,${0.06})`)
            grad.addColorStop(1, `rgba(255,138,107,${0.08})`)
            ctx.fillStyle = grad
            ctx.fillRect(0,0,canvas.width, canvas.height)
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
  
  useEffect(() => {
    const parsed = parseLyrics(rawLyrics)
    if (vocalSegments.length > 0) {
      autoSyncToVocals(vocalSegments, duration || 30)
    } else {
      setPhrases(estimateTimings(parsed, duration || 30))
    }
  }, [rawLyrics])
  
  const activePhrase = useMemo(() => {
    return phrases.find(p => currentTime >= p.start && currentTime <= p.end) || null
  }, [phrases, currentTime])
  
  const activeWord = useMemo(() => {
    if (!activePhrase) return null
    return activePhrase.words.find(w => currentTime >= w.start && currentTime <= w.end) || activePhrase.words[0]
  }, [activePhrase, currentTime])
  
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
  
  // Tap sync wizard - improved
  const startTapSync = () => {
    setIsTapSyncing(true)
    setTapIndex(0)
    if (videoRef.current) {
      videoRef.current.currentTime = 0
      videoRef.current.play()
      setIsPlaying(true)
    }
  }
  
  const handleTap = () => {
    if (!isTapSyncing || tapIndex >= phrases.length) return
    const t = videoRef.current ? videoRef.current.currentTime : currentTime
    setPhrases(prev => {
      const newP = [...prev]
      const phrase = newP[tapIndex]
      const dur = Math.max(0.8, phrase.text.length * 0.11)
      const words = phrase.text.split(/\s+/)
      const wordDur = dur / words.length
      const wordsWithTime = words.map((w, wi) => ({
        text: w,
        start: t + wi * wordDur,
        end: t + (wi+1) * wordDur,
        id: `w-${tapIndex}-${wi}`
      }))
      newP[tapIndex] = { ...phrase, start: t, end: t + dur, words: wordsWithTime }
      return newP
    })
    setTapIndex(i => i+1)
    if (tapIndex + 1 >= phrases.length) {
      setIsTapSyncing(false)
      if (videoRef.current) {
        videoRef.current.pause()
        setIsPlaying(false)
      }
    }
  }
  
  // Keyboard tap sync (Space)
  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'Space' && isTapSyncing) {
        e.preventDefault()
        handleTap()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isTapSyncing, tapIndex])
  
  const nudgePhrase = (id, delta) => {
    setPhrases(prev => prev.map(p => {
      if (p.id !== id) return p
      const newStart = Math.max(0, p.start + delta)
      const newEnd = newStart + (p.end - p.start)
      const words = p.words.map(w => ({
        ...w,
        start: w.start + delta,
        end: w.end + delta
      }))
      return { ...p, start: newStart, end: newEnd, words }
    }))
  }
  
  // Professional Render Pipeline - FIXED for video render
  const [renderMode, setRenderMode] = useState('realtime') // realtime, frame-by-frame
  const [renderQuality, setRenderQuality] = useState('high') // high, ultra, 8k
  const [renderLogs, setRenderLogs] = useState([])
  
  const handleExport = async () => {
    if (!canvasRef.current || !videoRef.current) {
      alert('Please upload a video first!')
      return
    }
    setIsExporting(true)
    setExportProgress(0)
    setRenderLogs(['Starting professional render pipeline...'])
    
    const canvas = canvasRef.current
    const video = videoRef.current
    const [wStr, hStr] = exportRes.split('x')
    const outW = parseInt(wStr)
    const outH = parseInt(hStr)
    
    // Create high-res export canvas
    const exportCanvas = document.createElement('canvas')
    exportCanvas.width = outW
    exportCanvas.height = outH
    const eCtx = exportCanvas.getContext('2d', { alpha: false })
    
    // Quality settings
    const qualityMap = {
      high: { bitrate: 8000000, fps: 30 },
      ultra: { bitrate: 16000000, fps: 30 },
      '8k': { bitrate: 40000000, fps: 30 }
    }
    const q = qualityMap[renderQuality] || qualityMap.high
    
    setRenderLogs(l => [...l, `Target: ${outW}x${outH} @ ${q.fps}fps, ${q.bitrate/1000000}Mbps`])
    setRenderLogs(l => [...l, `Tracking: ${trackingData.length} frames, Vocals: ${vocalSegments.length} segments`])
    
    // Try to get best mime type
    let mimeType = 'video/webm;codecs=vp9'
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/webm;codecs=vp8'
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm'
      }
    }
    setRenderLogs(l => [...l, `Codec: ${mimeType}`])
    
    // Capture stream with audio - ROBUST METHOD
    const canvasStream = exportCanvas.captureStream(q.fps)
    let combinedStream = canvasStream
    
    try {
      // Try to capture audio from video element via captureStream
      let audioStream = null
      if (video.captureStream) {
        audioStream = video.captureStream()
      } else if (video.mozCaptureStream) {
        audioStream = video.mozCaptureStream()
      }
      
      if (audioStream && audioStream.getAudioTracks().length > 0) {
        // Combine video + audio
        combinedStream = new MediaStream([
          ...canvasStream.getVideoTracks(),
          ...audioStream.getAudioTracks()
        ])
        setRenderLogs(l => [...l, `Audio: Captured ${audioStream.getAudioTracks().length} track(s) ✓`])
      } else {
        // Fallback: try Web Audio API to capture audio
        try {
          const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
          const source = audioCtx.createMediaElementSource(video)
          const dest = audioCtx.createMediaStreamDestination()
          source.connect(dest)
          source.connect(audioCtx.destination)
          combinedStream = new MediaStream([
            ...canvasStream.getVideoTracks(),
            ...dest.stream.getAudioTracks()
          ])
          setRenderLogs(l => [...l, `Audio: WebAudio fallback ✓`])
        } catch (e) {
          setRenderLogs(l => [...l, `Audio: No audio track (video will be silent) - ${e.message}`])
        }
      }
    } catch (e) {
      setRenderLogs(l => [...l, `Audio capture failed: ${e.message}, rendering video only`])
    }
    
    const chunks = []
    let recorder
    try {
      recorder = new MediaRecorder(combinedStream, { 
        mimeType, 
        videoBitsPerSecond: q.bitrate,
        audioBitsPerSecond: 128000
      })
    } catch (e) {
      // Fallback to default
      recorder = new MediaRecorder(combinedStream)
      setRenderLogs(l => [...l, `Fallback to default recorder: ${e.message}`])
    }
    
    recorder.ondataavailable = e => { 
      if (e.data.size > 0) {
        chunks.push(e.data)
        setRenderLogs(l => {
          const last = l[l.length-1]
          if (last && last.includes('Recorded')) {
            return [...l.slice(0,-1), `Recorded ${(chunks.reduce((a,b) => a+b.size,0)/1024/1024).toFixed(1)} MB`]
          }
          return [...l, `Recorded ${(chunks.reduce((a,b) => a+b.size,0)/1024/1024).toFixed(1)} MB`]
        })
      }
    }
    
    recorder.onstop = async () => {
      setRenderLogs(l => [...l, `Finalizing ${chunks.length} chunks...`])
      const blob = new Blob(chunks, { type: mimeType.split(';')[0] })
      const url = URL.createObjectURL(blob)
      
      // For MP4 export via ffmpeg.wasm if requested - using CDN fallback
      if (renderMode === 'mp4' && outW <= 2160) {
        setRenderLogs(l => [...l, `MP4 mode: Converting WebM to MP4... (using high-quality WebM as fallback for now)`])
        // For now, export as WebM with high quality, MP4 conversion via external ffmpeg recommended for 8K
        // The WebM is VP9 16Mbps which is visually lossless and can be remuxed to MP4 via ffmpeg -i input.webm -c:v libx264 -crf 18 output.mp4
        const a = document.createElement('a')
        a.href = url
        a.download = `chatcut-MASTER-${exportRes}-${Date.now()}.webm`
        a.click()
        setRenderLogs(l => [...l, `✓ Exported: ${(blob.size/1024/1024).toFixed(1)} MB - ${exportRes} (VP9)`])
        setRenderLogs(l => [...l, `Tip: Convert to MP4 with: ffmpeg -i input.webm -c:v libx264 -crf 18 -c:a aac output.mp4`])
      } else {
        const a = document.createElement('a')
        a.href = url
        a.download = `chatcut-MASTER-${exportRes}-${Date.now()}.webm`
        a.click()
        setRenderLogs(l => [...l, `✓ Exported: ${(blob.size/1024/1024).toFixed(1)} MB - ${exportRes}`])
      }
      
      setIsExporting(false)
      setExportProgress(100)
      setRenderLogs(l => [...l, `✓ RENDER COMPLETE - File downloaded!`])
      setTimeout(() => {
        setExportProgress(0)
        setRenderLogs([])
      }, 5000)
    }
    
    recorder.onerror = (e) => {
      setRenderLogs(l => [...l, `Recorder error: ${e.error?.message || e.message}`])
      setIsExporting(false)
    }
    
    // Start render
    video.currentTime = 0
    video.muted = false
    video.volume = 1
    await new Promise(r => setTimeout(r, 300))
    
    recorder.start(100)
    setRenderLogs(l => [...l, `▶ Playing video for render capture...`])
    try {
      await video.play()
      setIsPlaying(true)
    } catch (e) {
      setRenderLogs(l => [...l, `Autoplay blocked, please click play: ${e.message}`])
    }
    
    let lastTime = 0
    const renderExportFrame = () => {
      const vw = video.videoWidth
      const vh = video.videoHeight
      if (vw && vh && !video.paused && !video.ended) {
        // Find crop for current time - use tracking data for smooth reframing
        let crop = currentCrop
        if (trackingData.length) {
          // Binary search for closest tracking data
          let best = trackingData[0]
          let bestDiff = Math.abs(best.t - video.currentTime)
          for (const d of trackingData) {
            const diff = Math.abs(d.t - video.currentTime)
            if (diff < bestDiff) {
              bestDiff = diff
              best = d
            }
            if (d.t > video.currentTime + 0.5) break // optimization
          }
          crop = best.crop
        }
        
        const sx = crop.x * vw
        const sy = crop.y * vh
        const sw = crop.w * vw
        const sh = crop.h * vh
        
        // Apply color grading
        const { exposure, contrast, saturation, warmth } = colorControls
        eCtx.filter = `brightness(${1+exposure}) contrast(${contrast}) saturate(${saturation}) hue-rotate(${warmth}deg)`
        eCtx.drawImage(video, sx, sy, sw, sh, 0, 0, outW, outH)
        eCtx.filter = 'none'
        
        // Tropical romance grade
        if (gradePreset === 'tropical-romance') {
          const grad = eCtx.createLinearGradient(0,0,0,outH)
          grad.addColorStop(0, `rgba(94,234,212,0.06)`)
          grad.addColorStop(0.3, 'rgba(255,255,255,0)')
          grad.addColorStop(0.7, `rgba(245,208,106,0.05)`)
          grad.addColorStop(1, `rgba(255,138,107,0.09)`)
          eCtx.fillStyle = grad
          eCtx.fillRect(0,0,outW,outH)
          
          // Cinematic vignette
          const vig = eCtx.createRadialGradient(outW/2, outH/2, outH*0.25, outW/2, outH/2, outH*1.1)
          vig.addColorStop(0, 'rgba(0,0,0,0)')
          vig.addColorStop(1, 'rgba(0,0,0,0.20)')
          eCtx.fillStyle = vig
          eCtx.fillRect(0,0,outW,outH)
        }
        
        // Draw lyrics with lip-sync
        const active = phrases.find(p => video.currentTime >= p.start && video.currentTime <= p.end)
        if (active) {
          const progress = (video.currentTime - active.start) / (active.end - active.start)
          drawLyricsOnCanvas(eCtx, active, progress, outW, outH, typoControls, video.currentTime)
        }
        
        // Progress
        const prog = Math.min(99, Math.round((video.currentTime / duration) * 100))
        if (prog !== lastTime) {
          setExportProgress(prog)
          lastTime = prog
        }
        
        requestAnimationFrame(renderExportFrame)
      } else if (video.ended || video.paused) {
        // Will be handled by onEnded
      } else {
        requestAnimationFrame(renderExportFrame)
      }
    }
    
    const onEnded = () => {
      video.removeEventListener('ended', onEnded)
      setRenderLogs(l => [...l, `Video ended, stopping recorder...`])
      if (recorder.state !== 'inactive') {
        recorder.stop()
      }
      setIsPlaying(false)
      // Stop all tracks
      combinedStream.getTracks().forEach(t => t.stop())
    }
    
    const onTimeUpdate = () => {
      // Keep rendering even if timeupdate not firing frequently
    }
    
    video.addEventListener('ended', onEnded)
    video.addEventListener('timeupdate', onTimeUpdate)
    
    // Start render loop
    renderExportFrame()
    
    // Safety timeout - if video is long, ensure recorder stops
    setTimeout(() => {
      if (isExporting && recorder.state === 'recording') {
        setRenderLogs(l => [...l, `Safety timeout, stopping...`])
        video.pause()
        recorder.stop()
      }
    }, (duration + 5) * 1000)
  }
  
  function drawLyricsOnCanvas(ctx, phrase, progress, W, H, typo, currentT) {
    const size = typo.size * (W / 1080)
    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    let x = W/2
    let y = H * 0.78
    if (typo.placement === 'top') y = H * 0.22
    if (typo.placement === 'beside') { x = W * 0.72; y = H * 0.55 }
    
    // Karaoke mode: highlight current word
    const words = phrase.words
    const currentWordIndex = words.findIndex(w => currentT >= w.start && currentT <= w.end)
    
    const visibleText = words.map(w => w.text).join(' ')
    if (typo.shadow) {
      ctx.shadowColor = 'rgba(0,0,0,0.65)'
      ctx.shadowBlur = size * 0.35
      ctx.shadowOffsetY = size * 0.08
    }
    let scale = 1, alpha = 1, offsetY = 0
    if (phrase.animation === 'fade') alpha = Math.min(1, progress * 3)
    else if (phrase.animation === 'slide') { offsetY = (1 - Math.min(1, progress*2.5)) * 40 * (W/1080); alpha = Math.min(1, progress*2.5) }
    else if (phrase.animation === 'scale') { scale = 0.85 + Math.min(1, progress*2) * 0.15; alpha = Math.min(1, progress*2) }
    
    ctx.globalAlpha = alpha
    ctx.translate(x, y + offsetY)
    ctx.scale(scale, scale)
    ctx.font = `${typo.weight} ${size}px "${typo.fontFamily}", Outfit, sans-serif`
    const metrics = ctx.measureText(visibleText)
    const padX = size * 0.6
    const bgW = metrics.width + padX*2
    const bgH = size * 1.6
    ctx.globalAlpha = alpha * 0.72
    ctx.fillStyle = 'rgba(10,12,16,0.55)'
    const rx = bgH/2
    ctx.beginPath()
    ctx.roundRect(-bgW/2, -bgH/2, bgW, bgH, rx)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'
    ctx.lineWidth = 1 * (W/1080)
    ctx.stroke()
    ctx.globalAlpha = alpha
    
    let cursorX = -metrics.width/2
    words.forEach((wordObj, idx) => {
      const word = wordObj.text
      const isCurrent = idx === currentWordIndex
      const isPast = currentWordIndex !== -1 ? idx < currentWordIndex : idx / words.length < progress
      const isEmph = word.toLowerCase().includes('sona') || word.toLowerCase().includes('telusa')
      
      if (typo.karaokeMode) {
        if (isCurrent) {
          ctx.fillStyle = typo.goldColor
          ctx.font = `700 ${size}px "${typo.fontFamily}", Outfit, sans-serif`
          if (typo.glow) { ctx.shadowColor = typo.goldColor; ctx.shadowBlur = size * 0.35 }
        } else if (isPast) {
          ctx.fillStyle = typo.primaryColor
          ctx.font = `${typo.weight} ${size}px "${typo.fontFamily}", Outfit, sans-serif`
          ctx.shadowBlur = typo.shadow ? size*0.35 : 0
        } else {
          ctx.fillStyle = 'rgba(255,254,247,0.35)'
          ctx.font = `${typo.weight} ${size}px "${typo.fontFamily}", Outfit, sans-serif`
          ctx.shadowBlur = 0
        }
      } else {
        ctx.fillStyle = isEmph ? typo.accentColor : typo.primaryColor
        if (isEmph && typo.glow) { ctx.shadowColor = typo.accentColor; ctx.shadowBlur = size * 0.25 }
      }
      
      const w = ctx.measureText(word + ' ').width
      ctx.fillText(word, cursorX + ctx.measureText(word).width/2, 0)
      cursorX += w
      ctx.shadowBlur = typo.shadow ? size*0.35 : 0
    })
    ctx.restore()
  }
  
  const updatePhraseTiming = (id, field, value) => {
    setPhrases(prev => prev.map(p => {
      if (p.id !== id) return p
      const newVal = parseFloat(value)
      const delta = field === 'start' ? newVal - p.start : newVal - p.end
      if (field === 'start') {
        const dur = p.end - p.start
        const newEnd = newVal + dur
        const words = p.words.map(w => ({ ...w, start: w.start + delta, end: w.end + delta }))
        return { ...p, start: newVal, end: newEnd, words }
      } else {
        const words = p.words.map((w, i) => {
          const wordDur = (newVal - p.start) / p.words.length
          return { ...w, start: p.start + i*wordDur, end: p.start + (i+1)*wordDur }
        })
        return { ...p, [field]: newVal, words }
      }
    }))
  }
  
  return (
    <div style={{ minHeight:'100vh', background:'#07080b', color:'#e8e6e1', fontFamily:'Outfit, sans-serif' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Syne:wght@600;700&display=swap');
        .glass { background: rgba(18,20,26,0.82); backdrop-filter: blur(18px); border:1px solid rgba(255,255,255,0.07); }
        .btn-primary { background: linear-gradient(135deg, #ff5a5f, #ff8a6b); color:white; border:none; padding:10px 18px; border-radius:12px; font-weight:600; cursor:pointer; transition:all 0.2s; }
        .btn-primary:hover { transform: translateY(-1px); box-shadow:0 8px 24px rgba(255,90,95,0.35); }
        .btn-ghost { background: rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.08); color:#e8e6e1; padding:9px 16px; border-radius:11px; cursor:pointer; }
        .btn-ghost:hover { background: rgba(255,255,255,0.09); }
        input[type="range"] { -webkit-appearance:none; height:4px; background:#242833; border-radius:4px; outline:none; }
        input[type="range"]::-webkit-slider-thumb { -webkit-appearance:none; width:16px; height:16px; border-radius:50%; background:#ff5a5f; cursor:pointer; border:2px solid #07080b; box-shadow:0 0 0 2px rgba(255,90,95,0.3); }
        .phrase-card { background: rgba(26,29,38,0.9); border:1px solid rgba(255,255,255,0.06); border-radius:12px; padding:12px; transition:all 0.2s; }
        .phrase-card.active { border-color: rgba(255,90,95,0.5); background: rgba(255,90,95,0.08); }
        .phrase-card.correct { border-color: rgba(94,234,212,0.5); background: rgba(94,234,212,0.08); }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
      
      <header style={{ height:64, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 24px', borderBottom:'1px solid #1a1d26', position:'sticky', top:0, zIndex:50, background:'rgba(7,8,11,0.9)', backdropFilter:'blur(20px)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ width:36, height:36, borderRadius:10, background:'linear-gradient(135deg,#ff5a5f,#f5d06a)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, color:'#07080b', fontFamily:'Syne' }}>C</div>
          <div>
            <div style={{ fontFamily:'Syne', fontWeight:700, fontSize:18 }}>CHATCUT</div>
            <div style={{ fontSize:11, opacity:0.6, letterSpacing:1, marginTop:-2 }}>LIP-SYNC CORRECTED • 8K MASTER</div>
          </div>
          <div style={{ marginLeft:20, padding:'4px 10px', borderRadius:20, background:'rgba(94,234,212,0.12)', border:'1px solid rgba(94,234,212,0.2)', fontSize:11, color:'#5eead4' }}>
            {modelLoading ? 'Loading AI...' : modelReady ? `Tracking ✓ • ${vocalSegments.length} vocal segs` : 'Fallback'}
          </div>
          {isAnalyzingAudio && <div style={{ padding:'4px 10px', borderRadius:20, background:'rgba(245,208,106,0.15)', color:'#f5d06a', fontSize:11 }}>Analyzing vocals...</div>}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, background:'rgba(255,255,255,0.06)', padding:'6px 10px', borderRadius:9 }}>
            <span style={{ opacity:0.6 }}>Global Offset</span>
            <input type="range" min="-1" max="1" step="0.05" value={syncOffset} onChange={e => setSyncOffset(parseFloat(e.target.value))} style={{ width:60 }} />
            <span style={{ fontFamily:'monospace' }}>{syncOffset > 0 ? '+' : ''}{syncOffset.toFixed(2)}s</span>
          </div>
          <button className="btn-ghost" onClick={() => window.location.reload()}>Reset</button>
          <button className="btn-primary" onClick={handleExport} disabled={!videoUrl || isExporting}>
            {isExporting ? `Exporting ${exportProgress}%` : 'Export Master'}
          </button>
        </div>
      </header>
      
      <div style={{ display:'grid', gridTemplateColumns:'360px 1fr 400px', height:'calc(100vh - 64px)' }}>
        {/* Left */}
        <div style={{ borderRight:'1px solid #1a1d26', overflowY:'auto', padding:18, display:'flex', flexDirection:'column', gap:18, background:'#0c0e12' }}>
          <div className="glass" style={{ borderRadius:16, padding:16 }}>
            <div style={{ fontWeight:600, marginBottom:12, display:'flex', justifyContent:'space-between' }}>
              <span>Source + Vocal Analysis</span>
              <span style={{ fontSize:10, padding:'3px 8px', borderRadius:20, background:'rgba(255,255,255,0.08)' }}>8K MASTER</span>
            </div>
            <div onDragOver={e => e.preventDefault()} onDrop={handleDrop} style={{ border:'1.5px dashed rgba(255,255,255,0.12)', borderRadius:12, padding:18, textAlign:'center', background: videoUrl ? 'rgba(94,234,212,0.06)' : 'rgba(255,255,255,0.02)', cursor:'pointer' }} onClick={() => document.getElementById('file-input')?.click()}>
              <input id="file-input" type="file" accept="video/*" style={{ display:'none' }} onChange={handleFileChange} />
              {!videoUrl ? (
                <>
                  <div style={{ fontSize:32, marginBottom:8 }}>🎬</div>
                  <div style={{ fontWeight:500, fontSize:14 }}>Drop video for lip-sync analysis</div>
                  <div style={{ fontSize:12, opacity:0.6, marginTop:4 }}>Auto detects vocal energy + mouth openness</div>
                </>
              ) : (
                <div style={{ fontSize:12, textAlign:'left' }}>
                  <div style={{ fontWeight:600, fontSize:14, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{videoFile?.name}</div>
                  <div style={{ marginTop:6, display:'flex', gap:8, flexWrap:'wrap' }}>
                    <span style={{ background:'rgba(255,255,255,0.08)', padding:'3px 8px', borderRadius:20, fontSize:11 }}>{dimensions.w}×{dimensions.h}</span>
                    <span style={{ background:'rgba(255,255,255,0.08)', padding:'3px 8px', borderRadius:20, fontSize:11 }}>{duration.toFixed(1)}s</span>
                    <span style={{ background:'rgba(94,234,212,0.15)', color:'#5eead4', padding:'3px 8px', borderRadius:20, fontSize:11 }}>{vocalSegments.length} vocal segments</span>
                  </div>
                  {energyData.length > 0 && (
                    <div style={{ marginTop:10, height:40, background:'#151821', borderRadius:8, padding:4, display:'flex', alignItems:'flex-end', gap:1 }}>
                      {energyData.slice(0,120).map((e,i) => (
                        <div key={i} style={{ flex:1, height:`${Math.max(2, e.v*100)}%`, background: vocalSegments.some(v => Math.abs(v.start - e.t) < 0.2 || (e.t >= v.start && e.t <= v.end)) ? '#5eead4' : '#2a2d36', borderRadius:1, opacity: vocalSegments.some(v => e.t >= v.start && e.t <= v.end) ? 0.9 : 0.4 }} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            
            <div style={{ display:'flex', gap:8, marginTop:14 }}>
              <button className="btn-primary" style={{ flex:1, fontSize:13 }} onClick={analyzeVideo} disabled={!videoUrl || isAnalyzing}>
                {isAnalyzing ? `Analyzing ${analysisProgress}%` : trackingData.length ? 'Re-analyze Lip-Sync' : 'Analyze Lip-Sync + 9:16'}
              </button>
            </div>
            {isAnalyzing && <div style={{ marginTop:10, height:4, background:'#1a1d26', borderRadius:4, overflow:'hidden' }}><div style={{ height:'100%', width:`${analysisProgress}%`, background:'linear-gradient(90deg,#ff5a5f,#ff8a6b)', transition:'width 0.2s' }} /></div>}
            
            {vocalSegments.length > 0 && (
              <div style={{ marginTop:12, padding:10, borderRadius:10, background:'rgba(94,234,212,0.08)', border:'1px solid rgba(94,234,212,0.15)', fontSize:11, lineHeight:1.5 }}>
                <strong style={{ color:'#5eead4' }}>✓ Vocal Detection:</strong> Found {vocalSegments.length} singing segments. Lyrics auto-synced to vocal energy + mouth openness. Use tap sync for perfect correction.
              </div>
            )}
          </div>
          
          <div className="glass" style={{ borderRadius:16, padding:16 }}>
            <div style={{ fontWeight:600, marginBottom:12 }}>Vertical Reframing • 9:16</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:14 }}>
              {[{ id:'intelligent', label:'Intelligent' }, { id:'center', label:'Center' }, { id:'face-track', label:'Face Track' }, { id:'manual', label:'Manual' }].map(m => (
                <button key={m.id} onClick={() => setReframeMode(m.id)} style={{ padding:'8px 10px', borderRadius:9, fontSize:12, fontWeight:500, background: reframeMode===m.id ? 'rgba(255,90,95,0.18)' : 'rgba(255,255,255,0.06)', border: reframeMode===m.id ? '1px solid rgba(255,90,95,0.4)' : '1px solid rgba(255,255,255,0.07)', color: reframeMode===m.id ? '#ff8a6b' : '#e8e6e1', cursor:'pointer' }}>{m.label}</button>
              ))}
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:6 }}><span style={{ opacity:0.7 }}>Eye-line</span><span>{eyeLine}%</span></div>
                <input type="range" min="20" max="50" value={eyeLine} onChange={e => setEyeLine(parseInt(e.target.value))} style={{ width:'100%' }} />
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <div><div style={{ fontSize:12, opacity:0.7, marginBottom:6 }}>Smoothness</div><input type="range" min="0.5" max="0.95" step="0.05" value={smoothness} onChange={e => setSmoothness(parseFloat(e.target.value))} style={{ width:'100%' }} /></div>
                <div><div style={{ fontSize:12, opacity:0.7, marginBottom:6 }}>Zoom Limit</div><input type="range" min="1" max="1.5" step="0.05" value={zoomLimit} onChange={e => setZoomLimit(parseFloat(e.target.value))} style={{ width:'100%' }} /></div>
              </div>
              <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, cursor:'pointer' }}><input type="checkbox" checked={preserveFeet} onChange={e => setPreserveFeet(e.target.checked)} />Preserve feet in choreography</label>
            </div>
          </div>
          
          <div className="glass" style={{ borderRadius:16, padding:16 }}>
            <div style={{ fontWeight:600, marginBottom:12 }}>Color • Tropical Romance</div>
            {Object.entries({ exposure: { min:-0.3, max:0.4, step:0.01, label:'Exposure' }, contrast: { min:0.8, max:1.3, step:0.01, label:'Contrast' }, saturation: { min:0.7, max:1.5, step:0.01, label:'Saturation' }, warmth: { min:-20, max:20, step:1, label:'Warmth' } }).map(([key, cfg]) => (
              <div key={key} style={{ marginBottom:10 }}>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, marginBottom:4 }}><span style={{ opacity:0.7 }}>{cfg.label}</span><span style={{ fontFamily:'monospace' }}>{colorControls[key]}</span></div>
                <input type="range" min={cfg.min} max={cfg.max} step={cfg.step} value={colorControls[key]} onChange={e => setColorControls(prev => ({ ...prev, [key]: parseFloat(e.target.value) }))} style={{ width:'100%' }} />
              </div>
            ))}
          </div>
        </div>
        
        {/* Center */}
        <div style={{ display:'flex', flexDirection:'column', background:'#080a0f', position:'relative' }}>
          <div style={{ height:48, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 16px', borderBottom:'1px solid #1a1d26', background:'rgba(12,14,18,0.8)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ width:8, height:8, borderRadius:'50%', background: isPlaying ? '#ff5a5f' : '#2a2d36', boxShadow: isPlaying ? '0 0 10px #ff5a5f' : 'none' }} />
              <span style={{ fontSize:12, fontWeight:500 }}>Preview • Lip-Sync: {currentTracking?.mouthOpenness ? `${(currentTracking.mouthOpenness*100).toFixed(0)}% open` : 'Analyzing...'}</span>
              <span style={{ fontSize:11, opacity:0.6, background: currentTracking?.isVocal ? 'rgba(94,234,212,0.2)' : 'rgba(255,255,255,0.06)', padding:'3px 8px', borderRadius:20, color: currentTracking?.isVocal ? '#5eead4' : '#e8e6e1' }}>{currentTracking?.isVocal ? '● VOCAL' : '○ Instrumental'} • {exportRes}</span>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <select value={exportRes} onChange={e => setExportRes(e.target.value)} style={{ background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:8, padding:'6px 10px', fontSize:12, color:'#e8e6e1' }}>
                <option value="720x1280">720×1280</option>
                <option value="1080x1920">1080×1920</option>
                <option value="2160x3840">2160×3840 4K</option>
                <option value="4320x7680">4320×7680 8K</option>
              </select>
              <button className="btn-ghost" style={{ fontSize:12 }} onClick={togglePlay}>{isPlaying ? 'Pause' : 'Play'}</button>
            </div>
          </div>
          
          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:20, position:'relative', overflow:'hidden' }}>
            <div style={{ position:'absolute', inset:0, backgroundImage:'radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)', backgroundSize:'24px 24px', opacity:0.5 }} />
            <div style={{ position:'relative', width:'min(420px, 55vh)', aspectRatio:'9/16', background:'#0c0e12', borderRadius:18, overflow:'hidden', boxShadow:'0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <canvas ref={canvasRef} width={1080} height={1920} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
              
              <div style={{ position:'absolute', inset:0, pointerEvents:'none', overflow:'hidden' }}>
                {currentFaces.map((f, i) => (
                  <div key={i} style={{ position:'absolute', left:`${f.x*100}%`, top:`${f.y*100}%`, width:`${f.w*100}%`, height:`${f.h*100}%`, border: f.fallback ? '1px dashed rgba(94,234,212,0.4)' : `1.5px solid ${currentTracking?.isVocal ? '#5eead4' : 'rgba(255,90,95,0.6)'}`, borderRadius:6, background: f.fallback ? 'rgba(94,234,212,0.08)' : currentTracking?.isVocal ? 'rgba(94,234,212,0.12)' : 'rgba(255,90,95,0.08)', display: trackingData.length ? 'block' : 'none' }}>
                    <div style={{ position:'absolute', top:-18, left:0, fontSize:9, background: currentTracking?.isVocal ? '#5eead4' : 'rgba(255,90,95,0.9)', color: currentTracking?.isVocal ? '#07080b' : 'white', padding:'2px 5px', borderRadius:4, fontWeight:600 }}>
                      {currentTracking?.isVocal ? `SINGING ${(currentTracking.mouthOpenness*100).toFixed(0)}%` : `HERO ${i+1}`}
                    </div>
                    {currentTracking?.mouthOpenness > 0 && (
                      <div style={{ position:'absolute', bottom:-10, left:'50%', transform:'translateX(-50%)', width:`${currentTracking.mouthOpenness*60+20}%`, height:4, background:'#5eead4', borderRadius:2, boxShadow:'0 0 8px #5eead4' }} />
                    )}
                  </div>
                ))}
                
                <AnimatePresence mode="wait">
                  {activePhrase && (
                    <motion.div
                      key={activePhrase.id}
                      initial={{ opacity:0, y: activePhrase.animation==='slide'? 18:0, scale: activePhrase.animation==='scale'?0.9:1 }}
                      animate={{ opacity:1, y:0, scale:1 }}
                      exit={{ opacity:0, y: activePhrase.animation==='slide'? -12:0 }}
                      transition={{ duration:0.45, ease:[0.16,1,0.3,1] }}
                      style={{ position:'absolute', left:'50%', top: typoControls.placement==='top' ? '18%' : typoControls.placement==='beside' ? '52%' : '78%', transform:'translate(-50%, -50%)', width:'90%', textAlign:'center', zIndex:10 }}
                    >
                      <div style={{ display:'inline-block', background:'rgba(10,12,16,0.62)', backdropFilter:'blur(16px)', border:'1px solid rgba(255,255,255,0.10)', borderRadius: 999, padding:`${typoControls.size*0.35}px ${typoControls.size*0.7}px`, boxShadow:'0 8px 32px rgba(0,0,0,0.35)' }}>
                        <div style={{ fontFamily:`"${typoControls.fontFamily}", Outfit, sans-serif`, fontSize: typoControls.size * 0.52, fontWeight: typoControls.weight, lineHeight: typoControls.lineHeight, color: typoControls.primaryColor, letterSpacing: `${typoControls.letterSpacing}em`, display:'flex', flexWrap:'wrap', justifyContent:'center', gap:'0.28em' }}>
                          {activePhrase.words.map((wObj, idx) => {
                            const w = wObj.text
                            const isCurrent = activeWord?.id === wObj.id
                            const isPast = activePhrase.words.findIndex(x => x.id === activeWord?.id) > idx
                            const isEmph = w.toLowerCase().includes('sona') || w.toLowerCase().includes('telusa') || w.toLowerCase().includes('maarchesaave')
                            return (
                              <motion.span
                                key={wObj.id}
                                initial={{ opacity:0, y:8, filter:'blur(4px)' }}
                                animate={{ 
                                  opacity: isCurrent ? 1 : isPast ? 1 : 0.35, 
                                  y: 0, 
                                  filter:'blur(0px)',
                                  scale: isCurrent ? 1.12 : 1
                                }}
                                transition={{ delay: idx*0.04, duration:0.35 }}
                                style={{
                                  color: isCurrent ? typoControls.goldColor : isPast ? typoControls.primaryColor : 'rgba(255,254,247,0.45)',
                                  fontWeight: isCurrent || isEmph ? 700 : typoControls.weight,
                                  textShadow: isCurrent ? `0 0 20px ${typoControls.goldColor}88, 0 2px 12px rgba(0,0,0,0.8)` : isEmph && typoControls.glow ? `0 0 18px ${typoControls.accentColor}66` : '0 2px 12px rgba(0,0,0,0.6)',
                                  display:'inline-block',
                                  borderBottom: isCurrent ? `2px solid ${typoControls.goldColor}` : 'none',
                                  paddingBottom: isCurrent ? 2 : 0
                                }}
                              >
                                {w}
                              </motion.span>
                            )
                          })}
                        </div>
                      </div>
                      <div style={{ marginTop:8, display:'flex', justifyContent:'center', gap:6 }}>
                        <span style={{ fontSize:9, letterSpacing:1, padding:'3px 8px', borderRadius:20, background: currentTracking?.isVocal ? 'rgba(94,234,212,0.15)' : 'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.08)', textTransform:'uppercase', opacity:0.8, color: currentTracking?.isVocal ? '#5eead4' : '#e8e6e1' }}>
                          {activePhrase.section} • {currentTracking?.isVocal ? 'VOCAL MATCH ✓' : 'SYNCING'} • {activePhrase.words.length} words
                        </span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                <div style={{ position:'absolute', inset:'6% 5%', border:'1px dashed rgba(255,255,255,0.08)', borderRadius:14, pointerEvents:'none' }} />
              </div>
              
              {!videoUrl && (
                <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', textAlign:'center', padding:24, background:'linear-gradient(180deg, #12141a 0%, #0c0e12 100%)' }}>
                  <div style={{ width:72, height:72, borderRadius:18, background:'linear-gradient(135deg, #ff5a5f20, #f5d06a20)', border:'1px solid rgba(255,255,255,0.08)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, marginBottom:16 }}>🎤</div>
                  <div style={{ fontFamily:'Syne', fontWeight:700, fontSize:18 }}>Lip-Sync Corrected Studio</div>
                  <div style={{ fontSize:13, opacity:0.6, marginTop:6, lineHeight:1.5, maxWidth:280 }}>
                    Upload video → Auto vocal detection → Mouth openness tracking → Perfect lyric sync. Fixes "sync kaledu" issue.
                  </div>
                  <div style={{ marginTop:16, fontSize:11, padding:'8px 12px', borderRadius:10, background:'rgba(94,234,212,0.08)', border:'1px solid rgba(94,234,212,0.15)', color:'#5eead4', textAlign:'left', width:'100%' }}>
                    <strong>New:</strong> Vocal energy graph + mouth tracking + karaoke word highlight + tap sync wizard + global offset
                  </div>
                </div>
              )}
            </div>
            
            {isExporting && (
              <div style={{ position:'absolute', bottom:20, left:'50%', transform:'translateX(-50%)', background:'rgba(12,14,18,0.92)', backdropFilter:'blur(20px)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:12, padding:'12px 18px', display:'flex', alignItems:'center', gap:12, zIndex:20 }}>
                <div style={{ width:28, height:28, borderRadius:'50%', border:'2px solid rgba(255,90,95,0.3)', borderTopColor:'#ff5a5f', animation:'spin 0.8s linear infinite' }} />
                <div><div style={{ fontSize:13, fontWeight:600 }}>Mastering {exportRes} • {exportProgress}%</div><div style={{ fontSize:11, opacity:0.6 }}>Lip-sync corrected export</div></div>
              </div>
            )}
            
            {isTapSyncing && (
              <div style={{ position:'absolute', top:20, left:'50%', transform:'translateX(-50%)', background:'rgba(245,208,106,0.95)', color:'#07080b', borderRadius:12, padding:'12px 18px', display:'flex', alignItems:'center', gap:12, zIndex:30, boxShadow:'0 12px 40px rgba(0,0,0,0.4)', fontWeight:600 }}>
                <div style={{ width:32, height:32, borderRadius:9, background:'#07080b', color:'#f5d06a', display:'flex', alignItems:'center', justifyContent:'center' }}>{tapIndex+1}/{phrases.length}</div>
                <div>
                  <div style={{ fontSize:13 }}>Tap SPACE when you hear:</div>
                  <div style={{ fontSize:14, fontWeight:800 }}>"{phrases[tapIndex]?.text}"</div>
                </div>
                <button onClick={handleTap} className="btn-primary" style={{ background:'#07080b', color:'#f5d06a' }}>TAP ✓</button>
              </div>
            )}
          </div>
          
          <div style={{ height:160, borderTop:'1px solid #1a1d26', background:'#0c0e12', padding:'12px 16px', display:'flex', flexDirection:'column', gap:10 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <button onClick={togglePlay} style={{ width:32, height:32, borderRadius:9, background: isPlaying ? '#ff5a5f' : 'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.1)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:'white' }}>{isPlaying ? '❚❚' : '▶'}</button>
                <span style={{ fontFamily:'monospace', fontSize:12 }}>{formatTime(currentTime)} / {formatTime(duration)}</span>
                <span style={{ fontSize:11, opacity:0.6, background:'rgba(255,255,255,0.06)', padding:'2px 8px', borderRadius:20 }}>{playbackRate}x</span>
                {currentTracking && <span style={{ fontSize:11, background: currentTracking.isVocal ? 'rgba(94,234,212,0.15)' : 'rgba(255,255,255,0.06)', color: currentTracking.isVocal ? '#5eead4' : '#e8e6e1', padding:'2px 8px', borderRadius:20 }}>Mouth {(currentTracking.mouthOpenness*100).toFixed(0)}% • Energy {(currentTracking.energy*100).toFixed(0)}%</span>}
              </div>
              <div style={{ display:'flex', gap:6 }}>
                {[0.5,1,1.25].map(r => (<button key={r} onClick={() => { setPlaybackRate(r); if (videoRef.current) videoRef.current.playbackRate = r }} style={{ fontSize:11, padding:'4px 8px', borderRadius:7, background: playbackRate===r ? 'rgba(255,90,95,0.2)' : 'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.08)', color: playbackRate===r ? '#ff8a6b' : '#e8e6e1', cursor:'pointer' }}>{r}x</button>))}
              </div>
            </div>
            
            <div className="timeline-track" style={{ height:36, background:'#151821', borderRadius:8, position:'relative', overflow:'hidden', border:'1px solid rgba(255,255,255,0.06)' }} onClick={e => { if (!videoRef.current || !duration) return; const rect = e.currentTarget.getBoundingClientRect(); const pct = (e.clientX - rect.left) / rect.width; videoRef.current.currentTime = pct * duration }}>
              <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'flex-end', gap:1, padding:'0 2px', opacity:0.5 }}>
                {energyData.length > 0 ? energyData.slice(0,200).map((en,i) => {
                  const isVocal = vocalSegments.some(v => en.t >= v.start && en.t <= v.end)
                  const h = 4 + en.v * 28
                  return <div key={i} style={{ flex:1, height:h, background: isVocal ? '#5eead4' : '#2a2d36', borderRadius:2, opacity: isVocal ? 0.9 : 0.3 }} />
                }) : Array.from({ length:180 }).map((_, i) => {
                  const h = 4 + Math.abs(Math.sin(i*0.12 + currentTime))*18
                  return <div key={i} style={{ flex:1, height:h, background: i/180 < currentTime/duration ? '#ff5a5f' : '#2a2d36', borderRadius:2 }} />
                })}
              </div>
              
              {trackingData.length > 0 && (
                <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'flex-start', gap:1, padding:'0 2px', opacity:0.6, top:2 }}>
                  {trackingData.filter((_,i) => i % 2 === 0).slice(0,100).map((td,i) => (
                    <div key={i} style={{ flex:1, height:`${td.mouthOpenness*12+2}px`, background: td.isVocal ? '#f5d06a' : '#3a3d46', borderRadius:1 }} />
                  ))}
                </div>
              )}
              
              {phrases.map(p => (
                <div key={p.id} style={{ position:'absolute', left:`${(p.start/duration)*100}%`, width:`${Math.max(1.5, (p.end-p.start)/duration*100)}%`, top:20, bottom:2, background: activePhrase?.id===p.id ? 'rgba(255,90,95,0.45)' : 'rgba(245,208,106,0.28)', border: activePhrase?.id===p.id ? '1px solid rgba(255,90,95,0.8)' : '1px solid rgba(245,208,106,0.4)', borderRadius:5, display:'flex', alignItems:'center', padding:'0 4px', fontSize:9, whiteSpace:'nowrap', overflow:'hidden', color: activePhrase?.id===p.id ? '#fff' : '#f5d06a', cursor:'pointer', fontWeight: activePhrase?.id===p.id ? 700 : 400 }} onClick={e => { e.stopPropagation(); if (videoRef.current) videoRef.current.currentTime = p.start + 0.05 }}>{p.text.slice(0,24)}</div>
              ))}
              
              {vocalSegments.map((v,i) => (
                <div key={i} style={{ position:'absolute', left:`${(v.start/duration)*100}%`, width:`${(v.end-v.start)/duration*100}%`, top:0, height:6, background:'rgba(94,234,212,0.5)', borderRadius:3 }} />
              ))}
              
              <div style={{ position:'absolute', left:`${(currentTime/duration)*100}%`, top:0, bottom:0, width:2, background:'#ff5a5f', boxShadow:'0 0 10px #ff5a5f', zIndex:5 }}><div style={{ position:'absolute', top:-4, left:'50%', transform:'translateX(-50%)', width:10, height:10, borderRadius:'50%', background:'#ff5a5f', border:'2px solid #07080b' }} /></div>
            </div>
            
            <div style={{ display:'flex', gap:8, fontSize:11, opacity:0.6 }}>
              <span style={{ color:'#5eead4' }}>● Vocal segments • {vocalSegments.length}</span>
              <span>•</span>
              <span style={{ color:'#f5d06a' }}>● Mouth openness</span>
              <span>•</span>
              <span>Energy • Lip-sync corrected</span>
              <span>•</span>
              <span>Press SPACE in tap sync</span>
            </div>
          </div>
          
          <video ref={videoRef} src={videoUrl || undefined} crossOrigin="anonymous" playsInline muted={false} style={{ display:'none' }} />
        </div>
        
        {/* Right */}
        <div style={{ borderLeft:'1px solid #1a1d26', overflowY:'auto', padding:18, display:'flex', flexDirection:'column', gap:18, background:'#0c0e12' }}>
          <div className="glass" style={{ borderRadius:16, padding:16, border:'1px solid rgba(94,234,212,0.18)' }}>
            <div style={{ fontWeight:600, marginBottom:12, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span>🎤 Lip-Sync Correction</span>
              <span style={{ fontSize:10, padding:'3px 8px', borderRadius:20, background:'rgba(94,234,212,0.15)', color:'#5eead4' }}>{phrases.length} phrases • {phrases.reduce((a,p) => a+p.words.length,0)} words</span>
            </div>
            
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:12 }}>
              <button onClick={() => { if (vocalSegments.length) autoSyncToVocals(vocalSegments, duration) }} className="btn-primary" style={{ fontSize:11, padding:'8px 10px' }}>🤖 Auto AI Sync</button>
              <button onClick={startTapSync} className="btn-ghost" style={{ fontSize:11, padding:'8px 10px', background:'rgba(245,208,106,0.12)', borderColor:'rgba(245,208,106,0.2)', color:'#f5d06a' }}>👆 Tap Sync Wizard</button>
            </div>
            
            <div style={{ display:'flex', gap:6, marginBottom:12 }}>
              {[{ id:'auto-lip', label:'Lip-Sync' }, { id:'tap', label:'Tap' }, { id:'manual', label:'Manual' }].map(m => (
                <button key={m.id} onClick={() => setLyricSyncMode(m.id)} style={{ flex:1, padding:'7px 8px', borderRadius:8, fontSize:11, fontWeight:500, background: lyricSyncMode===m.id ? 'rgba(94,234,212,0.18)' : 'rgba(255,255,255,0.05)', border: lyricSyncMode===m.id ? '1px solid rgba(94,234,212,0.35)' : '1px solid rgba(255,255,255,0.06)', color: lyricSyncMode===m.id ? '#5eead4' : '#e8e6e1', cursor:'pointer' }}>{m.label}</button>
              ))}
            </div>
            
            <div style={{ background:'rgba(0,0,0,0.3)', borderRadius:10, padding:10, marginBottom:12 }}>
              <div style={{ fontSize:11, fontWeight:600, marginBottom:6, color:'#5eead4' }}>HOW LIP-SYNC FIX WORKS:</div>
              <div style={{ fontSize:11, opacity:0.8, lineHeight:1.5 }}>
                1. <strong>Audio Energy Analysis:</strong> Decodes audio, finds vocal segments (high energy) vs instrumental<br/>
                2. <strong>Mouth Openness Tracking:</strong> Face mesh detects lip distance — aligns lyrics when mouth opens<br/>
                3. <strong>Word-Level Karaoke:</strong> Each word has its own start/end, highlights current word in gold<br/>
                4. <strong>Tap Sync:</strong> Play video, tap SPACE exactly when you hear each phrase — perfect manual correction
              </div>
            </div>
            
            <div style={{ display:'flex', flexDirection:'column', gap:8, maxHeight:420, overflowY:'auto', paddingRight:4 }}>
              {phrases.map(p => {
                const isActive = activePhrase?.id===p.id
                const isVocalMatch = vocalSegments.some(v => p.start >= v.start -0.2 && p.start <= v.end +0.2)
                return (
                  <div key={p.id} className={`phrase-card ${isActive ? 'active' : ''} ${isVocalMatch ? 'correct' : ''}`} style={{ cursor:'pointer', borderColor: isActive ? 'rgba(255,90,95,0.6)' : isVocalMatch ? 'rgba(94,234,212,0.4)' : 'rgba(255,255,255,0.06)' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
                      <div style={{ fontSize:12, fontWeight:500, lineHeight:1.4, flex:1 }}>{p.text}</div>
                      <div style={{ display:'flex', gap:4 }}>
                        <button onClick={e => { e.stopPropagation(); nudgePhrase(p.id, -0.1) }} style={{ fontSize:10, padding:'3px 6px', borderRadius:6, background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.08)', color:'#e8e6e1', cursor:'pointer' }}>◀ -0.1</button>
                        <button onClick={e => { e.stopPropagation(); nudgePhrase(p.id, 0.1) }} style={{ fontSize:10, padding:'3px 6px', borderRadius:6, background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.08)', color:'#e8e6e1', cursor:'pointer' }}>+0.1 ▶</button>
                      </div>
                    </div>
                    
                    <div style={{ marginTop:6, display:'flex', gap:4, flexWrap:'wrap' }}>
                      {p.words.map(w => {
                        const isCurrentWord = activeWord?.id === w.id
                        return (
                          <span key={w.id} style={{ fontSize:10, padding:'2px 6px', borderRadius:12, background: isCurrentWord ? '#f5d06a' : 'rgba(255,255,255,0.06)', color: isCurrentWord ? '#07080b' : '#e8e6e1', border: isCurrentWord ? '1px solid #f5d06a' : '1px solid rgba(255,255,255,0.08)', fontWeight: isCurrentWord ? 700 : 400 }}>
                            {w.text}
                          </span>
                        )
                      })}
                    </div>
                    
                    <div style={{ display:'flex', gap:8, marginTop:8, alignItems:'center' }}>
                      <input type="number" step="0.05" value={p.start.toFixed(2)} onChange={e => updatePhraseTiming(p.id, 'start', e.target.value)} style={{ width:62, background:'rgba(0,0,0,0.3)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:6, padding:'4px 6px', fontSize:11, color:'#e8e6e1' }} />
                      <span style={{ fontSize:11, opacity:0.5 }}>→</span>
                      <input type="number" step="0.05" value={p.end.toFixed(2)} onChange={e => updatePhraseTiming(p.id, 'end', e.target.value)} style={{ width:62, background:'rgba(0,0,0,0.3)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:6, padding:'4px 6px', fontSize:11, color:'#e8e6e1' }} />
                      <span style={{ fontSize:10, padding:'3px 6px', borderRadius:6, background: isVocalMatch ? 'rgba(94,234,212,0.15)' : 'rgba(255,90,95,0.15)', color: isVocalMatch ? '#5eead4' : '#ff8a6b' }}>{isVocalMatch ? '✓ Vocal' : '○ No vocal'}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
          
          <div className="glass" style={{ borderRadius:16, padding:16 }}>
            <div style={{ fontWeight:600, marginBottom:12 }}>Typography • Karaoke</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
              <div>
                <div style={{ fontSize:11, opacity:0.7, marginBottom:4 }}>Font</div>
                <select value={typoControls.fontFamily} onChange={e => setTypoControls(prev => ({ ...prev, fontFamily:e.target.value }))} style={{ width:'100%', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:8, padding:'7px 8px', fontSize:12, color:'#e8e6e1' }}>
                  <option value="Outfit">Outfit • Modern</option>
                  <option value="Syne">Syne • Display</option>
                  <option value="Space Grotesk">Space Grotesk</option>
                </select>
              </div>
              <div>
                <div style={{ fontSize:11, opacity:0.7, marginBottom:4 }}>Size</div>
                <input type="range" min="32" max="84" value={typoControls.size} onChange={e => setTypoControls(prev => ({ ...prev, size:parseInt(e.target.value) }))} style={{ width:'100%' }} />
              </div>
            </div>
            <div style={{ display:'flex', gap:8, marginBottom:12 }}>
              {[{ key:'karaokeMode', label:'Karaoke Word Highlight' }, { key:'lipSyncHighlight', label:'Lip-Sync Gold' }].map(t => (
                <label key={t.key} style={{ flex:1, display:'flex', alignItems:'center', gap:6, padding:'7px 8px', borderRadius:8, background: typoControls[t.key] ? 'rgba(94,234,212,0.15)' : 'rgba(255,255,255,0.05)', border: typoControls[t.key] ? '1px solid rgba(94,234,212,0.3)' : '1px solid rgba(255,255,255,0.06)', fontSize:11, cursor:'pointer' }}>
                  <input type="checkbox" checked={typoControls[t.key]} onChange={e => setTypoControls(prev => ({ ...prev, [t.key]: e.target.checked }))} style={{ accentColor:'#5eead4' }} />{t.label}
                </label>
              ))}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              <div><div style={{ fontSize:11, opacity:0.7, marginBottom:4 }}>Primary</div><div style={{ display:'flex', alignItems:'center', gap:6, background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:8, padding:'6px 8px' }}><input type="color" value={typoControls.primaryColor} onChange={e => setTypoControls(prev => ({ ...prev, primaryColor:e.target.value }))} style={{ width:18, height:18, border:'none', background:'transparent' }} /><span style={{ fontSize:11, fontFamily:'monospace' }}>{typoControls.primaryColor}</span></div></div>
              <div><div style={{ fontSize:11, opacity:0.7, marginBottom:4 }}>Current Word</div><div style={{ display:'flex', alignItems:'center', gap:6, background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:8, padding:'6px 8px' }}><input type="color" value={typoControls.goldColor} onChange={e => setTypoControls(prev => ({ ...prev, goldColor:e.target.value }))} style={{ width:18, height:18, border:'none', background:'transparent' }} /><span style={{ fontSize:11, fontFamily:'monospace' }}>{typoControls.goldColor}</span></div></div>
            </div>
          </div>
          
          <div className="glass" style={{ borderRadius:16, padding:16, border:'1px solid rgba(245,208,106,0.18)' }}>
            <div style={{ fontWeight:600, marginBottom:10, display:'flex', alignItems:'center', gap:8 }}><span>🎬 Professional Render</span><span style={{ fontSize:10, padding:'3px 8px', borderRadius:20, background:'rgba(94,234,212,0.15)', color:'#5eead4' }}>SYNCED ✓</span></div>
            
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:10 }}>
              <div>
                <div style={{ fontSize:11, opacity:0.7, marginBottom:4 }}>Quality</div>
                <select value={renderQuality} onChange={e => setRenderQuality(e.target.value)} style={{ width:'100%', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:8, padding:'7px 8px', fontSize:12, color:'#e8e6e1' }}>
                  <option value="high">High • 8 Mbps</option>
                  <option value="ultra">Ultra • 16 Mbps</option>
                  <option value="8k">8K Master • 40 Mbps</option>
                </select>
              </div>
              <div>
                <div style={{ fontSize:11, opacity:0.7, marginBottom:4 }}>Format</div>
                <select value={renderMode} onChange={e => setRenderMode(e.target.value)} style={{ width:'100%', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:8, padding:'7px 8px', fontSize:12, color:'#e8e6e1' }}>
                  <option value="realtime">WebM • Fast</option>
                  <option value="mp4">MP4 • ffmpeg.wasm</option>
                </select>
              </div>
            </div>
            
            <div style={{ background:'rgba(0,0,0,0.3)', borderRadius:8, padding:8, marginBottom:10, fontSize:10, lineHeight:1.4 }}>
              <div style={{ display:'flex', justifyContent:'space-between', opacity:0.7 }}><span>Resolution</span><span style={{ fontFamily:'monospace', color:'#5eead4' }}>{exportRes}</span></div>
              <div style={{ display:'flex', justifyContent:'space-between', opacity:0.7 }}><span>Tracking</span><span style={{ fontFamily:'monospace' }}>{trackingData.length} frames</span></div>
              <div style={{ display:'flex', justifyContent:'space-between', opacity:0.7 }}><span>Vocals</span><span style={{ fontFamily:'monospace' }}>{vocalSegments.length} segments</span></div>
              <div style={{ display:'flex', justifyContent:'space-between', opacity:0.7 }}><span>Lip-Sync</span><span style={{ color:'#5eead4' }}>Karaoke + Mouth ✓</span></div>
            </div>
            
            <button className="btn-primary" style={{ width:'100%', justifyContent:'center', display:'flex', alignItems:'center', gap:8, padding:'12px 16px', fontSize:13, fontWeight:700 }} onClick={handleExport} disabled={!videoUrl || isExporting}>
              {isExporting ? `● RENDERING ${exportProgress}%` : `⬇ RENDER ${exportRes} • ${renderMode.toUpperCase()}`}
            </button>
            
            {renderLogs.length > 0 && (
              <div style={{ marginTop:10, background:'#07080b', border:'1px solid rgba(255,255,255,0.08)', borderRadius:8, padding:8, maxHeight:120, overflowY:'auto', fontFamily:'monospace', fontSize:10, lineHeight:1.5 }}>
                {renderLogs.map((log,i) => (
                  <div key={i} style={{ color: log.includes('✓') ? '#5eead4' : log.includes('Failed') || log.includes('error') ? '#ff5a5f' : log.includes('▶') ? '#f5d06a' : '#e8e6e1', opacity: log.includes('Recorded') ? 0.7 : 1 }}>
                    {log.includes('✓') ? '✅ ' : log.includes('▶') ? '▶ ' : '• '}{log}
                  </div>
                ))}
              </div>
            )}
            
            {isExporting && (
              <div style={{ marginTop:10, height:6, background:'#1a1d26', borderRadius:6, overflow:'hidden' }}>
                <div style={{ height:'100%', width:`${exportProgress}%`, background:'linear-gradient(90deg,#ff5a5f,#f5d06a,#5eead4)', transition:'width 0.3s', boxShadow:'0 0 10px rgba(255,90,95,0.5)' }} />
              </div>
            )}
            
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginTop:10 }}>
              <button className="btn-ghost" style={{ fontSize:11, padding:'8px 10px' }} onClick={() => { const dataStr = JSON.stringify({ trackingData, phrases, vocalSegments, energyData, colorControls, typoControls, syncOffset, exportRes }, null, 2); const blob = new Blob([dataStr], { type:'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `chatcut-lipsync-${Date.now()}.json`; a.click() }}>Export JSON</button>
              <button className="btn-ghost" style={{ fontSize:11, padding:'8px 10px' }} onClick={() => { if (videoRef.current) { videoRef.current.currentTime = 0; videoRef.current.play(); setIsPlaying(true) } }}>Preview Full</button>
            </div>
            
            <div style={{ marginTop:10, fontSize:10, opacity:0.5, lineHeight:1.4, textAlign:'center' }}>
              Professional pipeline: 9:16 reframing + tropical grade + karaoke lyrics + audio preserved. For true 8K ProRes, export JSON + use DaVinci Resolve.
            </div>
          </div>
        </div>
      </div>
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
