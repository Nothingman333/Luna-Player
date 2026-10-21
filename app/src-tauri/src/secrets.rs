//! API keys live in Windows' own Credential Manager ("Luna Player/geminiKey"…), encrypted for this
//! Windows user, instead of plain text in Luna's settings and its backup copies.

use std::ffi::c_void;

const CRED_TYPE_GENERIC: u32 = 1;
const CRED_PERSIST_LOCAL_MACHINE: u32 = 2;

#[repr(C)]
#[allow(non_snake_case)]
struct Credential {
    Flags: u32,
    Type: u32,
    TargetName: *mut u16,
    Comment: *mut u16,
    LastWritten: [u32; 2],
    CredentialBlobSize: u32,
    CredentialBlob: *mut u8,
    Persist: u32,
    AttributeCount: u32,
    Attributes: *mut c_void,
    TargetAlias: *mut u16,
    UserName: *mut u16,
}

#[link(name = "advapi32")]
unsafe extern "system" {
    fn CredWriteW(cred: *const Credential, flags: u32) -> i32;
    fn CredReadW(target: *const u16, kind: u32, flags: u32, cred: *mut *mut Credential) -> i32;
    fn CredDeleteW(target: *const u16, kind: u32, flags: u32) -> i32;
    fn CredFree(buf: *mut c_void);
}

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}
fn target(name: &str) -> Vec<u16> {
    wide(&format!("Luna Player/{name}"))
}

pub fn get(name: &str) -> Option<String> {
    let t = target(name);
    let mut c: *mut Credential = std::ptr::null_mut();
    if unsafe { CredReadW(t.as_ptr(), CRED_TYPE_GENERIC, 0, &mut c) } == 0 || c.is_null() {
        return None;
    }
    let v = unsafe {
        let r = &*c;
        let bytes = std::slice::from_raw_parts(r.CredentialBlob, r.CredentialBlobSize as usize);
        String::from_utf8(bytes.to_vec()).ok()
    };
    unsafe { CredFree(c as *mut c_void) };
    v
}

/// An empty value removes the key.
pub fn set(name: &str, value: &str) -> Result<(), String> {
    let mut t = target(name);
    if value.is_empty() {
        unsafe { CredDeleteW(t.as_ptr(), CRED_TYPE_GENERIC, 0) };
        return Ok(());
    }
    let mut user = wide("Luna Player");
    let mut blob = value.as_bytes().to_vec();
    let c = Credential {
        Flags: 0,
        Type: CRED_TYPE_GENERIC,
        TargetName: t.as_mut_ptr(),
        Comment: std::ptr::null_mut(),
        LastWritten: [0, 0],
        CredentialBlobSize: blob.len() as u32,
        CredentialBlob: blob.as_mut_ptr(),
        Persist: CRED_PERSIST_LOCAL_MACHINE,
        AttributeCount: 0,
        Attributes: std::ptr::null_mut(),
        TargetAlias: std::ptr::null_mut(),
        UserName: user.as_mut_ptr(),
    };
    if unsafe { CredWriteW(&c, 0) } == 0 {
        return Err(tr!("Anahtar Windows'a kaydedilemedi", "Couldn't save the key in Windows"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    /// Writes into this user's Credential Manager (and removes it): cargo test secrets_round -- --ignored
    #[test]
    #[ignore]
    fn secrets_round() {
        super::set("test-key", "abc İş 123").unwrap();
        assert_eq!(super::get("test-key").as_deref(), Some("abc İş 123"));
        super::set("test-key", "").unwrap();
        assert_eq!(super::get("test-key"), None);
    }
}
