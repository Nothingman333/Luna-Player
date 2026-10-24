/** Foliate adapter for Luna's existing annotations, TTS and reading-position contracts.
 * The persisted CFI remains a standard EPUB CFI; no saved annotation keys are renamed. */
// @ts-expect-error upstream JavaScript has no TypeScript declaration files
import {makeBook} from "./vendor/foliate/view.js";
// @ts-expect-error upstream JavaScript has no TypeScript declaration files
import {Overlayer} from "./vendor/foliate/overlayer.js";
import {openUrl} from "@tauri-apps/plugin-opener";
type Callback=(...args:any[])=>void;
type Section={id:string;createDocument?:()=>Promise<Document>;unload?:()=>void};
type Annotation={value:string;id?:string;draw:Callback;open:Callback;options:Record<string,string>};

export async function createFoliateBook(buffer:ArrayBuffer,name:string){
  const source=await makeBook(new File([buffer],name));
  let rendition:FoliateRendition|null=null;
  const sections:Section[]=source.sections;
  const facade={
    loaded:{navigation:Promise.resolve({toc:tocFor(source.toc??[])})},
    load:()=>{},metadata:source.metadata,
    renderTo:(container:HTMLElement,options:any)=>rendition=new FoliateRendition(source,container,options),
    destroy:()=>{rendition?.destroy();source.destroy?.();},
    locations:{generate:async(_step?:number)=>{},percentageFromCfi:(_cfi?:string)=>rendition?.fraction()??0,cfiFromPercentage:(fraction:number)=>({fraction})},
    spine:{length:sections.length,get:(index:number)=>{const section=sections[index];return section?{href:section.id}:null;},spineItems:[] as any[]},
  };
  facade.spine.spineItems=sections.map((section,index)=>{
    let document:Document|null=null;
    return {href:section.id,load:async()=>{document=await section.createDocument?.()??null;},unload:()=>{document=null;},find:(query:string)=>{
      if(!document||!rendition)return[];
      const nodes:Text[]=[];const walker=document.createTreeWalker(document.body??document.documentElement,NodeFilter.SHOW_TEXT,{acceptNode(node){return node.parentElement?.closest('script,style,noscript')?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT;}});
      while(walker.nextNode())nodes.push(walker.currentNode as Text);
      const text=nodes.map(n=>n.data).join(''),haystack=text.toLocaleLowerCase(),needle=query.toLocaleLowerCase(),out:{cfi:string;excerpt:string}[]=[];
      if(!needle)return out;
      let from=0;
      while(out.length<200){const at=haystack.indexOf(needle,from);if(at<0)break;const range=document.createRange();let position=0,start=false;
        for(const node of nodes){const end=position+node.length;if(!start&&at<end){range.setStart(node,at-position);start=true;}if(start&&at+needle.length<=end){range.setEnd(node,at+needle.length-position);break;}position=end;}
        if(start)out.push({cfi:rendition.view.getCFI(index,range),excerpt:text.slice(Math.max(0,at-70),at+needle.length+70)});from=at+Math.max(1,needle.length);
      }return out;
    }};
  });
  return facade;
}
function tocFor(rows:any[]):any[]{return rows.map(row=>({label:row.label??"",href:row.href,subitems:tocFor(row.subitems??[])}));}

