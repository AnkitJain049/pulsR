import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * useLiveAudioStream.js
 * Media Source Extensions (MSE) Live Audio Receiver Hook
 * Receives WebM Opus audio chunks over WebSockets and feeds them into HTML5 MediaSource SourceBuffer.
 * Connects Web Audio AnalyserNode to the Audio element for listener speaker output and visualizer analysis.
 */
export function useLiveAudioStream(isLiveBroadcast, liveMimeType = 'audio/webm;codecs=opus') {
  const audioRef = useRef(null);
  const mediaSourceRef = useRef(null);
  const sourceBufferRef = useRef(null);
  const chunkQueueRef = useRef([]);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);

  const [isLiveAudioPlaying, setIsLiveAudioPlaying] = useState(false);
  const [liveError, setLiveError] = useState(null);

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

  // Process queued audio chunks into MSE SourceBuffer
  const processQueue = useCallback(() => {
    const sb = sourceBufferRef.current;
    if (!sb || sb.updating || chunkQueueRef.current.length === 0) return;

    try {
      const nextChunk = chunkQueueRef.current.shift();
      sb.appendBuffer(nextChunk);
    } catch (err) {
      // Suppress minor buffer boundary notices
    }
  }, []);

  // Setup Web Audio API Analyser for Listener Visualizer
  const getAudioContext = useCallback(() => {
    if (!audioRef.current || analyserRef.current) return analyserRef.current;

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
      return analyser;
    } catch (err) {
      console.warn('Listener Web Audio API notice:', err);
      return null;
    }
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

    const mediaSource = new MediaSource();
    mediaSourceRef.current = mediaSource;
    audio.src = URL.createObjectURL(mediaSource);

    const handleSourceOpen = () => {
      try {
        const mime = liveMimeType || 'audio/webm;codecs=opus';
        const targetMime = (MediaSource.isTypeSupported(mime))
          ? mime
          : (MediaSource.isTypeSupported('audio/webm') ? 'audio/webm' : '');

        if (!targetMime) {
          console.warn('Fallback: Browser using default MediaSource codec');
        }

        const sb = mediaSource.addSourceBuffer(targetMime || 'audio/webm');
        sourceBufferRef.current = sb;

        sb.addEventListener('updateend', () => {
          processQueue();
          if (audio.paused && sb.buffered.length > 0) {
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
      if (audioRef.current && audioRef.current.paused && sourceBufferRef.current?.buffered.length > 0) {
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
      audio.pause();
      audio.removeAttribute('src');
    };
  }, [isLiveBroadcast, liveMimeType, processQueue, getAudioContext]);

  // Handle incoming live chunk from WebSocket
  const handleLiveChunk = useCallback((base64Chunk) => {
    if (!isLiveBroadcast || !base64Chunk) return;
    const arrayBuffer = base64ToArrayBuffer(base64Chunk);

    chunkQueueRef.current.push(arrayBuffer);

    const sb = sourceBufferRef.current;
    if (sb && !sb.updating) {
      processQueue();
    }
  }, [isLiveBroadcast, base64ToArrayBuffer, processQueue]);

  return {
    liveAudioRef: audioRef,
    isLiveAudioPlaying,
    liveError,
    handleLiveChunk,
    listenerAnalyserRef: analyserRef,
    getAudioContext
  };
}
