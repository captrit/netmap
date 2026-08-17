use crate::models::DiscoveredHost;
use std::process::Command;
use std::time::Instant;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::time::{timeout, Duration};

/// Top 200 most common ports for thorough scanning.
pub const TOP_PORTS: &[u16] = &[
    21, 22, 23, 25, 53, 80, 110, 111, 135, 137, 139, 143, 161, 179, 389, 443, 445,
    465, 514, 515, 548, 554, 587, 631, 636, 873, 902, 993, 995, 1080, 1194,
    1433, 1434, 1521, 1723, 1883, 1900, 2049, 2082, 2083, 2181, 2375, 2376, 3000,
    3128, 3268, 3306, 3389, 3690, 4000, 4443, 4500, 4567, 4848, 5000, 5001,
    5060, 5222, 5353, 5432, 5555, 5601, 5672, 5900, 5901, 5984, 6000, 6379, 6443,
    6667, 7001, 7071, 7077, 7474, 8000, 8008, 8009, 8042, 8060, 8080, 8081,
    8088, 8181, 8443, 8500, 8834, 8880, 8888, 9000, 9042, 9043, 9060, 9080,
    9090, 9091, 9100, 9200, 9300, 9418, 9443, 9999, 10000, 10050, 10443,
    11211, 15672, 27017, 27018, 28017, 32400, 50000, 50070, 61616,
];

/// Well-known port → service name mapping.
pub fn port_to_service(port: u16) -> &'static str {
    match port {
        21 => "FTP",
        22 => "SSH",
        23 => "Telnet",
        25 => "SMTP",
        53 => "DNS",
        80 => "HTTP",
        110 => "POP3",
        111 => "RPCBind",
        135 => "MS-RPC",
        137 => "NetBIOS-NS",
        139 => "NetBIOS-SSN",
        143 => "IMAP",
        161 => "SNMP",
        179 => "BGP",
        389 => "LDAP",
        443 => "HTTPS",
        445 => "SMB",
        465 => "SMTPS",
        514 => "Syslog",
        548 => "AFP",
        554 => "RTSP",
        587 => "SMTP-Submission",
        631 => "IPP/CUPS",
        636 => "LDAPS",
        873 => "Rsync",
        902 => "VMware",
        993 => "IMAPS",
        995 => "POP3S",
        1080 => "SOCKS",
        1194 => "OpenVPN",
        1433 => "MS-SQL",
        1434 => "MS-SQL-Monitor",
        1521 => "Oracle-DB",
        1723 => "PPTP",
        1883 => "MQTT",
        1900 => "SSDP/UPnP",
        2049 => "NFS",
        2375 => "Docker-API",
        2376 => "Docker-TLS",
        2181 => "ZooKeeper",
        3000 => "Grafana/Dev",
        3128 => "Squid-Proxy",
        3268 => "LDAP-GC",
        3306 => "MySQL",
        3389 => "RDP",
        3690 => "SVN",
        4443 => "HTTPS-Alt",
        4500 => "IPsec-NAT-T",
        5000 => "UPnP/Flask",
        5060 => "SIP",
        5222 => "XMPP",
        5353 => "mDNS/Bonjour",
        5432 => "PostgreSQL",
        5555 => "ADB",
        5601 => "Kibana",
        5672 => "AMQP/RabbitMQ",
        5900 | 5901 => "VNC",
        5984 => "CouchDB",
        6379 => "Redis",
        6443 => "Kubernetes-API",
        6667 => "IRC",
        7001 => "WebLogic",
        7474 => "Neo4j",
        8000 => "HTTP-Alt",
        8008 => "HTTP-Alt",
        8009 => "AJP",
        8080 => "HTTP-Proxy",
        8081 => "HTTP-Alt",
        8088 => "HTTP-Alt",
        8181 => "HTTP-Alt",
        8443 => "HTTPS-Alt",
        8500 => "Consul",
        8834 => "Nessus",
        8880 => "HTTP-Alt",
        8888 => "HTTP-Alt",
        9000 => "SonarQube",
        9042 => "Cassandra",
        9090 => "Prometheus",
        9091 => "Transmission",
        9100 => "JetDirect",
        9200 => "Elasticsearch",
        9300 => "ES-Transport",
        9418 => "Git",
        9443 => "HTTPS-Alt",
        9999 => "ABYSS",
        10000 => "Webmin",
        10050 => "Zabbix-Agent",
        11211 => "Memcached",
        15672 => "RabbitMQ-Mgmt",
        27017 | 27018 => "MongoDB",
        32400 => "Plex",
        50000 => "Jenkins",
        61616 => "ActiveMQ",
        _ => "Unknown",
    }
}

