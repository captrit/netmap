use serde::{Deserialize, Serialize};

/// Represents a single open port with service identification.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenPort {
    pub port: u16,
    pub service: String,
    pub protocol: String,
    pub state: String,
    /// Banner string grabbed from the service (if available).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub banner: Option<String>,
    /// Detected service version from banner analysis.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    /// True only when a web app was actually confirmed — a captured banner
    /// literally starting with "HTTP/", or a successfully fetched TLS
    /// certificate on a conventional HTTPS port. Never set from port
    /// number alone.
    #[serde(default, rename = "isWeb", skip_serializing_if = "std::ops::Not::not")]
    pub is_web: bool,
    /// Direct browser-openable URL (ip:port), present only when is_web.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
}

/// Represents a discovered network node (host/device/container/interface).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkNode {
    pub id: String,
    pub label: String,
    pub ip: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mac: Option<String>,
    pub category: String,
    pub device_type: String,
    #[serde(default)]
    pub is_self: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vendor: Option<String>,
    pub latency_ms: f64,
    pub status: String,
    pub ports: Vec<OpenPort>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub interface: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub os: Option<String>,
    pub last_seen: String,
    /// TTL value from ICMP/TCP response — used for OS fingerprinting.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ttl: Option<u8>,
    /// Hostname resolved via reverse DNS.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hostname: Option<String>,
    /// Confidence score 0-100 for device identification accuracy.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub confidence: Option<u8>,
    /// Security-relevant findings backed by an actual verification probe
    /// (never a guess): e.g. "ftp-anonymous-login", "smb-open-share:backup",
    /// "domain-controller-candidate", "global-catalog", "ldaps".
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub roles: Vec<String>,
    /// How many pivot hops away this node was found (0 = directly scanned
    /// from this host). Present only for nodes discovered via `--pivot`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hop: Option<u8>,
    /// IP of the pivot host this node was reached through, if any.
    #[serde(skip_serializing_if = "Option::is_none", rename = "viaPivot")]
    pub via_pivot: Option<String>,
}

/// A directional link between two nodes in the topology.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkLink {
    pub source: String,
    pub target: String,
    #[serde(rename = "type")]
    pub link_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latency_ms: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
}

/// Summary statistics for a completed scan.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanSummary {
    pub total_hosts: usize,
    pub online_hosts: usize,
    pub gateways_count: usize,
    pub docker_count: usize,
    pub vpn_count: usize,
    pub avg_latency_ms: f64,
    pub open_ports_count: usize,
    pub subnets_scanned: Vec<String>,
    pub scan_duration_ms: f64,
    pub timestamp: String,
    /// Actionable notices about degraded scan conditions (e.g. missing
    /// CAP_NET_RAW) that reduce device coverage/accuracy for this run.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub warnings: Vec<String>,
}

/// Top-level scan result output — JSON to stdout.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanResult {
    pub summary: ScanSummary,
    pub nodes: Vec<NetworkNode>,
    pub links: Vec<NetworkLink>,
}

/// A detected network interface on the scanning host.
#[derive(Debug, Clone)]
pub struct NetInterface {
    pub name: String,
    pub ip: String,
    pub cidr: String,
    pub mac: String,
    #[allow(dead_code)]
    pub is_up: bool,
    pub if_type: InterfaceType,
}

/// Classification of network interface types.
#[derive(Debug, Clone, PartialEq)]
pub enum InterfaceType {
    Ethernet,
    Wifi,
    Docker,
    Vpn,
    Loopback,
    Unknown,
}

impl InterfaceType {
    pub fn as_str(&self) -> &str {
        match self {
            InterfaceType::Ethernet => "ethernet",
            InterfaceType::Wifi => "wifi",
            InterfaceType::Docker => "docker",
            InterfaceType::Vpn => "vpn",
            InterfaceType::Loopback => "loopback",
            InterfaceType::Unknown => "ethernet",
        }
    }
}

/// A discovered host from ARP/ping sweep before deep probing.
#[derive(Debug, Clone)]
pub struct DiscoveredHost {
    pub ip: String,
    pub mac: Option<String>,
    pub latency_ms: f64,
    pub ttl: Option<u8>,
    pub hostname: Option<String>,
}
