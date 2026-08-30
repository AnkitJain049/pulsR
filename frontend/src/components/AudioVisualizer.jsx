import React, { useEffect, useRef } from 'react';

export function AudioVisualizer({ isPlaying, setupWebAudioAnalyser, analyserRef, streamerRef, isLiveBroadcast }) {
  const canvasRef = useRef(null);
  const animFrameRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let width = (canvas.width = canvas.parentElement.clientWidth || 600);
    let height = (canvas.height = 100);

    const handleResize = () => {
      if (canvas && canvas.parentElement) {
        width = canvas.width = canvas.parentElement.clientWidth;
        height = canvas.height = 100;
      }
    };
    window.addEventListener('resize', handleResize);

    if (isPlaying && setupWebAudioAnalyser && !isLiveBroadcast) {
      setupWebAudioAnalyser();
    }

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      let analyser = analyserRef?.current;
      
      // If Host Live Broadcast is active, get live system audio analyser
      if (isLiveBroadcast && streamerRef?.current) {
        const liveAnalyser = streamerRef.current.getLiveAnalyser();
        if (liveAnalyser) analyser = liveAnalyser;
      }

      const barCount = 40;
      const barWidth = (width / barCount) - 4;

      if ((isPlaying || isLiveBroadcast) && analyser) {
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteFrequencyData(dataArray);

        // Check if there is actual audio output signal
        let totalVolume = 0;
        for (let i = 0; i < bufferLength; i++) {
          totalVolume += dataArray[i];
        }

        if (totalVolume > 0) {
          // Render real frequency bars driven by actual sound output
          for (let i = 0; i < barCount; i++) {
            const index = Math.floor((i / barCount) * bufferLength);
            const value = dataArray[index] || 0;
            const barHeight = (value / 255) * (height - 10) + 4;

            const x = i * (barWidth + 4);
            const y = height - barHeight;

            ctx.fillStyle = '#c1ff72';
            ctx.beginPath();
            ctx.roundRect(x, y, barWidth, barHeight, [3, 3, 0, 0]);
            ctx.fill();
          }
        } else {
          // Silent or paused: render flat 4px baseline bars
          for (let i = 0; i < barCount; i++) {
            const barHeight = 4;
            const x = i * (barWidth + 4);
            const y = height - barHeight;

            ctx.fillStyle = 'rgba(193, 255, 114, 0.3)';
            ctx.beginPath();
            ctx.roundRect(x, y, barWidth, barHeight, 2);
            ctx.fill();
          }
        }
      } else {
        // Idle / Standby: render dim static baseline bars
        for (let i = 0; i < barCount; i++) {
          const barHeight = 4;
          const x = i * (barWidth + 4);
          const y = height - barHeight;

          ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, barHeight, 2);
          ctx.fill();
        }
      }

      animFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying, isLiveBroadcast, setupWebAudioAnalyser, analyserRef, streamerRef]);

  return (
    <div className="w-full apple-glass rounded-3xl p-5 border border-white/10">
      <div className="flex items-center justify-between px-1 mb-3">
        <span className="text-xs font-semibold text-zinc-400">
          {isLiveBroadcast ? 'Live Audio Visualizer' : 'Visualizer'}
        </span>
        <div className="flex items-center space-x-2">
          <div className={`w-2 h-2 rounded-full ${(isPlaying || isLiveBroadcast) ? 'bg-[#c1ff72]' : 'bg-zinc-600'}`} />
          <span className="text-[11px] font-mono text-zinc-500">
            {(isPlaying || isLiveBroadcast) ? (isLiveBroadcast ? 'Live Stream' : 'Active') : 'Standby'}
          </span>
        </div>
      </div>
      <canvas ref={canvasRef} className="w-full h-[100px] block" />
    </div>
  );
}
