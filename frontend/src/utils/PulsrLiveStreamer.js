/**
 * PulsrLiveStreamer.js
 * Captures System/Tab Audio (Spotify, Apple Music, YouTube, Desktop Sound)
 * via navigator.mediaDevices.getDisplayMedia and streams 50ms Opus audio chunks over WebSockets.
 */
export class PulsrLiveStreamer {
  constructor(socketRef = null) {
    this.socketRef = socketRef;
    this.mediaStream = null;
    this.audioOnlyStream = null;
    this.mediaRecorder = null;
    this.isBroadcasting = false;
    this.mimeType = 'audio/webm;codecs=opus';
    this.analyserNode = null;
    this.audioCtx = null;
  }

  setSocketRef(socketRef) {
    this.socketRef = socketRef;
  }

  /**
   * Supported MIME types for MediaRecorder audio slicing
   */
  getBestMimeType() {
    if (typeof MediaRecorder === 'undefined') return '';
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg'
    ];
    for (const t of types) {
      if (MediaRecorder.isTypeSupported(t)) {
        return t;
      }
    }
    return '';
  }

  /**
   * Attach Web Audio API Analyser to live system audio stream for real-time visualizer
   */
  getLiveAnalyser() {
    if (!this.audioOnlyStream) return null;
    if (this.analyserNode) return this.analyserNode;

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      const source = ctx.createMediaStreamSource(this.audioOnlyStream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      source.connect(analyser);

      this.audioCtx = ctx;
      this.analyserNode = analyser;
      return analyser;
    } catch (err) {
      console.warn('Live audio analyser notice:', err);
      return null;
    }
  }

  /**
   * Prompt user to select Spotify/Apple Music tab or System Audio, and start live streaming
   */
  async startBroadcast(onStopCallback) {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) {
      throw new Error('System audio capture is not supported on this browser.');
    }

    try {
      // Prompt Chrome / Edge / Firefox screen & tab picker with native local playback suppression enabled
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'browser'
        },
        audio: {
          suppressLocalAudioPlayback: true, // Native Chrome WebRTC feature to mute local speaker playback while streaming 100% digital audio
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      });

      const audioTracks = stream.getAudioTracks();
      if (!audioTracks || audioTracks.length === 0) {
        // User forgot to check "Share Audio" checkbox in the browser prompt
        stream.getTracks().forEach(t => t.stop());
        throw new Error('No audio track selected! Please check the "Share Audio" checkbox in the browser picker.');
      }

      this.mediaStream = stream;
      
      // Create dedicated audio-only stream
      const audioOnlyStream = new MediaStream(audioTracks);
      this.audioOnlyStream = audioOnlyStream;

      this.mimeType = this.getBestMimeType();

      // Handle user stopping stream via browser native "Stop Sharing" floating bar
      stream.getTracks().forEach(track => {
        track.onended = () => {
          this.stopBroadcast();
          if (onStopCallback) onStopCallback();
        };
      });

      // Notify WebSocket server that live broadcast has started
      const ws = this.socketRef?.current;
      if (ws && ws.readyState === 1) { // 1 = OPEN
        ws.send(JSON.stringify({
          type: 'START_LIVE_BROADCAST',
          payload: { mimeType: this.mimeType }
        }));
      }

      // Initialize MediaRecorder on the audio-only stream
      const recorderOptions = {};
      if (this.mimeType && typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(this.mimeType)) {
        recorderOptions.mimeType = this.mimeType;
      }

      const recorder = new MediaRecorder(audioOnlyStream, recorderOptions);
      this.mediaRecorder = recorder;

      recorder.ondataavailable = async (event) => {
        if (event.data && event.data.size > 0 && this.isBroadcasting) {
          const ws = this.socketRef?.current;
          if (ws && ws.readyState === 1) {
            const buffer = await event.data.arrayBuffer();
            // Convert ArrayBuffer to Base64 string for fast WS transport
            const base64Chunk = this.arrayBufferToBase64(buffer);
            ws.send(JSON.stringify({
              type: 'LIVE_AUDIO_CHUNK',
              payload: {
                chunk: base64Chunk,
                mimeType: this.mimeType || recorder.mimeType,
                timestamp: Date.now()
              }
            }));
          }
        }
      };

      this.isBroadcasting = true;
      recorder.start(50); // Ultra low-latency 50ms Opus audio chunk slicing
      return true;

    } catch (err) {
      console.error('Failed to start live audio broadcast:', err);
      this.stopBroadcast();
      throw err;
    }
  }

  /**
   * Stop active live audio broadcast cleanly
   */
  stopBroadcast() {
    this.isBroadcasting = false;

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch (e) {}
    }

    if (this.audioCtx) {
      try {
        this.audioCtx.close();
      } catch (e) {}
      this.audioCtx = null;
      this.analyserNode = null;
    }

    if (this.audioOnlyStream) {
      this.audioOnlyStream.getTracks().forEach(t => t.stop());
      this.audioOnlyStream = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(t => t.stop());
      this.mediaStream = null;
    }

    const ws = this.socketRef?.current;
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({
        type: 'STOP_LIVE_BROADCAST'
      }));
    }
  }

  /**
   * Helper: Convert ArrayBuffer to Base64 string
   */
  arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }
}