/// Async TCP connect scan for a single port.
async fn probe_port(ip: &str, port: u16, timeout_ms: u64) -> (u16, bool, f64) {
    let addr = format!("{}:{}", ip, port);
    let start = Instant::now();
    match timeout(Duration::from_millis(timeout_ms), TcpStream::connect(&addr)).await {
        Ok(Ok(_stream)) => {
            let lat = start.elapsed().as_secs_f64() * 1000.0;
            (port, true, lat)
        }
        _ => (port, false, 0.0),
    }
}

/// Scan top ports on a host concurrently.
pub async fn scan_ports(ip: &str, timeout_ms: u64) -> Vec<(u16, f64)> {
    let mut handles = Vec::with_capacity(TOP_PORTS.len());
    for &port in TOP_PORTS {
        let ip_owned = ip.to_string();
        handles.push(tokio::spawn(async move {
            probe_port(&ip_owned, port, timeout_ms).await
        }));
    }

    let mut open_ports = Vec::new();
    for handle in handles {
        if let Ok((port, is_open, lat)) = handle.await {
            if is_open {
                open_ports.push((port, lat));
            }
        }
    }
    open_ports.sort_by_key(|&(p, _)| p);
    open_ports
}

/// Grab service banner from an open TCP port with intelligent HTTP/SSL/SSH probes.
pub async fn grab_banner(ip: &str, port: u16) -> Option<String> {
    let addr = format!("{}:{}", ip, port);
    let connect_result = timeout(Duration::from_millis(1500), TcpStream::connect(&addr)).await;
    let mut stream = match connect_result {
        Ok(Ok(s)) => s,
        _ => return None,
    };

    let is_http_port = matches!(
        port,
        80 | 443 | 3000 | 5000 | 8000 | 8008 | 8080 | 8081 | 8088 | 8181 | 8443 | 8880 | 8888 | 9090 | 9443
    );

    if is_http_port {
        let req = format!("GET / HTTP/1.1\r\nHost: {}\r\nUser-Agent: NetPulse/2.0\r\nAccept: */*\r\nConnection: close\r\n\r\n", ip);
        let _ = stream.write_all(req.as_bytes()).await;
    } else if port == 22 {
        // SSH sends banner automatically upon connect
    } else {
        let _ = stream.write_all(b"\r\n").await;
    }

    let mut buf = vec![0u8; 512];
    match timeout(
        Duration::from_millis(1500),
        stream.read(&mut buf),
    )
    .await
    {
        Ok(Ok(n)) if n > 0 => {
            let banner = String::from_utf8_lossy(&buf[..n])
                .chars()
                .filter(|c| c.is_ascii_graphic() || c.is_ascii_whitespace())
                .take(256)
                .collect::<String>()
                .trim()
                .to_string();
            if banner.is_empty() {
                None
            } else {
                Some(banner)
            }
        }
        _ => None,
    }
}

/// Try fetching SSL Certificate Subject/Common Name on HTTPS ports using openssl s_client.
pub fn get_ssl_cert_cn(ip: &str) -> Option<String> {
    let output = Command::new("openssl")
        .args([
            "s_client",
            "-connect",
            &format!("{}:443", ip),
            "-showcerts",
            "-servername",
            ip,
        ])
        .stdin(std::process::Stdio::null())
        .output()
        .ok()?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        if line.contains("subject=") || line.contains("CN=") {
            if let Some(pos) = line.find("CN=") {
                let rest = &line[pos + 3..];
                let cn = rest.split('/').next().unwrap_or(rest).trim().to_string();
                if !cn.is_empty() && !cn.starts_with('*') {
                    return Some(cn);
                }
            }
        }
    }
    None
}

