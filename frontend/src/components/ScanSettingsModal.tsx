import React, { useState } from 'react';
import { SlidersHorizontal, X, Cpu } from '@phosphor-icons/react';
import { NetworkInterface } from '../types';
import { Switch } from './Switch';

interface ScanSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  interfaces: NetworkInterface[];
  currentSubnet: string;
  onApplySettings: (subnet: string, scanPorts: boolean, osDetect?: boolean, timeoutMs?: number) => void;
}

export const ScanSettingsModal: React.FC<ScanSettingsModalProps> = ({
  isOpen,
  onClose,
  interfaces,
  currentSubnet,
  onApplySettings,
}) => {
  const [subnet, setSubnet] = useState(currentSubnet);
  const [scanPorts, setScanPorts] = useState(true);
  const [osDetect, setOsDetect] = useState(false);
  const [timeoutMs, setTimeoutMs] = useState(500);

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150 font-sans select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-surface rounded-2xl border border-border shadow-2xl p-6 space-y-6 text-xs animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="flex items-center justify-between pb-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-surface-hover border border-border text-foreground">
              <SlidersHorizontal size={18} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground tracking-wide">Scan Configuration</h2>
              <p className="text-[11px] text-muted-foreground">Real network reconnaissance: ARP, port scan, OS fingerprinting</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-surface-hover transition-all"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-foreground/80 font-medium mb-1.5">
              Target Subnet / Range (CIDR)
            </label>
            <input
              type="text"
              value={subnet}
              onChange={(e) => setSubnet(e.target.value)}
              placeholder="auto (detect from primary interface)"
              className="w-full px-3.5 py-2.5 bg-background border border-border-strong rounded-lg text-foreground font-mono focus:outline-none focus:border-accent transition-all"
            />
            <p className="text-[10px] text-muted-foreground mt-1">Use "auto" to detect from your primary interface</p>
          </div>

          <div>
            <label className="block text-muted-foreground text-[11px] mb-2">Detected Interfaces:</label>
            <div className="grid grid-cols-1 gap-2 max-h-36 overflow-y-auto">
              {interfaces.map((ifc) => (
                <button
                  key={ifc.name}
                  type="button"
                  onClick={() => setSubnet(ifc.subnet)}
                  className={`flex items-center justify-between p-2.5 rounded-lg border text-left transition-all ${
                    subnet === ifc.subnet
                      ? 'bg-surface-hover border-accent text-foreground font-semibold'
                      : 'bg-background border-border text-foreground/80 hover:bg-surface-hover'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Cpu size={16} className="text-muted-foreground" />
                    <div>
                      <span>{ifc.name}</span>
                      <span className="text-[10px] text-muted-foreground ml-2 font-mono">({ifc.ip})</span>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground">{ifc.subnet}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="pt-2 border-t border-border space-y-3">
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <p className="text-foreground font-medium">Port Scanning & Banner Grabbing</p>
                <p className="text-[10px] text-muted-foreground">TCP connect scan on top 110 ports with service detection</p>
              </div>
              <Switch checked={scanPorts} onChange={setScanPorts} />
            </label>

            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <p className="text-foreground font-medium">OS Fingerprinting (nmap)</p>
                <p className="text-[10px] text-muted-foreground">Requires root/sudo, uses nmap --osscan-guess</p>
              </div>
              <Switch checked={osDetect} onChange={setOsDetect} />
            </label>

            <div>
              <div className="flex items-center justify-between text-muted-foreground mb-1.5">
                <span className="text-foreground font-medium">Port Timeout</span>
                <span className="text-foreground font-mono font-semibold">{timeoutMs}ms</span>
              </div>
              <input
                type="range"
                min="100"
                max="2000"
                step="100"
                value={timeoutMs}
                onChange={(e) => setTimeoutMs(Number(e.target.value))}
                className="w-full h-1.5 bg-border rounded-lg appearance-none cursor-pointer accent-accent"
              />
              <p className="text-[10px] text-muted-foreground mt-1">Lower = faster scan, higher = fewer missed ports</p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-background border border-border-strong text-foreground/80 hover:text-foreground hover:bg-surface-hover transition-all"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onApplySettings(subnet, scanPorts, osDetect, timeoutMs);
              onClose();
            }}
            className="px-5 py-2 rounded-lg bg-foreground text-background font-semibold hover:opacity-85 transition-all shadow-md"
          >
            Start Reconnaissance
          </button>
        </div>
      </div>
    </div>
  );
};
