import React, { useState } from 'react';
import { NetworkNode } from '../types';
import {
  User,
  MagnifyingGlass,
  Desktop,
  DeviceMobile,
  HardDrive,
  Database,
  Globe,
  Cube,
  ShieldCheckered,
  ArrowsDownUp,
  Lightning,
  Printer,
  Television,
  Cpu,
  HardDrives,
} from '@phosphor-icons/react';

interface HostTableProps {
  nodes: NetworkNode[];
  onSelectNode: (node: NetworkNode) => void;
}

export const HostTable: React.FC<HostTableProps> = ({ nodes, onSelectNode }) => {
  const [filterQuery, setFilterQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'ip' | 'latency' | 'ports'>('ip');

  const filteredNodes = nodes.filter((n) => {
    const matchesSearch =
      n.ip.toLowerCase().includes(filterQuery.toLowerCase()) ||
      n.label.toLowerCase().includes(filterQuery.toLowerCase()) ||
      (n.vendor && n.vendor.toLowerCase().includes(filterQuery.toLowerCase()));

    const matchesCategory = selectedCategory === 'all' || n.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  const sortedNodes = [...filteredNodes].sort((a, b) => {
    if (sortBy === 'latency') return a.latencyMs - b.latencyMs;
    if (sortBy === 'ports') return b.ports.length - a.ports.length;
    return a.ip.localeCompare(b.ip);
  });

  const getDeviceIcon = (type: string) => {
    switch (type) {
      case 'user': return <User size={14} />;
      case 'service': return <Lightning size={14} />;
      case 'laptop': return <Desktop size={14} />;
      case 'mobile': return <DeviceMobile size={14} />;
      case 'server': return <HardDrive size={14} />;
      case 'database': return <Database size={14} />;
      case 'router': return <Globe size={14} />;
      case 'docker': return <Cube size={14} />;
      case 'vpn': return <ShieldCheckered size={14} />;
      case 'printer': return <Printer size={14} />;
      case 'tv': return <Television size={14} />;
      case 'iot': return <Cpu size={14} />;
      case 'nas': return <HardDrives size={14} />;
      default: return <Desktop size={14} />;
    }
  };

  return (
    <div className="w-full h-full pt-24 px-6 pb-6 bg-background flex flex-col gap-4 overflow-hidden font-sans select-none">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-surface p-4 rounded-xl border border-border">
        <div className="relative flex-1 min-w-[240px]">
          <MagnifyingGlass size={16} className="absolute left-3.5 top-2.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Filter by IP, Hostname, MAC, Vendor..."
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-background border border-border-strong rounded-lg text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-accent transition-all font-sans"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2 bg-background border border-border-strong rounded-lg text-xs text-foreground focus:outline-none focus:border-accent"
          >
            <option value="all">All Subnodes ({nodes.length})</option>
            <option value="localhost">YOU (Root)</option>
            <option value="service">Exposed Services</option>
            <option value="gateway">Gateways</option>
            <option value="host">LAN Hosts</option>
            <option value="docker">Docker Containers</option>
            <option value="vpn">VPN Tunnels</option>
          </select>

          <button
            onClick={() => setSortBy(sortBy === 'latency' ? 'ports' : 'latency')}
            className="flex items-center gap-2 px-3 py-2 bg-background border border-border-strong hover:bg-surface-hover rounded-lg text-xs text-foreground/80 transition-all"
          >
            <ArrowsDownUp size={14} className="text-muted-foreground" />
            Sort by {sortBy}
          </button>
        </div>
      </div>

      <div className="flex-1 bg-surface rounded-xl border border-border overflow-hidden flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border bg-surface-hover/60 text-[11px] text-muted-foreground uppercase tracking-wide">
                <th className="p-3.5 font-medium">Device & Subnode</th>
                <th className="p-3.5 font-medium">IP / Socket</th>
                <th className="p-3.5 font-medium">MAC / Vendor</th>
                <th className="p-3.5 font-medium">Latency</th>
                <th className="p-3.5 font-medium">Open Services</th>
                <th className="p-3.5 font-medium text-right">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60 text-xs text-foreground/80">
              {sortedNodes.map((n) => (
                <tr
                  key={n.id}
                  onClick={() => onSelectNode(n)}
                  className="hover:bg-surface-hover/60 cursor-pointer transition-colors"
                >
                  <td className="p-3.5">
                    <div className="flex items-center gap-2">
                      <span className="p-1 rounded bg-surface-hover text-foreground/80">
                        {getDeviceIcon(n.deviceType)}
                      </span>
                      <div>
                        <div className="font-medium text-foreground flex items-center gap-1.5">
                          {n.label}
                          {n.isSelf && (
                            <span className="px-1.5 py-0.5 text-[9px] bg-foreground text-background font-semibold rounded">
                              YOU (ROOT)
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-muted-foreground">{n.os || 'Linux'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="p-3.5 font-mono font-medium text-foreground">{n.ip}</td>
                  <td className="p-3.5">
                    <div className="text-foreground/80">{n.vendor || 'Generic'}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">{n.mac || 'N/A'}</div>
                  </td>
                  <td className="p-3.5 font-mono font-medium text-foreground/80">
                    <span className="flex items-center gap-1">
                      <Lightning size={13} className="text-muted-foreground" /> {n.latencyMs} ms
                    </span>
                  </td>
                  <td className="p-3.5">
                    <div className="flex flex-wrap gap-1">
                      {n.ports.slice(0, 3).map((p) => (
                        <span
                          key={p.port}
                          className="px-1.5 py-0.5 rounded bg-background border border-border text-[10px] text-foreground/80 font-mono"
                        >
                          :{p.port} {p.service}
                        </span>
                      ))}
                      {n.ports.length > 3 && (
                        <span className="px-1.5 py-0.5 rounded bg-background border border-border text-[10px] text-muted-foreground font-mono">
                          +{n.ports.length - 3}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-3.5 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectNode(n);
                      }}
                      className="px-2.5 py-1 bg-background hover:bg-surface-hover border border-border-strong text-foreground/80 rounded text-[11px] transition-all"
                    >
                      View Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
