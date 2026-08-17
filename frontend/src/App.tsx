import React, { useState, useEffect } from 'react';
import { TopFloatingBar } from './components/TopFloatingBar';
import { GraphViewer } from './components/GraphViewer';
import { GraphControls } from './components/GraphControls';
import { NodeDetailDrawer } from './components/NodeDetailDrawer';
import { HostTable } from './components/HostTable';
import { ScanSettingsModal } from './components/ScanSettingsModal';
import { ScanHistoryModal } from './components/ScanHistoryModal';
import { NetworkScanResult, NetworkNode, NetworkLink, GraphSettings, NetworkInterface } from './types';

export const App: React.FC = () => {
  const [scanResult, setScanResult] = useState<NetworkScanResult | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [activeView, setActiveView] = useState<'graph' | 'table'>('graph');
  const [selectedNode, setSelectedNode] = useState<NetworkNode | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);
  const [currentSubnet, setCurrentSubnet] = useState<string>('auto');
  const [interfaces, setInterfaces] = useState<NetworkInterface[]>([]);

  const [graphSettings, setGraphSettings] = useState<GraphSettings>({
    repulsion: 5000,
    linkDistance: 160,
    showLabels: true,
    showPorts: true,
    animateParticles: true,
    showGrid: true,
  });

  useEffect(() => {
    fetchInterfaces();
    fetchInitialTopology();
  }, []);

  const fetchInterfaces = async () => {
    try {
      const res = await fetch('/api/interfaces');
      if (res.ok) {
        const data = await res.json();
        setInterfaces(data);
      }
    } catch (err) {
      console.error('Failed to fetch interfaces:', err);
    }
  };

  const fetchInitialTopology = async () => {
    try {
      const res = await fetch('/api/topology');
      if (res.ok) {
        const data = await res.json();
        setScanResult(data);
      } else {
        handleTriggerScan();
      }
    } catch (err) {
      handleTriggerScan();
    }
  };

  const handleTriggerScan = async (
    subnetToScan: string = currentSubnet,
    osDetect: boolean = false,
    timeoutMs: number = 500
  ) => {
    setIsScanning(true);

    // Initialize empty canvas state for real-time live discovery streaming
    setScanResult({
      summary: {
        totalHosts: 0,
        onlineHosts: 0,
        gatewaysCount: 0,
        dockerCount: 0,
        vpnCount: 0,
        avgLatencyMs: 0,
        openPortsCount: 0,
        subnetsScanned: [subnetToScan],
        scanDurationMs: 0,
        timestamp: new Date().toLocaleString(),
      },
      nodes: [],
      links: [],
    });

    const streamUrl = `/api/scan/stream?subnet=${encodeURIComponent(subnetToScan)}&timeout_ms=${timeoutMs}&os_detect=${osDetect}`;
    const eventSource = new EventSource(streamUrl);

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        const { event: evtType, data } = payload;

        if (evtType === 'node') {
          const newNode: NetworkNode = data;
          setScanResult((prev) => {
            if (!prev) return prev;
            const exists = prev.nodes.some((n) => n.id === newNode.id);
            if (exists) {
              return {
                ...prev,
                nodes: prev.nodes.map((n) => (n.id === newNode.id ? newNode : n)),
              };
            }
            return {
              ...prev,
              nodes: [...prev.nodes, newNode],
              summary: {
                ...prev.summary,
                totalHosts: prev.nodes.length + 1,
                onlineHosts: prev.nodes.length + 1,
              },
            };
          });
        } else if (evtType === 'link') {
          const newLink: NetworkLink = data;
          setScanResult((prev) => {
            if (!prev) return prev;
            const exists = prev.links.some(
              (l) => l.source === newLink.source && l.target === newLink.target
            );
            if (exists) return prev;
            return {
              ...prev,
              links: [...prev.links, newLink],
            };
          });
        } else if (evtType === 'complete') {
          const finalResult: NetworkScanResult = data;
          setScanResult(finalResult);
          setIsScanning(false);
          eventSource.close();
        }
      } catch (err) {
        console.error('SSE parse error:', err);
      }
    };

    eventSource.onerror = () => {
      setIsScanning(false);
      eventSource.close();
    };
  };

  return (
    <div className="w-screen h-screen bg-[#09090b] text-white flex flex-col overflow-hidden font-mono select-none">
      {/* Top Floating Minimalist Controls */}
      <TopFloatingBar
        onStartScan={() => handleTriggerScan(currentSubnet)}
        isScanning={isScanning}
        activeView={activeView}
        setActiveView={setActiveView}
        activeInterface={interfaces[0]?.name || 'wlp3s0'}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenHistory={() => setIsHistoryOpen(true)}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        totalNodesCount={scanResult?.nodes.length || 0}
      />

      {/* Main Full-Screen Canvas Area */}
      <main className="relative flex-1 w-full h-full overflow-hidden">
        {activeView === 'graph' ? (
          <>
            <GraphViewer
              nodes={scanResult?.nodes ?? []}
              links={scanResult?.links ?? []}
              selectedNode={selectedNode}
              onSelectNode={setSelectedNode}
              settings={graphSettings}
              searchQuery={searchQuery}
            />

            {/* Physics Control Tweaks */}
            <GraphControls
              settings={graphSettings}
              onUpdateSettings={(newSettings) =>
                setGraphSettings((prev) => ({ ...prev, ...newSettings }))
              }
              onResetLayout={() =>
                setGraphSettings((prev) => ({ ...prev, repulsion: 5000, linkDistance: 160 }))
              }
            />
          </>
        ) : (
          <HostTable
            nodes={scanResult?.nodes ?? []}
            onSelectNode={(node) => {
              setSelectedNode(node);
              setActiveView('graph');
            }}
          />
        )}

        {/* Slide-Over Node Details Drawer */}
        <NodeDetailDrawer
          node={selectedNode}
          links={scanResult?.links ?? []}
          allNodes={scanResult?.nodes ?? []}
          onClose={() => setSelectedNode(null)}
          onSelectConnectedNode={setSelectedNode}
        />
      </main>

      {/* Scan Config Modal */}
      <ScanSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        interfaces={interfaces}
        currentSubnet={currentSubnet}
        onApplySettings={(subnet, _scanPorts, osDetect, timeoutMs) => {
          setCurrentSubnet(subnet);
          handleTriggerScan(subnet, osDetect, timeoutMs);
        }}
      />

      {/* Session Scan History Modal */}
      <ScanHistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        onSelectScan={(scan) => {
          setScanResult(scan);
        }}
      />
    </div>
  );
};