/// Query NetBIOS name via nmblookup on port 137.
pub fn query_netbios_name(ip: &str) -> Option<String> {
    if let Ok(output) = Command::new("nmblookup").args(["-A", ip]).output() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines() {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 2 && line.contains("<00>") && !line.contains("<GROUP>") {
                let name = parts[0].trim().to_string();
                if !name.is_empty() && name != "MAC" {
                    return Some(name);
                }
            }
        }
    }
    None
}

/// Query mDNS reverse lookup on port 5353 using avahi-resolve.
pub fn query_mdns_hostname(ip: &str) -> Option<String> {
    if let Ok(output) = Command::new("avahi-resolve")
        .args(["-a", ip])
        .output()
    {
        let stdout = String::from_utf8_lossy(&output.stdout);
        let parts: Vec<&str> = stdout.split_whitespace().collect();
        if parts.len() >= 2 {
            let hostname = parts[1].trim().trim_end_matches('.').to_string();
            if !hostname.is_empty() {
                return Some(hostname);
            }
        }
    }
    None
}

/// Measure ICMP latency and extract TTL value from ping response.
pub fn ping_host_info(ip: &str) -> (f64, Option<u8>) {
    let output = match Command::new("ping")
        .args(["-c", "1", "-W", "1", ip])
        .output()
    {
        Ok(o) => String::from_utf8_lossy(&o.stdout).to_string(),
        Err(_) => return (-1.0, None),
    };

    let mut latency = -1.0;
    let mut ttl: Option<u8> = None;

    for line in output.lines() {
        if line.contains("time=") {
            if let Some(start) = line.find("time=") {
                let rest = &line[start + 5..];
                if let Some(end) = rest.find(' ') {
                    let ms_str = rest[..end].trim_end_matches("ms");
                    if let Ok(ms) = ms_str.parse::<f64>() {
                        latency = ms;
                    }
                }
            }
            if let Some(start) = line.find("ttl=") {
                let rest = &line[start + 4..];
                if let Some(end) = rest.find(' ') {
                    if let Ok(val) = rest[..end].parse::<u8>() {
                        ttl = Some(val);
                    }
                }
            }
        }
    }
    (latency, ttl)
}

/// Perform nmap OS detection (if available) or fallback to active TTL + HTTP + NetBIOS heuristics.
pub fn nmap_os_detect(ip: &str, ttl: Option<u8>, banner: Option<&str>) -> String {
    if let Ok(output) = Command::new("nmap")
        .args(["-O", "--osscan-guess", "-T4", "--max-retries", "1", ip])
        .output()
    {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                let trimmed = line.trim();
                if trimmed.starts_with("OS details:") {
                    return trimmed.trim_start_matches("OS details:").trim().to_string();
                }
                if trimmed.starts_with("Aggressive OS guesses:") {
                    let guess = trimmed.trim_start_matches("Aggressive OS guesses:").trim();
                    return guess.split(',').next().unwrap_or(guess).trim().to_string();
                }
            }
        }
    }

    if let Some(b) = banner {
        let bl = b.to_lowercase();
        if bl.contains("ubuntu") {
            return "Ubuntu Linux".to_string();
        }
        if bl.contains("debian") {
            return "Debian Linux".to_string();
        }
        if bl.contains("centos") || bl.contains("red hat") || bl.contains("rhel") {
            return "Red Hat / CentOS Linux".to_string();
        }
        if bl.contains("win64") || bl.contains("windows") || bl.contains("microsoft") {
            return "Windows Operating System".to_string();
        }
        if bl.contains("darwin") || bl.contains("macos") {
            return "Apple macOS".to_string();
        }
        if bl.contains("cisco") {
            return "Cisco IOS".to_string();
        }
        if bl.contains("synology") {
            return "Synology DSM (DiskStation)".to_string();
        }
    }

    if let Some(t) = ttl {
        return guess_os_from_ttl(t).to_string();
    }

    "Linux/Embedded Device".to_string()
}

