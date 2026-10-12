import type {GameRun} from '../domain/playable.ts';
import {isInboundRun,isInboundV9,isInboundV11,isInboundV14,isInboundV15,isTieredInbound,isOutboundToolsRun} from '../domain/playable.ts';
import type {ViewState} from './view-types.ts';
import {CREAM,PALETTE,arrow,cargoBox,icon,outlinedText,panel,text} from './assets.ts';
import {drawColorExitHelpDiagram} from './color-exit-renderer.ts';
import {drawToolIcon} from './tool-art.ts';
import {helpTopic} from './static-help.ts';
import {isInfiniteInbound} from './ui.ts';

type Context=CanvasRenderingContext2D;
type DrawHelpControls=(ctx:Context,state:GameRun,view:ViewState)=>void;

/** Help paints static explanations and reuses the host's single control renderer. */
export function drawHelpScreen(ctx:Context,state:GameRun,view:ViewState,drawControls:DrawHelpControls):boolean {
 if(view.screen==='helpMenu')drawHelpMenu(ctx,state,view,drawControls);
 else if(view.screen==='colorIntro')drawHelp(ctx,state,view,drawControls);
 else if(view.screen==='toolsHelp')drawToolsHelp(ctx,state,view,drawControls);
 else if(view.screen==='helpDetails')drawHelpDetails(ctx,state,view,drawControls);
 else return false;
 return true;
}

function drawHelpMenu(ctx:Context,state:GameRun,view:ViewState,drawControls:DrawHelpControls):void {
 outlinedText(ctx,'玩法说明',540,250,62,CREAM,'center');
 text(ctx,'选择要查看的玩法',540,365,28,'#e4e4d7','center',500);
 drawControls(ctx,state,view);
}

function drawHelp(ctx:Context,state:GameRun,view:ViewState,drawControls:DrawHelpControls):void {
  const outbound=helpTopic(state,view)==='outbound';
  outlinedText(ctx,outbound?'出库玩法':'入库玩法',540,250,62,CREAM,'center');
  const basics=outbound?[
    '同类货物上下左右相连，至少4件。',
    '货物连到同色出口，并从南入口留一条空路到货物旁。',
    view.helpFromHome?'普通30批过关，无限持续；放不下且道具无法救场时结束。':isOutboundToolsRun(state)?`${state.rulesetVersion===13?'无限持续出货':'出货30批过关'}；放不下且道具无法救场时结束。`:state.rulesetVersion===10?'无限持续出货；入口堵塞或货件全放不下时结束。':state.rulesetVersion===8?'出货30批过关；入口堵塞或货件全放不下时结束。':'出货30批过关；货件全放不下时结束。',
  ]:[
    '按订单配货，同类货物上下左右相连。',
    '数量达标，出货口到货物旁留出空路。',
    view.helpFromHome?'五班共30单，完成后可继续无限。':[18,20,21].includes(state.rulesetVersion)?state.mode==='rush'?'加急共5班、30单，完成后本局结束。':isInfiniteInbound(state)?'无限持续接单；放不下且道具无法救场时结束。':'五班共30单，完成后可继续无限。':isInboundRun(state)?'旋转工具可改朝向；道具可在放不下时救场。':'货件不能旋转；所有货件都放不下时结束。',
  ];
  basics.forEach((line,index)=>wrap(ctx,line,140,365+index*78,800,28,36));
  if(outbound)drawColorExitHelpDiagram(ctx,{x:140,y:640,w:800,h:430},view.helpFromHome||!!('colorTier' in state?state.colorTier:undefined)||!!('difficultyId' in state?state.difficultyId:undefined),view.helpFromHome?{boardSize:9}:state);
  else drawInboundHelpDiagram(ctx);
  drawControls(ctx,state,view);
}

function drawToolsHelp(ctx:Context,state:GameRun,view:ViewState,drawControls:DrawHelpControls):void {
  outlinedText(ctx,'道具说明',540,250,62,CREAM,'center');
  text(ctx,'最多携带2种，每种1件',540,352,30,'#ffe3a3','center',600);
  text(ctx,'确认使用才消耗；取消不扣，未用的结束后退回',540,410,26,'#d5e7df','center',500);
  const rows=[
    {item:'rotate' as const,title:'旋转',lines:['旋转选中的待放货件，改变朝向。']},
    {item:'clear' as const,title:'清障',lines:['清除棋盘上1至2个有货物或废弃箱的格子。']},
    {item:'wildcard' as const,title:'万能',lines:['入库：将待放货件换成单格万能箱。','出库：换成单格，自选货类。']},
  ];
  rows.forEach((row,index)=>{const y=500+index*320;panel(ctx,{x:132,y,w:816,h:284},'#20394b','#587586',20);drawToolIcon(ctx,row.item,166,y+30,105);text(ctx,row.title,294,y+84,36,'#ffe8b4','left',800);row.lines.forEach((line,i)=>wrap(ctx,line,170,y+168+i*54,740,27,34));});
  drawControls(ctx,state,view);
}

