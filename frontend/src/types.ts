export type DeviceType = 'user' | 'laptop' | 'mobile' | 'server' | 'database' | 'router' | 'docker' | 'vpn' | 'service';

export interface OpenPort {
  port: number;
  service: string;
  protocol: string;
  state: 'open' | 'filtered';
}

export interface NetworkNode {
  id: string; // IP or unique identifier
  label: string;
  ip: string;
  mac?: string;
  category: 'localhost' | 'gateway' | 'host' | 'docker' | 'vpn' | 'service';
  deviceType: DeviceType;
  isSelf?: boolean; // Specially marks YOU (User)
  vendor?: string;
  latencyMs: number;
  status: 'online' | 'warning' | 'offline';
  ports: OpenPort[];
  interface?: string;
  os?: string;
  lastSeen: string;
  // Canvas physics coordinates
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  pinned?: boolean;
}

export interface NetworkLink {
  source: string; // node id
  target: string; // node id
  type: 'ethernet' | 'wifi' | 'docker' | 'vpn' | 'virtual' | 'service';
  latencyMs?: number;
  activePackets?: number;
  label?: string;
}

export interface NetworkScanSummary {
  totalHosts: number;
  onlineHosts: number;
  gatewaysCount: number;
  dockerCount: number;
  vpnCount: number;
  avgLatencyMs: number;
  openPortsCount: number;
  subnetsScanned: string[];
  scanDurationMs: number;
  timestamp: string;
}

export interface NetworkScanResult {
  summary: NetworkScanSummary;
  nodes: NetworkNode[];
  links: NetworkLink[];
}

export interface NetworkInterface {
  name: string;
  ip: string;
  subnet: string;
  mac: string;
  isUp: boolean;
  type: 'ethernet' | 'wifi' | 'docker' | 'vpn' | 'loopback';
}

export interface GraphSettings {
  repulsion: number;
  linkDistance: number;
  showLabels: boolean;
  showPorts: boolean;
  animateParticles: boolean;
  showGrid: boolean;
}
