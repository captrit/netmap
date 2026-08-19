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
    <div className="absolute top-20 right-6 z-20 w-72 bg-surface/95 p-4 rounded-lg border border-border shadow-lg backdrop-blur-xl select-none font-sans">
      <div className="flex items-center justify-between pb-3 border-b border-border mb-3">
        <h3 className="text-xs font-semibold text-foreground flex items-center gap-2 uppercase tracking-wide">
          <SlidersHorizontal size={16} className="text-muted-foreground" />
          Graph Parameters
        </h3>
        <button
          onClick={onResetLayout}
          className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-surface-hover transition-all"
          title="Reset Layout"
        >
          <ArrowClockwise size={14} />
        </button>
      </div>

      <div className="space-y-4 text-xs">
        {/* Repulsion Force */}
        <div>
          <div className="flex items-center justify-between text-muted-foreground mb-1.5">
            <span>Node Spacing</span>
            <span className="text-foreground font-mono font-medium">{settings.repulsion}</span>
          </div>
          <input
            type="range"
            min="2000"
            max="12000"
            step="500"
            value={settings.repulsion}
            onChange={(e) => onUpdateSettings({ repulsion: Number(e.target.value) })}
            className="w-full h-1.5 bg-border rounded-lg appearance-none cursor-pointer accent-accent"
          />
        </div>

        {/* Link Distance */}
        <div>
          <div className="flex items-center justify-between text-muted-foreground mb-1.5">
            <span>Link Spring Length</span>
            <span className="text-foreground font-mono font-medium">{settings.linkDistance}px</span>
          </div>
          <input
            type="range"
            min="80"
            max="300"
            step="10"
            value={settings.linkDistance}
            onChange={(e) => onUpdateSettings({ linkDistance: Number(e.target.value) })}
            className="w-full h-1.5 bg-border rounded-lg appearance-none cursor-pointer accent-accent"
          />
        </div>

        {/* Toggles */}
        <div className="pt-2 border-t border-border space-y-2.5">
          <label className="flex items-center justify-between cursor-pointer group">
            <span className="text-foreground/80 flex items-center gap-2">
              <Eye size={14} className="text-muted-foreground" />
              Show Open Ports on Nodes
            </span>
            <input
              type="checkbox"
              checked={settings.showPorts}
              onChange={(e) => onUpdateSettings({ showPorts: e.target.checked })}
              className="w-4 h-4 rounded bg-surface border-border-strong text-accent focus:ring-0 cursor-pointer"
            />
          </label>

          <label className="flex items-center justify-between cursor-pointer group">
            <span className="text-foreground/80 flex items-center gap-2">
              <Lightning size={14} className="text-muted-foreground" />
              Animate Packet Traffic
            </span>
            <input
              type="checkbox"
              checked={settings.animateParticles}
              onChange={(e) => onUpdateSettings({ animateParticles: e.target.checked })}
              className="w-4 h-4 rounded bg-surface border-border-strong text-accent focus:ring-0 cursor-pointer"
            />
          </label>

          <label className="flex items-center justify-between cursor-pointer group">
            <span className="text-foreground/80 flex items-center gap-2">
              <SquaresFour size={14} className="text-muted-foreground" />
              Show Canvas Grid Lines
            </span>
            <input
              type="checkbox"
              checked={settings.showGrid}
              onChange={(e) => onUpdateSettings({ showGrid: e.target.checked })}
              className="w-4 h-4 rounded bg-surface border-border-strong text-accent focus:ring-0 cursor-pointer"
            />
          </label>
        </div>
      </div>
    </div>
  );
};
