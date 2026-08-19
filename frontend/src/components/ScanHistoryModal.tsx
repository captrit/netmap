import React, { useEffect, useState } from 'react';
import { ClockCounterClockwise, X, Trash, Play, CircleNotch, Database } from '@phosphor-icons/react';
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
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150 font-sans select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl bg-surface rounded-2xl border border-border shadow-2xl p-6 space-y-5 text-xs animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="flex items-center justify-between pb-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-surface-hover border border-border text-foreground">
              <ClockCounterClockwise size={18} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground tracking-wide">Session Scan History</h2>
              <p className="text-[11px] text-muted-foreground">Temporary history stored in session RAM database</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-surface-hover transition-all"
          >
            <X size={16} />
          </button>
        </div>

        {loading ? (
          <div className="py-14 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <CircleNotch size={22} className="animate-spin" />
            <p>Loading session scan history...</p>
          </div>
        ) : history.length === 0 ? (
          <div className="py-14 flex flex-col items-center justify-center gap-3 text-center">
            <div className="w-12 h-12 rounded-full bg-surface-hover border border-border flex items-center justify-center text-muted-foreground">
              <Database size={20} />
            </div>
            <div className="space-y-1">
              <p className="text-foreground/80 font-medium">No scans performed in this server session yet.</p>
              <p className="text-[11px] text-muted-foreground">Run a scan from the dashboard to populate history.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {history.map((item) => (
              <div
                key={item.id}
                className="group flex items-center justify-between p-3.5 bg-background border border-border rounded-xl hover:border-border-strong hover:bg-surface-hover/60 transition-all"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground font-mono">Scan #{item.id}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-hover border border-border text-muted-foreground font-mono">
                      {item.subnet}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground font-mono">
                    <span>{item.timestamp}</span>
                    <span className="w-1 h-1 rounded-full bg-border-strong" />
                    <span>{item.totalHosts} hosts <span className="text-foreground/60">({item.onlineHosts} online)</span></span>
                    <span className="w-1 h-1 rounded-full bg-border-strong" />
                    <span>{item.openPorts} ports open</span>
                    <span className="w-1 h-1 rounded-full bg-border-strong" />
                    <span>{(item.scanDurationMs / 1000).toFixed(1)}s</span>
                  </div>
                </div>

                <button
                  onClick={() => handleLoadScan(item.id)}
                  disabled={loadingId === item.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-strong text-foreground/80 group-hover:border-accent group-hover:text-accent hover:bg-accent/10 transition-all disabled:opacity-50 shrink-0"
                >
                  {loadingId === item.id ? (
                    <CircleNotch size={12} className="animate-spin" />
                  ) : (
                    <Play size={12} weight="fill" />
                  )}
                  <span>{loadingId === item.id ? 'Loading...' : 'Load'}</span>
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between pt-4 border-t border-border">
          {history.length > 0 ? (
            <button
              onClick={handleClearHistory}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-background border border-danger/30 text-danger hover:bg-danger-bg transition-all"
            >
              <Trash size={14} />
              <span>Clear History</span>
            </button>
          ) : <div />}

          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-background border border-border-strong text-foreground/80 hover:text-foreground hover:bg-surface-hover transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
