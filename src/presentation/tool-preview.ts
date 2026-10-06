import type {InboundRunV9,ToolCommandV9,InboundStepResultV9} from '../domain/v9/types.ts';
import {applyToolV9} from '../domain/v9/tools.ts';
/** The temporary reducer result is discarded; only AccountService can consume the tool. */
export const toolPreview=(state:InboundRunV9,command:ToolCommandV9):InboundStepResultV9=>applyToolV9(state,command);
