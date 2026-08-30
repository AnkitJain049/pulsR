import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * useLiveAudioStream.js
 * Media Source Extensions (MSE) Live Audio Receiver Hook
 * Receives WebM Opus audio chunks over WebSockets and feeds them into HTML5 MediaSource SourceBuffer.
 * Connects Web Audio AnalyserNode to the Audio element for listener speaker output and visualizer analysis.
 * Includes automatic buffer pruning with strict timestamp guards to prevent QuotaExceededError and buffer exhaustion.
 */
export function useLiveAudioStream(isLiveBroadcast, liveMimeType = 'audio/webm;codecs=opus') {
  const audioRef = useRef(null);
  const mediaSourceRef = useRef(null);
  const sourceBufferRef = useRef(null);
  const chunkQueueRef = useRef([]);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceRef = useRef(null);

  const [isLiveAudioPlaying, setIsLiveAudioPlaying] = useState(false);
  const [liveError, setLiveError] = useState(null);

  // Helper: Exception-guarded check for SourceBuffer buffered data availability
  const hasBufferedData = useCallback((sb) => {
    if (!sb || !mediaSourceRef.current || mediaSourceRef.current.readyState !== 'open') return false;
    try {
      return Boolean(sb.buffered && sb.buffered.length > 0);
    } catch (err) {
      return false;
    }
  }, []);

  // Convert Base64 string to Uint8Array ArrayBuffer
  const base64ToArrayBuffer = useCallback((base64) => {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }, []);

  // Process queued audio chunks into MSE SourceBuffer sequentially with automatic pruning
  const processQueue = useCallback(() => {
    const sb = sourceBufferRef.current;
    if (!sb || sb.updating || !mediaSourceRef.current || mediaSourceRef.current.readyState !== 'open') return;

    // 1. Prune old played audio buffer ranges (> 10s behind current playback) with strict positive timestamp guards
    try {
      if (audioRef.current && hasBufferedData(sb)) {
        const start = sb.buffered.start(0);
        const curTime = audioRef.current.currentTime;
        const pruneEnd = curTime - 4;

        if (curTime > 6 && pruneEnd > start + 1) {
          sb.remove(start, pruneEnd);
          return; // Next append will execute on 'updateend' event
        }
      }
    } catch (e) {}

    if (chunkQueueRef.current.length === 0) return;

    // 2. Append next queued live audio chunk
    try {
      const nextChunk = chunkQueueRef.current.shift();
      sb.appendBuffer(nextChunk);
    } catch (err) {
      if (err.name === 'QuotaExceededError') {
        try {
          if (hasBufferedData(sb) && audioRef.current) {
            const start = sb.buffered.start(0);
            const pruneEnd = audioRef.current.currentTime - 2;
            if (pruneEnd > start) {
              sb.remove(start, pruneEnd);
            }
          }
        } catch (e) {}
      }
    }
  }, [hasBufferedData]);

  // Setup Web Audio API Analyser for Listener Visualizer
  const getAudioContext = useCallback(() => {
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume().catch(() => {});
    }
    return analyserRef.current;
  }, []);

  // Initialize MediaSource when Live Broadcast is active
  useEffect(() => {
    if (!isLiveBroadcast) {
      setIsLiveAudioPlaying(false);
      chunkQueueRef.current = [];
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeAttribute('src');
      }
      if (audioCtxRef.current) {
        try {
          audioCtxRef.current.close();
        } catch (e) {}
        audioCtxRef.current = null;
        analyserRef.current = null;
        sourceRef.current = null;
      }
      return;
    }

    const audio = new Audio();
    audio.crossOrigin = 'anonymous';
    audio.preload = 'auto';
    audioRef.current = audio;

    if (typeof MediaSource === 'undefined') {
      setLiveError('MediaSource Extensions (MSE) are not supported on this browser.');
      return;
    }

    try {
      const mediaSource = new MediaSource();
      mediaSourceRef.current = mediaSource;
      audio.src = URL.createObjectURL(mediaSource);

      // Safely initialize Web Audio Analyser AFTER audio.src URL is assigned
      try {
        if (!sourceRef.current) {
          const AudioCtx = window.AudioContext || window.webkitAudioContext;
          const ctx = new AudioCtx();
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 128;

          const source = ctx.createMediaElementSource(audio);
          source.connect(analyser);
          analyser.connect(ctx.destination);

          audioCtxRef.current = ctx;
          analyserRef.current = analyser;
          sourceRef.current = source;
        }
      } catch (eErr) {
        console.warn('Listener Web Audio Analyser setup notice:', eErr);
      }

      const handleSourceOpen = () => {
        try {
          const mime = liveMimeType || 'audio/webm;codecs=opus';
          const targetMime = (MediaSource.isTypeSupported(mime))
            ? mime
            : (MediaSource.isTypeSupported('audio/webm') ? 'audio/webm' : '');

          const sb = mediaSource.addSourceBuffer(targetMime || 'audio/webm');
          sourceBufferRef.current = sb;

          sb.addEventListener('updateend', () => {
            processQueue();
            if (audio.paused && hasBufferedData(sb)) {
              audio.play().then(() => {
                setIsLiveAudioPlaying(true);
                getAudioContext();
              }).catch(e => {
                console.warn('Live audio waiting for user gesture unlock:', e);
              });
            }
          });

          processQueue();
        } catch (err) {
          console.error('Failed to create SourceBuffer:', err);
          setLiveError('Failed to initialize live audio decoder.');
        }
      };

      mediaSource.addEventListener('sourceopen', handleSourceOpen);

      // Global gesture listener to trigger playback if browser blocks autoplay
      const unlockPlay = () => {
        if (audioRef.current && audioRef.current.paused && hasBufferedData(sourceBufferRef.current)) {
          audioRef.current.play().then(() => {
            setIsLiveAudioPlaying(true);
            getAudioContext();
          }).catch(() => {});
        }
      };
      window.addEventListener('touchstart', unlockPlay, { passive: true });
      window.addEventListener('click', unlockPlay, { passive: true });

      return () => {
        window.removeEventListener('touchstart', unlockPlay);
        window.removeEventListener('click', unlockPlay);
        mediaSource.removeEventListener('sourceopen', handleSourceOpen);
        chunkQueueRef.current = [];
        sourceBufferRef.current = null;
        mediaSourceRef.current = null;
        if (audioCtxRef.current) {
          try {
            audioCtxRef.current.close();
          } catch (e) {}
          audioCtxRef.current = null;
          analyserRef.current = null;
          sourceRef.current = null;
        }
        audio.pause();
        audio.removeAttribute('src');
      };
    } catch (gErr) {
      console.error('Live stream setup exception:', gErr);
    }
  }, [isLiveBroadcast, liveMimeType, processQueue, getAudioContext, hasBufferedData]);

  // Handle incoming live chunk from WebSocket
  const handleLiveChunk = useCallback((base64Chunk) => {
    if (!isLiveBroadcast || !base64Chunk) return;
    const arrayBuffer = base64ToArrayBuffer(base64Chunk);

    chunkQueueRef.current.push(arrayBuffer);

    const sb = sourceBufferRef.current;
    if (sb && !sb.updating) {
      processQueue();
    }

    if (audioRef.current && audioRef.current.paused && hasBufferedData(sb)) {
      audioRef.current.play().then(() => {
        setIsLiveAudioPlaying(true);
        getAudioContext();
      }).catch(() => {});
    }
  }, [isLiveBroadcast, base64ToArrayBuffer, processQueue, getAudioContext, hasBufferedData]);

  return {
    liveAudioRef: audioRef,
    isLiveAudioPlaying,
    liveError,
    handleLiveChunk,
    listenerAnalyserRef: analyserRef,
    getAudioContext
  };
}
