import test from 'node:test';
import assert from 'node:assert/strict';
import { createRunV3, applyCommandV3 } from '../src/domain/v3/engine.ts';
import type { RunState, CargoId, Order, CellTrait, Command, CommandResult, Shipment } from '../src/domain/types.ts';
import { createCoverage, observeInitial, observeCommand } from '../qa/large-scan/observe.ts';
const F:CargoId='cargo.food', M:CargoId='cargo.machine', C:CargoId='cargo.chem', K:CargoId='cargo.cold';
function fixture(seed=42):RunState {
  const state=createRunV3(seed);state.board.fill(null);state.cellTraits!.fill(null);
  state.candidates=[{id:'test-piece',shapeId:'shape.single',cargo:K}];state.orders=[];return state;
}
function order(dockId='dock.north',cargo:CargoId=F,amount=3,id='old'):Order{return {id,dockId,cargo,amount,baseScore:100};}
function put(state:RunState,cargo:CargoId,cells:number[],trait?:CellTrait):void{for(const i of cells){state.board[i]=cargo;state.cellTraits![i]=trait?{...trait}:null;}}
function placed(state:RunState,x=6,y=6):{command:Command;result:CommandResult}{const command:Command={type:'place',pieceId:state.candidates[0].id,origin:{x,y}};return {command,result:applyCommandV3(state,command)};}
function observe(state:RunState,x=6,y=6){const coverage=createCoverage(),{command,result}=placed(state,x,y);assert.equal(result.error,undefined);observeCommand(coverage,state,command,result);return {coverage,result,command};}
function shipments(result:CommandResult):Shipment[]{return result.events.filter(e=>e.type==='shipment');}
function freeze<T>(value:T):T{if(value&&typeof value==='object'){Object.freeze(value);for(const child of Object.values(value))freeze(child);}return value;}
function clean(coverage:ReturnType<typeof createCoverage>):void{assert.deepEqual(coverage.anomalies,{});}

