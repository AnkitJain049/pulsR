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

  // Detect Mobile Operating System (iOS / Android) for tailored decoder thresholds
  const isMobileRef = useRef(
    typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
  );

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

    // Global touch/click event listener to unlock mobile browser audio restrictions on iOS Safari & Android
    const unlockMobileAudio = () => {
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

    window.addEventListener('touchstart', unlockMobileAudio, { passive: true });
    window.addEventListener('click', unlockMobileAudio, { passive: true });

    return () => {
      window.removeEventListener('touchstart', unlockMobileAudio);
      window.removeEventListener('click', unlockMobileAudio);
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

  // Synchronize Playback State with Smooth PlaybackRate Steering (No Mobile Seeking Freezes!)
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !track || !playback) return;

    const syncPlayback = async () => {
      const { isPlaying, trackOffset, serverStartTime } = playback;

      if (isPlaying && serverStartTime > 0) {
        const serverNow = Date.now() + serverTimeOffset;
        const timeUntilStartMs = serverStartTime - serverNow;

        // If target start time is in the future, hold at trackOffset until target moment arrives
        if (timeUntilStartMs > 0) {
          if (audio.readyState >= 1) {
            try {
              audio.currentTime = Math.max(0, trackOffset);
              audio.playbackRate = 1.0;
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

        const isMobile = isMobileRef.current;
        const hardDriftThreshold = isMobile ? 0.6 : 0.3; // Hard seek threshold (600ms on mobile, 300ms on desktop)
        const softDriftThreshold = 0.04; // 40ms threshold for smooth rate steering

        if (audio.readyState >= 1) {
          const drift = audio.currentTime - expectedCurrentTime; // positive if ahead, negative if behind
          const absDrift = Math.abs(drift);

          if (absDrift > hardDriftThreshold || audio.paused) {
            // Hard seek if wildly off or starting from pause
            try {
              audio.currentTime = Math.max(0, expectedCurrentTime);
              audio.playbackRate = 1.0;
            } catch (e) {}
          } else if (absDrift > softDriftThreshold) {
            // Smooth PlaybackRate Steering to avoid mobile hardware decoder re-seek freezing
            if (drift < 0) {
              // Audio is behind: speed up slightly (+2.5% to +3.5%) to catch up smoothly
              audio.playbackRate = isMobile ? 1.035 : 1.02;
            } else {
              // Audio is ahead: slow down slightly (-2.5% to -3.5%) to let timeline catch up
              audio.playbackRate = isMobile ? 0.965 : 0.98;
            }
          } else {
            // Perfectly in sync (under 40ms drift): lock to normal 1.0 speed
            if (audio.playbackRate !== 1.0) {
              audio.playbackRate = 1.0;
            }
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
            console.warn('Audio playback waiting for mobile touch unlock:', err);
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
          audio.playbackRate = 1.0;
          const drift = Math.abs(audio.currentTime - trackOffset);
          if (drift > 0.2) {
            try {
              audio.currentTime = Math.max(0, trackOffset);
            } catch (e) {}
          }
        }
      }
    };

    syncPlayback();

    // Run sync loop every 400ms on mobile (prevents mobile CPU throttling) or 250ms on desktop
    const intervalMs = isMobileRef.current ? 400 : 250;
    const intervalId = setInterval(syncPlayback, intervalMs);
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
          audio.playbackRate = 1.0;
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
          audio.playbackRate = 1.0;
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
