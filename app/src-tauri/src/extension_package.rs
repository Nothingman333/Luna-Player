//! Bounded, traversal-safe unpacked extension imports. Does not execute extension code.
use std::{collections::HashSet, io::{Read, Cursor}, path::{Path, PathBuf}};
use serde::Serialize;
use serde_json::Value;
const FILE_LIMIT: u64 = 16 * 1024 * 1024;
const TOTAL_LIMIT: u64 = 128 * 1024 * 1024;
pub const PACKAGE_LIMIT: u64 = 32 * 1024 * 1024;
#[derive(Clone, Serialize)]
#[serde(rename_all="camelCase")]
pub struct Preview { pub token: String, pub name: String, pub version: String, pub description: String, pub permissions: Vec<String>, pub hosts: Vec<String>, pub manifest_version: u64, pub source: String, pub bytes: u64, pub signature_verified: bool }
pub fn store_id(input: &str) -> Result<String,String> {
 let input=input.trim();
 if input.len()==32 && input.bytes().all(|b| (b'a'..=b'p').contains(&b)) { return Ok(input.into()); }
 let url=tauri::Url::parse(input).map_err(|_| "Chrome Web Store bağlantısı veya 32 harfli eklenti kimliği gir.".to_string())?;
 if url.scheme()!="https" || !matches!(url.host_str(),Some("chromewebstore.google.com"|"chrome.google.com")) || !url.username().is_empty() || url.password().is_some() || url.port().is_some() { return Err("Yalnız resmi Chrome Web Store bağlantısı kullanılabilir.".into()); }
 let parts:Vec<_>=url.path_segments().ok_or("Geçersiz mağaza adresi")?.filter(|s|!s.is_empty()).collect();
 if !(parts.first()==Some(&"detail") || parts.get(0..2)==Some(&["webstore","detail"][..])) {return Err("Bir eklentinin ayrıntı bağlantısını gir.".into());}
 let id=parts.last().ok_or("Eklenti kimliği eksik")?;
 if id.len()!=32 || !id.bytes().all(|b|(b'a'..=b'p').contains(&b)) { return Err("Geçersiz eklenti kimliği".into()); } Ok((*id).into())
}
fn safe_name(name:&str)->Result<PathBuf,String>{
 if name.is_empty() || name.len()>220 || name.contains('\\') {return Err("Geçersiz arşiv yolu".into());}
 let mut out=PathBuf::new();
 for part in name.trim_end_matches('/').split('/') {
  let stem=part.split('.').next().unwrap_or("").to_ascii_uppercase();
  if part.is_empty() || part=="." || part==".." || part.ends_with([' ','.']) || part.chars().any(|c| c<' ' || ":<>\"|?*".contains(c)) || matches!(part,".git"|".codex"|".agents") || matches!(stem.as_str(),"CON"|"PRN"|"AUX"|"NUL") || (stem.len()==4 && (stem.starts_with("COM")||stem.starts_with("LPT")) && stem.as_bytes()[3].is_ascii_digit()) {return Err(format!("Güvenli olmayan arşiv yolu: {name}"));} out.push(part);
 } Ok(out)
}
pub fn bounded_read(path:&Path,limit:u64)->Result<Vec<u8>,String>{
 let f=std::fs::File::open(path).map_err(|e|e.to_string())?; if !f.metadata().map_err(|e|e.to_string())?.is_file(){return Err("Bir dosya seç.".into());}
 let mut data=Vec::new();f.take(limit+1).read_to_end(&mut data).map_err(|e|e.to_string())?;if data.len() as u64>limit{return Err("Dosya boyut sınırını aşıyor.".into());}Ok(data)
}
pub fn unpack(data:&[u8],dest:&Path,expected:Option<&str>)->Result<u64,String>{
 let signed=if data.starts_with(b"Cr24"){Some(crate::extension_signature::verify(data,expected)?)}else{if expected.is_some(){return Err("Mağaza yanıtı imzalı CRX3 paketi değil".into());}None};
 let payload=if let Some(signed)=&signed{&data[signed.offset..]}else{data};
 let mut zip=zip::ZipArchive::new(Cursor::new(payload)).map_err(|_|"ZIP/CRX paketi okunamadı".to_string())?;
 if zip.len()>5000{return Err("Eklentide çok fazla dosya var".into());}
 let mut entries=Vec::new();let mut names=HashSet::new();let mut total=0u64;
 for i in 0..zip.len(){let f=zip.by_index(i).map_err(|e|e.to_string())?;let name=f.name().to_string();let path=safe_name(&name)?;
  if f.unix_mode().is_some_and(|m|m&0o170000==0o120000){return Err("Sembolik bağlantı kabul edilmiyor".into());}
  if f.is_dir(){continue;}
  if !names.insert(name.to_lowercase()){return Err("Arşivde yinelenen dosya yolu".into());}
  total=total.checked_add(f.size()).ok_or("Eklenti çok büyük")?;if f.size()>FILE_LIMIT || total>TOTAL_LIMIT{return Err("Eklenti açılmış boyut sınırını aşıyor".into());}
  entries.push((i,path));
 }
 let roots:Vec<_>=entries.iter().filter(|(_,p)|p.file_name().is_some_and(|n|n=="manifest.json") && p.components().count()<=2).map(|(_,p)|p.parent().unwrap().to_path_buf()).collect();
 let root=if roots.iter().any(|p|p.as_os_str().is_empty()){PathBuf::new()}else if roots.len()==1{roots[0].clone()}else{return Err("Paket kökünde tek bir manifest.json bulunmalı".into());};
 let mut actual=0u64;
 for(i,path) in entries{
  let Ok(rel)=path.strip_prefix(&root)else{continue};
  if rel.components().any(|c|matches!(c.as_os_str().to_str(),Some("_metadata"|"__MACOSX"))){continue;}
  let target=dest.join(rel);if let Some(parent)=target.parent(){std::fs::create_dir_all(parent).map_err(|e|e.to_string())?;}
  let mut f=zip.by_index(i).map_err(|e|e.to_string())?;let mut out=std::fs::OpenOptions::new().create_new(true).write(true).open(target).map_err(|e|e.to_string())?;
  let n=std::io::copy(&mut f.by_ref().take(FILE_LIMIT+1),&mut out).map_err(|e|e.to_string())?;actual=actual.checked_add(n).ok_or("Boyut taşması")?;if n>FILE_LIMIT||actual>TOTAL_LIMIT{return Err("Dosya sınırı aşıldı".into());}
 }
 if let Some(signed)=signed{let path=dest.join("manifest.json");let mut m:Value=serde_json::from_slice(&bounded_read(&path,1024*1024)?).map_err(|_|"Geçersiz manifest")?;let object=m.as_object_mut().ok_or("Geçersiz manifest")?;object.insert("key".into(),Value::String(signed.key));std::fs::write(path,serde_json::to_vec_pretty(&m).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;}
 Ok(total)
}
pub fn copy_folder(src:&Path,dest:&Path)->Result<u64,String>{
 fn walk(src:&Path,dest:&Path,count:&mut usize,total:&mut u64,depth:usize)->Result<(),String>{
  if depth>24{return Err("Eklenti klasörü çok derin".into());}
  let meta=std::fs::symlink_metadata(src).map_err(|e|e.to_string())?;
  use std::os::windows::fs::MetadataExt;
  if meta.file_type().is_symlink() || meta.file_attributes()&0x400!=0{return Err("Bağlantılı klasör veya dosya kabul edilmiyor".into());}
  std::fs::create_dir_all(dest).map_err(|e|e.to_string())?;
  for entry in std::fs::read_dir(src).map_err(|e|e.to_string())?{let e=entry.map_err(|e|e.to_string())?;let name=e.file_name().to_string_lossy().to_string();if matches!(name.as_str(),"_metadata"|"__MACOSX"){continue;}safe_name(&name)?;
   *count+=1;if *count>5000{return Err("Çok fazla dosya".into());}
   let m=std::fs::symlink_metadata(e.path()).map_err(|e|e.to_string())?;if m.file_type().is_symlink()||m.file_attributes()&0x400!=0{return Err("Sembolik bağlantı kabul edilmiyor".into());}
   if m.is_dir(){walk(&e.path(),&dest.join(name),count,total,depth+1)?;}else if m.is_file(){let data=bounded_read(&e.path(),FILE_LIMIT)?;*total+=data.len() as u64;if *total>TOTAL_LIMIT{return Err("Eklenti çok büyük".into());}std::fs::write(dest.join(name),data).map_err(|e|e.to_string())?;}else{return Err("Desteklenmeyen dosya türü".into());}
  }Ok(())
 }let(mut count,mut total)=(0,0);walk(src,dest,&mut count,&mut total,0)?;Ok(total)
}
pub fn preview(dir:&Path,token:String,source:String,bytes:u64,signature_verified:bool)->Result<Preview,String>{
 let data=bounded_read(&dir.join("manifest.json"),1024*1024)?;let mut m:Value=serde_json::from_slice(&data).map_err(|_|"manifest.json geçersiz".to_string())?;
 let mv=m["manifest_version"].as_u64().ok_or("manifest_version eksik")?;if !matches!(mv,2|3){return Err("Desteklenmeyen manifest sürümü".into());}
 let mut messages=Value::Null;
 if let Some(locale)=m["default_locale"].as_str().filter(|s|s.len()<30&&s.bytes().all(|c|c.is_ascii_alphanumeric()||c==b'_'||c==b'-')){
  if let Ok(data)=bounded_read(&dir.join("_locales").join(locale).join("messages.json"),1024*1024){messages=serde_json::from_slice(&data).unwrap_or(Value::Null);}
 }
 let localize=|value:&Value|->String{let raw=value.as_str().unwrap_or("");if raw.starts_with("__MSG_")&&raw.ends_with("__")&&raw.len()>=8{let key=&raw[6..raw.len()-2];if let Some(s)=messages.as_object().and_then(|o|o.iter().find(|(k,_)|k.eq_ignore_ascii_case(key))).and_then(|(_,v)|v["message"].as_str()){return s.into();}}raw.into()};
 let name=localize(&m["name"]);if name.trim().is_empty(){return Err("Eklenti adı eksik".into());}
 let version=m["version"].as_str().filter(|s|!s.is_empty()&&s.len()<80).ok_or("Eklenti sürümü eksik")?.to_string();
 if m.get("theme").is_some(){return Err("Chrome temaları Luna eklentisi olarak yüklenemez".into());}
 for field in ["permissions","optional_permissions","host_permissions","optional_host_permissions"]{if m[field].as_array().is_some_and(|v|v.len()>100){return Err("Önizleme sınırını aşan izin listesi".into());}}
 let strings=|v:&Value|->Vec<String>{v.as_array().into_iter().flatten().filter_map(|v|v.as_str()).take(100).map(|s|s.chars().take(300).collect()).collect()};
 let mut permissions=strings(&m["permissions"]);permissions.extend(strings(&m["optional_permissions"]).into_iter().map(|p|format!("optional: {p}")));let mut hosts=strings(&m["host_permissions"]);hosts.extend(strings(&m["optional_host_permissions"]).into_iter().map(|p|format!("optional: {p}")));
 for row in m["content_scripts"].as_array().into_iter().flatten(){hosts.extend(strings(&row["matches"]));}hosts.sort();hosts.dedup();permissions.sort();permissions.dedup();if hosts.len()>500{return Err("Önizleme sınırını aşan site erişim listesi".into());}
 let description=localize(&m["description"]).chars().take(500).collect();
 // Never preserve a browser-controlled update URL as a claim of Luna-managed auto updates.
 m.as_object_mut().unwrap().remove("update_url");std::fs::write(dir.join("manifest.json"),serde_json::to_vec_pretty(&m).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;
 Ok(Preview{token,name:name.chars().take(160).collect(),version,description,permissions,hosts,manifest_version:mv,source,bytes,signature_verified})
}
#[cfg(test)] mod tests{use super::*;
 #[test]fn rejects_windows_escape(){for p in ["../bad","/bad","C:/bad","a\\b","CON.txt","file:stream","a./b"]{assert!(safe_name(p).is_err(),"{p}");}assert!(safe_name("_locales/en/messages.json").is_ok());}
 #[test]fn strict_store_urls(){let id="a".repeat(32);assert_eq!(store_id(&format!("https://chromewebstore.google.com/detail/name/{id}")).unwrap(),id);assert!(store_id("https://chromewebstore.google.com.evil.test/detail/name/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa").is_err());assert!(store_id("https://chromewebstore.google.com/search/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa").is_err());}
 #[test]fn truncated_crx_is_error(){for n in 4..16{let mut b=vec![0;n];b[..4].copy_from_slice(b"Cr24");assert!(unpack(&b,Path::new("unused"),None).is_err());}}
}

#[cfg(test)]mod archive_tests{
use super::*;use std::{path::PathBuf,io::{Cursor,Write}};
fn dir()->PathBuf{let p=std::env::temp_dir().join(format!("luna-import-test-{}-{:?}",std::process::id(),std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));std::fs::create_dir(&p).unwrap();p}
fn zip(rows:&[(&str,&[u8])])->Vec<u8>{let mut zip=zip::ZipWriter::new(Cursor::new(Vec::new()));for(name,data)in rows{zip.start_file(*name,zip::write::SimpleFileOptions::default()).unwrap();zip.write_all(data).unwrap();}zip.finish().unwrap().into_inner()}
#[test]fn imports_wrapper_and_localized_manifest(){let d=dir();let bytes=zip(&[("sample/manifest.json",br#"{"manifest_version":3,"name":"__MSG_title__","default_locale":"en","version":"1.0","permissions":["storage"],"host_permissions":["https://example.com/*"],"update_url":"https://example.com/update"}"#),("sample/_locales/en/messages.json",br#"{"title":{"message":"Reader"}}"#),("sample/_metadata/verified_contents.json",b"metadata")]);let size=unpack(&bytes,&d,None).unwrap();let p=preview(&d,"token".into(),"Local ZIP".into(),size,false).unwrap();assert_eq!(p.name,"Reader");assert!(p.permissions.contains(&"storage".into()));assert!(!d.join("_metadata").exists());assert!(!std::fs::read_to_string(d.join("manifest.json")).unwrap().contains("update_url"));std::fs::remove_dir_all(d).unwrap();}
#[test]fn rejects_traversal_before_writes(){let d=dir();let bytes=zip(&[("../escape.js",b"no"),("manifest.json",b"{}")]);assert!(unpack(&bytes,&d,None).is_err());assert_eq!(std::fs::read_dir(&d).unwrap().count(),0);std::fs::remove_dir_all(d).unwrap();}
#[test]fn rejects_windows_duplicate_paths(){let d=dir();let bytes=zip(&[("manifest.json",b"{}"),("Manifest.json",b"{}")]);assert!(unpack(&bytes,&d,None).is_err());std::fs::remove_dir_all(d).unwrap();}
#[test]fn store_response_must_be_signed(){let d=dir();let bytes=zip(&[("manifest.json",b"{}")]);assert!(unpack(&bytes,&d,Some(&"a".repeat(32))).is_err());std::fs::remove_dir_all(d).unwrap();}
#[test]fn rejects_large_expanded_file(){let d=dir();let content=vec![0;16*1024*1024+1];let bytes=zip(&[("manifest.json",b"{}"),("huge.bin",&content)]);assert!(unpack(&bytes,&d,None).is_err());assert_eq!(std::fs::read_dir(&d).unwrap().count(),0);std::fs::remove_dir_all(d).unwrap();}
}
