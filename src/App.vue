<template>
  <div class="app">
    <header class="app-header">
      <div class="logo">
        <span class="logo-pd">PD</span>
        <span class="logo-synth">SYNTH</span>
      </div>
      <p class="tagline">Phase Distortion Synthesizer</p>
    </header>

    <!-- Init overlay -->
    <div v-if="!initialized" class="init-overlay" @click="initAudio">
      <div class="init-card">
        <div class="init-icon">▶</div>
        <p class="init-title">Click to Start</p>
        <p class="init-sub">Initializes Web Audio API</p>
      </div>
    </div>

    <main v-else class="synth-body">
      <!-- VCO Section -->
      <section class="vcos">
        <VCOSection :modelValue="vco1" :index="0" :isPlaying="isPlaying" color="#7c6fff"
          @update:modelValue="v => onVCOChange(0, v)" />
        <div class="vco-divider" />
        <VCOSection :modelValue="vco2" :index="1" :isPlaying="isPlaying" color="#ff6b9d"
          @update:modelValue="v => onVCOChange(1, v)" />
      </section>

      <!-- Master & ADSR -->
      <section class="master-panel">
        <div class="panel-group">
          <span class="panel-label">MASTER</span>
          <div class="panel-knobs">
            <Knob v-model="masterVolume" @update:modelValue="synth.setMasterVolume($event)" :min="0" :max="1"
              :default="0.75" label="Volume" color="#44ddbb" :decimals="2" />
          </div>
        </div>

        <div class="panel-group">
          <span class="panel-label">ENVELOPE</span>
          <div class="panel-knobs">
            <Knob v-model="adsr.attack" @update:modelValue="v => updateADSR('attack', v)" :min="0.001" :max="2"
              :default="0.01" label="Attack" color="#ffaa44" unit="s" :decimals="3" />
            <Knob v-model="adsr.decay" @update:modelValue="v => updateADSR('decay', v)" :min="0.01" :max="2"
              :default="0.12" label="Decay" color="#ffaa44" unit="s" :decimals="3" />
            <Knob v-model="adsr.sustain" @update:modelValue="v => updateADSR('sustain', v)" :min="0" :max="1"
              :default="0.7" label="Sustain" color="#ffaa44" :decimals="2" />
            <Knob v-model="adsr.release" @update:modelValue="v => updateADSR('release', v)" :min="0.01" :max="3"
              :default="0.3" label="Release" color="#ffaa44" unit="s" :decimals="3" />
          </div>
        </div>
        <div class="panel-group">
          <span class="panel-label">FX</span>
          <div class="panel-knobs">
            <Knob v-model="fx.delayTime" @update:modelValue="v => updateFX('delayTime', v)" :min="0" :max="2000"
              :default="45" label="Delay Time" color="#ffaa44" unit="ms" :decimals="0" />
            <Knob v-model="fx.feedback" @update:modelValue="v => updateFX('feedback', v)" :min="0" :max="1"
              :default="0.7" label="Feedback" color="#ffaa44" unit="%" :decimals="2" />
            <Knob v-model="fx.reverbMix" @update:modelValue="v => updateFX('reverbMix', v)" :min="0" :max="1"
              :default="0.5" label="Reverb Mix" color="#ffaa44" unit="%" :decimals="2" />
          </div>
        </div>
      </section>

      <!-- Oscilloscope -->
      <section class="scope-section">
        <SynthScope :analyser="scopeAnalyser" :audioCtx="synth.ctx" :currentFreq="currentFreq" />
      </section>

      <!-- Keyboard -->
      <section class="keyboard-section">
        <SynthKeyboard @noteOn="onNoteOn" @noteOff="onNoteOff" />
      </section>
    </main>
  </div>
</template>

<script setup>
import { ref, reactive, onUnmounted, onMounted } from 'vue'
import { PDSynth } from './dsp/pdsynth.js'
import { WAVEFORM } from './dsp/pdsynth.js'
import VCOSection from './components/VCOSection.vue'
import SynthKeyboard from './components/SynthKeyboard.vue'
import SynthScope from './components/SynthScope.vue'
import Knob from './components/Knob.vue'

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const initialized = ref(false)
const isPlaying = ref(false)
const currentFreq = ref(440)
const scopeAnalyser = ref(null)

const synth = new PDSynth()

