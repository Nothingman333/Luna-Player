import {useEffect} from "react";
import type {MutableRefObject,ReactNode} from "react";
import {usePlaybackTime} from "./playbackClock";
import {fmtTime} from "./mpv";
export function Clocked({children,step=0}:{children:(time:number)=>ReactNode;step?:number}){const time=usePlaybackTime(step);return children(time);}
export function PlaybackClockRuntime({tick,identity}:{tick:MutableRefObject<(time:number)=>void>;identity:string|null}){const time=usePlaybackTime();useEffect(()=>{tick.current(time);},[time,identity,tick]);return null;}
export function PlaybackElapsed({duration,remaining=false}:{duration:number;remaining?:boolean}){const time=usePlaybackTime(1);return <span className={"t"+(remaining?" right":"")}>{fmtTime(remaining?duration-time:time)}</span>;}
export function PlaybackFill({duration}:{duration:number}){const time=usePlaybackTime();return <div className="fill" style={{width:(duration?time/duration*100:0)+"%"}}/>;}
