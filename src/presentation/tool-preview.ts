import type {ToolCommandV9} from '../domain/v9/types.ts';
import type {OutboundItemCommandV12} from '../domain/v12/types.ts';
import {applyToolV9} from '../domain/v9/tools.ts';
import {applyToolV11} from '../domain/v11/tools.ts';
import {applyToolV14} from '../domain/v14/tools.ts';
import {applyToolV12} from '../domain/v12/engine.ts';
import {applyToolV13} from '../domain/v13/engine.ts';
import {isInboundV9,isInboundV11,isInboundV14} from '../domain/playable.ts';
import type {ToolRun,GameStepResult} from '../domain/playable.ts';
export type ToolCommand=ToolCommandV9|OutboundItemCommandV12;
/** The temporary reducer result is discarded; only AccountService can consume the tool. */
export function toolPreview<T extends ToolRun>(state:T,command:ToolCommand):GameStepResult&{state:T} {
 const result=isInboundV9(state)?applyToolV9(state,command):isInboundV11(state)?applyToolV11(state,command):isInboundV14(state)?applyToolV14(state,command):
  command.type==='wildcard'&&!('cargo' in command)?{state,events:[],error:'请选择货类'}:
  state.rulesetVersion===12?applyToolV12(state,command as OutboundItemCommandV12):applyToolV13(state,command as OutboundItemCommandV12);
 return result as GameStepResult&{state:T};
}
