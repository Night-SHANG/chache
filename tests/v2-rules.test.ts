import test from 'node:test';
import assert from 'node:assert/strict';
import { createRunV2, applyCommandV2, previewPlacementV2, findLegalMovesV2, generatePieceV2, generateUpgradeChoicesV2 } from '../src/domain/v2/engine.ts';
import { orderStatusV2, selectOrderGroupV2 } from '../src/domain/v2/board.ts';
import { UPGRADES_V2, RULES_V2_CONFIG } from '../src/domain/v2/content.ts';
import { SHAPES } from '../src/domain/content.ts';
import type { RunState, CargoId, Order, Shipment, CellTrait, Piece } from '../src/domain/types.ts';
const F: CargoId = 'cargo.food', M: CargoId = 'cargo.machine', C: CargoId = 'cargo.chem', K: CargoId = 'cargo.cold';
function fixture(seed = 42): RunState {
  const state = createRunV2(seed); state.board.fill(null); state.cellTraits!.fill(null);
  state.candidates = [{id:'test-piece', shapeId:'shape.single', cargo:K}]; state.orders = []; return state;
}
function order(dockId = 'dock.north', cargo: CargoId = F, amount = 3, id = 'old'): Order { return {id,dockId,cargo,amount,baseScore:100}; }
function put(state: RunState,cargo: CargoId,cells: number[],trait?: CellTrait) { for (const cell of cells) {state.board[cell]=cargo;state.cellTraits![cell]=trait?{...trait}:null;} }
function place(state: RunState,x=0,y=0) { return applyCommandV2(state,{type:'place',pieceId:'test-piece',origin:{x,y}}); }
function shipments(result: ReturnType<typeof place>): Shipment[] { return result.events.filter(e=>e.type==='shipment'); }
function freeze<T>(value:T):T {if(value&&typeof value==='object'){Object.freeze(value);for(const child of Object.values(value))freeze(child);}return value;}
function checkMetadata(state:RunState){assert.equal(state.cellTraits!.length,49);for(let i=0;i<49;i++)if(state.board[i]===null)assert.equal(state.cellTraits![i],null);assert.ok(Number.isInteger(state.generatedPieces));}

