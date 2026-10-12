import type {Point, RunState} from '../domain/types.ts';
import {orderStatus} from '../domain/board.ts';
import {checksum} from '../domain/replay.ts';
import {CARGO, SHAPES, P0_CONFIG} from '../domain/rulesets/v1/content.ts';
import {RULES_V2_CONFIG, upgradeStackV2, upgradeParamV2} from '../domain/v2/content.ts';
import {cellUnitsV2} from '../domain/v2/board.ts';
import {RULES_V4_CONFIG,COLOR_EXIT_CARGO} from '../domain/v4/content.ts';
import {MIXED_COLOR_PERCENT} from '../domain/v5/content.ts';
import {RULES_V6_CONFIG,MIXED_COLOR_PERCENT_V6} from '../domain/v6/content.ts';
import {RULES_V7_CONFIG} from '../domain/v7/content.ts';
import {RULES_V3_CONFIG} from '../domain/v3/content.ts';
import type {ViewState} from './view-types.ts';

const route = (path: Point[]): string => path.length ? path.map(point => `(${point.x},${point.y})`).join('>') : 'none';
function weightRows(label: string, weights: [string, number][]): string[] {
  const rows: string[] = [];
  for (let i = 0; i < weights.length; i += 3) rows.push(`${label} ${weights.slice(i, i + 3).map(([id, weight]) => `${id}=${weight}`).join(' ')}`);
  return rows;
}

/** Read-only mirror of the versioned generators' integer weights. No draw, rescue search,
 * historical inference, or command simulation occurs here. Tests replay the displayed
 * weighted pools against the real v2/v3 generators to catch formula or draw-order drift. */
function generationRows(state: RunState, occupancy: number): string[] {
  if(state.rulesetVersion===4||state.rulesetVersion===5||state.rulesetVersion===6||state.rulesetVersion===8){
    const config=(state.rulesetVersion===6||state.rulesetVersion===8)?RULES_V6_CONFIG:RULES_V4_CONFIG,bonus=Math.floor(occupancy*config.generation.occupancySmallPercent/state.board.length);
    const rows=[`generation color_exit fixed3; target_batches ${config.targetBatches}; min_batch ${config.minBatch}`,'special/upgrade disabled; freight follows event-owned four-neighbor cargoPaths',`shape occupancy_bonus ${bonus}%; repeat_divisor ${config.generation.recentShapeDivisor}`];
    const weights:[string,number][]=SHAPES.filter(shape=>shape.minShift<=state.shift).map(shape=>{
      let weight=shape.weight*100;if(shape.cells.length<=2)weight=Math.floor(weight*(100+bonus)/100);
      if(state.candidates.some(piece=>piece.shapeId===shape.id))weight=Math.floor(weight/config.generation.recentShapeDivisor);
      return [shape.id,Math.max(1,weight)];
    });
    if(state.rulesetVersion===5&&state.colorTier)rows.push(`color_tier ${state.colorTier}; mixed_probability ${MIXED_COLOR_PERCENT[state.colorTier]}%; independent_per_piece; no_fallback`,'four_draws type[1,100],shape[0,2147483647],cargo[0,2147483647],pattern[0,11]','mixed shape.square; 12 equal 2+2 bands; shape/cargo weights below apply only to pure branch');
    if((state.rulesetVersion===6||state.rulesetVersion===8)&&state.difficultyId)rows.push(`difficulty ${state.difficultyId}; board_size 9; mixed_probability ${MIXED_COLOR_PERCENT_V6[state.difficultyId]}%; no_fallback`,'six_draws type, pureShapeRaw, pureCargoRaw, mixedShape[0,7], split[0,5], pair[0,5]','mixed shapes uniform8; connected2+2 or2+3; pure branch weights below');
    rows.push(...weightRows('shape_weight',weights));
    rows.push(...weightRows('cargo_weight',COLOR_EXIT_CARGO.map(cargo=>[cargo,config.generation.cargoBaseWeight+state.board.filter(cell=>cell===cargo).length*config.generation.cargoPresenceWeight])));
    return rows;
  }

  if (state.rulesetVersion === 3 && state.mode === 'tutorial') return [`generation authored tutorial_step ${state.tutorialStep ?? 0}; 无随机货件抽签`];
  const modern = state.rulesetVersion===7?RULES_V7_CONFIG:state.rulesetVersion === 3 ? RULES_V3_CONFIG : state.rulesetVersion === 2 ? RULES_V2_CONFIG : null;
  const config = modern ?? P0_CONFIG;
  const smallBonus = upgradeStackV2(state, 'small_parcels') * (modern ? upgradeParamV2('small_parcels', 'weightPercent') : P0_CONFIG.upgrade.smallWeightPercent);
  const occupancyBonus = Math.floor(occupancy * config.generation.occupancySmallPercent / 49);
  const rows = ['generation 当前状态条件权重；不是历史抽签或下次落子预测'];
  let forcedPallet = false;
  if (!modern) rows.push('special unavailable ruleset v1');
  else if (state.shift < modern.special.minShift) rows.push(`special disabled shift<${modern.special.minShift}`);
  else {
    const nextGeneration = (state.generatedPieces ?? 0) + 1;
    const interval = upgradeParamV2('pallet_supply', 'interval');
    forcedPallet = upgradeStackV2(state, 'pallet_supply') > 0 && nextGeneration % interval === 0;
    if (forcedPallet) rows.push(`special next_generation ${nextGeneration} forced=pallet interval=${interval} shape=shape.single`);
    else {
      const bonus = upgradeStackV2(state, 'wild_supply') * upgradeParamV2('wild_supply', 'weightBonus'), weights = modern.special.weights;
      rows.push(`special next_generation ${nextGeneration} normal=${weights.normal - bonus} pallet=${weights.pallet} rush=${weights.rush} hazard=${weights.hazard} wildcard=${weights.wildcard + bonus}`);
    }
    rows.push(`special shape=shape.single; rush_turns ${modern.special.rushTurns + upgradeStackV2(state, 'rush_buffer') * upgradeParamV2('rush_buffer', 'extraTurns')}`);
  }
  if (!forcedPallet) {
    rows.push(`shape normal only; occupancy_bonus ${occupancyBonus}% small_parcels_bonus ${smallBonus}% repeat_divisor ${config.generation.recentShapeDivisor}`);
    rows.push('shape formula: base×100; 小件加成后向下取整；当前候选重复再除、取整，最低1');
    const weights: [string, number][] = SHAPES.filter(shape => shape.minShift <= state.shift).map(shape => {
      let weight = shape.weight * 100;
      if (shape.cells.length <= 2) weight = Math.floor(weight * (100 + smallBonus + occupancyBonus) / 100);
      if (state.candidates.some(piece => piece.shapeId === shape.id)) weight = Math.floor(weight / config.generation.recentShapeDivisor);
      return [shape.id, Math.max(1, weight)];
    });
    rows.push(...weightRows('shape_weight', weights));
  }
  rows.push(`cargo formula: 20+inventory×${config.generation.cargoPresenceWeight}; ${modern ? '托盘2 / 废物0 / 其余1，按货件原货类' : 'v1按占用格数'}`);
  const cargoWeights: [string, number][] = CARGO.slice(0, config.cargoByShift[state.shift - 1]).map(cargo => {
    const units = state.board.reduce<number>((sum, cell, index) => sum + (cell === cargo.id ? modern ? cellUnitsV2(state, index) : 1 : 0), 0);
    return [cargo.id, 20 + units * config.generation.cargoPresenceWeight];
  });
  rows.push(...weightRows('cargo_weight', cargoWeights));
  return rows;
}

