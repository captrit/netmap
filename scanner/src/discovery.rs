use crate::models::*;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::net::IpAddr;
use std::process::Command;
use std::str::FromStr;

/// Detect all active network interfaces via `ip -o addr show`.
/// Returns only IPv4 interfaces with proper type classification.
pub fn get_interfaces() -> Vec<NetInterface> {
    let output = match Command::new("ip").args(["-o", "addr", "show"]).output() {
        Ok(o) => String::from_utf8_lossy(&o.stdout).to_string(),
        Err(_) => return Vec::new(),
    };

    let mut mac_map: HashMap<String, String> = HashMap::new();
    if let Ok(link_out) = Command::new("ip").args(["-o", "link", "show"]).output() {
        let link_str = String::from_utf8_lossy(&link_out.stdout);
        for line in link_str.lines() {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if let Some(name_part) = parts.get(1) {
                let name = name_part.trim_end_matches(':');
                if let Some(pos) = parts.iter().position(|&p| p == "link/ether") {
                    if let Some(mac) = parts.get(pos + 1) {
                        mac_map.insert(name.to_string(), mac.to_lowercase().to_string());
                    }
                }
            }
        }
    }

    let mut interfaces = Vec::new();
    for line in output.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 4 {
            continue;
        }
        let iface_name = parts[1].trim_end_matches(':');
        let family = parts[2];
        let ip_cidr = parts[3];

        if family != "inet" {
            continue;
        }

        let ip = ip_cidr.split('/').next().unwrap_or("").to_string();
        if ip.is_empty() {
            continue;
        }
        let prefix_len: u8 = ip_cidr
            .split('/')
            .nth(1)
            .and_then(|p| p.parse().ok())
            .unwrap_or(32);

        let if_type = classify_interface(iface_name, &ip, prefix_len);
        let mac = mac_map.get(iface_name).cloned().unwrap_or_default();

        interfaces.push(NetInterface {
            name: iface_name.to_string(),
            ip,
            cidr: ip_cidr.to_string(),
            mac,
            is_up: true,
            if_type,
        });
    }
    interfaces
}

/// Classify interface type by name and IP heuristics.
///
/// Checked before anything name-based: a /32 (or /31) IPv4 address is
/// almost never a real LAN address — DHCP/static LAN assignment always
/// uses a broadcast-capable prefix (/24, /16, etc). A /32 is the
/// textbook signature of a point-to-point tunnel overlay address, and
/// critically, several IPsec clients (this includes plain NetworkManager
/// IPsec/strongSwan/Libreswan setups in routed mode) attach that overlay
/// address directly onto the existing physical interface — e.g. wlp3s0
/// ends up with both a normal 192.168.x.x/24 AND a 10.x.x.x/32 address —
/// instead of creating a dedicated tun/ipsec device. Name-based checks
/// alone (which only look for tun/tap/wg/ipsec/ppp *interface names*)
/// completely miss this, silently absorbing the VPN address into
/// whatever the physical interface's type is (wifi/ethernet).
fn classify_interface(name: &str, _ip: &str, prefix_len: u8) -> InterfaceType {
    if name == "lo" {
        return InterfaceType::Loopback;
    }
    if prefix_len >= 31 {
        return InterfaceType::Vpn;
    }
    // Kernel link-type check — catches tunnel adapters regardless of what
    // they're named. Interface *names* are a convention (tun0/wg0/ppp0),
    // not a guarantee: SSL-VPN clients (GlobalProtect, Fortinet, Cisco
    // AnyConnect/OpenConnect variants) and custom WireGuard configs often
    // use names that match none of our keywords below. ARPHRD_NONE (type
    // 65534) is the kernel's own marker for a point-to-point tunnel device
    // with no L2 addressing — real wifi/ethernet/bridge interfaces never
    // report this, so it's a safe, name-independent signal.
    if let Ok(t) = fs::read_to_string(format!("/sys/class/net/{}/type", name)) {
        if t.trim() == "65534" {
            return InterfaceType::Vpn;
        }
    }
    if name.starts_with("wl") || name.starts_with("wlan") {
        return InterfaceType::Wifi;
    }
    if name.starts_with("br-")
        || name.starts_with("docker")
        || name.starts_with("veth")
        || name == "docker0"
    {
        return InterfaceType::Docker;
    }
    if name.contains("tun")
        || name.contains("tap")
        || name.contains("wg")
        || name.contains("ipsec")
        || name.contains("ppp")
        || name.contains("vti")
        || name.contains("xfrm")
    {
        return InterfaceType::Vpn;
    }
    if name.starts_with("en") || name.starts_with("eth") {
        return InterfaceType::Ethernet;
    }
    InterfaceType::Unknown
}

