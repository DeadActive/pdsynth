/**
 * Phase Distortion Synthesis - AudioWorklet Processor
 *
 * Implements the Casio CZ-style PD synthesis where a piecewise linear
 * incrementer function (segmented ramp) reads through a waveform at
 * varying rates within one cycle — warping the waveshape and harmonic content.
 *
 * The core PD function maps a linear phase φ ∈ [0,1] to a distorted
 * phase φ' ∈ [0,1] via a two-segment ramp with junction at (xj, 0.5):
 *
 *   Segment 1 (φ < xj):  φ' = φ * 0.5 / xj
 *   Segment 2 (φ ≥ xj):  φ' = 0.5 + (φ - xj) * 0.5 / (1 - xj)
 *
 * When distortion = 0 → xj = 0.5 → straight line (no effect)
 * When distortion → 1 → xj → 0   → first half compressed to near-instant
 *
 * References:
 *   - Ishibashi, M. (1985). US Patent 4658691
 *   - Sprague, D. (2015). BLEP and PolyBLEP Applied to Phase Distortion Synthesis
 */

const WAVEFORM = { SINE: 0, SAW: 1, SQUARE: 2, TRIANGLE: 3 };
const DEFAULT_FREQ = 440;

class PDSynthProcessor extends AudioWorkletProcessor {
    constructor() {
        super();

        this.vco = [
            {
                phase: 0,
                phaseOffset: 0,
                freq: DEFAULT_FREQ,
                level: 0.5,
                waveform: WAVEFORM.SINE,
                distortion: 0,
                active: false,
                detune: 0,
                octave: 0,
            },
            {
                phase: 0,
                phaseOffset: 0,
                freq: DEFAULT_FREQ,
                level: 0.5,
                waveform: WAVEFORM.SINE,
                distortion: 0,
                active: false,
                detune: 0,
                octave: 0,
            },
        ];

        this.targetFreq = DEFAULT_FREQ;
        this.currentFreq = DEFAULT_FREQ;
        this.gate = false;

        // Simple ADSR envelope state
        this.envelope = { value: 0, stage: 'idle' };
        this.attack = 0.01; // seconds
        this.decay = 0.1; // seconds
        this.sustain = 0.7; // level
        this.release = 0.3; // seconds

        this.delayLine = new Float32Array(sampleRate * 2);
        this.delayTime = 45; // milliseconds
        this.delaySamples = Math.floor((this.delayTime / 1000) * sampleRate);
        this.writeIndex = 0;
        this.feedback = 0.7;
        this.reverbMix = 0.5;

        this.port.onmessage = e => this._handleMessage(e.data);
    }

    _handleMessage(msg) {
        switch (msg.type) {
            case 'noteOn':
                this.targetFreq = msg.freq;
                this.currentFreq = msg.freq;
                this.gate = true;
                this.envelope.stage = 'attack';
                break;
            case 'noteOff':
                this.gate = false;
                this.envelope.stage = 'release';
                break;
            case 'vco':
                Object.assign(this.vco[msg.index], msg.params);
                break;
            case 'adsr':
                this.attack = msg.attack;
                this.decay = msg.decay;
                this.sustain = msg.sustain;
                this.release = msg.release;
                break;
            case 'fx':
                this.delayTime = msg.delayTime;
                this.delaySamples = Math.floor((this.delayTime / 1000) * sampleRate);
                this.feedback = msg.feedback;
                this.reverbMix = msg.reverbMix;
                break;
        }
    }

    /**
     * Core phase distortion transform.
     * Maps linear phase φ to distorted phase φ' using a piecewise ramp.
     *
     * @param {number} phase      linear phase [0, 1)
     * @param {number} distortion amount [0, 1]
     * @returns {number}          distorted phase [0, 1)
     */
    _applyPD(phase, distortion) {
        // Junction x coordinate: at distortion=0 → xj=0.5 (no effect)
        // As distortion→1 → xj→0.01 (first half maximally compressed)
        const xj = 0.5 * (1 - distortion) + 0.005;

        if (phase < xj) {
            return (phase * 0.5) / xj;
        } else {
            return 0.5 + ((phase - xj) * 0.5) / (1 - xj);
        }
    }

