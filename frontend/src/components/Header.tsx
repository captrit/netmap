import React from 'react';
import { Activity, Network, ShieldCheck, RefreshCw, Layers, Sliders, Server } from 'lucide-react';

interface HeaderProps {
  onStartScan: () => void;
  isScanning: boolean;
  activeView: 'graph' | 'table';
  setActiveView: (view: 'graph' | 'table') => void;
  activeInterface: string;
  onOpenSettings: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onStartScan,
  isScanning,
  activeView,
  setActiveView,
  activeInterface,
  onOpenSettings,
}) => {
  return (
    <header className="sticky top-0 z-40 w-full glass-panel border-b border-white/10 px-6 py-3.5 flex items-center justify-between">
      {/* Brand & Emblem */}
      <div className="flex items-center gap-3.5">
        <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 via-purple-600 to-cyan-400 p-[1px] shadow-lg shadow-blue-500/20">
          <div className="w-full h-full bg-black rounded-[11px] flex items-center justify-center">
            <Network className="w-5 h-5 text-cyan-400 animate-pulse" />
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-bold tracking-tight text-white font-sans flex items-center gap-2">
              NETPULSE <span className="text-xs font-mono font-normal text-cyan-400 bg-cyan-950/60 border border-cyan-800/60 px-2 py-0.5 rounded-full">OBSIDIAN v1.0</span>
            </h1>
          </div>
          <p className="text-xs text-neutral-400 font-mono flex items-center gap-2 mt-0.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
            Interface: <span className="text-neutral-200 font-medium">{activeInterface}</span>
          </p>
        </div>
      </div>

      {/* Center Navigation Tabs */}
      <div className="flex items-center bg-neutral-900/90 p-1 rounded-lg border border-white/10">
        <button
          onClick={() => setActiveView('graph')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-medium transition-all ${
            activeView === 'graph'
              ? 'bg-neutral-800 text-white shadow-sm border border-white/10'
              : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/40'
          }`}
        >
          <Layers className="w-3.5 h-3.5 text-cyan-400" />
          Graph Topology
        </button>

        <button
          onClick={() => setActiveView('table')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-medium transition-all ${
            activeView === 'table'
              ? 'bg-neutral-800 text-white shadow-sm border border-white/10'
              : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/40'
          }`}
        >
          <Server className="w-3.5 h-3.5 text-purple-400" />
          Host Matrix
        </button>
      </div>

      {/* Action Controls */}
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenSettings}
          className="p-2 text-neutral-400 hover:text-white bg-neutral-900 hover:bg-neutral-800 border border-white/10 rounded-lg transition-all"
          title="Scan Configuration"
        >
          <Sliders className="w-4 h-4" />
        </button>

        {/* Start Scan Button */}
        <button
          onClick={onStartScan}
          disabled={isScanning}
          className={`relative group overflow-hidden px-5 py-2 rounded-lg text-xs font-semibold font-mono tracking-wide transition-all duration-300 flex items-center gap-2 border ${
            isScanning
              ? 'bg-neutral-900 border-cyan-500/50 text-cyan-400 cursor-not-allowed shadow-lg shadow-cyan-500/10'
              : 'bg-gradient-to-r from-blue-600 via-cyan-600 to-blue-500 hover:from-blue-500 hover:to-cyan-500 text-white border-cyan-400/30 shadow-lg shadow-blue-500/20 hover:shadow-cyan-500/30 active:scale-[0.98]'
          }`}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin text-cyan-400' : 'group-hover:rotate-180 transition-transform duration-500'}`} />
          {isScanning ? 'SCANNING NETWORK...' : 'START SCAN'}
        </button>
      </div>
    </header>
  );
};
