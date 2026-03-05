<template>
  <div class="knob-wrapper">
    <div class="knob" :class="{ dragging: isDragging }" @mousedown="startDrag" @touchstart.prevent="startTouchDrag"
      @dblclick="reset" :title="`${label}: ${displayValue}`">
      <svg viewBox="0 0 60 60" class="knob-svg">
        <!-- Track arc -->
        <path :d="trackPath" class="knob-track" />
        <!-- Value arc -->
        <path :d="valuePath" class="knob-value" :style="{ stroke: color }" />
        <!-- Indicator dot -->
        <circle :cx="indicatorX" :cy="indicatorY" r="3" class="knob-indicator" :style="{ fill: color }" />
        <!-- Center cap -->
        <circle cx="30" cy="30" r="11" class="knob-cap" />
      </svg>
    </div>
    <span class="knob-label">{{ label }}</span>
    <span class="knob-value-label">{{ displayValue }}</span>
  </div>
</template>

<script setup>
import { ref, computed, onUnmounted } from 'vue'

const props = defineProps({
  modelValue: { type: Number, default: 0 },
  min: { type: Number, default: 0 },
  max: { type: Number, default: 1 },
  step: { type: Number, default: 0 },
  default: { type: Number, default: null },
  label: { type: String, default: '' },
  color: { type: String, default: '#7c6fff' },
  unit: { type: String, default: '' },
  decimals: { type: Number, default: 2 },
})

const emit = defineEmits(['update:modelValue'])

const isDragging = ref(false)
let startY = 0
let startValue = 0

// ---------------------------------------------------------------------------
// SVG geometry — sweep from -225° to +45° (270° total range)
// ---------------------------------------------------------------------------
const START_ANGLE = 225  // degrees from 12-o'clock, clockwise = +
const END_ANGLE = 315  // degrees total sweep

const DEG = Math.PI / 180
const R = 23  // arc radius
const CX = 30
const CY = 30

function polarToXY(angleDeg) {
  // 0° = top (12 o'clock), positive = clockwise
  const rad = (angleDeg - 90) * DEG
  return { x: CX + R * Math.cos(rad), y: CY + R * Math.sin(rad) }
}

function describeArc(startDeg, endDeg) {
  const s = polarToXY(startDeg)
  const e = polarToXY(endDeg)
  const sweep = endDeg - startDeg
  const large = sweep > 180 ? 1 : 0
  return `M ${s.x} ${s.y} A ${R} ${R} 0 ${large} 1 ${e.x} ${e.y}`
}

const normalized = computed(() =>
  (props.modelValue - props.min) / (props.max - props.min)
)

const currentAngle = computed(() =>
  -START_ANGLE + normalized.value * END_ANGLE
)

const trackPath = computed(() =>
  describeArc(-START_ANGLE, -START_ANGLE + END_ANGLE)
)

const valuePath = computed(() => {
  const endAngle = -START_ANGLE + normalized.value * END_ANGLE
  if (Math.abs(endAngle - (-START_ANGLE)) < 0.5) return ''
  return describeArc(-START_ANGLE, endAngle)
})

const indicatorX = computed(() => {
  const rad = (currentAngle.value - 90) * DEG
  return CX + R * Math.cos(rad)
})

const indicatorY = computed(() => {
  const rad = (currentAngle.value - 90) * DEG
  return CY + R * Math.sin(rad)
})

const displayValue = computed(() => {
  const v = props.modelValue
  const d = props.decimals
  return props.unit
    ? `${v.toFixed(d)}${props.unit}`
    : v.toFixed(d)
})

// ---------------------------------------------------------------------------
// Drag interaction
// ---------------------------------------------------------------------------
function clamp(v) {
  let val = Math.max(props.min, Math.min(props.max, v))
  if (props.step > 0) val = Math.round((val - props.min) / props.step) * props.step + props.min
  return val
}

function startDrag(e) {
  isDragging.value = true
  startY = e.clientY
  startValue = props.modelValue
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', stopDrag)
}

function startTouchDrag(e) {
  isDragging.value = true
  startY = e.touches[0].clientY
  startValue = props.modelValue
  window.addEventListener('touchmove', onTouchMove)
  window.addEventListener('touchend', stopDrag)
}

function onMove(e) {
  const delta = (startY - e.clientY) / 300
  emit('update:modelValue', clamp(startValue + delta * (props.max - props.min)))
}

function onTouchMove(e) {
  const delta = (startY - e.touches[0].clientY) / 150
  emit('update:modelValue', clamp(startValue + delta * (props.max - props.min)))
}

function stopDrag() {
  isDragging.value = false
  window.removeEventListener('mousemove', onMove)
  window.removeEventListener('mouseup', stopDrag)
  window.removeEventListener('touchmove', onTouchMove)
  window.removeEventListener('touchend', stopDrag)
}

function reset() {
  const def = props.default !== null ? props.default : (props.min + props.max) / 2
  emit('update:modelValue', def)
}

onUnmounted(stopDrag)
</script>

<style scoped>
.knob-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  user-select: none;
}

.knob {
  width: 60px;
  height: 60px;
  cursor: ns-resize;
  position: relative;
  transition: filter 0.15s;
}

.knob:hover {
  filter: brightness(1.15);
}

.knob.dragging {
  filter: brightness(1.3);
  cursor: grabbing;
}

.knob-svg {
  width: 100%;
  height: 100%;
}

.knob-track {
  fill: none;
  stroke: #2a2a3a;
  stroke-width: 4;
  stroke-linecap: round;
}

.knob-value {
  fill: none;
  stroke-width: 4;
  stroke-linecap: round;
  filter: drop-shadow(0 0 4px currentColor);
}

.knob-indicator {
  filter: drop-shadow(0 0 3px currentColor);
}

.knob-cap {
  fill: #1e1e2e;
  stroke: #3a3a4e;
  stroke-width: 1.5;
}

.knob-label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #8888aa;
}

.knob-value-label {
  font-size: 9px;
  color: #5a5a7a;
  font-family: 'JetBrains Mono', monospace;
}
</style>
