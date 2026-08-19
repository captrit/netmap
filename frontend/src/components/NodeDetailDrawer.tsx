import React, { useState } from 'react';
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
  Pulse,
  Printer,
  Television,
  Cpu,
  HardDrives,
  ArrowSquareOut,
  Copy,
  Check,
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
  const [copiedIp, setCopiedIp] = useState(false);

  if (!node) return null;

  const handleCopyIp = async () => {
    try {
      await navigator.clipboard.writeText(node.ip);
      setCopiedIp(true);
      setTimeout(() => setCopiedIp(false), 1500);
    } catch (err) {
      console.error('Failed to copy IP address:', err);
    }
  };

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
      case 'printer':
        icon = <Printer size={16} />;
        label = 'Network Printer';
        break;
      case 'tv':
        icon = <Television size={16} />;
        label = 'Smart TV / Media Device';
        break;
      case 'iot':
        icon = <Cpu size={16} />;
        label = 'IoT / Embedded Device';
        break;
      case 'nas':
        icon = <HardDrives size={16} />;
        label = 'Network Attached Storage';
        break;
    }

    return (
      <div className="flex items-center gap-2 flex-wrap">
        <span className="p-1.5 rounded-md bg-surface-hover border border-border text-foreground/80">
          {icon}
        </span>
        <span className="text-xs font-medium text-foreground/80">{label}</span>
        {isSelf && (
          <span className="px-2 py-0.5 text-[10px] bg-foreground text-background font-semibold rounded">
            YOU ARE HERE
          </span>
        )}
      </div>
    );
  };

  return (
    <aside className="fixed top-[68px] bottom-4 right-4 z-40 w-[480px] md:w-[520px] max-w-[95vw] bg-background border border-border rounded-2xl shadow-2xl flex flex-col justify-between overflow-y-auto animate-in slide-in-from-right duration-250 select-none font-sans">
      <div>
        <div className="p-5 border-b border-border flex items-start justify-between">
          <div>
            <div className="mb-2.5">{renderDeviceBadge(node.deviceType, node.isSelf)}</div>
            <h2 className="text-base font-semibold text-foreground break-all">{node.label}</h2>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-success animate-ping"></span>
              Status: <span className="text-foreground font-medium uppercase">{node.status}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg bg-surface border border-border hover:bg-surface-hover transition-all"
            title="Close Drawer"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4 border-b border-border text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3.5 bg-surface rounded-xl border border-border">
              <p className="text-muted-foreground font-medium">IP Address</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <p className="text-foreground font-mono font-semibold text-sm">{node.ip}</p>
                <button
                  onClick={handleCopyIp}
                  className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-surface-hover transition-all"
                  title="Copy IP address"
                >
                  {copiedIp ? <Check size={12} className="text-success" /> : <Copy size={12} />}
                </button>
              </div>
            </div>
            <div className="p-3.5 bg-surface rounded-xl border border-border">
              <p className="text-muted-foreground font-medium">MAC Address</p>
              <p className="text-foreground/80 font-mono mt-0.5 truncate">{node.mac || 'N/A'}</p>
            </div>
            <div className="p-3.5 bg-surface rounded-xl border border-border">
              <p className="text-muted-foreground font-medium">Latency</p>
              <p className="text-foreground font-mono font-semibold mt-0.5 flex items-center gap-1">
                <Lightning size={14} className="text-muted-foreground" /> {node.latencyMs} ms
              </p>
            </div>
            <div className="p-3.5 bg-surface rounded-xl border border-border">
              <p className="text-muted-foreground font-medium">Interface</p>
              <p className="text-foreground/80 font-medium mt-0.5">{node.interface || 'unknown'}</p>
            </div>
          </div>

          <div className="p-4 bg-surface rounded-xl border border-border space-y-2">
            <div>
              <span className="text-muted-foreground">Hardware Vendor: </span>
              <span className="text-foreground font-medium">{node.vendor || 'Unknown Hardware Vendor'}</span>
            </div>
            <div>
              <span className="text-muted-foreground">OS Footprint: </span>
              <span className="text-foreground/80 font-medium">{node.os || 'Linux/Embedded Device'}</span>
            </div>
            {node.hostname && (
              <div>
                <span className="text-muted-foreground">Hostname: </span>
                <span className="text-foreground font-medium">{node.hostname}</span>
              </div>
            )}
            {node.ttl !== undefined && node.ttl !== null && (
              <div>
                <span className="text-muted-foreground">ICMP Response TTL: </span>
                <span className="text-foreground/80">{node.ttl}</span>
              </div>
            )}
            {node.confidence !== undefined && node.confidence !== null && (
              <div className="flex items-center gap-2 pt-1">
                <span className="text-muted-foreground">Detection Confidence: </span>
                <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent rounded-full transition-all"
                    style={{ width: `${node.confidence}%` }}
                  />
                </div>
                <span className="text-foreground/80 font-semibold text-[11px]">{node.confidence}%</span>
              </div>
            )}
            {node.hop !== undefined && node.hop !== null && node.hop > 0 && (
              <div>
                <span className="text-muted-foreground">Discovered: </span>
                <span className="text-warning font-medium">
                  {node.hop} hop away, via pivot {node.viaPivot || 'unknown'}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="p-5 border-b border-border">
          <h3 className="text-xs font-semibold text-foreground flex items-center gap-2 mb-3">
            <ShieldCheckered size={16} className="text-muted-foreground" />
            OPEN PORTS & SERVICES ({node.ports.length})
            {node.ports.some((p) => p.isWeb) && (
              <span className="px-2 py-0.5 rounded bg-accent/15 text-accent border border-accent/30 text-[10px] normal-case font-semibold">
                {node.ports.filter((p) => p.isWeb).length} web app{node.ports.filter((p) => p.isWeb).length > 1 ? 's' : ''}
              </span>
            )}
          </h3>

          {node.ports.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No open ports detected on this host.</p>
          ) : (
            <div className="space-y-2.5">
              {node.ports.map((p) => (
                <div
                  key={p.port}
                  className={`p-3 rounded-lg border text-xs ${
                    p.isWeb
                      ? 'bg-accent/10 border-accent/40'
                      : 'bg-surface border-border'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5 font-mono">
                      <span className={`w-2 h-2 rounded-full ${p.isWeb ? 'bg-accent' : 'bg-success'}`}></span>
                      <span className="font-semibold text-foreground text-sm">:{p.port}</span>
                      <span className="text-foreground/80 font-medium">{p.service}</span>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-surface-hover text-muted-foreground border border-border text-[10px] uppercase font-mono">
                      {p.protocol}
                    </span>
                  </div>
                  {p.isWeb && p.url && (
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 flex items-center gap-1.5 text-[11px] text-accent hover:opacity-80 font-medium"
                    >
                      <ArrowSquareOut size={13} /> Open {p.url}
                    </a>
                  )}
                  {(p.version || p.banner) && (
                    <div className="mt-2 pl-4 border-l-2 border-border space-y-1">
                      {p.version && (
                        <p className="text-[11px] text-foreground/80">
                          <span className="text-muted-foreground">Version: </span>
                          <span className="text-foreground font-medium">{p.version}</span>
                        </p>
                      )}
                      {p.banner && (
                        <p className="text-[10px] text-muted-foreground font-mono break-all" title={p.banner}>
                          <span className="text-muted-foreground">Banner: </span>{p.banner}
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
          <h3 className="text-xs font-semibold text-foreground flex items-center gap-2 mb-3">
            <Pulse size={16} className="text-muted-foreground" />
            TOPOLOGY NEIGHBORS ({connectedNodes.length})
          </h3>

          <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
            {connectedNodes.map((peer) => (
              <button
                key={peer.id}
                onClick={() => onSelectConnectedNode(peer)}
                className="w-full flex items-center justify-between p-3 bg-surface hover:bg-surface-hover rounded-lg border border-border transition-all text-xs text-left group"
              >
                <div>
                  <p className="text-foreground/80 font-medium group-hover:text-foreground">{peer.label}</p>
                  <p className="text-[10px] text-muted-foreground font-mono">{peer.ip}</p>
                </div>
                <span className="text-[10px] text-foreground/80 font-mono font-semibold">{peer.latencyMs} ms</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
};
