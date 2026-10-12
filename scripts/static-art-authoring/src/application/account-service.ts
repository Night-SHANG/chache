import {rushCoinMultiplier} from '../domain/v21/rewards.ts';
import {isInboundDifficultyV18} from '../domain/v18/content.ts';
import {validToolChargesV16} from '../domain/v16/content.ts';
import {guideProgress,guideTrackFor,upgradeAccountGuides} from './account-guides.ts';
import {INBOUND_GUIDE_V16} from './inbound-guide-v16.ts';
import { applyPlayableCommand, createPlayableRun, isInboundRun, isToolRun, isOutboundToolsRun, type GameCommand, type GameEvent, type GameRun, type GameStepResult, type RunSpec } from '../domain/playable.ts';
import { INBOUND_GUIDE_V9 } from '../domain/v9/tutorial.ts';
import { INBOUND_GUIDE_V11 } from './inbound-guide-v11.ts';
import { INBOUND_GUIDE_V14 } from './inbound-guide-v14.ts';
import { OUTBOUND_GUIDE_V12 } from './outbound-guide-v12.ts';
import { validToolChargesV12 } from '../domain/v12/content.ts';
import type { ToolChargesV9 } from '../domain/v9/types.ts';
import type { WriterLease } from '../platform/writer-lease.ts';
import { cloneData } from '../shared/data.ts';
import { PLAYTEST_FREE_SHOP, shopPrice } from '../shared/build-policy.ts';
import type { StoragePort } from './save.ts';
import type { AccountRun, AccountSnapshot, EquipCosmeticSetRequest, PurchaseCosmeticSetRequest, GuideStep, GuideTrack, ItemId, RunIdentity } from './account-types.ts';
import { commitAccount, loadAccount, repairAccount, type AccountLoad, type CommitResult } from './account-store.ts';
import { recordAccountResult, resetAccountResults } from './account-profile.ts';
import { accountDigest, canonicalStringify, stageHistory, verifyAccountReferences } from './history-store.ts';
import { assertGameCommandShape, assertGameRun } from './game-codec.ts';
import { baseCoins, dailyAward, dailyRewardRecord, upgradeEconomy, ITEM_PRICES } from './economy.ts';
import { prepareLegacyMigration } from './legacy-migration.ts';
import { advanceGuide, isGuideComplete, OUTBOUND_GUIDE_V8 } from './tutorials.ts';
import { createProfile, encodeProfile, localDailyChallenge, PROFILE_KEYS, recordResult, resetProfile, setProfileSettings, type Profile } from './profile.ts';
import { isRunSlot, slotForRun, type RunSlot } from './run-slots.ts';
import { loadPlayableRun } from './run-lifecycle.ts';
import { accountCosmeticState, getCosmetic, retainAccountCosmetics } from './cosmetics.ts';
import { getCosmeticSet, quoteCosmeticSetPurchase, isClassicSetSelection, classicSetDefinition, classicSetStatus } from './cosmetic-sets.ts';
import type { ClassicSetSelection } from './cosmetic-sets.ts';

