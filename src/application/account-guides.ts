import type {AccountSnapshot,GuideProgress,GuideTrack} from './account-types.ts';
import type {GameRun} from '../domain/playable.ts';
import {isInboundV16} from '../domain/playable.ts';

export const freshGuideProgress=():GuideProgress=>({learned:[],skipped:false,authoredStartConsumed:false});
/** A read-only projection: decoded legacy accounts keep their original two-track schema. */
export function guideProgress(account:Pick<AccountSnapshot,'guides'>,track:GuideTrack):GuideProgress {
 return account.guides[track]??freshGuideProgress();
}
export function guideTrackFor(state:GameRun):GuideTrack {
 return state.mode==='color_exit'?'outbound':isInboundV16(state)&&state.mode==='daily'?'daily':'inbound';
}
/** Called only while preparing a real account transaction. */
export function upgradeAccountGuides(account:AccountSnapshot):AccountSnapshot {
 return account.formatVersion===4?account:{...account,formatVersion:4,guides:{...account.guides,daily:account.guides.daily??freshGuideProgress()}};
}
/** Digest-valid unfamiliar guide data must not roll back the wallet to an older root. */
export class InvalidGuideState extends Error {}
export function assertAccountGuidesV4(value:unknown):void {
 const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
 const exact=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).length===keys.length&&Object.keys(v).every(key=>keys.includes(key));
 const steps=['place','order','route','upgrade','rushTimer','expired','sweepChoice','colorGroup','colorExit','mixedRemainder'];
 if(!object(value)||!exact(value,['inbound','outbound','daily'])||Object.values(value).some(progress=>!object(progress)||!exact(progress,['learned','skipped','authoredStartConsumed'])||!Array.isArray(progress.learned)||progress.learned.some(step=>typeof step!=='string'||!steps.includes(step))||new Set(progress.learned).size!==progress.learned.length||typeof progress.skipped!=='boolean'||typeof progress.authoredStartConsumed!=='boolean'))throw new InvalidGuideState('引导记录不兼容，原记录已保留');
}
