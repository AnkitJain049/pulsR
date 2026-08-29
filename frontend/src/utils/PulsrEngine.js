/**
 * PulsrEngine.js
 * Modular client-side class for precision clock synchronization (Cristian's Algorithm)
 * and Web Audio API buffer decoding & sample-accurate timeline scheduling.
 */
export class PulsrEngine {
  constructor(socket = null) {
    this.socket = socket;
    this.clockOffset = 0; // serverTime - clientTime (performance.now())
    this.rtt = 0;
    this.isSynchronized = false;
    this.syncSamples = [];
    this.numSyncPings = 10;

    // Web Audio API Context & Nodes
    this.audioCtx = null;
    this.audioBuffer = null;
    this.currentSource = null;
    this.gainNode = null;
    this.analyserNode = null;

    this.initAudioContext();
  }

  /**
   * Set or update WebSocket connection
   */
  setSocket(socket) {
    this.socket = socket;
  }

  /**
   * Initialize Web Audio API Context & Nodes
   */
  initAudioContext() {
    if (typeof window === 'undefined') return;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioContextClass();
      
      this.gainNode = this.audioCtx.createGain();
      this.analyserNode = this.audioCtx.createAnalyser();
      this.analyserNode.fftSize = 128;

      this.gainNode.connect(this.analyserNode);
      this.analyserNode.connect(this.audioCtx.destination);
    } catch (err) {
      console.warn('Web Audio API not supported on this browser:', err);
    }
  }

  /**
   * Unlock AudioContext on first user interaction (browser autoplay policy)
   */
  async unlockAudioContext() {
    if (!this.audioCtx) this.initAudioContext();
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      try {
        await this.audioCtx.resume();
      } catch (err) {
        console.warn('Failed to resume AudioContext:', err);
      }
    }
    return this.audioCtx?.state === 'running';
  }

  // =========================================================================
  // 1. CLOCK SYNCHRONIZATION (Cristian's Algorithm / NTP over WebSockets)
  // =========================================================================

  /**
   * Send 10 rapid SYNC_PING messages over WebSocket to measure clock offset
   */
  startClockSync(socketOverride = null) {
    const ws = socketOverride || this.socket;
    if (!ws || ws.readyState !== 1) { // 1 = OPEN
      console.warn('Cannot start clock sync: WebSocket is not open.');
      return;
    }

    this.syncSamples = [];
    this.isSynchronized = false;

    let pingCount = 0;
    const sendNextPing = () => {
      if (pingCount >= this.numSyncPings || ws.readyState !== 1) return;
      
      const clientSendTime = performance.now();
      ws.send(JSON.stringify({
        type: 'SYNC_PING',
        clientSendTime,
        payload: { clientSendTime }
      }));

      pingCount++;
      if (pingCount < this.numSyncPings) {
        setTimeout(sendNextPing, 40); // 40ms interval for rapid burst
      }
    };

    sendNextPing();
  }

  /**
   * Handle incoming SYNC_PONG message from server
   * @param {Object} pongData { clientSendTime, serverTime }
   */
  handleSyncPong(pongData) {
    const clientReceiveTime = performance.now();
    const clientSendTime = pongData.clientSendTime ?? pongData.payload?.clientTime;
    const serverTime = pongData.serverTime ?? pongData.payload?.serverTime;

    if (clientSendTime === undefined || serverTime === undefined) return;

    // Round-Trip Time & One-Way Latency
    const rtt = clientReceiveTime - clientSendTime;
    const oneWayLatency = rtt / 2;

    // Server time at moment client received pong
    const serverTimeAtReceive = serverTime + oneWayLatency;
    const clockOffset = serverTimeAtReceive - clientReceiveTime;

    this.syncSamples.push({ rtt, oneWayLatency, clockOffset });

    // When all samples are gathered, compute filtered clockOffset using Cristian's Algorithm
    if (this.syncSamples.length >= this.numSyncPings) {
      this.computeFilteredClockOffset();
    }
  }

  /**
   * Cristian's Algorithm filtering: sort by RTT, take lowest 30% samples, average clockOffset
   */
  computeFilteredClockOffset() {
    if (this.syncSamples.length === 0) return;

    // Sort samples by RTT ascending
    const sortedSamples = [...this.syncSamples].sort((a, b) => a.rtt - b.rtt);

    // Keep lowest 30% of samples (minimum 1)
    const selectCount = Math.max(1, Math.floor(sortedSamples.length * 0.3));
    const bestSamples = sortedSamples.slice(0, selectCount);

    // Average RTT & clockOffset from best samples
    const totalOffset = bestSamples.reduce((sum, s) => sum + s.clockOffset, 0);
    const totalRtt = bestSamples.reduce((sum, s) => sum + s.rtt, 0);

    this.clockOffset = totalOffset / selectCount;
    this.rtt = totalRtt / selectCount;
    this.isSynchronized = true;

    console.log(`⏱️ Clock Sync Complete | RTT: ${this.rtt.toFixed(2)}ms | Clock Offset: ${this.clockOffset.toFixed(2)}ms`);
  }

  /**
   * Get high-precision synchronized server time (relative to server performance.now())
   * @returns {number}
   */
  getSynchronizedServerTime() {
    return performance.now() + this.clockOffset;
  }

  // =========================================================================
  // 2. WEB AUDIO SCHEDULING & PLAYBACK
  // =========================================================================

  /**
   * Fetch audio binary ArrayBuffer and decode with audioCtx.decodeAudioData()
   * @param {string} url 
   * @returns {Promise<AudioBuffer>}
   */
  async loadAudioTrack(url) {
    await this.unlockAudioContext();
    if (!this.audioCtx) throw new Error('AudioContext not initialized');

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP error fetching audio: ${response.status}`);

      const arrayBuffer = await response.arrayBuffer();
      const decodedBuffer = await this.audioCtx.decodeAudioData(arrayBuffer);

      this.audioBuffer = decodedBuffer;
      return decodedBuffer;
    } catch (err) {
      console.error('Failed to load audio track:', err);
      throw err;
    }
  }

  /**
   * Schedule audio playback with sample-accurate Web Audio timeline timing
   * @param {number} targetServerTime Target server performance.now() timestamp when track should play
   * @param {number} trackOffset Track offset in seconds (e.g. 0.0)
   */
  schedulePlay(targetServerTime, trackOffset = 0) {
    if (!this.audioCtx || !this.audioBuffer) {
      console.warn('Cannot schedule play: AudioContext or AudioBuffer missing.');
      return;
    }

    // Stop any existing active playback source
    this.pauseAudio();

    // Calculate remaining delay in milliseconds
    const currentServerTime = this.getSynchronizedServerTime();
    const delayMs = targetServerTime - currentServerTime;
    const delaySec = delayMs / 1000;

    let startTimeInAudioCtx;
    let actualTrackOffset = Math.max(0, trackOffset);

    if (delaySec > 0) {
      // Future playback: schedule on Web Audio timeline
      startTimeInAudioCtx = this.audioCtx.currentTime + delaySec;
    } else {
      // Immediate/past playback: start right now and advance track offset accordingly
      startTimeInAudioCtx = this.audioCtx.currentTime;
      actualTrackOffset += Math.abs(delaySec);
    }

    // Boundary check: ensure track offset doesn't exceed buffer duration
    if (actualTrackOffset >= this.audioBuffer.duration) {
      console.log('Scheduled track offset exceeds track duration.');
      return;
    }

    // Create AudioBufferSourceNode
    const source = this.audioCtx.createBufferSource();
    source.buffer = this.audioBuffer;
    source.connect(this.gainNode || this.audioCtx.destination);

    // Schedule sample-accurate start
    source.start(startTimeInAudioCtx, actualTrackOffset);
    this.currentSource = source;

    source.onended = () => {
      if (this.currentSource === source) {
        this.currentSource = null;
      }
    };
  }

  /**
   * Stop current audio source cleanly
   */
  pauseAudio() {
    if (this.currentSource) {
      try {
        this.currentSource.stop();
        this.currentSource.disconnect();
      } catch (err) {
        // Source might have already stopped
      }
      this.currentSource = null;
    }
  }

  /**
   * Set audio volume (0.0 to 1.0)
   */
  setVolume(volume) {
    if (this.gainNode) {
      this.gainNode.gain.value = Math.max(0, Math.min(1, volume));
    }
  }
}

export default PulsrEngine;
