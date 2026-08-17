use crate::models::*;
use dns_lookup::lookup_addr;
use std::collections::{HashMap, HashSet};
use std::env;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Instant;

mod discovery;
mod models;
mod oui;
mod probes;

#[derive(Debug, Clone)]
#[allow(dead_code)]
struct Args {
    subnet: Option<String>,
    interface: Option<String>,
    scan_docker: bool,
    scan_vpn: bool,
    os_detect: bool,
    banners: bool,
    format: String,
    stream: bool,
    timeout_ms: u64,
}

impl Args {
    fn parse_args() -> Self {
        let args_vec: Vec<String> = env::args().collect();
        let mut subnet = None;
        let mut interface = None;
        let mut scan_docker = true;
        let mut scan_vpn = true;
        let mut os_detect = true;
        let mut banners = true;
        let mut format = "json".to_string();
        let mut stream = false;
        let mut timeout_ms = 300;

        let mut i = 1;
        while i < args_vec.len() {
            match args_vec[i].as_str() {
                "-s" | "--subnet" => {
                    if i + 1 < args_vec.len() {
                        subnet = Some(args_vec[i + 1].clone());
                        i += 1;
                    }
                }
                "-i" | "--interface" => {
                    if i + 1 < args_vec.len() {
                        interface = Some(args_vec[i + 1].clone());
                        i += 1;
                    }
                }
                "-f" | "--format" => {
                    if i + 1 < args_vec.len() {
                        format = args_vec[i + 1].clone();
                        i += 1;
                    }
                }
                "--stream" => {
                    stream = true;
                }
                "--no-docker" => {
                    scan_docker = false;
                }
                "--no-vpn" => {
                    scan_vpn = false;
                }
                "--no-os" => {
                    os_detect = false;
                }
                "--no-banners" => {
                    banners = false;
                }
                "--timeout" => {
                    if i + 1 < args_vec.len() {
                        if let Ok(t) = args_vec[i + 1].parse() {
                            timeout_ms = t;
                        }
                        i += 1;
                    }
                }
                _ => {}
            }
            i += 1;
        }

        Self {
            subnet,
            interface,
            scan_docker,
            scan_vpn,
            os_detect,
            banners,
            format,
            stream,
            timeout_ms,
        }
    }
}

fn emit_event<T: serde::Serialize>(event_type: &str, data: &T) {
    let payload = serde_json::json!({
        "event": event_type,
        "data": data,
    });
    println!("{}", serde_json::to_string(&payload).unwrap_or_default());
}