    /**
     * Evaluate waveform at a given phase.
     * @param {number} phase [0, 1)
     * @param {number} waveform WAVEFORM constant
     * @returns {number} sample [-1, 1]
     */
    _waveform(phase, waveform) {
        // Normalize phase to [0, 1)
        phase = phase % 1;
        switch (waveform) {
            case WAVEFORM.SINE:
                return Math.sin(2 * Math.PI * phase);

            case WAVEFORM.SAW:
                return 2 * phase - 1;

            case WAVEFORM.SQUARE:
                return phase < 0.5 ? 1 : -1;

            case WAVEFORM.TRIANGLE:
                return phase < 0.5 ? 4 * phase - 1 : 3 - 4 * phase;

            default:
                return 0;
        }
    }

    /**
     * Tick one VCO sample: compute PD phase, evaluate waveform, advance oscillator.
     */
    _tickVCO(vco) {
        const pdPhase = this._applyPD(vco.phase + vco.phaseOffset, vco.distortion);
        const sample = this._waveform(pdPhase, vco.waveform);

        vco.phase += vco.freq / sampleRate;
        if (vco.phase >= 1) vco.phase -= 1;

        return sample * vco.level;
    }

    /** Simple ADSR envelope tick — returns envelope amplitude. */
    _tickEnvelope() {
        const dt = 1 / sampleRate;
        const env = this.envelope;

        switch (env.stage) {
            case 'attack':
                env.value += dt / Math.max(this.attack, 0.001);
                if (env.value >= 1) {
                    env.value = 1;
                    env.stage = 'decay';
                }
                break;
            case 'decay':
                env.value -= (dt / Math.max(this.decay, 0.001)) * (1 - this.sustain);
                if (env.value <= this.sustain) {
                    env.value = this.sustain;
                    env.stage = 'sustain';
                }
                break;
            case 'sustain':
                env.value = this.sustain;
                break;
            case 'release':
                env.value -= (dt / Math.max(this.release, 0.001)) * this.sustain;
                if (env.value <= 0) {
                    env.value = 0;
                    env.stage = 'idle';
                }
                break;
            default:
                env.value = 0;
        }

        return env.value;
    }

    /**
     *
     * @param {*} freq  - Frequency in Hz
     * @param {*} cents - Detune in cents
     */
    _detune(freq, cents) {
        const detuneHz = freq * Math.pow(2, cents / 1200) - freq;
        return detuneHz;
    }

    _octave(freq, octave) {
        const octaveFreq = freq * Math.pow(2, octave) - freq;
        return octaveFreq;
    }

    _freq(freq, octave, cents) {
        const detuneHz = this._detune(freq, cents);
        const octaveFreq = this._octave(freq, octave);
        return this.currentFreq + octaveFreq + detuneHz;
    }

    _processReverb(channel) {
        const drySignal = channel;

        let readIndex = this.writeIndex - this.delaySamples;
        if (readIndex < 0) {
            readIndex += this.delayLine.length;
        }

        const delayedSample = this.delayLine[readIndex];
        const feedbackSignal = drySignal + delayedSample * this.feedback;

        this.delayLine[this.writeIndex] = feedbackSignal;
        this.writeIndex = (this.writeIndex + 1) % this.delayLine.length;

        return drySignal * (1 - this.reverbMix) + feedbackSignal * this.reverbMix;
    }

    process(_inputs, outputs) {
        const channel = outputs[0][0];
        if (!channel) return true;

        for (let i = 0; i < channel.length; i++) {
            this.vco[0].freq = this._freq(this.currentFreq, this.vco[0].octave, this.vco[0].detune);
            this.vco[1].freq = this._freq(this.currentFreq, this.vco[1].octave, this.vco[1].detune);

            const s1 = this._tickVCO(this.vco[0]);
            const s2 = this._tickVCO(this.vco[1]);
            const env = this._tickEnvelope();

            // Mix both VCOs and apply envelope; soft-clip to avoid harsh clipping
            const mixed = (s1 + s2) * 0.5 * env;
            const reverb = this._processReverb(mixed);
            channel[i] = Math.tanh(reverb * 1.2);
        }

        return true;
    }
}

registerProcessor('pd-synth-processor', PDSynthProcessor);
