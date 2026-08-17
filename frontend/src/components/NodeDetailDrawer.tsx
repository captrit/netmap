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
        label = 'Mobile Smartphone / Tablet';
        break;
      case 'server':
        icon = <HardDrive size={16} />;
        label = 'Linux / Network Server';
        break;
      case 'database':
        icon = <Database size={16} />;
        label = 'Database Engine';
        break;
      case 'router':
        icon = <Globe size={16} />;
        label = 'Gateway Router / Switch';
        break;
      case 'docker':
        icon = <Cube size={16} />;
        label = 'Docker Container';
        break;
      case 'vpn':
        icon = <ShieldCheckered size={16} />;
        label = 'IPsec / VPN Secure Tunnel';
        break;
    }

    return (
      <div className="flex items-center gap-2 flex-wrap">
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
    <aside className="fixed inset-y-0 right-0 z-50 w-[480px] md:w-[520px] max-w-[95vw] bg-[#09090b]/95 border-l border-zinc-800 shadow-2xl flex flex-col justify-between overflow-y-auto backdrop-blur-xl animate-in slide-in-from-right duration-250 select-none">
      <div>
        <div className="p-5 border-b border-zinc-800/80 flex items-start justify-between">
          <div>
            <div className="mb-2.5">{renderDeviceBadge(node.deviceType, node.isSelf)}</div>
            <h2 className="text-base font-bold text-white font-mono break-all">{node.label}</h2>
            <p className="text-xs text-zinc-400 font-mono mt-1 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping"></span>
              Status: <span className="text-white font-semibold uppercase">{node.status}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 transition-all"
            title="Close Drawer"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4 border-b border-zinc-800/80 text-xs font-mono">
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3.5 bg-zinc-900/80 rounded-xl border border-zinc-800/60">
              <p className="text-zinc-400 font-medium">IP Address</p>
              <p className="text-white font-bold text-sm mt-0.5">{node.ip}</p>
            </div>
            <div className="p-3.5 bg-zinc-900/80 rounded-xl border border-zinc-800/60">
              <p className="text-zinc-400 font-medium">MAC Address</p>
              <p className="text-zinc-300 font-medium mt-0.5 truncate">{node.mac || 'N/A'}</p>
            </div>
            <div className="p-3.5 bg-zinc-900/80 rounded-xl border border-zinc-800/60">
              <p className="text-zinc-400 font-medium">Latency</p>
              <p className="text-white font-bold mt-0.5 flex items-center gap-1">
                <Lightning size={14} className="text-zinc-400" /> {node.latencyMs} ms
              </p>
            </div>
            <div className="p-3.5 bg-zinc-900/80 rounded-xl border border-zinc-800/60">
              <p className="text-zinc-400 font-medium">Interface</p>
              <p className="text-zinc-200 font-medium mt-0.5">{node.interface || 'unknown'}</p>
            </div>
          </div>

          <div className="p-4 bg-zinc-900/80 rounded-xl border border-zinc-800/60 space-y-2">
            <div>
              <span className="text-zinc-400">Hardware Vendor: </span>
              <span className="text-white font-medium">{node.vendor || 'Unknown Hardware Vendor'}</span>
            </div>
            <div>
              <span className="text-zinc-400">OS Footprint: </span>
              <span className="text-zinc-200 font-semibold">{node.os || 'Linux/Embedded Device'}</span>
            </div>
            {node.hostname && (
              <div>
                <span className="text-zinc-400">Hostname: </span>
                <span className="text-white font-medium">{node.hostname}</span>
              </div>
            )}
            {node.ttl !== undefined && node.ttl !== null && (
              <div>
                <span className="text-zinc-400">ICMP Response TTL: </span>
                <span className="text-zinc-200">{node.ttl}</span>
              </div>
            )}
            {node.confidence !== undefined && node.confidence !== null && (
              <div className="flex items-center gap-2 pt-1">
                <span className="text-zinc-400">Detection Confidence: </span>
                <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-white rounded-full transition-all"
                    style={{ width: `${node.confidence}%` }}
                  />
                </div>
                <span className="text-zinc-200 font-bold text-[11px]">{node.confidence}%</span>
              </div>
            )}
          </div>
        </div>

        <div className="p-5 border-b border-zinc-800/80">
          <h3 className="text-xs font-bold font-mono text-white flex items-center gap-2 mb-3">
            <ShieldCheckered size={16} className="text-zinc-400" />
            OPEN PORTS & SERVICES ({node.ports.length})
          </h3>

          {node.ports.length === 0 ? (
            <p className="text-xs font-mono text-zinc-500 italic">No open ports detected on this host.</p>
          ) : (
            <div className="space-y-2.5">
              {node.ports.map((p) => (
                <div key={p.port} className="p-3 bg-zinc-900/90 rounded-lg border border-zinc-800 text-xs font-mono">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="w-2 h-2 rounded-full bg-white"></span>
                      <span className="font-bold text-white text-sm">:{p.port}</span>
                      <span className="text-zinc-200 font-semibold">{p.service}</span>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700 text-[10px] uppercase">
                      {p.protocol}
                    </span>
                  </div>
                  {(p.version || p.banner) && (
                    <div className="mt-2 pl-4 border-l-2 border-zinc-800 space-y-1">
                      {p.version && (
                        <p className="text-[11px] text-zinc-300">
                          <span className="text-zinc-400">Version: </span>
                          <span className="text-white font-medium">{p.version}</span>
                        </p>
                      )}
                      {p.banner && (
                        <p className="text-[10px] text-zinc-400 font-mono break-all" title={p.banner}>
                          <span className="text-zinc-400">Banner: </span>{p.banner}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-5">
          <h3 className="text-xs font-bold font-mono text-white flex items-center gap-2 mb-3">
            <Pulse size={16} className="text-zinc-400" />
            TOPOLOGY NEIGHBORS ({connectedNodes.length})
          </h3>

          <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
            {connectedNodes.map((peer) => (
              <button
                key={peer.id}
                onClick={() => onSelectConnectedNode(peer)}
                className="w-full flex items-center justify-between p-3 bg-zinc-900/60 hover:bg-zinc-800 rounded-lg border border-zinc-800 transition-all text-xs font-mono text-left group"
              >
                <div>
                  <p className="text-zinc-200 font-medium group-hover:text-white">{peer.label}</p>
                  <p className="text-[10px] text-zinc-400">{peer.ip}</p>
                </div>
                <span className="text-[10px] text-zinc-300 font-bold">{peer.latencyMs} ms</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
};