#[tokio::main]
async fn main() {
    let args = Args::parse_args();
    let start = Instant::now();

    let running = Arc::new(AtomicBool::new(true));
    let r = running.clone();
    let _ = ctrlc_handler(r);

    let oui_db = oui::OuiDatabase::load();
    let interfaces = discovery::get_interfaces();

    let selected_iface = if let Some(ref name) = args.interface {
        interfaces.iter().find(|i| i.name == *name)
    } else {
        interfaces.iter().find(|i| i.if_type != InterfaceType::Loopback)
    };

    let self_iface = match selected_iface {
        Some(i) => i,
        None => {
            eprintln!("[error] No active network interface found.");
            std::process::exit(1);
        }
    };

    let self_ip = self_iface.ip.clone();
    let self_mac = self_iface.mac.clone();
    let self_iface_name = self_iface.name.clone();
    let self_iface_type = self_iface.if_type.as_str().to_string();

    let mut subnets_scanned = Vec::new();
    let mut all_hosts: HashMap<String, DiscoveredHost> = HashMap::new();
    let arp_table = discovery::get_arp_table();

    // Phase 1: Subnet auto-discovery
    let target_subnets: Vec<String> = if let Some(ref s) = args.subnet {
        vec![s.clone()]
    } else {
        let mut subs = Vec::new();
        for iface in &interfaces {
            if iface.if_type != InterfaceType::Loopback && !iface.cidr.is_empty() {
                subs.push(iface.cidr.clone());
            }
        }
        if subs.is_empty() {
            vec![self_iface.cidr.clone()]
        } else {
            subs
        }
    };

    // Phase 2: L2 ARP + ICMP Ping Sweep Discovery
    for subnet in &target_subnets {
        if !subnets_scanned.contains(subnet) {
            subnets_scanned.push(subnet.clone());
        }

        let arp_hosts = probes::arp_scan_subnet(subnet);
        for h in arp_hosts {
            all_hosts.insert(h.ip.clone(), h);
        }

        let ping_hosts = probes::nmap_ping_sweep(subnet);
        for h in ping_hosts {
            all_hosts.entry(h.ip.clone()).or_insert(h);
        }
    }

    for (ip, mac) in &arp_table {
        if !all_hosts.contains_key(ip) && ip != &self_ip {
            all_hosts.insert(
                ip.clone(),
                DiscoveredHost {
                    ip: ip.clone(),
                    mac: Some(mac.clone()),
                    latency_ms: 1.0,
                    ttl: None,
                    hostname: None,
                },
            );
        }
    }

    // Phase 2.5: VPN Subnet Scanning
    let vpn_ifaces: Vec<&NetInterface> = interfaces
        .iter()
        .filter(|i| i.if_type == InterfaceType::Vpn)
        .collect();

    let mut active_vpn_nodes: Vec<(String, String)> = Vec::new();

    if args.scan_vpn && !vpn_ifaces.is_empty() {
        for vpn_if in &vpn_ifaces {
            let is_active = discovery::interface_has_carrier(&vpn_if.name) || vpn_if.ip != "0.0.0.0";
            if !is_active {
                continue;
            }

            active_vpn_nodes.push((vpn_if.ip.clone(), vpn_if.name.clone()));
            if !subnets_scanned.contains(&vpn_if.cidr) {
                subnets_scanned.push(vpn_if.cidr.clone());

                if vpn_if.cidr.contains('/') && !vpn_if.cidr.starts_with("0.0.0.0") {
                    let vpn_ping_hosts = probes::nmap_ping_sweep(&vpn_if.cidr);
                    for host in vpn_ping_hosts {
                        if host.ip != vpn_if.ip {
                            all_hosts.entry(host.ip.clone()).or_insert(host);
                        }
                    }
                }
            }
        }
    }

    all_hosts.remove(&self_ip);
    let gateway_ip = discovery::get_default_gateway();

    // Phase 3: Active Hostname Resolution (Reverse DNS + mDNS + NetBIOS)
    for host in all_hosts.values_mut() {
        if let Ok(ip_addr) = host.ip.parse() {
            if let Ok(entry) = lookup_addr(&ip_addr) {
                if entry != host.ip {
                    host.hostname = Some(entry);
                }
            }
        }
        if host.hostname.is_none() {
            if let Some(mdns_name) = probes::query_mdns_hostname(&host.ip) {
                host.hostname = Some(mdns_name);
            }
        }
        if host.hostname.is_none() {
            if let Some(nbt_name) = probes::query_netbios_name(&host.ip) {
                host.hostname = Some(nbt_name);
            }
        }
    }

    let mut nodes: Vec<NetworkNode> = Vec::new();
    let mut links: Vec<NetworkLink> = Vec::new();

    // Build Self Node
    let self_ports = probes::scan_ports(&self_ip, args.timeout_ms).await;
    let mut self_port_entries: Vec<OpenPort> = Vec::new();
    for (port, _lat) in &self_ports {
        let svc = probes::port_to_service(*port);
        let banner = if args.banners {
            probes::grab_banner(&self_ip, *port).await
        } else {
            None
        };
        let version = banner.as_ref().and_then(|b| extract_version(b));
        self_port_entries.push(OpenPort {
            port: *port,
            service: svc.to_string(),
            protocol: "TCP".to_string(),
            state: "open".to_string(),
            banner,
            version,
        });
    }

    let self_vendor = oui_db
        .lookup(&self_mac)
        .unwrap_or_else(|| "Local Workstation".to_string());

    let self_node = NetworkNode {
        id: self_ip.clone(),
        label: format!("YOU ({})", self_iface_name),
        ip: self_ip.clone(),
        mac: Some(self_mac.clone()),
        category: "localhost".to_string(),
        device_type: "user".to_string(),
        is_self: true,
        vendor: Some(self_vendor),
        latency_ms: 0.1,
        status: "online".to_string(),
        ports: self_port_entries,
        interface: Some(self_iface_name.clone()),
        os: Some(get_local_os()),
        last_seen: chrono_now(),
        ttl: None,
        hostname: Some(get_hostname()),
        confidence: Some(100),
    };

    if args.stream {
        emit_event("node", &self_node);
    }
    nodes.push(self_node);

    // Build Gateway Node
    let gw_node_id = if let Some(ref gw_ip) = gateway_ip {
        let gw_ports = probes::scan_ports(gw_ip, args.timeout_ms).await;
        let gw_mac = arp_table.get(gw_ip).cloned();
        let gw_vendor = gw_mac
            .as_ref()
            .and_then(|m| oui_db.lookup(m))
            .unwrap_or_else(|| "Network Gateway Router".to_string());
        let (gw_latency, gw_ttl) = probes::ping_host_info(gw_ip);
        let gw_hostname = all_hosts.get(gw_ip).and_then(|h| h.hostname.clone());

        let mut gw_port_entries = Vec::new();
        for (port, _lat) in &gw_ports {
            let svc = probes::port_to_service(*port);
            gw_port_entries.push(OpenPort {
                port: *port,
                service: svc.to_string(),
                protocol: "TCP".to_string(),
                state: "open".to_string(),
                banner: None,
                version: None,
            });
        }

        let gw_node = NetworkNode {
            id: gw_ip.clone(),
            label: gw_hostname
                .clone()
                .unwrap_or_else(|| format!("Gateway Router ({})", gw_ip)),
            ip: gw_ip.clone(),
            mac: gw_mac.clone(),
            category: "gateway".to_string(),
            device_type: "router".to_string(),
            is_self: false,
            vendor: Some(gw_vendor),
            latency_ms: if gw_latency > 0.0 { gw_latency } else { 1.0 },
            status: "online".to_string(),
            ports: gw_port_entries,
            interface: Some(self_iface_name.clone()),
            os: Some("Gateway Router / Firewall".to_string()),
            last_seen: chrono_now(),
            ttl: gw_ttl,
            hostname: gw_hostname,
            confidence: Some(95),
        };

        let gw_link = NetworkLink {
            source: self_ip.clone(),
            target: gw_ip.clone(),
            link_type: self_iface_type.clone(),
            latency_ms: Some(if gw_latency > 0.0 { gw_latency } else { 1.0 }),
            label: Some(format!("{} Uplink", self_iface_type.to_uppercase())),
        };

        if args.stream {
            emit_event("node", &gw_node);
            emit_event("link", &gw_link);
        }
        nodes.push(gw_node);
        links.push(gw_link);

        all_hosts.remove(gw_ip);
        gw_ip.clone()
    } else {
        self_ip.clone()
    };

    // Build Active VPN Tunnel Nodes
    for (vpn_ip, vpn_if_name) in &active_vpn_nodes {
        let vpn_node = NetworkNode {
            id: vpn_ip.clone(),
            label: format!("VPN Tunnel ({})", vpn_if_name),
            ip: vpn_ip.clone(),
            mac: Some("virtual".to_string()),
            category: "vpn".to_string(),
            device_type: "vpn".to_string(),
            is_self: false,
            vendor: Some(format!("VPN Tunnel ({})", vpn_if_name)),
            latency_ms: 1.0,
            status: "online".to_string(),
            ports: Vec::new(),
            interface: Some(vpn_if_name.clone()),
            os: Some("VPN Encrypted Interface".to_string()),
            last_seen: chrono_now(),
            ttl: None,
            hostname: None,
            confidence: Some(100),
        };

        let vpn_link = NetworkLink {
            source: self_ip.clone(),
            target: vpn_ip.clone(),
            link_type: "vpn".to_string(),
            latency_ms: Some(1.0),
            label: Some(format!("{} Encrypted Tunnel", vpn_if_name)),
        };

        if args.stream {
            emit_event("node", &vpn_node);
            emit_event("link", &vpn_link);
        }
        nodes.push(vpn_node);
        links.push(vpn_link);
    }

    // Phase 4: Scan Discovered Hosts
    let host_ips: Vec<String> = all_hosts.keys().cloned().collect();
    for (idx, host_ip) in host_ips.iter().enumerate() {
        if host_ip.starts_with("127.") {
            continue;
        }

        let host = all_hosts.get(host_ip).unwrap().clone();
        let open_ports = probes::scan_ports(host_ip, args.timeout_ms).await;
        let (ping_lat, ping_ttl) = probes::ping_host_info(host_ip);

        let latency = if ping_lat > 0.0 {
            ping_lat
        } else if host.latency_ms > 0.0 {
            host.latency_ms
        } else {
            probes::measure_latency(host_ip).await
        };

        let effective_ttl = ping_ttl.or(host.ttl);

        let mut port_entries = Vec::new();
        let mut first_banner: Option<String> = None;
        let mut has_https = false;

        for (port, _lat) in &open_ports {
            if *port == 443 || *port == 8443 {
                has_https = true;
            }
            let svc = probes::port_to_service(*port);
            let banner = if args.banners && open_ports.len() <= 30 {
                probes::grab_banner(host_ip, *port).await
            } else {
                None
            };
            if first_banner.is_none() && banner.is_some() {
                first_banner = banner.clone();
            }
            let version = banner.as_ref().and_then(|b| extract_version(b));
            port_entries.push(OpenPort {
                port: *port,
                service: svc.to_string(),
                protocol: "TCP".to_string(),
                state: "open".to_string(),
                banner,
                version,
            });
        }

        let mut ssl_cn: Option<String> = None;
        if has_https {
            ssl_cn = probes::get_ssl_cert_cn(host_ip);
        }

        let mac_vendor = host.mac.as_ref().and_then(|m| oui_db.lookup(m));
        let os_guess = if args.os_detect {
            probes::nmap_os_detect(host_ip, effective_ttl, first_banner.as_deref())
        } else {
            effective_ttl.map(|t| probes::guess_os_from_ttl(t).to_string()).unwrap_or_else(|| "Linux/Embedded Device".to_string())
        };

        let device_type = guess_device_type(&port_entries, mac_vendor.as_deref(), Some(&os_guess), ssl_cn.as_deref(), host.hostname.as_deref());

        let label = host.hostname.clone()
            .or(ssl_cn.clone())
            .unwrap_or_else(|| {
                mac_vendor
                    .as_ref()
                    .map(|v| format!("{} ({})", v, host_ip))
                    .unwrap_or_else(|| host_ip.clone())
            });

        let is_vpn_host = active_vpn_nodes.iter().any(|(vpn_ip, _)| {
            let vpn_prefix = vpn_ip.split('.').take(3).collect::<Vec<_>>().join(".");
            host_ip.starts_with(&vpn_prefix)
        });

        let category = if is_vpn_host { "vpn" } else { "host" };

        let node = NetworkNode {
            id: host_ip.clone(),
            label,
            ip: host_ip.clone(),
            mac: host.mac.clone(),
            category: category.to_string(),
            device_type: if is_vpn_host { "service".to_string() } else { device_type },
            is_self: false,
            vendor: mac_vendor,
            latency_ms: (latency * 100.0).round() / 100.0,
            status: "online".to_string(),
            ports: port_entries,
            interface: Some(self_iface_name.clone()),
            os: Some(os_guess),
            last_seen: chrono_now(),
            ttl: effective_ttl,
            hostname: host.hostname.clone().or(ssl_cn),
            confidence: Some(if host.mac.is_some() { 90 } else { 75 }),
        };

        let link_target = if is_vpn_host && !active_vpn_nodes.is_empty() {
            active_vpn_nodes[0].0.clone()
        } else {
            gw_node_id.clone()
        };

        let link = NetworkLink {
            source: link_target,
            target: host_ip.clone(),
            link_type: if is_vpn_host { "vpn".to_string() } else { self_iface_type.clone() },
            latency_ms: Some((latency * 100.0).round() / 100.0),
            label: Some(if is_vpn_host { "VPN Route".to_string() } else { self_iface_type.to_uppercase() }),
        };

        if args.stream {
            emit_event("node", &node);
            emit_event("link", &link);
            emit_event(
                "progress",
                &serde_json::json!({
                    "current": idx + 1,
                    "total": host_ips.len(),
                    "scanned_ip": host_ip
                }),
            );
        }
        nodes.push(node);
        links.push(link);
    }

    // Phase 5: Docker Container Discovery
    let has_docker = interfaces.iter().any(|i| i.if_type == InterfaceType::Docker);
    if has_docker {
        let docker_nets = discovery::get_docker_network_info();
        if !docker_nets.is_empty() {
            let docker_iface = interfaces.iter().find(|i| i.if_type == InterfaceType::Docker);
            if let Some(docker_if) = docker_iface {
                let bridge_ip = docker_if.ip.clone();
                let bridge_node = NetworkNode {
                    id: bridge_ip.clone(),
                    label: format!("Docker Bridge ({})", docker_if.name),
                    ip: bridge_ip.clone(),
                    mac: Some(docker_if.mac.clone()),
                    category: "docker".to_string(),
                    device_type: "docker".to_string(),
                    is_self: false,
                    vendor: Some("Docker Network Bridge".to_string()),
                    latency_ms: 0.1,
                    status: "online".to_string(),
                    ports: Vec::new(),
                    interface: Some(docker_if.name.clone()),
                    os: Some(format!("Docker Subnet {}", docker_if.cidr)),
                    last_seen: chrono_now(),
                    ttl: None,
                    hostname: None,
                    confidence: Some(100),
                };

                let bridge_link = NetworkLink {
                    source: self_ip.clone(),
                    target: bridge_ip.clone(),
                    link_type: "docker".to_string(),
                    latency_ms: Some(0.1),
                    label: Some("veth Bridge".to_string()),
                };

                if args.stream {
                    emit_event("node", &bridge_node);
                    emit_event("link", &bridge_link);
                }
                nodes.push(bridge_node);
                links.push(bridge_link);

                subnets_scanned.push(docker_if.cidr.clone());

                for (container_ip, (_id, name)) in &docker_nets {
                    let container_ports = probes::scan_ports(container_ip, 200).await;
                    let mut port_entries = Vec::new();
                    for (port, _lat) in &container_ports {
                        let svc = probes::port_to_service(*port);
                        port_entries.push(OpenPort {
                            port: *port,
                            service: svc.to_string(),
                            protocol: "TCP".to_string(),
                            state: "open".to_string(),
                            banner: None,
                            version: None,
                        });
                    }

                    let c_node = NetworkNode {
                        id: container_ip.clone(),
                        label: format!("Docker: {}", name),
                        ip: container_ip.clone(),
                        mac: None,
                        category: "docker".to_string(),
                        device_type: "docker".to_string(),
                        is_self: false,
                        vendor: Some("Docker Container".to_string()),
                        latency_ms: 0.1,
                        status: "online".to_string(),
                        ports: port_entries,
                        interface: Some(docker_if.name.clone()),
                        os: Some("Containerized Linux".to_string()),
                        last_seen: chrono_now(),
                        ttl: None,
                        hostname: Some(name.clone()),
                        confidence: Some(100),
                    };

                    let c_link = NetworkLink {
                        source: bridge_ip.clone(),
                        target: container_ip.clone(),
                        link_type: "docker".to_string(),
                        latency_ms: Some(0.1),
                        label: Some("Container veth".to_string()),
                    };

                    if args.stream {
                        emit_event("node", &c_node);
                        emit_event("link", &c_link);
                    }
                    nodes.push(c_node);
                    links.push(c_link);
                }
            }
        }
    }

    // Save final scan result
    let duration_ms = start.elapsed().as_secs_f64() * 1000.0;
    let total_hosts = nodes.len();
    let online_hosts = nodes.iter().filter(|n| n.status == "online").count();
    let gateways_count = nodes.iter().filter(|n| n.category == "gateway").count();
    let docker_count = nodes.iter().filter(|n| n.category == "docker").count();
    let vpn_count = nodes.iter().filter(|n| n.category == "vpn").count();
    let total_ports: usize = nodes.iter().map(|n| n.ports.len()).sum();
    let avg_latency = if total_hosts > 0 {
        (nodes.iter().map(|n| n.latency_ms).sum::<f64>() / total_hosts as f64 * 100.0).round()
            / 100.0
    } else {
        0.0
    };

    let result = ScanResult {
        summary: ScanSummary {
            total_hosts,
            online_hosts,
            gateways_count,
            docker_count,
            vpn_count,
            avg_latency_ms: avg_latency,
            open_ports_count: total_ports,
            subnets_scanned,
            scan_duration_ms: (duration_ms * 100.0).round() / 100.0,
            timestamp: chrono_now(),
        },
        nodes,
        links,
    };

    if args.stream {
        emit_event("complete", &result);
    } else if args.format == "pretty" {
        println!("{}", serde_json::to_string_pretty(&result).unwrap());
    } else {
        println!("{}", serde_json::to_string(&result).unwrap());
    }
}

