/** Only explicit provenance tags are interpreted; older unknown entries stay unclassified. */
export function releaseChangeLine(line:string,english=false):string {
 return /\[external\]/i.test(line)?line.replace(/\s*\[external\]\s*/i," ").trimEnd()+" · "+(english?"From external sources":"Dış kaynaklardan gelen"):line;
}
