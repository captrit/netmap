//! Active pivot testing: given credentials you already hold on a second
//! host (`--pivot user@host`), open a local SSH dynamic SOCKS5 tunnel to
//! it, ask that host over the same session what else it can reach (routes
//! + neighbor table), then verify liveness/open-ports on those targets by
//! routing TCP connects through the tunnel from here.
//!
//! Deliberately NOT included: credential brute-forcing, exploit-based
//! lateral movement, or touching hosts you don't already have legitimate
//! access to. This only extends visibility through access you already
//! hold — same spirit as the rest of this recon tool.

use crate::probes::TOP_PORTS;
use std::net::Ipv4Addr;
use std::process::Stdio;
use std::str::FromStr;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::process::{Child, Command};
use tokio::time::{timeout, Duration};

pub struct PivotTunnel {
    child: Child,
    pub local_port: u16,
}

/// Kills the backgrounded `ssh -D` tunnel automatically — a scan that
/// errors out partway through must never leave a stray SOCKS proxy running.
impl Drop for PivotTunnel {
    fn drop(&mut self) {
        let _ = self.child.start_kill();
    }
}

/// Open a dynamic SOCKS5 tunnel via the system `ssh` binary. Agent/key auth
/// only — never prompts for or stores a password. `target` is `user@host`
/// or `user@host:port`; the caller must already be authorized on it.
pub async fn open_tunnel(target: &str, identity: Option<&str>) -> Result<PivotTunnel, String> {
    let local_port: u16 = 12000 + (std::process::id() % 4000) as u16;

    let mut args: Vec<String> = vec![
        "-N".into(),
        "-o".into(), "BatchMode=yes".into(),
        "-o".into(), "StrictHostKeyChecking=accept-new".into(),
        "-o".into(), "ExitOnForwardFailure=yes".into(),
        "-o".into(), "ConnectTimeout=8".into(),
        "-D".into(), local_port.to_string(),
    ];
    if let Some(key) = identity {
        args.push("-i".into());
        args.push(key.into());
    }
    args.push(target.into());

    let child = Command::new("ssh")
        .args(&args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("failed to spawn ssh: {}", e))?;

    let mut tunnel = PivotTunnel { child, local_port };

    if !wait_for_ready(local_port, Duration::from_secs(8)).await {
        return Err(format!(
            "SOCKS tunnel to {} did not come up (check auth/connectivity)",
            target
        ));
    }
    let _ = &mut tunnel; // keep child alive in the returned struct
    Ok(tunnel)
}

async fn wait_for_ready(port: u16, deadline: Duration) -> bool {
    let start = tokio::time::Instant::now();
    while start.elapsed() < deadline {
        if TcpStream::connect(("127.0.0.1", port)).await.is_ok() {
            return true;
        }
        tokio::time::sleep(Duration::from_millis(200)).await;
    }
    false
}

/// One remote-side interfaces/routes/neighbors dump, pulled over the same
/// SSH session — this is the *only* way to learn what a second host can
/// see, since ARP/ICMP don't tunnel through a SOCKS proxy (TCP/UDP CONNECT
/// only). All liveness verification of what this reveals still happens
/// from our side, through the tunnel — this step is just "ask it what it
/// knows", not a scan performed by the remote host.
pub async fn remote_enumerate(target: &str, identity: Option<&str>) -> Option<RemoteInfo> {
    let mut args: Vec<String> = vec![
        "-o".into(), "BatchMode=yes".into(),
        "-o".into(), "StrictHostKeyChecking=accept-new".into(),
        "-o".into(), "ConnectTimeout=8".into(),
    ];
    if let Some(key) = identity {
        args.push("-i".into());
        args.push(key.into());
    }
    args.push(target.into());
    args.push(
        "ip -o -4 addr show; echo ---ARP---; (ip neighbor show || arp -an); echo ---ROUTE---; ip route show"
            .into(),
    );

    let output = Command::new("ssh").args(&args).output().await.ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout).to_string();
    Some(parse_remote_info(&text))
}

pub struct RemoteInfo {
    /// (interface name, CIDR) directly connected on the remote host.
    pub subnets: Vec<(String, String)>,
    /// (ip, mac) the remote host currently has ARP/neighbor entries for.
    pub neighbors: Vec<(String, String)>,
}