class FoliateRendition{
  readonly view:any;
  private ready:Promise<void>;
  private listeners=new Map<string,Set<Callback>>();
  private contentHooks:Callback[]=[];
  private marks=new Map<string,Annotation>();
  private styles:Record<string,Record<string,string>>={};
  private fontSize="100%";
  private dead=false;
  hooks={content:{register:(cb:Callback)=>this.contentHooks.push(cb)}};
  themes={default:(styles:Record<string,Record<string,string>>)=>{this.styles=styles;this.applyStyles();},fontSize:(size:string)=>{this.fontSize=size;this.applyStyles();}};
  annotations={
    remove:(value:string)=>{this.marks.delete(value);void this.ready.then(()=>this.view.deleteAnnotation({value})).catch(()=>{});},
    highlight:(value:string,data:any,open:Callback,_class:string,options:Record<string,string>)=>this.addMark(value,data,open,Overlayer.highlight,options),
    underline:(value:string,data:any,open:Callback,_class:string,options:Record<string,string>)=>this.addMark(value,data,open,Overlayer.underline,options),
  };
  constructor(source:any,container:HTMLElement,options:any){
    this.view=document.createElement('foliate-view');this.view.style.cssText='display:block;width:100%;height:100%';container.append(this.view);
    this.view.addEventListener('external-link',(event:any)=>{event.preventDefault();const href=event.detail?.href_??event.detail?.a?.href;try{const url=new URL(href);if(/^https?:$/.test(url.protocol)&&!url.username&&!url.password)void openUrl(url.href).catch(()=>{});}catch{}});
    this.view.addEventListener('load',({detail}:any)=>{
      const {doc,index}=detail,contents=this.contents(doc,index);
      for(const hook of this.contentHooks)hook(contents);
      for(const type of ['keydown','click','mousemove','mousedown','mouseup'])doc.addEventListener(type,(event:Event)=>{
        this.emit(type,event,contents);
        if(type==='mouseup'){
          const selection=doc.defaultView?.getSelection();if(selection?.rangeCount&&selection.toString().trim())this.emit('selected',this.view.getCFI(index,selection.getRangeAt(0)),contents);
        }
      });
      this.paint();
    });
    this.view.addEventListener('relocate',()=>this.emit('relocated',this.currentLocation()));
    this.view.addEventListener('create-overlay',()=>queueMicrotask(()=>this.paint()));
    this.view.addEventListener('draw-annotation',({detail}:any)=>{const mark=this.marks.get(detail.annotation.value);if(mark)detail.draw(mark.draw,{color:mark.options.fill??mark.options.stroke??'#facc15',opacity:0.38,width:2});});
    this.view.addEventListener('show-annotation',({detail}:any)=>{const mark=this.marks.get(detail.value);const rect=detail.range?.getBoundingClientRect(),frame=detail.range?.startContainer.ownerDocument?.defaultView?.frameElement?.getBoundingClientRect();if(mark&&rect)mark.open(new MouseEvent('click',{clientX:(frame?.left??0)+rect.left,clientY:(frame?.top??0)+rect.top}));});
    this.ready=this.view.open(source).then(()=>{if(this.dead){this.view.close();this.view.remove();return;}this.flow(options.flow);this.spread(options.spread);this.applyStyles();});
  }
  on(name:string,callback:Callback){if(!this.listeners.has(name))this.listeners.set(name,new Set());this.listeners.get(name)!.add(callback);}
  emit(name:string,...args:any[]){for(const callback of this.listeners.get(name)??[])callback(...args);}
  private contents(doc:Document,index:number){return{document:doc,window:doc.defaultView,sectionIndex:index,range:(cfi:string)=>{try{const target=this.view.resolveCFI(cfi);return target.index===index?target.anchor(doc):null;}catch{return null;}},cfiFromRange:(range:Range)=>this.view.getCFI(index,range)};}
  getContents(){return(this.view.renderer?.getContents()??[]).map(({doc,index}:any)=>this.contents(doc,index));}
  fraction(){return this.view.lastLocation?.fraction??0;}
  currentLocation(){const loc=this.view.lastLocation;if(!loc)return null;const index=loc.section?.current??0;return{start:{cfi:loc.cfi,index,href:this.view.book.sections[index]?.id??"",percentage:loc.fraction,displayed:undefined},atEnd:loc.fraction>=0.999};}
  async display(target?:unknown){await this.ready;if(this.dead)return;if(target==null){await this.view.init({showTextStart:true});return;}const resolved=this.view.resolveNavigation(target);if(!resolved)throw Error('Book location is unavailable');await this.view.renderer.goTo(resolved);}
  async next(){await this.ready;if(!this.dead)await this.view.next();}
  async prev(){await this.ready;if(!this.dead)await this.view.prev();}
  flow(flow:string){this.view.renderer?.setAttribute('flow',flow==='scrolled-doc'?'scrolled':'paginated');}
  spread(spread:string){this.view.renderer?.setAttribute('max-column-count',spread==='none'?'1':'2');}
  private applyStyles(){if(!this.view.renderer)return;const css=Object.entries(this.styles).map(([selector,styles])=>`${selector}{${Object.entries(styles).map(([key,value])=>key+':'+value+';').join('')}}`).join('');this.view.renderer.setStyles?.(`html{font-size:${this.fontSize}!important}${css}`);}
  private addMark(value:string,data:any,open:Callback,draw:Callback,options:Record<string,string>){this.marks.set(value,{value,id:data?.id,draw,open,options});void this.ready.then(()=>this.view.addAnnotation({value})).catch(()=>{});}
  private paint(){if(this.dead)return;for(const mark of this.marks.values())void this.view.addAnnotation({value:mark.value}).catch(()=>{});}
  destroy(){if(this.dead)return;this.dead=true;this.view.close();this.view.remove();this.listeners.clear();this.marks.clear();}
}
