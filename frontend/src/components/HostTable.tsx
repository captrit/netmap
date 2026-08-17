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
  Lightning 
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
      default: return <Desktop size={14} />;
    }
  };

  return (
    <div className="w-full h-full p-6 bg-[#09090b] flex flex-col gap-4 overflow-hidden font-mono select-none">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-[#141417] p-4 rounded-xl border border-zinc-800">
        <div className="relative flex-1 min-w-[240px]">
          <MagnifyingGlass size={16} className="absolute left-3.5 top-2.5 text-zinc-400" />
          <input
            type="text"
            placeholder="Filter by IP, Hostname, MAC, Vendor..."
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-zinc-900 border border-zinc-700/80 rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-400 transition-all font-mono"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2 bg-zinc-900 border border-zinc-700/80 rounded-lg text-xs text-white focus:outline-none focus:border-zinc-400"
          >
            <option value="all">All Subnodes ({nodes.length})</option>
            <option value="localhost font-bold">YOU (Root)</option>
            <option value="service">Exposed Services</option>
            <option value="gateway font-bold">Gateways</option>
            <option value="host">LAN Hosts</option>
            <option value="docker">Docker Containers</option>
            <option value="vpn">VPN Tunnels</option>
          </select>

          <button
            onClick={() => setSortBy(sortBy === 'latency' ? 'ports' : 'latency')}
            className="flex items-center gap-2 px-3 py-2 bg-zinc-900 border border-zinc-700/80 hover:bg-zinc-800 rounded-lg text-xs text-zinc-300 transition-all"
          >
            <ArrowsDownUp size={14} className="text-zinc-400" />
            Sort by {sortBy}
          </button>
        </div>
      </div>

      <div className="flex-1 bg-[#141417] rounded-xl border border-zinc-800 overflow-hidden flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/90 text-[11px] text-zinc-400 uppercase tracking-wider">
                <th className="p-3.5">Device & Subnode</th>
                <th className="p-3.5">IP / Socket</th>
                <th className="p-3.5">MAC / Vendor</th>
                <th className="p-3.5">Latency</th>
                <th className="p-3.5">Open Services</th>
                <th className="p-3.5 text-right">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 text-xs text-zinc-200">
              {sortedNodes.map((n) => (
                <tr
                  key={n.id}
                  onClick={() => onSelectNode(n)}
                  className="hover:bg-zinc-800/40 cursor-pointer transition-colors"
                >
                  <td className="p-3.5">
                    <div className="flex items-center gap-2">
                      <span className="p-1 rounded bg-zinc-800 text-zinc-300">
                        {getDeviceIcon(n.deviceType)}
                      </span>
                      <div>
                        <div className="font-semibold text-white flex items-center gap-1.5">
                          {n.label}
                          {n.isSelf && (
                            <span className="px-1.5 py-0.2 text-[9px] bg-white text-black font-bold rounded">
                              YOU (ROOT)
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-zinc-500">{n.os || 'Linux'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="p-3.5 font-bold text-white">{n.ip}</td>
                  <td className="p-3.5">
                    <div className="text-zinc-300">{n.vendor || 'Generic'}</div>
                    <div className="text-[10px] text-zinc-500">{n.mac || 'N/A'}</div>
                  </td>
                  <td className="p-3.5 font-bold text-zinc-200">
                    <span className="flex items-center gap-1">
                      <Lightning size={13} className="text-zinc-400" /> {n.latencyMs} ms
                    </span>
                  </td>
                  <td className="p-3.5">
                    <div className="flex flex-wrap gap-1">
                      {n.ports.slice(0, 3).map((p) => (
                        <span
                          key={p.port}
                          className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-700/60 text-[10px] text-zinc-300 font-mono"
                        >
                          :{p.port} {p.service}
                        </span>
                      ))}
                      {n.ports.length > 3 && (
                        <span className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-700/60 text-[10px] text-zinc-500">
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
                      className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 rounded text-[11px] font-mono transition-all"
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
