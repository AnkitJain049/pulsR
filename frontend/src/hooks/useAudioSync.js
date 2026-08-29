import { useEffect, useRef, useState, useCallback } from 'react';
import { BACKEND_URL } from '../utils/config';

export function useAudioSync(track, playback, serverTimeOffset = 0) {
  const audioRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceRef = useRef(null);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isAudioReady, setIsAudioReady] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1.0);
  const [syncStatus, setSyncStatus] = useState('In Sync');

  // Initialize HTML5 Audio Element & Web Audio API Analyser
  useEffect(() => {
    const audio = new Audio();
    audio.crossOrigin = 'anonymous';
    audio.preload = 'auto';
    audioRef.current = audio;

    const handleLoadedMetadata = () => {
      setDuration(audio.duration || 0);
      setIsAudioReady(true);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      setSyncStatus('Ended');
    };

    const handleError = (e) => {
      console.error('Audio load error:', e, audio.error);
      setSyncStatus('Error loading audio file');
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    // Global touch/click event listener to unlock browser audio restrictions on mobile & desktop
    const unlockAudio = () => {
      if (audioRef.current && audioRef.current.src) {
        audioRef.current.play().then(() => {
          if (playbackRef.current && !playbackRef.current.isPlaying) {
            audioRef.current.pause();
          }
        }).catch(() => {});
      }
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => {});
      }
    };

    window.addEventListener('touchstart', unlockAudio, { passive: true });
    window.addEventListener('click', unlockAudio, { passive: true });

    return () => {
      window.removeEventListener('touchstart', unlockAudio);
      window.removeEventListener('click', unlockAudio);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audio.pause();
      audio.src = '';
    };
  }, []);

  // Store latest playback in ref to prevent stale closures inside event handlers
  const playbackRef = useRef(playback);
  useEffect(() => {
    playbackRef.current = playback;
  }, [playback]);

  // Update track source when track changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (track?.url) {
      const cleanBackendUrl = BACKEND_URL.replace(/\/+$/, '');
      const cleanTrackUrl = track.url.startsWith('/') ? track.url : `/${track.url}`;
      const fullUrl = track.url.startsWith('http')
        ? track.url
        : `${cleanBackendUrl}${cleanTrackUrl}`;

      if (audio.src !== fullUrl) {
        setIsAudioReady(false);
        audio.src = fullUrl;
        audio.load();
      }
    } else {
      audio.src = '';
      setIsAudioReady(false);
      setCurrentTime(0);
      setDuration(0);
    }
  }, [track]);

  // Synchronize Playback State & Compensate Clock Drift
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !track || !playback) return;

    const syncPlayback = async () => {
      const { isPlaying, trackOffset, serverStartTime } = playback;

      if (isPlaying && serverStartTime > 0) {
        // Unified Unix Epoch Time Sync
        const serverNow = Date.now() + serverTimeOffset;
        const timeUntilStartMs = serverStartTime - serverNow;

        // If target start time is in the future, hold at trackOffset until target moment arrives
        if (timeUntilStartMs > 0) {
          if (audio.readyState >= 1) {
            try {
              audio.currentTime = Math.max(0, trackOffset);
            } catch (e) {}
          }
          if (!audio.paused) {
            audio.pause();
          }
          setSyncStatus(`Syncing (${Math.ceil(timeUntilStartMs)}ms)...`);
          return;
        }

        const elapsedSeconds = Math.max(0, (serverNow - serverStartTime) / 1000);
        const expectedCurrentTime = trackOffset + elapsedSeconds;

        if (duration > 0 && expectedCurrentTime >= duration) {
          audio.pause();
          setSyncStatus('Ended');
          return;
        }

        // Only set currentTime if audio metadata has loaded (readyState >= 1)
        if (audio.readyState >= 1) {
          const drift = Math.abs(audio.currentTime - expectedCurrentTime);
          if (drift > 0.15 || audio.paused) {
            try {
              audio.currentTime = Math.max(0, expectedCurrentTime);
            } catch (e) {}
          }
        }

        if (audio.paused) {
          try {
            if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
              await audioCtxRef.current.resume();
            }
            await audio.play();
            setSyncStatus('In Sync');
          } catch (err) {
            console.warn('Audio playback waiting for user gesture unlock:', err);
            setSyncStatus('Click to unlock audio sync');
          }
        } else {
          setSyncStatus('In Sync');
        }
      } else {
        if (!audio.paused) {
          audio.pause();
        }
        setSyncStatus('Paused');
        if (audio.readyState >= 1) {
          const drift = Math.abs(audio.currentTime - trackOffset);
          if (drift > 0.15) {
            try {
              audio.currentTime = Math.max(0, trackOffset);
            } catch (e) {}
          }
        }
      }
    };

    syncPlayback();

    const intervalId = setInterval(syncPlayback, 250);
    return () => clearInterval(intervalId);
  }, [playback, track, serverTimeOffset, duration]);

  // Volume & Mute control
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  // Setup Web Audio API Analyser Node
  const setupWebAudioAnalyser = useCallback(() => {
    if (!audioRef.current || audioCtxRef.current) return analyserRef.current;

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

      return analyser;
    } catch (err) {
      console.warn('Web Audio API setup notice:', err);
      return null;
    }
  }, []);

  const manualResync = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !playback) return;

    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume().catch(console.warn);
    }

    const { isPlaying, trackOffset, serverStartTime } = playback;
    if (isPlaying && serverStartTime > 0) {
      const serverNow = Date.now() + serverTimeOffset;
      const elapsedSeconds = Math.max(0, (serverNow - serverStartTime) / 1000);
      if (audio.readyState >= 1) {
        try {
          audio.currentTime = Math.max(0, trackOffset + elapsedSeconds);
        } catch (e) {}
      }
      audio.play().then(() => {
        setSyncStatus('In Sync');
      }).catch(err => {
        console.warn('Manual resync play error:', err);
        setSyncStatus('Click to unlock audio sync');
      });
    } else {
      if (audio.readyState >= 1) {
        try {
          audio.currentTime = Math.max(0, trackOffset);
        } catch (e) {}
      }
      audio.pause();
      setSyncStatus('Paused');
    }
  }, [playback, serverTimeOffset]);

  return {
    audioRef,
    currentTime,
    duration,
    isAudioReady,
    isMuted,
    setIsMuted,
    volume,
    setVolume,
    syncStatus,
    setupWebAudioAnalyser,
    analyserRef,
    manualResync
  };
}
