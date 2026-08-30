import React, { useRef, useState } from 'react';
import { Play, Pause, Upload, Volume2, VolumeX, Copy, Check, Sliders, AlertCircle, Info, Radio, Disc } from 'lucide-react';
import { BACKEND_URL } from '../utils/config';

export function Player({
  role,
  roomState,
  session,
  socketRef,
  streamerRef,
  hostMonitoring,
  setHostMonitoring,
  updateTrack,
  playTrack,
  pauseTrack,
  seekTrack,
  currentTime,
  duration,
  isMuted,
  setIsMuted,
  volume,
  setVolume,
  syncStatus,
  manualResync,
  hardwareCalibration,
  setHardwareCalibration
}) {
  const fileInputRef = useRef(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Tab State: 'file' vs 'live'
  const [activeTab, setActiveTab] = useState('file');

  // Live Streamer State
  const [isLiveBroadcasting, setIsLiveBroadcasting] = useState(false);
  const [liveStreamError, setLiveStreamError] = useState(null);

  const track = roomState?.track;
  const isPlaying = roomState?.playback?.isPlaying || false;
  const isAdmin = role === 'ADMIN' || role === 'admin';
  const isRoomLive = roomState?.isLiveBroadcast || false;

  const handleCopyRoomCode = () => {
    if (!roomState?.id) return;
    navigator.clipboard.writeText(roomState.id).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(console.warn);
  };

  const handleStartLiveBroadcast = async () => {
    setLiveStreamError(null);
    try {
      if (streamerRef?.current) {
        await streamerRef.current.startBroadcast(() => {
          setIsLiveBroadcasting(false);
        });
        setIsLiveBroadcasting(true);
      }
    } catch (err) {
      setLiveStreamError(err.message || 'Failed to start system audio capture.');
      setIsLiveBroadcasting(false);
    }
  };

  const handleStopLiveBroadcast = () => {
    if (streamerRef?.current) {
      streamerRef.current.stopBroadcast();
    }
    setIsLiveBroadcasting(false);
  };

  const processUploadFile = async (file) => {
    if (!file) return;
    setIsUploading(true);
    setUploadError(null);

    const formData = new FormData();
    formData.append('audio', file);

    try {
      const cleanBackendUrl = BACKEND_URL.replace(/\/+$/, '');
      const response = await fetch(`${cleanBackendUrl}/api/rooms/${roomState.id}/track`, {
        method: 'POST',
        body: formData
      });

      const data = await response.json();
      if (data.success && data.track) {
        updateTrack(data.track);
      } else {
        setUploadError(data.error || 'Failed to upload file');
      }
    } catch (err) {
      console.error('Upload error:', err);
      setUploadError('Failed to connect to backend server.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) processUploadFile(file);
  };

  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && isAdmin) processUploadFile(file);
  };

  const handleSeekChange = (e) => {
    if (!isAdmin || isRoomLive) return;
    const newTime = parseFloat(e.target.value);
    seekTrack(newTime);
  };

  const formatTime = (secs) => {
    if (!secs || isNaN(secs)) return '0:00';
    const minutes = Math.floor(secs / 60);
    const seconds = Math.floor(secs % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const isAudioLocked = syncStatus.includes('Click to unlock') || syncStatus.includes('suspended') || (!isAdmin && isPlaying && syncStatus !== 'In Sync');

  return (
    <div className="space-y-6">
      
      {/* 1. ROOM INFO BAR */}
      <div className="apple-glass rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 border border-white/10">
        
        <div className="flex items-center space-x-3">
          <span className="text-xs text-zinc-400">Room Code:</span>
          <button
            onClick={handleCopyRoomCode}
            className="flex items-center space-x-2 px-3 py-1 rounded-xl bg-black border border-[#c1ff72]/30 text-[#c1ff72] font-mono text-sm font-bold hover:bg-zinc-900 transition"
            title="Click to copy Room Code"
          >
            <span>{roomState?.id}</span>
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5 text-zinc-400" />}
          </button>
          {copied && <span className="text-xs text-[#c1ff72]">Copied</span>}
        </div>

        <div className="flex items-center space-x-3 text-xs">
          <div className="px-3 py-1 rounded-full bg-zinc-900 border border-white/10 text-white font-medium">
            ⚡ {session.username || 'User'}
          </div>

          <span className={`px-2.5 py-0.5 rounded-full font-bold uppercase ${
            isAdmin ? 'bg-[#c1ff72] text-black' : 'bg-zinc-800 text-zinc-300'
          }`}>
            {isAdmin ? 'HOST' : 'LISTENER'}
          </span>
        </div>

      </div>

      {/* 2. AUDIO UNLOCK OVERLAY FOR LISTENERS & MOBILE BROWSERS */}
      {isAudioLocked && !isRoomLive && (
        <div
          onClick={manualResync}
          className="cursor-pointer p-4 rounded-2xl bg-[#c1ff72]/20 border border-[#c1ff72]/40 text-[#c1ff72] text-sm font-semibold flex items-center justify-between animate-pulse"
        >
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4" />
            <span>Tap Anywhere or Click Here to Enable Live Audio Stream</span>
          </div>
          <span className="px-4 py-1.5 rounded-xl bg-[#c1ff72] text-black text-xs font-extrabold shadow-lime-glow">Enable Sound</span>
        </div>
      )}

      {/* 3. AUDIO PLAYER CARD */}
      <div className="apple-glass rounded-3xl p-6 sm:p-8 border border-white/10 space-y-6">
        
        {/* Track Title / Live Badge */}
        <div className="flex items-center justify-between border-b border-white/5 pb-4">
          <div>
            <div className="flex items-center space-x-2">
              {isRoomLive ? (
                <span className="flex items-center space-x-1.5 px-3 py-0.5 rounded-full bg-red-600/20 border border-red-500/40 text-red-400 text-xs font-bold animate-pulse">
                  <Radio className="w-3.5 h-3.5" />
                  <span>LIVE BROADCASTING</span>
                </span>
              ) : (
                <h3 className="font-bold text-xl text-white max-w-md truncate">
                  {track ? track.originalName : 'No Track Loaded'}
                </h3>
              )}
            </div>

            <p className="text-xs text-zinc-500 mt-1">
              {isRoomLive
                ? 'Streaming Host Spotify / Apple Music / Desktop Audio'
                : track
                ? `${(track.size / (1024 * 1024)).toFixed(2)} MB`
                : 'Host can upload an audio track or start a Live Broadcast below'}
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-xs px-3 py-1 rounded-full bg-zinc-900 border border-white/10 text-zinc-300 font-medium">
              🟢 {isRoomLive ? 'Live Stream Active' : syncStatus}
            </span>
          </div>
        </div>

        {/* HOST VIEW: Dual Mode Switcher (Upload MP3 vs Live Broadcast Spotify) */}
        {isAdmin && (
          <div className="space-y-4">
            
            {/* Tab Controls */}
            <div className="flex rounded-xl bg-zinc-900/80 p-1 border border-white/10">
              <button
                onClick={() => setActiveTab('file')}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center space-x-2 transition ${
                  activeTab === 'file' ? 'bg-[#c1ff72] text-black shadow-lime-glow-sm' : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Disc className="w-3.5 h-3.5" />
                <span>📁 Upload Audio File</span>
              </button>

              <button
                onClick={() => setActiveTab('live')}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center space-x-2 transition ${
                  activeTab === 'live' ? 'bg-red-600 text-white shadow-red-500/40' : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Radio className="w-3.5 h-3.5" />
                <span>🎙️ Live System Audio (Spotify / Apple Music)</span>
              </button>
            </div>

            {/* TAB 1: MP3 Upload Dropzone */}
            {activeTab === 'file' && (
              <div>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="audio/*"
                  className="hidden"
                />
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`p-5 rounded-2xl border border-dashed transition cursor-pointer text-center ${
                    isDragging ? 'border-[#c1ff72] bg-[#c1ff72]/10' : 'border-white/15 bg-white/5 hover:border-white/30'
                  }`}
                >
                  <Upload className="w-5 h-5 text-[#c1ff72] mx-auto mb-1" />
                  <p className="text-xs font-medium text-zinc-300">
                    {isUploading ? 'Uploading...' : track ? 'Click or drop to replace audio file (MP3/WAV/AAC)' : 'Click or drop audio file here'}
                  </p>
                </div>
                {uploadError && <p className="mt-2 text-xs text-red-400">{uploadError}</p>}
              </div>
            )}

            {/* TAB 2: Live System / Spotify Audio Broadcaster */}
            {activeTab === 'live' && (
              <div className="p-5 rounded-2xl border border-white/10 bg-zinc-900/60 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h4 className="text-xs font-bold text-white flex items-center space-x-1.5">
                      <span>Stream Spotify, Apple Music & Desktop Audio</span>
                    </h4>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      Select your <span className="text-white font-semibold">Spotify Tab</span>, <span className="text-white font-semibold">Apple Music Tab</span>, or <span className="text-white font-semibold">System Audio</span> and check <span className="text-[#c1ff72] font-semibold">"Share Audio"</span> in the browser prompt.
                    </p>
                  </div>

                  <div className="flex items-center space-x-2">
                    {!isLiveBroadcasting ? (
                      <button
                        onClick={handleStartLiveBroadcast}
                        className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs shadow-lg shadow-red-500/30 transition flex items-center space-x-2 shrink-0"
                      >
                        <Radio className="w-4 h-4 animate-pulse" />
                        <span>Start Live Broadcast</span>
                      </button>
                    ) : (
                      <button
                        onClick={handleStopLiveBroadcast}
                        className="px-5 py-2.5 rounded-xl bg-zinc-800 border border-red-500/40 text-red-400 hover:bg-red-500/20 font-bold text-xs transition shrink-0"
                      >
                        Stop Broadcast
                      </button>
                    )}
                  </div>
                </div>

                {/* Host Speaker Monitoring Toggle & Hint */}
                {isLiveBroadcasting && (
                  <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 space-y-2">
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => setHostMonitoring(!hostMonitoring)}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-2 border ${
                          hostMonitoring
                            ? 'bg-[#c1ff72]/20 border-[#c1ff72]/40 text-[#c1ff72]'
                            : 'bg-zinc-800 border-white/10 text-zinc-400 hover:text-white'
                        }`}
                      >
                        {hostMonitoring ? <Volume2 className="w-3.5 h-3.5 text-[#c1ff72]" /> : <VolumeX className="w-3.5 h-3.5" />}
                        <span>{hostMonitoring ? '🔊 Host Speaker Monitoring: ON' : '🔇 Host Speaker Monitoring: OFF'}</span>
                      </button>

                      <span className="text-[11px] text-[#c1ff72] font-mono font-medium">
                        {hostMonitoring ? 'Synced Room Stream Playing' : 'Host Speakers Muted'}
                      </span>
                    </div>

                    <p className="text-[11px] text-zinc-400 leading-relaxed">
                      💡 <strong className="text-white">Tip for 100% Sync:</strong> Mute or lower the volume of your Spotify / Apple Music app window, and listen through PULSR so your laptop speakers match all listeners down to the millisecond!
                    </p>
                  </div>
                )}

                {liveStreamError && (
                  <p className="text-xs text-red-400 bg-red-500/10 p-2.5 rounded-xl border border-red-500/20">{liveStreamError}</p>
                )}
              </div>
            )}

          </div>
        )}

        {/* Waveform Progress Scrubber (Static File Mode) */}
        {!isRoomLive && (
          <div className="space-y-2">
            <div className="relative">
              <input
                type="range"
                min={0}
                max={duration || 100}
                step={0.1}
                value={currentTime}
                onChange={handleSeekChange}
                disabled={!isAdmin || !track}
                className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-[#c1ff72] disabled:cursor-not-allowed"
              />
              <div
                className="absolute top-0 left-0 h-2 bg-[#c1ff72] rounded-lg pointer-events-none"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="flex justify-between text-xs font-mono text-zinc-500">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>
        )}

        {/* Master Playback Controls & Volume */}
        <div className="flex items-center justify-between pt-2">
          
          <div>
            {!isRoomLive ? (
              isAdmin ? (
                <button
                  onClick={() => (isPlaying ? pauseTrack(currentTime) : playTrack(currentTime))}
                  disabled={!track}
                  className="w-14 h-14 rounded-full bg-[#c1ff72] text-black font-bold flex items-center justify-center hover:bg-lime-glow transition disabled:opacity-30"
                >
                  {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current ml-0.5" />}
                </button>
              ) : (
                <button
                  onClick={manualResync}
                  className="px-5 py-2.5 rounded-full bg-zinc-900 text-xs font-semibold text-[#c1ff72] border border-[#c1ff72]/30 hover:bg-zinc-800 transition"
                >
                  {isPlaying ? '🔊 Synchronized with Host' : '⏸️ Host Paused Audio'}
                </button>
              )
            ) : (
              <div className="flex items-center space-x-2 text-red-400 font-bold text-xs bg-red-600/10 px-4 py-2 rounded-full border border-red-500/20">
                <Radio className="w-4 h-4 animate-pulse" />
                <span>Streaming Live Audio</span>
              </div>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <button onClick={() => setIsMuted(!isMuted)} className="text-zinc-400 hover:text-white">
              {isMuted || volume === 0 ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-[#c1ff72]" />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={isMuted ? 0 : volume}
              onChange={(e) => { setIsMuted(false); setVolume(parseFloat(e.target.value)); }}
              className="w-20 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-[#c1ff72]"
            />
          </div>

        </div>

        {/* 4. HARDWARE LATENCY CALIBRATION SLIDER WITH (i) HOVER TOOLTIP */}
        <div className="pt-4 border-t border-white/5 space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <div className="flex items-center space-x-1.5">
              <Sliders className="w-3.5 h-3.5 text-[#c1ff72]" />
              <span>Bluetooth Calibration</span>
              
              <div className="relative group inline-flex items-center">
                <Info className="w-3.5 h-3.5 text-zinc-400 hover:text-[#c1ff72] cursor-pointer transition" />
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-black/95 text-zinc-200 text-[11px] font-normal leading-relaxed rounded-xl border border-white/20 shadow-2xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 z-50">
                  Compensates for hardware audio lag when connected to Bluetooth speakers or wireless headphones so all devices in the room sound in sync.
                </div>
              </div>
            </div>
            
            <span className="font-mono text-[#c1ff72]">{hardwareCalibration > 0 ? `+${hardwareCalibration}ms` : `${hardwareCalibration}ms`}</span>
          </div>

          <input
            type="range"
            min={-200}
            max={200}
            step={5}
            value={hardwareCalibration}
            onChange={(e) => setHardwareCalibration(parseInt(e.target.value, 10))}
            className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-[#c1ff72]"
          />
        </div>

      </div>

    </div>
  );
}
