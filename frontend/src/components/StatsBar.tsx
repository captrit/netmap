import React from 'react';
import { NetworkScanSummary } from '../types';
import { Server, Router, Shield, Zap, Cpu, Globe } from 'lucide-react';

interface StatsBarProps {
  summary: NetworkScanSummary | null;
  isScanning: boolean;
}

export const StatsBar: React.FC<StatsBarProps> = ({ summary, isScanning }) => {
  return (
    <div className="w-full grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 px-6 py-3 border-b border-white/10 bg-neutral-950/60 backdrop-blur-md">
      {/* Total Discovered Hosts */}
      <div className="glass-panel p-3 rounded-xl flex items-center justify-between border border-white/5 hover:border-white/10 transition-all">
        <div>
          <p className="text-[11px] font-mono font-medium text-neutral-400 uppercase tracking-wider">Total Hosts</p>
          <p className="text-xl font-bold text-white font-mono mt-0.5">
            {isScanning ? (
              <span className="animate-pulse text-cyan-400">Scanning...</span>
            ) : (
              summary?.totalHosts ?? 0
            )}
          </p>
        </div>
        <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
          <Server className="w-4 h-4 text-blue-400" />
        </div>
      </div>

      {/* Gateway & Routers */}
      <div className="glass-panel p-3 rounded-xl flex items-center justify-between border border-white/5 hover:border-white/10 transition-all">
        <div>
          <p className="text-[11px] font-mono font-medium text-neutral-400 uppercase tracking-wider">Gateways</p>
          <p className="text-xl font-bold text-cyan-300 font-mono mt-0.5">
            {summary?.gatewaysCount ?? 0}
          </p>
        </div>
        <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
          <Router className="w-4 h-4 text-cyan-400" />
        </div>
      </div>

      {/* Docker Bridges & Containers */}
      <div className="glass-panel p-3 rounded-xl flex items-center justify-between border border-white/5 hover:border-white/10 transition-all">
        <div>
          <p className="text-[11px] font-mono font-medium text-neutral-400 uppercase tracking-wider">Docker Subnets</p>
          <p className="text-xl font-bold text-emerald-400 font-mono mt-0.5">
            {summary?.dockerCount ?? 0}
          </p>
        </div>
        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
          <Cpu className="w-4 h-4 text-emerald-400" />
        </div>
      </div>

      {/* VPN Tunnel Endpoints */}
      <div className="glass-panel p-3 rounded-xl flex items-center justify-between border border-white/5 hover:border-white/10 transition-all">
        <div>
          <p className="text-[11px] font-mono font-medium text-neutral-400 uppercase tracking-wider">VPN Tunnel</p>
          <p className="text-xl font-bold text-amber-400 font-mono mt-0.5">
            {summary?.vpnCount ?? 0}
          </p>
        </div>
        <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
          <Globe className="w-4 h-4 text-amber-400" />
        </div>
      </div>

      {/* Open Ports Count */}
      <div className="glass-panel p-3 rounded-xl flex items-center justify-between border border-white/5 hover:border-white/10 transition-all">
        <div>
          <p className="text-[11px] font-mono font-medium text-neutral-400 uppercase tracking-wider">Open Ports</p>
          <p className="text-xl font-bold text-purple-400 font-mono mt-0.5">
            {summary?.openPortsCount ?? 0}
          </p>
        </div>
        <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
          <Shield className="w-4 h-4 text-purple-400" />
        </div>
      </div>

      {/* Average Latency */}
      <div className="glass-panel p-3 rounded-xl flex items-center justify-between border border-white/5 hover:border-white/10 transition-all">
        <div>
          <p className="text-[11px] font-mono font-medium text-neutral-400 uppercase tracking-wider">Avg Latency</p>
          <p className="text-xl font-bold text-neutral-100 font-mono mt-0.5">
            {summary?.avgLatencyMs ? `${summary.avgLatencyMs} ms` : '0 ms'}
          </p>
        </div>
        <div className="w-8 h-8 rounded-lg bg-neutral-800 border border-neutral-700 flex items-center justify-center">
          <Zap className="w-4 h-4 text-yellow-400" />
        </div>
      </div>
    </div>
  );
};
