<template>
  <div class="scope-widget">

    <div class="scope-header">
      <span class="scope-title">SCOPE</span>
      <div class="scope-stats">
        <span class="stat">{{ displayFreqLabel }}</span>
        <span class="stat-sep">/</span>
        <span class="stat">{{ cyclesLabel }}</span>
      </div>
      <!-- Octave-zoom buttons -->
      <div class="octave-strip">
        <button class="oct-btn" @click="octaveShift = Math.max(-3, octaveShift - 1)">−</button>
        <span class="oct-label">OCT {{ octaveShift >= 0 ? '+' : '' }}{{ octaveShift }}</span>
        <button class="oct-btn" @click="octaveShift = Math.min(3, octaveShift + 1)">+</button>
      </div>
    </div>

    <!-- Canvas -->
    <div class="canvas-wrap" ref="canvasWrap">
      <canvas ref="canvas" class="scope-canvas" />
    </div>

    <!-- Controls -->
    <div class="scope-controls">
      <Knob v-model="hue" :min="0" :max="360" :default="270" :decimals="0" unit="°" label="Color"
        :color="accentColor" />
      <Knob v-model="blurAmount" :min="0" :max="24" :default="6" :decimals="1" label="Blur" :color="accentColor" />
      <Knob v-model="smoothness" :min="0" :max="1" :default="0.3" :decimals="2" label="Smooth" :color="accentColor" />
    </div>

  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import Knob from './Knob.vue'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
const props = defineProps({
  /** AnalyserNode already connected to the audio graph */
  analyser: { type: Object, default: null },
  /** AudioContext — needed for currentTime to gate redraws */
  audioCtx: { type: Object, default: null },
  /** Currently playing fundamental frequency in Hz */
  currentFreq: { type: Number, default: 440 },
})

// ---------------------------------------------------------------------------
// Internal controls
// ---------------------------------------------------------------------------
const octaveShift = ref(0)    // integer, shifts display frequency by octaves
const hue = ref(270)  // 0–360
const blurAmount = ref(6)    // canvas shadow blur radius
const smoothness = ref(0.3)  // 0 = raw samples, 1 = heavily averaged

// ---------------------------------------------------------------------------
// Derived
// ---------------------------------------------------------------------------
const accentColor = computed(() => `hsl(${hue.value}, 80%, 65%)`)
const accentDim = computed(() => `hsl(${hue.value}, 60%, 40%)`)

/** The frequency the scope is locked to (fundamental × 2^octaveShift) */
const displayFreq = computed(() =>
  (props.currentFreq || 440) * Math.pow(2, octaveShift.value)
)

/** How many cycles we show per frame — always 2 cycles of the display freq */
const CYCLES = 2

const displayFreqLabel = computed(() => {
  const f = displayFreq.value
  return f >= 1000 ? `${(f / 1000).toFixed(2)} kHz` : `${f.toFixed(1)} Hz`
})

const cyclesLabel = computed(() => `${CYCLES} cyc`)

// ---------------------------------------------------------------------------
// Canvas refs
// ---------------------------------------------------------------------------
const canvas = ref(null)
const canvasWrap = ref(null)
let ctx2d = null

// ---------------------------------------------------------------------------
// Ring buffer for sample history
// ---------------------------------------------------------------------------
const SR = 44100        // must match AudioContext sampleRate
const BUF_SIZE = 8192         // analyser fftSize
let analyserBuf = null

// ---------------------------------------------------------------------------
// Frame scheduling
// ---------------------------------------------------------------------------
let rafId = null
let lastDrawTime = -Infinity  // in AudioContext.currentTime seconds

/**
 * Period of one display cycle in seconds.
 * We gate redraws so a new frame only starts after this much time has elapsed.
 */
function getDisplayPeriod() {
  return CYCLES / Math.max(displayFreq.value, 1)
}

// ---------------------------------------------------------------------------
// Smoothing helpers
// ---------------------------------------------------------------------------

/**
 * Box-filter the waveform buffer in-place (writes to `out`).
 * @param {Float32Array} src  source samples
 * @param {Float32Array} out  destination (same length)
 * @param {number}       r    half-window radius in samples (0 = bypass)
 */
