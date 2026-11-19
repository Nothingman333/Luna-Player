use std::path::Path;
use sha2::{Digest, Sha256};

pub fn read_model(path: &Path, size: u64, hash: &str) -> Option<Vec<u8>> {
    if size == 0 || size > 80_000_000 || std::fs::metadata(path).ok()?.len() != size { return None; }
    let data = std::fs::read(path).ok()?;
    (data.len() == size as usize && format!("{:x}", Sha256::digest(&data)) == hash).then_some(data)
}

pub fn write_model(path: &Path, data: &[u8]) -> Result<(), String> {
    let parent = path.parent().ok_or("Dil dosyası konumu geçersiz.")?;
    std::fs::create_dir_all(parent).map_err(|e|format!("Dil dosyası klasörü açılamadı: {e}"))?;
    std::fs::write(path, data).map_err(|e|format!("Dil dosyası kalıcı kaydedilemedi: {e}"))
}
