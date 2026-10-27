//! Read only small HLS manifests for the sources explicitly requested by Luna's UI.
use super::{checked_url,Url};use serde_json::{Value,json};
const MAX_BYTES:usize=128*1024;
pub fn audio_only(line:&str)->bool{let re=regex::Regex::new(r#"CODECS="([^"]*)""#).unwrap();let Some(c)=re.captures(line)else{return false};let codecs=c[1].to_ascii_lowercase();let video=["avc","hev","hvc","av01","vp0","vp9","theora","mp4v"].iter().any(|v|codecs.contains(v));!video&&["mp4a","aac","opus","vorbis","ac-3","ec-3"].iter().any(|v|codecs.contains(v))}
pub fn renditions(text:&str,base:&Url)->Vec<(String,u32,u32)>{
 if text.len()>MAX_BYTES||!text.trim_start_matches('\u{feff}').trim_start().starts_with("#EXTM3U"){return vec![]}
 let re=regex::Regex::new(r"RESOLUTION=(\d{2,5})x(\d{2,5})").unwrap();let mut pending=None;let mut rows=Vec::new();
 for line in text.lines().take(2000){let line=line.trim();if line.starts_with("#EXT-X-STREAM-INF:"){pending=if audio_only(line){None}else{re.captures(line).and_then(|c|Some((c[1].parse::<u32>().ok()?,c[2].parse::<u32>().ok()?))).filter(|(w,h)|*w>0&&*h>0&&*w<=16384&&*h<=16384)};}else if !line.is_empty()&&!line.starts_with('#'){if let Some((w,h))=pending.take(){if let Ok(u)=base.join(line){if checked_url(u.as_str()).is_ok()&&rows.len()<24{rows.push((u.to_string(),w,h));}}}}}rows
}
pub fn audio_groups(text:&str,base:&Url)->std::collections::HashMap<String,String>{
 let attr=regex::Regex::new(r#"([A-Z-]+)="([^"]*)""#).unwrap();let mut groups=std::collections::HashMap::new();
 for line in text.lines().take(2000).filter(|l|l.starts_with("#EXT-X-MEDIA:")&&l.contains("TYPE=AUDIO")){
 let fields=attr.captures_iter(line).map(|c|(c[1].to_string(),c[2].to_string())).collect::<std::collections::HashMap<_,_>>();
 if let (Some(group),Some(uri))=(fields.get("GROUP-ID"),fields.get("URI")){if let Ok(url)=base.join(uri){if checked_url(url.as_str()).is_ok(){if !groups.contains_key(group)||line.contains("DEFAULT=YES"){groups.insert(group.clone(),url.to_string());}}}}
 }groups
}
pub fn rendition_audio(text:&str,base:&Url)->std::collections::HashMap<String,String>{
 let groups=audio_groups(text,base);let re=regex::Regex::new(r#"AUDIO="([^"]*)""#).unwrap();let mut pending=None;let mut out=std::collections::HashMap::new();
 for line in text.lines().take(2000){let line=line.trim();if line.starts_with("#EXT-X-STREAM-INF:"){pending=re.captures(line).and_then(|c|groups.get(&c[1]).cloned());}else if !line.is_empty()&&!line.starts_with('#'){if let Some(audio)=pending.take(){if let Ok(url)=base.join(line){if checked_url(url.as_str()).is_ok(){out.insert(url.to_string(),audio);}}}}}out
}
async fn read(client:reqwest::Client,row:Value)->Option<(String,Vec<(String,u32,u32)>,std::collections::HashMap<String,String>,bool)>{
 let original=row["url"].as_str()?.to_string();checked_url(&original).ok()?;let mut request=client.get(&original).header(reqwest::header::RANGE,"bytes=0-131071");
 if let Some(r)=row["referer"].as_str().filter(|v|!v.is_empty()){checked_url(r).ok()?;request=request.header(reqwest::header::REFERER,r);}
 if let Some(a)=row["agent"].as_str().filter(|v|!v.is_empty()&&v.len()<=1024){request=request.header(reqwest::header::USER_AGENT,a);}
 let mut response=request.send().await.ok()?.error_for_status().ok()?;if response.content_length().is_some_and(|n|n>MAX_BYTES as u64){return None}let base=checked_url(response.url().as_str()).ok()?;let mut bytes=Vec::new();while let Some(chunk)=response.chunk().await.ok()?{if bytes.len()+chunk.len()>MAX_BYTES{return None}bytes.extend_from_slice(&chunk);}let text=std::str::from_utf8(&bytes).ok()?;Some((original,renditions(text,&base),rendition_audio(text,&base),{let lines=text.lines().filter(|l|l.starts_with("#EXT-X-STREAM-INF:")).collect::<Vec<_>>();!lines.is_empty()&&lines.iter().all(|l|audio_only(l))}))
}
pub async fn enrich(mut rows:Vec<Value>)->Vec<Value>{
 let Ok(client)=reqwest::Client::builder().timeout(std::time::Duration::from_secs(2)).redirect(reqwest::redirect::Policy::custom(|a|{if a.previous().len()<3&&checked_url(a.url().as_str()).is_ok(){a.follow()}else{a.stop()}})).build()else{return rows};
 let mut jobs=tokio::task::JoinSet::new();for row in rows.iter().filter(|r|r["url"].as_str().and_then(|u|Url::parse(u).ok()).is_some_and(|u|{let p=u.path().to_ascii_lowercase();![".mp4",".webm",".mkv",".ts",".m4s",".mp3",".aac",".m4a"].iter().any(|ext|p.ends_with(ext))})).take(8){jobs.spawn(read(client.clone(),row.clone()));}
 while let Some(outcome)=jobs.join_next().await{let Ok(Some((parent,variants,audio,audio_only)))=outcome else{continue};if audio_only{if let Some(row)=rows.iter_mut().find(|r|r["url"]==parent){row["mediaKind"]=json!("audio");let _=row.as_object_mut().map(|r|{r.remove("height");r.remove("qualities");});}continue}if variants.is_empty(){continue}
 for row in rows.iter_mut(){if audio.values().any(|u|row["url"]==u.as_str()){row["mediaKind"]=json!("audio");let _=row.as_object_mut().map(|r|{r.remove("height");r.remove("qualities");});}}let mut qualities=variants.iter().map(|(_,_,h)|*h).collect::<Vec<_>>();qualities.sort_unstable();qualities.dedup();let info=rows.iter().find(|r|r["url"]==parent).cloned().unwrap_or(Value::Null);
 if let Some(row)=rows.iter_mut().find(|r|r["url"]==parent){row["qualities"]=json!(qualities);row["master"]=json!(true);row["mediaKind"]=json!("video");}
 for(url,w,h)in variants{if let Some(row)=rows.iter_mut().find(|r|r["url"]==url){row["mediaKind"]=json!("video");row["master"]=json!(false);row["width"]=json!(w);row["height"]=json!(h);if let Some(a)=audio.get(&url){row["audioUrl"]=json!(a);}}else if rows.len()<24{let mut row=info.clone();row["url"]=json!(url);row["width"]=json!(w);row["height"]=json!(h);if let Some(a)=audio.get(&url){row["audioUrl"]=json!(a);}let _=row.as_object_mut().map(|r|r.remove("qualities"));rows.push(row);}}
 }rows
}
#[cfg(test)]mod tests{use super::*;#[test]fn resolutions(){let base=Url::parse("https://video.test/path/master.txt").unwrap();let rows=renditions("#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1,RESOLUTION=1280x720\nlow.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=2,RESOLUTION=1920x1080\nhi.m3u8",&base);assert_eq!(rows.len(),2);assert_eq!(rows[0],("https://video.test/path/low.m3u8".into(),1280,720));assert_eq!(rows[1].2,1080);}
 #[test]fn reject(){let base=Url::parse("https://video.test/master.m3u8").unwrap();assert!(renditions("<html>1080p</html>",&base).is_empty());assert!(renditions("#EXTM3U\n#EXT-X-STREAM-INF:RESOLUTION=1920x1080\nfile:///secret",&base).is_empty());assert!(renditions("#EXTM3U\n#EXTINF:10,\nsegment.ts",&base).is_empty());}}