fn ctrlc_handler(running: Arc<AtomicBool>) -> Result<(), ()> {
    ctrlc::set_handler(move || {
        running.store(false, Ordering::SeqCst);
    })
    .map_err(|_| ())
}

fn guess_device_type(
    ports: &[OpenPort],
    vendor: Option<&str>,
    os: Option<&str>,
    ssl_cn: Option<&str>,
    hostname: Option<&str>,
) -> String {
    let port_nums: HashSet<u16> = ports.iter().map(|p| p.port).collect();

    if let Some(h) = hostname {
        let hl = h.to_lowercase();
        if hl.contains("apple") || hl.contains("iphone") || hl.contains("ipad") || hl.contains("android") || hl.contains("galaxy") || hl.contains("pixel") {
            return "mobile".to_string();
        }
        if hl.contains("tv") || hl.contains("chromecast") || hl.contains("roku") || hl.contains("firestick") {
            return "mobile".to_string();
        }
        if hl.contains("router") || hl.contains("gateway") || hl.contains("ap-") || hl.contains("modem") {
            return "router".to_string();
        }
        if hl.contains("print") || hl.contains("laserjet") {
            return "server".to_string();
        }
    }

    if let Some(cn) = ssl_cn {
        let cnl = cn.to_lowercase();
        if cnl.contains("tplink") || cnl.contains("asus") || cnl.contains("netgear") || cnl.contains("router") {
            return "router".to_string();
        }
        if cnl.contains("plex") || cnl.contains("synology") || cnl.contains("qnap") {
            return "server".to_string();
        }
    }

    if let Some(v) = vendor {
        let vl = v.to_lowercase();
        if vl.contains("apple")
            || vl.contains("samsung")
            || vl.contains("huawei")
            || vl.contains("xiaomi")
            || vl.contains("oneplus")
            || vl.contains("oppo")
            || vl.contains("realme")
            || vl.contains("vivo")
        {
            if port_nums.contains(&62078) || port_nums.is_empty() {
                return "mobile".to_string();
            }
        }
        if vl.contains("cisco")
            || vl.contains("juniper")
            || vl.contains("mikrotik")
            || vl.contains("ubiquiti")
            || vl.contains("tp-link")
            || vl.contains("netgear")
            || vl.contains("d-link")
            || vl.contains("tenda")
        {
            return "router".to_string();
        }
        if vl.contains("vmware") || vl.contains("virtualbox") || vl.contains("hyper-v") {
            return "server".to_string();
        }
        if vl.contains("docker") {
            return "docker".to_string();
        }
    }

    if port_nums.contains(&3306)
        || port_nums.contains(&5432)
        || port_nums.contains(&27017)
        || port_nums.contains(&6379)
        || port_nums.contains(&9042)
    {
        return "database".to_string();
    }
    if port_nums.contains(&22) && (port_nums.contains(&80) || port_nums.contains(&443)) {
        return "server".to_string();
    }
    if port_nums.contains(&3389) || port_nums.contains(&548) || port_nums.contains(&5900) {
        return "laptop".to_string();
    }

    if let Some(o) = os {
        let ol = o.to_lowercase();
        if ol.contains("windows") {
            return "laptop".to_string();
        }
        if ol.contains("android") || ol.contains("ios") {
            return "mobile".to_string();
        }
    }

    if ports.is_empty() {
        "laptop".to_string()
    } else {
        "server".to_string()
    }
}

