import React from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { useAudioSync } from './hooks/useAudioSync';
import { Header } from './components/Header';
import { RoomJoin } from './components/RoomJoin';
import { Player } from './components/Player';
import { DeviceList } from './components/DeviceList';
import { AudioVisualizer } from './components/AudioVisualizer';

export default function App() {
  const {
    connected,
    session,
    roomState,
    role,
    latency,
    serverTimeOffset,
    hardwareCalibration,
    setHardwareCalibration,
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

  const track = roomState?.track;
  const playback = roomState?.playback;

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

  const isPlaying = playback?.isPlaying || false;

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
          /* Lobby / Landing View */
          <RoomJoin
            session={session}
            createRoom={createRoom}
            joinRoom={joinRoom}
            updateProfile={updateProfile}
            error={error}
          />
        ) : (
          /* Active Room Dashboard View: Player & Visualizer on Left (2 cols), Device Mesh on Right (1 col from top) */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            
            {/* Left Column (2 Cols): Player Card & Visualizer */}
            <div className="lg:col-span-2 space-y-6">
              <Player
                role={role}
                roomState={roomState}
                session={session}
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
                setupWebAudioAnalyser={setupWebAudioAnalyser}
                analyserRef={analyserRef}
              />
            </div>

            {/* Right Column (1 Col): Tall Vertical Device Roster (Flows from top) */}
            <div className="lg:col-span-1 h-full">
              <DeviceList
                roomState={roomState}
                session={session}
                role={role}
                leaveRoom={leaveRoom}
                discardRoom={discardRoom}
              />
            </div>

          </div>
        )}

      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 py-6 text-center text-xs text-zinc-500">
        PULSR
      </footer>

    </div>
  );
}
