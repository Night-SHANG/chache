import { createAndroidStorage, type NativeStorageBridge } from '../../src/platform/android-storage.ts';
import { check, measureStress, seedRecovery, seedUpgrade, startCrash, verifyRecovery, verifyUpgrade, type BenchmarkVariant, type CrashPhase, type Trace } from './acceptance-fixtures.ts';
declare const __ANDROID_ACCEPTANCE_TRACE__: Trace;
declare const WarehouseAcceptanceStorage: NativeStorageBridge;
declare const WarehouseAcceptanceControl: { checkpoint(phase: string): void; complete(result: string): void };
declare const __ANDROID_ACCEPTANCE_COMMAND__: { action: string; phase: CrashPhase };
async function main() {
 const storage = createAndroidStorage(WarehouseAcceptanceStorage), { action, phase } = __ANDROID_ACCEPTANCE_COMMAND__;
 const trace = __ANDROID_ACCEPTANCE_TRACE__;
 if (action === 'seed-crash') {
  seedRecovery(storage, trace, phase === 'receipt-lost');
  startCrash(storage, trace, phase, value => WarehouseAcceptanceControl.checkpoint(value));
  throw Error('Crash checkpoint was not reached and blocked');
 }
 if (action === 'verify-crash') return verifyRecovery(storage, trace, phase);
 if (action === 'seed-upgrade') return seedUpgrade(storage, trace);
 if (action === 'verify-upgrade') return verifyUpgrade(storage, trace);
 check(action === 'performance', 'Unknown acceptance action');
 check(['normal', 'realistic', 'extreme'].includes(phase), 'Unknown benchmark fixture');
 return measureStress(storage, 100, phase as unknown as BenchmarkVariant, trace);
}
main().then(result => WarehouseAcceptanceControl.complete(JSON.stringify(result)))
 .catch(error => WarehouseAcceptanceControl.complete(JSON.stringify({ status: 'failed', message: error instanceof Error ? error.message : String(error) })));