/** Formal diagnostic selector: UI-only flags never alter the authoritative RunState. */
export function buildDebugRows(state: RunState, view: ViewState): string[] {
  const occupancy = state.board.filter(cell => cell !== null).length;
  const rows = [
    `ruleset_version ${state.rulesetVersion} | run_config_id ${state.runConfigId}`,
    `seed ${state.seed} | mode ${state.mode} | shift ${state.shift}`,
    `phase ${state.phase} | paused ${view.paused} | board_source committed`,
    `rng_state ${JSON.stringify(state.rngState)}`,
    `command_index ${state.commandIndex} | occupancy ${occupancy}/${state.board.length} (${(occupancy / state.board.length * 100).toFixed(1)}%)`,
    `last_checksum ${checksum(state)}`,
    ...state.candidates.map(piece => `candidate ${piece.id} ${piece.shapeId} ${piece.cargo}${piece.cellCargos?` cell_cargos ${piece.cellCargos.join(',')}`:''}${piece.trait ? ` trait=${piece.trait}` : ''}${piece.rushTurns !== undefined ? ` rush_turns=${piece.rushTurns}` : ''}`),
  ];
  if (!state.candidates.length) rows.push('candidates none');
  for (const order of state.orders) {
    const status = orderStatus(state, order);
    rows.push(`order ${order.id} ${order.dockId} ${order.cargo} ${status.count}/${order.amount} eligibility ${status.status}${status.reason ? ` (${status.reason})` : ''}`);
    rows.push(`canonical_route ${order.id} ${route(status.path)}`);
  }
  if (!state.orders.length) rows.push('active_orders none');
  const limit = ([4,5,6,8].includes(state.rulesetVersion)) ? 3 : state.rulesetVersion===7?RULES_V7_CONFIG.resolutionLimit:state.rulesetVersion === 3 ? RULES_V3_CONFIG.resolutionLimit : state.rulesetVersion === 2 ? RULES_V2_CONFIG.resolutionLimit : P0_CONFIG.resolutionLimit;
  if (view.animation) {
    const shipment = view.animation.shipment;
    rows.push(`resolution_step ${shipment.chain}/${limit} animation | last_chain ${state.lastChain}`);
    rows.push(`animation ${shipment.orderId} canonical_route ${route(shipment.path)}`);
  } else if (view.preview?.valid) {
    rows.push(`resolution_step 0/${limit} preview_steps ${view.preview.shipments.length} | last_chain ${state.lastChain}`);
    for (const shipment of view.preview.shipments) rows.push(`preview_step ${shipment.chain} ${shipment.orderId} canonical_route ${route(shipment.path)}`);
  } else {
    rows.push(`resolution_step 0/${limit} idle | last_chain ${state.lastChain}`);
    if (view.preview) rows.push(`preview invalid ${view.preview.reason ?? 'unknown'}`);
  }
  return [...rows, ...generationRows(state, occupancy)];
}
