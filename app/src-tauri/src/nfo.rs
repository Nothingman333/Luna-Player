//! Kodi sidecar identity only. XML entities, URLs and paths in NFO files are never executed.
use std::path::Path;
fn identity(text: &str, kind: &str) -> Option<u32> {
    let root=if kind=="tv"{"tvshow"}else{"movie"};
    if !regex::Regex::new(&format!(r"(?i)<{root}(?:\s[^>]*)?>")).ok()?.is_match(text){return None;}
    let unique=regex::Regex::new(r#"(?is)<uniqueid\b([^>]*)>\s*([0-9]{1,10})\s*</uniqueid\s*>"#).ok()?;
    let attr=regex::Regex::new(r#"(?i)\btype\s*=\s*["']tmdb["']"#).ok()?;
    let id=unique.captures_iter(text).find(|m|attr.is_match(&m[1])).map(|m|m[2].to_string())
        .or_else(||regex::Regex::new(r"(?is)<tmdbid\s*>\s*([0-9]{1,10})\s*</tmdbid\s*>").ok()?.captures(text).map(|m|m[1].to_string()))?;
    id.parse::<u32>().ok().filter(|id|*id>0&&*id<=i32::MAX as u32)
}
pub fn read(file:&str,kind:&str)->Option<u32>{
    let path=Path::new(file);
    if !path.is_file(){return None;}
    let mut candidates=vec![path.with_extension("nfo")];
    if kind=="tv"{for dir in path.ancestors().skip(1).take(4){candidates.push(dir.join("tvshow.nfo"));}}
    else if let Some(parent)=path.parent(){candidates.push(parent.join("movie.nfo"));}
    for nfo in candidates{
        if std::fs::metadata(&nfo).is_ok_and(|m|m.is_file()&&m.len()<=1024*1024){
            if let Ok(text)=std::fs::read_to_string(nfo){if let Some(id)=identity(&text,kind){return Some(id);}}
        }
    }None
}
#[tauri::command]
pub async fn nfo_match(file:String,kind:String)->Result<Option<u32>,String>{
    if !matches!(kind.as_str(),"movie"|"tv"){return Err("Invalid media kind".into());}
    crate::blocking(move||Ok(read(&file,&kind))).await
}
#[cfg(test)]mod tests{use super::*;
    #[test]fn requires_kind_and_tmdb_not_imdb(){assert_eq!(identity("<movie><uniqueid default='true' type='tmdb'>42</uniqueid></movie>","movie"),Some(42));assert_eq!(identity("<episodedetails><uniqueid type='tmdb'>42</uniqueid></episodedetails>","tv"),None);assert_eq!(identity("<movie><uniqueid type='imdb'>42</uniqueid></movie>","movie"),None);assert_eq!(identity("<movie><tmdbid>0</tmdbid></movie>","movie"),None);}
}
