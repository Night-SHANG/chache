import {applyCommand,previewPlacement} from '../../src/domain/engine.ts';import type {RunState,Point} from '../../src/domain/types.ts';
/** The old preview uses its frozen reducer; supply the accepted-event contract for shared ViewState. */
export function legacyPresentationPreview(state:RunState,pieceId:string,origin:Point){const preview=previewPlacement(state,pieceId,origin),step=preview.valid?applyCommand(state,{type:'place',pieceId,origin}):undefined;return {...preview,events:step?.events??[],...(step?{stateAfter:step.state}:{})};}
