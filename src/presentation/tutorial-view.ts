import type {GameRun} from '../domain/playable.ts';import {isInboundRun} from '../domain/playable.ts';import {inboundPieceCells} from './inbound-helpers.ts';import {SHAPES} from '../domain/content.ts';import type {ViewState} from './view-types.ts';import {boardGeometry} from './board-geometry.ts';import {text} from './assets.ts';
/** A hint marks only the real next piece's cells; it never changes the simulation. */
export function drawGuide(ctx:CanvasRenderingContext2D,state:GameRun,view:ViewState):void {
 const guide=view.guide;if(!guide)return;const geometry=boardGeometry(state),piece=state.candidates.find(p=>p.id===guide.selectedPieceId);const offsets=piece?isInboundRun(state)?inboundPieceCells(state.candidates.find(p=>p.id===piece.id)!,state.rulesetVersion):SHAPES.find(s=>s.id===piece.shapeId)?.cells??[]:[];
 ctx.save();ctx.strokeStyle='#ffe58d';ctx.lineWidth=4;ctx.setLineDash([11,9]);for(const origin of guide.allowedOrigins??[])for(const offset of offsets){const x=geometry.x+(origin.x+offset.x)*geometry.cell+6,y=geometry.y+(origin.y+offset.y)*geometry.cell+6;ctx.strokeRect(x,y,geometry.cell-12,geometry.cell-12);}ctx.setLineDash([]);
 const short:Record<string,string>={place:'拖动提示货件，放到虚线格。',order:'同图标上下左右相连，凑够订单数量。',route:'留出连续空路，让叉车接近货物。',upgrade:'第4单完成，选择一项真实升级。',sweepChoice:'选择按单清扫或定期清扫，本局不能改选。',rushTimer:'加急每次有效放置先出货，再扣到2、1。',expired:'加急归零成为废物，清扫只处理旧废物。',colorGroup:'同图标上下左右相连，斜角不连通。',colorExit:'食品连北出口，化工连东出口，机械连西出口。',mixedRemainder:'双色货分别出货，余色保留原格。'};
 text(ctx,short[guide.step]??guide.text,540,507,22,'#ffe3a3','center');ctx.restore();
}
