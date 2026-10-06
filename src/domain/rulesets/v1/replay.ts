import type { RunState, Command } from './types.ts';
import { createRun, applyCommand } from './engine.ts';
/** Canonical field order; command history is excluded because all future-affecting state is explicit. */
export function checksum(state: RunState): string {
  const canonical = JSON.stringify([
    state.rulesetVersion,state.runConfigId,state.seed,state.mode,state.board,
    state.candidates.map(p => [p.id,p.shapeId,p.cargo]),state.orders.map(o => [o.id,o.dockId,o.cargo,o.amount,o.baseScore]),
    state.score,state.shift,state.rngState,state.phase,state.completedOrders,state.lastChain,state.maxChain,
    state.upgrades,state.upgradeChoices,state.commandIndex,state.nextId,state.result,
  ]);
  let hash = 0x811c9dc5;
  for (let i=0;i<canonical.length;i++) { hash ^= canonical.charCodeAt(i); hash = Math.imul(hash,0x01000193); }
  return (hash>>>0).toString(16).padStart(8,'0');
}
export function replay(seed: number, commands: Command[], mode: RunState['mode'] = 'standard'): RunState {
  let state=createRun(seed,mode);
  for (let i=0;i<commands.length;i++) {
    const result=applyCommand(state,commands[i]);
    if (result.error) throw new Error(`Replay command ${i}: ${result.error}`);
    state=result.state;
  }
  return state;
}
