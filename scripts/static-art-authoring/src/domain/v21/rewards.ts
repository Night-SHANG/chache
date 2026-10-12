/** Persisted rule identity owns the coin policy; old entitlements never change. */
export function rushCoinMultiplier(rulesetVersion:number,won:boolean):1|3 {
 if(rulesetVersion!==19&&rulesetVersion!==20&&rulesetVersion!==21)throw new Error('Invalid rush reward identity');
 return won&&rulesetVersion!==21?3:1;
}
