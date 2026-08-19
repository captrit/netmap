import React, { useState } from 'react';
import { Sparkles, Download, CheckCircle2, AlertTriangle, ExternalLink, X, RefreshCw } from 'lucide-react';
import { VersionInfo } from '../types';

interface UpdateModalProps {
  versionInfo: VersionInfo;
  isOpen: boolean;
  onClose: () => void;
  onRefreshVersion: () => void;
}

export const UpdateModal: React.FC<UpdateModalProps> = ({
  versionInfo,
  isOpen,
  onClose,
  onRefreshVersion,
}) => {
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateResult, setUpdateResult] = useState<{ status: string; message: string; error?: string } | null>(null);

  if (!isOpen) return null;

  const handleTriggerUpdate = async () => {
    setIsUpdating(true);
    setUpdateResult(null);
    try {
      const resp = await fetch('/api/version/update', { method: 'POST' });
      const data = await resp.json();
      setUpdateResult(data);
      if (data.status === 'success') {
        setTimeout(() => {
          onRefreshVersion();
        }, 2000);
      }
    } catch (err: any) {
      setUpdateResult({
        status: 'error',
        message: 'Network error triggering update',
        error: err.message,
      });
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-lg overflow-hidden glass-panel border border-cyan-500/30 rounded-2xl shadow-2xl shadow-cyan-950/50 text-white">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-neutral-950/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight text-white flex items-center gap-2 font-sans">
                NetMap System Updater
              </h2>
              <p className="text-xs text-neutral-400 font-mono">Release & Build Manager</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 space-y-5">
          {/* Version Pill Comparison */}
          <div className="grid grid-cols-2 gap-3 p-3.5 bg-neutral-900/80 rounded-xl border border-white/5 font-mono text-xs">
            <div className="flex flex-col gap-1">
              <span className="text-neutral-400">Installed Version</span>
              <span className="text-sm font-bold text-neutral-200">v{versionInfo.current_version}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-neutral-400">Latest Release</span>
              <span className={`text-sm font-bold ${versionInfo.update_available ? 'text-emerald-400' : 'text-cyan-400'}`}>
                v{versionInfo.latest_version}
              </span>
            </div>
          </div>

          {/* Status Message */}
          {versionInfo.update_available ? (
            <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs flex items-start gap-3">
              <Sparkles className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-emerald-200">New Release Available!</p>
                <p className="text-neutral-300 mt-0.5">
                  An updated build of NetMap is available on GitHub main. Click update to seamlessly upgrade your binaries and assets.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-3.5 rounded-xl bg-cyan-950/30 border border-cyan-500/20 text-cyan-300 text-xs flex items-center gap-3">
              <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>NetMap is up-to-date on the latest release build (v{versionInfo.current_version}).</span>
            </div>
          )}

          {/* Release Notes if available */}
          {versionInfo.release_notes && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-400 font-mono">Release Notes</label>
              <div className="max-h-36 overflow-y-auto p-3 rounded-lg bg-neutral-950 border border-white/10 font-mono text-xs text-neutral-300 whitespace-pre-wrap">
                {versionInfo.release_notes}
              </div>
            </div>
          )}

          {/* Result Alert */}
          {updateResult && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
                updateResult.status === 'success'
                  ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200'
                  : 'bg-rose-950/60 border-rose-500/40 text-rose-200'
              }`}
            >
              {updateResult.status === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              )}
              <div className="space-y-1">
                <p className="font-semibold">{updateResult.message}</p>
                {updateResult.error && <p className="font-mono text-[11px] opacity-80">{updateResult.error}</p>}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/10 bg-neutral-950/80">
          <a
            href={versionInfo.release_url || 'https://github.com/captrit/netmap/releases'}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-cyan-400 transition-colors font-mono"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            View GitHub Release
          </a>

          <div className="flex items-center gap-2.5">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-medium text-neutral-400 hover:text-white bg-neutral-900 hover:bg-neutral-800 border border-white/10 transition-colors"
            >
              Close
            </button>

            <button
              onClick={handleTriggerUpdate}
              disabled={isUpdating}
              className={`px-4 py-2 rounded-lg text-xs font-semibold font-mono flex items-center gap-2 border transition-all ${
                isUpdating
                  ? 'bg-neutral-900 border-cyan-500/40 text-cyan-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-blue-600 via-cyan-600 to-blue-500 hover:from-blue-500 hover:to-cyan-500 text-white border-cyan-400/40 shadow-lg shadow-blue-500/20'
              }`}
            >
              {isUpdating ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                  Updating System...
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  {versionInfo.update_available ? 'Update NetMap Now' : 'Reinstall / Rebuild'}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
