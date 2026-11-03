import test from 'node:test';
import assert from 'node:assert/strict';
import {workbookSession, restoreWorkbookSession, recordWorkbookAnswer, loadWorkbookProgress, saveWorkbookProgress} from '../static/js/workbook-progress.js';
const items=[{id:'a',choices:['1','2','3'],correct:1},{id:'b',choices:['1','2','3'],correct:0},{id:'c',choices:['1','2','3'],correct:null}];
test('correction does not replace the first result or consume another slot',()=>{
 const session=workbookSession(items,'test'), progress={};
 recordWorkbookAnswer(progress,session,items[0],'incorrect',0);
 recordWorkbookAnswer(progress,session,items[0],'correct',1);
 assert.equal(session.answers.a.first,'incorrect');assert.equal(session.answers.a.firstChoice,0);
 assert.equal(progress.records.a.status,'incorrect');assert.equal(session.keys.length,3);
 assert.equal(restoreWorkbookSession(session,items).answers.a.status,'correct');
});
test('a new independent success clears a mistake; revealed and unknown remain distinct',()=>{
 const progress={};let session=workbookSession(items,'test');
 recordWorkbookAnswer(progress,session,items[0],'incorrect',0);
 session=workbookSession(items,'retry');recordWorkbookAnswer(progress,session,items[0],'correct',1);
 assert.equal(progress.records.a.status,'correct');
 recordWorkbookAnswer(progress,session,items[1],'unknown',null);assert.equal(progress.records.b.status,'unknown');
 recordWorkbookAnswer(progress,session,items[2],'ungraded',0);assert.equal(progress.records.c,undefined);
});
test('untrusted saved sessions and denied storage do not break workbooks',()=>{
 assert.equal(restoreWorkbookSession({keys:['missing'],index:0},items),null);
 assert.equal(restoreWorkbookSession({keys:['a','a'],index:0},items),null);
 assert.equal(restoreWorkbookSession({keys:['a'],index:-1},items),null);
 assert.deepEqual(loadWorkbookProgress({getItem(){throw Error();}}),{books:{}});
 assert.equal(saveWorkbookProgress({}, {setItem(){throw Error();}}),false);
 const session=workbookSession(items,'random',true,2);assert.equal(new Set(session.keys).size,2);
 const record=restoreWorkbookSession({keys:['a'],index:0,answers:{a:{choice:20,status:'fake'}}},items).answers.a;
 assert.equal(record.choice,null);assert.equal(record.status,null);
});
