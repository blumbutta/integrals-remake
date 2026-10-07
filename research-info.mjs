import {GENERATORS,UPGRADES,upgradeAvailable} from './shared/economy.mjs';
import {resourceDiscovered} from './resource-info.mjs';

const researchById=new Map(UPGRADES.map(upgrade=>[upgrade.id,upgrade]));
const countText=new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0});

// Visibility follows the resource shop, independently of research ownership.
// Hidden research returns no metadata, so a tooltip cannot reveal the next stage.
export function researchInfo(state,upgradeId){
  const upgrade=researchById.get(upgradeId);
  if(!upgrade)return null;
  const manual=upgrade.target==='click';
  const resourceIndex=manual?-1:GENERATORS.findIndex(generator=>generator.id===upgrade.target);
  if(!manual&&(resourceIndex<0||!resourceDiscovered(state,resourceIndex)))return null;
  const resourceName=manual?'Ручной клик':GENERATORS[resourceIndex].name;
  const owned=state.upgrades.includes(upgrade.id);
  const unlocked=owned||upgradeAvailable(state,upgrade);
  const amount=countText.format(upgrade.requirement.amount);
  const requirement=manual?`Сделать ${amount} ручных кликов`:`Иметь ${amount} × «${resourceName}»`;
  return {
    id:upgrade.id,name:upgrade.name,description:upgrade.description,price:upgrade.price,
    target:upgrade.target,resourceIndex,resourceName,owned,unlocked,
    affordable:!owned&&unlocked&&state.balance>=upgrade.price,
    requirement,
  };
}

// Purchasable discoveries come first, then locked/unaffordable ones, then completed
// research. Within each group the cheapest item is first; equal prices retain the
// catalog order, so tiles do not jump unpredictably when the balance changes.
export function researchList(state){
  const group=info=>info.owned?2:info.affordable?0:1;
  return UPGRADES.map(upgrade=>researchInfo(state,upgrade.id)).filter(Boolean)
    .sort((a,b)=>group(a)-group(b)||a.price-b.price);
}