export interface StartIntent { spec: RunSpec; items: ItemId[]; guide: 'guided' | 'direct'; cleanupBranch?: 'orders' | 'placements' }
export type AccountRequest = { operationId: string } & (
  | { type: 'start'; intent: StartIntent }
  | { type: 'command'; runId: string; command: GameCommand; elapsedMs?: number }
  | { type: 'saveElapsed'; runId: string; elapsedMs: number }
  | { type: 'purchase'; item: ItemId; quantity?: number; quotedPrice?: number }
  | { type: 'purchaseCosmetic'; kind: 'theme' | 'forklift' | 'cargo'; id: string }
  | { type: 'setCargoOutline'; enabled: boolean }
  | { type: 'skipGuide'; runId: string; track: GuideTrack }
  | { type: 'close'; runId: string; reason: 'failed' | 'retired' | 'home' | 'decline_overtime'; elapsedMs?: number }
  | { type: 'resetResults' }
  | { type: 'setTutorialsEnabled'; enabled: boolean }
  | { type: 'setSettings'; patch: Partial<Profile['settings']> }
  | { type: 'setCosmetic'; kind: 'theme' | 'forklift' | 'cargo'; id: string }
  | { type:'equipClassicSet'; selection:ClassicSetSelection }
  | EquipCosmeticSetRequest
  | PurchaseCosmeticSetRequest
  | { type: 'recordLegacyResult'; slot: RunSlot }
);
export interface TransactionResult extends CommitResult {
  /** Presentation facts are transient and released once, only after both roots acknowledge. */
  events?: GameEvent[];
  closedState?: GameRun;
  operation?: { operationId: string; coinDelta: number; returned: ItemId[]; learned: GuideStep[] };
}
export interface AccountService {
  getSnapshot(): Readonly<AccountSnapshot> | null;
  getStatus(): AccountLoad['status'];
  getPendingOperationId(): string | null;
  refresh(): AccountLoad;
  transact(request: AccountRequest, expectedGeneration: number): TransactionResult;
  retryPending(operationId: string): TransactionResult;
}
interface DomainCommit { identity: RunIdentity; beforeCommandIndex: number; command: GameCommand; result: GameStepResult }
interface Pending {
  request: AccountRequest; digest: string; expectedGeneration: number;
  previous: AccountSnapshot | null; next: AccountSnapshot | null;
  events: GameEvent[]; coinDelta: number; returned: ItemId[]; learned: GuideStep[];
  closedState?: GameRun;
  replaceable: boolean;
}
class PreparationStorageFailure extends Error {}
const ITEM_IDS: readonly ItemId[] = ['rotate', 'clear', 'wildcard'];
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const safe = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const identifier = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_.:-]{1,100}$/.test(value);
function requireValue(ok: unknown, message: string): asserts ok { if (!ok) throw Error(message); }
function keys(value: Record<string, unknown>, allowed: readonly string[]): boolean { return Object.keys(value).every(key => allowed.includes(key)); }
function add(left: number, right: number): number { const result = left + right; requireValue(safe(result), '账户数值超出范围'); return result; }
const clone = cloneData;
const owns = (value: object, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);
const trackFor = (run: AccountRun): GuideTrack => guideTrackFor(run.state);
function legacyProfile(account: AccountSnapshot): Profile {
  return { ...clone(account.profile.legacyResults), schemaVersion: 1, settings: clone(account.profile.settings), cosmetics: createProfile().cosmetics, tutorialComplete: isGuideComplete('inbound', account.guides.inbound, 16), nextRunSerial: account.nextRunSerial };
}
export function accountDisplayProfile(account: Readonly<AccountSnapshot>): Profile {
  const profile = legacyProfile(account);
  // Frozen inbound achievements cover ordinary/daily orders; other score families stay independent.
  const buckets = Object.entries(account.profile.results).filter(([key]) => /^inbound\.(?:(standard|daily)\.v(9|11|14|15)\.|daily\.v16\.|standard\.v16\.(normal|hard|expert)\.|(standard|daily)\.v18\.(hard|expert)\.|rush\.v19\.(hard|expert)\.|rush\.v20\.fixed\.)(plain|tools)$/.test(key));
  const sum = (left: number, right: number): number => Math.min(Number.MAX_SAFE_INTEGER, left + right);
  const units = buckets.reduce((total, [, bucket]) => sum(total, bucket.units), 0);
  const wins = buckets.reduce((total, [, bucket]) => sum(total, bucket.wins), 0);
  const runs = buckets.reduce((total, [, bucket]) => sum(total, bucket.runs), 0);
  const chain = buckets.reduce((best, [, bucket]) => Math.max(best, bucket.maxChain), 0);
  const won = buckets.some(([key, bucket]) => key.startsWith('inbound.standard.') && bucket.wins > 0);
  const active = account.run && isInboundRun(account.run.state) && ['standard', 'daily', 'rush'].includes(account.run.identity.mode)
    && !(account.run.state.rulesetVersion===18&&account.run.state.overtime) ? account.run : null;
  const cursor = active?.resultCursor, sameResetRun = active?.identity.serial === account.resetCursor.serial;
  const freshActive = active && (active.identity.serial > account.resetCursor.serial
    || sameResetRun && active.state.commandIndex > account.resetCursor.commandIndex && cursor !== null) ? active : null;
  const activeUnits = freshActive ? Math.max(0, freshActive.state.completedOrders - (cursor?.units ?? 0)) : 0;
  const activeChain = freshActive ? cursor?.maxChainSinceBaseline ?? freshActive.state.maxChain : 0;
  const activeWon = freshActive?.identity.mode === 'standard' && !cursor?.baseline.countedWin
    && (freshActive.state.endReason === 'completed' || freshActive.state.overtime);
  const activeCompletion = freshActive && !cursor?.baseline.countedWin && (freshActive.state.endReason === 'completed' || activeWon);
  const activeWins = activeCompletion && (!cursor?.countedRun || !cursor.countedWin) ? 1 : 0;
  const activeRuns = freshActive?.state.phase === 'result' && !cursor?.countedRun ? 1 : 0;
  profile.stats = { ...profile.stats, orders: sum(sum(profile.stats.orders, units), activeUnits),
    maxChain: Math.max(profile.stats.maxChain, chain, activeChain),
    wins: sum(sum(profile.stats.wins, wins), activeWins), runs: sum(sum(profile.stats.runs, runs), activeRuns) };
  profile.stats.runs = Math.max(profile.stats.runs, profile.stats.wins);
  const achievements = new Set(profile.achievements);
  if (profile.stats.orders > 0) achievements.add('first_shipment');
  if (profile.stats.maxChain >= 3) achievements.add('chain_3');
  if (won || activeWon) achievements.add('five_shifts');
  if (profile.stats.orders >= 100) achievements.add('ship_100');
  profile.achievements = [...achievements];
  profile.cosmetics = accountCosmeticState(account).cosmetics;
  return profile;
}
function legacyResults(profile: Profile): AccountSnapshot['profile']['legacyResults'] {
  const { schemaVersion, settings, cosmetics, tutorialComplete, nextRunSerial, ...results } = profile;
  void schemaVersion; void settings; void cosmetics; void tutorialComplete; void nextRunSerial;
  return results;
}
function validateRequest(request: unknown, generation: number): asserts request is AccountRequest {
  requireValue(safe(generation) && object(request) && identifier(request.operationId), '操作标识或代际无效');
  const fields: Record<string, string[]> = {
    start: ['intent'], command: ['runId', 'command'], purchase: ['item'], skipGuide: ['runId', 'track'],
    saveElapsed: ['runId', 'elapsedMs'], purchaseCosmetic: ['kind', 'id'], setCargoOutline: ['enabled'], equipCosmeticSet: ['id'],
    purchaseCosmeticSet: ['id', 'quotedKeys', 'quotedPrice'], equipClassicSet: ['selection'],
    close: ['runId', 'reason'], resetResults: [], setTutorialsEnabled:['enabled'], setSettings: ['patch'], setCosmetic: ['kind', 'id'], recordLegacyResult: ['slot'],
  };
  requireValue(typeof request.type === 'string' && owns(fields, request.type) && keys(request, ['operationId', 'type', ...fields[request.type],
    ...(request.type === 'command' || request.type === 'close' ? ['elapsedMs'] : []),
    ...(request.type === 'purchase' ? ['quantity', 'quotedPrice'] : [])])
    && fields[request.type].every(field => owns(request, field)), '账户请求结构无效');
  if (request.type === 'purchase') {
    requireValue(!owns(request, 'quantity') || safe(request.quantity) && request.quantity > 0, '购买数量无效');
    requireValue(!owns(request, 'quotedPrice') || safe(request.quotedPrice), '工具报价无效');
  }
  if ('runId' in request) requireValue(identifier(request.runId), '本局标识无效');
}
function dailyIdentity(time: number, version: 9 | 11 | 14 | 15 | 16 | 18): { day: string; seed: number } {
  const { day, seed } = localDailyChallenge(time, version);
  return { day, seed };
}
/** Current Shanghai-date availability; an existing run always keeps its own start day. */
export function accountDailyAvailability(account:Readonly<AccountSnapshot>|null,time:number,rulesetVersion:9|11|14|15|16|18=18):{day:string;seed:number;completed:boolean;available:boolean} {
 const daily=dailyIdentity(time,rulesetVersion),completed=account!==null&&dailyRewardRecord(account,daily.day).completedRunId!==null;
 return {...daily,completed,available:!completed};
}
/** A persisted identity and the reducer's identity must agree before any command or credit. */
function validateActive(run: AccountRun): void {
  const { identity: id, state } = run;
  requireValue(run.lifecycle === 'active' && state.rulesetVersion === id.rulesetVersion && state.runConfigId === id.runConfigId
    && (state.runSerial === undefined || state.runSerial === id.serial) && state.seed === run.history.seed && state.commandIndex === run.history.totalCommands, '本局账户身份不一致');
  assertGameRun(state);
  if (isInboundRun(state)) {
    requireValue(state.mode === (id.mode === 'guided' ? 'standard' : id.mode) && state.guided === (id.mode === 'guided')
      && id.difficultyId === undefined && ((state.rulesetVersion!==16&&state.rulesetVersion!==18&&state.rulesetVersion!==19&&state.rulesetVersion!==20&&state.rulesetVersion!==21)||state.inboundDifficulty===id.inboundDifficulty), '入库玩法身份不一致');
  } else {
    requireValue(state.mode === 'color_exit' && state.difficultyId === id.difficultyId && (isOutboundToolsRun(state)||run.reserved.length === 0)
      && (state.rulesetVersion === 10 || state.rulesetVersion === 13 ? id.mode === 'outboundEndless' : id.mode === 'outbound' || id.mode === 'outboundGuided' && id.difficultyId === 'easy'), '出库玩法身份不一致');
  }
  if(isToolRun(state))for (const item of ITEM_IDS) requireValue(state.toolCharges[item] === (run.reserved.includes(item) ? 1 : 0)
    && !(run.reserved.includes(item) && state.usedToolIds.includes(item)), '工具预留与棋盘不一致');
  if(id.mode==='guided'||id.mode==='outboundGuided'||id.mode==='daily')requireValue(run.reserved.length===0&&(!isToolRun(state)||state.usedToolIds.length===0),'该模式不能使用个人工具');
}

