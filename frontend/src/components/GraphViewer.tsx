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
  MagnifyingGlass,
} from '@phosphor-icons/react';
import { Theme } from '../hooks/useTheme';

// The real Docker whale logo (via simple-icons), drawn in brand blue instead
// of a generic package emoji so Docker containers are actually recognizable.
const DOCKER_LOGO_PATH =
  'M13.983 11.078h2.119a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.119a.185.185 0 00-.185.185v1.888c0 .102.083.185.185.185m-2.954-5.43h2.118a.186.186 0 00.186-.186V3.574a.186.186 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.888c0 .102.082.185.185.185m0 2.716h2.118a.187.187 0 00.186-.186V6.29a.186.186 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.887c0 .102.082.185.185.186m-2.93 0h2.12a.186.186 0 00.184-.186V6.29a.185.185 0 00-.185-.185H8.1a.185.185 0 00-.185.185v1.887c0 .102.083.185.185.186m-2.964 0h2.119a.186.186 0 00.185-.186V6.29a.185.185 0 00-.185-.185H5.136a.186.186 0 00-.186.185v1.887c0 .102.084.185.186.186m5.893 2.715h2.118a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.118a.185.185 0 00-.185.185v1.888c0 .102.082.185.185.185m-2.93 0h2.12a.185.185 0 00.184-.185V9.006a.185.185 0 00-.184-.186h-2.12a.185.185 0 00-.184.185v1.888c0 .102.083.185.185.185m-2.964 0h2.119a.185.185 0 00.185-.185V9.006a.185.185 0 00-.184-.186h-2.12a.186.186 0 00-.186.186v1.887c0 .102.084.185.186.185m-2.92 0h2.12a.185.185 0 00.184-.185V9.006a.185.185 0 00-.184-.186h-2.12a.185.185 0 00-.184.185v1.888c0 .102.082.185.185.185M23.763 9.89c-.065-.051-.672-.51-1.954-.51-.338.001-.676.03-1.01.087-.248-1.7-1.653-2.53-1.716-2.566l-.344-.199-.226.327c-.284.438-.49.922-.612 1.43-.23.97-.09 1.882.403 2.661-.595.332-1.55.413-1.744.42H.751a.751.751 0 00-.75.748 11.376 11.376 0 00.692 4.062c.545 1.428 1.355 2.48 2.41 3.124 1.18.723 3.1 1.137 5.275 1.137.983.003 1.963-.086 2.93-.266a12.248 12.248 0 003.823-1.389c.98-.567 1.86-1.288 2.61-2.136 1.252-1.418 1.998-2.997 2.553-4.4h.221c1.372 0 2.215-.549 2.68-1.009.309-.293.55-.65.707-1.046l.098-.288Z';

const DOCKER_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#2496ED" d="${DOCKER_LOGO_PATH}"/></svg>`;

const dockerLogoImg = new Image();
dockerLogoImg.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(DOCKER_LOGO_SVG);

// A clean, minimal single-color glyph for the root "YOU" node — the
// cartoonish Twemoji bust used for every other person-y context reads as
// unprofessional for the one node that represents the operator, so this one
// gets its own simple circle-and-shoulders mark instead.
const USER_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#0070f3"><circle cx="12" cy="8.2" r="4.2"/><path d="M3.5 21.5a8.5 8.5 0 0 1 17 0z"/></svg>';

const userIconImg = new Image();
userIconImg.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(USER_ICON_SVG);

