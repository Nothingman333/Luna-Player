/** Only explicit provenance tags are interpreted; older unknown entries stay unclassified. */
export function releaseChangeLine(line:string,english=false):string {
 return /\[external\]/i.test(line)?line.replace(/\s*\[external\]\s*/i," ").trimEnd()+" · "+(english?"From external sources":"Dış kaynaklardan gelen"):line;
}

export function visibleReleaseText(text:string,developer:boolean){return text.split("\n").filter(line=>developer||!line.includes("[dev]")).map(line=>line.replace(/\s*\[dev\]\s*/g," ")).join("\n").trim();}