export function createAccountService(storage: StoragePort, lease: WriterLease, wallTime: () => number): AccountService {
  const verify = (account: AccountSnapshot): void => {
    verifyAccountReferences(storage, account);
    if (account.run) { requireValue(account.run.identity.serial > account.migration.legacySerialCeiling, '旧局不能接入新经济身份'); validateActive(account.run); }
  };
  const initial = loadAccount(storage, verify);
  let status = initial.status;
  let validatedReceiptId = initial.status === 'degraded' ? initial.account?.lastOperation?.operationId ?? null : null;
  let published = initial.status === 'ready' && initial.account ? clone(initial.account) : null;
  let pending: Pending | null = null;
  const known = new Map<string, string>();
  const presented = new Set<string>();
  if (initial.account?.lastOperation) known.set(initial.account.lastOperation.operationId, initial.account.lastOperation.requestDigest);
  const publicResult = (kind: CommitResult['status'], message: string): TransactionResult => ({ status: kind, account: published ? clone(published) : null, message });
  const fail = (message: string): TransactionResult => publicResult('not_committed', message);
  const uncertain = (message: string): TransactionResult => publicResult('unknown', message);
  function acknowledge(account: AccountSnapshot, operation?: Pending): TransactionResult {
    published = clone(account); status = 'ready';
    if (account.lastOperation) known.set(account.lastOperation.operationId, account.lastOperation.requestDigest);
    const result = publicResult('acknowledged', '账户已确认保存');
    if (operation && !presented.has(operation.request.operationId)) {
      presented.add(operation.request.operationId);
      result.events = clone(operation.events);
      if (operation.closedState) result.closedState = clone(operation.closedState);
      result.operation = { operationId: operation.request.operationId, coinDelta: operation.coinDelta, returned: clone(operation.returned), learned: clone(operation.learned) };
    }
    pending = null;
    return result;
  }
  function settle(result: CommitResult, operation: Pending): TransactionResult {
    if (result.status === 'acknowledged' && result.account) return acknowledge(result.account, operation);
    operation.replaceable = result.status === 'not_committed';
    status = result.status === 'committed_unmirrored' ? 'degraded' : result.status === 'unknown' ? 'unknown' : status;
    return publicResult(result.status, result.message);
  }
  function credit(account: AccountSnapshot): { account: AccountSnapshot; delta: number } {
    const run = account.run!;
    const base = baseCoins(isInboundRun(run.state)?'inbound':'outbound', run.state.completedOrders, run.state.score,run.identity.economyVersion);
    requireValue(base >= run.creditedBase, '累计收益不能倒退');
    let delta = base - run.creditedBase, dailyPaid = account.dailyPaid, dailyRewards = account.dailyRewards;
    if(run.identity.mode==='rush'){
      const won=run.state.result==='won'&&run.state.endReason==='completed',entitled=rushCoinMultiplier(run.identity.rulesetVersion,won)===3?add(base,add(base,base)):base;
      requireValue(entitled>=run.earnedCoins,'累计加急收益不能倒退');delta=entitled-run.earnedCoins;
    }
    if (run.identity.mode === 'daily') {
      const day = run.identity.challengeDay!;
      const prior=dailyRewardRecord(account,day),won=run.state.result==='won'&&run.state.endReason==='completed';
      if(run.identity.economyVersion===1){
        const award = dailyAward(base, dailyPaid[day] ?? { bestBase: 0, paid: 0 });
        delta = add(delta, award.extra); dailyPaid = { ...dailyPaid, [day]: award.next };
        if(won)dailyRewards={...dailyRewards,[day]:{completedRunId:prior.completedRunId??run.identity.runId,bonusPaid:Math.max(prior.bonusPaid,award.next.paid)}};
      }else if(won&&(!prior.completedRunId||prior.completedRunId===run.identity.runId)){
        const bonus=add(base,base),extra=Math.max(0,bonus-prior.bonusPaid);
        delta=add(delta,extra); dailyRewards={...dailyRewards,[day]:{completedRunId:run.identity.runId,bonusPaid:Math.max(prior.bonusPaid,bonus)}};
      }
    }
    return { account: { ...account, wallet: add(account.wallet, delta), dailyPaid, dailyRewards, run: { ...run, creditedBase: base, earnedCoins: add(run.earnedCoins, delta) } }, delta };
  }
  function applyDomain(account: AccountSnapshot, command: GameCommand, closing = false): { account: AccountSnapshot; events: GameEvent[]; delta: number; learned: GuideStep[] } {
    const before = account.run!;
    validateActive(before); assertGameCommandShape(command, before.identity.rulesetVersion);
    const result = applyPlayableCommand({ ...clone(before.state), runSerial: before.identity.serial }, clone(command));
    const commit: DomainCommit = { identity: clone(before.identity), beforeCommandIndex: before.state.commandIndex, command: clone(command), result };
    requireValue(!result.error, result.error ?? '指令无效');
    requireValue(canonicalStringify(commit.identity) === canonicalStringify(before.identity) && commit.beforeCommandIndex === before.state.commandIndex
      && result.state.commandIndex === before.state.commandIndex + 1 && result.state.completedOrders >= before.state.completedOrders && result.state.score >= before.state.score,
    'Domain进度或身份不一致');
    requireValue(result.state.rulesetVersion === before.state.rulesetVersion && result.state.runConfigId === before.state.runConfigId
      && result.state.seed === before.state.seed && result.state.mode === before.state.mode && result.state.runSerial === before.identity.serial
      && ('difficultyId' in result.state ? result.state.difficultyId : undefined) === ('difficultyId' in before.state ? before.state.difficultyId : undefined)
      && (!isInboundRun(before.state) || isInboundRun(result.state) && result.state.guided === before.state.guided
        && (!(before.state.rulesetVersion===16||before.state.rulesetVersion===18||before.state.rulesetVersion===19||before.state.rulesetVersion===20||before.state.rulesetVersion===21)||'inboundDifficulty' in result.state&&result.state.inboundDifficulty===before.state.inboundDifficulty)), 'Domain改变了本局身份');
    const expectedCommands = [...before.state.commands, command];
    requireValue(canonicalStringify(result.state.commands) === canonicalStringify(expectedCommands), 'Domain没有记录已接受指令');
    let run: AccountRun = { ...before, state: { ...result.state, runSerial: before.identity.serial } as GameRun };
    if (isToolRun(run.state)) {
      const old = before.state;
      requireValue(isToolRun(old), '工具规则身份不一致');
      const newlyUsed = run.state.usedToolIds.filter(item => !old.usedToolIds.includes(item));
      const usedEvents = result.events.filter(event => event.type === 'toolUsed');
      const currentState = run.state;
      requireValue(old.usedToolIds.every(item => currentState.usedToolIds.includes(item)) && newlyUsed.length === usedEvents.length && newlyUsed.every(item => before.reserved.includes(item)
        && usedEvents.filter(event => event.type === 'toolUsed' && event.toolId === item).length === 1)
        && (ITEM_IDS.includes(command.type as ItemId) ? newlyUsed.length === 1 && newlyUsed[0] === command.type : newlyUsed.length === 0), '工具使用事实不一致');
      run = { ...run, reserved: before.reserved.filter(item => !newlyUsed.includes(item)) };
    }
    const domainTail = run.state.rulesetVersion === 8 ? run.state.commands.slice(before.history.totalCommands - before.history.tail.length) : run.state.commands;
    let staged: ReturnType<typeof stageHistory>;
    try { staged = stageHistory(storage, run.identity, before.history, domainTail, run.state.commandIndex, { closing }); }
    catch (error) { throw new PreparationStorageFailure(error instanceof Error ? error.message : '历史保存尚未确认'); }
    run = { ...run, history: staged.cursor, state: run.state.rulesetVersion === 8 ? run.state : { ...run.state, commands: staged.tail, commandBaseIndex: staged.commandBaseIndex } as GameRun };
    validateActive(run);
    if (run.resultCursor) {
      const observedChain = result.events.reduce((best, event) => event.type === 'shipment' ? Math.max(best, event.chain) : best, 0);
      run = { ...run, resultCursor: { ...run.resultCursor, maxChainSinceBaseline: Math.max(run.resultCursor.maxChainSinceBaseline, observedChain) } };
    }
    const track = trackFor(run), prior = guideProgress(account,track), progress = advanceGuide(track, prior, before.state, command, result);
    let next: AccountSnapshot = { ...account, run, guides: { ...account.guides, [track]: progress } };
    const credited = credit(next); next = recordAccountResult(credited.account, credited.account.run!);
    return { account: next, events: clone(result.events), delta: credited.delta, learned: progress.learned.filter(step => !prior.learned.includes(step)) };
  }
  function prepare(operation: Pending, account: AccountSnapshot): AccountSnapshot {
    const request = operation.request;
    if (request.type === 'start') {
      requireValue(account.run === null, '请先确认结束当前局');
      const intent = request.intent;
      requireValue(object(intent) && keys(intent, ['spec', 'items', 'guide', 'cleanupBranch']) && object(intent.spec)
        && Array.isArray(intent.items) && intent.items.length <= 2 && new Set(intent.items).size === intent.items.length
        && intent.items.every(item => ITEM_IDS.includes(item)) && ['guided', 'direct'].includes(intent.guide), '开局准备无效');
      const spec = intent.spec, inbound = spec.family === 'inbound', track: GuideTrack = inbound ? (spec.rulesetVersion===19||spec.rulesetVersion===20||spec.rulesetVersion===21||(spec.rulesetVersion===16||spec.rulesetVersion===18)&&spec.mode==='daily')?'daily':'inbound' : 'outbound', guided = intent.guide === 'guided';
      requireValue(inbound ? keys(spec, ['family', 'mode', 'rulesetVersion', 'seed', 'guided', 'toolCharges',...(spec.rulesetVersion===16||spec.rulesetVersion===18||spec.rulesetVersion===19||spec.rulesetVersion===20||spec.rulesetVersion===21?['inboundDifficulty']:[])]) && (spec.rulesetVersion === 9 || spec.rulesetVersion === 11 || spec.rulesetVersion===14||spec.rulesetVersion===15||spec.rulesetVersion===16||spec.rulesetVersion===18||spec.rulesetVersion===19||spec.rulesetVersion===20||spec.rulesetVersion===21)
        && (spec.rulesetVersion===19||spec.rulesetVersion===20||spec.rulesetVersion===21?spec.mode==='rush':['standard', 'daily', 'endless'].includes(spec.mode)) && spec.guided === guided
        : spec.family === 'outbound' && keys(spec, ['family', 'variant', 'rulesetVersion', 'seed', 'difficultyId',...(spec.rulesetVersion===12||spec.rulesetVersion===13?['toolCharges']:[])])
          && (spec.variant === 'normal' && (spec.rulesetVersion === 8||spec.rulesetVersion===12) || spec.variant === 'endless' && (spec.rulesetVersion === 10||spec.rulesetVersion===13))
          && (!(spec.rulesetVersion===12||spec.rulesetVersion===13)||owns(spec,'toolCharges')&&validToolChargesV12(spec.toolCharges)), '开局玩法身份不匹配');
      if(inbound&&spec.rulesetVersion===18)requireValue(!guided&&spec.guided===false&&(spec.inboundDifficulty===undefined||isInboundDifficultyV18(spec.inboundDifficulty))&&(spec.mode!=='daily'||spec.inboundDifficulty===undefined||spec.inboundDifficulty==='hard'),'规则18仅支持直接困难或专业开局，每日固定困难');
      if(inbound&&spec.rulesetVersion===19)requireValue(!guided&&spec.guided===false&&(spec.inboundDifficulty===undefined||isInboundDifficultyV18(spec.inboundDifficulty)),'加急仅支持直接困难或专业开局');
      if(inbound&&(spec.rulesetVersion===20||spec.rulesetVersion===21))requireValue(!guided&&spec.guided===false&&(spec.inboundDifficulty===undefined||spec.inboundDifficulty==='normal'),'加急固定普通基础');
      if(inbound&&(spec.rulesetVersion===19||spec.rulesetVersion===20||spec.rulesetVersion===21))requireValue(spec.toolCharges===undefined||validToolChargesV16(spec.toolCharges,'standard'),'加急工具预算无效');
      requireValue(!guided || !guideProgress(account,track).authoredStartConsumed && !guideProgress(account,track).skipped && !isGuideComplete(track, guideProgress(account,track), spec.rulesetVersion), '首次辅助开局已经使用');
      requireValue(!guided || (inbound ? spec.mode === 'standard' : spec.variant === 'normal' && (spec.rulesetVersion === 8||spec.rulesetVersion===12) && spec.difficultyId === 'easy'), '该模式不使用首次辅助开局');
      requireValue(intent.items.length === 0 || !guided && (inbound ? spec.mode !== 'daily' : spec.rulesetVersion===12||spec.rulesetVersion===13), '该模式不能使用个人工具');
      requireValue(inbound && spec.rulesetVersion === 9 && !guided ? intent.cleanupBranch === 'orders' || intent.cleanupBranch === 'placements' : intent.cleanupBranch === undefined, '清扫方式必须在当前局指定的步骤选择');
      requireValue(account.nextRunSerial < Number.MAX_SAFE_INTEGER, '本局序号已用尽');
      const serial = account.nextRunSerial;
      const daily = inbound && spec.mode === 'daily' ? dailyIdentity(wallTime(), spec.rulesetVersion) : null;
      requireValue(!daily||dailyRewardRecord(account,daily.day).completedRunId===null,'今日挑战已完成，请明天再来');
      const seed = guided ? inbound ? spec.rulesetVersion===16?INBOUND_GUIDE_V16.seed:spec.rulesetVersion===14||spec.rulesetVersion===15?INBOUND_GUIDE_V14.seed:spec.rulesetVersion === 11 ? INBOUND_GUIDE_V11.seed : INBOUND_GUIDE_V9.seed : spec.rulesetVersion===12?OUTBOUND_GUIDE_V12.seed:OUTBOUND_GUIDE_V8.seed : daily?.seed ?? parseInt(accountDigest(`${account.epoch}.${serial}.${inbound ? 'inbound' : 'outbound'}`), 16);
      const charges: ToolChargesV9 = { rotate: 0, clear: 0, wildcard: 0 }, inventory = { ...account.inventory };
      for (const item of intent.items) { requireValue(inventory[item] > 0, '工具库存不足'); inventory[item]--; charges[item] = 1; }
      const resolved: RunSpec = inbound ? spec.rulesetVersion===19||spec.rulesetVersion===20||spec.rulesetVersion===21?{...spec,seed,guided:false,toolCharges:charges}:{ ...spec, seed, guided, toolCharges: charges } : spec.rulesetVersion===12||spec.rulesetVersion===13?{...spec,seed,toolCharges:charges}:{ ...spec, seed };
      let state = createPlayableRun(resolved);
      const identity: RunIdentity = {
        runId: `${account.epoch}.${serial}`, serial, rulesetVersion: resolved.rulesetVersion, runConfigId: state.runConfigId, economyVersion: resolved.rulesetVersion>=12?2:1,
        mode: inbound ? guided ? 'guided' : spec.mode : guided ? 'outboundGuided' : spec.variant === 'normal' ? 'outbound' : 'outboundEndless',
        ...(isInboundRun(state)&&(state.rulesetVersion===16||state.rulesetVersion===18||state.rulesetVersion===19||state.rulesetVersion===20||state.rulesetVersion===21)?{inboundDifficulty:state.inboundDifficulty}:{}), ...(!inbound ? { difficultyId: spec.difficultyId } : {}), ...(daily ? { challengeDay: daily.day } : {}),
      };
      state = { ...state, runSerial: serial, maxOccupancy: 0, elapsedMs: 0 } as GameRun;
      let next: AccountSnapshot = { ...account, inventory, nextRunSerial: serial + 1,
        guides: guided ? { ...account.guides, [track]: { ...guideProgress(account,track), authoredStartConsumed: true } } : account.guides,
        run: { identity, state, history: { seed, runConfigId: state.runConfigId, head: null, totalCommands: 0, tail: [] }, lifecycle: 'active', reserved: [...intent.items], creditedBase: 0, earnedCoins: 0, resultCursor: null } };
      validateActive(next.run!);
      if (inbound && spec.rulesetVersion === 9 && !guided) {
        const applied = applyDomain(next, { type: 'chooseCleanup', branch: intent.cleanupBranch! });
        next = applied.account; operation.events = applied.events; operation.coinDelta = applied.delta; operation.learned = applied.learned;
      }
      return next;
    }
    if (request.type === 'purchase') {
      requireValue(ITEM_IDS.includes(request.item) && account.run === null, '当前不能购买工具');
      // Keep omitted legacy fields out of the receipt digest; defaults apply only here.
      const quantity = request.quantity ?? 1, price = shopPrice(ITEM_PRICES[request.item]) * quantity;
      requireValue(safe(price), '工具总价超出范围');
      requireValue(!owns(request, 'quotedPrice') || request.quotedPrice === price, '工具报价已变化，请重新确认');
      requireValue(account.wallet >= price, '金币不足');
      return { ...account, wallet: account.wallet - price, inventory: { ...account.inventory, [request.item]: add(account.inventory[request.item], quantity) } };
    }
    if(request.type==='setTutorialsEnabled'){requireValue(typeof request.enabled==='boolean','教程偏好无效');return {...account,tutorialsEnabled:request.enabled};}
    if (request.type === 'setSettings') {
      const profile = setProfileSettings(legacyProfile(account), request.patch);
      return { ...account, profile: { ...account.profile, settings: profile.settings } };
    }
    if (request.type === 'purchaseCosmetic') {
      const item = getCosmetic(request.kind, request.id);
      requireValue(item && account.run === null, '当前不能购买该外观');
      const owned = account.profile.ownedCosmetics!;
      if (owned.includes(item.key)) return account;
      requireValue(PLAYTEST_FREE_SHOP || item.price > 0, '当前不能购买该外观');
      const price = shopPrice(item.price);
      requireValue(account.wallet >= price, '金币不足');
      return { ...account, wallet: account.wallet - price, profile: { ...account.profile, ownedCosmetics: [...owned, item.key].sort() } };
    }
    if (request.type === 'purchaseCosmeticSet') {
      const quote = quoteCosmeticSetPurchase(request.id, { ownedCosmetics: account.profile.ownedCosmetics! });
      requireValue(quote, '套装不存在');
      requireValue(account.run === null, '当前不能购买套装');
      requireValue(Array.isArray(request.quotedKeys) && request.quotedKeys.length === quote.missingKeys.length
        && quote.missingKeys.every((key, index) => request.quotedKeys[index] === key)
        && safe(request.quotedPrice) && request.quotedPrice === quote.price, '套装报价已变化，请重新确认');
      if (quote.missingKeys.length === 0) return account;
      requireValue(account.wallet >= quote.price, '金币不足');
      return { ...account, wallet: account.wallet - quote.price, profile: { ...account.profile,
        ownedCosmetics: [...account.profile.ownedCosmetics!, ...quote.missingKeys].sort() } };
    }
    if (request.type === 'setCargoOutline') {
      requireValue(typeof request.enabled === 'boolean', '轮廓偏好无效');
      return { ...account, profile: { ...account.profile, cargoOutline: request.enabled,
        cosmetics: request.enabled ? { ...account.profile.cosmetics, cargo: 'classic' } : account.profile.cosmetics } };
    }
    if (request.type === 'setCosmetic') {
      const item = getCosmetic(request.kind, request.id);
      requireValue(item && account.profile.ownedCosmetics!.includes(item.key), '外观尚未拥有');
      if (item.overlay) return { ...account, profile: { ...account.profile, cosmetics: { ...account.profile.cosmetics, cargo: 'classic' }, cargoOutline: true } };
      return { ...account, profile: { ...account.profile, cosmetics: { ...account.profile.cosmetics, [request.kind]: request.id },
        ...(item.kind === 'cargo' && item.id === 'classic' ? { cargoOutline: false } : {}) } };
    }
    if(request.type==='equipClassicSet') {
      requireValue(isClassicSetSelection(request.selection),'经典套装选项无效');
      requireValue(classicSetStatus(request.selection,accountCosmeticState(account)).complete,'请先拥有所选的全部外观');
      const selected=classicSetDefinition(request.selection);
      return {...account,profile:{...account.profile,cosmetics:{theme:selected.theme,cargo:'classic',forklift:selected.forklift},cargoOutline:request.selection.cargo==='outline'}};
    }
    if (request.type === 'equipCosmeticSet') {
      const set = getCosmeticSet(request.id);
      requireValue(set&&set.id!=='classic', '套装不存在');
      requireValue((['theme', 'cargo', 'forklift'] as const).every(kind => {
        const item = getCosmetic(kind, set[kind]);
        return item && !item.overlay && account.profile.ownedCosmetics!.includes(item.key);
      }), '请先拥有套装中的全部外观');
      return { ...account, profile: { ...account.profile, cosmetics: { theme: set.theme, cargo: set.cargo, forklift: set.forklift } } };
    }
    if (request.type === 'resetResults') {
      const overlay = new Map<string, string>(), erased = new Set<string>(), raw = encodeProfile(legacyProfile(account));
      overlay.set(PROFILE_KEYS.main, raw); overlay.set(PROFILE_KEYS.backup, raw);
      const memoryStorage: StoragePort = { get: key => erased.has(key) ? null : overlay.get(key) ?? storage.get(key),
        set: (key, value) => { erased.delete(key); overlay.set(key, value); }, remove: key => { overlay.delete(key); erased.add(key); } };
      const reset = resetProfile(memoryStorage, account.nextRunSerial);
      requireValue(reset.ok && reset.profile, reset.message);
      requireValue(reset.profile.nextRunSerial === account.nextRunSerial, '旧局序号尚未同步，请先恢复检查');
      const next = resetAccountResults(account);
      return { ...next, profile: { ...next.profile, legacyResults: legacyResults(reset.profile) } };
    }
    if (request.type === 'recordLegacyResult') {
      requireValue(account.run === null && isRunSlot(request.slot), '当前不能记录旧局成绩');
      const loaded = loadPlayableRun(storage, request.slot), state = loaded.state;
      requireValue(loaded.source !== 'unavailable' && loaded.source !== 'corrupt' && state && state.phase === 'result'
        && state.rulesetVersion <= 8 && slotForRun(state) === request.slot && safe(state.runSerial) && state.runSerial > 0 && state.runSerial <= account.migration.legacySerialCeiling
        && state.runSerial < account.nextRunSerial, '旧局身份、结束事实或关闭边界无效');
      const profile = recordResult(legacyProfile(account), state);
      return { ...account, profile: { ...account.profile, legacyResults: legacyResults(profile) } };
    }
    const active = account.run;
    requireValue(active && active.identity.runId === request.runId, '本局已经关闭或标识不匹配'); validateActive(active);
    if (request.type === 'saveElapsed' || request.type === 'command' || request.type === 'close') {
      const elapsedMs = request.elapsedMs;
      if (request.type === 'saveElapsed') requireValue(safe(elapsedMs), '计时必须是单调不减的安全整数');
      if (elapsedMs !== undefined) {
        requireValue(safe(elapsedMs) && elapsedMs >= (active.state.elapsedMs ?? 0), '计时必须是单调不减的安全整数');
        requireValue(![11,14,15,16,18,19,20,21].includes(active.state.rulesetVersion) || active.state.phase !== 'cleanup' || active.state.commandIndex !== 0 || elapsedMs === 0, '选择清扫方式后才开始计时');
        if (elapsedMs !== (active.state.elapsedMs ?? 0)) account = { ...account, run: { ...active, state: { ...active.state, elapsedMs } as GameRun } };
      }
      if (request.type === 'saveElapsed') return account;
    }
    if (request.type === 'skipGuide') {
      requireValue(request.track === trackFor(active), '引导轨道不匹配');
      return { ...account, guides: { ...account.guides, [request.track]: { ...guideProgress(account,request.track), skipped: true } } };
    }
    if (request.type === 'command') {
      const applied = applyDomain(account, request.command);
      operation.events = applied.events; operation.coinDelta = applied.delta; operation.learned = applied.learned;
      return applied.account;
    }
    let next = account;
    requireValue(['home', 'failed', 'retired', 'decline_overtime'].includes(request.reason), '结束原因无效');
    if (request.reason === 'retired' && active.state.phase !== 'result') {
      requireValue(active.state.phase === 'input' || active.state.phase === 'rescue', '请先完成待选奖励或清扫');
      requireValue(active.state.rulesetVersion !== 8&&active.state.rulesetVersion!==12, '普通出库没有收工指令');
      const applied = applyDomain(account, isInboundRun(active.state) ? { type: 'finish' } : { type: 'finishOutboundEndless' }, true);
      next = applied.account; operation.events = applied.events; operation.coinDelta = applied.delta; operation.learned = applied.learned;
    }
    const run = next.run!;
    if (request.reason === 'failed') requireValue(run.state.phase === 'result' && run.state.result === 'failed' && run.state.endReason === 'blocked', '当前不是失败结算');
    if (request.reason === 'retired') requireValue(run.state.phase === 'result' && run.state.endReason === 'retired', '当前不是收工结算');
    if (request.reason === 'decline_overtime') requireValue(run.state.phase === 'result' && run.state.endReason === 'completed' && run.state.result === 'won', '当前没有待确认的完成结算');
    const credited = credit(next); next = credited.account; operation.coinDelta = add(operation.coinDelta, credited.delta);
    if (request.reason !== 'home') next = recordAccountResult(next, next.run!);
    const final = next.run!, inventory = { ...next.inventory };
    operation.closedState = clone(final.state);
    for (const item of final.reserved) inventory[item] = add(inventory[item], 1);
    operation.returned = [...final.reserved];
    return { ...next, run: null, inventory, closedThroughSerial: Math.max(next.closedThroughSerial, final.identity.serial), lastClosedResult: {
      identity: clone(final.identity), reason: request.reason === 'home' ? 'abandoned' : request.reason === 'decline_overtime' ? 'completed' : request.reason === 'failed' ? 'blocked' : 'retired',
      commandIndex: final.state.commandIndex, units: final.state.completedOrders, score: final.state.score, maxChain: final.state.maxChain,
      ...(final.state.elapsedMs === undefined ? {} : { elapsedMs: final.state.elapsedMs }),
      result: final.state.result, coinDelta: operation.coinDelta, earnedCoins: final.earnedCoins, returned: [...final.reserved], history: clone(final.history),
    } };
  }
  function execute(operation: Pending): TransactionResult {
    operation.replaceable = false;
    const loaded = loadAccount(storage, verify); status = loaded.status;
    const receipt = loaded.account?.lastOperation;
    validatedReceiptId = loaded.status === 'degraded' ? receipt?.operationId ?? null : null;
    if (receipt?.operationId === operation.request.operationId) {
      if (receipt.requestDigest !== operation.digest || receipt.expectedGeneration !== operation.expectedGeneration) { pending = null; return fail('同一操作的内容已改变'); }
      if (loaded.status === 'ready' && loaded.account) return acknowledge(loaded.account, operation.next ? operation : undefined);
      if (loaded.status === 'degraded') return settle(repairAccount(storage, verify), operation);
    }
    if (loaded.status === 'degraded') { pending = null; return fail('请先核对已提交操作并修复账户副本'); }
    if (loaded.status === 'ready' && loaded.account) published = clone(loaded.account);
    if (!['ready', 'empty'].includes(loaded.status)) return uncertain(loaded.message);
    if (loaded.account?.generation !== operation.expectedGeneration && !(loaded.status === 'empty' && operation.expectedGeneration === 0)) {
      pending = null; return fail('账户已更新，请重新读取');
    }
    if (!operation.next) {
      let base = loaded.account;
      if (!base) {
        const migration = prepareLegacyMigration(storage);
        if (migration.status === 'blocked') return uncertain(migration.message);
        base = migration.account;
      }
      try {
        operation.previous = loaded.account ? clone(loaded.account) : null;
        const prepared = upgradeAccountGuides(retainAccountCosmetics(upgradeEconomy(clone(base))));
        const next = retainAccountCosmetics(prepare(operation, prepared));
        if ((operation.request.type === 'saveElapsed' || operation.request.type === 'purchaseCosmetic' || operation.request.type === 'purchaseCosmeticSet' || operation.request.type === 'equipCosmeticSet' || operation.request.type === 'equipClassicSet') && canonicalStringify(next) === canonicalStringify(base)) {
          const result = acknowledge(base, operation); result.message = operation.request.type === 'saveElapsed' ? '计时未变化' : operation.request.type === 'equipCosmeticSet' || operation.request.type === 'equipClassicSet' ? '已使用该套装' : operation.request.type === 'purchaseCosmeticSet' ? '已拥有该套装全部外观' : '已拥有该外观'; return result;
        }
        operation.next = { ...next, generation: operation.expectedGeneration + 1, lastOperation: { operationId: operation.request.operationId,
          expectedGeneration: operation.expectedGeneration, requestDigest: operation.digest, committedGeneration: operation.expectedGeneration + 1 } };
      } catch (error) {
        // Immutable segments cannot commit an account on their own; neither root was touched.
        if (error instanceof PreparationStorageFailure) { operation.replaceable = true; return fail(error.message); }
        pending = null; return fail(error instanceof Error ? error.message : '操作无效，旧记录已保护');
      }
    }
    return settle(commitAccount(storage, operation.previous, operation.next, verify), operation);
  }
  return {
    getSnapshot: () => published ? clone(published) : null,
    getStatus: () => status,
    getPendingOperationId: () => pending?.request.operationId ?? (status === 'degraded' ? validatedReceiptId : null),
    refresh() {
      if (pending) return { status: 'unknown', account: null, message: '请先核对尚未确认的操作' };
      const loaded = loadAccount(storage, verify); status = loaded.status;
      validatedReceiptId = loaded.status === 'degraded' ? loaded.account?.lastOperation?.operationId ?? null : null;
      if (loaded.status === 'ready' && loaded.account) {
        acknowledge(loaded.account);
        return { ...loaded, account: clone(loaded.account) };
      }
      return { ...loaded, account: null };
    },
    transact(request, expectedGeneration) {
      if (lease.status !== 'held') return fail(lease.status === 'busy' ? '另一个窗口正在保存，请关闭该窗口后重试' : '无法获得可靠写入权限');
      let copied: AccountRequest, digest: string;
      try { validateRequest(request, expectedGeneration); copied = clone(request); digest = accountDigest(canonicalStringify({ request: copied, expectedGeneration })); }
      catch (error) { return fail(error instanceof Error ? error.message : '请求无效'); }
      const prior = known.get(request.operationId);
      if (prior && prior !== digest) return fail('同一操作的内容已改变');
      if (pending) {
        if (pending.request.operationId === request.operationId) {
          if (pending.digest !== digest) return fail('同一操作的内容已改变');
          return execute(pending);
        }
        if (!pending.replaceable) return fail('请先核对尚未确认的操作');
        pending = null;
      }
      known.set(request.operationId, digest);
      const operation: Pending = { request: copied, digest, expectedGeneration, previous: null, next: null, events: [], coinDelta: 0, returned: [], learned: [], replaceable: false };
      pending = operation;
      return execute(operation);
    },
    retryPending(operationId) {
      if (lease.status !== 'held') return fail('无法获得可靠写入权限');
      if (!identifier(operationId)) return fail('操作标识无效');
      if (pending) return pending.request.operationId === operationId ? execute(pending) : fail('必须核对同一个操作');
      const loaded = loadAccount(storage, verify); status = loaded.status;
      validatedReceiptId = loaded.status === 'degraded' ? loaded.account?.lastOperation?.operationId ?? null : null;
      if (loaded.account?.lastOperation?.operationId !== operationId) return fail('没有该操作的确认凭据');
      if (loaded.status === 'ready') return acknowledge(loaded.account);
      const repaired = repairAccount(storage, verify);
      return repaired.status === 'acknowledged' && repaired.account ? acknowledge(repaired.account) : publicResult(repaired.status, repaired.message);
    },
  };
}
