import React, { useState } from 'react';
import { Wifi, User, Edit2, Check } from 'lucide-react';

export function Header({ connected, session, roomState, role, latency, updateProfile }) {
  const [isEditing, setIsEditing] = useState(false);
  const [tempName, setTempName] = useState(session.username || '');

  const handleSaveProfile = () => {
    if (tempName.trim()) {
      updateProfile(tempName.trim());
      setIsEditing(false);
    }
  };

  return (
    <header className="w-full border-b border-white/10 bg-[#09090b]/80 backdrop-blur-xl sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-6 h-20 flex items-center justify-between">
        
        {/* Prominent New SVG Brand Logo */}
        <div className="flex items-center space-x-3 select-none">
          <img
            src="/new.svg"
            alt="PULSR"
            className="h-10 sm:h-12 w-auto object-contain drop-shadow-[0_0_15px_rgba(193,255,114,0.35)] hover:scale-105 transition-transform duration-300"
          />
        </div>

        {/* Center: Minimal Active Room Pill */}
        {roomState && (
          <div className="hidden sm:flex items-center space-x-3 px-4 py-2 rounded-full bg-zinc-900 border border-white/10 text-xs">
            <span className="font-mono font-bold tracking-widest text-[#c1ff72]">{roomState.id}</span>
            <span className="text-zinc-500">•</span>
            <span className="text-zinc-300 font-medium">
              {role === 'ADMIN' || role === 'admin' ? 'Host' : 'Listener'}
            </span>
          </div>
        )}

        {/* Right: Latency & User Profile */}
        <div className="flex items-center space-x-3 text-xs">
          
          <div className="flex items-center space-x-2 px-3.5 py-2 rounded-full bg-zinc-900 border border-white/10 text-zinc-300">
            <div className={`w-2 h-2 rounded-full ${connected ? 'bg-[#c1ff72]' : 'bg-red-500'}`} />
            <Wifi className="w-3.5 h-3.5 text-zinc-400" />
            <span className="font-mono">{latency}ms</span>
          </div>

          <div className="flex items-center space-x-2 bg-zinc-900 border border-white/10 px-3.5 py-2 rounded-full text-zinc-200">
            <User className="w-3.5 h-3.5 text-[#c1ff72]" />
            {isEditing ? (
              <div className="flex items-center space-x-1">
                <input
                  type="text"
                  value={tempName}
                  onChange={(e) => setTempName(e.target.value)}
                  className="bg-black text-white text-xs px-2 py-0.5 rounded border border-[#c1ff72] focus:outline-none w-28"
                  autoFocus
                />
                <button onClick={handleSaveProfile} className="p-1 rounded-full bg-[#c1ff72] text-black">
                  <Check className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-1.5">
                <span className="font-medium max-w-[110px] truncate">{session.username || 'User'}</span>
                <button onClick={() => { setTempName(session.username); setIsEditing(true); }} className="text-zinc-500 hover:text-white">
                  <Edit2 className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>

        </div>

      </div>
    </header>
  );
}