test('initial generated pieces include all candidates without attributing held upgrades',()=>{
  const state=createRunV3(100),coverage=createCoverage();observeInitial(coverage,freeze(state));
  assert.equal(coverage.traits.generated.normal,3);assert.equal(coverage.generatedPieces,3);
  assert.ok(Object.values(coverage.actualEffects).every(n=>n===0));clean(coverage);
  assert.deepEqual(JSON.parse(JSON.stringify(coverage)),coverage);
});
test('observer reads frozen before/command/result without changing state or RNG and retains detached first witness',()=>{
  const state=fixture();put(state,F,[15,16,17]);state.orders=[order()];state.upgrades=['upgrade.contract'];
  const {command,result}=placed(state),before=JSON.stringify({state,command,result});const coverage=createCoverage();
  observeCommand(coverage,freeze(state),freeze(command),freeze(result));assert.equal(JSON.stringify({state,command,result}),before);
  assert.equal(coverage.actualEffects.contract,1);assert.equal(coverage.firstWitness.contract.commandIndex,1);
  assert.deepEqual(coverage.firstWitness.contract.command,command);clean(coverage);
});
test('rejected command and bare upgrade selection never count effects or age rush',()=>{
  const state=fixture();put(state,F,[48],{kind:'rush',remaining:1,bornAtCommand:0});const coverage=createCoverage();
  const rejected=placed(state);observeCommand(coverage,state,rejected.command,rejected.result);
  assert.equal(coverage.rejectedCommands,1);assert.equal(coverage.rushExpired.cells,0);
  state.phase='upgrade';state.upgradeChoices=['upgrade.contract'];const command:Command={type:'upgrade',upgradeId:'upgrade.contract'};
  observeCommand(coverage,state,command,applyCommandV3(state,command));assert.equal(coverage.actualEffects.contract,0);clean(coverage);
});
test('four choices immediately records only verified fourth generation, including a forced ordinal-four pallet',()=>{
  const state=createRunV3(3);state.shift=3;state.completedOrders=12;state.phase='upgrade';state.upgrades=['upgrade.pallet_supply'];state.upgradeChoices=['upgrade.four_choices'];
  const coverage=createCoverage();observeInitial(coverage,state);const command:Command={type:'upgrade',upgradeId:'upgrade.four_choices'},result=applyCommandV3(state,command);observeCommand(coverage,state,command,result);
  assert.equal(coverage.generatedPieces,4);assert.equal(coverage.traits.generated.pallet,1);assert.equal(coverage.actualEffects.four_choices,1);assert.equal(coverage.actualEffects.pallet_supply,1);clean(coverage);
});
test('ordinary replacements, rather than retained candidates, are counted as new generation',()=>{
  const state=createRunV3(20),coverage=createCoverage();observeInitial(coverage,state);const {command,result}=placed(state,0,0);assert.equal(result.error,undefined);observeCommand(coverage,state,command,result);
  assert.equal(coverage.generatedPieces,4);assert.equal(coverage.traits.placed.normal,1);clean(coverage);
});
test('generated count mismatch cannot create a forced pallet effect witness',()=>{
  const state=fixture();state.shift=3;state.completedOrders=12;state.upgrades=['upgrade.pallet_supply'];
  const {command,result}=placed(state);result.state.generatedPieces!++;const coverage=createCoverage();assert.throws(()=>observeCommand(coverage,state,command,result),/generation.count/);
  assert.ok(coverage.anomalies['generation.count']);assert.equal(coverage.actualEffects.pallet_supply,0);
});
test('score upgrades require scored shipments and their own nonzero condition',()=>{
  const state=fixture();put(state,F,[0,1,2,7]);put(state,M,[35,36,37]);state.orders=[order('dock.north',F,3,'first'),order('dock.east',M,3,'second')];
  state.upgrades=['upgrade.contract','upgrade.overfill','upgrade.deep_route','upgrade.chain','upgrade.variety'];
  const {coverage,result}=observe(state);assert.equal(shipments(result).length,2);
  assert.equal(coverage.actualEffects.contract,2);assert.equal(coverage.actualEffects.overfill,1);assert.equal(coverage.actualEffects.deep_route,1);assert.equal(coverage.actualEffects.chain,1);assert.equal(coverage.actualEffects.variety,1);clean(coverage);
});
test('exact fill, shallow route and first shipment do not trigger conditional score upgrades',()=>{
  const state=fixture();put(state,F,[1,2,8]);state.orders=[order()];state.upgrades=['upgrade.overfill','upgrade.deep_route','upgrade.chain','upgrade.variety'];
  const {coverage}=observe(state);for(const effect of ['overfill','deep_route','chain','variety'])assert.equal(coverage.actualEffects[effect],0);clean(coverage);
});
test('tampered shipment score fails before counting score upgrade effects',()=>{
  const state=fixture();put(state,F,[15,16,17]);state.orders=[order()];state.upgrades=['upgrade.contract'];const {command,result}=placed(state);shipments(result)[0].score++;
  const coverage=createCoverage();assert.throws(()=>observeCommand(coverage,state,command,result),/shipment.score/);assert.equal(coverage.actualEffects.contract,0);
});
test('side gate requires the actual southwest path and pallet pass requires the event flag',()=>{
  const state=fixture();put(state,F,[35,36,37]);put(state,M,[3]);state.orders=[order()];state.upgrades=['upgrade.side_gate'];
  const {coverage}=observe(state);assert.equal(coverage.actualEffects.side_gate,1);clean(coverage);
  const tie=fixture();put(tie,F,[21,22,23,24]);tie.orders=[order()];tie.upgrades=['upgrade.side_gate','upgrade.pallet_pass'];const out=observe(tie);assert.equal(out.coverage.actualEffects.side_gate,0);assert.equal(out.coverage.actualEffects.pallet_pass,0);clean(out.coverage);
});
test('pallet pass observes a real occupied-pallet route',()=>{
  const state=fixture();state.board.fill(C);for(const i of [3,10,24,27,26,25,48])state.board[i]=null;
  put(state,F,[31],{kind:'pallet'});put(state,M,[17],{kind:'pallet'});state.orders=[order('dock.north',F,2)];state.upgrades=['upgrade.pallet_pass'];
  const {coverage}=observe(state);assert.equal(coverage.actualEffects.pallet_pass,1);clean(coverage);
});
test('pallet units and cross-cargo wildcards are counted from the pre-shipment shadow board',()=>{
  const state=fixture();put(state,F,[15],{kind:'pallet'});put(state,F,[17]);put(state,C,[16],{kind:'wildcard'});state.orders=[order()];
  const {coverage}=observe(state);assert.equal(coverage.traits.shipped.pallet,1);assert.equal(coverage.pallet.shippedUnits,2);assert.equal(coverage.pallet.bonusUnits,1);assert.equal(coverage.wildcard.crossCargoCells,1);assert.equal(coverage.wildcard.crossCargoShipments,1);clean(coverage);
  state.board[16]=F;const same=observe(state);assert.equal(same.coverage.traits.shipped.wildcard,1);assert.equal(same.coverage.wildcard.crossCargoCells,0);clean(same.coverage);
});
test('hazard clearance needs the second waste, not mere hazard shipment or baseline one-waste clearing',()=>{
  const state=fixture();put(state,F,[15],{kind:'hazard'});put(state,F,[16,17]);put(state,M,[8],{kind:'waste'});state.orders=[order()];state.upgrades=['upgrade.hazard_clearance'];
  let out=observe(state);assert.equal(out.coverage.actualEffects.hazard_clearance,0);assert.equal(out.coverage.waste.cleared,1);clean(out.coverage);
  put(state,M,[14],{kind:'waste'});out=observe(state);assert.equal(out.coverage.actualEffects.hazard_clearance,1);assert.equal(out.coverage.waste.cleared,2);clean(out.coverage);
  state.upgrades=[];out=observe(state);assert.equal(out.coverage.actualEffects.hazard_clearance,0);assert.equal(out.coverage.waste.cleared,1);clean(out.coverage);
});
test('hazard, route sweep and pickup use staged shadow clearing without double attribution',()=>{
  const state=fixture();put(state,F,[15],{kind:'hazard'});put(state,F,[16,17]);put(state,M,[8,14,2],{kind:'waste'});put(state,C,[4]);
  state.orders=[order()];state.upgrades=['upgrade.hazard_clearance','upgrade.sweep_route','upgrade.extra_pickup'];
  const out=observe(state);assert.equal(out.coverage.actualEffects.hazard_clearance,1);assert.equal(out.coverage.actualEffects.sweep_route,1);assert.equal(out.coverage.actualEffects.extra_pickup,1);assert.equal(out.coverage.waste.cleared,3);clean(out.coverage);
});
test('route upgrades do not trigger without their exact eligible neighbors and only affect first shipment',()=>{
  const state=fixture();put(state,F,[15,16,17]);put(state,M,[9],{kind:'pallet'});state.orders=[order()];state.upgrades=['upgrade.sweep_route','upgrade.extra_pickup'];
  const {coverage}=observe(state);assert.equal(coverage.actualEffects.sweep_route,0);assert.equal(coverage.actualEffects.extra_pickup,0);clean(coverage);
});
test('event extra-cell mismatch fails before any clearance effect attribution',()=>{
  const state=fixture();put(state,F,[15],{kind:'hazard'});put(state,F,[16,17]);put(state,M,[8,14],{kind:'waste'});state.orders=[order()];state.upgrades=['upgrade.hazard_clearance'];
  const {command,result}=placed(state);shipments(result)[0].extraClearedCells=[8];const coverage=createCoverage();assert.throws(()=>observeCommand(coverage,state,command,result),/shipment.extraClearedCells/);assert.equal(coverage.actualEffects.hazard_clearance,0);
});
test('later shipments read the board after earlier hazard clears and cannot reuse consumed traits',()=>{
  const state=fixture();put(state,F,[19],{kind:'hazard'});put(state,F,[18,20]);put(state,M,[31,32,33]);put(state,C,[27],{kind:'waste'});
  state.orders=[order('dock.east',M,3,'second'),order('dock.north',F,3,'first')];const {coverage,result}=observe(state);
  assert.equal(shipments(result).length,2);assert.equal(coverage.traits.shipped.hazard,1);assert.equal(coverage.waste.cleared,1);clean(coverage);
});
test('small order first requires a different first reachable old order from default Dock ordering',()=>{
  const state=fixture();put(state,F,[15,17]);put(state,M,[9]);put(state,C,[16],{kind:'wildcard'});state.orders=[order('dock.north',F,3,'north'),order('dock.east',M,2,'east')];state.upgrades=['upgrade.small_order_first'];
  let out=observe(state);assert.equal(shipments(out.result)[0].orderId,'east');assert.equal(out.coverage.actualEffects.small_order_first,1);clean(out.coverage);
  state.orders[0].amount=2;out=observe(state);assert.equal(out.coverage.actualEffects.small_order_first,0);clean(out.coverage);
  state.orders[0].amount=9;out=observe(state);assert.equal(out.coverage.actualEffects.small_order_first,0);clean(out.coverage);
});
test('rush own placement stays fresh; subsequent placement expires it into occupied waste',()=>{
  const state=fixture();state.candidates[0]={...state.candidates[0],cargo:F,trait:'rush',rushTurns:3};let out=observe(state,1,1);
  assert.equal(out.result.state.cellTraits![8]?.remaining,3);assert.equal(out.coverage.traits.placed.rush,1);assert.equal(out.coverage.rushExpired.cells,0);clean(out.coverage);
  const next=out.result.state;next.orders=[];next.candidates=[{id:'test-piece',shapeId:'shape.single',cargo:K}];next.cellTraits![8]!.remaining=1;
  out=observe(next);assert.equal(out.coverage.rushExpired.events,1);assert.equal(out.coverage.rushExpired.cells,1);assert.equal(out.coverage.waste.generated,1);assert.equal(out.result.state.board[8],F);clean(out.coverage);
});
test('rush may ship on its last turn without also becoming waste',()=>{
  const state=fixture();put(state,F,[15],{kind:'rush',remaining:1,bornAtCommand:0});put(state,F,[16,17]);state.orders=[order()];state.commandIndex=4;
  const out=observe(state);assert.equal(out.coverage.traits.shipped.rush,1);assert.equal(out.coverage.rushExpired.cells,0);clean(out.coverage);
});
test('reconciliation rejects wrong final board, trait, expiration event and total score',()=>{
  for(const kind of ['board','traits','rush','score']){
    const state=fixture();put(state,F,[8],{kind:'rush',remaining:1,bornAtCommand:0});const {command,result}=placed(state);
    if(kind==='board')result.state.board[1]=F;
    if(kind==='traits')result.state.cellTraits![8]={kind:'rush',remaining:1,bornAtCommand:0};
    if(kind==='rush')result.events=result.events.filter(e=>e.type!=='rushExpired');
    if(kind==='score')result.state.score++;
    assert.throws(()=>observeCommand(createCoverage(),state,command,result),/reconcile|rushExpired/);
  }
});
test('probabilistic upgrades count only eligible opportunities and never actual effects',()=>{
  const state=fixture();state.upgrades=['upgrade.small_parcels','upgrade.stock_orders','upgrade.wild_supply'];let out=observe(state);
  assert.equal(out.coverage.probabilityOpportunities.small_parcels,3);assert.equal(out.coverage.probabilityOpportunities.stock_orders,2);assert.equal(out.coverage.probabilityOpportunities.wild_supply,0);
  state.shift=3;state.completedOrders=12;state.upgrades.push('upgrade.pallet_supply');out=observe(state);
  assert.equal(out.coverage.probabilityOpportunities.wild_supply,2);assert.equal(out.coverage.actualEffects.wild_supply,0);
  for(const effect of ['small_parcels','stock_orders','wild_supply']){assert.equal(out.coverage.actualEffects[effect],0);assert.ok(out.coverage.unobservedReason[effect]);}clean(out.coverage);
});
test('pallet supply needs ordinal multiple of four at special-enabled shift, not a naturally drawn pallet',()=>{
  const state=fixture();state.upgrades=['upgrade.pallet_supply'];let out=observe(state);assert.equal(out.coverage.actualEffects.pallet_supply,0);clean(out.coverage);
  state.shift=3;state.completedOrders=12;state.generatedPieces=4;state.candidates=createRunV3(3).candidates;out=observe(state,0,0);assert.equal(out.coverage.actualEffects.pallet_supply,0);clean(out.coverage);
});
test('rush buffer requires a new generated rush with the full five-turn allowance',()=>{
  const coverage=createCoverage();let rushes=0;
  for(let seed=0;seed<150;seed++){const state=fixture(seed);state.shift=3;state.completedOrders=12;state.upgrades=['upgrade.rush_buffer'];const {command,result}=placed(state);rushes+=result.state.candidates.filter(p=>p.trait==='rush'&&p.rushTurns===5).length;observeCommand(coverage,state,command,result);}
  assert.ok(rushes>0);assert.equal(coverage.actualEffects.rush_buffer,rushes);clean(coverage);
  const state=fixture();state.candidates.push({id:'old-rush',shapeId:'shape.single',cargo:F,trait:'rush',rushTurns:3});state.upgrades=['upgrade.rush_buffer'];assert.equal(observe(state).coverage.actualEffects.rush_buffer,0);
});
test('light orders verifies drawn amount using independent RNG while retaining old orders',()=>{
  const state=fixture();state.orders=[order('dock.north',F,9,'preserved')];state.upgrades=['upgrade.light_orders','upgrade.stock_orders'];put(state,M,[15],{kind:'rush',remaining:1,bornAtCommand:0});
  const out=observe(state);assert.equal(out.coverage.actualEffects.light_orders,1);assert.equal(out.result.state.orders[0].amount,9);clean(out.coverage);
  const {command,result}=placed(state);result.state.orders.find(o=>o.id!=='preserved')!.amount++;
  assert.throws(()=>observeCommand(createCoverage(),state,command,result),/order.amount/);
  state.orders=[order('dock.north',F,9,'first'),order('dock.east',M,9,'second')];assert.equal(observe(state).coverage.actualEffects.light_orders,0);
});
test('final normal-run win still reconciles last shipment, final bonus and no replacement piece',()=>{
  const state=fixture();state.completedOrders=29;state.shift=5;put(state,F,[15,16,17]);state.orders=[order()];const out=observe(state);
  assert.equal(out.result.state.result,'won');assert.equal(out.coverage.generatedPieces,0);assert.equal(out.coverage.shipments,1);clean(out.coverage);
});
test('first witness is retained when an effect repeats across commands',()=>{
  const state=fixture();state.upgrades=['upgrade.contract'];put(state,F,[15,16,17]);state.orders=[order()];const {command,result}=placed(state),coverage=createCoverage();observeCommand(coverage,state,command,result);
  const first=structuredClone(coverage.firstWitness.contract);observeCommand(coverage,state,command,result);assert.equal(coverage.actualEffects.contract,2);assert.deepEqual(coverage.firstWitness.contract,first);
});
for(const kind of ['pallet','rush','hazard','wildcard'] as const)test(`${kind} placed and shipped in one command retains both lifecycle observations`,()=>{
  const state=fixture();state.candidates[0]={...state.candidates[0],cargo:kind==='wildcard'?C:F,trait:kind,...(kind==='rush'?{rushTurns:3}:{})};put(state,F,[15,17]);state.orders=[order()];
  const out=observe(state,2,2);assert.equal(out.coverage.traits.placed[kind],1);assert.equal(out.coverage.traits.shipped[kind],1);assert.equal(out.coverage.rushExpired.cells,0);clean(out.coverage);
});
test('all actual generated trait classes are counted without attributing random selection',()=>{
  const coverage=createCoverage(),expected={normal:0,pallet:0,rush:0,hazard:0,wildcard:0};
  for(let seed=0;seed<300;seed++){
    const state=fixture(seed);state.shift=3;state.completedOrders=12;const {command,result}=placed(state);
    for(const piece of result.state.candidates)expected[piece.trait??'normal']++;
    observeCommand(coverage,state,command,result);
  }
  for(const count of Object.values(expected))assert.ok(count>0);assert.deepEqual(coverage.traits.generated,expected);assert.equal(coverage.generatedPieces,900);clean(coverage);
});
test('route sweep does not reattribute a waste cell already consumed by baseline hazard',()=>{
  const state=fixture();put(state,F,[15],{kind:'hazard'});put(state,F,[16,17]);put(state,M,[8],{kind:'waste'});state.orders=[order()];state.upgrades=['upgrade.sweep_route'];
  const out=observe(state);assert.deepEqual(shipments(out.result)[0].extraClearedCells,[8]);assert.equal(out.coverage.actualEffects.sweep_route,0);assert.equal(out.coverage.waste.cleared,1);clean(out.coverage);
});
test('generation ordinal follows numeric piece IDs even when replacement occupies a middle candidate slot',()=>{
  const state=createRunV3(9);state.shift=3;state.completedOrders=12;state.candidates=state.candidates.map(p=>({...p,shapeId:'shape.single'}));state.upgrades=['upgrade.pallet_supply'];
  const command:Command={type:'place',pieceId:state.candidates[1].id,origin:{x:0,y:0}},result=applyCommandV3(state,command),coverage=createCoverage();observeCommand(coverage,state,command,result);
  assert.equal(result.state.candidates[1].trait,'pallet');assert.equal(coverage.actualEffects.pallet_supply,1);assert.equal(coverage.generatedPieces,1);clean(coverage);
});
test('a numerical generation ID gap fails fast rather than manufacturing an ordinal witness',()=>{
  const state=fixture();const {command,result}=placed(state);result.state.candidates[0].id='piece.999999';
  assert.throws(()=>observeCommand(createCoverage(),state,command,result),/generation.ids/);
});
test('a malformed new rush buffer duration cannot count an effect',()=>{
  let observed=false;
  for(let seed=0;seed<150&&!observed;seed++){
    const state=fixture(seed);state.shift=3;state.completedOrders=12;state.upgrades=['upgrade.rush_buffer'];const {command,result}=placed(state),rush=result.state.candidates.find(p=>p.trait==='rush');
    if(!rush)continue;rush.rushTurns=3;const coverage=createCoverage();assert.throws(()=>observeCommand(coverage,state,command,result),/generation.rushTurns/);assert.equal(coverage.actualEffects.rush_buffer,0);observed=true;
  }
  assert.ok(observed);
});
test('overtime continuation and finish preserve rush while reconciling optional refills',()=>{
  const state=fixture();state.phase='result';state.result='won';state.shift=5;state.completedOrders=30;state.endReason='completed';put(state,F,[8],{kind:'rush',remaining:1,bornAtCommand:0});
  const coverage=createCoverage(),command:Command={type:'continueOvertime'},result=applyCommandV3(state,command);observeCommand(coverage,state,command,result);assert.equal(result.state.cellTraits![8]?.remaining,1);
  const finish:Command={type:'finishOvertime'};observeCommand(coverage,result.state,finish,applyCommandV3(result.state,finish));assert.equal(coverage.rushExpired.cells,0);clean(coverage);
});
test('small-order priority can first change the second shipment after a common first order',()=>{
  const state=fixture();put(state,F,[1,2]);put(state,M,[25,26,32,33]);put(state,C,[36,37,38]);
  state.orders=[order('dock.north',F,2,'north'),order('dock.east',M,4,'east'),order('dock.south',C,3,'south')];state.upgrades=['upgrade.small_order_first'];
  const out=observe(state);assert.deepEqual(shipments(out.result).map(s=>s.orderId),['north','south','east']);assert.equal(out.coverage.actualEffects.small_order_first,1);assert.equal(out.coverage.firstWitness.small_order_first.eventSummary.defaultFirstOrderId,'east');clean(out.coverage);
});
test('later shipment route neighbors remain untouched because sweep and pickup are first-shipment only',()=>{
  const state=fixture();put(state,F,[1,2]);put(state,M,[25,26,32,33]);put(state,C,[20],{kind:'waste'});put(state,C,[34]);
  state.orders=[order('dock.north',F,2,'north'),order('dock.east',M,4,'east')];state.upgrades=['upgrade.sweep_route','upgrade.extra_pickup'];
  const out=observe(state);assert.equal(shipments(out.result).length,2);assert.equal(out.result.state.cellTraits![20]?.kind,'waste');assert.equal(out.result.state.board[34],C);
  assert.equal(out.coverage.actualEffects.sweep_route,0);assert.equal(out.coverage.actualEffects.extra_pickup,0);clean(out.coverage);
});