// Detailed, full-color device glyphs (Twemoji artwork) for every type except
// Docker (real brand logo above) and the root user (clean mark above).
// Twemoji gives the same rich, recognizable look the original OS emoji had,
// but as a consistent embedded SVG asset instead of a platform-dependent
// font glyph.
const DEVICE_TWEMOJI: Partial<Record<DeviceType, string>> = {
  laptop: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 36 36\"><path fill=\"#CCD6DD\" d=\"M34 29.096c-.417-.963-.896-2.008-2-2.008h-1c1.104 0 2-.899 2-2.008V8.008C33 6.899 32.104 6 31 6H5c-1.104 0-2 .899-2 2.008V25.08c0 1.109.896 2.008 2 2.008H4c-1.104 0-1.667 1.004-2 2.008l-2 4.895C0 35.101.896 36 2 36h32c1.104 0 2-.899 2-2.008l-2-4.896z\"/><path fill=\"#9AAAB4\" d=\"M.008 34.075l.006.057.17.692C.5 35.516 1.192 36 2 36h32c1.076 0 1.947-.855 1.992-1.925H.008z\"/><path fill=\"#5DADEC\" d=\"M31 24.075c0 .555-.447 1.004-1 1.004H6c-.552 0-1-.449-1-1.004V9.013c0-.555.448-1.004 1-1.004h24c.553 0 1 .45 1 1.004v15.062z\"/><path fill=\"#AEBBC1\" d=\"M32.906 31.042l-.76-2.175c-.239-.46-.635-.837-1.188-.837H5.11c-.552 0-.906.408-1.156 1.036l-.688 1.977c-.219.596.448 1.004 1 1.004h7.578s.937-.047 1.103-.608c.192-.648.415-1.624.463-1.796.074-.264.388-.531.856-.531h8.578c.5 0 .746.253.811.566.042.204.312 1.141.438 1.782.111.571 1.221.586 1.221.586h6.594c.551 0 1.217-.471.998-1.004z\"/><path fill=\"#9AAAB4\" d=\"M22.375 33.113h-7.781c-.375 0-.538-.343-.484-.675.054-.331.359-1.793.383-1.963.023-.171.274-.375.524-.375h7.015c.297 0 .49.163.55.489.059.327.302 1.641.321 1.941.019.301-.169.583-.528.583z\"/></svg>",
  mobile: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 36 36\"><path fill=\"#31373D\" d=\"M11 36s-4 0-4-4V4s0-4 4-4h14s4 0 4 4v28s0 4-4 4H11z\"/><path fill=\"#55ACEE\" d=\"M9 5h18v26H9z\"/></svg>",
  server: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 36 36\"><path fill=\"#CCD6DD\" d=\"M36 22c0 2.209-1.791 4-4 4H4c-2.209 0-4-1.791-4-4V4c0-2.209 1.791-4 4-4h28c2.209 0 4 1.791 4 4v18z\"/><path fill=\"#5DADEC\" d=\"M4 4h28v18H4z\"/><path fill=\"#CCD6DD\" d=\"M13 26h10v6H13z\"/><path fill=\"#9AAAB4\" d=\"M13 26h10v2H13z\"/><path fill=\"#E1E8ED\" d=\"M36 33c0-1.657-1.343-3-3-3H3c-1.657 0-3 1.343-3 3s1.343 3 3 3h30c1.657 0 3-1.343 3-3z\"/><path fill=\"#F5F8FA\" d=\"M3 32h2v2H3zm4 0h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2zm4 0h2v2h-2zm4 0h2v2h-2zm4 0h2v2h-2zm4 0h2v2h-2z\"/></svg>",
  database: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 36 36\"><path fill=\"#292F33\" d=\"M30 34c0 1.104-.896 2-2 2H8c-1.104 0-2-.896-2-2V2c0-1.104.896-2 2-2h20c1.104 0 2 .896 2 2v32z\"/><path fill=\"#66757F\" d=\"M28 16c0 .552-.447 1-1 1H9c-.552 0-1-.448-1-1V3c0-.552.448-1 1-1h18c.553 0 1 .448 1 1v13zm0 17c0 .553-.447 1-1 1H9c-.552 0-1-.447-1-1V20c0-.553.448-1 1-1h18c.553 0 1 .447 1 1v13z\"/><path fill=\"#292F33\" d=\"M22 8c0 .552-.447 1-1 1h-6c-.552 0-1-.448-1-1V5c0-.552.448-1 1-1h6c.553 0 1 .448 1 1v3zm0 17c0 .553-.447 1-1 1h-6c-.552 0-1-.447-1-1v-3c0-.553.448-1 1-1h6c.553 0 1 .447 1 1v3z\"/><path fill=\"#E1E8ED\" d=\"M15 5h6v3h-6zm0 17h6v3h-6zm9-8.97c0 .536-.435.97-.97.97H12.97c-.536 0-.97-.435-.97-.97v-.06c0-.536.434-.97.97-.97h10.06c.535 0 .97.435.97.97v.06zm0 16.999c0 .536-.435.971-.97.971H12.97c-.536 0-.97-.435-.97-.971v-.059c0-.535.434-.97.97-.97h10.06c.535 0 .97.435.97.971v.058z\"/></svg>",
  router: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 36 36\"><path fill=\"#3B88C3\" d=\"M18 0C8.059 0 0 8.059 0 18s8.059 18 18 18 18-8.059 18-18S27.941 0 18 0zM2.05 19h3.983c.092 2.506.522 4.871 1.229 7H4.158c-1.207-2.083-1.95-4.459-2.108-7zM19 8V2.081c2.747.436 5.162 2.655 6.799 5.919H19zm7.651 2c.754 2.083 1.219 4.46 1.317 7H19v-7h7.651zM17 2.081V8h-6.799C11.837 4.736 14.253 2.517 17 2.081zM17 10v7H8.032c.098-2.54.563-4.917 1.317-7H17zM6.034 17H2.05c.158-2.54.901-4.917 2.107-7h3.104c-.705 2.129-1.135 4.495-1.227 7zm1.998 2H17v7H9.349c-.754-2.083-1.219-4.459-1.317-7zM17 28v5.919c-2.747-.437-5.163-2.655-6.799-5.919H17zm2 5.919V28h6.8c-1.637 3.264-4.053 5.482-6.8 5.919zM19 26v-7h8.969c-.099 2.541-.563 4.917-1.317 7H19zm10.967-7h3.982c-.157 2.541-.9 4.917-2.107 7h-3.104c.706-2.129 1.136-4.494 1.229-7zm0-2c-.093-2.505-.523-4.871-1.229-7h3.104c1.207 2.083 1.95 4.46 2.107 7h-3.982zm.512-9h-2.503c-.717-1.604-1.606-3.015-2.619-4.199C27.346 4.833 29.089 6.267 30.479 8zM10.643 3.801C9.629 4.985 8.74 6.396 8.023 8H5.521c1.39-1.733 3.133-3.166 5.122-4.199zM5.521 28h2.503c.716 1.604 1.605 3.015 2.619 4.198C8.654 31.166 6.911 29.733 5.521 28zm19.836 4.198c1.014-1.184 1.902-2.594 2.619-4.198h2.503c-1.39 1.733-3.133 3.166-5.122 4.198z\"/></svg>",
  vpn: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 36 36\"><path fill=\"#AAB8C2\" d=\"M18 3C12.477 3 8 7.477 8 13v10h4V13c0-3.313 2.686-6 6-6s6 2.687 6 6v10h4V13c0-5.523-4.477-10-10-10z\"/><path fill=\"#FFAC33\" d=\"M31 32c0 2.209-1.791 4-4 4H9c-2.209 0-4-1.791-4-4V20c0-2.209 1.791-4 4-4h18c2.209 0 4 1.791 4 4v12z\"/></svg>",
  service: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 36 36\"><path fill=\"#FFAC33\" d=\"M32.938 15.651C32.792 15.26 32.418 15 32 15H19.925L26.89 1.458c.219-.426.106-.947-.271-1.243C26.437.071 26.218 0 26 0c-.233 0-.466.082-.653.243L18 6.588 3.347 19.243c-.316.273-.43.714-.284 1.105S3.582 21 4 21h12.075L9.11 34.542c-.219.426-.106.947.271 1.243.182.144.401.215.619.215.233 0 .466-.082.653-.243L18 29.412l14.653-12.655c.317-.273.43-.714.285-1.106z\"/></svg>",
  printer: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 36 36\"><path fill=\"#67757F\" d=\"M30 12H6V5c0-1.105.826-2 1.846-2h20.309C29.173 3 30 3.895 30 5v7zm0 19c0 1.104-.896 2-2 2H8c-1.104 0-2-.896-2-2v-3h24v3z\"/><path fill=\"#E1E8ED\" d=\"M27 12H9V2c0-1.105.896-2 2-2h14c1.104 0 2 .896 2 2v10z\"/><path fill=\"#5DADEC\" d=\"M34 25c0 1-1 3-3 3H5c-2 0-3-2-3-3v-9c0-2.209 1.791-4 4-4h24c2.209 0 4 1.791 4 4v9z\"/><path fill=\"#292F33\" d=\"M30 25c0-1.104-.978-2-2.182-2H8.182C6.977 23 6 23.896 6 25v4h24v-4z\"/><path fill=\"#4289C1\" d=\"M30 15c0 1.104-.896 2-2 2H8c-1.104 0-2-.896-2-2v-4h24v4z\"/><path fill=\"#E1E8ED\" d=\"M27 34c0 1.104-.896 2-2 2H11c-1.104 0-2-.896-2-2v-8h18v8z\"/><path fill=\"#9AAAB4\" d=\"M25 29c0 .553-.447 1-1 1H12c-.552 0-1-.447-1-1 0-.553.448-1 1-1h12c.553 0 1 .447 1 1z\"/><circle fill=\"#F5F8FA\" cx=\"30.5\" cy=\"19.5\" r=\"1.5\"/><path fill=\"#9AAAB4\" d=\"M25 32c0 .553-.447 1-1 1H12c-.552 0-1-.447-1-1 0-.553.448-1 1-1h12c.553 0 1 .447 1 1zM9 25h18v2H9z\"/></svg>",
  tv: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 36 36\"><path fill=\"#31373D\" d=\"M35 31s0 4-4 4H5c-4 0-4-4-4-4V12c0-4 4-4 4-4h26s4 0 4 4v19z\"/><path fill=\"#31373D\" d=\"M21.303 10.389c.391.391.391 1.023 0 1.414s-1.023.391-1.414 0l-9.192-9.192c-.391-.391-.391-1.023 0-1.414s1.023-.391 1.414 0l9.192 9.192z\"/><path fill=\"#31373D\" d=\"M14.697 10.389c-.391.391-.391 1.023 0 1.414s1.023.391 1.414 0l9.192-9.192c.391-.391.391-1.023 0-1.414s-1.023-.391-1.414 0l-9.192 9.192z\"/><path fill=\"#55ACEE\" d=\"M18 11c8 0 10 1 11 2s2 3 2 8-1 7-2 8-3 2-11 2-10-1-11-2-2-3-2-8 1-7 2-8 3-2 11-2z\"/><circle fill=\"#66757F\" cx=\"31.5\" cy=\"31.5\" r=\"1.5\"/><circle fill=\"#66757F\" cx=\"4.5\" cy=\"31.5\" r=\"1.5\"/></svg>",
  iot: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 36 36\"><path fill=\"#31373D\" d=\"M36 27c0 2.209-1.791 4-4 4H4c-2.209 0-4-1.791-4-4V9c0-2.209 1.791-4 4-4h28c2.209 0 4 1.791 4 4v18z\"/><path fill=\"#C6E5B3\" d=\"M34 21c0 1.104-.896 2-2 2H4c-1.104 0-2-.896-2-2V9c0-1.104.896-2 2-2h28c1.104 0 2 .896 2 2v12z\"/><path fill=\"#66757F\" d=\"M14 27c0 1.104-.896 2-2 2H4c-1.104 0-2-.896-2-2s.896-2 2-2h8c1.104 0 2 .896 2 2zm14 0c0 1.104-.896 2-2 2h-8c-1.104 0-2-.896-2-2s.896-2 2-2h8c1.104 0 2 .896 2 2z\"/><circle fill=\"#DD2E44\" cx=\"32\" cy=\"27\" r=\"2\"/><path d=\"M24.616 16.138c-.291 0-.416-.196-.416-.351 0-.131.048-.202.083-.262l1.332-2.414c.131-.238.297-.345.606-.345.345 0 .684.22.684.761v1.826h.101c.232 0 .416.155.416.393 0 .238-.184.392-.416.392h-.101v.506c0 .315-.125.464-.428.464s-.428-.149-.428-.464v-.506h-1.433zm1.433-2.444h-.012l-.803 1.659h.815v-1.659zm-5.744 1.171c0-.961.372-2.17 1.563-2.17 1.192 0 1.563 1.209 1.563 2.17s-.372 2.171-1.563 2.171c-1.191 0-1.563-1.209-1.563-2.171zm2.206 0c0-.448-.041-1.368-.643-1.368s-.643.92-.643 1.368c0 .419.041 1.368.643 1.368.602.001.643-.949.643-1.368zm-5.781 1.201c-.291 0-.416-.196-.416-.351 0-.131.048-.202.083-.262l1.332-2.414c.131-.238.297-.345.606-.345.345 0 .684.22.684.761v1.826h.101c.232 0 .416.155.416.393 0 .238-.184.392-.416.392h-.101v.506c0 .315-.125.464-.428.464s-.428-.149-.428-.464v-.506H16.73zm1.433-2.444h-.012l-.803 1.659h.815v-1.659zm-5.744 1.315c0-.961.372-2.17 1.563-2.17 1.192 0 1.563 1.209 1.563 2.17s-.372 2.171-1.563 2.171c-1.191-.001-1.563-1.21-1.563-2.171zm2.206 0c0-.448-.041-1.368-.643-1.368s-.643.92-.643 1.368c0 .419.041 1.368.643 1.368s.643-.95.643-1.368zm-5.781 1.201c-.291 0-.416-.196-.416-.351 0-.131.048-.202.083-.262l1.332-2.414c.131-.238.297-.345.606-.345.345 0 .684.22.684.761v1.826h.101c.232 0 .416.155.416.393 0 .238-.184.392-.416.392h-.101v.506c0 .315-.125.464-.428.464s-.428-.149-.428-.464v-.506H8.844zm1.433-2.444h-.012l-.803 1.659h.815v-1.659z\" fill=\"#77B255\"/></svg>",
  nas: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 36 36\"><path fill=\"#31373D\" d=\"M4 36s-4 0-4-4V4s0-4 4-4h26c1 0 2 1 2 1l3 3s1 1 1 2v26s0 4-4 4H4z\"/><path fill=\"#55ACEE\" d=\"M5 19v-1s0-2 2-2h21c2 0 2 2 2 2v1H5z\"/><path fill=\"#E1E8ED\" d=\"M5 32.021V19h25v13s0 2-2 2H7c-2 0-2-1.979-2-1.979zM10 3s0-1 1-1h18c1.048 0 1 1 1 1v10s0 1-1 1H11s-1 0-1-1V3zm12 10h5V3h-5v10z\"/></svg>",
};

