export type ExtensionRequest={source:string;kind:"store"|"file"};
export type ExtensionDownload={id:number;state:string;path:string;name:string};
export function completedExtensionPackages(rows:ExtensionDownload[],seen:Set<number>,initial=false):ExtensionRequest[] {
  const requests:ExtensionRequest[]=[];
  for(const row of rows){
    if(row.state!=="done"||seen.has(row.id))continue;
    seen.add(row.id);
    // Ordinary ZIP downloads remain ordinary downloads. External ZIP/folders use the file picker.
    if(!initial&&row.path&&/\.crx$/i.test(row.name)&&/\.crx$/i.test(row.path))requests.push({kind:"file",source:row.path});
  }
  return requests;
}
