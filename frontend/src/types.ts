export type DeviceType = 'user' | 'laptop' | 'mobile' | 'server' | 'database' | 'router' | 'docker' | 'vpn' | 'service' | 'printer' | 'tv' | 'iot' | 'nas';

export interface OpenPort {
  port: number;
  service: string;
  protocol: string;
  state: 'open' | 'filtered';
  banner?: string;
  version?: string;
  // Confirmed web app (real HTTP banner or fetched TLS cert) — never
  // guessed from the port number alone.
  isWeb?: boolean;
  url?: string;
}

export interface NetworkNode {
  id: string;
  label: string;
  ip: string;
  mac?: string;
  category: 'localhost' | 'gateway' | 'host' | 'docker' | 'vpn' | 'service';
  deviceType: DeviceType;
  isSelf?: boolean;
  vendor?: string;
  latencyMs: number;
  status: 'online' | 'warning' | 'offline';
  ports: OpenPort[];
  interface?: string;
  os?: string;
  lastSeen: string;
  ttl?: number;
  hostname?: string;
  confidence?: number;
  // Security-relevant findings backed by an actual verification probe
  // (ftp-anonymous-login, smb-open-share:<name>, domain-controller-candidate,
  // global-catalog, ldaps) — never a guess.
  roles?: string[];
  // Pivot-hop metadata — present only for nodes found via --pivot.
  hop?: number;
  viaPivot?: string;
  // Canvas physics coordinates
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  pinned?: boolean;
}

export interface NetworkLink {
  source: string;
  target: string;
  type: 'ethernet' | 'wifi' | 'docker' | 'vpn' | 'virtual' | 'service' | 'pivot';
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
  error?: string;
  // Actionable notices about degraded scan conditions (e.g. missing
  // CAP_NET_RAW) that reduce device coverage/accuracy for this run.
  warnings?: string[];
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

export interface VersionInfo {
  current_version: string;
  latest_version: string;
  update_available: boolean;
  release_url?: string;
  release_notes?: string;
  published_at?: string;
  checked_at?: string;
  error?: string;
}

export interface ScanConfig {
  subnet: string;
  scanPorts: boolean;
  osDetect: boolean;
  timeoutMs: number;
}
