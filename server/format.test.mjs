import test from 'node:test';
import assert from 'node:assert/strict';
import { formatNumber } from '../format.mjs';

const ungroup=value=>value.replace(/[\s\u00a0\u202f]/gu,'');
test('number labels keep full digits at thousands, millions and 10^21',()=>{
  for(const [value,expected] of [[1000,'1000'],[1e6,'1000000'],[1e21,'1000000000000000000000']]){
    const label=formatNumber(value);
    assert.equal(ungroup(label),expected);
    assert.ok(!/[a-zа-яё]/iu.test(label),label);
    assert.ok(!/[eE][+-]?\d/.test(label),label);
  }
});
test('all supported economy magnitudes stay in full decimal notation',()=>{
  for(const exponent of [3,6,9,12,21,33,100,250]){
    const label=ungroup(formatNumber(10**exponent,0));
    assert.equal(label,'1'+'0'.repeat(exponent));
  }
});
test('Russian decimal precision and grouping preserve fractional CPS and multipliers',()=>{
  assert.equal(formatNumber(0.25,2),'0,25');
  assert.equal(formatNumber(1.1,2),'1,1');
  assert.equal(ungroup(formatNumber(1234.567,2)),'1234,57');
  assert.equal(formatNumber(12.8,0),'13');
});
test('display bounds do not expose NaN, Infinity, negatives or excessive fractions',()=>{
  for(const value of [NaN,Infinity,-Infinity,-100])assert.equal(formatNumber(value),'0');
  assert.equal(formatNumber(1.234567891234,100),'1,23456789');
  assert.equal(formatNumber(1.8,-3),'2');
});
