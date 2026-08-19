import React from 'react';
import {
  MagnifyingGlass,
  ArrowClockwise,
  SlidersHorizontal,
  ClockCounterClockwise,
  Graph,
  Table,
  Sun,
  Moon,
} from '@phosphor-icons/react';
import { Theme } from '../hooks/useTheme';

// Same node-graph mark as the browser favicon, in currentColor so it tracks
// the theme instead of the favicon's fixed white.
const BrandMark: React.FC<{ size?: number; className?: string }> = ({ size = 18, className }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className}>
    <line x1="16" y1="16" x2="7" y2="8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <line x1="16" y1="16" x2="25" y2="7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <line x1="16" y1="16" x2="6" y2="24" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <line x1="16" y1="16" x2="25" y2="25" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <circle cx="7" cy="8" r="2.6" fill="currentColor" />
    <circle cx="25" cy="7" r="2.6" fill="currentColor" />
    <circle cx="6" cy="24" r="2.6" fill="currentColor" />
    <circle cx="25" cy="25" r="3" fill="currentColor" />
    <circle cx="16" cy="16" r="4.2" fill="currentColor" />
  </svg>
);

interface TopFloatingBarProps {
  onStartScan: () => void;
  isScanning: boolean;
  activeView: 'graph' | 'table';
  setActiveView: (view: 'graph' | 'table') => void;
  activeInterface: string;
  onOpenSettings: () => void;
  onOpenHistory: () => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  totalNodesCount: number;
  theme: Theme;
  onToggleTheme: () => void;
}

export const TopFloatingBar: React.FC<TopFloatingBarProps> = ({
  onStartScan,
  isScanning,
  activeView,
  setActiveView,
  activeInterface,
  onOpenSettings,
  onOpenHistory,
  searchQuery,
  setSearchQuery,
  totalNodesCount,
  theme,
  onToggleTheme,
}) => {
  return (
    <div className="absolute top-4 left-6 right-6 z-30 flex items-center justify-between pointer-events-none select-none font-sans text-xs">
      {/* Left: Brand */}
      <div className="pointer-events-auto flex items-center gap-3 bg-surface/90 border border-border px-3.5 py-2 rounded-lg shadow-lg backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <BrandMark size={18} className="text-foreground" />
          <span className="font-semibold text-foreground tracking-wide text-xs">NETMAP</span>
          <span className="px-1.5 py-0.5 rounded-full bg-border/60 text-muted-foreground text-[10px] font-mono">
            {totalNodesCount} NODES
          </span>
        </div>
        <div className="h-3 w-px bg-border"></div>
        <span className="text-[11px] text-muted-foreground font-mono">
          IF: <span className="text-foreground font-medium">{activeInterface}</span>
        </span>
      </div>

      {/* Center: Search (graph view only) */}
      {activeView === 'graph' && (
        <div className="pointer-events-auto absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-96">
          <MagnifyingGlass size={16} className="absolute left-3.5 top-2.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search host, IP, MAC, vendor, port..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-surface/90 border border-border rounded-lg text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-accent transition-all shadow-lg backdrop-blur-xl font-sans"
          />
        </div>
      )}

      {/* Right: Controls */}
      <div className="pointer-events-auto flex items-center gap-2.5">
        <div className="flex items-center bg-surface/90 p-1 rounded-lg border border-border backdrop-blur-xl">
          <button
            onClick={() => setActiveView('graph')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              activeView === 'graph'
                ? 'bg-surface-hover text-foreground border border-border-strong shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Graph size={14} />
            Graph
          </button>
          <button
            onClick={() => setActiveView('table')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              activeView === 'table'
                ? 'bg-surface-hover text-foreground border border-border-strong shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Table size={14} />
            Matrix
          </button>
        </div>

        <button
          onClick={onToggleTheme}
          className="p-2 text-muted-foreground hover:text-foreground bg-surface/90 hover:bg-surface-hover border border-border rounded-lg transition-all shadow-lg backdrop-blur-xl"
          title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        <button
          onClick={onOpenHistory}
          className="p-2 text-muted-foreground hover:text-foreground bg-surface/90 hover:bg-surface-hover border border-border rounded-lg transition-all shadow-lg backdrop-blur-xl"
          title="Session Scan History"
        >
          <ClockCounterClockwise size={16} />
        </button>

        <button
          onClick={onOpenSettings}
          className="p-2 text-muted-foreground hover:text-foreground bg-surface/90 hover:bg-surface-hover border border-border rounded-lg transition-all shadow-lg backdrop-blur-xl"
          title="Network Config"
        >
          <SlidersHorizontal size={16} />
        </button>

        <button
          onClick={onStartScan}
          disabled={isScanning}
          className={`px-4 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all duration-200 flex items-center gap-2 border shadow-lg ${
            isScanning
              ? 'bg-surface border-border text-muted-foreground cursor-not-allowed'
              : 'bg-foreground text-background hover:opacity-85 border-foreground active:scale-95'
          }`}
        >
          <ArrowClockwise size={14} className={isScanning ? 'animate-spin' : ''} />
          {isScanning ? 'SCANNING...' : 'START SCAN'}
        </button>
      </div>
    </div>
  );
};
