import React, { useEffect, useState } from 'react';
import { ClockCounterClockwise, X, Trash, Play, CheckCircle } from '@phosphor-icons/react';
import { NetworkScanResult } from '../types';

export interface HistoryItem {
  id: number;
  timestamp: string;
  subnet: string;
  totalHosts: number;
  onlineHosts: number;
  openPorts: number;
  scanDurationMs: number;
}

interface ScanHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectScan: (scan: NetworkScanResult) => void;
}

export const ScanHistoryModal: React.FC<ScanHistoryModalProps> = ({
  isOpen,
  onClose,
  onSelectScan,
}) => {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingId, setLoadingId] = useState<number | null>(null);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/history');
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
      }
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchHistory();
    }
  }, [isOpen]);

  const handleLoadScan = async (id: number) => {
    setLoadingId(id);
    try {
      const res = await fetch(`/api/history/${id}`);
      if (res.ok) {
        const scanData: NetworkScanResult = await res.json();
        onSelectScan(scanData);
        onClose();
      }
    } catch (err) {
      console.error('Failed to load scan:', err);
    } finally {
      setLoadingId(null);
    }
  };

  const handleClearHistory = async () => {
    try {
      const res = await fetch('/api/history', { method: 'DELETE' });
      if (res.ok) {
        setHistory([]);
      }
    } catch (err) {
      console.error('Failed to clear history:', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-150 font-mono select-none">
      <div className="w-full max-w-xl bg-[#141417] rounded-2xl border border-zinc-800 shadow-2xl p-6 space-y-5 text-xs">
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white">
              <ClockCounterClockwise size={18} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">Session Scan History</h2>
              <p className="text-[11px] text-zinc-400">Temporary history stored in session RAM database</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-all"
          >
            <X size={16} />
          </button>
        </div>

        {loading ? (
          <div className="py-12 text-center text-zinc-400 font-mono text-xs">
            Loading session scan history...
          </div>
        ) : history.length === 0 ? (
          <div className="py-12 text-center text-zinc-500 font-mono text-xs space-y-1">
            <p>No scans performed in this server session yet.</p>
            <p className="text-[10px] text-zinc-600">Run a scan from the dashboard to populate history.</p>
          </div>
        ) : (
          <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
            {history.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-3.5 bg-zinc-900/90 border border-zinc-800 rounded-xl hover:border-zinc-700 transition-all"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white font-mono">Scan #{item.id}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">
                      {item.subnet}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-zinc-400 font-mono">
                    <span>{item.timestamp}</span>
                    <span>•</span>
                    <span>{item.totalHosts} hosts ({item.onlineHosts} online)</span>
                    <span>•</span>
                    <span>{item.openPorts} ports open</span>
                    <span>•</span>
                    <span>{(item.scanDurationMs / 1000).toFixed(1)}s</span>
                  </div>
                </div>

                <button
                  onClick={() => handleLoadScan(item.id)}
                  disabled={loadingId === item.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-black font-bold rounded-lg hover:bg-zinc-200 transition-all disabled:opacity-50"
                >
                  <Play size={12} weight="fill" />
                  <span>{loadingId === item.id ? 'Loading...' : 'Load'}</span>
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between pt-4 border-t border-zinc-800">
          {history.length > 0 ? (
            <button
              onClick={handleClearHistory}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 border border-red-900/50 text-red-400 hover:bg-red-950/30 transition-all text-xs font-mono"
            >
              <Trash size={14} />
              <span>Clear History</span>
            </button>
          ) : <div />}

          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-300 hover:text-white transition-all text-xs font-mono"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