fn parse_remote_info(text: &str) -> RemoteInfo {
    let mut subnets = Vec::new();
    let mut neighbors = Vec::new();
    let mut section = 0u8;

    for line in text.lines() {
        if line.trim() == "---ARP---" {
            section = 1;
            continue;
        }
        if line.trim() == "---ROUTE---" {
            section = 2;
            continue;
        }

        if section == 0 {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 4 && parts[2] == "inet" {
                let name = parts[1].trim_end_matches(':').to_string();
                subnets.push((name, parts[3].to_string()));
            }
        } else if section == 1 {
            // `ip neighbor show` style: "<ip> dev <dev> lladdr <mac> <state>"
            let parts: Vec<&str> = line.split_whitespace().collect();
            if let Some(pos) = parts.iter().position(|&p| p == "lladdr") {
                if let (Some(ip), Some(mac)) = (parts.first(), parts.get(pos + 1)) {
                    if Ipv4Addr::from_str(ip).is_ok() {
                        neighbors.push((ip.to_string(), mac.to_lowercase()));
                    }
                }
            } else if line.contains('(') && line.contains("at ") {
                // BSD/macOS `arp -an` style: "? (1.2.3.4) at aa:bb:cc:dd:ee:ff on ..."
                if let (Some(ip_start), Some(ip_end)) = (line.find('('), line.find(')')) {
                    let ip = &line[ip_start + 1..ip_end];
                    if let Some(at_pos) = line.find("at ") {
                        let rest = &line[at_pos + 3..];
                        if let Some(mac) = rest.split_whitespace().next() {
                            if Ipv4Addr::from_str(ip).is_ok() && mac.contains(':') {
                                neighbors.push((ip.to_string(), mac.to_lowercase()));
                            }
                        }
                    }
                }
            }
        }
        // section == 2 (routes) intentionally unused for now — directly
        // connected interface subnets already cover the common pivot case.
    }

    RemoteInfo { subnets, neighbors }
}

/// Minimal SOCKS5 CONNECT handshake (no-auth) — hand-rolled instead of
/// pulling in a crate, since this is the one thing we need a SOCKS client
/// for. Returns the connected stream on success (rep byte 0x00).
async fn socks5_connect(
    proxy_port: u16,
    target: Ipv4Addr,
    target_port: u16,
) -> Option<TcpStream> {
    let mut stream = TcpStream::connect(("127.0.0.1", proxy_port)).await.ok()?;

    stream.write_all(&[0x05, 0x01, 0x00]).await.ok()?;
    let mut method_resp = [0u8; 2];
    stream.read_exact(&mut method_resp).await.ok()?;
    if method_resp != [0x05, 0x00] {
        return None;
    }

    let mut req = vec![0x05, 0x01, 0x00, 0x01];
    req.extend_from_slice(&target.octets());
    req.extend_from_slice(&target_port.to_be_bytes());
    stream.write_all(&req).await.ok()?;

    let mut resp_head = [0u8; 4];
    stream.read_exact(&mut resp_head).await.ok()?;
    if resp_head[1] != 0x00 {
        return None; // non-zero rep = connection failed/refused/filtered
    }
    // Drain the bound-address portion of the reply (IPv4 + port = 6 bytes;
    // other ATYPs aren't expected from a same-process ssh -D proxy).
    let mut trailer = [0u8; 6];
    let _ = stream.read_exact(&mut trailer).await;

    Some(stream)
}

/// TCP-connect port scan of a target IP, routed through the SOCKS tunnel.
/// This is the pivoted equivalent of `probes::scan_ports` — ICMP can't
/// tunnel through SOCKS, so liveness here is TCP-evidence only.
pub async fn scan_ports_via_pivot(proxy_port: u16, ip: &str, timeout_ms: u64) -> Vec<u16> {
    let target = match Ipv4Addr::from_str(ip) {
        Ok(a) => a,
        Err(_) => return Vec::new(),
    };

    let mut handles = Vec::with_capacity(TOP_PORTS.len());
    for &port in TOP_PORTS {
        handles.push(tokio::spawn(async move {
            let ok = timeout(
                Duration::from_millis(timeout_ms),
                socks5_connect(proxy_port, target, port),
            )
            .await
            .ok()
            .flatten()
            .is_some();
            (port, ok)
        }));
    }

    let mut open = Vec::new();
    for h in handles {
        if let Ok((port, true)) = h.await {
            open.push(port);
        }
    }
    open.sort_unstable();
    open
}
