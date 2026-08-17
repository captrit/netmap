import React from 'react';
import { GraphSettings } from '../types';
import { SlidersHorizontal, ArrowClockwise, Eye, Lightning, SquaresFour } from '@phosphor-icons/react';

interface GraphControlsProps {
  settings: GraphSettings;
  onUpdateSettings: (newSettings: Partial<GraphSettings>) => void;
  onResetLayout: () => void;
}

export const GraphControls: React.FC<GraphControlsProps> = ({
  settings,
  onUpdateSettings,
  onResetLayout,
}) => {
  return (
    <div className="absolute top-20 right-6 z-20 w-72 bg-[#141417]/95 p-4 rounded-xl border border-zinc-800 shadow-2xl backdrop-blur-xl select-none">
      <div className="flex items-center justify-between pb-3 border-b border-zinc-800 mb-3">
        <h3 className="text-xs font-bold font-mono text-white flex items-center gap-2 uppercase tracking-wider">
          <SlidersHorizontal size={16} className="text-zinc-400" />
          Graph Parameters
        </h3>
        <button
          onClick={onResetLayout}
          className="p-1 text-zinc-400 hover:text-white rounded hover:bg-zinc-800 transition-all"
          title="Reset Layout"
        >
          <ArrowClockwise size={14} />
        </button>
      </div>

      <div className="space-y-4 text-xs font-mono">
        {/* Repulsion Force */}
        <div>
          <div className="flex items-center justify-between text-zinc-400 mb-1.5">
            <span>Node Spacing</span>
            <span className="text-white font-bold">{settings.repulsion}</span>
          </div>
          <input
            type="range"
            min="2000"
            max="12000"
            step="500"
            value={settings.repulsion}
            onChange={(e) => onUpdateSettings({ repulsion: Number(e.target.value) })}
            className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-white"
          />
        </div>

        {/* Link Distance */}
        <div>
          <div className="flex items-center justify-between text-zinc-400 mb-1.5">
            <span>Link Spring Length</span>
            <span className="text-white font-bold">{settings.linkDistance}px</span>
          </div>
          <input
            type="range"
            min="80"
            max="300"
            step="10"
            value={settings.linkDistance}
            onChange={(e) => onUpdateSettings({ linkDistance: Number(e.target.value) })}
            className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-white"
          />
        </div>

        {/* Toggles */}
        <div className="pt-2 border-t border-zinc-800 space-y-2.5">
          <label className="flex items-center justify-between cursor-pointer group">
            <span className="text-zinc-300 flex items-center gap-2">
              <Eye size={14} className="text-zinc-400" />
              Show Open Ports on Nodes
            </span>
            <input
              type="checkbox"
              checked={settings.showPorts}
              onChange={(e) => onUpdateSettings({ showPorts: e.target.checked })}
              className="w-4 h-4 rounded bg-zinc-900 border-zinc-700 text-white focus:ring-0 cursor-pointer"
            />
          </label>

          <label className="flex items-center justify-between cursor-pointer group">
            <span className="text-zinc-300 flex items-center gap-2">
              <Lightning size={14} className="text-zinc-400" />
              Animate Packet Traffic
            </span>
            <input
              type="checkbox"
              checked={settings.animateParticles}
              onChange={(e) => onUpdateSettings({ animateParticles: e.target.checked })}
              className="w-4 h-4 rounded bg-zinc-900 border-zinc-700 text-white focus:ring-0 cursor-pointer"
            />
          </label>

          <label className="flex items-center justify-between cursor-pointer group">
            <span className="text-zinc-300 flex items-center gap-2">
              <SquaresFour size={14} className="text-zinc-400" />
              Show Canvas Grid Lines
            </span>
            <input
              type="checkbox"
              checked={settings.showGrid}
              onChange={(e) => onUpdateSettings({ showGrid: e.target.checked })}
              className="w-4 h-4 rounded bg-zinc-900 border-zinc-700 text-white focus:ring-0 cursor-pointer"
            />
          </label>
        </div>
      </div>
    </div>
  );
};
