/** A five-star scale, including real half-filled stars instead of a text fraction. */
export function RatingStars({value}:{value:number}){
  const score=Number.isFinite(value)?Math.max(0,Math.min(5,Math.round(value*2)/2)):0;
  const shape="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01Z";
  const star=<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d={shape}/></svg>;
  return <span className="rating-five" role="img" aria-label={score+" / 5"} style={{display:"inline-flex",gap:2,verticalAlign:"middle"}}>{Array.from({length:5},(_,i)=><span key={i} aria-hidden="true" data-fill={Math.max(0,Math.min(1,score-i))} style={{position:"relative",display:"inline-block",width:16,height:16}}><span style={{opacity:.23}}>{star}</span><span style={{position:"absolute",left:0,top:0,width:Math.max(0,Math.min(1,score-i))*100+"%",height:16,overflow:"hidden"}}>{star}</span></span>)}</span>;
}