function boxSmooth(src, out, r) {
  if (r === 0) { out.set(src); return }
  const N = src.length
  for (let i = 0; i < N; i++) {
    let sum = 0, cnt = 0
    for (let j = i - r; j <= i + r; j++) {
      if (j >= 0 && j < N) { sum += src[j]; cnt++ }
    }
    out[i] = sum / cnt
  }
}

// ---------------------------------------------------------------------------
// Draw one frame
// ---------------------------------------------------------------------------
function drawFrame() {
  const c = canvas.value
  const analyser = props.analyser
  if (!c || !ctx2d || !analyser) return

  const W = c.width
  const H = c.height
  const cy = H / (devicePixelRatio * 2)

  // --- Fetch samples -------------------------------------------------------
  if (!analyserBuf || analyserBuf.length !== analyser.fftSize) {
    analyserBuf = new Float32Array(analyser.fftSize)
  }
  analyser.getFloatTimeDomainData(analyserBuf)

  // --- How many samples = CYCLES of the display freq ----------------------
  const samplesNeeded = Math.min(
    Math.round(SR / Math.max(displayFreq.value, 1) * CYCLES),
    analyserBuf.length - 2
  )

  // --- Find positive zero-crossing trigger ---------------------------------
  let trigger = 0
  const searchLimit = Math.min(analyserBuf.length - samplesNeeded, Math.round(SR / 10))
  for (let i = 1; i < searchLimit; i++) {
    if (analyserBuf[i - 1] <= 0 && analyserBuf[i] > 0) {
      trigger = i
      break
    }
  }

  // --- Smooth the window of samples we'll display --------------------------
  const window = analyserBuf.subarray(trigger, trigger + samplesNeeded)
  const radius = Math.round(smoothness.value * 12)
  const smooth = new Float32Array(samplesNeeded)
  boxSmooth(window, smooth, radius)

  // --- Render --------------------------------------------------------------
  // Clear with slight trail effect for phosphor feel
  ctx2d.fillStyle = 'rgba(10, 10, 20, 0.88)'
  ctx2d.fillRect(0, 0, W, H)

  // Grid
  ctx2d.strokeStyle = '#15152a'
  ctx2d.lineWidth = 1
  ctx2d.beginPath()
  ctx2d.moveTo(0, cy); ctx2d.lineTo(W, cy)
  ctx2d.stroke()
  // Vertical cycle markers
  for (let c_ = 0; c_ <= CYCLES; c_++) {
    const x = (c_ / CYCLES) * W
    ctx2d.beginPath()
    ctx2d.moveTo(x, 0); ctx2d.lineTo(x, H)
    ctx2d.stroke()
  }

  // Glow + waveform
  const glow = accentColor.value
  const dim = accentDim.value

  // Outer glow pass (thick, low opacity)
  if (blurAmount.value > 0) {
    ctx2d.save()
    ctx2d.shadowColor = glow
    ctx2d.shadowBlur = blurAmount.value * 2.5
    ctx2d.strokeStyle = glow
    ctx2d.globalAlpha = 0.25
    ctx2d.lineWidth = blurAmount.value * 0.6 + 1
    ctx2d.beginPath()
    _tracePath(ctx2d, smooth, W, H, cy)
    ctx2d.stroke()
    ctx2d.restore()
  }

  // Main line pass
  ctx2d.save()
  ctx2d.shadowColor = glow
  ctx2d.shadowBlur = Math.min(blurAmount.value, 14)
  ctx2d.strokeStyle = glow
  ctx2d.lineWidth = 1.6
  ctx2d.lineJoin = 'round'
  ctx2d.lineCap = 'round'
  ctx2d.beginPath()
  _tracePath(ctx2d, smooth, W, H, cy)
  ctx2d.stroke()
  ctx2d.restore()

  // Bright core line(no blur)
  ctx2d.save()
  ctx2d.strokeStyle = `hsl(${hue.value}, 90%, 85%)`
  ctx2d.lineWidth = 0.7
  ctx2d.globalAlpha = 0.7
  ctx2d.beginPath()
  _tracePath(ctx2d, smooth, W, H, cy)
  ctx2d.stroke()
  ctx2d.restore()
}

/**
 * Trace a smooth cardinal-spline path through the sample array.
 * Uses quadratic bezier midpoint method for smooth curves.
 */
