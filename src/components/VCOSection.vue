<template>
  <div class="vco" :class="{ active: isPlaying }">
    <div class="vco-header">
      <span class="vco-title">VCO {{ index + 1 }}</span>
      <div class="vco-led" :class="{ on: isPlaying }" />
    </div>

    <!-- Waveform selector -->
    <div class="waveform-row">
      <button v-for="(wf, i) in waveforms" :key="i" class="wf-btn" :class="{ selected: modelValue.waveform === i }"
        @click="emit('update:modelValue', { ...modelValue, waveform: i })" :title="wf.label">
        <svg viewBox="0 0 32 20" class="wf-icon">
          <path :d="wf.path" class="wf-path" />
        </svg>
        <span class="wf-label">{{ wf.label }}</span>
      </button>
    </div>

    <!-- Knobs row -->
    <div class="knobs-row">
      <Knob :modelValue="modelValue.level"
        @update:modelValue="v => emit('update:modelValue', { ...modelValue, level: v })" :min="0" :max="1"
        :default="0.5" label="Level" :color="color" :decimals="2" />
      <Knob :modelValue="modelValue.phaseOffset"
        @update:modelValue="v => emit('update:modelValue', { ...modelValue, phaseOffset: v })" :min="0.00" :max="1.00"
        :default="0" label="Phase Offset" :color="color" :decimals="2" />
      <Knob :modelValue="modelValue.distortion"
        @update:modelValue="v => emit('update:modelValue', { ...modelValue, distortion: v })" :min="-1.00" :max="1.00"
        :default="0" label="Mod" :color="modColor" :decimals="2" />
      <Knob :modelValue="modelValue.detune"
        @update:modelValue="v => emit('update:modelValue', { ...modelValue, detune: v })" :min="-1200" :max="1200"
        :default="0" label="Detune" color="#44ddbb" :decimals="0" :step="1" />
      <Knob :modelValue="modelValue.octave"
        @update:modelValue="v => emit('update:modelValue', { ...modelValue, octave: v })" :min="-4" :max="4"
        :default="0" label="Octave" color="#ffaa44" :decimals="0" :step="1" />
    </div>

    <!-- Mini waveform preview -->
    <div class="wave-preview">
      <svg viewBox="0 0 120 40" class="preview-svg">
        <path :d="previewPath" class="preview-path" :style="{ stroke: color }" />
      </svg>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import Knob from './Knob.vue'
import { WAVEFORM } from '../dsp/pdsynth.js'

const props = defineProps({
  modelValue: {
    type: Object,
    default: () => ({ waveform: 0, level: 0.5, distortion: 0, detune: 0, octave: 0, phaseOffset: 0 }),
  },
  index: { type: Number, default: 0 },
  isPlaying: { type: Boolean, default: false },
  color: { type: String, default: '#7c6fff' },
})

const emit = defineEmits(['update:modelValue'])

const modColor = '#ff6b9d'

const waveforms = [
  {
    label: 'Sine',
    path: 'M 2 10 C 6 10 6 2 10 2 C 14 2 14 18 18 18 C 22 18 22 10 26 10',
  },
  {
    label: 'Saw',
    path: 'M 2 18 L 12 2 L 12 18 L 22 2 L 22 18 L 28 18',
  },
  {
    label: 'Sqr',
    path: 'M 2 18 L 2 2 L 12 2 L 12 18 L 22 18 L 22 2 L 28 2',
  },
  {
    label: 'Tri',
    path: 'M 2 18 L 9 2 L 16 18 L 23 2 L 28 10',
  },
]

// ---------------------------------------------------------------------------
// Live waveform preview with PD applied
// ---------------------------------------------------------------------------
const previewPath = computed(() => {
  const { waveform, distortion, phaseOffset } = props.modelValue
  const N = 120
  const W = 120
  const H = 40
  const cy = H / 2

  const points = []
  for (let i = 0; i <= N * 2; i++) {
    const phase = (i / N)
    const pdPhase = applyPD((phase + phaseOffset) % 1, distortion)
    const sample = evalWaveform(pdPhase, waveform)
    const x = (i / N) * W
    const y = cy - sample * (cy - 4)
    points.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`)
  }
  return points.join(' ')
})

function applyPD(phase, distortion) {
  const xj = 0.5 * (1 - distortion) + 0.005
  if (phase < xj) return phase * 0.5 / xj
  return 0.5 + (phase - xj) * 0.5 / (1 - xj)
}

function evalWaveform(phase, waveform) {
  switch (waveform) {
    case WAVEFORM.SINE: return Math.sin(2 * Math.PI * phase)
    case WAVEFORM.SAW: return 2 * phase - 1
    case WAVEFORM.SQUARE: return phase < 0.5 ? 1 : -1
    case WAVEFORM.TRIANGLE: return phase < 0.5 ? 4 * phase - 1 : 3 - 4 * phase
    default: return 0
  }
}
</script>

<style scoped>
.vco {
  background: #13131f;
  border: 1px solid #2a2a3a;
  border-radius: 12px;
  padding: 18px 20px 14px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  transition: border-color 0.2s, box-shadow 0.2s;
  min-width: 220px;
}

.vco.active {
  border-color: #4a3fff44;
  box-shadow: 0 0 20px #4a3fff22;
}

.vco-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.vco-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: #5a5a7a;
}

.vco-led {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #2a2a3a;
  transition: background 0.1s, box-shadow 0.1s;
}

.vco-led.on {
  background: #7c6fff;
  box-shadow: 0 0 8px #7c6fff;
}

/* Waveform buttons */
.waveform-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}

.wf-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 8px 4px 6px;
  background: #1a1a2a;
  border: 1px solid #2a2a3a;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
  color: #5a5a7a;
}

.wf-btn:hover {
  background: #22223a;
  border-color: #3a3a5a;
  color: #9999bb;
}

.wf-btn.selected {
  background: #22203a;
  border-color: v-bind(color);
  color: #ccccff;
  box-shadow: 0 0 8px v-bind(color + '44');
}

.wf-icon {
  width: 32px;
  height: 20px;
}

.wf-path {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.wf-label {
  font-size: 8px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

/* Knobs */
.knobs-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

/* Preview */
.wave-preview {
  background: #0d0d1a;
  border-radius: 6px;
  padding: 2px;
  border: 1px solid #1e1e2e;
}

.preview-svg {
  width: 100%;
  display: block;
}

.preview-path {
  fill: none;
  stroke-width: 1.5;
  stroke-linecap: round;
  opacity: 0.85;
  filter: drop-shadow(0 0 3px currentColor);
}
</style>
