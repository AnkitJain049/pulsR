import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * useLiveAudioStream.js
 * Web Audio API Live Receiver Hook
 * Decodes Opus/PCM audio chunks over WebSockets using AudioContext.decodeAudioData
 * and routes them to AudioContext.destination for real-time live playback and visualizer analysis.
 */
export function useLiveAudioStream(isLiveBroadcast) {
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const nextPlayTimeRef = useRef(0);
  const isPlayingRef = useRef(false);

  const [isLiveAudioPlaying, setIsLiveAudioPlaying] = useState(false);
  const [liveError, setLiveError] = useState(null);

  // Initialize Web Audio API AudioContext & AnalyserNode
  const getAudioContext = useCallback(() => {
    if (!audioCtxRef.current) {
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioCtx();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 128;
        analyser.connect(ctx.destination);

        audioCtxRef.current = ctx;
        analyserRef.current = analyser;
      } catch (err) {
        console.error('Failed to initialize AudioContext:', err);
        setLiveError('Web Audio API not supported on this browser.');
      }
    }
    
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume().catch(() => {});
    }

    return { ctx: audioCtxRef.current, analyser: analyserRef.current };
  }, []);

  // Convert Base64 string to ArrayBuffer
  const base64ToArrayBuffer = useCallback((base64) => {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }, []);

  // Handle incoming live chunk from WebSocket
  const handleLiveChunk = useCallback(async (base64Chunk) => {
    if (!isLiveBroadcast || !base64Chunk) return;

    try {
      const { ctx, analyser } = getAudioContext();
      if (!ctx || !analyser) return;

      const arrayBuffer = base64ToArrayBuffer(base64Chunk);
      
      // Decode audio chunk ArrayBuffer to AudioBuffer
      ctx.decodeAudioData(arrayBuffer, (audioBuffer) => {
        if (!audioBuffer) return;

        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(analyser);

        const currentTime = ctx.currentTime;
        // Schedule next chunk seamlessly back-to-back
        const startTime = Math.max(currentTime, nextPlayTimeRef.current);
        source.start(startTime);
        nextPlayTimeRef.current = startTime + audioBuffer.duration;

        if (!isPlayingRef.current) {
          isPlayingRef.current = true;
          setIsLiveAudioPlaying(true);
        }
      }, (decodeErr) => {
        // Suppress initial header chunk decode warnings
      });

    } catch (err) {
      console.warn('Live chunk processing notice:', err);
    }
  }, [isLiveBroadcast, getAudioContext, base64ToArrayBuffer]);

  // Clean up AudioContext when broadcast ends
  useEffect(() => {
    if (!isLiveBroadcast) {
      isPlayingRef.current = false;
      setIsLiveAudioPlaying(false);
      nextPlayTimeRef.current = 0;

      if (audioCtxRef.current) {
        try {
          audioCtxRef.current.close();
        } catch (e) {}
        audioCtxRef.current = null;
        analyserRef.current = null;
      }
    }
  }, [isLiveBroadcast]);

  return {
    isLiveAudioPlaying,
    liveError,
    handleLiveChunk,
    listenerAnalyserRef: analyserRef,
    getAudioContext
  };
}