function _tracePath(ctx, samples, W, H, cy) {
  const N = samples.length
  if (N < 2) return

  const margin = H / (devicePixelRatio * 2)
  const amp = cy + margin - 50

  // Pre-compute pixel positions
  const xs = new Float32Array(N)
  const ys = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    xs[i] = (i / (N - 1)) * W
    ys[i] = cy - samples[i] * amp
  }

  // Smooth path via quadratic bezier midpoints (no straight lines)
  ctx.moveTo(xs[0], ys[0])
  for (let i = 1; i < N - 1; i++) {
    const mx = (xs[i] + xs[i + 1]) / 2
    const my = (ys[i] + ys[i + 1]) / 2
    ctx.quadraticCurveTo(xs[i], ys[i], mx, my)
  }
  ctx.lineTo(xs[N - 1], ys[N - 1])
}

// ---------------------------------------------------------------------------
// RAF loop — gated to display period
// ---------------------------------------------------------------------------
function rafLoop(timestamp) {
  rafId = requestAnimationFrame(rafLoop)

  const audioTime = props.audioCtx?.currentTime ?? (timestamp / 1000)
  const period = getDisplayPeriod()

  if (audioTime - lastDrawTime >= period) {
    lastDrawTime = audioTime
    drawFrame()
  }
}

// ---------------------------------------------------------------------------
// Resize handling
// ---------------------------------------------------------------------------
let resizeObs = null

function syncCanvasSize() {
  const wrap = canvasWrap.value
  const c = canvas.value
  if (!wrap || !c) return
  const dpr = window.devicePixelRatio || 1
  const w = wrap.clientWidth
  const h = wrap.clientHeight
  if (c.width !== w * dpr || c.height !== h * dpr) {
    c.width = w * dpr
    c.height = h * dpr
    c.style.width = `${w}px`
    c.style.height = `${h}px`
    ctx2d = c.getContext('2d')
    ctx2d.scale(dpr, dpr)
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------
onMounted(() => {
  syncCanvasSize()
  ctx2d = canvas.value?.getContext('2d')

  resizeObs = new ResizeObserver(syncCanvasSize)
  resizeObs.observe(canvasWrap.value)

  rafId = requestAnimationFrame(rafLoop)
})

onUnmounted(() => {
  if (rafId) cancelAnimationFrame(rafId)
  resizeObs?.disconnect()
})

// Re-sync size if analyser becomes available later
watch(() => props.analyser, () => { lastDrawTime = -Infinity })
watch(() => props.currentFreq, () => { lastDrawTime = -Infinity })
</script>

<style scoped>
.scope-widget {
  background: #0d0d1c;
  border: 1px solid #1e1e32;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Header */
.scope-header {
  display: flex;
  align-items: center;
  padding: 8px 14px 6px;
  gap: 10px;
  border-bottom: 1px solid #141428;
}

.scope-title {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: #3a3a5a;
  flex-shrink: 0;
}

.scope-stats {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
}

.stat {
  font-size: 9px;
  font-family: 'JetBrains Mono', monospace;
  color: #4a4a6a;
}

.stat-sep {
  font-size: 8px;
  color: #2a2a4a;
}

/* Octave control */
.octave-strip {
  display: flex;
  align-items: center;
  gap: 6px;
}

.oct-btn {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  border: 1px solid #2a2a3a;
  background: #181828;
  color: #6666aa;
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.12s;
  line-height: 1;
  padding: 0;
}

.oct-btn:hover {
  background: #22223a;
  border-color: #4a4a7a;
  color: #aaaadd;
}

.oct-label {
  font-size: 9px;
  font-family: 'JetBrains Mono', monospace;
  color: #5a5a7a;
  min-width: 44px;
  text-align: center;
}

/* Canvas */
.canvas-wrap {
  width: 100%;
  height: 240px;
  position: relative;
  background: #0a0a14;
}

.scope-canvas {
  position: absolute;
  inset: 0;
  display: block;
}

/* Controls */
.scope-controls {
  display: flex;
  justify-content: space-around;
  padding: 10px 16px 10px;
  border-top: 1px solid #141428;
  background: #0d0d1c;
}
</style>
