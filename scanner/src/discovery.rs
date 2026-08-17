use crate::models::*;
use std::collections::HashMap;
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

        let if_type = classify_interface(iface_name, &ip);
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
fn classify_interface(name: &str, ip: &str) -> InterfaceType {
    if name == "lo" {
        return InterfaceType::Loopback;
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
    {
        return InterfaceType::Vpn;
    }
    // Check known VPN IP ranges as fallback
    if ip.starts_with("10.") {
        // Could be VPN — check if interface looks virtual
        if let Ok(flags) = fs::read_to_string(format!("/sys/class/net/{}/type", name)) {
            let type_id: u32 = flags.trim().parse().unwrap_or(0);
            // type 65534 = None (virtual), 772 = loopback, 1 = ethernet
            if type_id == 65534 || type_id == 768 {
                return InterfaceType::Vpn;
            }
        }
    }
    if name.starts_with("en") || name.starts_with("eth") {
        return InterfaceType::Ethernet;
    }
    InterfaceType::Unknown
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

/// Get ARP table entries from /proc/net/arp and `ip neighbor`.
pub fn get_arp_table() -> HashMap<String, String> {
    let mut result: HashMap<String, String> = HashMap::new();

    // Parse /proc/net/arp
    if let Ok(contents) = fs::read_to_string("/proc/net/arp") {
        for line in contents.lines().skip(1) {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 4 {
                let ip = parts[0];
                let mac = parts[3].to_lowercase();
                if mac != "00:00:00:00:00:00" && IpAddr::from_str(ip).is_ok() {
                    result.insert(ip.to_string(), mac);
                }
            }
        }
    }

    // Supplement with `ip neighbor`
    if let Ok(output) = Command::new("ip").args(["neighbor", "show"]).output() {
        let out = String::from_utf8_lossy(&output.stdout);
        for line in out.lines() {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if let Some(pos) = parts.iter().position(|&p| p == "lladdr") {
                if let (Some(ip), Some(mac)) = (parts.first(), parts.get(pos + 1)) {
                    let mac_lower = mac.to_lowercase();
                    if mac_lower != "00:00:00:00:00:00" {
                        result.insert(ip.to_string(), mac_lower);
                    }
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
