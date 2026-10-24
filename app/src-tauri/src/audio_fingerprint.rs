//! Pure PCM fingerprint helpers shared by the native analysis tools and fixture tests.
use rusty_chromaprint::{Configuration,Fingerprinter};
pub fn wav_samples(bytes:&[u8])->Result<Vec<i16>,String>{
    if bytes.get(..4)!=Some(b"RIFF")||bytes.get(8..12)!=Some(b"WAVE"){return Err("Invalid PCM audio".into());}
    let mut at=12;let mut valid=false;while at+8<=bytes.len(){let tag=&bytes[at..at+4];let n=u32::from_le_bytes(bytes[at+4..at+8].try_into().map_err(|_|"Invalid WAV")?)as usize;at+=8;let end=at.checked_add(n).ok_or("Invalid WAV length")?.min(bytes.len());let chunk=&bytes[at..end];
        if tag==b"fmt "{valid=chunk.len()>=16&&u16::from_le_bytes([chunk[0],chunk[1]])==1&&u16::from_le_bytes([chunk[2],chunk[3]])==1&&u32::from_le_bytes(chunk[4..8].try_into().map_err(|_|"Invalid WAV")?)==11025&&u16::from_le_bytes([chunk[14],chunk[15]])==16;}
        if tag==b"data"{return if valid&&!chunk.is_empty(){Ok(chunk.chunks_exact(2).map(|b|i16::from_le_bytes([b[0],b[1]])).collect())}else{Err("Expected mono PCM16 at 11025 Hz".into())};}at=end.saturating_add(n%2);
    }Err("No PCM audio samples".into())
}
pub fn calculate(samples:&[i16])->Result<Vec<u32>,String>{
    if samples.len()<11025*5||samples.iter().map(|n|f64::from(*n).powi(2)).sum::<f64>()/(samples.len()as f64)<6400.0{return Err("Not enough audible audio for a fingerprint".into());}
    let config=Configuration::preset_test2();let mut fp=Fingerprinter::new(&config);fp.start(11025,1).map_err(|e|e.to_string())?;fp.consume(samples);fp.finish();let result=fp.fingerprint().to_vec();
    if result.len()<10||result.iter().all(|v|*v==result[0]){return Err("Audio has too little variation for reliable matching".into());}Ok(result)
}
#[cfg(test)]mod tests{
 use super::*;
 #[test]fn malformed_and_silent_audio_is_rejected(){assert!(wav_samples(b"RIFF").is_err());assert!(wav_samples(b"RIFFxxxxWAVEdata\0\0\0\0").is_err());assert!(calculate(&vec![0;11025*10]).is_err());}
 #[test]fn repeated_music_matches_at_distinct_episode_offsets(){
  let synth=|seconds:usize,seed:usize|->Vec<i16>{(0..11025*seconds).map(|i|{let t=i as f64/11025.0;let note=((i/5512+seed)*17%48)as f64;let f=110.0*2f64.powf(note/12.0);let x=(t*f*std::f64::consts::TAU).sin()+0.3*(t*f*1.5*std::f64::consts::TAU).sin();(x*9000.0)as i16}).collect()};
  let shared=synth(40,2);let mut a=synth(7,4);a.extend(&shared);a.extend(synth(8,7));let mut b=synth(13,1);b.extend(&shared);b.extend(synth(7,5));
  let config=Configuration::preset_test2();let matches=rusty_chromaprint::match_fingerprints(&calculate(&a).unwrap(),&calculate(&b).unwrap(),&config).unwrap();
  assert!(matches.iter().any(|s|s.duration(&config)>25.0&&((s.start2(&config)-s.start1(&config))-6.0).abs()<0.6&&s.score<8.0),"{matches:?}");
 }
}
