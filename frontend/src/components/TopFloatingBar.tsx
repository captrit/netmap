import React from 'react';
import { 
  MagnifyingGlass, 
  ArrowClockwise, 
  SlidersHorizontal, 
  Graph, 
  Table, 
  Cpu 
} from '@phosphor-icons/react';

interface TopFloatingBarProps {
  onStartScan: () => void;
  isScanning: boolean;
  activeView: 'graph' | 'table';
  setActiveView: (view: 'graph' | 'table') => void;
  activeInterface: string;
  onOpenSettings: () => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  totalNodesCount: number;
}

export const TopFloatingBar: React.FC<TopFloatingBarProps> = ({
  onStartScan,
  isScanning,
  activeView,
  setActiveView,
  activeInterface,
  onOpenSettings,
  searchQuery,
  setSearchQuery,
  totalNodesCount,
}) => {
  return (
    <div className="absolute top-4 left-6 right-6 z-30 flex items-center justify-between pointer-events-none select-none font-mono text-xs">
      <div className="pointer-events-auto flex items-center gap-3 bg-[#141417]/90 border border-zinc-800 px-3.5 py-2 rounded-xl shadow-2xl backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <Cpu size={18} className="text-white" />
          <span className="font-bold text-white tracking-wider text-xs">NETPULSE</span>
          <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[10px]">
            {totalNodesCount} NODES
          </span>
        </div>
        <div className="h-3 w-[1px] bg-zinc-800"></div>
        <span className="text-[11px] text-zinc-400">
          IF: <span className="text-zinc-200 font-bold">{activeInterface}</span>
        </span>
      </div>

      {activeView === 'graph' && (
        <div className="pointer-events-auto relative w-80">
          <MagnifyingGlass size={16} className="absolute left-3.5 top-2.5 text-zinc-400" />
          <input
            type="text"
            placeholder="Search host, IP, MAC, port..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-[#141417]/90 border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-white transition-all shadow-2xl backdrop-blur-xl font-mono"
          />
        </div>
      )}

      <div className="pointer-events-auto flex items-center gap-2.5">
        <div className="flex items-center bg-[#141417]/90 p-1 rounded-xl border border-zinc-800 backdrop-blur-xl">
          <button
            onClick={() => setActiveView('graph')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeView === 'graph'
                ? 'bg-zinc-800 text-white border border-zinc-700 shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Graph size={14} />
            Graph
          </button>
          <button
            onClick={() => setActiveView('table')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeView === 'table'
                ? 'bg-zinc-800 text-white border border-zinc-700 shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Table size={14} />
            Matrix
          </button>
        </div>

        <button
          onClick={onOpenSettings}
          className="p-2 text-zinc-400 hover:text-white bg-[#141417]/90 hover:bg-zinc-800 border border-zinc-800 rounded-xl transition-all shadow-2xl backdrop-blur-xl"
          title="Network Config"
        >
          <SlidersHorizontal size={16} />
        </button>

        <button
          onClick={onStartScan}
          disabled={isScanning}
          className={`px-4 py-2 rounded-xl text-xs font-bold font-mono tracking-wider transition-all duration-200 flex items-center gap-2 border shadow-2xl ${
            isScanning
              ? 'bg-zinc-900 border-zinc-700 text-zinc-400 cursor-not-allowed'
              : 'bg-white text-black hover:bg-zinc-200 border-white active:scale-95'
          }`}
        >
          <ArrowClockwise size={14} className={isScanning ? 'animate-spin text-black' : ''} />
          {isScanning ? 'SCANNING...' : 'START SCAN'}
        </button>
      </div>
    </div>
  );
};
