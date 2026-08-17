import React, { useState } from 'react';
import { SlidersHorizontal, X, Cpu } from '@phosphor-icons/react';
import { NetworkInterface } from '../types';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-150 font-mono select-none">
      <div className="w-full max-w-lg bg-[#141417] rounded-2xl border border-zinc-800 shadow-2xl p-6 space-y-6 text-xs">
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white">
              <SlidersHorizontal size={18} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">Scan Configuration</h2>
              <p className="text-[11px] text-zinc-400">Real network reconnaissance — ARP, port scan, OS fingerprinting</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-all"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-zinc-300 font-medium mb-1.5">
              Target Subnet / Range (CIDR)
            </label>
            <input
              type="text"
              value={subnet}
              onChange={(e) => setSubnet(e.target.value)}
              placeholder="auto (detect from primary interface)"
              className="w-full px-3.5 py-2.5 bg-zinc-900 border border-zinc-700 rounded-lg text-white font-mono focus:outline-none focus:border-white transition-all"
            />
            <p className="text-[10px] text-zinc-500 mt-1">Use "auto" to detect from your primary interface</p>
          </div>

          <div>
            <label className="block text-zinc-400 text-[11px] mb-2">Detected Interfaces:</label>
            <div className="grid grid-cols-1 gap-2 max-h-36 overflow-y-auto">
              {interfaces.map((ifc) => (
                <button
                  key={ifc.name}
                  type="button"
                  onClick={() => setSubnet(ifc.subnet)}
                  className={`flex items-center justify-between p-2.5 rounded-lg border text-left transition-all ${
                    subnet === ifc.subnet
                      ? 'bg-zinc-800 border-white text-white font-bold'
                      : 'bg-zinc-900/60 border-zinc-800 text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Cpu size={16} className="text-zinc-400" />
                    <div>
                      <span>{ifc.name}</span>
                      <span className="text-[10px] text-zinc-500 ml-2">({ifc.ip})</span>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-zinc-400">{ifc.subnet}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="pt-2 border-t border-zinc-800 space-y-3">
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <p className="text-white font-medium">Port Scanning & Banner Grabbing</p>
                <p className="text-[10px] text-zinc-400">TCP connect scan on top 110 ports with service detection</p>
              </div>
              <input
                type="checkbox"
                checked={scanPorts}
                onChange={(e) => setScanPorts(e.target.checked)}
                className="w-4 h-4 rounded bg-zinc-900 border-zinc-700 text-white focus:ring-0 cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <p className="text-white font-medium">OS Fingerprinting (nmap)</p>
                <p className="text-[10px] text-zinc-400">Requires root/sudo — uses nmap --osscan-guess</p>
              </div>
              <input
                type="checkbox"
                checked={osDetect}
                onChange={(e) => setOsDetect(e.target.checked)}
                className="w-4 h-4 rounded bg-zinc-900 border-zinc-700 text-white focus:ring-0 cursor-pointer"
              />
            </label>

            <div>
              <div className="flex items-center justify-between text-zinc-400 mb-1.5">
                <span className="text-white font-medium">Port Timeout</span>
                <span className="text-white font-bold">{timeoutMs}ms</span>
              </div>
              <input
                type="range"
                min="100"
                max="2000"
                step="100"
                value={timeoutMs}
                onChange={(e) => setTimeoutMs(Number(e.target.value))}
                className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-white"
              />
              <p className="text-[10px] text-zinc-500 mt-1">Lower = faster scan, higher = fewer missed ports</p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-800 transition-all"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onApplySettings(subnet, scanPorts, osDetect, timeoutMs);
              onClose();
            }}
            className="px-5 py-2 rounded-lg bg-white text-black font-bold hover:bg-zinc-200 transition-all shadow-lg shadow-white/10"
          >
            Start Reconnaissance
          </button>
        </div>
      </div>
    </div>
  );
};
