//! Stable, domain-separated cache keys. Existing cache files are left intact and rebuilt on demand.
use sha2::{Digest, Sha256};
use std::path::Path;

pub fn key(parts: &[&[u8]]) -> String {
    let mut h = Sha256::new();
    h.update(b"luna-cache-v1\0");
    for part in parts { h.update((part.len() as u64).to_le_bytes()); h.update(part); }
    h.finalize()[..16].iter().map(|b| format!("{b:02x}")).collect()
}

pub fn file_key(domain: &str, file: &str, extra: &[u8]) -> String {
    let m = std::fs::metadata(file).ok();
    let size = m.as_ref().map_or(0, |m| m.len()).to_le_bytes();
    let modified = m.and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map_or(0, |d| d.as_nanos()).to_le_bytes();
    key(&[domain.as_bytes(), file.as_bytes(), &size, &modified, extra])
}

/// Do not follow hidden/system directories or junctions back into an already visited tree.
pub fn skip_directory(path: &Path) -> bool {
    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
    if name.starts_with('.') || name.eq_ignore_ascii_case("$RECYCLE.BIN") || name.eq_ignore_ascii_case("System Volume Information") { return true; }
    #[cfg(windows)] {
        use std::os::windows::fs::MetadataExt;
        return std::fs::symlink_metadata(path).map_or(true, |m| m.file_attributes() & (0x2 | 0x4 | 0x400) != 0);
    }
    #[cfg(not(windows))] { path.is_symlink() }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn boundaries_and_domains_are_distinct() {
        assert_ne!(key(&[b"ab",b"c"]),key(&[b"a",b"bc"]));
        assert_ne!(file_key("thumb","missing",b""),file_key("still","missing",b""));
        assert_eq!(key(&[b"a",b"bc"]), "9b05ab7659cc2fd94ad9b9f2bdb37135");
    }
}