/// What a strongSwan/Libreswan IPsec connection actually protects — read
/// straight from `/etc/ipsec.conf` (+ `/etc/ipsec.d/*.conf`), which is
/// world-readable on every distro tested (secrets live in a separate,
/// locked-down `ipsec.secrets` file, not here). This needs zero privilege
/// at all, unlike `ip xfrm policy` (CAP_NET_ADMIN, and can still fail even
/// once granted depending on the environment) — it's the primary, most
/// portable source for "what does this tunnel reach", not a fallback.
/// Returns (remote_gateway, protected_subnets) per `conn` block; an empty
/// subnet list with `rightsubnet=0.0.0.0/0` (a full-tunnel VPN — routes
/// everything, not a specific internal LAN) is reported as such, not
/// silently treated like a split-tunnel with something to sweep.
pub struct IpsecConn {
    #[allow(dead_code)]
    pub name: String,
    pub remote_gateway: Option<String>,
    pub protected_subnets: Vec<String>,
    pub is_full_tunnel: bool,
}

pub fn get_ipsec_conf_connections() -> Vec<IpsecConn> {
    let mut text = String::new();
    if let Ok(main) = fs::read_to_string("/etc/ipsec.conf") {
        text.push_str(&main);
        text.push('\n');
    }
    if let Ok(entries) = fs::read_dir("/etc/ipsec.d") {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("conf") {
                if let Ok(sub) = fs::read_to_string(&path) {
                    text.push_str(&sub);
                    text.push('\n');
                }
            }
        }
    }
    if text.is_empty() {
        return Vec::new();
    }

    let mut conns = Vec::new();
    let mut current: Option<IpsecConn> = None;

    for raw_line in text.lines() {
        let line = raw_line.split('#').next().unwrap_or("").trim_end();
        if line.trim().is_empty() {
            continue;
        }
        let indented = raw_line.starts_with(' ') || raw_line.starts_with('\t');

        if !indented {
            if let Some(c) = current.take() {
                conns.push(c);
            }
            let mut parts = line.trim().splitn(2, char::is_whitespace);
            let keyword = parts.next().unwrap_or("");
            let name = parts.next().unwrap_or("").trim();
            if keyword == "conn" && !name.is_empty() && name != "%default" {
                current = Some(IpsecConn {
                    name: name.to_string(),
                    remote_gateway: None,
                    protected_subnets: Vec::new(),
                    is_full_tunnel: false,
                });
            }
            continue;
        }

        let Some(conn) = current.as_mut() else { continue };
        let trimmed = line.trim();
        let Some((key, value)) = trimmed.split_once('=') else { continue };
        let (key, value) = (key.trim(), value.trim());

        match key {
            "right" => {
                if value != "%any" && !value.is_empty() {
                    conn.remote_gateway = Some(value.to_string());
                }
            }
            "rightsubnet" => {
                for part in value.split(',') {
                    let part = part.trim();
                    if part == "0.0.0.0/0" || part == "::/0" {
                        conn.is_full_tunnel = true;
                    } else if ipnetwork::IpNetwork::from_str(part).is_ok() {
                        conn.protected_subnets.push(part.to_string());
                    }
                }
            }
            _ => {}
        }
    }
    if let Some(c) = current.take() {
        conns.push(c);
    }

    conns
}

/// Internal subnets a policy-based IPsec tunnel actually protects, read
/// from `ip xfrm policy`. Policy-based IPsec (the most common corporate
/// setup, and what's used here) routes traffic by matching XFRM selectors
/// against specific src/dst CIDR pairs configured in the tunnel policy —
/// it does NOT add entries to the normal routing table at all, so
/// `get_routed_subnets` finds nothing for this style of VPN. This is the
/// only place that information exists. Requires CAP_NET_ADMIN (root or
/// `setcap` on the `ip` binary) — returns empty otherwise, same graceful
/// degradation as every other privilege-gated probe in this tool.
pub fn get_xfrm_policy_subnets() -> Vec<String> {
    let output = match Command::new("ip").args(["xfrm", "policy"]).output() {
        Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout).to_string(),
        _ => return Vec::new(),
    };

    let mut subnets = Vec::new();
    let mut pending_dst: Option<String> = None;

    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("src ") && trimmed.contains(" dst ") {
            pending_dst = trimmed
                .split_whitespace()
                .skip_while(|&t| t != "dst")
                .nth(1)
                .map(|s| s.to_string());
        } else if trimmed.starts_with("dir out") {
            if let Some(dst) = pending_dst.take() {
                if dst != "0.0.0.0/0" && !subnets.contains(&dst) {
                    subnets.push(dst);
                }
            }
        }
    }
    subnets
}

/// Non-default routes on a specific device — used to find VPN-pushed
/// internal subnets. Policy-based VPNs (this covers most IPsec setups)
/// don't hand out a broad local subnet on the tunnel; they instead push
/// specific routes for the internal ranges reachable through it. The /32
/// overlay address itself reveals nothing about what's behind the tunnel —
/// this does.
pub fn get_routed_subnets(dev_name: &str) -> Vec<String> {
    let output = match Command::new("ip")
        .args(["route", "show", "dev", dev_name])
        .output()
    {
        Ok(o) => String::from_utf8_lossy(&o.stdout).to_string(),
        Err(_) => return Vec::new(),
    };

    let mut subnets = Vec::new();
    for line in output.lines() {
        let dest = line.split_whitespace().next().unwrap_or("");
        if dest.is_empty() || dest == "default" || dest.starts_with("169.254") {
            continue;
        }
        if dest.contains('/') && ipnetwork::Ipv4Network::from_str(dest).is_ok() {
            subnets.push(dest.to_string());
        }
    }
    subnets
}

