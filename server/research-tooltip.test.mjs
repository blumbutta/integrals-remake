import test from 'node:test';
import assert from 'node:assert/strict';
import {researchTooltipPlacement} from '../research-tooltip.mjs';

function check(input){
  const result=researchTooltipPlacement(input),height=Math.min(input.height,result.maxHeight);
  const right=result.left+result.width,bottom=result.top+height;
  const limit=Number.isFinite(input.bottomLimit)&&input.bottomLimit>12&&input.bottomLimit<=input.viewportHeight-12?input.bottomLimit:input.viewportHeight-12;
  assert.ok(result.left>=12);assert.ok(right<=input.viewportWidth-12);
  assert.ok(result.top>=12);assert.ok(bottom<=limit);assert.ok(result.maxHeight>=0);
  const separated=right<=input.anchor.left-10||result.left>=input.anchor.right+10||bottom<=input.anchor.top-10||result.top>=input.anchor.bottom+10;
  assert.ok(separated||result.maxHeight===0,JSON.stringify({input,result}));
  return result;
}

test('desktop sidebar tooltip sits to the left without covering its research icon or statistics',()=>{
  const input={anchor:{left:1480,right:1536,top:340,bottom:396},width:370,height:360,viewportWidth:1600,viewportHeight:900,bottomLimit:790};
  const box=check(input);assert.equal(box.left,1100);assert.equal(box.width,370);assert.equal(box.top,340);
});

test('desktop chooses a full right card before shrinking a left card, then permits a 260px side minimum',()=>{
  const right=check({anchor:{left:300,right:340,top:200,bottom:240},width:370,height:300,viewportWidth:1000,viewportHeight:700});
  assert.equal(right.left,350);assert.equal(right.width,370);
  const narrow=check({anchor:{left:330,right:370,top:200,bottom:240},width:370,height:300,viewportWidth:700,viewportHeight:700});
  assert.equal(narrow.left,12);assert.equal(narrow.width,308);
});

test('380px phone places top, middle and bottom icons vertically with a readable full-width card',()=>{
  for(const [top,bottom] of [[25,69],[270,314],[540,584]]){
    const input={anchor:{left:24,right:68,top,bottom},width:370,height:450,viewportWidth:380,viewportHeight:700,bottomLimit:602};
    const box=check(input);assert.equal(box.width,356);assert.equal(box.left,12);
    assert.ok(box.top>=bottom+10||box.top+Math.min(input.height,box.maxHeight)<=top-10);
  }
});

test('a short phone viewport exposes the larger vertical space as a scrollable tooltip',()=>{
  const top=check({anchor:{left:180,right:224,top:16,bottom:60},width:370,height:1400,viewportWidth:380,viewportHeight:240,bottomLimit:190});
  assert.equal(top.top,70);assert.equal(top.maxHeight,120);
  const bottom=check({anchor:{left:180,right:224,top:130,bottom:174},width:370,height:1400,viewportWidth:380,viewportHeight:240,bottomLimit:190});
  assert.equal(bottom.top,12);assert.equal(bottom.maxHeight,108);
});

test('long desktop text is bounded by the statistics and short text near the bottom moves upward',()=>{
  const common={anchor:{left:1100,right:1144,top:690,bottom:734},width:370,viewportWidth:1280,viewportHeight:800,bottomLimit:710};
  const long=check({...common,height:5000});assert.equal(long.top,12);assert.equal(long.maxHeight,698);
  const short=check({...common,height:120});assert.equal(short.top,590);assert.equal(short.maxHeight,120);
});

test('invalid bottom boundaries fall back to the viewport margin and vertical resizing cannot cover the icon',()=>{
  for(const bottomLimit of [undefined,NaN,-10,0,900]){
    const input={anchor:{left:290,right:334,top:530,bottom:574},width:370,height:120,viewportWidth:380,viewportHeight:640,bottomLimit};
    const box=check(input);assert.equal(box.top,400);assert.equal(box.maxHeight,120,'longer wrapped content must scroll rather than expand over the icon');
  }
});

test('geometry remains bounded and separate across desktop and mobile grids',()=>{
  for(const viewportWidth of [320,380,600,768,1280,1920])for(const viewportHeight of [240,480,900]){
    const bottomLimit=viewportHeight-70;
    for(const x of [12,Math.floor(viewportWidth/2)-22,viewportWidth-56])for(const y of [12,Math.floor(bottomLimit/2)-22,bottomLimit-44]){
      for(const height of [80,370,2000])check({anchor:{left:x,right:x+44,top:y,bottom:y+44},width:370,height,viewportWidth,viewportHeight,bottomLimit});
    }
  }
});
