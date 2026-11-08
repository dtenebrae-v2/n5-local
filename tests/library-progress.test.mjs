import test from 'node:test';
import assert from 'node:assert/strict';
import {loadReading,saveReading,readingState} from '../static/js/library-progress.js';
import {resolveRoute} from '../static/js/router.js';
test('page, audio offset, rate and completion survive browser storage',()=>{
 let value=null;const storage={getItem:()=>value,setItem:(key,v)=>{value=v;}};
 const progress=loadReading(storage);progress.books['61371']={page:5,audioTime:27.5,rate:1.25,zoom:1.5,completed:true};
 assert.ok(saveReading(progress,storage));
 const state=readingState(loadReading(storage),'61371');assert.equal(state.page,5);assert.equal(state.audioTime,27.5);assert.equal(state.rate,1.25);assert.ok(state.completed);
 value='{broken';assert.equal(readingState(loadReading(storage),'61371').page,1);
 assert.equal(saveReading(progress,{setItem(){throw Error();}}),false);
});
test('damaged values cannot become invalid page positions or playback rates',()=>{
 const state=readingState({books:{x:{page:-3,audioTime:Infinity,rate:9,zoom:NaN}}},'x');
 assert.equal(state.page,1);assert.equal(state.audioTime,0);assert.equal(state.rate,1);assert.equal(state.zoom,1);
});
test('library and known book-shaped routes are independent of the vocabulary route',()=>{
 const catalog={base:'/jlpt/n5',collections:[],sections:[],lessons:[]};
 assert.equal(resolveRoute('/jlpt/n5/library',catalog).type,'library');
 assert.equal(resolveRoute('/jlpt/n5/library/61371',catalog).bookId,'61371');
 assert.equal(resolveRoute('/jlpt/n5/library/../server.py',catalog).type,'missing');
});
test('PDF coordinates, custom scale and fit mode survive storage without losing old progress',()=>{
 const state=readingState({books:{x:{page:3,audioTime:12,zoom:1.5,scale:2.25,fit:null,position:{page:3,left:72,top:381},totalPages:18}}},'x');
 assert.deepEqual(state.position,{page:3,left:72,top:381});
 assert.equal(state.scale,2.25);assert.equal(state.fit,null);assert.equal(state.totalPages,18);
 assert.equal(readingState({books:{x:{page:5,zoom:1.5}}},'x').page,5);
 assert.equal(readingState({books:{x:{fit:'page-fit',scale:.5}}},'x').fit,'page-fit');
 const damaged=readingState({books:{x:{position:{page:0,left:Infinity,top:1},scale:99,totalPages:-1}}},'x');
 assert.equal(damaged.position,null);assert.equal(damaged.scale,4);assert.equal(damaged.totalPages,null);
});
