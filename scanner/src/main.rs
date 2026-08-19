use crate::models::*;
use dns_lookup::lookup_addr;
use std::collections::{HashMap, HashSet};
use std::env;
use std::net::IpAddr;
use std::str::FromStr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Instant;

mod discovery;
mod models;
mod oui;
mod pivot;
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
    /// `user@host[:port]` for an already-authorized second host to pivot
    /// through (active segmentation testing). Requires SSH key/agent auth
    /// already working — never prompts for or stores a password.
    pivot: Option<String>,
    pivot_key: Option<String>,
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
        let mut pivot = None;
        let mut pivot_key = None;

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
                "--pivot" => {
                    if i + 1 < args_vec.len() {
                        pivot = Some(args_vec[i + 1].clone());
                        i += 1;
                    }
                }
                "--pivot-key" => {
                    if i + 1 < args_vec.len() {
                        pivot_key = Some(args_vec[i + 1].clone());
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
            pivot,
            pivot_key,
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

    let mut scan_warnings: Vec<String> = Vec::new();
    if !is_root() {
        scan_warnings.push(
            "Running without root/CAP_NET_RAW — arp-scan and nmap ARP/OS detection are degraded, \
             so fewer devices and less accurate OS/vendor data may be found. Run with sudo, or \
             `sudo setcap cap_net_raw,cap_net_admin+eip` on this binary + arp-scan + nmap, for full accuracy."
                .to_string(),
        );
    }
    if args.stream && !scan_warnings.is_empty() {
        emit_event("warning", &scan_warnings);
    }

    let running = Arc::new(AtomicBool::new(true));
    let r = running.clone();
    let _ = ctrlc_handler(r);

    let oui_db = oui::OuiDatabase::load();
    let interfaces = discovery::get_interfaces();

    // All Docker bridge subnets (docker0 + any per-project `br-*` compose
    // networks) — used to keep the global kernel ARP/neighbor table from
    // leaking container IPs back in as duplicate generic "host" nodes.
    // Container discovery is exclusively Phase 5's job (docker inspect).
    let docker_cidrs: Vec<ipnetwork::IpNetwork> = interfaces
        .iter()
        .filter(|i| i.if_type == InterfaceType::Docker)
        .filter_map(|i| ipnetwork::IpNetwork::from_str(&i.cidr).ok())
        .collect();

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

    // Phase 1: Subnet auto-discovery.
    // "auto" is the sentinel the frontend/backend always send by default —
    // it must be treated the same as no subnet at all (real interface-based
    // detection below), not as a literal CIDR to scan. Without this check,
    // every default scan silently tried to sweep a target literally named
    // "auto", which fails to parse and contributes zero hosts — the entire
    // active discovery path (arp-scan/nmap/ping sweep) was a no-op on every
    // default scan; only the passive ARP-cache fallback was ever finding
    // anything.
    let explicit_subnet = args
        .subnet
        .as_ref()
        .filter(|s| !s.eq_ignore_ascii_case("auto") && !s.is_empty());

    let target_subnets: Vec<String> = if let Some(s) = explicit_subnet {
        vec![s.clone()]
    } else {
        let mut subs = Vec::new();
        for iface in &interfaces {
            // Docker bridge subnets are handled exclusively by Phase 5 (docker inspect).
            // Sweeping them here too creates a second node per container with the same
            // IP/id, which is the "floating duplicate node" bug in the graph.
            if iface.if_type != InterfaceType::Loopback
                && iface.if_type != InterfaceType::Docker
                && !iface.cidr.is_empty()
            {
                subs.push(iface.cidr.clone());
            }
        }
        if subs.is_empty() {
            vec![self_iface.cidr.clone()]
        } else {
            subs
        }
    };

    // Phase 2: L2 ARP + ICMP Ping Sweep Discovery. Three independent active
    // methods run per subnet since any one of them can silently no-op
    // depending on privilege: arp-scan/nmap need CAP_NET_RAW, while the
    // plain `ping` binary fallback works regardless (see probes::ping_sweep_subnet).
    // Proof that arp-scan actually has raw-socket privilege this run: it's
    // physically incapable of returning a MAC-bearing result without it, so
    // "did it find anything" is airtight, portable evidence — root, setcap,
    // a container capability grant, doesn't matter how privilege arrived.
    // Far more reliable than checking UID==0 (misses setcap entirely, which
    // is the exact path the setup script and this whole conversation
    // recommends) or inspecting our own process's capabilities (which
    // don't transfer to the arp-scan/nmap child processes anyway).
    let mut arp_scan_confirmed_privilege = false;

    for subnet in &target_subnets {
        if !subnet_already_scanned(&subnets_scanned, subnet) {
            subnets_scanned.push(subnet.clone());
        }

        let arp_hosts = probes::arp_scan_subnet(subnet);
        if !arp_hosts.is_empty() {
            arp_scan_confirmed_privilege = true;
        }
        for h in arp_hosts {
            all_hosts.insert(h.ip.clone(), h);
        }

        let ping_hosts = probes::nmap_ping_sweep(subnet);
        for h in ping_hosts {
            all_hosts.entry(h.ip.clone()).or_insert(h);
        }

        let iceberg_hosts = probes::nmap_iceberg_stealth_sweep(subnet);
        for h in iceberg_hosts {
            all_hosts.entry(h.ip.clone()).or_insert(h);
        }

        let icmp_hosts = probes::ping_sweep_subnet(subnet).await;
        for h in icmp_hosts {
            all_hosts.entry(h.ip.clone()).or_insert(h);
        }

        let ssdp_hosts = probes::multicast_ssdp_discovery().await;
        for h in ssdp_hosts {
            all_hosts.entry(h.ip.clone()).or_insert(h);
        }

        let wsd_hosts = probes::multicast_wsdiscovery().await;
        for h in wsd_hosts {
            all_hosts.entry(h.ip.clone()).or_insert(h);
        }
    }

    // Kernel ARP/neighbor table as a fourth discovery source — gated to
    // non-stale/non-failed states in discovery::get_arp_table so it doesn't
    // reintroduce the old phantom-host problem (that was blind-trusting
    // /proc/net/arp with no freshness check at all, not the table itself).
    // Actual liveness for what gets displayed is still decided per-host below
    // via compute_status, so a host that only shows up here — but doesn't
    // answer a fresh probe when we get to it — is reported "offline" rather
    // than silently dropped or silently trusted.
    for (ip, mac) in &arp_table {
        if ip == &self_ip {
            continue;
        }
        if let Ok(addr) = IpAddr::from_str(ip) {
            if docker_cidrs.iter().any(|net| net.contains(addr)) {
                continue;
            }
        }
        all_hosts
            .entry(ip.clone())
            .and_modify(|h| {
                if h.mac.is_none() {
                    h.mac = Some(mac.clone());
                }
            })
            .or_insert_with(|| DiscoveredHost {
                ip: ip.clone(),
                mac: Some(mac.clone()),
                latency_ms: 0.0,
                ttl: None,
                hostname: None,
            });
    }

    // Phase 2.5: VPN Subnet Scanning
    let vpn_ifaces: Vec<&NetInterface> = interfaces
        .iter()
        .filter(|i| i.if_type == InterfaceType::Vpn)
        .collect();

    let mut active_vpn_nodes: Vec<(String, String)> = Vec::new();
    // Explicit host -> owning-tunnel attribution, replacing the old
    // "does this IP's /24 prefix look similar to the tunnel's own IP"
    // guess. That heuristic silently failed for exactly the common case
    // of a policy-based VPN (most IPsec setups): the tunnel's own overlay
    // address is a point-to-point /32 that shares no prefix at all with
    // the actual internal subnets routed through it.
    let mut vpn_hosts: HashMap<String, String> = HashMap::new();
    // Config-file source (unprivileged, portable — see get_ipsec_conf_connections)
    // takes priority over ip xfrm policy (privileged, environment-dependent).
    let ipsec_conns = discovery::get_ipsec_conf_connections();
    // Full-tunnel connections (rightsubnet=0.0.0.0/0) have no internal
    // subnet to sweep — instead we surface the remote endpoint itself as a
    // labeled node, sourced only from the local config file, never probed.
    let mut ipsec_full_tunnel_gateways: Vec<String> = Vec::new();

    if args.scan_vpn && !vpn_ifaces.is_empty() {
        for vpn_if in &vpn_ifaces {
            let is_active = discovery::interface_has_carrier(&vpn_if.name) || vpn_if.ip != "0.0.0.0";
            if !is_active {
                continue;
            }

            active_vpn_nodes.push((vpn_if.ip.clone(), vpn_if.name.clone()));

            // Subnets actually worth sweeping for this tunnel: its own
            // CIDR if it's broader than a single point-to-point address
            // (OpenVPN/WireGuard style), plus whatever internal ranges
            // are specifically routed over it (the policy-based/IPsec
            // case — a /32 overlay address reveals nothing on its own).
            let mut vpn_subnets: Vec<String> = Vec::new();
            if vpn_if.cidr.contains('/') && !vpn_if.cidr.starts_with("0.0.0.0") {
                let is_point_to_point = vpn_if.cidr.ends_with("/32") || vpn_if.cidr.ends_with("/31");
                if !is_point_to_point {
                    vpn_subnets.push(vpn_if.cidr.clone());
                }
            }
            for routed in discovery::get_routed_subnets(&vpn_if.name) {
                if !vpn_subnets.contains(&routed) {
                    vpn_subnets.push(routed);
                }
            }
            // Policy-based IPsec doesn't touch the route table at all —
            // ip xfrm policy is a fallback source (privileged, and can
            // still fail depending on environment even when granted).
            for policy_subnet in discovery::get_xfrm_policy_subnets() {
                if !vpn_subnets.contains(&policy_subnet) {
                    vpn_subnets.push(policy_subnet);
                }
            }
            // ipsec.conf is the primary source: unprivileged, and this is
            // literally what the VPN client itself was told to protect —
            // not an inference from routing state.
            for conn in &ipsec_conns {
                for subnet in &conn.protected_subnets {
                    if !vpn_subnets.contains(subnet) {
                        vpn_subnets.push(subnet.clone());
                    }
                }
                if conn.is_full_tunnel {
                    if let Some(gw) = &conn.remote_gateway {
                        if IpAddr::from_str(gw).is_ok() && !ipsec_full_tunnel_gateways.contains(gw) {
                            ipsec_full_tunnel_gateways.push(gw.clone());
                            // Authorized VAPT recon covers the client's
                            // entire reachable infra, including the VPN
                            // concentrator itself — full Phase 4 treatment
                            // (port scan, banners, SNMP, FTP/SMB checks),
                            // same as any other discovered host. No
                            // exploitation anywhere in this pipeline, only
                            // recon — that boundary doesn't change.
                            vpn_hosts.insert(gw.clone(), vpn_if.ip.clone());
                            all_hosts.entry(gw.clone()).or_insert_with(|| DiscoveredHost {
                                ip: gw.clone(),
                                mac: None,
                                latency_ms: 0.0,
                                ttl: None,
                                hostname: None,
                            });
                        }
                    }
                }
            }

            for subnet in &vpn_subnets {
                if subnet_already_scanned(&subnets_scanned, subnet) {
                    continue;
                }
                subnets_scanned.push(subnet.clone());

                let mut swept: Vec<DiscoveredHost> = probes::nmap_ping_sweep(subnet);
                swept.extend(probes::ping_sweep_subnet(subnet).await);

                for host in swept {
                    if host.ip == vpn_if.ip {
                        continue;
                    }
                    vpn_hosts.insert(host.ip.clone(), vpn_if.ip.clone());
                    all_hosts.entry(host.ip.clone()).or_insert(host);
                }
            }
        }
    }

    // Remove every address that belongs to this machine, not just the one
    // chosen as self_ip — a host with a VPN overlay address (or any second
    // IP on any interface) is still just this machine, and sweeping its own
    // subnets can legitimately "discover" its own other address (nmap/ping
    // don't know to exclude it). That produced a real duplicate: the VPN
    // overlay IP showing up a second time as an ordinary "host" node
    // running the exact same services as the "YOU" node.
    for iface in &interfaces {
        all_hosts.remove(&iface.ip);
    }
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
    let mut self_has_https = false;
    for (port, _lat) in &self_ports {
        if TLS_WEB_PORTS.contains(port) {
            self_has_https = true;
        }
        let svc = probes::port_to_service(*port);
        let banner = if args.banners {
            probes::grab_banner(&self_ip, *port).await
        } else {
            None
        };
        let version = banner.as_ref().and_then(|b| extract_version(b));
        let (is_web, url) = detect_web_url(&self_ip, *port, banner.as_deref(), false);
        self_port_entries.push(OpenPort {
            port: *port,
            service: svc.to_string(),
            protocol: "TCP".to_string(),
            state: "open".to_string(),
            banner,
            version,
            is_web,
            url,
        });
    }
    if self_has_https {
        if let Some(_cn) = probes::get_ssl_cert_cn(&self_ip) {
            for entry in self_port_entries.iter_mut() {
                if TLS_WEB_PORTS.contains(&entry.port) {
                    entry.is_web = true;
                    entry.url = Some(format!("https://{}:{}", self_ip, entry.port));
                }
            }
        }
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
        roles: Vec::new(),
        hop: None,
        via_pivot: None,
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
        let gw_status = compute_status(!gw_ports.is_empty(), gw_latency > 0.0, gw_mac.is_some());

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
                is_web: false,
                url: None,
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
            status: gw_status.to_string(),
            ports: gw_port_entries,
            interface: Some(self_iface_name.clone()),
            os: Some("Gateway Router / Firewall".to_string()),
            last_seen: chrono_now(),
            ttl: gw_ttl,
            hostname: gw_hostname,
            confidence: Some(95),
            roles: Vec::new(),
            hop: None,
            via_pivot: None,
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
            roles: Vec::new(),
            hop: None,
            via_pivot: None,
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
        let mut open_ports = probes::scan_ports(host_ip, args.timeout_ms).await;
        // Adaptive depth: only pay for the ~750-port deep tier on hosts that
        // already proved they're alive and listening on something.
        if !open_ports.is_empty() {
            let known: Vec<u16> = open_ports.iter().map(|(p, _)| *p).collect();
            let deep = probes::scan_deep_ports(host_ip, args.timeout_ms, &known).await;
            open_ports.extend(deep);
            open_ports.sort_by_key(|&(p, _)| p);
        }
        let snmp_sysdescr = probes::snmp_get_sysdescr(host_ip).await;
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
        let mut http_title: Option<String> = None;

        for (port, _lat) in &open_ports {
            if TLS_WEB_PORTS.contains(port) {
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
            if http_title.is_none() {
                if let Some(b) = &banner {
                    http_title = probes::extract_http_title(b);
                }
            }
            let version = banner.as_ref().and_then(|b| extract_version(b));
            let (is_web, url) = detect_web_url(host_ip, *port, banner.as_deref(), false);
            port_entries.push(OpenPort {
                port: *port,
                service: svc.to_string(),
                protocol: "TCP".to_string(),
                state: "open".to_string(),
                banner,
                version,
                is_web,
                url,
            });
        }

        let mut ssl_cn: Option<String> = None;
        if has_https {
            ssl_cn = probes::get_ssl_cert_cn(host_ip);
            if ssl_cn.is_some() {
                for entry in port_entries.iter_mut() {
                    if TLS_WEB_PORTS.contains(&entry.port) {
                        entry.is_web = true;
                        entry.url = Some(format!("https://{}:{}", host_ip, entry.port));
                    }
                }
            }
        }

        let mac_vendor = host.mac.as_ref().and_then(|m| oui_db.lookup(m));
        // SNMP sysDescr is text straight from the device's own firmware —
        // when present it's far more trustworthy than a TTL/nmap guess.
        let os_guess = snmp_sysdescr.clone().unwrap_or_else(|| {
            if args.os_detect {
                probes::nmap_os_detect(host_ip, effective_ttl, first_banner.as_deref())
            } else {
                // No TTL evidence at all — say so plainly. The old fallback
                // text ("Linux/Embedded Device") looked like a real guess
                // and fed straight back into the device-type scorer's
                // "embedded"/"iot" keyword match, biasing devices we have
                // zero information on toward "iot" — a guess dressed up as
                // a fact, exactly what accurate fingerprinting must avoid.
                effective_ttl.map(|t| probes::guess_os_from_ttl(t).to_string()).unwrap_or_else(|| "Unknown (no TTL data)".to_string())
            }
        });

        // SSL CN and HTTP <title> play the same evidentiary role for the
        // scorer (a self-reported product/brand string) — combine them.
        let web_signal = ssl_cn.clone().or_else(|| http_title.clone());

        let (device_type, type_confidence) = guess_device_type(
            &port_entries,
            mac_vendor.as_deref(),
            Some(&os_guess),
            web_signal.as_deref(),
            host.hostname.as_deref(),
            snmp_sysdescr.as_deref(),
        );
        let host_status = compute_status(!port_entries.is_empty(), ping_lat > 0.0, host.mac.is_some());

        let label = host.hostname.clone()
            .or(ssl_cn.clone())
            .unwrap_or_else(|| {
                mac_vendor
                    .as_ref()
                    .map(|v| format!("{} ({})", v, host_ip))
                    .unwrap_or_else(|| host_ip.clone())
            });

        let owning_vpn_ip = vpn_hosts.get(host_ip).cloned();
        let is_vpn_host = owning_vpn_ip.is_some();

        let category = if is_vpn_host { "vpn" } else { "host" };

        // Security-relevant findings — each backed by an actual verification
        // probe run only when the port that makes it meaningful is open, not
        // guessed from port presence alone.
        let host_port_nums: HashSet<u16> = port_entries.iter().map(|p| p.port).collect();
        let mut roles: Vec<String> = Vec::new();
        if host_port_nums.contains(&21) && probes::check_ftp_anonymous(host_ip).await {
            roles.push("ftp-anonymous-login".to_string());
        }
        if host_port_nums.contains(&445) || host_port_nums.contains(&139) {
            if let Some(shares) = probes::smb_list_shares(host_ip) {
                for share in shares.iter().take(5) {
                    roles.push(format!("smb-open-share:{}", share));
                }
            }
        }
        if host_port_nums.contains(&88) && host_port_nums.contains(&389) && host_port_nums.contains(&445) {
            roles.push("domain-controller-candidate".to_string());
        }
        if host_port_nums.contains(&3268) || host_port_nums.contains(&3269) {
            roles.push("global-catalog".to_string());
        }
        if host_port_nums.contains(&636) {
            roles.push("ldaps".to_string());
        }

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
            status: host_status.to_string(),
            ports: port_entries,
            interface: Some(self_iface_name.clone()),
            os: Some(os_guess),
            last_seen: chrono_now(),
            ttl: effective_ttl,
            hostname: host.hostname.clone().or(ssl_cn),
            confidence: Some(type_confidence),
            roles,
            hop: None,
            via_pivot: None,
        };

        let link_target = owning_vpn_ip.clone().unwrap_or_else(|| gw_node_id.clone());

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
    if args.scan_docker {
        let (docker_containers, docker_warn) = discovery::get_docker_containers_info();
        if let Some(w) = docker_warn {
            if !scan_warnings.contains(&w) {
                scan_warnings.push(w);
            }
        }

        if !docker_containers.is_empty() {
            let docker_ifaces: Vec<&NetInterface> = interfaces
                .iter()
                .filter(|i| i.if_type == InterfaceType::Docker)
                .collect();

            let mut bridge_nodes_created: HashMap<String, String> = HashMap::new(); // bridge_ip -> bridge_name

            for container in &docker_containers {
                if container.network_mode == "host" || container.networks.is_empty() {
                    // Host network mode container: shares host IP
                    let host_c_id = format!(
                        "docker-host-{}",
                        &container.id[..12.min(container.id.len())]
                    );
                    let c_node = NetworkNode {
                        id: host_c_id.clone(),
                        label: format!("Docker (host): {}", container.name),
                        ip: self_ip.clone(),
                        mac: None,
                        category: "docker".to_string(),
                        device_type: "docker".to_string(),
                        is_self: false,
                        vendor: Some(format!("Docker Container ({})", container.image)),
                        latency_ms: 0.1,
                        status: "online".to_string(),
                        ports: Vec::new(),
                        interface: Some(self_iface_name.clone()),
                        os: Some(format!("Containerized ({})", container.image)),
                        last_seen: chrono_now(),
                        ttl: None,
                        hostname: Some(container.name.clone()),
                        confidence: Some(100),
                        roles: container.ports.clone(),
                        hop: None,
                        via_pivot: None,
                    };

                    let c_link = NetworkLink {
                        source: self_ip.clone(),
                        target: host_c_id.clone(),
                        link_type: "docker".to_string(),
                        latency_ms: Some(0.1),
                        label: Some("Host Net Container".to_string()),
                    };

                    if args.stream {
                        emit_event("node", &c_node);
                        emit_event("link", &c_link);
                    }
                    nodes.push(c_node);
                    links.push(c_link);
                } else {
                    for (net_name, container_ip) in &container.networks {
                        if container_ip.is_empty() {
                            continue;
                        }
                        let c_ip_addr = match IpAddr::from_str(container_ip) {
                            Ok(addr) => addr,
                            Err(_) => continue,
                        };

                        // Match container IP against host's docker bridge interfaces
                        let matching_iface = docker_ifaces.iter().find(|iface| {
                            if let Ok(net) = ipnetwork::IpNetwork::from_str(&iface.cidr) {
                                net.contains(c_ip_addr)
                            } else {
                                false
                            }
                        });

                        let (bridge_ip, bridge_name) = match matching_iface {
                            Some(iface) => (iface.ip.clone(), iface.name.clone()),
                            None => {
                                if let Some(def_if) = docker_ifaces.first() {
                                    (def_if.ip.clone(), def_if.name.clone())
                                } else {
                                    (self_ip.clone(), net_name.clone())
                                }
                            }
                        };

                        // Create bridge node if it's not self_ip and not created yet
                        if bridge_ip != self_ip && !bridge_nodes_created.contains_key(&bridge_ip) {
                            let b_mac = matching_iface.map(|i| i.mac.clone());
                            let bridge_node = NetworkNode {
                                id: bridge_ip.clone(),
                                label: format!("Docker Bridge ({})", bridge_name),
                                ip: bridge_ip.clone(),
                                mac: b_mac,
                                category: "docker".to_string(),
                                device_type: "docker".to_string(),
                                is_self: false,
                                vendor: Some("Docker Network Bridge".to_string()),
                                latency_ms: 0.1,
                                status: "online".to_string(),
                                ports: Vec::new(),
                                interface: Some(bridge_name.clone()),
                                os: Some(format!("Docker Subnet ({})", net_name)),
                                last_seen: chrono_now(),
                                ttl: None,
                                hostname: None,
                                confidence: Some(100),
                                roles: Vec::new(),
                                hop: None,
                                via_pivot: None,
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
                            bridge_nodes_created.insert(bridge_ip.clone(), bridge_name.clone());

                            subnets_scanned.push(format!("{}/16", bridge_ip));
                        }

                        // Fast container port scan
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
                                is_web: false,
                                url: None,
                            });
                        }

                        let c_node = NetworkNode {
                            id: container_ip.clone(),
                            label: format!("Docker: {}", container.name),
                            ip: container_ip.clone(),
                            mac: None,
                            category: "docker".to_string(),
                            device_type: "docker".to_string(),
                            is_self: false,
                            vendor: Some(format!("Docker Container ({})", container.image)),
                            latency_ms: 0.1,
                            status: "online".to_string(),
                            ports: port_entries,
                            interface: Some(bridge_name.clone()),
                            os: Some(format!("Containerized ({})", container.image)),
                            last_seen: chrono_now(),
                            ttl: None,
                            hostname: Some(container.name.clone()),
                            confidence: Some(100),
                            roles: container.ports.clone(),
                            hop: None,
                            via_pivot: None,
                        };

                        let link_source = if bridge_nodes_created.contains_key(&bridge_ip) {
                            bridge_ip.clone()
                        } else {
                            self_ip.clone()
                        };

                        let c_link = NetworkLink {
                            source: link_source,
                            target: container_ip.clone(),
                            link_type: "docker".to_string(),
                            latency_ms: Some(0.1),
                            label: Some(format!("veth ({})", net_name)),
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
    }

    // Phase 6: Active Pivot Testing (opt-in, --pivot user@host).
    // Uses credentials you already hold on a second host to test what
    // segments become visible once you're past it — no exploitation, no
    // credential handling beyond normal SSH agent/key auth.
    if let Some(ref pivot_target) = args.pivot {
        match pivot::open_tunnel(pivot_target, args.pivot_key.as_deref()).await {
            Ok(tunnel) => {
                let host_part = pivot_target
                    .rsplit('@')
                    .next()
                    .unwrap_or(pivot_target)
                    .split(':')
                    .next()
                    .unwrap_or(pivot_target);
                let pivot_ip = if IpAddr::from_str(host_part).is_ok() {
                    host_part.to_string()
                } else {
                    dns_lookup::lookup_host(host_part)
                        .ok()
                        .and_then(|addrs| addrs.into_iter().find(|a| a.is_ipv4()))
                        .map(|a| a.to_string())
                        .unwrap_or_else(|| host_part.to_string())
                };

                if !nodes.iter().any(|n| n.ip == pivot_ip) {
                    let placeholder = NetworkNode {
                        id: pivot_ip.clone(),
                        label: format!("Pivot Host ({})", pivot_target),
                        ip: pivot_ip.clone(),
                        mac: None,
                        category: "host".to_string(),
                        device_type: "server".to_string(),
                        is_self: false,
                        vendor: None,
                        latency_ms: 1.0,
                        status: "online".to_string(),
                        ports: Vec::new(),
                        interface: None,
                        os: Some("Remote pivot host (via SSH)".to_string()),
                        last_seen: chrono_now(),
                        ttl: None,
                        hostname: None,
                        confidence: Some(100),
                        roles: Vec::new(),
                        hop: None,
                        via_pivot: None,
                    };
                    let placeholder_link = NetworkLink {
                        source: gw_node_id.clone(),
                        target: pivot_ip.clone(),
                        link_type: self_iface_type.clone(),
                        latency_ms: None,
                        label: Some("Pivot Access".to_string()),
                    };
                    if args.stream {
                        emit_event("node", &placeholder);
                        emit_event("link", &placeholder_link);
                    }
                    nodes.push(placeholder);
                    links.push(placeholder_link);
                }

                match pivot::remote_enumerate(pivot_target, args.pivot_key.as_deref()).await {
                    Some(remote_info) => {
                        let local_prefixes: HashSet<String> = subnets_scanned
                            .iter()
                            .filter_map(|s| s.split('/').next())
                            .map(|ip| ip.split('.').take(3).collect::<Vec<_>>().join("."))
                            .collect();

                        let new_subnet_prefixes: HashSet<String> = remote_info
                            .subnets
                            .iter()
                            .filter_map(|(_, cidr)| cidr.split('/').next())
                            .map(|ip| ip.split('.').take(3).collect::<Vec<_>>().join("."))
                            .filter(|prefix| !local_prefixes.contains(prefix))
                            .collect();

                        let mut seen_pivot_ips: HashSet<String> = HashSet::new();
                        for (nb_ip, nb_mac) in &remote_info.neighbors {
                            let prefix = nb_ip.split('.').take(3).collect::<Vec<_>>().join(".");
                            if !new_subnet_prefixes.contains(&prefix) {
                                continue;
                            }
                            if nb_ip == &pivot_ip || nodes.iter().any(|n| n.ip == *nb_ip) {
                                continue;
                            }
                            if !seen_pivot_ips.insert(nb_ip.clone()) {
                                continue;
                            }

                            let open =
                                pivot::scan_ports_via_pivot(tunnel.local_port, nb_ip, args.timeout_ms)
                                    .await;
                            if open.is_empty() {
                                continue; // no TCP evidence at all — don't report a guess
                            }

                            let port_entries: Vec<OpenPort> = open
                                .iter()
                                .map(|&port| OpenPort {
                                    port,
                                    service: probes::port_to_service(port).to_string(),
                                    protocol: "TCP".to_string(),
                                    state: "open".to_string(),
                                    banner: None,
                                    version: None,
                                    is_web: false,
                                    url: None,
                                })
                                .collect();

                            let vendor = oui_db.lookup(nb_mac);
                            let (device_type, confidence) = guess_device_type(
                                &port_entries,
                                vendor.as_deref(),
                                None,
                                None,
                                None,
                                None,
                            );

                            let pivot_node = NetworkNode {
                                id: nb_ip.clone(),
                                label: nb_ip.clone(),
                                ip: nb_ip.clone(),
                                mac: Some(nb_mac.clone()),
                                category: "host".to_string(),
                                device_type,
                                is_self: false,
                                vendor,
                                latency_ms: 1.0,
                                status: "online".to_string(),
                                ports: port_entries,
                                interface: None,
                                os: Some("Discovered via pivot (TCP evidence only)".to_string()),
                                last_seen: chrono_now(),
                                ttl: None,
                                hostname: None,
                                confidence: Some(confidence),
                                roles: Vec::new(),
                                hop: Some(1),
                                via_pivot: Some(pivot_ip.clone()),
                            };
                            let pivot_link = NetworkLink {
                                source: pivot_ip.clone(),
                                target: nb_ip.clone(),
                                link_type: "pivot".to_string(),
                                latency_ms: None,
                                label: Some(format!("via {}", pivot_target)),
                            };

                            if args.stream {
                                emit_event("node", &pivot_node);
                                emit_event("link", &pivot_link);
                            }
                            nodes.push(pivot_node);
                            links.push(pivot_link);
                        }

                        if new_subnet_prefixes.is_empty() {
                            scan_warnings.push(format!(
                                "Pivot via {} connected, but its subnets are the same ones already visible from here — no new segment exposed.",
                                pivot_target
                            ));
                        }
                    }
                    None => {
                        scan_warnings.push(format!(
                            "Pivot tunnel to {} came up, but couldn't enumerate its routes/neighbors over SSH (command execution failed).",
                            pivot_target
                        ));
                    }
                }
                // `tunnel` drops here — Drop impl kills the ssh -D process.
            }
            Err(e) => {
                scan_warnings.push(format!("Pivot to {} failed: {}", pivot_target, e));
            }
        }
    }

    // The early privilege warning (emitted before any scanning happened,
    // for immediate UI feedback) was a prediction from process UID alone.
    // arp-scan actually succeeding this run disproves it outright — drop it
    // from the final result rather than leave a contradicted message next
    // to results that just proved it wrong.
    if arp_scan_confirmed_privilege {
        scan_warnings.retain(|w| !w.starts_with("Running without root/CAP_NET_RAW"));
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
            warnings: scan_warnings,
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

/// Bump a category's evidence score.
fn bump(scores: &mut HashMap<&'static str, i32>, cat: &'static str, pts: i32) {
    *scores.entry(cat).or_insert(0) += pts;
}

/// Multi-signal weighted device-type classifier. Each independent signal
/// (hostname/mDNS, SSL CN, open-port fingerprint, vendor OUI, OS/TTL guess)
/// casts weighted votes for one or more candidate categories instead of the
/// old first-match cascade, where one weak/shared signal (e.g. a phone-vendor
/// OUI also used by TVs) could short-circuit the whole decision. Confidence
/// is derived from how much evidence backed the winner, and is deliberately
/// lowered when two categories are nearly tied rather than reporting a
/// falsely-confident wrong label.
fn guess_device_type(
    ports: &[OpenPort],
    vendor: Option<&str>,
    os: Option<&str>,
    ssl_cn: Option<&str>,
    hostname: Option<&str>,
    snmp_desc: Option<&str>,
) -> (String, u8) {
    let port_nums: HashSet<u16> = ports.iter().map(|p| p.port).collect();
    let mut scores: HashMap<&'static str, i32> = HashMap::new();

    // --- Hostname / mDNS / NetBIOS keywords (strong signal) ---
    if let Some(h) = hostname {
        let hl = h.to_lowercase();
        if hl.contains("iphone") || hl.contains("ipad") || hl.contains("android")
            || hl.contains("galaxy") || hl.contains("pixel") || hl.contains("oneplus")
            || hl.contains("xiaomi") || hl.contains("redmi")
        {
            bump(&mut scores, "mobile", 40);
        }
        if hl.contains("chromecast") || hl.contains("roku") || hl.contains("firestick")
            || hl.contains("appletv") || hl.contains("smarttv")
        {
            bump(&mut scores, "tv", 40);
        }
        if hl.contains("router") || hl.contains("gateway") || hl.contains("ap-")
            || hl.contains("modem") || hl.contains("unifi") || hl.contains("access-point")
            || hl.contains("extender") || hl.contains("repeater") || hl.contains("wifi")
        {
            bump(&mut scores, "router", 40);
        }
        if hl.contains("printer") || hl.contains("print") || hl.contains("laserjet") || hl.contains("officejet") {
            bump(&mut scores, "printer", 45);
        }
        if hl.contains("nas") || hl.contains("synology") || hl.contains("qnap") || hl.contains("diskstation") {
            bump(&mut scores, "nas", 40);
        }
        if hl.contains("macbook") || hl.contains("imac") || hl.contains("laptop") || hl.contains("desktop") {
            bump(&mut scores, "laptop", 30);
        }
        // Actual PC model names/lines — a hostname literally naming the
        // hardware model is about as strong as evidence gets.
        if hl.contains("thinkpad") || hl.contains("thinkcentre") || hl.contains("ideapad")
            || hl.contains("legion") || hl.contains("latitude") || hl.contains("inspiron")
            || hl.contains("optiplex") || hl.contains("precision") || hl.contains("vostro")
            || hl.contains("xps") || hl.contains("probook") || hl.contains("elitebook")
            || hl.contains("pavilion") || hl.contains("envy") || hl.contains("omen")
            || hl.contains("zbook") || hl.contains("vivobook") || hl.contains("zenbook")
            || hl.contains("rog-") || hl.contains("tuf-") || hl.contains("aspire")
            || hl.contains("predator") || hl.contains("nitro-") || hl.contains("swift")
            || hl.contains("surface") || hl.contains("chromebook")
        {
            bump(&mut scores, "laptop", 45);
        }
    }

    // --- TLS certificate CN / HTTP page title (strong signal for
    // self-hosted web UIs — the caller feeds http_title in here whenever
    // there's no TLS cert, so this also catches plain-HTTP router/AP admin
    // panels like a WiFi extender's login page) ---
    if let Some(cn) = ssl_cn {
        let cnl = cn.to_lowercase();
        if cnl.contains("tplink") || cnl.contains("tp-link") || cnl.contains("asus")
            || cnl.contains("netgear") || cnl.contains("router") || cnl.contains("mikrotik")
            || cnl.contains("ubiquiti") || cnl.contains("d-link") || cnl.contains("dlink")
            || cnl.contains("tenda") || cnl.contains("xiaomi") || cnl.contains("mi wifi")
            || cnl.contains("totolink") || cnl.contains("linksys") || cnl.contains("belkin")
        {
            bump(&mut scores, "router", 35);
        }
        // Vocabulary that's near-exclusively used on actual WiFi hardware
        // admin panels (routers, APs, extenders/repeaters) rather than
        // general self-hosted software — a much safer generic net than
        // matching on "login"/"admin"/"setup" alone, which would also fire
        // on Grafana/Portainer/NAS login pages and misclassify those.
        if cnl.contains("wireless") || cnl.contains("access point") || cnl.contains("extender")
            || cnl.contains("repeater") || cnl.contains("range extender") || cnl.contains("wifi router")
            || cnl.contains("hotspot") || cnl.contains("wlan")
        {
            bump(&mut scores, "router", 30);
        }
        if cnl.contains("synology") || cnl.contains("qnap") {
            bump(&mut scores, "nas", 35);
        }
        if cnl.contains("plex") {
            bump(&mut scores, "server", 30);
        }
    }

    // --- SNMP sysDescr (strongest signal of all — self-reported by the
    // device's own firmware; SNMP being enabled at all on a home/office
    // network is itself decent evidence of managed network gear) ---
    if let Some(desc) = snmp_desc {
        let dl = desc.to_lowercase();
        if dl.contains("cisco") || dl.contains("mikrotik") || dl.contains("routeros")
            || dl.contains("router") || dl.contains("switch") || dl.contains("ubiquiti")
            || dl.contains("unifi") || dl.contains("tp-link") || dl.contains("netgear")
            || dl.contains("access point")
        {
            bump(&mut scores, "router", 55);
        } else if dl.contains("printer") || dl.contains("laserjet") || dl.contains("officejet") || dl.contains("deskjet") {
            bump(&mut scores, "printer", 55);
        } else if dl.contains("synology") || dl.contains("qnap") || dl.contains("nas") {
            bump(&mut scores, "nas", 55);
        } else if dl.contains("ups") || dl.contains("apc") {
            bump(&mut scores, "iot", 40);
        } else {
            // SNMP with no recognizable keyword is still almost always
            // managed infrastructure on a home/office LAN, just weaker.
            bump(&mut scores, "router", 25);
        }
    }

    // --- Open-port fingerprints (hard evidence — highest weights) ---
    if port_nums.contains(&9100) || port_nums.contains(&631) {
        bump(&mut scores, "printer", 45);
    }
    if port_nums.contains(&3306) || port_nums.contains(&5432) || port_nums.contains(&27017)
        || port_nums.contains(&6379) || port_nums.contains(&9042)
    {
        bump(&mut scores, "database", 45);
    }
    if port_nums.contains(&62078) {
        bump(&mut scores, "mobile", 40);
    }
    if port_nums.contains(&8008) || port_nums.contains(&8009) || port_nums.contains(&7000) {
        bump(&mut scores, "tv", 35);
    }
    if port_nums.contains(&3389) || port_nums.contains(&5900) || port_nums.contains(&5901) {
        bump(&mut scores, "laptop", 35);
    }
    if port_nums.contains(&548) {
        bump(&mut scores, "nas", 30);
        bump(&mut scores, "laptop", 15);
    }
    if port_nums.contains(&22) && (port_nums.contains(&80) || port_nums.contains(&443)) {
        // Weak on its own — plenty of laptops run a local dev server or
        // Docker Desktop and expose the same combo. Real evidence (vendor
        // OUI, hostname/model name) should outweigh this, not lose to it.
        bump(&mut scores, "server", 18);
    }
    if port_nums.contains(&179) || port_nums.contains(&161) {
        bump(&mut scores, "router", 30);
    }
    if port_nums.contains(&1883) || port_nums.contains(&5683) {
        bump(&mut scores, "iot", 35);
    }

    // --- Vendor OUI (weak-to-medium — shared across device classes) ---
    if let Some(v) = vendor {
        let vl = v.to_lowercase();
        if vl.contains("samsung") || vl.contains("huawei")
            || vl.contains("xiaomi") || vl.contains("oneplus") || vl.contains("oppo")
            || vl.contains("realme") || vl.contains("vivo") || vl.contains("nothing technology")
            || vl.contains("motorola mobility") || vl.contains("honor device")
            || vl.contains("google inc") || vl.contains("sony mobile")
        {
            bump(&mut scores, "mobile", 15);
        }
        // Apple gets its own block — the vendor OUI alone can't tell an
        // iPhone from a MacBook, unlike the single-product brands above.
        // macOS enables several services iOS never does (AFP/VNC/ARD/SSH
        // with multiple ports reachable); their presence is real evidence
        // of a Mac. With no such evidence, don't guess a side — split the
        // weight so the ambiguity-detector reports low confidence instead
        // of confidently picking the wrong one.
        if vl.contains("apple") {
            let mac_like = port_nums.contains(&548) || port_nums.contains(&5900)
                || port_nums.contains(&3283) || port_nums.contains(&88);
            if mac_like {
                bump(&mut scores, "laptop", 35);
            } else {
                bump(&mut scores, "mobile", 12);
                bump(&mut scores, "laptop", 12);
            }
        }
        if vl.contains("cisco") || vl.contains("juniper") || vl.contains("mikrotik")
            || vl.contains("ubiquiti") || vl.contains("tp-link") || vl.contains("netgear")
            || vl.contains("d-link") || vl.contains("tenda") || vl.contains("aruba")
            || vl.contains("xiaomi") || vl.contains("totolink") || vl.contains("linksys")
            || vl.contains("belkin")
        {
            bump(&mut scores, "router", 25);
        }
        if vl.contains("vmware") || vl.contains("virtualbox") || vl.contains("hyper-v") || vl.contains("qemu") {
            bump(&mut scores, "server", 25);
        }
        if vl.contains("synology") || vl.contains("qnap") {
            bump(&mut scores, "nas", 25);
        }
        if vl.contains("docker") {
            bump(&mut scores, "docker", 40);
        }
        if vl.contains("roku") || vl.contains("vizio") || vl.contains("lg electronics") {
            bump(&mut scores, "tv", 20);
        }
        if vl.contains("espressif") || vl.contains("sonoff") || vl.contains("shelly") || vl.contains("tuya") {
            bump(&mut scores, "iot", 30);
        }
        // PC/laptop OEMs — the actual manufacturer of the NIC is strong,
        // direct evidence of "this is a PC", and should reliably outweigh
        // the weak "has SSH+web open" port heuristic that was previously
        // the only thing deciding these, mislabeling them "server".
        if vl.contains("dell") || vl.contains("hewlett packard") || vl.contains("hp inc")
            || vl.contains("lenovo") || vl.contains("asustek") || vl.contains("acer")
            || vl.contains("microsoft") || vl.contains("toshiba") || vl.contains("dynabook")
            || vl.contains("fujitsu") || vl.contains("msi") || vl.contains("micro-star")
            || vl.contains("gigabyte") || vl.contains("clevo") || vl.contains("framework computer")
            || vl.contains("system76") || vl.contains("razer") || vl.contains("panasonic")
            || vl.contains("compal") || vl.contains("quanta") || vl.contains("wistron")
            || vl.contains("pegatron") || vl.contains("foxconn") || vl.contains("inventec")
        {
            bump(&mut scores, "laptop", 35);
        }
        // NIC-chipset vendors (not the OEM, but the WiFi/ethernet module
        // supplier) — much weaker signal since these ship in routers/IoT
        // too, but still lean PC in the absence of anything stronger.
        // AzureWave deliberately excluded: it's primarily a WiFi-module
        // supplier for routers/APs/extenders, not laptops — leaning "laptop"
        // on that OUI alone was actively wrong for exactly that class of
        // device (a WiFi extender with no other laptop-like evidence).
        if vl.contains("intel corporate") || vl.contains("liteon")
            || vl.contains("qualcomm atheros") || vl.contains("realtek")
        {
            bump(&mut scores, "laptop", 12);
        }
    }

    // --- OS / TTL fingerprint (weak-medium — many false shares) ---
    if let Some(o) = os {
        let ol = o.to_lowercase();
        if ol.contains("windows") {
            bump(&mut scores, "laptop", 20);
        }
        // Deliberately no "android"/"ios" keyword check here: nothing in
        // this pipeline produces a genuinely narrow "this device runs
        // Android/iOS" string. The only text that ever reached this point
        // containing those substrings was our own ambiguous TTL bucket
        // label ("Linux / Android / macOS", which spans a Linux server, a
        // MacBook, and an Android phone) and — worse — nmap_os_detect's
        // legitimate "Cisco IOS" router-firmware string, which also
        // contains "ios" and would have wrongly nudged real routers toward
        // "mobile". Real Android/iOS evidence comes through hostname
        // keywords and SNMP sysDescr instead, both already scored above.
        if ol.contains("network infrastructure") {
            bump(&mut scores, "router", 15);
        }
        if ol.contains("embedded") || ol.contains("iot") {
            bump(&mut scores, "iot", 10);
        }
    }

    let mut ranked: Vec<(&str, i32)> = scores.into_iter().collect();
    ranked.sort_by(|a, b| b.1.cmp(&a.1));

    let (top_cat, top_score) = match ranked.first() {
        Some(&(cat, score)) => (cat, score),
        None => {
            // No signal fired at all — weak port-presence fallback, low confidence.
            let fallback = if ports.is_empty() { "laptop" } else { "server" };
            return (fallback.to_string(), 35);
        }
    };
    let second_score = ranked.get(1).map(|r| r.1).unwrap_or(0);

    let mut confidence = 35 + top_score;
    if second_score > 0 && (top_score - second_score) <= 10 {
        confidence -= 20; // top two candidates nearly tied — don't overstate certainty
    }

    (top_cat.to_string(), confidence.clamp(30, 97) as u8)
}

/// Compute liveness status from this run's active-probe evidence: an open TCP
/// port, an ICMP reply, or an ARP reply (L2 confirmation). No single-source
/// (e.g. stale kernel ARP cache alone) counts as alive.
fn compute_status(has_open_ports: bool, ping_alive: bool, arp_confirmed: bool) -> &'static str {
    if has_open_ports || ping_alive || arp_confirmed {
        "online"
    } else {
        "offline"
    }
}

/// Ports where a TLS listener means the URL scheme should be https.
const TLS_WEB_PORTS: &[u16] = &[443, 4443, 8443, 9443, 10443];

/// Decide whether a port is an actually-confirmed web app — never guessed
/// from the port number alone. Plain HTTP requires a captured banner that
/// literally starts with "HTTP/"; HTTPS requires we already fetched a real
/// TLS certificate from this host (proof the TLS handshake succeeded).
fn detect_web_url(ip: &str, port: u16, banner: Option<&str>, has_ssl_cert: bool) -> (bool, Option<String>) {
    let is_tls_port = TLS_WEB_PORTS.contains(&port);
    let banner_is_http = banner.map(|b| b.trim_start().starts_with("HTTP/")).unwrap_or(false);

    if banner_is_http && !is_tls_port {
        (true, Some(format!("http://{}:{}", ip, port)))
    } else if is_tls_port && has_ssl_cert {
        (true, Some(format!("https://{}:{}", ip, port)))
    } else {
        (false, None)
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

/// Canonical network-address form of a CIDR string, so "192.168.29.58/24"
/// (host-bits-included, as `ip addr show` reports it) and "192.168.29.0/24"
/// (network address, as `ip route show` reports it) compare as the same
/// subnet instead of two different strings. Without this, a policy-based
/// VPN's routed subnets — which naturally include the interface's own
/// ordinary LAN route, not just genuinely VPN-specific ones, since routes
/// aren't tagged that way — silently triggered a full redundant second
/// sweep of the entire LAN every time, roughly doubling scan time.
fn normalize_cidr(s: &str) -> Option<String> {
    ipnetwork::Ipv4Network::from_str(s)
        .ok()
        .map(|n| format!("{}/{}", n.network(), n.prefix()))
}

fn subnet_already_scanned(scanned: &[String], candidate: &str) -> bool {
    match normalize_cidr(candidate) {
        Some(norm) => scanned
            .iter()
            .any(|s| normalize_cidr(s).as_deref() == Some(norm.as_str())),
        None => scanned.contains(&candidate.to_string()),
    }
}

fn is_root() -> bool {
    std::fs::read_to_string("/proc/self/status")
        .ok()
        .and_then(|s| {
            s.lines()
                .find(|l| l.starts_with("Uid:"))
                .and_then(|l| l.split_whitespace().nth(1).map(|v| v.to_string()))
        })
        .map(|uid| uid == "0")
        .unwrap_or(false)
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
