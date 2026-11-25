import test from 'node:test';
import assert from 'node:assert/strict';
import {restoreAudio,nextIndex,uniqueAudioTracks} from '../static/js/audio-state.js';
const tracks = [{id:'a'},{id:'b'},{id:'c'}];
test('restore keeps a surviving current recording and valid positions without starting playback',()=>{
  const state = restoreAudio({queue:['gone','a','b','a'],index:2,positions:{a:30,b:15,gone:100,c:-5},rate:1.25,repeat:true},tracks);
  assert.deepEqual(state,{queue:['a','b'],index:1,positions:{a:30,b:15},rate:1.25,repeat:true});
  assert.deepEqual(restoreAudio({queue:'broken',positions:{a:NaN},rate:999},tracks),{queue:[],index:0,positions:{},rate:1,repeat:false});
});
test('different encodings of the same dialogue enter the queue once, preserving the selected file',()=>{
  const recordings=[{id:'2010',family:'shared'},{id:'2012',family:'shared'},{id:'2013'},{id:'2017',family:'shared'},{id:'2018'}];
  assert.deepEqual(uniqueAudioTracks(recordings).map(t=>t.id),['2010','2013','2018']);
  assert.deepEqual(uniqueAudioTracks(recordings,'2017').map(t=>t.id),['2017','2013','2018']);
  assert.deepEqual(uniqueAudioTracks(recordings.filter(t=>t.id!=='2010'),'2012').map(t=>t.id),['2012','2013','2018']);
});
test('queue stops at either end unless repeat is enabled',()=>{
  const state = {queue:['a','b'],index:1,repeat:false};
  assert.equal(nextIndex(state),-1); assert.equal(nextIndex(state,-1),0);
  state.repeat = true; assert.equal(nextIndex(state),0);
  state.index = 0; assert.equal(nextIndex(state,-1),1);
  assert.equal(nextIndex({queue:[],index:0,repeat:true}),-1);
});
