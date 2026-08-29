import { useEffect, useRef, useState, useCallback } from 'react';

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
  const [syncStatus, setSyncStatus] = useState('In Sync'); // 'In Sync', 'Syncing...', 'Paused'

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

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.pause();
      audio.src = '';
    };
  }, []);

  // Update track source when track changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (track?.url) {
      // Build full URL using window.location.hostname for local Wi-Fi multi-device compatibility
      const host = window.location.hostname || 'localhost';
      const fullUrl = track.url.startsWith('http')
        ? track.url
        : `http://${host}:5001${track.url}`;

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
        // High Precision Server Time calculation
        const serverNow = Date.now() + serverTimeOffset;
        const elapsedSeconds = (serverNow - serverStartTime) / 1000;
        const expectedCurrentTime = trackOffset + elapsedSeconds;

        // Check if track is within valid length
        if (duration > 0 && expectedCurrentTime >= duration) {
          audio.pause();
          setSyncStatus('Ended');
          return;
        }

        // Drift check threshold: 0.05 seconds (50ms)
        const drift = Math.abs(audio.currentTime - expectedCurrentTime);
        if (drift > 0.05 || audio.paused) {
          setSyncStatus('Syncing...');
          audio.currentTime = Math.max(0, expectedCurrentTime);
        }

        if (audio.paused) {
          try {
            // Web Audio Context unlock on browser interaction
            if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
              await audioCtxRef.current.resume();
            }
            await audio.play();
            setSyncStatus('In Sync');
          } catch (err) {
            console.warn('Audio playback waiting for user interaction:', err);
            setSyncStatus('Click to unlock audio sync');
          }
        } else {
          setSyncStatus('In Sync');
        }
      } else {
        // Paused state
        if (!audio.paused) {
          audio.pause();
        }
        setSyncStatus('Paused');
        const drift = Math.abs(audio.currentTime - trackOffset);
        if (drift > 0.05) {
          audio.currentTime = Math.max(0, trackOffset);
        }
      }
    };

    syncPlayback();

    // Continuous drift check loop every 1 second during active playback
    const intervalId = setInterval(syncPlayback, 1000);
    return () => clearInterval(intervalId);
  }, [playback, track, serverTimeOffset, duration]);

  // Volume & Mute control
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  // Setup Web Audio API Analyser Node for Audio Visualizer
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

    const { isPlaying, trackOffset, serverStartTime } = playback;
    if (isPlaying && serverStartTime > 0) {
      const serverNow = Date.now() + serverTimeOffset;
      const elapsedSeconds = (serverNow - serverStartTime) / 1000;
      audio.currentTime = Math.max(0, trackOffset + elapsedSeconds);
      audio.play().catch(console.warn);
    } else {
      audio.currentTime = Math.max(0, trackOffset);
      audio.pause();
    }
    setSyncStatus('In Sync');
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
