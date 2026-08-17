import React, { useState, useEffect } from 'react';
import { TopFloatingBar } from './components/TopFloatingBar';
import { GraphViewer } from './components/GraphViewer';
import { GraphControls } from './components/GraphControls';
import { NodeDetailDrawer } from './components/NodeDetailDrawer';
import { HostTable } from './components/HostTable';
import { ScanSettingsModal } from './components/ScanSettingsModal';
import { NetworkScanResult, NetworkNode, GraphSettings, NetworkInterface } from './types';

export const App: React.FC = () => {
  const [scanResult, setScanResult] = useState<NetworkScanResult | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [activeView, setActiveView] = useState<'graph' | 'table'>('graph');
  const [selectedNode, setSelectedNode] = useState<NetworkNode | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [currentSubnet, setCurrentSubnet] = useState<string>('192.168.29.0/24');
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
      setInterfaces([
        { name: 'wlp3s0', ip: '192.168.29.58', subnet: '192.168.29.0/24', mac: 'ec:2e:98:e9:2d:cf', isUp: true, type: 'wifi' },
        { name: 'br-9a9b93e39b3d', ip: '172.23.0.1', subnet: '172.23.0.0/16', mac: 'aa:23:79:a0:5a:a0', isUp: true, type: 'docker' },
        { name: 'lo.ipsec', ip: '10.30.30.4', subnet: '10.30.30.0/32', mac: 'vpn-tunnel', isUp: true, type: 'vpn' },
      ]);
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

  const handleTriggerScan = async (subnetToScan: string = currentSubnet) => {
    setIsScanning(true);
    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subnet: subnetToScan, scan_ports: true }),
      });
      if (res.ok) {
        const json = await res.json();
        setScanResult(json.result);
      }
    } catch (err) {
      console.error('Scan request failed:', err);
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div className="w-screen h-screen bg-[#09090b] text-white flex flex-col overflow-hidden font-mono select-none">
      {/* Top Floating Minimalist Controls (No heavy Appbar) */}
      <TopFloatingBar
        onStartScan={() => handleTriggerScan(currentSubnet)}
        isScanning={isScanning}
        activeView={activeView}
        setActiveView={setActiveView}
        activeInterface={interfaces[0]?.name || 'wlp3s0'}
        onOpenSettings={() => setIsSettingsOpen(true)}
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
        onApplySettings={(subnet) => {
          setCurrentSubnet(subnet);
          handleTriggerScan(subnet);
        }}
      />
    </div>
  );
};
