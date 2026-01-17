
import React from 'react';

interface VoiceWaveProps {
  isActive: boolean;
  status: string;
}

const VoiceWave: React.FC<VoiceWaveProps> = ({ isActive, status }) => {
  return (
    <div className="relative flex items-center justify-center w-64 h-64">
      {isActive && (
        <>
          <div className="absolute w-full h-full rounded-full bg-blue-500/20 pulse-ring"></div>
          <div className="absolute w-4/5 h-4/5 rounded-full bg-blue-500/30 pulse-ring" style={{ animationDelay: '0.2s' }}></div>
          <div className="absolute w-3/5 h-3/5 rounded-full bg-blue-500/40 pulse-ring" style={{ animationDelay: '0.4s' }}></div>
        </>
      )}
      
      <div className={`z-10 w-32 h-32 rounded-full flex items-center justify-center shadow-2xl transition-all duration-500 ${
        isActive ? 'bg-blue-600 scale-110' : 'bg-slate-800'
      }`}>
        <svg xmlns="http://www.w3.org/2000/svg" className={`h-12 w-12 text-white ${isActive ? 'animate-pulse' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
        </svg>
      </div>
      
      <div className="absolute -bottom-8 text-center w-full">
        <p className="text-sm font-medium tracking-widest uppercase text-slate-400">
          {status}
        </p>
      </div>
    </div>
  );
};

export default VoiceWave;