/// Get default gateway IP from /proc/net/route.
pub fn get_default_gateway() -> Option<String> {
    let contents = fs::read_to_string("/proc/net/route").ok()?;
    for line in contents.lines().skip(1) {
        let fields: Vec<&str> = line.split('\t').collect();
        if fields.len() >= 3 && fields[1] == "00000000" {
            // Gateway is in hex, little-endian
            let hex = fields[2];
            if let Ok(val) = u32::from_str_radix(hex, 16) {
                let bytes = val.to_le_bytes();
                let gw = format!("{}.{}.{}.{}", bytes[0], bytes[1], bytes[2], bytes[3]);
                return Some(gw);
            }
        }
    }
    None
}

/// Get ARP/neighbor table entries — a real discovery source (not just MAC
/// enrichment), gated on kernel-reported freshness so it doesn't reintroduce
/// phantom hosts. `ip neighbor show` carries a state field (REACHABLE,
/// STALE, DELAY, PROBE, PERMANENT vs FAILED/INCOMPLETE) — only non-failed
/// states are trusted. `/proc/net/arp` (no state field, only a "complete"
/// flag) is used only to fill in anything `ip neighbor` didn't report.
pub fn get_arp_table() -> HashMap<String, String> {
    let mut result: HashMap<String, String> = HashMap::new();
    let mut seen: HashSet<String> = HashSet::new();

    if let Ok(output) = Command::new("ip").args(["neighbor", "show"]).output() {
        let out = String::from_utf8_lossy(&output.stdout);
        for line in out.lines() {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.is_empty() {
                continue;
            }
            let ip = parts[0];
            let state = parts.last().copied().unwrap_or("");
            if state == "FAILED" || state == "INCOMPLETE" {
                continue;
            }
            // This tool is IPv4-only end to end (CIDR sweep math, self-IP
            // detection, etc). `ip neighbor show` lists IPv6 neighbors too —
            // e.g. a gateway's fe80::/2405: addresses share its MAC and
            // would otherwise show up as extra phantom nodes for the same
            // physical device.
            if !ip.contains('.') {
                continue;
            }
            if let Some(pos) = parts.iter().position(|&p| p == "lladdr") {
                if let Some(mac) = parts.get(pos + 1) {
                    let mac_lower = mac.to_lowercase();
                    if mac_lower != "00:00:00:00:00:00" && IpAddr::from_str(ip).is_ok() {
                        result.insert(ip.to_string(), mac_lower);
                        seen.insert(ip.to_string());
                    }
                }
            }
        }
    }

    if let Ok(contents) = fs::read_to_string("/proc/net/arp") {
        for line in contents.lines().skip(1) {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 4 {
                let ip = parts[0];
                let flags = parts[2];
                let mac = parts[3].to_lowercase();
                if seen.contains(ip) {
                    continue;
                }
                if flags == "0x2" && mac != "00:00:00:00:00:00" && IpAddr::from_str(ip).is_ok() {
                    result.insert(ip.to_string(), mac);
                }
            }
        }
    }

    result
}

/// Check if an interface is currently active and has carrier.
pub fn interface_has_carrier(name: &str) -> bool {
    fs::read_to_string(format!("/sys/class/net/{}/carrier", name))
        .map(|s| s.trim() == "1")
        .unwrap_or(false)
}

/// Enumerate running Docker containers via socket API or fallback to `docker ps`.
#[allow(dead_code)]
pub fn get_docker_containers() -> Vec<(String, String, String)> {
    // Try `docker ps` first (simpler, no socket dependency)
    let output = match Command::new("docker")
        .args(["ps", "--format", "{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Ports}}"])
        .output()
    {
        Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout).to_string(),
        _ => return Vec::new(),
    };

    let mut containers = Vec::new();
    for line in output.lines() {
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() >= 3 {
            containers.push((
                parts[0].to_string(), // container ID
                parts[1].to_string(), // name
                parts[2].to_string(), // image
            ));
        }
    }
    containers
}

/// Get Docker container IPs by inspecting their networks.
pub fn get_docker_network_info() -> HashMap<String, (String, String)> {
    let mut result = HashMap::new();
    let output = match Command::new("docker")
        .args([
            "ps",
            "-q",
        ])
        .output()
    {
        Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout).to_string(),
        _ => return result,
    };

    for container_id in output.lines() {
        let id = container_id.trim();
        if id.is_empty() {
            continue;
        }
        if let Ok(inspect) = Command::new("docker")
            .args([
                "inspect",
                "--format",
                "{{.Name}}\t{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}",
                id,
            ])
            .output()
        {
            let info = String::from_utf8_lossy(&inspect.stdout);
            let parts: Vec<&str> = info.trim().split('\t').collect();
            if parts.len() >= 2 && !parts[1].is_empty() {
                let name = parts[0].trim_start_matches('/').to_string();
                let ip = parts[1].to_string();
                result.insert(ip.clone(), (id.to_string(), name));
            }
        }
    }
    result
}
