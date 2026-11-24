import test from 'node:test';
import assert from 'node:assert/strict';
import {restoreAudio,nextIndex} from '../static/js/audio-state.js';
const tracks = [{id:'a'},{id:'b'},{id:'c'}];
test('restore keeps a surviving current recording and valid positions without starting playback',()=>{
  const state = restoreAudio({queue:['gone','a','b','a'],index:2,positions:{a:30,b:15,gone:100,c:-5},rate:1.25,repeat:true},tracks);
  assert.deepEqual(state,{queue:['a','b'],index:1,positions:{a:30,b:15},rate:1.25,repeat:true});
  assert.deepEqual(restoreAudio({queue:'broken',positions:{a:NaN},rate:999},tracks),{queue:[],index:0,positions:{},rate:1,repeat:false});
});
test('queue stops at either end unless repeat is enabled',()=>{
  const state = {queue:['a','b'],index:1,repeat:false};
  assert.equal(nextIndex(state),-1); assert.equal(nextIndex(state,-1),0);
  state.repeat = true; assert.equal(nextIndex(state),0);
  state.index = 0; assert.equal(nextIndex(state,-1),1);
  assert.equal(nextIndex({queue:[],index:0,repeat:true}),-1);
});