const vco1 = reactive({ waveform: WAVEFORM.TRIANGLE, level: 1.0, distortion: 0, detune: 0, octave: 0, phaseOffset: 0 })
const vco2 = reactive({ waveform: WAVEFORM.TRIANGLE, level: 0.0, distortion: 0, detune: 0, octave: 0, phaseOffset: 0 })

const masterVolume = ref(0.75)

const adsr = reactive({
  attack: 0.01,
  decay: 0.12,
  sustain: 0.7,
  release: 0.3,
})

const fx = reactive({
  delayTime: 45,
  feedback: 0.7,
  reverbMix: 0.5,
})

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
async function initAudio() {
  await synth.init()
  synth.setVCO(0, vco1)
  synth.setVCO(1, vco2)
  synth.setMasterVolume(masterVolume.value)
  synth.setADSR(adsr)
  synth.setFX(fx)
  // Create analyser and expose it to the scope widget
  const analyser = synth.ctx.createAnalyser()
  analyser.fftSize = 8192
  synth.masterGain.connect(analyser)
  scopeAnalyser.value = analyser

  initialized.value = true
}

// ---------------------------------------------------------------------------
// VCO updates
// ---------------------------------------------------------------------------
function onVCOChange(index, params) {
  if (index === 0) Object.assign(vco1, params)
  else Object.assign(vco2, params)
  synth.setVCO(index, params)
}

function updateADSR(key, val) {
  adsr[key] = val
  synth.setADSR({ ...adsr })
}

function updateFX(key, val) {
  fx[key] = val
  synth.setFX({ ...fx })
}
// ---------------------------------------------------------------------------
// Note events
// ---------------------------------------------------------------------------
function onNoteOn(freq) {
  synth.resume()
  synth.noteOn(freq)
  isPlaying.value = true
  currentFreq.value = freq
}

function onNoteOff() {
  synth.noteOff()
  isPlaying.value = false
}

onMounted(() => {
  initAudio()
})

onUnmounted(() => {
  synth.dispose()
})
</script>

<style scoped>
.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: #0c0c18;
  color: #ccccdd;
  font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
}

.app-header {
  padding: 20px 32px 16px;
  border-bottom: 1px solid #1a1a2e;
  display: flex;
  align-items: baseline;
  gap: 16px;
}

.logo {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.logo-pd {
  font-size: 26px;
  font-weight: 900;
  letter-spacing: -0.02em;
  background: linear-gradient(135deg, #7c6fff, #ff6b9d);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.logo-synth {
  font-size: 14px;
  font-weight: 300;
  letter-spacing: 0.3em;
  color: #5a5a7a;
}

.tagline {
  font-size: 11px;
  color: #3a3a5a;
  letter-spacing: 0.1em;
  margin: 0;
}

/* Init overlay */
.init-overlay {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.init-card {
  text-align: center;
  padding: 40px 60px;
  background: #13131f;
  border: 1px solid #2a2a3a;
  border-radius: 16px;
  transition: all 0.2s;
}

.init-card:hover {
  border-color: #4a3fff;
  box-shadow: 0 0 30px #4a3fff33;
}

.init-icon {
  font-size: 36px;
  margin-bottom: 12px;
  opacity: 0.7;
}

.init-title {
  font-size: 16px;
  font-weight: 600;
  color: #aaaacc;
  margin: 0 0 6px;
}

.init-sub {
  font-size: 11px;
  color: #4a4a6a;
  margin: 0;
}

/* Main synth body */
.synth-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 24px 32px 24px;
}

/* VCO section */
.vcos {
  display: flex;
  gap: 0;
  align-items: stretch;
  background: #0f0f1e;
  border: 1px solid #1e1e30;
  border-radius: 14px;
  padding: 20px;
  gap: 16px;
}

.vco-divider {
  width: 1px;
  background: linear-gradient(to bottom, transparent, #2a2a3a, transparent);
  flex-shrink: 0;
}

/* Master panel */
.master-panel {
  display: flex;
  gap: 24px;
  background: #0f0f1e;
  border: 1px solid #1e1e30;
  border-top: none;
  padding: 16px 20px;
  align-items: flex-start;
}

.panel-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.panel-label {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #3a3a5a;
}

.panel-knobs {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}

/* Scope section wrapper — no extra border, the component has its own */
.scope-section {
  border-top: none;
  border-bottom: none;
}

/* Keyboard */
.keyboard-section {
  background: #0f0f1e;
  border: 1px solid #1e1e30;
  border-radius: 0 0 14px 14px;
  padding: 20px 20px 16px;
  display: flex;
  justify-content: center;
}
</style>
