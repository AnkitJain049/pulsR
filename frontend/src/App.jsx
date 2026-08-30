import React, { useEffect, useState, useRef } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useParams, useLocation } from 'react-router-dom';
import { useWebSocket } from './hooks/useWebSocket';
import { useAudioSync } from './hooks/useAudioSync';
import { useLiveAudioStream } from './hooks/useLiveAudioStream';
import { Header } from './components/Header';
import { RoomJoin } from './components/RoomJoin';
import { Player } from './components/Player';
import { DeviceList } from './components/DeviceList';
import { AudioVisualizer } from './components/AudioVisualizer';
import { ConfirmModal } from './components/ConfirmModal';
import { PulsrLiveStreamer } from './utils/PulsrLiveStreamer';

function MainAppContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const { roomId: urlRoomId } = useParams();

  const [showExitModal, setShowExitModal] = useState(false);
  const [hostMonitoring, setHostMonitoring] = useState(false); // Default false to prevent infinite audio feedback loops
  const isExitingRef = useRef(false);
  const streamerRef = useRef(null);

  const {
    socketRef,
    connected,
    session,
    roomState,
    role,
    latency,
    serverTimeOffset,
    hardwareCalibration,
    setHardwareCalibration,
    latestLiveChunk,
    error,
    createRoom,
    joinRoom,
    leaveRoom,
    discardRoom,
    updateTrack,
    playTrack,
    pauseTrack,
    seekTrack,
    updateProfile
  } = useWebSocket();

  // Initialize PulsrLiveStreamer singleton
  useEffect(() => {
    if (!streamerRef.current) {
      streamerRef.current = new PulsrLiveStreamer(socketRef);
    } else {
      streamerRef.current.setSocketRef(socketRef);
    }
  }, [socketRef]);

  const track = roomState?.track;
  const playback = roomState?.playback;
  const isHost = role === 'ADMIN' || role === 'admin';
  const isLiveBroadcast = roomState?.isLiveBroadcast || false;

  const totalOffset = serverTimeOffset + (hardwareCalibration / 1000);

  const {
    currentTime,
    duration,
    isMuted,
    setIsMuted,
    volume,
    setVolume,
    syncStatus,
    setupWebAudioAnalyser,
    analyserRef,
    manualResync
  } = useAudioSync(track, playback, totalOffset);

  // Live Stream Receiver Hook with Cristian's Algorithm Server Clock Synchronization
  const isReceiverActive = isLiveBroadcast && (!isHost || hostMonitoring);
  const { handleLiveChunk, listenerAnalyserRef, getAudioContext } = useLiveAudioStream(
    isReceiverActive,
    roomState?.liveMimeType,
    serverTimeOffset
  );

  useEffect(() => {
    if (latestLiveChunk?.chunk && isReceiverActive) {
      handleLiveChunk(latestLiveChunk);
    }
  }, [latestLiveChunk, isReceiverActive, handleLiveChunk]);

  // Global user gesture listener unlock for Web Audio AudioContext
  useEffect(() => {
    const unlockListenerAudio = () => {
      if (isReceiverActive) {
        getAudioContext();
      }
    };
    window.addEventListener('touchstart', unlockListenerAudio, { passive: true });
    window.addEventListener('click', unlockListenerAudio, { passive: true });
    return () => {
      window.removeEventListener('touchstart', unlockListenerAudio);
      window.removeEventListener('click', unlockListenerAudio);
    };
  }, [isReceiverActive, getAudioContext]);

  const isPlaying = playback?.isPlaying || false;

  // Reset exit flag when roomState changes
  useEffect(() => {
    if (roomState) {
      isExitingRef.current = false;
    }
  }, [roomState]);

  // 1. Synchronize URL route with room state
  useEffect(() => {
    if (roomState?.id) {
      const targetPath = `/room/${roomState.id}`;
      if (location.pathname !== targetPath) {
        navigate(targetPath, { replace: true });
      }
    } else if (!roomState && location.pathname.startsWith('/room/')) {
      navigate('/', { replace: true });
    }
  }, [roomState, location.pathname, navigate]);

  // 2. Direct URL Join / Page Refresh Persistence Support (auto re-joins room with stored device username on refresh)
  useEffect(() => {
    const targetRoomId = urlRoomId || localStorage.getItem('pulsr_active_room');
    const storedUsername = localStorage.getItem('pulsr_username') || session.username;

    if (connected && targetRoomId && (!roomState || roomState.id !== targetRoomId) && !isExitingRef.current) {
      joinRoom(targetRoomId, storedUsername);
    }
  }, [connected, urlRoomId, roomState, joinRoom, session.username]);

  // 3. Intercept Browser Back Button Navigation inside a room
  useEffect(() => {
    if (!roomState || isExitingRef.current) return;

    // Push single state entry so browser Back button triggers popstate without leaving room prematurely
    window.history.pushState({ inRoom: true }, '', location.pathname);

    const handlePopState = (e) => {
      if (isExitingRef.current) return;
      e.preventDefault();
      setShowExitModal(true);
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [roomState, location.pathname]);

  const handleConfirmExit = () => {
    isExitingRef.current = true;
    setShowExitModal(false);
    
    if (isHost) {
      discardRoom();
    } else {
      leaveRoom();
    }
    
    navigate('/', { replace: true });
  };

  const handleCancelExit = () => {
    setShowExitModal(false);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#09090b] text-white font-sans antialiased">
      
      {/* Header */}
      <Header
        connected={connected}
        session={session}
        roomState={roomState}
        role={role}
        latency={latency}
        updateProfile={updateProfile}
      />

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8">
        
        {!roomState ? (
          /* Lobby / Landing View (Route /) */
          <RoomJoin
            session={session}
            createRoom={createRoom}
            joinRoom={joinRoom}
            updateProfile={updateProfile}
            error={error}
          />
        ) : (
          /* Active Room Dashboard View (Route /room/:roomId) */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            
            {/* Left Column (2 Cols): Player Card & Visualizer */}
            <div className="lg:col-span-2 space-y-6">
              <Player
                role={role}
                roomState={roomState}
                session={session}
                socketRef={socketRef}
                streamerRef={streamerRef}
                hostMonitoring={hostMonitoring}
                setHostMonitoring={setHostMonitoring}
                updateTrack={updateTrack}
                playTrack={playTrack}
                pauseTrack={pauseTrack}
                seekTrack={seekTrack}
                currentTime={currentTime}
                duration={duration}
                isMuted={isMuted}
                setIsMuted={setIsMuted}
                volume={volume}
                setVolume={setVolume}
                syncStatus={syncStatus}
                manualResync={manualResync}
                hardwareCalibration={hardwareCalibration}
                setHardwareCalibration={setHardwareCalibration}
              />

              <AudioVisualizer
                isPlaying={isPlaying}
                isLiveBroadcast={isLiveBroadcast}
                isHost={isHost}
                setupWebAudioAnalyser={setupWebAudioAnalyser}
                analyserRef={analyserRef}
                streamerRef={streamerRef}
                listenerAnalyserRef={listenerAnalyserRef}
              />
            </div>

            {/* Right Column (1 Col): Tall Vertical Device Roster */}
            <div className="lg:col-span-1 h-full">
              <DeviceList
                roomState={roomState}
                session={session}
                role={role}
                leaveRoom={() => setShowExitModal(true)}
                discardRoom={() => setShowExitModal(true)}
              />
            </div>

          </div>
        )}

      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 py-6 text-center text-xs text-zinc-500">
        PULSR
      </footer>

      {/* Exit / Discard Confirmation Modal */}
      <ConfirmModal
        isOpen={showExitModal}
        isHost={isHost}
        onConfirm={handleConfirmExit}
        onCancel={handleCancelExit}
      />

    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainAppContent />} />
        <Route path="/room/:roomId" element={<MainAppContent />} />
        <Route path="*" element={<MainAppContent />} />
      </Routes>
    </BrowserRouter>
  );
}
