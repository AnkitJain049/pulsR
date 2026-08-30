import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * useLiveAudioStream.js
 * Listener hook that receives live Base64 Opus audio chunks over WebSockets
 * and feeds them into an MSE SourceBuffer / HTML5 Audio element for continuous real-time playback.
 */
export function useLiveAudioStream(isLiveBroadcast, liveMimeType = 'audio/webm;codecs=opus') {
  const audioRef = useRef(null);
  const mediaSourceRef = useRef(null);
  const sourceBufferRef = useRef(null);
  const chunkQueueRef = useRef([]);
  const isAppendingRef = useRef(false);

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
      console.warn('SourceBuffer append notice:', err);
    }
  }, []);

  // Initialize MediaSource when Live Broadcast is active
  useEffect(() => {
    if (!isLiveBroadcast) {
      setIsLiveAudioPlaying(false);
      chunkQueueRef.current = [];
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
      return;
    }

    const audio = new Audio();
    audio.crossOrigin = 'anonymous';
    audio.preload = 'none';
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
        const targetMime = MediaSource.isTypeSupported(mime) ? mime : 'audio/webm';
        
        const sb = mediaSource.addSourceBuffer(targetMime);
        sourceBufferRef.current = sb;

        sb.addEventListener('updateend', () => {
          processQueue();
          if (audio.paused && sb.buffered.length > 0 && sb.buffered.end(0) > 0.1) {
            audio.play().then(() => {
              setIsLiveAudioPlaying(true);
            }).catch(e => {
              console.warn('Live audio play waiting for user touch:', e);
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

    return () => {
      mediaSource.removeEventListener('sourceopen', handleSourceOpen);
      chunkQueueRef.current = [];
      sourceBufferRef.current = null;
      mediaSourceRef.current = null;
      audio.pause();
      audio.src = '';
    };
  }, [isLiveBroadcast, liveMimeType, processQueue]);

  // Handle incoming live chunk from WebSocket
  const handleLiveChunk = useCallback((base64Chunk) => {
    if (!isLiveBroadcast) return;
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
    handleLiveChunk
  };
}
