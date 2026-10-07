import {GENERATORS,UPGRADES,getStats,priceFor,upgradeAvailable} from './shared/economy.mjs';

// Lifetime earnings keep an unveiled resource visible after spending and prestige.
export function resourceDiscovered(state,index){
  const generator=GENERATORS[index];
  return Boolean(generator&&(state.totalEarned>=generator.basePrice||state.generators[index]>0));
}
export function resourceInfo(state,itemId,amount=1){
  const index=GENERATORS.findIndex(generator=>generator.id===itemId);
  if(index<0)return null;
  const generator=GENERATORS[index],count=state.generators[index]||0;
  const price=priceFor(itemId,count,amount);
  if(!resourceDiscovered(state,index))return {id:itemId,discovered:false,price,unlockPrice:generator.basePrice};
  const stats=getStats(state),research=UPGRADES.filter(upgrade=>upgrade.target===itemId);
  const upgradeMultiplier=research.reduce((product,upgrade)=>state.upgrades.includes(upgrade.id)?product*upgrade.multiplier:product,1);
  const unitCps=Math.min(1e250,generator.baseCps*upgradeMultiplier*stats.multiplier);
  const totalCps=Math.min(1e250,unitCps*count);
  return {id:itemId,index,discovered:true,name:generator.name,description:generator.description,count,amount,price,unitCps,totalCps,share:stats.cps?Math.min(100,totalCps/stats.cps*100):0,
    research:research.filter(upgrade=>state.upgrades.includes(upgrade.id)||upgradeAvailable(state,upgrade)).map(upgrade=>({...upgrade,owned:state.upgrades.includes(upgrade.id)}))};
}
