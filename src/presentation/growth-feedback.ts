import type {InboundRun,PlayablePreview} from '../domain/playable.ts';
export interface GrowthFeedback {rush:{cell:number;remaining:number;outcome:'ships'|'remains'|'expires'}[];sweep:{progress:number;target:2|6}|null}
/** Read the reducer's settled facts so shipment always takes precedence over expiry. */
export function growthFeedback(state:InboundRun,preview:Pick<PlayablePreview,'valid'|'shipments'|'stateAfter'>|null):GrowthFeedback {
 const shipped=new Set(preview?.valid?preview.shipments.flatMap(s=>s.cells):[]),after=preview?.valid?preview.stateAfter:undefined;
 const rush=state.cellTraits.flatMap((trait,cell)=>{if(trait?.kind!=='rush')return [];const next=after?.cellTraits?.[cell];return [{cell,remaining:shipped.has(cell)?0:after?next?.kind==='rush'?next.remaining??0:0:trait.remaining??0,outcome:shipped.has(cell)?'ships' as const:after&&next?.kind==='waste'?'expires' as const:'remains' as const}];});
 return {rush,sweep:state.cleanup?{progress:state.cleanup.progress,target:state.cleanup.branch==='orders'?2:6}:null};
}
