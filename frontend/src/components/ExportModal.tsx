import React, { useState } from 'react';
import { NetworkNode, NetworkLink } from '../types';
import { DownloadSimple, FileJs, FileCsv, FileCode, X, Check } from '@phosphor-icons/react';

interface ExportModalProps {
  nodes: NetworkNode[];
  links: NetworkLink[];
  onClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({ nodes, links, onClose }) => {
  const triggerDownload = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportJson = () => {
    const data = {
      generator: 'NetMap Recon Suite v2.0.0',
      timestamp: new Date().toISOString(),
      summary: {
        total_nodes: nodes.length,
        total_links: links.length,
        online_hosts: nodes.filter((n) => n.status === 'online').length,
      },
      nodes,
      links,
    };
    triggerDownload(
      JSON.stringify(data, null, 2),
      `netmap-scan-${new Date().toISOString().slice(0, 10)}.json`,
      'application/json'
    );
  };

  const handleExportCsv = () => {
    const headers = ['IP', 'Hostname', 'MAC', 'Vendor', 'OS', 'Device Type', 'Status', 'Latency (ms)', 'Open Ports'];
    const rows = nodes.map((n) => [
      `"${n.ip}"`,
      `"${n.hostname || n.label || ''}"`,
      `"${n.mac || ''}"`,
      `"${(n.vendor || '').replace(/"/g, '""')}"`,
      `"${(n.os || '').replace(/"/g, '""')}"`,
      `"${n.deviceType}"`,
      `"${n.status}"`,
      n.latencyMs,
      `"${n.ports.map((p) => `${p.port}/${p.protocol} (${p.service})`).join('; ')}"`,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    triggerDownload(
      csvContent,
      `netmap-scan-${new Date().toISOString().slice(0, 10)}.csv`,
      'text/csv'
    );
  };

  const handleExportNmapXml = () => {
    const xmlHeader = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE nmaprun>
<nmaprun scanner="NetMap" args="netmap-scanner" start="${Math.floor(Date.now() / 1000)}" version="2.0.0">
<scaninfo type="syn" protocol="tcp" services="top-200"/>
`;
    const xmlHosts = nodes
      .map((n) => {
        const portsXml = n.ports
          .map(
            (p) =>
              `    <port protocol="${p.protocol.toLowerCase()}" portid="${p.port}"><state state="${p.state}"/><service name="${p.service}" ${p.version ? `version="${p.version}"` : ''}/></port>`
          )
          .join('\n');
        return `<host status="${n.status}">
  <address addr="${n.ip}" addrtype="ipv4"/>
  ${n.mac ? `<address addr="${n.mac}" addrtype="mac" vendor="${n.vendor || ''}"/>` : ''}
  <hostnames>${n.hostname ? `<hostname name="${n.hostname}" type="PTR"/>` : ''}</hostnames>
  <ports>
${portsXml}
  </ports>
  ${n.os ? `<os><osmatch name="${n.os}" accuracy="90"/></os>` : ''}
</host>`;
      })
      .join('\n');

    const xmlFooter = `\n</nmaprun>`;
    triggerDownload(
      xmlHeader + xmlHosts + xmlFooter,
      `netmap-scan-${new Date().toISOString().slice(0, 10)}.xml`,
      'text/xml'
    );
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150 font-sans select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl bg-surface rounded-2xl border border-border shadow-2xl p-6 space-y-5 text-xs animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="flex items-center justify-between pb-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-surface-hover border border-border text-foreground">
              <DownloadSimple size={18} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground tracking-wide">Export Scan Artifacts</h2>
              <p className="text-[11px] text-muted-foreground">Export discovered nodes ({nodes.length}) and topology links ({links.length})</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-surface-hover transition-all"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-2.5">
          <button
            onClick={handleExportJson}
            className="w-full group flex items-center justify-between p-3.5 bg-background border border-border rounded-xl hover:border-border-strong hover:bg-surface-hover/60 transition-all text-left"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-surface-hover border border-border text-foreground">
                <FileJs size={18} />
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground font-mono">JSON Topology Artifact</p>
                <p className="text-[11px] text-muted-foreground">Full topology graph with nodes, links, and banners</p>
              </div>
            </div>
            <DownloadSimple size={16} className="text-muted-foreground group-hover:text-foreground transition-colors" />
          </button>

          <button
            onClick={handleExportCsv}
            className="w-full group flex items-center justify-between p-3.5 bg-background border border-border rounded-xl hover:border-border-strong hover:bg-surface-hover/60 transition-all text-left"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-surface-hover border border-border text-foreground">
                <FileCsv size={18} />
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground font-mono">CSV Host Matrix</p>
                <p className="text-[11px] text-muted-foreground">Spreadsheet table of IP, MAC, OS, Vendor, and Open Ports</p>
              </div>
            </div>
            <DownloadSimple size={16} className="text-muted-foreground group-hover:text-foreground transition-colors" />
          </button>

          <button
            onClick={handleExportNmapXml}
            className="w-full group flex items-center justify-between p-3.5 bg-background border border-border rounded-xl hover:border-border-strong hover:bg-surface-hover/60 transition-all text-left"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-surface-hover border border-border text-foreground">
                <FileCode size={18} />
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground font-mono">Nmap XML Format</p>
                <p className="text-[11px] text-muted-foreground">Compatible with Nmap viewers, Metasploit, and reporting tools</p>
              </div>
            </div>
            <DownloadSimple size={16} className="text-muted-foreground group-hover:text-foreground transition-colors" />
          </button>
        </div>

        <div className="flex justify-end pt-4 border-t border-border">
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