function drawInboundHelpDiagram(ctx:Context):void {
  panel(ctx,{x:140,y:640,w:800,h:430},'#20394b','#587586',14);
  const origin={x:205,y:725},cell=66;
  for(let row=0;row<4;row++)for(let col=0;col<4;col++){ctx.fillStyle='#56636a';ctx.fillRect(origin.x+col*cell+1,origin.y+row*cell+1,cell-2,cell-2);}
  for(let col=0;col<4;col++)cargoBox(ctx,'cargo.food',origin.x+col*cell+3,origin.y+cell+3,cell-6);
  ctx.strokeStyle='#9edfff';ctx.lineWidth=5;ctx.setLineDash([12,9]);ctx.beginPath();ctx.moveTo(370,685);ctx.lineTo(370,758);ctx.stroke();ctx.setLineDash([]);
  arrow(ctx,370,725,20,Math.PI/2,'#9edfff');
  icon(ctx,'cargo.food',570,756,44,PALETTE['cargo.food'].light);text(ctx,'食品 4/4件',610,756,29,CREAM);
  text(ctx,'数量达标',570,837,28,'#d9ffc1');text(ctx,'留出空路即可出货',570,900,25,'#d9ffc1');
  text(ctx,'虚线：叉车通路',340,1030,23,'#9edfff','center');
}

function drawHelpDetails(ctx:Context,state:GameRun,view:ViewState,drawControls:DrawHelpControls):void {
  if(view.helpFromHome||isInboundV14(state)||isInboundV15(state)||isTieredInbound(state)){
    outlinedText(ctx,'特殊货物与加急',540,250,58,CREAM,'center');
    const shared=[
      '双倍箱：占1格，计2件；万能可连接订单货类。',
      '危险品：按货类凑单，可正常出货。',
    ];
    shared.forEach((line,index)=>text(ctx,line,150,405+index*91,27,'#d5e7df','left',500));
    text(ctx,'加急模式',150,680,33,'#ffe3a3','left',800);
    const rush=[
      '开局选择清扫：每完成2单，或每成功放置6次。',
      '加急数字按后续成功放置次数倒数，不是倒计时',
      '第5班新补充的货件全部加急。',
      '待放区里的加急货不扣数；归零变为废弃箱，占格且不能出货。',
      '每次触发清扫1格旧废弃箱；没有废弃箱也重新计数。',
      '加急模式中，危险品随订单出货时，清除整组货物旁1格废弃箱。',
    ];
    rush.forEach((line,index)=>wrap(ctx,line,150,765+index*96,780,27,36));
    drawControls(ctx,state,view);return;
  }
  outlinedText(ctx,(isInboundV11(state)||isInboundV14(state)||isInboundV15(state)||isTieredInbound(state))?'特殊货物':'特殊货物与升级',540,250,58,CREAM,'center');
  const rules=isInboundRun(state)?[
    '双倍箱：占1格，计2件；万能可连接订单货类。',
    '加急放下剩3次，之后先出货再扣数。',
    '期限归零成为废弃箱，占格、不出货。',
    '清扫二选一：每2单，或每6次有效放置。',
    '清扫只清旧废弃箱；没有废弃箱时也会重新计数。',
    ...(isInboundV9(state)?['减量：当前和新订单都少1件，最低3件。','扩仓、候选扩容、公共侧门与奖金立即生效。']:[]),
  ]:[
    '托盘：占1格，计2件。',
    '万能：可连接当前订单的货类。',
    '加急：后续有效放置后倒数，归零变为废弃箱。',
    '废弃箱：占格，不出货。',
    '危险品：出货时清理相邻废弃箱。',
    '穿托盘：叉车通过后，托盘仍留在原格。',
    '侧门：所有订单共用。',
    '额外清理不计分；减量升级只影响后续新单。',
    '每次放置检查原有订单，新单等下一次放置。',
  ];
  rules.forEach((line,index)=>text(ctx,line,150,415+index*103,27,'#d5e7df','left',500));
  drawControls(ctx,state,view);
}

function wrap(ctx: Context, value: string, x: number, y: number, width: number, fontSize = 27, lineHeight = 43): void {
  let line = '', lineY = y;
  ctx.font = `500 ${fontSize}px "Noto Sans CJK SC", "PingFang SC", "Microsoft YaHei", sans-serif`;
  for (const char of value) {
    if (char === '\n' || ctx.measureText(line + char).width > width) { text(ctx, line, x, lineY, fontSize, '#d5dce1', 'left', 500); line = char === '\n' ? '' : char; lineY += lineHeight; }
    else line += char;
  }
  if (line) text(ctx, line, x, lineY, fontSize, '#d5dce1', 'left', 500);
}
