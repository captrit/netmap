import React, { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { NetworkNode, NetworkLink, GraphSettings, DeviceType } from '../types';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import {
  User,
  Desktop,
  DeviceMobile,
  HardDrive,
  Database,
  Globe,
  Cube,
  ShieldCheckered,
  Lightning,
  Printer,
  Television,
  Cpu,
  HardDrives,
} from '@phosphor-icons/react';

interface GraphViewerProps {
  nodes: NetworkNode[];
  links: NetworkLink[];
  selectedNode: NetworkNode | null;
  onSelectNode: (node: NetworkNode | null) => void;
  settings: GraphSettings;
  searchQuery: string;
}

interface PhysicsNode extends NetworkNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  pinned: boolean;
  radius: number;
}

interface HoverState {
  node: PhysicsNode;
  screenX: number;
  screenY: number;
}

export const GraphViewer: React.FC<GraphViewerProps> = ({
  nodes: rawNodes,
  links,
  selectedNode,
  onSelectNode,
  settings,
  searchQuery,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const physicsNodesRef = useRef<PhysicsNode[]>([]);
  const transformRef = useRef({ x: 0, y: 0, k: 1 });

  const isDraggingNodeRef = useRef<PhysicsNode | null>(null);
  const isPanningStateRef = useRef(false);
  const startMouseRef = useRef({ x: 0, y: 0 });
  const hoverNodeRef = useRef<PhysicsNode | null>(null);

  const [hoverState, setHoverState] = useState<HoverState | null>(null);

  const animFrameRef = useRef<number | null>(null);
  const particleOffsetRef = useRef<number>(0);

  // Defensive dedupe: a backend bug could in theory re-emit two node objects
  // sharing the same id (e.g. discovered once as a generic host, once as a
  // Docker container). Two entries with the same id but independent physics
  // bodies is exactly the "floating duplicate" bug — links resolve by id to
  // only one of them, leaving the other an orphan circle with no visible line.
  // Last occurrence wins, matching how the SSE stream already upserts by id.
  const nodes = useMemo(() => {
    if (!rawNodes || rawNodes.length === 0) return rawNodes;
    const byId = new Map<string, NetworkNode>();
    rawNodes.forEach((n) => byId.set(n.id, n));
    return Array.from(byId.values());
  }, [rawNodes]);

  // Guarantee every node has a link by creating fallback links to root (YOU) if unlinked
  const effectiveLinks = useMemo(() => {
    if (!nodes || nodes.length === 0) return links;

    const userNode = nodes.find((n) => n.isSelf || n.deviceType === 'user');
    const rootId = userNode ? userNode.id : nodes[0].id;

    const validNodeIds = new Set(nodes.map((n) => n.id));
    const linkedNodeIds = new Set<string>();

    const validLinks: NetworkLink[] = [];

    // Filter valid links where both source and target exist
    links.forEach((l) => {
      if (validNodeIds.has(l.source) && validNodeIds.has(l.target)) {
        validLinks.push(l);
        linkedNodeIds.add(l.source);
        linkedNodeIds.add(l.target);
      }
    });

    // Auto-connect any floating node to root (YOU / Gateway)
    nodes.forEach((n) => {
      if (n.id !== rootId && !linkedNodeIds.has(n.id)) {
        validLinks.push({
          source: rootId,
          target: n.id,
          type: n.category === 'vpn' ? 'vpn' : (n.category === 'docker' ? 'docker' : 'ethernet'),
          label: 'Direct Network Route',
        });
      }
    });

    return validLinks;
  }, [nodes, links]);

  // Initialize node layout position in radial arrangement around YOU
  useEffect(() => {
    if (!nodes || nodes.length === 0) return;

    const existingMap = new Map(physicsNodesRef.current.map((n) => [n.id, n]));
    const userNode = nodes.find((n) => n.isSelf || n.deviceType === 'user');
    const nonUserNodes = nodes.filter((n) => n.id !== userNode?.id);

    const angleStep = (2 * Math.PI) / (nonUserNodes.length || 1);

    physicsNodesRef.current = nodes.map((n, i) => {
      const existing = existingMap.get(n.id);
      const isUser = n.isSelf || n.deviceType === 'user';
      const radius = isUser ? 24 : (n.category === 'service' ? 12 : 16);

      if (existing) {
        return {
          ...n,
          x: existing.x,
          y: existing.y,
          vx: existing.vx,
          vy: existing.vy,
          pinned: existing.pinned,
          radius,
        };
      }

      if (isUser) {
        return {
          ...n,
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
          pinned: true,
          radius,
        };
      }

      const idx = nonUserNodes.findIndex((nu) => nu.id === n.id);
      const angle = idx * angleStep;
      let dist = 180;

      if (n.category === 'service') dist = 100;
      else if (n.category === 'docker') dist = 220;
      else if (n.category === 'vpn') dist = 260;
      else if (n.category === 'gateway') dist = 160;
      else if (n.category === 'host') dist = 300;

      return {
        ...n,
        x: Math.cos(angle) * dist + (Math.random() * 20 - 10),
        y: Math.sin(angle) * dist + (Math.random() * 20 - 10),
        vx: 0,
        vy: 0,
        pinned: false,
        radius,
      };
    });
  }, [nodes]);

  // Physics simulation step
  const updatePhysics = useCallback(() => {
    const physNodes = physicsNodesRef.current;
    if (physNodes.length === 0) return;

    const nodeMap = new Map(physNodes.map((n) => [n.id, n]));
    const repulsion = settings.repulsion || 5000;
    const linkDist = settings.linkDistance || 160;

    // Repulsion force
    for (let i = 0; i < physNodes.length; i++) {
      for (let j = i + 1; j < physNodes.length; j++) {
        const n1 = physNodes[i];
        const n2 = physNodes[j];
        const dx = n2.x - n1.x;
        const dy = n2.y - n1.y;
        const distSq = dx * dx + dy * dy + 1;
        const dist = Math.sqrt(distSq);

        if (dist < 400) {
          const force = repulsion / distSq;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;

          if (!n1.pinned) { n1.vx -= fx; n1.vy -= fy; }
          if (!n2.pinned) { n2.vx += fx; n2.vy += fy; }
        }
      }
    }

    // Link spring force using effectiveLinks
    effectiveLinks.forEach((link) => {
      const source = nodeMap.get(link.source);
      const target = nodeMap.get(link.target);
      if (source && target) {
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const delta = dist - linkDist;
        const force = delta * 0.035;

        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        if (!source.pinned) { source.vx += fx; source.vy += fy; }
        if (!target.pinned) { target.vx -= fx; target.vy -= fy; }
      }
    });

    // Velocity integration
    physNodes.forEach((n) => {
      if (!n.pinned) {
        n.vx -= n.x * 0.003;
        n.vy -= n.y * 0.003;

        n.vx *= 0.80;
        n.vy *= 0.80;

        n.x += n.vx;
        n.y += n.vy;
      } else {
        n.vx = 0;
        n.vy = 0;
      }
    });
  }, [effectiveLinks, settings]);

  // Canvas Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let running = true;

    const render = () => {
      if (!running) return;

      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, rect.width, rect.height);

      ctx.fillStyle = '#09090b';
      ctx.fillRect(0, 0, rect.width, rect.height);

      if (settings.showGrid) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
        ctx.lineWidth = 1;
        const gridSize = 40;
        const offsetX = (transformRef.current.x % gridSize);
        const offsetY = (transformRef.current.y % gridSize);

        for (let x = offsetX; x < rect.width; x += gridSize) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, rect.height);
          ctx.stroke();
        }
        for (let y = offsetY; y < rect.height; y += gridSize) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(rect.height, y);
          ctx.stroke();
        }
      }

      updatePhysics();
      particleOffsetRef.current = (particleOffsetRef.current + 0.4) % 30;

      const { x: tx, y: ty, k: scale } = transformRef.current;
      const centerX = rect.width / 2 + tx;
      const centerY = rect.height / 2 + ty;

      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.scale(scale, scale);

      const physNodes = physicsNodesRef.current;
      const nodeMap = new Map(physNodes.map((n) => [n.id, n]));

      const connectedNodeIds = new Set<string>();
      if (selectedNode) {
        connectedNodeIds.add(selectedNode.id);
        effectiveLinks.forEach((l) => {
          if (l.source === selectedNode.id) connectedNodeIds.add(l.target);
          if (l.target === selectedNode.id) connectedNodeIds.add(l.source);
        });
      }

      // Draw Links
      effectiveLinks.forEach((link) => {
        const source = nodeMap.get(link.source);
        const target = nodeMap.get(link.target);
        if (!source || !target) return;

        const isDimmed = selectedNode && !connectedNodeIds.has(source.id) && !connectedNodeIds.has(target.id);
        const isSelectedLink = selectedNode && (source.id === selectedNode.id || target.id === selectedNode.id);

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);

        let strokeColor = 'rgba(255, 255, 255, 0.15)';
        let lineWidth = 1.2;

        if (link.type === 'service') {
          strokeColor = 'rgba(255, 255, 255, 0.4)';
          lineWidth = 1.5;
          ctx.setLineDash([2, 2]);
        } else if (link.type === 'vpn') {
          strokeColor = 'rgba(255, 255, 255, 0.7)';
          lineWidth = 2.0;
          ctx.setLineDash([6, 4]);
        } else if (link.type === 'docker') {
          strokeColor = 'rgba(255, 255, 255, 0.25)';
          ctx.setLineDash([3, 3]);
        } else if (link.type === 'pivot') {
          strokeColor = 'rgba(251, 191, 36, 0.75)';
          lineWidth = 2.0;
          ctx.setLineDash([8, 3, 2, 3]);
        }

        if (isSelectedLink) {
          strokeColor = '#ffffff';
          lineWidth = 2.2;
          ctx.setLineDash([]);
        }

        if (isDimmed) {
          strokeColor = 'rgba(255, 255, 255, 0.03)';
          lineWidth = 0.8;
        }

        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = lineWidth;
        ctx.stroke();

        // Link Particles
        if (settings.animateParticles && !isDimmed) {
          const dx = target.x - source.x;
          const dy = target.y - source.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          const numParticles = Math.max(1, Math.floor(len / 60));

          for (let p = 0; p < numParticles; p++) {
            const progress = ((particleOffsetRef.current / 30 + p / numParticles) % 1);
            const px = source.x + dx * progress;
            const py = source.y + dy * progress;

            ctx.beginPath();
            ctx.arc(px, py, 2, 0, Math.PI * 2);
            ctx.fillStyle = isSelectedLink ? '#ffffff' : 'rgba(255, 255, 255, 0.6)';
            ctx.fill();
          }
        }

        ctx.restore();
      });

      // Draw Icon-Only Node Circles
      physNodes.forEach((node) => {
        const isSelected = selectedNode?.id === node.id;
        const isHovered = hoverNodeRef.current?.id === node.id;
        const isDimmed = selectedNode && !connectedNodeIds.has(node.id);
        const isUser = node.isSelf || node.deviceType === 'user';

        const isMatchingSearch = Boolean(searchQuery && (
          node.ip.toLowerCase().includes(searchQuery.toLowerCase()) ||
          node.label.toLowerCase().includes(searchQuery.toLowerCase())
        ));

        ctx.save();
        ctx.globalAlpha = isDimmed ? 0.2 : 1.0;

        const r = node.radius;

        // Selection / Hover / User Ring
        if (isUser || isSelected || isHovered || isMatchingSearch) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, r + (isUser ? 7 : 5), 0, Math.PI * 2);
          ctx.strokeStyle = isUser ? '#ffffff' : (isSelected ? '#ffffff' : 'rgba(255, 255, 255, 0.6)');
          ctx.lineWidth = isUser ? 2 : 1.5;
          if (isUser) ctx.setLineDash([3, 3]);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Node Circle Fill & Border
        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx.fillStyle = isUser ? '#ffffff' : (isSelected ? '#3f3f46' : (isHovered ? '#27272a' : '#18181b'));
        ctx.fill();

        ctx.strokeStyle = isUser ? '#ffffff' : (isSelected ? '#ffffff' : 'rgba(255, 255, 255, 0.25)');
        ctx.lineWidth = isUser || isSelected ? 2 : 1;
        ctx.stroke();

        // Icon inside Node Circle
        const iconSymbol = getDeviceSymbol(node.deviceType);
        ctx.font = isUser ? '16px Inter, sans-serif' : '12px Inter, sans-serif';
        ctx.fillStyle = isUser ? '#000000' : '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(iconSymbol, node.x, node.y);

        ctx.textBaseline = 'alphabetic';

        // Pin indicator
        if (node.pinned && !isUser) {
          ctx.beginPath();
          ctx.arc(node.x + r - 2, node.y - r + 2, 3, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
        }

        // Pivot-hop ring — found through a second host, not directly
        if (node.hop && node.hop > 0) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, r + 3, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(251, 191, 36, 0.85)';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([2, 2]);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Security-role indicator — an actual verified finding (open FTP,
        // open SMB share, DC candidate), not a guess
        if (node.roles && node.roles.length > 0) {
          ctx.beginPath();
          ctx.arc(node.x - r + 2, node.y - r + 2, 3, 0, Math.PI * 2);
          ctx.fillStyle = '#f87171';
          ctx.fill();
        }

        // Web-app indicator — a confirmed HTTP/HTTPS listener (real banner
        // or real TLS cert), placed opposite the role dot so both can show
        if (node.ports?.some((p) => p.isWeb)) {
          ctx.beginPath();
          ctx.arc(node.x, node.y - r - 3, 3, 0, Math.PI * 2);
          ctx.fillStyle = '#60a5fa';
          ctx.fill();
        }

        ctx.restore();
      });

      ctx.restore();
      ctx.restore();

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      running = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [effectiveLinks, settings, updatePhysics, selectedNode, searchQuery]);

  function getDeviceSymbol(type: DeviceType): string {
    switch (type) {
      case 'user': return '👤';
      case 'laptop': return '💻';
      case 'mobile': return '📱';
      case 'server': return '🖥️';
      case 'database': return '🗄️';
      case 'router': return '🌐';
      case 'docker': return '📦';
      case 'vpn': return '🔒';
      case 'service': return '⚡';
      case 'printer': return '🖨️';
      case 'tv': return '📺';
      case 'iot': return '📟';
      case 'nas': return '💾';
      default: return '💻';
    }
  }

  const getCanvasMousePos = (e: React.MouseEvent<HTMLCanvasElement>): { worldX: number; worldY: number; clientX: number; clientY: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { worldX: 0, worldY: 0, clientX: 0, clientY: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    const { x: tx, y: ty, k: scale } = transformRef.current;
    const centerX = rect.width / 2 + tx;
    const centerY = rect.height / 2 + ty;

    const worldX = (clientX - centerX) / scale;
    const worldY = (clientY - centerY) / scale;

    return { worldX, worldY, clientX, clientY };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { worldX, worldY, clientX, clientY } = getCanvasMousePos(e);
    const physNodes = physicsNodesRef.current;

    let clickedNode: PhysicsNode | null = null;
    for (let i = physNodes.length - 1; i >= 0; i--) {
      const n = physNodes[i];
      const dx = worldX - n.x;
      const dy = worldY - n.y;
      if (dx * dx + dy * dy <= (n.radius + 6) * (n.radius + 6)) {
        clickedNode = n;
        break;
      }
    }

    if (clickedNode) {
      isDraggingNodeRef.current = clickedNode;
      clickedNode.pinned = true;
      clickedNode.vx = 0;
      clickedNode.vy = 0;
      onSelectNode(clickedNode);
    } else {
      isPanningStateRef.current = true;
      startMouseRef.current = { x: clientX - transformRef.current.x, y: clientY - transformRef.current.y };
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { worldX, worldY, clientX, clientY } = getCanvasMousePos(e);

    if (isDraggingNodeRef.current) {
      isDraggingNodeRef.current.x = worldX;
      isDraggingNodeRef.current.y = worldY;
      isDraggingNodeRef.current.vx = 0;
      isDraggingNodeRef.current.vy = 0;
      isDraggingNodeRef.current.pinned = true;
    } else if (isPanningStateRef.current) {
      transformRef.current.x = clientX - startMouseRef.current.x;
      transformRef.current.y = clientY - startMouseRef.current.y;
    }

    const physNodes = physicsNodesRef.current;
    let foundHover: PhysicsNode | null = null;
    for (let i = physNodes.length - 1; i >= 0; i--) {
      const n = physNodes[i];
      const dx = worldX - n.x;
      const dy = worldY - n.y;
      if (dx * dx + dy * dy <= (n.radius + 6) * (n.radius + 6)) {
        foundHover = n;
        break;
      }
    }
    hoverNodeRef.current = foundHover;

    if (foundHover && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const { x: tx, y: ty, k: scale } = transformRef.current;
      const centerX = rect.width / 2 + tx;
      const centerY = rect.height / 2 + ty;

      const screenX = centerX + foundHover.x * scale;
      const screenY = centerY + foundHover.y * scale;

      setHoverState({
        node: foundHover,
        screenX,
        screenY,
      });
    } else {
      setHoverState(null);
    }
  };

  const handleMouseUp = () => {
    if (isDraggingNodeRef.current) {
      isDraggingNodeRef.current.pinned = true;
      isDraggingNodeRef.current.vx = 0;
      isDraggingNodeRef.current.vy = 0;
      isDraggingNodeRef.current = null;
    }
    isPanningStateRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.12 : 0.88;
    const newK = Math.max(0.2, Math.min(4.0, transformRef.current.k * zoomFactor));
    transformRef.current.k = newK;
  };

  const handleZoomIn = () => {
    transformRef.current.k = Math.min(4.0, transformRef.current.k * 1.25);
  };

  const handleZoomOut = () => {
    transformRef.current.k = Math.max(0.2, transformRef.current.k * 0.8);
  };

  const handleResetView = () => {
    transformRef.current = { x: 0, y: 0, k: 1 };
  };

  const renderTooltipIcon = (type: DeviceType) => {
    switch (type) {
      case 'user': return <User size={13} className="text-white" />;
      case 'service': return <Lightning size={13} className="text-zinc-300" />;
      case 'laptop': return <Desktop size={13} className="text-zinc-300" />;
      case 'mobile': return <DeviceMobile size={13} className="text-zinc-300" />;
      case 'server': return <HardDrive size={13} className="text-zinc-300" />;
      case 'database': return <Database size={13} className="text-zinc-300" />;
      case 'router': return <Globe size={13} className="text-zinc-300" />;
      case 'docker': return <Cube size={13} className="text-zinc-300" />;
      case 'vpn': return <ShieldCheckered size={13} className="text-zinc-300" />;
      case 'printer': return <Printer size={13} className="text-zinc-300" />;
      case 'tv': return <Television size={13} className="text-zinc-300" />;
      case 'iot': return <Cpu size={13} className="text-zinc-300" />;
      case 'nas': return <HardDrives size={13} className="text-zinc-300" />;
      default: return <Desktop size={13} className="text-zinc-300" />;
    }
  };

  return (
    <div className="relative w-full h-full bg-[#09090b] overflow-hidden flex flex-col justify-between select-none">
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        className="w-full h-full cursor-grab active:cursor-grabbing block"
      />

      {/* MINIMAL SLEEK HOVER TOOLTIP */}
      {hoverState && (
        <div
          style={{
            left: `${hoverState.screenX}px`,
            top: `${hoverState.screenY - hoverState.node.radius - 10}px`,
            transform: 'translate(-50%, -100%)',
          }}
          className="absolute z-40 pointer-events-none bg-[#141417]/95 border border-white/15 backdrop-blur-md rounded-lg px-3 py-1.5 shadow-2xl font-mono text-xs text-white flex items-center gap-2.5 whitespace-nowrap animate-in fade-in zoom-in-95 duration-100"
        >
          <span className="text-zinc-300 flex items-center justify-center">
            {renderTooltipIcon(hoverState.node.deviceType)}
          </span>

          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-white">{hoverState.node.label}</span>
            <span className="text-zinc-400 text-[11px]">({hoverState.node.ip})</span>
          </div>

          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse ml-0.5" title="Online"></span>

          <div className="absolute left-1/2 -bottom-1.5 -translate-x-1/2 w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[5px] border-t-white/20"></div>
        </div>
      )}

      {/* Floating Zoom Controls */}
      <div className="absolute bottom-6 right-6 z-20 flex flex-col gap-1.5 bg-[#18181b]/90 border border-white/10 p-1.5 rounded-xl shadow-2xl backdrop-blur-md">
        <button
          onClick={handleZoomIn}
          className="p-2 text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-lg transition-all"
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={handleZoomOut}
          className="p-2 text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-lg transition-all"
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={handleResetView}
          className="p-2 text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-lg transition-all"
          title="Reset Topology View"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* Clean Legend Bar */}
      <div className="absolute bottom-6 left-6 z-20 bg-[#18181b]/90 border border-white/10 px-4 py-2.5 rounded-xl shadow-2xl backdrop-blur-md flex items-center gap-5 text-xs font-mono text-zinc-400">
        <div className="flex items-center gap-2 text-white font-semibold">
          <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse"></span>
          <span>👤 YOU (Root Workstation)</span>
        </div>
        <div className="h-3 w-[1px] bg-white/10"></div>
        <div className="flex items-center gap-3 text-zinc-400 text-[11px]">
          <span>Hover node for basic info • Click for full sidebar details</span>
        </div>
      </div>
    </div>
  );
};
