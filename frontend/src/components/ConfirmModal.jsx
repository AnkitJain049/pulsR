import React from 'react';
import { AlertTriangle, LogOut, Trash2, X } from 'lucide-react';

export function ConfirmModal({ isOpen, isHost, onConfirm, onCancel }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-md p-6 rounded-3xl apple-glass border border-white/15 bg-[#09090b]/95 shadow-2xl text-center space-y-6">
        
        {/* Close Button */}
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 p-2 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Icon */}
        <div className={`w-14 h-14 mx-auto rounded-2xl flex items-center justify-center ${
          isHost ? 'bg-red-500/10 border border-red-500/30 text-red-400' : 'bg-zinc-800 border border-white/10 text-[#c1ff72]'
        }`}>
          {isHost ? <Trash2 className="w-7 h-7" /> : <LogOut className="w-7 h-7" />}
        </div>

        {/* Text Details */}
        <div className="space-y-2">
          <h3 className="text-xl font-bold text-white">
            {isHost ? 'Discard Room?' : 'Leave Room?'}
          </h3>
          <p className="text-xs text-zinc-400 leading-relaxed max-w-xs mx-auto">
            {isHost
              ? 'As Host, discarding will permanently delete this room from MongoDB and disconnect all connected listeners.'
              : 'Are you sure you want to leave this synchronized audio room?'}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-3 pt-2">
          <button
            onClick={onCancel}
            className="flex-1 py-3.5 px-4 rounded-2xl bg-zinc-900 border border-white/10 text-white font-medium text-xs hover:bg-zinc-800 transition"
          >
            Cancel
          </button>

          <button
            onClick={onConfirm}
            className={`flex-1 py-3.5 px-4 rounded-2xl font-bold text-xs transition shadow-lg ${
              isHost
                ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-500/30'
                : 'bg-[#c1ff72] hover:bg-lime-glow text-black shadow-lime-glow'
            }`}
          >
            {isHost ? 'Discard Room' : 'Leave Room'}
          </button>
        </div>

      </div>
    </div>
  );
}