test('v2 starts with explicit version, aligned metadata, and counted deterministic generation',()=>{
  const state=createRunV2(100);assert.equal(state.rulesetVersion,2);assert.equal(state.runConfigId,'run.standard_v2');assert.equal(state.generatedPieces,3);
  checkMetadata(state);assert.deepEqual(state,createRunV2(100));assert.deepEqual(createRunV2(100,'daily').candidates,state.candidates);
  assert.ok(state.candidates.every(p=>!p.trait));assert.equal(RULES_V2_CONFIG.balanced,false);
});
test('18 upgrades have unique IDs, precise source metadata, positive caps and explicit contract fields',()=>{
  assert.equal(UPGRADES_V2.length,18);assert.equal(new Set(UPGRADES_V2.map(u=>u.id)).size,18);
  for(const u of UPGRADES_V2){assert.ok(u.maxStack>0);assert.ok(u.minShift!>=1);assert.ok(u.tags!.length);assert.ok(Array.isArray(u.prerequisites));assert.ok(Array.isArray(u.conflicts));assert.ok(Object.keys(u.params!).length);assert.ok(u.sourceRef?.includes('01-rules'));}
  assert.equal(UPGRADES_V2.filter(u=>u.provisional).length,12);
});
test('Pallet meets three units with two physical cells and overfill uses units',()=>{
  const state=fixture();put(state,F,[15],{kind:'pallet'});put(state,F,[16]);state.orders=[order()];
  assert.equal(orderStatusV2(state,state.orders[0]).count,3);const out=shipments(place(state))[0];assert.deepEqual(out.cells,[15,16]);assert.equal(out.units,3);
  put(state,F,[17]);assert.ok(shipments(place(state))[0].score>out.score);
});
test('waste is occupied but excluded from all cargo connectivity and order counts',()=>{
  const state=fixture();put(state,F,[15,17]);put(state,F,[16],{kind:'waste'});state.orders=[order()];
  assert.equal(orderStatusV2(state,state.orders[0]).count,1);assert.equal(shipments(place(state)).length,0);assert.ok(place(state,2,2).error);
});
test('Rush does not age on its own placement, then expires after three later successful placements',()=>{
  let state=fixture();state.candidates[0]={...state.candidates[0],cargo:F,trait:'rush',rushTurns:3};
  let result=place(state,1,1);state=result.state;assert.equal(state.cellTraits![8]?.remaining,3);
  for(let turn=1;turn<=3;turn++){state.candidates=[{id:'test-piece',shapeId:'shape.single',cargo:K}];state.orders=[];result=place(state,turn,6);state=result.state;
    if(turn<3)assert.equal(state.cellTraits![8]?.remaining,3-turn);else{assert.deepEqual(state.cellTraits![8],{kind:'waste'});assert.deepEqual(result.events.find(e=>e.type==='rushExpired'),{type:'rushExpired',cells:[8]});}}
  assert.equal(state.board[8],F);checkMetadata(state);
});
test('Rush can ship on its final allowed placement before expiration and before new orders appear',()=>{
  const state=fixture();put(state,F,[15],{kind:'rush',remaining:1,bornAtCommand:0});put(state,F,[16,17]);state.orders=[order()];state.commandIndex=4;
  const result=place(state);assert.equal(shipments(result).length,1);assert.ok(!result.events.some(e=>e.type==='rushExpired'));assert.equal(result.state.cellTraits![15],null);
});
test('invalid moves and upgrade selection do not decrement Rush or mutate input',()=>{
  const state=fixture();put(state,F,[8],{kind:'rush',remaining:2,bornAtCommand:0});const before=JSON.stringify(state);
  const invalid=place(state,1,1);assert.equal(invalid.state,state);assert.equal(JSON.stringify(state),before);
  state.phase='upgrade';state.upgradeChoices=['upgrade.contract'];const chosen=applyCommandV2(state,{type:'upgrade',upgradeId:'upgrade.contract'}).state;
  assert.equal(chosen.cellTraits![8]?.remaining,2);assert.deepEqual(chosen.rngState,state.rngState);
});
test('Hazard clears only the first scanned adjacent waste, or two with clearance',()=>{
  const state=fixture();put(state,F,[15],{kind:'hazard'});put(state,F,[16,17]);put(state,M,[8,14,22],{kind:'waste'});put(state,M,[9]);state.orders=[order()];
  const normal=place(state);assert.deepEqual(shipments(normal)[0].extraClearedCells,[8]);assert.equal(normal.state.board[9],M);assert.equal(normal.state.board[14],M);
  state.upgrades=['upgrade.hazard_clearance'];const upgraded=place(state);assert.deepEqual(shipments(upgraded)[0].extraClearedCells,[8,14]);assert.equal(upgraded.state.board[22],M);checkMetadata(upgraded.state);
});
test('Hazard waste clearance opens the next frozen old Dock before resolution continues',()=>{
  const state=fixture();put(state,F,[19],{kind:'hazard'});put(state,F,[18,20]);put(state,M,[31,32,33]);put(state,C,[27],{kind:'waste'});
  state.orders=[order('dock.east',M,3,'second'),order('dock.north',F,3,'first')];assert.equal(orderStatusV2(state,state.orders[0]).status,'blocked');
  const result=place(state);assert.deepEqual(shipments(result).map(s=>s.orderId),['first','second']);assert.deepEqual(shipments(result)[0].extraClearedCells,[27]);
});
test('Wildcard bridges the current Dock cargo and is consumed once in fixed Dock order',()=>{
  const state=fixture();put(state,F,[15,17]);put(state,M,[9,23]);put(state,C,[16],{kind:'wildcard'});
  state.orders=[order('dock.east',M,3,'east'),order('dock.north',F,3,'north')];
  assert.equal(orderStatusV2(state,state.orders[0]).count,3);assert.equal(orderStatusV2(state,state.orders[1]).count,3);
  const result=place(state);assert.deepEqual(shipments(result).map(s=>s.orderId),['north']);assert.deepEqual(shipments(result)[0].cells,[15,16,17]);assert.equal(result.state.board[9],M);
});
test('small-order-first changes wildcard ownership by amount then Dock priority',()=>{
  const state=fixture();put(state,F,[15,17]);put(state,M,[9]);put(state,C,[16],{kind:'wildcard'});
  state.orders=[order('dock.north',F,3,'north'),order('dock.east',M,2,'east')];state.upgrades=['upgrade.small_order_first'];
  assert.deepEqual(shipments(place(state)).map(s=>s.orderId),['east']);
  state.orders[0].amount=2;assert.deepEqual(shipments(place(state)).map(s=>s.orderId),['north']);
});
test('side gate uses southwest empty entry, shortest route, and original Dock on equal length',()=>{
  const state=fixture();put(state,F,[35,36,37]);put(state,M,[3]);state.orders=[order()];assert.equal(shipments(place(state,6,6)).length,0);
  state.upgrades=['upgrade.side_gate'];const result=place(state,6,6);assert.deepEqual(shipments(result)[0].path,[{x:0,y:6}]);
  const tie=fixture();put(tie,F,[21,22,23,24]);tie.upgrades=['upgrade.side_gate'];assert.deepEqual(selectOrderGroupV2(tie,order())!.path[0],{x:3,y:0});
  put(state,M,[42]);assert.equal(shipments(place(state,6,6)).length,0);
});
test('side gate cannot enter occupied target group or jump through cargo',()=>{
  const state=fixture();put(state,F,[42,43,44]);put(state,M,[3]);state.upgrades=['upgrade.side_gate'];state.orders=[order()];assert.equal(shipments(place(state)).length,0);
});
function corridor():RunState{const state=fixture();state.board.fill(C);state.cellTraits!.fill(null);for(const i of [3,10,24,27,26,25,48])state.board[i]=null;put(state,F,[31],{kind:'pallet'});put(state,M,[17],{kind:'pallet'});state.orders=[order('dock.north',F,2,'first')];return state;}
test('pallet pass crosses exactly one non-target pallet and never clears it',()=>{
  const state=corridor();assert.equal(shipments(place(state,6,6)).length,0);state.upgrades=['upgrade.pallet_pass'];
  const out=place(state,6,6);assert.equal(shipments(out).length,1);assert.equal(shipments(out)[0].usedPalletPass,true);assert.ok(shipments(out)[0].path.some(p=>p.x===3&&p.y===2));assert.equal(out.state.cellTraits![17]?.kind,'pallet');
  put(state,M,[10],{kind:'pallet'});assert.equal(shipments(place(state,6,6)).length,0);
});
test('pallet pass expires after first shipment even when first used only ordinary empty paths',()=>{
  const state=corridor();put(state,K,[4]);state.orders=[order('dock.north',K,1,'first'),order('dock.east',M,2,'second')];
  // East route has a pallet barrier before a separate pallet cargo target.
  state.board[26]=C;state.cellTraits![26]={kind:'pallet'};state.board[17]=M;state.cellTraits![17]={kind:'pallet'};state.upgrades=['upgrade.pallet_pass'];
  const out=shipments(place(state,6,6));assert.deepEqual(out.map(s=>s.orderId),['first']);
});
test('route sweep and extra pickup execute before the next old order and disclose all extra cells',()=>{
  const state=fixture();put(state,F,[15,16,17]);put(state,M,[2],{kind:'waste'});put(state,C,[4]);put(state,M,[9],{kind:'pallet'});state.orders=[order()];state.upgrades=['upgrade.sweep_route','upgrade.extra_pickup'];
  const result=place(state,6,6);assert.deepEqual(shipments(result)[0].extraClearedCells,[2,4]);assert.equal(result.state.board[9],M);assert.equal(result.state.cellTraits![9]?.kind,'pallet');checkMetadata(result.state);
});
test('preview is immutable and exactly predicts trait resolution, extra clearing, and score',()=>{
  const state=fixture();put(state,F,[15],{kind:'hazard'});put(state,F,[16],{kind:'pallet'});put(state,M,[8],{kind:'waste'});state.orders=[order()];state.upgrades=['upgrade.sweep_route'];
  const before=JSON.stringify(state);const command={type:'place' as const,pieceId:'test-piece',origin:{x:0,y:0}};freeze(state);
  const preview=previewPlacementV2(state,command.pieceId,command.origin);const result=applyCommandV2(state,command);assert.equal(preview.valid,true);assert.deepEqual(preview.shipments,shipments(result));assert.equal(JSON.stringify(state),before);
  command.origin.x=6;assert.equal(result.state.commands[0].type==='place'&&result.state.commands[0].origin.x,0);checkMetadata(result.state);
});
test('four choices immediately adds a fourth slot and checks all four for remaining legal moves',()=>{
  const state=fixture();state.phase='upgrade';state.upgradeChoices=['upgrade.four_choices'];state.candidates=Array.from({length:3},(_,i)=>({id:`large.${i}`,shapeId:'shape.domino_h',cargo:F}));
  const result=applyCommandV2(state,{type:'upgrade',upgradeId:'upgrade.four_choices'});assert.equal(result.state.candidates.length,4);assert.equal(result.state.generatedPieces,state.generatedPieces!+1);
  result.state.board.fill(M);result.state.cellTraits!.fill(null);result.state.board[48]=null;result.state.candidates[3]={id:'small',shapeId:'shape.single',cargo:F};assert.deepEqual(findLegalMovesV2(result.state),[{pieceId:'small',origin:{x:6,y:6}}]);
});
test('light orders reduces only subsequent minimum and keeps old orders unchanged',()=>{
  let found=false;
  for(let seed=0;seed<40;seed++){const state=fixture(seed);state.upgrades=['upgrade.light_orders'];state.orders=[order('dock.north',F,5,'preserved')];const result=place(state).state;
    assert.equal(result.orders.find(o=>o.id==='preserved')?.amount,5);assert.ok(result.orders.every(o=>o.amount>=2));if(result.orders.some(o=>o.id!=='preserved'&&o.amount===2))found=true;}
  assert.ok(found);
});
test('stock orders weights fresh non-duplicate cargo from real non-waste inventory',()=>{
  let base=0,boosted=0;
  for(let seed=0;seed<200;seed++){const state=fixture(seed);put(state,F,[0,1,2,7,8,9,14,15,16]);const plain=place(state,6,6).state;state.upgrades=['upgrade.stock_orders'];const changed=place(state,6,6).state;
    if(plain.orders[0].cargo===F)base++;if(changed.orders[0].cargo===F)boosted++;assert.equal(new Set(changed.orders.map(o=>o.cargo)).size,changed.orders.length);}
  assert.ok(boosted>base+15,`${boosted} vs ${base}`);
});
test('special generation is single-cell, starts Shift3 and fixed pallet supply counts all generated pieces',()=>{
  const observed=new Set<string>();let specials=0;
  for(let seed=0;seed<300;seed++){const state=fixture(seed);state.shift=3;state.completedOrders=12;
    for(let i=0;i<5;i++){const p=generatePieceV2(state);if(p.trait){observed.add(p.trait);specials++;assert.equal(p.shapeId,'shape.single');if(p.trait==='rush')assert.equal(p.rushTurns,3);}}}
  assert.deepEqual([...observed].sort(),['hazard','pallet','rush','wildcard']);assert.ok(specials>50);
  const state=fixture();state.upgrades=['upgrade.pallet_supply'];state.shift=3;state.generatedPieces=3;assert.equal(generatePieceV2(state).trait,'pallet');assert.equal(state.generatedPieces,4);
  state.shift=2;state.generatedPieces=7;assert.equal(generatePieceV2(state).trait,undefined);
});
test('Rush buffer adds two future turns and Wild supply raises wildcard weight with fixed total',()=>{
  let ordinary=0,boost=0,rushChecked=false;
  for(let seed=0;seed<300;seed++){const state=fixture(seed);state.shift=3;const base=generatePieceV2(structuredClone(state));state.upgrades=['upgrade.rush_buffer','upgrade.wild_supply'];const modified=generatePieceV2(state);
    if(base.trait==='wildcard')ordinary++;if(modified.trait==='wildcard')boost++;if(modified.trait==='rush'){assert.equal(modified.rushTurns,5);rushChecked=true;}}
  assert.ok(boost>ordinary);assert.ok(rushChecked);
});
test('all seven reachable upgrade selections retain three distinct eligible choices with two behaviors',()=>{
  for(let seed=0;seed<80;seed++){const state=fixture(seed);for(let selection=1;selection<=7;selection++){
    state.completedOrders=selection*4;state.shift=Math.floor(state.completedOrders/6)+1;
    const choices=generateUpgradeChoicesV2(state);assert.equal(choices.length,3);assert.equal(new Set(choices).size,3);
    assert.ok(choices.filter(id=>UPGRADES_V2.find(u=>u.id===id)!.behavior).length>=2);
    for(const id of choices){const u=UPGRADES_V2.find(u=>u.id===id)!;assert.ok(state.upgrades.filter(x=>x===id).length<u.maxStack);assert.ok(u.minShift!<=state.shift);}
    state.upgrades.push(choices[selection%3]);}}
});
test('upgrade selection rejects exhausted, too-early and unoffered IDs even if state choices are malformed',()=>{
  for(const id of ['upgrade.hazard_clearance','upgrade.side_gate']){const state=fixture();state.phase='upgrade';state.upgradeChoices=[id];if(id==='upgrade.side_gate')state.upgrades=[id];assert.ok(applyCommandV2(state,{type:'upgrade',upgradeId:id}).error);}
});
test('generation scoring and all retained v1 upgrade effects remain real deterministic modifiers',()=>{
  const state=fixture();put(state,F,[0,1,2,7]);put(state,M,[35,36,37]);state.orders=[order('dock.north',F,3,'first'),order('dock.east',M,3,'second')];const plain=shipments(place(state,6,6));
  for(const id of ['overfill','contract']){state.upgrades=[`upgrade.${id}`];assert.ok(shipments(place(state,6,6))[0].score>plain[0].score);}
  for(const id of ['chain','variety','deep_route']){state.upgrades=[`upgrade.${id}`];assert.ok(shipments(place(state,6,6))[1].score>plain[1].score);}
  let small=0,boost=0;
  for(let seed=0;seed<120;seed++){const base=fixture(seed);const upgraded=structuredClone(base);upgraded.upgrades=Array<string>(3).fill('upgrade.small_parcels');const size=(p:Piece)=>SHAPES.find(s=>s.id===p.shapeId)!.cells.length;
    if(size(generatePieceV2(base))<=2)small++;if(size(generatePieceV2(upgraded))<=2)boost++;}
  assert.ok(boost>small);
});
test('new orders never join old frozen chain and successful final state retains valid metadata',()=>{
  const state=fixture();put(state,F,[15,16,17]);put(state,M,[35,36,37,42,43,44]);state.orders=[order()];const result=place(state,6,0);assert.equal(shipments(result).length,1);assert.equal(shipments(result)[0].orderId,'old');checkMetadata(result.state);
  state.completedOrders=29;state.shift=5;const won=place(state,6,0);assert.equal(won.state.result,'won');checkMetadata(won.state);
});
test('valid placed special must use one cell, unknown traits and malformed Rush are rejected atomically',()=>{
  for(const piece of [{id:'test-piece',shapeId:'shape.domino_h',cargo:F,trait:'pallet'},{id:'test-piece',shapeId:'shape.single',cargo:F,trait:'rush',rushTurns:0}]){
    const state=fixture();state.candidates=[piece as Piece];const result=place(state);assert.ok(result.error);assert.equal(result.state,state);}
});
test('light orders reduces each new drawn requirement by one without changing the old order or RNG sequence',()=>{
  for(let seed=0;seed<40;seed++){
    const base=fixture(seed);base.orders=[order('dock.north',F,5,'preserved')];const lowered=structuredClone(base);lowered.upgrades=['upgrade.light_orders'];
    const plain=place(base).state,changed=place(lowered).state;
    assert.equal(changed.orders[0].amount,5);assert.equal(changed.orders[1].amount,Math.max(2,plain.orders[1].amount-1));assert.deepEqual(changed.rngState,plain.rngState);
  }
});
test('order reason distinguishes insufficient units, both occupied entries and internal route blockage',()=>{
  const state=fixture();const active=order();assert.equal(orderStatusV2(state,active).reason,'insufficient');put(state,F,[15,16,17]);
  assert.equal(orderStatusV2(state,active).reason,'ready');put(state,M,[3]);assert.equal(orderStatusV2(state,active).reason,'entry-blocked');
  state.upgrades=['upgrade.side_gate'];assert.equal(orderStatusV2(state,active).reason,'ready');put(state,M,[42]);assert.equal(orderStatusV2(state,active).reason,'entry-blocked');
  const enclosed=fixture();put(enclosed,F,[23,24,25]);put(enclosed,M,[16,17,18,22,26,30,31,32]);assert.equal(orderStatusV2(enclosed,active).reason,'route-blocked');
});
test('every branch of seven upgrade choices is safe, including repeatedly exhausting selected behavior caps',()=>{
  let offers=0;
  for(const seed of [1,13,927]){
    const visit=(state:RunState,selection:number):void=>{
      if(selection===8)return;state.completedOrders=selection*4;state.shift=Math.min(5,Math.floor(state.completedOrders/6)+1);
      const choices=generateUpgradeChoicesV2(state);offers++;assert.equal(new Set(choices).size,3);
      assert.ok(choices.filter(id=>UPGRADES_V2.find(u=>u.id===id)!.behavior).length>=2,`seed ${seed}, step ${selection}, owned ${state.upgrades.join(',')}`);
      for(const id of choices){const next=structuredClone(state);next.upgrades.push(id);visit(next,selection+1);}
    };visit(fixture(seed),1);
  }
  assert.equal(offers,3279);
});
test('deterministic fallback still returns three distinct choices and two behaviors when all offer weights are zero',()=>{
  const original=UPGRADES_V2.map(u=>u.params!.baseWeight);
  try{
    for(const upgrade of UPGRADES_V2)upgrade.params!.baseWeight=0;
    const a=fixture(1),b=fixture(998),before=[...a.rngState];const first=generateUpgradeChoicesV2(a),second=generateUpgradeChoicesV2(b);
    assert.deepEqual(first,second);assert.equal(new Set(first).size,3);assert.ok(first.filter(id=>UPGRADES_V2.find(u=>u.id===id)!.behavior).length>=2);assert.deepEqual(a.rngState,before);
  }finally{UPGRADES_V2.forEach((u,i)=>{u.params!.baseWeight=original[i];});}
});
test('extra pickup clears normal non-target cargo without counting orders or adding points, and only once',()=>{
  const state=fixture();put(state,F,[15,16,17]);put(state,M,[4,5]);state.orders=[order()];const base=place(state,6,6);state.upgrades=['upgrade.extra_pickup'];const changed=place(state,6,6);
  assert.equal(changed.state.completedOrders,base.state.completedOrders);assert.equal(changed.state.score,base.state.score);assert.deepEqual(shipments(changed)[0].extraClearedCells,[4]);assert.equal(changed.state.board[5],M);
});
test('wildcards and physical Pallet quantities use the same group ranking in selectors and previews',()=>{
  const state=fixture();put(state,F,[1,2]);put(state,F,[4],{kind:'pallet'});put(state,C,[5],{kind:'wildcard'});state.orders=[order('dock.north',F,2)];
  assert.equal(orderStatusV2(state,state.orders[0]).count,3);assert.deepEqual(previewPlacementV2(state,'test-piece',{x:0,y:6}).shipments[0].cells,[4,5]);
});
test('generation inventory weighting excludes waste but still treats it as spatial occupancy',()=>{
  const waste=fixture(772);put(waste,F,[0,1,2,7,8,9],{kind:'waste'});waste.upgrades=['upgrade.stock_orders'];
  const other=structuredClone(waste);for(const i of [0,1,2,7,8,9])other.board[i]=M;
  // Equal occupied space, zero live inventory, and identical random state must produce the same future content.
  const a=place(waste,6,6).state,b=place(other,6,6).state;assert.deepEqual(a.orders,b.orders);assert.deepEqual(a.candidates,b.candidates);assert.deepEqual(a.rngState,b.rngState);
});
test('special generated countdown stays frozen in tray until actual placement and illegal input consumes no count',()=>{
  const state=fixture();state.candidates.push({id:'tray-rush',shapeId:'shape.single',cargo:F,trait:'rush',rushTurns:5});
  const rejected=place(state,-1,0);assert.equal(rejected.state.generatedPieces,state.generatedPieces);
  const changed=place(state).state;assert.equal(changed.candidates.find(p=>p.id==='tray-rush')?.rushTurns,5);assert.ok(changed.cellTraits!.every(t=>t?.kind!=='rush'));
});
