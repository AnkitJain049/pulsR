import React, { useState } from 'react';
import { Plus, ArrowRight, Shuffle } from 'lucide-react';

export function RoomJoin({ session, createRoom, joinRoom, updateProfile, error }) {
  const [roomInput, setRoomInput] = useState('');

  const handleJoinSubmit = (e) => {
    e.preventDefault();
    if (roomInput.trim()) {
      let code = roomInput.trim().toUpperCase();
      if (!code.startsWith('ROOM-')) {
        code = `ROOM-${code}`;
      }
      joinRoom(code);
    }
  };

  const handleRandomizeUsername = () => {
    const ADJECTIVES = ['Neon', 'Groovy', 'Sonic', 'Pulsing', 'Velvet', 'Cosmic', 'Turbo', 'Electric', 'Funky', 'Hyper'];
    const ANIMALS = ['Otter', 'Flamingo', 'Panda', 'Falcon', 'Jaguar', 'Dolphin', 'Chameleon', 'Penguin', 'Fox', 'Koala'];
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
    const num = Math.floor(Math.random() * 90) + 10;
    updateProfile(`${adj} ${animal} ${num}`);
  };

  return (
    <div className="max-w-xl mx-auto my-12 px-4">
      
      {/* Prominent New Vector Logo Header */}
      <div className="text-center mb-10 space-y-6">
        <img
          src="/new.svg"
          alt="PULSR"
          className="h-24 sm:h-32 md:h-40 mx-auto object-contain drop-shadow-[0_0_40px_rgba(193,255,114,0.4)] hover:scale-105 transition-transform duration-300"
        />
        
        {/* User Identity Chip */}
        <div className="inline-flex items-center space-x-3 px-5 py-2.5 rounded-full bg-zinc-900 border border-white/10 text-xs">
          <span className="text-zinc-400 font-medium">Name:</span>
          <span className="font-bold text-white text-sm">⚡ {session.username || 'User'}</span>
          <button
            type="button"
            onClick={handleRandomizeUsername}
            className="p-1.5 rounded-full text-zinc-400 hover:text-[#c1ff72] transition hover:bg-white/5"
            title="Randomize Name"
          >
            <Shuffle className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="mb-6 p-3.5 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium text-center">
          {error}
        </div>
      )}

      {/* Action Cards */}
      <div className="space-y-4">
        
        {/* Create Room Button */}
        <button
          onClick={() => createRoom()}
          className="w-full p-6 rounded-3xl bg-[#c1ff72] text-black font-extrabold text-lg hover:bg-lime-glow transition flex items-center justify-between shadow-lime-glow group"
        >
          <div className="flex items-center space-x-3">
            <Plus className="w-6 h-6" />
            <span>Create Room</span>
          </div>
          <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
        </button>

        {/* Join Room Box */}
        <form onSubmit={handleJoinSubmit} className="p-6 rounded-3xl apple-glass border border-white/10 space-y-4">
          <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider">
            Join Room with Code
          </label>
          <div className="flex space-x-3">
            <input
              type="text"
              value={roomInput}
              onChange={(e) => setRoomInput(e.target.value)}
              placeholder="e.g. A4X9"
              className="flex-1 px-4 py-3.5 rounded-2xl bg-black border border-white/15 text-white font-mono text-center text-lg uppercase tracking-widest placeholder:text-zinc-700 focus:outline-none focus:border-[#c1ff72]"
              maxLength={9}
            />
            <button
              type="submit"
              disabled={!roomInput.trim()}
              className="px-6 py-3.5 rounded-2xl bg-white text-black font-bold text-sm hover:bg-zinc-200 transition disabled:opacity-30 disabled:pointer-events-none"
            >
              Join
            </button>
          </div>
        </form>

      </div>

    </div>
  );
}
