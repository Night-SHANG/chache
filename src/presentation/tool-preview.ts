import type {InboundRunV9,ToolCommandV9,InboundStepResultV9} from '../domain/v9/types.ts';
import type {InboundRunV11,InboundStepResultV11} from '../domain/v11/types.ts';
import {applyToolV9} from '../domain/v9/tools.ts';
import {applyToolV11} from '../domain/v11/tools.ts';
import {isInboundV11} from '../domain/playable.ts';
import type {InboundRun} from '../domain/playable.ts';
/** The temporary reducer result is discarded; only AccountService can consume the tool. */
export function toolPreview(state:InboundRunV9,command:ToolCommandV9):InboundStepResultV9;
export function toolPreview(state:InboundRunV11,command:ToolCommandV9):InboundStepResultV11;
export function toolPreview(state:InboundRun,command:ToolCommandV9):InboundStepResultV9|InboundStepResultV11;
export function toolPreview(state:InboundRun,command:ToolCommandV9):InboundStepResultV9|InboundStepResultV11 {return isInboundV11(state)?applyToolV11(state,command):applyToolV9(state,command);}