/// Heuristic OS guess based on TTL value.
pub fn guess_os_from_ttl(ttl: u8) -> &'static str {
    match ttl {
        0..=32 => "Embedded/IoT Device",
        33..=64 => "Linux / Android / macOS",
        65..=128 => "Windows 10/11 / Windows Server",
        129..=255 => "Network Infrastructure (Router/Switch)",
    }
}

/// Perform ARP scan using arp-scan for L2 discovery.
pub fn arp_scan_subnet(subnet: &str) -> Vec<DiscoveredHost> {
    let output = Command::new("arp-scan")
        .args(["--localnet", "--interface", "auto", "--retry", "2", subnet])
        .output();

    let mut hosts = Vec::new();
    match output {
        Ok(o) => {
            let stdout = String::from_utf8_lossy(&o.stdout);
            for line in stdout.lines() {
                let parts: Vec<&str> = line.split('\t').collect();
                if parts.len() >= 2 {
                    let ip = parts[0].trim();
                    let mac = parts[1].trim().to_lowercase();
                    if ip.contains('.') && mac.contains(':') {
                        hosts.push(DiscoveredHost {
                            ip: ip.to_string(),
                            mac: Some(mac),
                            latency_ms: 0.0,
                            ttl: None,
                            hostname: None,
                        });
                    }
                }
            }
        }
        Err(e) => {
            eprintln!("[arp-scan] Note: {}", e);
        }
    }
    hosts
}

/// Perform ping sweep using nmap for host discovery.
pub fn nmap_ping_sweep(subnet: &str) -> Vec<DiscoveredHost> {
    let output = Command::new("nmap")
        .args(["-sn", "-T4", "--max-retries", "1", subnet])
        .output();

    let mut hosts = Vec::new();
    match output {
        Ok(o) if o.status.success() => {
            let stdout = String::from_utf8_lossy(&o.stdout);
            let mut current_ip: Option<String> = None;
            let mut current_mac: Option<String> = None;
            let mut current_latency: f64 = 0.0;

            for line in stdout.lines() {
                let trimmed = line.trim();
                if trimmed.starts_with("Nmap scan report for") {
                    if let Some(ip) = current_ip.take() {
                        hosts.push(DiscoveredHost {
                            ip,
                            mac: current_mac.take(),
                            latency_ms: current_latency,
                            ttl: None,
                            hostname: None,
                        });
                    }
                    let ip_part = trimmed.trim_start_matches("Nmap scan report for ").to_string();
                    if let Some(start) = ip_part.find('(') {
                        let ip = ip_part[start + 1..].trim_end_matches(')').to_string();
                        current_ip = Some(ip);
                    } else {
                        current_ip = Some(ip_part);
                    }
                    current_latency = 0.0;
                    current_mac = None;
                } else if trimmed.starts_with("MAC Address:") {
                    let mac_part = trimmed.trim_start_matches("MAC Address: ");
                    if let Some(mac) = mac_part.split_whitespace().next() {
                        current_mac = Some(mac.to_lowercase());
                    }
                } else if trimmed.contains("latency") {
                    if let Some(start) = trimmed.find('(') {
                        let inner = &trimmed[start + 1..];
                        if let Some(s_pos) = inner.find('s') {
                            let lat_str = &inner[..s_pos];
                            if let Ok(lat) = lat_str.trim().parse::<f64>() {
                                current_latency = lat * 1000.0;
                            }
                        }
                    }
                }
            }
            if let Some(ip) = current_ip {
                hosts.push(DiscoveredHost {
                    ip,
                    mac: current_mac,
                    latency_ms: current_latency,
                    ttl: None,
                    hostname: None,
                });
            }
        }
        _ => {}
    }
    hosts
}

/// Measure latency to a host.
pub async fn measure_latency(ip: &str) -> f64 {
    let (lat, _) = ping_host_info(ip);
    if lat > 0.0 {
        return lat;
    }

    let common_ports = [80, 443, 22, 53, 8080];
    for &port in &common_ports {
        let addr = format!("{}:{}", ip, port);
        let start = Instant::now();
        if let Ok(Ok(_)) = timeout(Duration::from_millis(300), TcpStream::connect(&addr)).await {
            return start.elapsed().as_secs_f64() * 1000.0;
        }
    }
    1.0
}
