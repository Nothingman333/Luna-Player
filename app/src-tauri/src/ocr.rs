//! Windows OCR for decoded PGS images. No cloud service, executable or language download.
use windows::{Globalization::Language,Media::Ocr::OcrEngine,Graphics::Imaging::{SoftwareBitmap,BitmapPixelFormat,BitmapAlphaMode},Storage::Streams::DataWriter,Win32::System::WinRT::{RoInitialize,RoUninitialize,RO_INIT_MULTITHREADED}};
use serde::Serialize;
struct Apartment;
impl Apartment{fn enter()->Result<Self,String>{unsafe{RoInitialize(RO_INIT_MULTITHREADED)}.map_err(|e|e.to_string())?;Ok(Self)}}
impl Drop for Apartment{fn drop(&mut self){unsafe{RoUninitialize();}}}
#[derive(Serialize)]pub struct OcrLanguage{tag:String,name:String}
pub fn languages()->Result<Vec<OcrLanguage>,String>{
    let _apartment=Apartment::enter()?;let languages=OcrEngine::AvailableRecognizerLanguages().map_err(|e|e.to_string())?;
    let mut result=Vec::new();for i in 0..languages.Size().map_err(|e|e.to_string())?{let language=languages.GetAt(i).map_err(|e|e.to_string())?;result.push(OcrLanguage{tag:language.LanguageTag().map_err(|e|e.to_string())?.to_string(),name:language.DisplayName().map_err(|e|e.to_string())?.to_string()});}Ok(result)
}
pub struct Reader{engine:OcrEngine,_apartment:Apartment}
impl Reader{
    pub fn new(tag:&str)->Result<Self,String>{
        let apartment=Apartment::enter()?;
        if tag.is_empty()||tag.len()>40||!tag.bytes().all(|b|b.is_ascii_alphanumeric()||b==b'-'){return Err("Invalid OCR language".into());}
        let language=Language::CreateLanguage(&windows::core::HSTRING::from(tag)).map_err(|e|e.to_string())?;
        if !OcrEngine::IsLanguageSupported(&language).map_err(|e|e.to_string())?{return Err("Install this language's OCR pack in Windows Settings first".into());}
        let engine=OcrEngine::TryCreateFromLanguage(&language).map_err(|e|e.to_string())?;Ok(Self{engine,_apartment:apartment})
    }
    pub fn recognize(&self,path:&std::path::Path)->Result<String,String>{
        let bytes=std::fs::read(path).map_err(|e|e.to_string())?;
        if bytes.len()>32*1024*1024{return Err("OCR picture is too large".into());}
        let mut decoder=png::Decoder::new(std::io::Cursor::new(bytes));decoder.set_transformations(png::Transformations::EXPAND|png::Transformations::STRIP_16);
        let mut reader=decoder.read_info().map_err(|e|e.to_string())?;
        if reader.output_buffer_size()>64*1024*1024{return Err("Decoded OCR picture is too large".into());}
        let mut pixels=vec![0;reader.output_buffer_size()];let info=reader.next_frame(&mut pixels).map_err(|e|e.to_string())?;
        let channels=match info.color_type{png::ColorType::Rgba=>4,png::ColorType::Rgb=>3,png::ColorType::GrayscaleAlpha=>2,png::ColorType::Grayscale=>1,_=>return Err("Unsupported OCR image color".into())};
        let max=OcrEngine::MaxImageDimension().map_err(|e|e.to_string())?.min(4096).max(1);
        let scale=(info.width.max(info.height) as f64/max as f64).max(1.0);
        let width=(info.width as f64/scale).floor().max(1.0) as u32;let height=(info.height as f64/scale).floor().max(1.0) as u32;
        let mut bgra=vec![255u8;width as usize*height as usize*4];
        for y in 0..height{for x in 0..width{
            let sx=(x as f64*scale) as usize;let sy=(y as f64*scale) as usize;let at=(sy*info.width as usize+sx)*channels;
            let (r,g,b,a)=match channels{4=>(pixels[at],pixels[at+1],pixels[at+2],pixels[at+3]),3=>(pixels[at],pixels[at+1],pixels[at+2],255),2=>(pixels[at],pixels[at],pixels[at],pixels[at+1]),_=>(pixels[at],pixels[at],pixels[at],255)};
            let luminance=(r as u32*299+g as u32*587+b as u32*114)/1000;let value=(255-luminance*a as u32/255) as u8;
            let to=(y as usize*width as usize+x as usize)*4;bgra[to..to+3].fill(value);
        }}
        let writer=DataWriter::new().map_err(|e|e.to_string())?;writer.WriteBytes(&bgra).map_err(|e|e.to_string())?;
        let bitmap=SoftwareBitmap::CreateCopyWithAlphaFromBuffer(&writer.DetachBuffer().map_err(|e|e.to_string())?,BitmapPixelFormat::Bgra8,width as i32,height as i32,BitmapAlphaMode::Ignore).map_err(|e|e.to_string())?;
        let result=self.engine.RecognizeAsync(&bitmap).map_err(|e|e.to_string())?.join().map_err(|e|e.to_string());let _=bitmap.Close();
        result?.Text().map(|s|s.to_string()).map_err(|e|e.to_string())
    }
}
#[tauri::command]pub async fn ocr_languages()->Result<Vec<OcrLanguage>,String>{crate::blocking(languages).await}
