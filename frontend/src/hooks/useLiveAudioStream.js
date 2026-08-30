import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * useLiveAudioStream.js
 * Media Source Extensions (MSE) Live Audio Receiver Hook
 * Receives WebM Opus audio chunks over WebSockets and feeds them into HTML5 MediaSource SourceBuffer.
 * Implements Stream-Tip Catch-Up Sync (audio.currentTime = bufEnd - 0.3s) so all listeners stay locked
 * to the exact same live stream position and resume immediately on page refresh.
 */
export function useLiveAudioStream(isLiveBroadcast, liveMimeType = 'audio/webm;codecs=opus', serverTimeOffset = 0) {
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

  // Setup Web Audio API Analyser for Listener Visualizer
  const getAudioContext = useCallback(() => {
    if (!audioRef.current || sourceRef.current) {
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => {});
      }
      return analyserRef.current;
    }

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;

      const source = ctx.createMediaElementSource(audioRef.current);
      source.connect(analyser);
      analyser.connect(ctx.destination);

      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      sourceRef.current = source;

      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      return analyser;
    } catch (err) {
      console.warn('Listener Web Audio setup notice:', err);
      return null;
    }
  }, []);

  // Safe playback trigger with stream-tip alignment
  const triggerAudioPlay = useCallback(() => {
    const audio = audioRef.current;
    const sb = sourceBufferRef.current;
    if (!audio || !hasBufferedData(sb)) return;

    try {
      const bufEnd = sb.buffered.end(0);
      const curTime = audio.currentTime;

      // Align playback position to stream tip (0.3s behind live buffer end)
      if (bufEnd - curTime > 0.5 || curTime < sb.buffered.start(0)) {
        audio.currentTime = Math.max(sb.buffered.start(0), bufEnd - 0.3);
      }
    } catch (e) {}

    audio.play().then(() => {
      setIsLiveAudioPlaying(true);
      getAudioContext();
    }).catch((err) => {
      // Muted fallback if browser blocks unmuted autoplay
      audio.muted = true;
      audio.play().then(() => {
        setIsLiveAudioPlaying(true);
        getAudioContext();
      }).catch(() => {});
    });
  }, [hasBufferedData, getAudioContext]);

  // Process queued audio chunks into MSE SourceBuffer sequentially with stream-tip sync steering
  const processQueue = useCallback(() => {
    const sb = sourceBufferRef.current;
    if (!sb || sb.updating || !mediaSourceRef.current || mediaSourceRef.current.readyState !== 'open') return;

    // 1. Prune old played audio buffer ranges (> 6s behind current playback)
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

    // 2. Stream-Tip Catch-Up Sync: Align currentTime to live stream tip (bufEnd - 0.3s)
    try {
      if (audioRef.current && hasBufferedData(sb)) {
        const bufEnd = sb.buffered.end(0);
        const curTime = audioRef.current.currentTime;
        const lagSec = bufEnd - curTime;

        // Hard catch-up seek if listener is lagging by > 0.5s
        if (lagSec > 0.5) {
          audioRef.current.currentTime = Math.max(sb.buffered.start(0), bufEnd - 0.3);
        } else if (lagSec > 0.2) {
          audioRef.current.playbackRate = 1.04; // Catch up slightly (+4%)
        } else {
          audioRef.current.playbackRate = 1.0;
        }
      }
    } catch (e) {}

    if (chunkQueueRef.current.length === 0) return;

    // 3. Append next queued live audio chunk
    try {
      const nextChunkItem = chunkQueueRef.current.shift();
      const arrayBuffer = typeof nextChunkItem === 'string' ? base64ToArrayBuffer(nextChunkItem) : nextChunkItem;
      sb.appendBuffer(arrayBuffer);
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
  }, [hasBufferedData, base64ToArrayBuffer]);

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
            if (hasBufferedData(sb)) {
              triggerAudioPlay();
            }
          });

          // Process queued chunks (including Chunk #0 sent on refresh/join)
          processQueue();
        } catch (err) {
          console.error('Failed to create SourceBuffer:', err);
          setLiveError('Failed to initialize live audio decoder.');
        }
      };

      mediaSource.addEventListener('sourceopen', handleSourceOpen);

      // Auto-resume playback on waiting or stalled event
      const handleBufferUnderrun = () => {
        if (audioRef.current && hasBufferedData(sourceBufferRef.current)) {
          triggerAudioPlay();
        }
      };
      audio.addEventListener('waiting', handleBufferUnderrun);
      audio.addEventListener('stalled', handleBufferUnderrun);

      // Global user gesture listener to unmute and play on click/touch/keydown
      const unlockAudioGesture = () => {
        if (audioRef.current) {
          audioRef.current.muted = false;
          if (hasBufferedData(sourceBufferRef.current)) {
            triggerAudioPlay();
          }
        }
        getAudioContext();
      };
      window.addEventListener('touchstart', unlockAudioGesture, { passive: true });
      window.addEventListener('click', unlockAudioGesture, { passive: true });
      window.addEventListener('keydown', unlockAudioGesture, { passive: true });

      return () => {
        window.removeEventListener('touchstart', unlockAudioGesture);
        window.removeEventListener('click', unlockAudioGesture);
        window.removeEventListener('keydown', unlockAudioGesture);
        audio.removeEventListener('waiting', handleBufferUnderrun);
        audio.removeEventListener('stalled', handleBufferUnderrun);
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
  }, [isLiveBroadcast, liveMimeType, processQueue, getAudioContext, hasBufferedData, triggerAudioPlay]);

  // Handle incoming live chunk from WebSocket
  const handleLiveChunk = useCallback((chunkPayload) => {
    if (!isLiveBroadcast || !chunkPayload) return;

    const base64Chunk = typeof chunkPayload === 'string' ? chunkPayload : chunkPayload.chunk;
    if (!base64Chunk) return;

    const arrayBuffer = base64ToArrayBuffer(base64Chunk);
    chunkQueueRef.current.push(arrayBuffer);

    const sb = sourceBufferRef.current;
    if (sb && !sb.updating) {
      processQueue();
    }

    if (audioRef.current && hasBufferedData(sb)) {
      triggerAudioPlay();
    }
  }, [isLiveBroadcast, base64ToArrayBuffer, processQueue, hasBufferedData, triggerAudioPlay]);

  return {
    liveAudioRef: audioRef,
    isLiveAudioPlaying,
    liveError,
    handleLiveChunk,
    listenerAnalyserRef: analyserRef,
    getAudioContext
  };
}
