/** TMDB episode-to-air counts include regular seasons only; future/special episodes are excluded. */
export function airedEpisodeCount(detail:any):number|undefined {
 const last=detail?.last_episode_to_air;
 if(!last && /^\d{4}-\d{2}-\d{2}$/.test(detail?.first_air_date??"") && detail.first_air_date>new Date().toISOString().slice(0,10))return 0;
 if(!Array.isArray(detail?.seasons)||!Number.isInteger(last?.season_number)||last.season_number<1||!Number.isInteger(last?.episode_number)||last.episode_number<1)return undefined;
 const previous=detail.seasons.filter((season:any)=>Number.isInteger(season?.season_number)&&season.season_number>0&&season.season_number<last.season_number);
 if(previous.length!==last.season_number-1||previous.some((season:any)=>!Number.isInteger(season.episode_count)||season.episode_count<0))return undefined;
 return previous.reduce((n:number,season:any)=>n+season.episode_count,last.episode_number);
}
