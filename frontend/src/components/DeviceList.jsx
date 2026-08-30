import React from 'react';
import { Smartphone, Crown, LogOut, Users, Trash2 } from 'lucide-react';

export function DeviceList({ roomState, session, role, leaveRoom, discardRoom }) {
  const clients = roomState?.clients || [];
  const isAdmin = role === 'ADMIN' || role === 'admin';

  return (
    <div className="apple-glass rounded-3xl p-6 border border-white/10 h-full flex flex-col">
      
      {/* Header */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/5 shrink-0">
        <div className="flex items-center space-x-2">
          <Users className="w-4 h-4 text-[#c1ff72]" />
          <h4 className="font-bold text-sm text-white">
            Connected Devices ({clients.length})
          </h4>
        </div>

        {isAdmin ? (
          <button
            onClick={discardRoom}
            className="flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition"
            title="Permanently delete room from MongoDB and kick all listeners"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Discard Room</span>
          </button>
        ) : (
          <button
            onClick={leaveRoom}
            className="flex items-center space-x-1 px-3 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 text-xs font-medium hover:bg-red-500/20 transition"
          >
            <LogOut className="w-3 h-3" />
            <span>Leave</span>
          </button>
        )}
      </div>

      {/* Tall Scrollable Device Roster */}
      <div className="space-y-2.5 flex-1 max-h-[580px] overflow-y-auto pr-1">
        {clients.map((client, idx) => {
          const isYou = client.sessionId === session.sessionId;
          const isClientAdmin = client.role === 'ADMIN' || client.role === 'admin';

          return (
            <div
              key={client.sessionId || idx}
              className={`flex items-center justify-between p-3 rounded-2xl border transition ${
                isYou ? 'bg-zinc-900 border-[#c1ff72]/30 shadow-lime-glow-sm' : 'bg-zinc-900/40 border-white/5'
              }`}
            >
              <div className="flex items-center space-x-3">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                  isClientAdmin ? 'bg-[#c1ff72] text-black font-bold' : 'bg-zinc-800 text-zinc-400'
                }`}>
                  {isClientAdmin ? <Crown className="w-4 h-4 fill-current" /> : <Smartphone className="w-4 h-4" />}
                </div>

                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-semibold text-white max-w-[110px] truncate">
                      {client.username}
                    </span>
                    {isYou && (
                      <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-[#c1ff72]/20 text-[#c1ff72]">
                        You
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-zinc-500">
                    {isClientAdmin ? 'Host' : 'Listener'}
                  </span>
                </div>
              </div>

              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0 ${
                isClientAdmin ? 'bg-[#c1ff72] text-black' : 'bg-zinc-800 text-zinc-400'
              }`}>
                {isClientAdmin ? 'HOST' : 'LISTENER'}
              </span>
            </div>
          );
        })}
      </div>

    </div>
  );
}
