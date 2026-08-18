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

/// Second-tier port list — only swept on hosts that already answered on at
/// least one TOP_PORTS port, so full-subnet scans stay fast while still
/// going genuinely deep on anything that's actually alive and listening.
pub const DEEP_PORTS: &[u16] = &[
    20, 26, 37, 43, 70, 79, 88, 106, 113, 119, 123, 158, 194, 199, 220, 259,
    264, 302, 311, 366, 407, 416, 425, 427, 444, 458, 464, 481, 497, 500,
    502, 512, 513, 520, 524, 541, 543, 544, 546, 547, 556, 560, 561, 563,
    591, 593, 600, 601, 606, 623, 626, 628, 631, 646, 647, 648, 651, 664,
    691, 700, 705, 711, 712, 720, 722, 749, 750, 765, 767, 808, 843, 847,
    848, 853, 860, 861, 873, 888, 898, 901, 989, 990, 992, 995, 1000,
    1010, 1024, 1025, 1026, 1027, 1028, 1029, 1030, 1035, 1040, 1044,
    1048, 1050, 1058, 1059, 1064, 1065, 1066, 1069, 1071, 1074, 1076,
    1102, 1104, 1105, 1106, 1107, 1108, 1110, 1111, 1112, 1113, 1114,
    1117, 1119, 1121, 1122, 1123, 1124, 1126, 1130, 1131, 1132, 1137,
    1138, 1141, 1145, 1147, 1148, 1149, 1151, 1152, 1154, 1163, 1164,
    1165, 1166, 1170, 1172, 1174, 1175, 1183, 1185, 1186, 1187, 1192,
    1198, 1199, 1201, 1213, 1216, 1217, 1218, 1233, 1234, 1236, 1244,
    1247, 1248, 1259, 1271, 1272, 1277, 1287, 1296, 1300, 1301, 1309,
    1310, 1311, 1322, 1328, 1358, 1382, 1417, 1433, 1455, 1461, 1494,
    1500, 1501, 1503, 1533, 1580, 1583, 1594, 1600, 1717, 1718, 1719,
    1720, 1721, 1755, 1761, 1782, 1783, 1801, 1805, 1812, 1839, 1840,
    1862, 1863, 1864, 1875, 1900, 1914, 1935, 1947, 1971, 1972, 1974,
    1984, 1998, 2000, 2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008,
    2009, 2010, 2013, 2020, 2021, 2022, 2030, 2033, 2034, 2035, 2038,
    2040, 2041, 2042, 2043, 2045, 2046, 2047, 2048, 2065, 2068, 2099,
    2100, 2103, 2105, 2106, 2107, 2111, 2119, 2121, 2126, 2135, 2144,
    2160, 2161, 2170, 2179, 2190, 2191, 2196, 2200, 2222, 2251, 2260,
    2288, 2301, 2323, 2366, 2381, 2382, 2383, 2393, 2394, 2399, 2401,
    2492, 2500, 2522, 2525, 2557, 2601, 2602, 2604, 2605, 2607, 2608,
    2638, 2701, 2702, 2710, 2717, 2718, 2725, 2800, 2809, 2811, 2869,
    2875, 2909, 2910, 2920, 2967, 2968, 2998, 3005, 3006, 3007, 3011,
    3013, 3017, 3030, 3031, 3052, 3071, 3077, 3080, 3103, 3106, 3130,
    3141, 3168, 3211, 3221, 3260, 3261, 3269, 3283, 3300, 3301, 3323,
    3325, 3333, 3351, 3367, 3369, 3370, 3371, 3372, 3389, 3404, 3476,
    3493, 3517, 3527, 3546, 3551, 3580, 3659, 3689, 3703, 3737, 3766,
    3784, 3800, 3801, 3809, 3814, 3826, 3827, 3828, 3851, 3869, 3871,
    3878, 3880, 3889, 3905, 3914, 3918, 3920, 3945, 3971, 3986, 3995,
    3998, 4000, 4001, 4002, 4003, 4004, 4005, 4006, 4045, 4111, 4125,
    4126, 4129, 4224, 4242, 4279, 4321, 4343, 4443, 4444, 4445, 4446,
    4449, 4550, 4600, 4658, 4660, 4665, 4675, 4732, 4747, 4750, 4767,
    4848, 4899, 4900, 4998, 5002, 5003, 5004, 5009, 5030, 5033, 5050,
    5051, 5054, 5080, 5087, 5100, 5101, 5102, 5120, 5190, 5200, 5214,
    5221, 5225, 5226, 5269, 5280, 5298, 5357, 5405, 5414, 5431, 5440,
    5500, 5510, 5544, 5550, 5555, 5560, 5566, 5631, 5633, 5666, 5678,
    5679, 5718, 5730, 5800, 5801, 5802, 5810, 5811, 5815, 5822, 5825,
    5850, 5859, 5862, 5877, 5900, 5901, 5902, 5903, 5920, 5925, 5959,
    5960, 5961, 5962, 5963, 5987, 5988, 5989, 5998, 6001, 6002, 6003,
    6004, 6005, 6006, 6007, 6009, 6025, 6059, 6100, 6101, 6106, 6112,
    6123, 6129, 6156, 6346, 6389, 6502, 6503, 6510, 6543, 6547, 6548,
    6558, 6566, 6588, 6621, 6666, 6668, 6669, 6689, 6692, 6699, 6779,
    6788, 6789, 6792, 6839, 6881, 6901, 6969, 7000, 7002, 7004, 7007,
    7019, 7025, 7070, 7100, 7103, 7106, 7200, 7201, 7402, 7435, 7443,
    7496, 7512, 7625, 7627, 7676, 7741, 7777, 7778, 7800, 7911, 7920,
    7921, 7937, 7938, 7999, 8002, 8007, 8010, 8011, 8014, 8015, 8016,
    8021, 8022, 8025, 8032, 8040, 8082, 8083, 8084, 8085, 8086, 8087,
    8089, 8090, 8093, 8099, 8100, 8180, 8200, 8222, 8254, 8290, 8291,
    8292, 8300, 8383, 8400, 8402, 8443, 8600, 8649, 8651, 8652, 8654,
    8701, 8873, 8899, 8994, 9001, 9002, 9003, 9009, 9010, 9011, 9040,
    9050, 9071, 9080, 9081, 9099, 9110, 9111, 9119, 9191, 9207, 9220,
    9290, 9415, 9418, 9485, 9500, 9502, 9503, 9535, 9575, 9593, 9594,
    9595, 9600, 9612, 9700, 9711, 9800, 9801, 9802, 9875, 9898, 9917,
    9929, 9943, 9944, 9968, 9998, 10001, 10002, 10003, 10004, 10009,
    10010, 10012, 10024, 10025, 10082, 10180, 10215, 10243, 10566,
    10616, 10617, 10621, 10626, 10628, 10629, 10778, 11110, 11111,
    11967, 12000, 12174, 12265, 12345, 13456, 13722, 13782, 13783,
    14000, 14238, 14441, 14442, 15000, 15002, 15003, 15660, 15742,
    16000, 16001, 16012, 16016, 16018, 16080, 16113, 16992, 16993,
    17877, 17988, 18040, 18101, 18988, 19101, 19283, 19315, 19350,
    19780, 19801, 19842, 20000, 20005, 20031, 20221, 20222, 20828,
    21571, 22939, 23502, 24444, 24800, 25734, 25735, 26214, 27000,
    27352, 27353, 27355, 27356, 27715, 28201, 30000, 30718, 30951,
    31038, 31337, 32768, 32769, 32770, 32771, 32772, 32773, 32774,
    32775, 32776, 32777, 32778, 32779, 32780, 32781, 32782, 32783,
    33354, 33899, 34571, 34572, 34573, 35500, 38292, 40193, 40911,
    41511, 42510, 44176, 44442, 44443, 44501, 45100, 47808, 48080,
    49152, 49153, 49154, 49155, 49156, 49157, 49158, 49159, 49160,
    49161, 49163, 49165, 49167, 49175, 49176, 49400, 49999, 50001,
    50002, 50003, 50006, 50300, 50389, 50500, 50636, 50800, 51103,
    51493, 52673, 52822, 52848, 52869, 54045, 54328, 55055, 55056,
    55555, 55600, 56737, 56738, 57294, 57797, 58080, 60020, 60443,
    61532, 61900, 62078, 63331, 64623, 64680, 65000, 65129, 65389,
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

/// Scan a given port list on a host concurrently.
pub async fn scan_port_list(ip: &str, timeout_ms: u64, ports: &[u16]) -> Vec<(u16, f64)> {
    let mut handles = Vec::with_capacity(ports.len());
    for &port in ports {
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

/// Scan the fast TOP_PORTS tier on a host concurrently.
pub async fn scan_ports(ip: &str, timeout_ms: u64) -> Vec<(u16, f64)> {
    scan_port_list(ip, timeout_ms, TOP_PORTS).await
}

/// Second-pass deep sweep — only worth calling on hosts that already
/// answered on at least one TOP_PORTS port. Excludes ports the fast sweep
/// already found so callers can just append the results.
pub async fn scan_deep_ports(ip: &str, timeout_ms: u64, already_open: &[u16]) -> Vec<(u16, f64)> {
    let remaining: Vec<u16> = DEEP_PORTS
        .iter()
        .copied()
        .filter(|p| !already_open.contains(p))
        .collect();
    scan_port_list(ip, timeout_ms, &remaining).await
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

    // HTTP responses need a bigger read/keep window than a one-line SSH/SMTP
    // banner — the <title> tag that feeds device-type fingerprinting is
    // often a few hundred bytes into the response, past a short cap.
    let buf_size = if is_http_port { 4096 } else { 512 };
    let keep_chars = if is_http_port { 1024 } else { 256 };

    let mut buf = vec![0u8; buf_size];
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
                .take(keep_chars)
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

/// Pull the `<title>` out of an HTTP response banner (grab_banner already
/// captured it, this just extracts it) — reliably IDs router/NAS/printer
/// web UIs ("RouterOS", "Synology DSM", printer model pages, etc).
pub fn extract_http_title(banner: &str) -> Option<String> {
    let lower = banner.to_lowercase();
    let start = lower.find("<title>")? + "<title>".len();
    let end = lower[start..].find("</title>")? + start;
    let title = banner[start..end].trim();
    if title.is_empty() {
        None
    } else {
        Some(title.chars().take(120).collect())
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
    // 2 attempts (not 1) — a single dropped WiFi packet shouldn't flip a
    // real, already-discovered host to "unconfirmed" this late in the scan.
    let output = match Command::new("ping")
        .args(["-c", "2", "-i", "0.3", "-W", "1", ip])
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

    // No nmap result, no banner keyword, no TTL — say so plainly rather
    // than defaulting to a specific-sounding guess like "Embedded Device"
    // that downstream device-type scoring would mistake for real evidence.
    "Unknown (no TTL/banner data)".to_string()
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
    // Two bugs lived here, both silently reducing every arp-scan call to an
    // instant no-op regardless of privilege: (1) arp-scan has no "auto"
    // sentinel for --interface — it tries to open a device literally named
    // "auto" and fails with "No such device exists". Omitting --interface
    // entirely is what actually triggers arp-scan's real auto-detection
    // (documented: picks the lowest-numbered up interface). (2) --localnet
    // derives its target range from the interface's own config and flatly
    // refuses to also be given an explicit subnet ("You can not specify
    // targets with the --localnet option") — since we already have the
    // subnet we want to scan, --localnet doesn't apply here at all.
    let output = Command::new("arp-scan")
        .args(["--retry", "2", subnet])
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

/// Full-subnet ICMP sweep using the system `ping` binary instead of raw
/// sockets. `arp-scan` and `nmap -sn` both need CAP_NET_RAW to do their
/// normal job; without it they silently find nothing and the scanner
/// under-reports real devices. The `ping` binary is typically
/// setuid/capable at the OS package level regardless of what privilege
/// *this* process has, so shelling out to it is a reliable fallback
/// discovery path that works the same whether or not the scanner itself
/// has elevated privileges.
pub async fn ping_sweep_subnet(cidr: &str) -> Vec<DiscoveredHost> {
    let network: ipnetwork::Ipv4Network = match cidr.parse() {
        Ok(n) => n,
        Err(_) => return Vec::new(),
    };

    // Keep sweeps fast and considerate — cap at a /22 worth of addresses.
    if network.size() > 1024 {
        return Vec::new();
    }

    // Lower concurrency than a pure "how fast can we go" sweep would use —
    // hammering a home AP with hundreds of simultaneous pings causes it to
    // drop packets under its own load, which reads back as false negatives
    // (device looks offline when it isn't). Three probes per host (with a
    // short gap) also survive a single dropped WiFi packet, which a lone
    // `-c 1` attempt cannot — that single-attempt version was the direct
    // cause of real devices going undetected.
    let sem = std::sync::Arc::new(tokio::sync::Semaphore::new(40));
    let mut handles = Vec::new();

    for ip in network.iter() {
        if ip == network.network() || ip == network.broadcast() {
            continue;
        }
        let ip_str = ip.to_string();
        let permit = sem.clone();
        handles.push(tokio::spawn(async move {
            let _permit = permit.acquire_owned().await.ok();
            // `ping -c 3` succeeds (exit 0) if ANY of the 3 probes gets a
            // reply — not all three — so this is pure recall improvement,
            // not 3x the wait on hosts that were already answering fine.
            let output = tokio::process::Command::new("ping")
                .args(["-c", "3", "-i", "0.3", "-W", "1", &ip_str])
                .output()
                .await
                .ok()?;
            if !output.status.success() {
                return None;
            }

            let stdout = String::from_utf8_lossy(&output.stdout);
            let mut latency = 1.0;
            let mut ttl: Option<u8> = None;
            for line in stdout.lines() {
                if line.contains("time=") {
                    if let Some(start) = line.find("time=") {
                        let rest = &line[start + 5..];
                        if let Some(end) = rest.find(' ') {
                            if let Ok(ms) = rest[..end].trim_end_matches("ms").parse::<f64>() {
                                latency = ms;
                            }
                        }
                    }
                    if let Some(start) = line.find("ttl=") {
                        let rest = &line[start + 4..];
                        if let Some(end) = rest.find(' ') {
                            ttl = rest[..end].parse::<u8>().ok();
                        }
                    }
                }
            }

            Some(DiscoveredHost {
                ip: ip_str,
                mac: None,
                latency_ms: latency,
                ttl,
                hostname: None,
            })
        }));
    }

    let mut discovered = Vec::new();
    for h in handles {
        if let Ok(Some(host)) = h.await {
            discovered.push(host);
        }
    }
    discovered
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

/// Attempt an anonymous FTP login (USER anonymous / PASS anonymous@) — a
/// real misconfiguration check, not a guess: a 230 response means the
/// server actually accepted an anonymous session.
pub async fn check_ftp_anonymous(ip: &str) -> bool {
    let addr = format!("{}:21", ip);
    let mut stream = match timeout(Duration::from_millis(1500), TcpStream::connect(&addr)).await {
        Ok(Ok(s)) => s,
        _ => return false,
    };

    let mut discard = vec![0u8; 512];
    let _ = timeout(Duration::from_millis(1000), stream.read(&mut discard)).await;

    if stream.write_all(b"USER anonymous\r\n").await.is_err() {
        return false;
    }
    let _ = timeout(Duration::from_millis(1000), stream.read(&mut discard)).await;

    if stream.write_all(b"PASS anonymous@example.com\r\n").await.is_err() {
        return false;
    }
    let mut resp_buf = vec![0u8; 256];
    let n = match timeout(Duration::from_millis(1500), stream.read(&mut resp_buf)).await {
        Ok(Ok(n)) if n > 0 => n,
        _ => return false,
    };
    let resp = String::from_utf8_lossy(&resp_buf[..n]);
    resp.trim_start().starts_with("230")
}

/// List SMB shares via an unauthenticated (`-N`) `smbclient -L` listing —
/// only reports what a null/anonymous session can actually see, no
/// guessing. Returns None if `smbclient` isn't installed or the host
/// refuses the listing (most well-configured hosts will refuse — that's
/// the expected/good outcome, not an error).
pub fn smb_list_shares(ip: &str) -> Option<Vec<String>> {
    let output = Command::new("smbclient")
        .args(["-L", &format!("//{}", ip), "-N", "-g", "--connect-timeout=3"])
        .output()
        .ok()?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut shares = Vec::new();
    for line in stdout.lines() {
        let parts: Vec<&str> = line.split('|').collect();
        if parts.len() >= 2 && matches!(parts[0], "Disk" | "IPC" | "Printer") {
            let name = parts[1].trim();
            if !name.is_empty() && !name.ends_with('$') {
                shares.push(name.to_string());
            }
        }
    }
    if shares.is_empty() {
        None
    } else {
        Some(shares)
    }
}

/// Hand-built SNMPv1 GetRequest for sysDescr (OID 1.3.6.1.2.1.1.1.0),
/// community "public". Bytes are constant since neither the OID nor the
/// community string vary per host, so there's no need to build this with a
/// full ASN.1/BER encoder for one fixed query.
const SNMP_SYSDESCR_REQUEST: &[u8] = &[
    0x30, 0x26, // SEQUENCE, len 38 — full message
    0x02, 0x01, 0x00, // INTEGER version = 0 (SNMPv1)
    0x04, 0x06, b'p', b'u', b'b', b'l', b'i', b'c', // OCTET STRING "public"
    0xa0, 0x19, // GetRequest PDU, len 25
    0x02, 0x01, 0x01, // request-id = 1
    0x02, 0x01, 0x00, // error-status = 0
    0x02, 0x01, 0x00, // error-index = 0
    0x30, 0x0e, // varbind-list SEQUENCE, len 14
    0x30, 0x0c, // varbind SEQUENCE, len 12
    0x06, 0x08, 0x2b, 0x06, 0x01, 0x02, 0x01, 0x01, 0x01, 0x00, // OID sysDescr
    0x05, 0x00, // value NULL
];

/// Decode a BER length field starting at `pos`. Returns (length, bytes_consumed).
fn ber_read_len(buf: &[u8], pos: usize) -> Option<(usize, usize)> {
    let first = *buf.get(pos)?;
    if first & 0x80 == 0 {
        Some((first as usize, 1))
    } else {
        let n = (first & 0x7f) as usize;
        if n == 0 || n > 4 || pos + 1 + n > buf.len() {
            return None;
        }
        let mut len = 0usize;
        for i in 0..n {
            len = (len << 8) | buf[pos + 1 + i] as usize;
        }
        Some((len, 1 + n))
    }
}

/// Query a host's SNMP sysDescr (UDP/161, community "public"). This is the
/// single most reliable fingerprint oracle available for routers, switches,
/// printers, UPS, and other managed network gear — most consumer/office
/// devices with SNMP enabled at all use the "public" default community.
pub async fn snmp_get_sysdescr(ip: &str) -> Option<String> {
    let socket = tokio::net::UdpSocket::bind("0.0.0.0:0").await.ok()?;
    let addr = format!("{}:161", ip);
    socket.connect(&addr).await.ok()?;
    socket.send(SNMP_SYSDESCR_REQUEST).await.ok()?;

    let mut buf = vec![0u8; 1024];
    let n = timeout(Duration::from_millis(600), socket.recv(&mut buf))
        .await
        .ok()?
        .ok()?;
    let resp = &buf[..n];

    // Find the sysDescr OID bytes in the response, then read the value TLV
    // that immediately follows it (tag 0x04 = OCTET STRING for sysDescr).
    let oid_marker: &[u8] = &[0x2b, 0x06, 0x01, 0x02, 0x01, 0x01, 0x01, 0x00];
    let oid_pos = resp
        .windows(oid_marker.len())
        .position(|w| w == oid_marker)?;
    let value_start = oid_pos + oid_marker.len();
    if resp.get(value_start) != Some(&0x04) {
        return None;
    }
    let (len, len_bytes) = ber_read_len(resp, value_start + 1)?;
    let str_start = value_start + 1 + len_bytes;
    if str_start + len > resp.len() {
        return None;
    }

    let desc = String::from_utf8_lossy(&resp[str_start..str_start + len])
        .chars()
        .filter(|c| c.is_ascii_graphic() || c.is_ascii_whitespace())
        .take(200)
        .collect::<String>()
        .trim()
        .to_string();

    if desc.is_empty() {
        None
    } else {
        Some(desc)
    }
}
