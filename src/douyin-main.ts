import {startDouyinGame} from './platform/douyin-entry.ts';
import type {DouyinHost} from './platform/douyin.ts';
declare const tt:DouyinHost;
declare const __DEV_DIAGNOSTICS__:boolean;
startDouyinGame(tt,{requestAnimationFrame:callback=>requestAnimationFrame(callback),now:()=>Date.now()},{developerMode:__DEV_DIAGNOSTICS__});