fn extract_version(banner: &str) -> Option<String> {
    if banner.starts_with("SSH-") {
        return Some(banner.split_whitespace().next().unwrap_or(banner).to_string());
    }
    if banner.contains("Server:") {
        for line in banner.lines() {
            if line.trim().starts_with("Server:") {
                return Some(line.trim().trim_start_matches("Server:").trim().to_string());
            }
        }
    }
    if banner.starts_with("HTTP/") {
        return Some(banner.lines().next().unwrap_or(banner).to_string());
    }
    None
}

fn chrono_now() -> String {
    let output = std::process::Command::new("date")
        .args(["+%Y-%m-%d %H:%M:%S"])
        .output();
    match output {
        Ok(o) => String::from_utf8_lossy(&o.stdout).trim().to_string(),
        Err(_) => "unknown".to_string(),
    }
}

fn get_hostname() -> String {
    std::fs::read_to_string("/etc/hostname")
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|_| "localhost".to_string())
}

fn get_local_os() -> String {
    if let Ok(contents) = std::fs::read_to_string("/etc/os-release") {
        for line in contents.lines() {
            if line.starts_with("PRETTY_NAME=") {
                return line
                    .trim_start_matches("PRETTY_NAME=")
                    .trim_matches('"')
                    .to_string();
            }
        }
    }
    "Linux".to_string()
}