const deviceIconCache = new Map<DeviceType, HTMLImageElement>();
(Object.keys(DEVICE_TWEMOJI) as DeviceType[]).forEach((type) => {
  const svg = DEVICE_TWEMOJI[type]!;
  const img = new Image();
  img.src = "data:image/svg+xml;utf8," + encodeURIComponent(svg);
  deviceIconCache.set(type, img);
});

interface GraphViewerProps {
  nodes: NetworkNode[];
  links: NetworkLink[];
  selectedNode: NetworkNode | null;
  onSelectNode: (node: NetworkNode | null) => void;
  settings: GraphSettings;
  searchQuery: string;
  theme: Theme;
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

const PALETTES = {
  dark: {
    canvasBg: '#101010',
    grid: 'rgba(255, 255, 255, 0.045)',
    linkDefault: '#8a8a92',
    linkService: '#71717a',
    linkVpn: '#52525b',
    linkDocker: '#8a8a92',
    linkPivot: 'rgba(245, 166, 35, 0.75)',
    linkSelected: '#ffffff',
    linkDimmed: 'rgba(255, 255, 255, 0.03)',
    particleDefault: '#9a9aa2',
    particleSelected: '#ffffff',
    nodeFillDefault: '#1c1c1c',
    nodeFillHover: '#282828',
    nodeFillSelected: '#3a3a3a',
    nodeFillUser: '#ededed',
    nodeBorderDefault: 'rgba(255, 255, 255, 0.25)',
    nodeBorderStrong: '#ffffff',
    nodeTextDefault: '#ffffff',
    nodeTextUser: '#000000',
    ringHover: 'rgba(255, 255, 255, 0.6)',
    searchMatch: '#3b9eff',
    pivotRing: 'rgba(245, 166, 35, 0.85)',
    warning: '#f5a623',
    danger: '#ff6166',
  },
  light: {
    canvasBg: '#ffffff',
    grid: 'rgba(0, 0, 0, 0.06)',
    linkDefault: '#8a8a92',
    linkService: '#71717a',
    linkVpn: '#52525b',
    linkDocker: '#8a8a92',
    linkPivot: 'rgba(178, 94, 0, 0.75)',
    linkSelected: '#a3a3ab',
    linkDimmed: 'rgba(0, 0, 0, 0.04)',
    particleDefault: '#9a9aa2',
    particleSelected: '#a3a3ab',
    nodeFillDefault: '#f2f2f2',
    nodeFillHover: '#e8e8e8',
    nodeFillSelected: '#d4d4d4',
    nodeFillUser: '#dbeafe',
    nodeBorderDefault: 'rgba(0, 0, 0, 0.2)',
    nodeBorderStrong: '#52525b',
    nodeTextDefault: '#0a0a0a',
    nodeTextUser: '#ffffff',
    ringHover: 'rgba(0, 0, 0, 0.5)',
    searchMatch: '#0070f3',
    pivotRing: 'rgba(178, 94, 0, 0.85)',
    warning: '#b25e00',
    danger: '#e5484d',
  },
} as const;

function nodeMatchesQuery(node: NetworkNode, query: string): boolean {
  const q = query.toLowerCase();
  if (
    node.ip.toLowerCase().includes(q) ||
    node.label.toLowerCase().includes(q) ||
    (node.mac && node.mac.toLowerCase().includes(q)) ||
    (node.vendor && node.vendor.toLowerCase().includes(q)) ||
    (node.os && node.os.toLowerCase().includes(q)) ||
    (node.hostname && node.hostname.toLowerCase().includes(q)) ||
    node.deviceType.toLowerCase().includes(q) ||
    node.category.toLowerCase().includes(q)
  ) {
    return true;
  }
  return node.ports.some(
    (p) => String(p.port).includes(q) || p.service.toLowerCase().includes(q)
  );
}

export const GraphViewer: React.FC<GraphViewerProps> = ({
  nodes: rawNodes,
  links,
  selectedNode,
  onSelectNode,
  settings,
  searchQuery,
  theme,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const physicsNodesRef = useRef<PhysicsNode[]>([]);
  const transformRef = useRef({ x: 0, y: 0, k: 1 });

  const isDraggingNodeRef = useRef<PhysicsNode | null>(null);
  const nodeDragStartRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const isPanningStateRef = useRef(false);
  const startMouseRef = useRef({ x: 0, y: 0 });
  const hoverNodeRef = useRef<PhysicsNode | null>(null);

  const [hoverState, setHoverState] = useState<HoverState | null>(null);

  const animFrameRef = useRef<number | null>(null);
  const particleOffsetRef = useRef<number>(0);

  const palette = PALETTES[theme];

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

  const trimmedQuery = searchQuery.trim();
  const searchMatchIds = useMemo(() => {
    if (!trimmedQuery) return null;
    const matches = new Set<string>();
    nodes.forEach((n) => {
      if (nodeMatchesQuery(n, trimmedQuery)) matches.add(n.id);
    });
    return matches;
  }, [nodes, trimmedQuery]);

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

      ctx.fillStyle = palette.canvasBg;
      ctx.fillRect(0, 0, rect.width, rect.height);

      if (settings.showGrid) {
        ctx.strokeStyle = palette.grid;
        ctx.lineWidth = 0.6;
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
          ctx.lineTo(rect.width, y);
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

      // Search takes priority over selection for emphasis — an active query
      // dims everything that doesn't match (including an empty match set,
      // which reads as a clear "no results" signal instead of doing nothing).
      const emphasisIds = searchMatchIds ?? (selectedNode ? connectedNodeIds : null);

      // Draw Links
      effectiveLinks.forEach((link) => {
        const source = nodeMap.get(link.source);
        const target = nodeMap.get(link.target);
        if (!source || !target) return;

        const isDimmed = emphasisIds ? !emphasisIds.has(source.id) && !emphasisIds.has(target.id) : false;
        const isSelectedLink = selectedNode && (source.id === selectedNode.id || target.id === selectedNode.id);

        // Trim the segment to stop at each node's outer ring instead of its
        // center — drawing center-to-center cuts the line straight through
        // the circle and icon of every node it merely passes behind.
        const rawDx = target.x - source.x;
        const rawDy = target.y - source.y;
        const rawDist = Math.sqrt(rawDx * rawDx + rawDy * rawDy) || 1;
        const ux = rawDx / rawDist;
        const uy = rawDy / rawDist;
        const sourcePad = source.radius + (source.isSelf || source.deviceType === 'user' ? 10 : 5);
        const targetPad = target.radius + (target.isSelf || target.deviceType === 'user' ? 10 : 5);
        const canTrim = rawDist - sourcePad - targetPad > 2;

        const startX = canTrim ? source.x + ux * sourcePad : source.x;
        const startY = canTrim ? source.y + uy * sourcePad : source.y;
        const endX = canTrim ? target.x - ux * targetPad : target.x;
        const endY = canTrim ? target.y - uy * targetPad : target.y;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);

        let strokeColor: string = palette.linkDefault;
        let lineWidth = 1.2;

        if (link.type === 'service') {
          strokeColor = palette.linkService;
          lineWidth = 1.5;
          ctx.setLineDash([2, 2]);
        } else if (link.type === 'vpn') {
          strokeColor = palette.linkVpn;
          lineWidth = 2.0;
          ctx.setLineDash([6, 4]);
        } else if (link.type === 'docker') {
          strokeColor = palette.linkDocker;
          ctx.setLineDash([3, 3]);
        } else if (link.type === 'pivot') {
          strokeColor = palette.linkPivot;
          lineWidth = 2.0;
          ctx.setLineDash([8, 3, 2, 3]);
        }

        if (isSelectedLink) {
          strokeColor = palette.linkSelected;
          lineWidth = 2.2;
          ctx.setLineDash([]);
        }

        if (isDimmed) {
          strokeColor = palette.linkDimmed;
          lineWidth = 0.8;
        }

        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = lineWidth;
        ctx.stroke();

        // Link Particles
        if (settings.animateParticles && !isDimmed) {
          const dx = endX - startX;
          const dy = endY - startY;
          const len = Math.sqrt(dx * dx + dy * dy);
          const numParticles = Math.max(1, Math.floor(len / 60));

          for (let p = 0; p < numParticles; p++) {
            const progress = ((particleOffsetRef.current / 30 + p / numParticles) % 1);
            const px = startX + dx * progress;
            const py = startY + dy * progress;

            ctx.beginPath();
            ctx.arc(px, py, 2, 0, Math.PI * 2);
            ctx.fillStyle = isSelectedLink ? palette.particleSelected : palette.particleDefault;
            ctx.fill();
          }
        }

        ctx.restore();
      });

      // Draw Icon-Only Node Circles — hubs (nodes many others connect
      // through, e.g. a Docker bridge with a dozen containers hanging off
      // it) draw last so their own satellites never visually bury them.
      const linkDegree = new Map<string, number>();
      effectiveLinks.forEach((l) => {
        linkDegree.set(l.source, (linkDegree.get(l.source) ?? 0) + 1);
        linkDegree.set(l.target, (linkDegree.get(l.target) ?? 0) + 1);
      });
      const drawOrderNodes = [...physNodes].sort(
        (a, b) => (linkDegree.get(a.id) ?? 0) - (linkDegree.get(b.id) ?? 0)
      );
      drawOrderNodes.forEach((node) => {
        const isSelected = selectedNode?.id === node.id;
        const isHovered = hoverNodeRef.current?.id === node.id;
        const isSearchMatch = Boolean(searchMatchIds && searchMatchIds.has(node.id));
        const isDimmed = emphasisIds ? !emphasisIds.has(node.id) : false;
        const isUser = node.isSelf || node.deviceType === 'user';

        ctx.save();
        ctx.globalAlpha = isDimmed ? 0.15 : 1.0;

        const r = node.radius;

        // Search-match ring takes priority — bright accent, pulsing
        if (isSearchMatch) {
          const pulse = 1 + Math.sin(particleOffsetRef.current / 30 * Math.PI * 2) * 0.15;
          ctx.beginPath();
          ctx.arc(node.x, node.y, (r + 6) * pulse, 0, Math.PI * 2);
          ctx.strokeStyle = palette.searchMatch;
          ctx.lineWidth = 2.5;
          ctx.stroke();
        } else if (isUser || isSelected || isHovered) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, r + (isUser ? 7 : 5), 0, Math.PI * 2);
          ctx.strokeStyle = isUser || isSelected ? palette.nodeBorderStrong : palette.ringHover;
          ctx.lineWidth = isUser ? 2 : 1.5;
          if (isUser) ctx.setLineDash([3, 3]);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Node Circle Fill & Border
        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx.fillStyle = isUser ? palette.nodeFillUser : (isSelected ? palette.nodeFillSelected : (isHovered ? palette.nodeFillHover : palette.nodeFillDefault));
        ctx.fill();

        ctx.strokeStyle = isUser ? palette.nodeBorderStrong : (isSelected ? palette.nodeBorderStrong : palette.nodeBorderDefault);
        ctx.lineWidth = isUser || isSelected ? 2 : 1;
        ctx.stroke();

        // Icon inside Node Circle — the real Docker whale for docker
        // containers/bridges, the clean brand mark for the root user, a
        // detailed Twemoji glyph for everything else.
        if (node.deviceType === 'docker' && dockerLogoImg.complete) {
          const logoSize = r * 1.15;
          ctx.drawImage(dockerLogoImg, node.x - logoSize / 2, node.y - logoSize / 2, logoSize, logoSize);
        } else if (isUser && userIconImg.complete) {
          const iconSize = r * 0.95;
          ctx.drawImage(userIconImg, node.x - iconSize / 2, node.y - iconSize / 2, iconSize, iconSize);
        } else {
          const iconImg = deviceIconCache.get(node.deviceType);
          if (iconImg && iconImg.complete) {
            const iconSize = r;
            ctx.drawImage(iconImg, node.x - iconSize / 2, node.y - iconSize / 2, iconSize, iconSize);
          }
        }

        // Pivot-hop ring — found through a second host, not directly
        if (node.hop && node.hop > 0) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, r + 3, 0, Math.PI * 2);
          ctx.strokeStyle = palette.pivotRing;
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
          ctx.fillStyle = palette.danger;
          ctx.fill();
        }

        // Web-app indicator — a confirmed HTTP/HTTPS listener (real banner
        // or real TLS cert). Yellow, not the accent blue used for search
        // matches, so the two don't read as the same thing.
        if (node.ports?.some((p) => p.isWeb)) {
          ctx.beginPath();
          ctx.arc(node.x, node.y - r - 3, 3, 0, Math.PI * 2);
          ctx.fillStyle = palette.warning;
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
  }, [effectiveLinks, settings, updatePhysics, selectedNode, searchMatchIds, palette]);

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
      nodeDragStartRef.current = { clientX, clientY };
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
      // A click alone shouldn't pin the node — only commit to dragging (and
      // therefore pinning) once the pointer has actually moved, so simply
      // clicking a node to open its details doesn't silently lock it in place.
      const start = nodeDragStartRef.current;
      const draggedFar = start
        ? Math.hypot(clientX - start.clientX, clientY - start.clientY) > 4
        : false;
      if (draggedFar) {
        isDraggingNodeRef.current.x = worldX;
        isDraggingNodeRef.current.y = worldY;
        isDraggingNodeRef.current.vx = 0;
        isDraggingNodeRef.current.vy = 0;
        isDraggingNodeRef.current.pinned = true;
      }
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
      isDraggingNodeRef.current.vx = 0;
      isDraggingNodeRef.current.vy = 0;
      isDraggingNodeRef.current = null;
      nodeDragStartRef.current = null;
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
      case 'user': return <User size={13} className="text-foreground" />;
      case 'service': return <Lightning size={13} className="text-foreground/70" />;
      case 'laptop': return <Desktop size={13} className="text-foreground/70" />;
      case 'mobile': return <DeviceMobile size={13} className="text-foreground/70" />;
      case 'server': return <HardDrive size={13} className="text-foreground/70" />;
      case 'database': return <Database size={13} className="text-foreground/70" />;
      case 'router': return <Globe size={13} className="text-foreground/70" />;
      case 'docker': return <Cube size={13} className="text-foreground/70" />;
      case 'vpn': return <ShieldCheckered size={13} className="text-foreground/70" />;
      case 'printer': return <Printer size={13} className="text-foreground/70" />;
      case 'tv': return <Television size={13} className="text-foreground/70" />;
      case 'iot': return <Cpu size={13} className="text-foreground/70" />;
      case 'nas': return <HardDrives size={13} className="text-foreground/70" />;
      default: return <Desktop size={13} className="text-foreground/70" />;
    }
  };

  const noSearchResults = Boolean(searchMatchIds && searchMatchIds.size === 0);

  return (
    <div className="relative w-full h-full bg-background overflow-hidden flex flex-col justify-between select-none">
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        className="w-full h-full cursor-grab active:cursor-grabbing block"
      />

      {/* No-results feedback for an active search */}
      {noSearchResults && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-30 pointer-events-none bg-surface/95 border border-border backdrop-blur-md rounded-md px-3.5 py-2 shadow-lg text-xs text-muted-foreground flex items-center gap-2 animate-in fade-in duration-150">
          <MagnifyingGlass size={14} />
          No nodes match "{searchQuery}"
        </div>
      )}

      {/* MINIMAL SLEEK HOVER TOOLTIP */}
      {hoverState && (
        <div
          style={{
            left: `${hoverState.screenX}px`,
            top: `${hoverState.screenY - hoverState.node.radius - 10}px`,
            transform: 'translate(-50%, -100%)',
          }}
          className="absolute z-40 pointer-events-none bg-surface/95 border border-border backdrop-blur-md rounded-md px-3 py-1.5 shadow-lg text-xs text-foreground flex items-center gap-2.5 whitespace-nowrap animate-in fade-in zoom-in-95 duration-100 font-sans"
        >
          <span className="flex items-center justify-center">
            {renderTooltipIcon(hoverState.node.deviceType)}
          </span>

          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-foreground">{hoverState.node.label}</span>
            <span className="text-muted-foreground text-[11px] font-mono">({hoverState.node.ip})</span>
          </div>

          <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse ml-0.5" title="Online"></span>

          <div className="absolute left-1/2 -bottom-1.5 -translate-x-1/2 w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[5px] border-t-border"></div>
        </div>
      )}

      {/* Floating Zoom Controls */}
      <div className="absolute bottom-6 right-6 z-20 flex flex-col gap-1.5 bg-surface/90 border border-border p-1.5 rounded-lg shadow-lg backdrop-blur-md">
        <button
          onClick={handleZoomIn}
          className="p-2 text-foreground/70 hover:text-foreground hover:bg-surface-hover rounded-md transition-all"
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={handleZoomOut}
          className="p-2 text-foreground/70 hover:text-foreground hover:bg-surface-hover rounded-md transition-all"
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={handleResetView}
          className="p-2 text-foreground/70 hover:text-foreground hover:bg-surface-hover rounded-md transition-all"
          title="Reset Topology View"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* Clean Legend Bar */}
      <div className="absolute bottom-6 left-6 z-20 bg-surface/90 border border-border px-4 py-2.5 rounded-lg shadow-lg backdrop-blur-md flex items-center gap-5 text-xs font-sans text-muted-foreground">
        <div className="flex items-center gap-2 text-foreground font-semibold">
          <span className="w-2.5 h-2.5 rounded-full bg-success animate-pulse"></span>
          <User size={13} />
          <span>YOU (Root Workstation)</span>
        </div>
        <div className="h-3 w-px bg-border"></div>
        <div className="flex items-center gap-1.5 text-muted-foreground text-[11px]">
          <span className="w-2 h-2 rounded-full bg-warning shrink-0"></span>
          <span>Web app detected</span>
        </div>
        <div className="h-3 w-px bg-border"></div>
        <div className="flex items-center gap-3 text-muted-foreground text-[11px]">
          <span>Hover node for basic info • Click for full sidebar details</span>
        </div>
      </div>
    </div>
  );
};
