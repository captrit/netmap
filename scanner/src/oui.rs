use std::collections::HashMap;
use std::fs;
use std::path::Path;

/// IEEE OUI vendor lookup from system manuf files or bundled fallback.
/// Time: O(1) HashMap lookup. Space: O(n) where n = OUI entries loaded.
pub struct OuiDatabase {
    db: HashMap<String, String>,
}

impl OuiDatabase {
    pub fn load() -> Self {
        let mut db = HashMap::new();

        // Try system nmap manuf file first, then Wireshark, then /usr/share
        let paths = [
            "/usr/share/nmap/nmap-mac-prefixes",
            "/usr/share/wireshark/manuf",
            "/usr/share/ieee-data/oui.txt",
            "/usr/local/share/nmap/nmap-mac-prefixes",
        ];

        for path in &paths {
            if Path::new(path).exists() {
                if let Ok(contents) = fs::read_to_string(path) {
                    Self::parse_manuf_file(&contents, &mut db);
                    if !db.is_empty() {
                        eprintln!("[oui] Loaded {} vendors from {}", db.len(), path);
                        return Self { db };
                    }
                }
            }
        }

        // Minimal fallback — only for very common vendors
        eprintln!("[oui] No system OUI database found, using minimal fallback");
        Self::load_minimal_fallback(&mut db);
        Self { db }
    }

    fn parse_manuf_file(contents: &str, db: &mut HashMap<String, String>) {
        for line in contents.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            // nmap-mac-prefixes format: "AABBCC Vendor Name"
            // wireshark manuf format: "AA:BB:CC\tShortName\tLong Vendor Name"
            if let Some((prefix, rest)) = line.split_once('\t') {
                let oui = prefix.trim().replace(':', "").replace('-', "").to_lowercase();
                if oui.len() >= 6 {
                    let key = oui[..6].to_string();
                    // Use long name if available, else short name
                    let parts: Vec<&str> = rest.splitn(2, '\t').collect();
                    let vendor = if parts.len() > 1 { parts[1] } else { parts[0] };
                    db.insert(key, vendor.trim().to_string());
                }
            } else if line.len() > 7 {
                // nmap format: "AABBCC Vendor Name"
                let prefix = &line[..6];
                if prefix.chars().all(|c| c.is_ascii_hexdigit()) {
                    let rest = line[6..].trim();
                    if !rest.is_empty() {
                        db.insert(prefix.to_lowercase(), rest.to_string());
                    }
                }
            }
        }
    }

    fn load_minimal_fallback(db: &mut HashMap<String, String>) {
        let fallback = [
            ("000c29", "VMware"), ("005056", "VMware"),
            ("080027", "Oracle VirtualBox"), ("0a0027", "Oracle VirtualBox"),
            ("02420a", "Docker Container"),
            ("00155d", "Microsoft Hyper-V"),
            ("001a11", "Google"), ("3c5ab4", "Google"),
            ("a4c3f0", "Intel"), ("3c22fb", "Intel"), ("a0369f", "Intel"),
            ("dc:a6", "Apple"), ("3c22fb", "Apple"),
            ("f8ffc2", "Apple"), ("a860b6", "Apple"),
            ("9c29", "Samsung"), ("a483e7", "Samsung"),
            ("b4a9fc", "Aruba/HPE"), ("d8c7c8", "Aruba/HPE"),
        ];
        for (prefix, vendor) in fallback {
            let key = prefix.replace(':', "").to_lowercase();
            if key.len() >= 6 {
                db.insert(key[..6].to_string(), vendor.to_string());
            }
        }
    }

    /// O(1) lookup by MAC address.
    pub fn lookup(&self, mac: &str) -> Option<String> {
        let clean: String = mac.replace([':', '-', '.'], "").to_lowercase();
        if clean.len() < 6 {
            return None;
        }
        self.db.get(&clean[..6]).cloned()
    }
}
