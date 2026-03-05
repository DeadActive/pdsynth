/**
 * PDSynth — Isolated DSP module for Phase Distortion Synthesis
 *
 * This module is purely responsible for audio processing and has NO
 * direct dependency on the Vue framework. It wraps the Web Audio API
 * and communicates with the AudioWorklet processor via MessagePort.
 *
 * Usage:
 *   const synth = new PDSynth()
 *   await synth.init()
 *   synth.noteOn(440)
 *   synth.setVCO(0, { waveform: 1, level: 0.7, distortion: 0.5 })
 *   synth.noteOff()
 *   synth.dispose()
 */

export const WAVEFORM = {
    SINE: 0,
    SAW: 1,
    SQUARE: 2,
    TRIANGLE: 3,
};

export const WAVEFORM_LABELS = ['Sine', 'Saw', 'Square', 'Triangle'];

export class PDSynth {
    constructor() {
        /** @type {AudioContext|null} */
        this.ctx = null;

        /** @type {AudioWorkletNode|null} */
        this.node = null;

        /** @type {GainNode|null} */
        this.masterGain = null;

        this._initialized = false;

        /** Default state mirrored here so Vue can read it back */
        this.state = {
            masterVolume: 0.75,
            vco: [
                { waveform: WAVEFORM.SINE, level: 0.6, distortion: 0, detune: 0, octave: 0 },
                { waveform: WAVEFORM.SINE, level: 0.4, distortion: 0, detune: 0, octave: 0 },
            ],
            adsr: { attack: 0.01, decay: 0.12, sustain: 0.7, release: 0.3 },
            fx: { delayTime: 45, feedback: 0.7, reverbMix: 0.5 },
        };
    }

    /** Must be called once, ideally from a user-gesture handler. */
    async init() {
        if (this._initialized) return;

        this.ctx = new AudioContext({ sampleRate: 44100 });

        // Worklet processor is served from /public/pd-processor.js
        await this.ctx.audioWorklet.addModule('/pd-processor.js');

        this.node = new AudioWorkletNode(this.ctx, 'pd-synth-processor', {
            numberOfInputs: 0,
            numberOfOutputs: 1,
            outputChannelCount: [1],
        });

        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = this.state.masterVolume;

        this.node.connect(this.masterGain);
        this.masterGain.connect(this.ctx.destination);

        // Push initial VCO state to the worklet
        this.state.vco.forEach((params, i) => this._sendVCO(i, params));
        this._sendADSR(this.state.adsr);

        this._initialized = true;
    }

    /** Resume AudioContext if suspended (browsers suspend on inactivity). */
    async resume() {
        if (this.ctx?.state === 'suspended') await this.ctx.resume();
    }

    // ---------------------------------------------------------------------------
    // Public API
    // ---------------------------------------------------------------------------

    /** Trigger note on.
     * @param {number} freq  Frequency in Hz
     */
    noteOn(freq) {
        this._post({ type: 'noteOn', freq });
    }

    /** Release currently playing note. */
    noteOff() {
        this._post({ type: 'noteOff' });
    }

    /**
     * Update a VCO's parameters.
     * @param {0|1} index       VCO index
     * @param {object} params   Partial { waveform, level, distortion }
     */
    setVCO(index, params) {
        Object.assign(this.state.vco[index], params);
        this._sendVCO(index, params);
    }

    /**
     * Set master output volume.
     * @param {number} value  0–1
     */
    setMasterVolume(value) {
        this.state.masterVolume = value;
        if (this.masterGain) {
            this.masterGain.gain.setTargetAtTime(value, this.ctx.currentTime, 0.01);
        }
    }

    /**
     * Set ADSR envelope.
     * @param {object} adsr  { attack, decay, sustain, release }
     */
    setADSR(adsr) {
        Object.assign(this.state.adsr, adsr);
        this._sendADSR(this.state.adsr);
    }

    /**
     * Set FX parameters.
     * @param {object} fx  { delayTime, feedback, reverbMix }
     */
    setFX(fx) {
        Object.assign(this.state.fx, fx);
        this._sendFX(this.state.fx);
    }

    /** Tear down AudioContext and release resources. */
    dispose() {
        this.node?.disconnect();
        this.masterGain?.disconnect();
        this.ctx?.close();
        this._initialized = false;
    }

    // ---------------------------------------------------------------------------
    // Private helpers
    // ---------------------------------------------------------------------------

    _post(msg) {
        // Structured clone cannot transfer Proxy/reactive objects — serialize to plain values first
        this.node?.port.postMessage(JSON.parse(JSON.stringify(msg)));
    }

    _sendVCO(index, params) {
        this._post({ type: 'vco', index, params });
    }

    _sendADSR(adsr) {
        this._post({ type: 'adsr', ...adsr });
    }

    _sendFX(fx) {
        this._post({ type: 'fx', ...fx });
    }
}
