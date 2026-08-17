import React from 'react';
import { NetworkNode, NetworkLink } from '../types';
import { 
  User,
  Desktop, 
  DeviceMobile, 
  HardDrive, 
  Database, 
  Globe, 
  Cube, 
  ShieldCheckered, 
  Lightning,
  X, 
  Pulse 
} from '@phosphor-icons/react';

interface NodeDetailDrawerProps {
  node: NetworkNode | null;
  links: NetworkLink[];
  allNodes: NetworkNode[];
  onClose: () => void;
  onSelectConnectedNode: (node: NetworkNode) => void;
}

export const NodeDetailDrawer: React.FC<NodeDetailDrawerProps> = ({
  node,
  links,
  allNodes,
  onClose,
  onSelectConnectedNode,
}) => {
  if (!node) return null;

  const connectedLinks = links.filter((l) => l.source === node.id || l.target === node.id);
  const connectedNodeIds = new Set(connectedLinks.map((l) => (l.source === node.id ? l.target : l.source)));
  const connectedNodes = allNodes.filter((n) => connectedNodeIds.has(n.id));

  const renderDeviceBadge = (type: string, isSelf?: boolean) => {
    let icon = <Desktop size={16} />;
    let label = 'Host Device';

    switch (type) {
      case 'user':
        icon = <User size={16} />;
        label = 'YOU (Root Workstation)';
        break;
      case 'service':
        icon = <Lightning size={16} />;
        label = 'Exposed Port Service';
        break;
      case 'laptop':
        icon = <Desktop size={16} />;
        label = 'Workstation Laptop';
        break;
      case 'mobile':
        icon = <DeviceMobile size={16} />;
        label = 'Mobile Smartphone';
        break;
      case 'server':
        icon = <HardDrive size={16} />;
        label = 'Linux Server';
        break;
      case 'database':
        icon = <Database size={16} />;
        label = 'Database Engine';
        break;
      case 'router':
        icon = <Globe size={16} />;
        label = 'Gateway Router';
        break;
      case 'docker':
        icon = <Cube size={16} />;
        label = 'Docker Container';
        break;
      case 'vpn':
        icon = <ShieldCheckered size={16} />;
        label = 'IPsec / VPN Tunnel';
        break;
    }

    return (
      <div className="flex items-center gap-2">
        <span className="p-1.5 rounded-md bg-zinc-800 border border-zinc-700 text-zinc-200">
          {icon}
        </span>
        <span className="text-xs font-mono font-medium text-zinc-200">{label}</span>
        {isSelf && (
          <span className="px-2 py-0.5 text-[10px] font-mono bg-white text-black font-bold rounded">
            YOU ARE HERE
          </span>
        )}
      </div>
    );
  };

  return (
    <aside className="fixed inset-y-0 right-0 z-50 w-96 bg-[#09090b]/95 border-l border-zinc-800 shadow-2xl flex flex-col justify-between overflow-y-auto backdrop-blur-xl animate-in slide-in-from-right duration-250 select-none">
      <div>
        <div className="p-5 border-b border-zinc-800/80 flex items-start justify-between">
          <div>
            <div className="mb-2.5">{renderDeviceBadge(node.deviceType, node.isSelf)}</div>
            <h2 className="text-sm font-bold text-white font-mono break-all">{node.label}</h2>
            <p className="text-xs text-zinc-400 font-mono mt-1 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-white animate-ping"></span>
              Status: <span className="text-white font-semibold uppercase">{node.status}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 transition-all"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4 border-b border-zinc-800/80 text-xs font-mono">
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-zinc-900/80 rounded-xl border border-zinc-800/60">
              <p className="text-zinc-400 font-medium">IP Address</p>
              <p className="text-white font-bold mt-0.5">{node.ip}</p>
            </div>
            <div className="p-3 bg-zinc-900/80 rounded-xl border border-zinc-800/60">
              <p className="text-zinc-400 font-medium">MAC Address</p>
              <p className="text-zinc-300 font-medium mt-0.5 truncate">{node.mac || 'N/A'}</p>
            </div>
            <div className="p-3 bg-zinc-900/80 rounded-xl border border-zinc-800/60">
              <p className="text-zinc-400 font-medium">Latency</p>
              <p className="text-white font-bold mt-0.5 flex items-center gap-1">
                <Lightning size={14} className="text-zinc-400" /> {node.latencyMs} ms
              </p>
            </div>
            <div className="p-3 bg-zinc-900/80 rounded-xl border border-zinc-800/60">
              <p className="text-zinc-400 font-medium">Interface</p>
              <p className="text-zinc-200 font-medium mt-0.5">{node.interface || 'wlp3s0'}</p>
            </div>
          </div>

          <div className="p-3 bg-zinc-900/80 rounded-xl border border-zinc-800/60 space-y-1.5">
            <div>
              <span className="text-zinc-400">Hardware Vendor: </span>
              <span className="text-white font-medium">{node.vendor || 'Generic Device'}</span>
            </div>
            <div>
              <span className="text-zinc-400">OS Footprint: </span>
              <span className="text-zinc-300">{node.os || 'Linux Kernel'}</span>
            </div>
          </div>
        </div>

        <div className="p-5 border-b border-zinc-800/80">
          <h3 className="text-xs font-bold font-mono text-white flex items-center gap-2 mb-3">
            <ShieldCheckered size={16} className="text-zinc-400" />
            OPEN PORTS & SERVICES ({node.ports.length})
          </h3>

          {node.ports.length === 0 ? (
            <p className="text-xs font-mono text-zinc-500 italic">No open ports on this node.</p>
          ) : (
            <div className="space-y-2">
              {node.ports.map((p) => (
                <div key={p.port} className="flex items-center justify-between p-2.5 bg-zinc-900/90 rounded-lg border border-zinc-800 text-xs font-mono">
                  <div className="flex items-center gap-2.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-white"></span>
                    <span className="font-bold text-white">:{p.port}</span>
                    <span className="text-zinc-300 font-medium">{p.service}</span>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700 text-[10px]">
                    {p.protocol}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-5">
          <h3 className="text-xs font-bold font-mono text-white flex items-center gap-2 mb-3">
            <Pulse size={16} className="text-zinc-400" />
            SUBTREE NEIGHBORS ({connectedNodes.length})
          </h3>

          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {connectedNodes.map((peer) => (
              <button
                key={peer.id}
                onClick={() => onSelectConnectedNode(peer)}
                className="w-full flex items-center justify-between p-2.5 bg-zinc-900/60 hover:bg-zinc-800 rounded-lg border border-zinc-800 transition-all text-xs font-mono text-left group"
              >
                <div>
                  <p className="text-zinc-200 font-medium group-hover:text-white">{peer.label}</p>
                  <p className="text-[10px] text-zinc-500">{peer.ip}</p>
                </div>
                <span className="text-[10px] text-zinc-400">{peer.latencyMs}ms</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
};
