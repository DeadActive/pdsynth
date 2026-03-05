<template>
  <div class="keyboard-wrap">
    <div class="keyboard" @mouseleave="onMouseLeave">
      <div v-for="key in keys" :key="key.note"
        :class="['key', key.black ? 'black' : 'white', { pressed: pressedNote === key.note }]"
        @mousedown.prevent="onPress(key)" @mouseup="onRelease" @mouseenter="e => e.buttons === 1 && onPress(key)"
        @touchstart.prevent="onPress(key)" @touchend="onRelease">
        <span v-if="!key.black" class="key-label">{{ key.label }}</span>
      </div>
    </div>
    <div class="keyboard-hint">Click or use keyboard keys (A–K, W/E/T/Y/U)</div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const emit = defineEmits(['noteOn', 'noteOff'])

const pressedNote = ref(null)

// One octave of keys, C3 to C4
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

// Start at C3 = MIDI 48
const BASE_MIDI = 36 // C2
const BASE_OCTAVE = 2
const NUM_OCTAVES = 3

const keys = []
for (let oct = 0; oct < NUM_OCTAVES; oct++) {
  for (let n = 0; n < 12; n++) {
    const midi = BASE_MIDI + oct * 12 + n
    const name = NOTE_NAMES[n]
    const black = name.includes('#')
    keys.push({
      note: midi,
      freq: midiToFreq(midi),
      name,
      black,
      label: black ? '' : `${name}${BASE_OCTAVE + oct}`,
    })
  }
}

// Computer keyboard mapping (white keys: A S D F G H J K, black: W E T Y U)
const KB_MAP = {
  a: 48, w: 49, s: 50, e: 51, d: 52, f: 53, t: 54, g: 55,
  y: 56, h: 57, u: 58, j: 59, k: 60,
  // Second octave
  z: 60, x: 62, c: 64, v: 65, b: 67, n: 69, m: 71,
}

function onPress(key) {
  if (pressedNote.value === key.note) return
  pressedNote.value = key.note
  emit('noteOn', key.freq)
}

function onRelease() {
  pressedNote.value = null
  emit('noteOff')
}

function onMouseLeave() {
  // Don't release on mouse leave — only on mouseup/touchend
}

function handleKeyDown(e) {
  if (e.repeat) return
  const midi = KB_MAP[e.key.toLowerCase()]
  if (midi == null) return
  const key = keys.find(k => k.note === midi)
  if (key) onPress(key)
}

function handleKeyUp(e) {
  const midi = KB_MAP[e.key.toLowerCase()]
  if (midi != null) onRelease()
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('keyup', handleKeyUp)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('keyup', handleKeyUp)
})
</script>

<style scoped>
.keyboard-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.keyboard {
  display: flex;
  position: relative;
  height: 120px;
  background: transparent;
  gap: 0;
  padding: 0 2px;
}

/* White keys */
.key.white {
  width: 38px;
  height: 120px;
  background: linear-gradient(to bottom, #d8d8e8 0%, #f0f0f8 30%, #e8e8f0 100%);
  border: 1px solid #2a2a3a;
  border-top: none;
  border-radius: 0 0 6px 6px;
  position: relative;
  z-index: 1;
  cursor: pointer;
  transition: background 0.05s;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding-bottom: 6px;
  margin-right: 2px;
}

.key.white:hover {
  background: linear-gradient(to bottom, #e0e0f0 0%, #f8f8ff 30%, #eeeefc 100%);
}

.key.white.pressed {
  background: linear-gradient(to bottom, #9988ff 0%, #c0b0ff 60%, #a898ee 100%);
}

/* Black keys */
.key.black {
  width: 26px;
  height: 72px;
  background: linear-gradient(to bottom, #1a1a2a 0%, #2a2a3e 60%, #1e1e2e 100%);
  border: 1px solid #111;
  border-top: none;
  border-radius: 0 0 5px 5px;
  position: relative;
  z-index: 2;
  cursor: pointer;
  margin-left: -13px;
  margin-right: -13px;
  transition: background 0.05s;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.5);
}

.key.black:hover {
  background: linear-gradient(to bottom, #252535 0%, #353550 60%, #252535 100%);
}

.key.black.pressed {
  background: linear-gradient(to bottom, #4a38cc 0%, #6a58ec 60%, #4a38cc 100%);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
}

.key-label {
  font-size: 8px;
  color: #7777aa;
  font-weight: 600;
  letter-spacing: 0.05em;
}

.keyboard-hint {
  font-size: 10px;
  color: #3a3a5a;
  letter-spacing: 0.05em;
}
</style>
