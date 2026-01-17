
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';
import VoiceWave from './components/VoiceWave';
import { ConnectionStatus, Message } from './types';
import { decode, encode, decodeAudioData, createPcmBlob } from './utils/audio-utils';

const SYSTEM_INSTRUCTION = `You are "Aria", a world-class Credit Repair Specialist for "CreditRevive Solutions". 
Your goal is to help clients understand their credit reports, identify errors, and explain the steps to improve their financial health.
Be professional, empathetic, and encouraging. 
Key responsibilities:
1. Explain how FICO scores are calculated.
2. Discuss the difference between hard and soft inquiries.
3. Advise on disputing inaccuracies (late payments, collections, incorrect balances).
4. Provide strategies for paying down debt.
5. Answer questions about bankruptcy, charge-offs, and student loans.
Keep responses concise for voice interaction. If the user sounds stressed, reassure them that credit is repairable.`;

const App: React.FC = () => {
  const [status, setStatus] = useState<ConnectionStatus>(ConnectionStatus.IDLE);
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentInput, setCurrentInput] = useState('');
  const [currentOutput, setCurrentOutput] = useState('');
  
  const nextStartTimeRef = useRef(0);
  const audioContextsRef = useRef<{ input: AudioContext; output: AudioContext } | null>(null);
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const sessionRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const addMessage = (role: 'user' | 'agent', text: string) => {
    if (!text.trim()) return;
    setMessages(prev => [...prev.slice(-10), { role, text, timestamp: new Date() }]);
  };

  const stopAllAudio = () => {
    audioSourcesRef.current.forEach(source => {
      try { source.stop(); } catch (e) {}
    });
    audioSourcesRef.current.clear();
    nextStartTimeRef.current = 0;
  };

  const handleMessage = useCallback(async (message: LiveServerMessage) => {
    // Transcriptions
    if (message.serverContent?.inputTranscription) {
      setCurrentInput(prev => prev + message.serverContent!.inputTranscription!.text);
    }
    if (message.serverContent?.outputTranscription) {
      setCurrentOutput(prev => prev + message.serverContent!.outputTranscription!.text);
    }

    if (message.serverContent?.turnComplete) {
      // Functional state updates to avoid closure issues
      setCurrentInput(finalInput => {
        if (finalInput) addMessage('user', finalInput);
        return '';
      });
      setCurrentOutput(finalOutput => {
        if (finalOutput) addMessage('agent', finalOutput);
        return '';
      });
    }

    // Interruption
    if (message.serverContent?.interrupted) {
      stopAllAudio();
    }

    // Audio Output
    const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
    if (audioData && audioContextsRef.current) {
      const { output: outputCtx } = audioContextsRef.current;
      const audioBuffer = await decodeAudioData(decode(audioData), outputCtx, 24000, 1);
      
      const source = outputCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(outputCtx.destination);
      
      const startTime = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
      source.start(startTime);
      nextStartTimeRef.current = startTime + audioBuffer.duration;
      
      audioSourcesRef.current.add(source);
      source.onended = () => audioSourcesRef.current.delete(source);
    }
  }, []);

  const startSession = async () => {
    try {
      setStatus(ConnectionStatus.CONNECTING);
      
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      audioContextsRef.current = { input: inputCtx, output: outputCtx };

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: SYSTEM_INSTRUCTION,
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {}
        },
        callbacks: {
          onopen: () => {
            setStatus(ConnectionStatus.CONNECTED);
            
            // Setup Mic Stream to API
            const micSource = inputCtx.createMediaStreamSource(stream);
            const processor = inputCtx.createScriptProcessor(4096, 1, 1);
            
            processor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const blob = createPcmBlob(inputData);
              sessionPromise.then(session => {
                session.sendRealtimeInput({ media: blob });
              });
            };

            micSource.connect(processor);
            processor.connect(inputCtx.destination);
          },
          onmessage: handleMessage,
          onerror: (err) => {
            console.error('Gemini Live Error:', err);
            setStatus(ConnectionStatus.ERROR);
          },
          onclose: () => {
            setStatus(ConnectionStatus.IDLE);
            stopSession();
          }
        }
      });

      sessionRef.current = await sessionPromise;

    } catch (err) {
      console.error('Failed to start session:', err);
      setStatus(ConnectionStatus.ERROR);
    }
  };

  const stopSession = () => {
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (audioContextsRef.current) {
      audioContextsRef.current.input.close();
      audioContextsRef.current.output.close();
      audioContextsRef.current = null;
    }
    stopAllAudio();
    setStatus(ConnectionStatus.IDLE);
  };

  const getStatusText = () => {
    switch (status) {
      case ConnectionStatus.IDLE: return 'Tap to Start';
      case ConnectionStatus.CONNECTING: return 'Connecting...';
      case ConnectionStatus.CONNECTED: return 'Aria is Listening';
      case ConnectionStatus.ERROR: return 'Connection Failed';
      default: return '';
    }
  };

  return (
    <div className="flex flex-col h-full max-w-lg mx-auto bg-slate-900 shadow-2xl overflow-hidden">
      {/* Header */}
      <header className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/50 backdrop-blur-md sticky top-0 z-20">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
            CreditRevive AI
          </h1>
          <p className="text-xs text-slate-400">Agentic Voice Specialist: Aria</p>
        </div>
        {status === ConnectionStatus.CONNECTED && (
          <button 
            onClick={stopSession}
            className="px-4 py-1 bg-red-500/10 text-red-400 border border-red-500/20 rounded-full text-xs font-semibold hover:bg-red-500/20 transition-all"
          >
            End Call
          </button>
        )}
      </header>

      {/* Main Experience */}
      <main className="flex-1 relative flex flex-col items-center justify-center overflow-hidden">
        {/* Background Gradients */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[150%] h-[150%] bg-gradient-to-br from-blue-600/10 via-transparent to-purple-600/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="z-10 flex flex-col items-center">
          <VoiceWave 
            isActive={status === ConnectionStatus.CONNECTED} 
            status={getStatusText()} 
          />
          
          {status === ConnectionStatus.IDLE && (
            <button 
              onClick={startSession}
              className="mt-16 px-10 py-4 bg-white text-slate-950 rounded-full font-bold shadow-xl hover:scale-105 transition-transform active:scale-95"
            >
              Start Consultation
            </button>
          )}

          {status === ConnectionStatus.ERROR && (
            <button 
              onClick={startSession}
              className="mt-16 px-10 py-4 bg-red-600 text-white rounded-full font-bold shadow-xl hover:bg-red-700 transition-all"
            >
              Retry Connection
            </button>
          )}
        </div>

        {/* Real-time Transcription Floating Bar */}
        {(currentInput || currentOutput) && (
          <div className="absolute bottom-32 left-0 right-0 px-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="bg-slate-800/80 backdrop-blur-lg border border-slate-700 p-4 rounded-2xl shadow-lg">
              <p className="text-xs font-bold text-slate-500 mb-1 uppercase tracking-tighter">
                {currentInput ? 'Recognizing...' : 'Aria is speaking...'}
              </p>
              <p className="text-sm text-slate-200 line-clamp-2 italic">
                {currentInput || currentOutput}
              </p>
            </div>
          </div>
        )}
      </main>

      {/* Call History / Transcript Mini View */}
      <footer className="h-1/3 bg-slate-950 p-6 overflow-y-auto border-t border-slate-800">
        <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Live Transcript</h2>
        <div className="space-y-4">
          {messages.length === 0 && (
            <p className="text-sm text-slate-600 italic">No recent conversation logs.</p>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${
                msg.role === 'user' 
                  ? 'bg-blue-600/20 text-blue-200 border border-blue-500/20' 
                  : 'bg-slate-800 text-slate-300 border border-slate-700'
              }`}>
                {msg.text}
              </div>
              <span className="text-[10px] text-slate-600 mt-1">
                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          ))}
        </div>
      </footer>
    </div>
  );
};

export default App;
