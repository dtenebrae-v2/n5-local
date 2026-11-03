import test from 'node:test';
import assert from 'node:assert/strict';
import {examItems, practiceItems, newExamSession, restoreExamSession, answerRecord, checkPractice,
  beginExamSection, finishExamSection, expireExamSection, examSummary} from '../static/js/exam-session.js';

function fixture() {
  return {id:'test',revision:'a',sections:['vocabulary','listening'].map((id,i)=>({id,title:id,seconds:60,
    groups:[{number:1,title:'Group',items:[{id:'q'+i,number:1,family:'f'+i,choices:4,correct:i,pages:['p1']}]}]}))};
}
test('random practice excludes unverified keys and audio without intervals; deduplicates across sets',()=>{
  const items=examItems(fixture());
  const copy={...items[0],id:'copy',examId:'other'};
  assert.deepEqual(new Set(practiceItems([...items,copy,{...copy,id:'ungraded',correct:null},{...copy,id:'unmapped',audio:'a'}],10,()=>.5).map(q=>q.family)),new Set(['f0','f1']));
});
test('correction preserves the first attempt and does not change question count',()=>{
  const exam=fixture(),items=examItems(exam),session=newExamSession(exam,'practice',items),map=new Map(items.map(q=>[q.id,q]));
  assert.equal(checkPractice(session,items[0]),false);
  answerRecord(session,'q0').choice=1;checkPractice(session,items[0]);
  answerRecord(session,'q0').choice=0;checkPractice(session,items[0]);
  assert.equal(session.answers.q0.first,'incorrect');assert.equal(session.answers.q0.status,'correct');
  assert.equal(session.keys.length,2);assert.equal(examSummary(session,map).incorrect,1);
});
test('unknown and reveal cannot become a first-attempt success',()=>{
  const exam=fixture(),items=examItems(exam),s=newExamSession(exam,'practice',items);
  checkPractice(s,items[0],'unknown');answerRecord(s,'q0').choice=0;checkPractice(s,items[0]);
  assert.equal(s.answers.q0.first,'unknown');
  checkPractice(s,items[1],'revealed');assert.equal(s.answers.q1.first,'revealed');
});
test('section timers survive reload and do not start the next section automatically',()=>{
  const exam=fixture(),items=examItems(exam),map=new Map(items.map(q=>[q.id,q]));
  const s=newExamSession(exam,'exam');beginExamSection(s,exam,1000);
  const restored=restoreExamSession(JSON.parse(JSON.stringify(s)),exam,map);
  assert.equal(restored.deadline,61000);assert.equal(expireExamSection(restored,exam,61000),true);
  assert.equal(restored.section,1);assert.equal(restored.ready,true);assert.equal(restored.deadline,null);
  assert.equal(restored.index,1);assert.deepEqual(restored.locked,['vocabulary']);
  assert.equal(expireExamSection(restored,exam,999999),false);
  beginExamSection(restored,exam,100000);finishExamSection(restored,exam);assert.equal(restored.finished,true);
});
test('ungraded questions are excluded from the scored denominator',()=>{
  const exam=fixture();exam.sections[1].groups[0].items[0].correct=null;
  const items=examItems(exam),s=newExamSession(exam,'exam');answerRecord(s,'q0').choice=0;
  assert.deepEqual(examSummary(s,new Map(items.map(q=>[q.id,q]))),{correct:1,incorrect:0,skipped:0,ungraded:1,total:2});
});
test('corrupt and obsolete sessions cannot unlock completed sections or inject answers',()=>{
  const exam=fixture(),items=examItems(exam),map=new Map(items.map(q=>[q.id,q]));
  const s=newExamSession(exam,'exam');beginExamSection(s,exam,1000);finishExamSection(s,exam);beginExamSection(s,exam,2000);
  assert.ok(restoreExamSession(s,exam,map));
  for(const mutation of [x=>x.revision='old',x=>x.index=0,x=>x.locked=[],x=>x.keys.push('bad'),x=>x.deadline=NaN,x=>x.answers.q1={choice:8,first:null,firstChoice:null}]) {
    const copy=structuredClone(s);mutation(copy);assert.equal(restoreExamSession(copy,exam,map),null);
  }
});
test('damaged playback positions cannot break audio after restore',()=>{
  const exam=fixture(),items=examItems(exam),map=new Map(items.map(q=>[q.id,q]));
  const s=newExamSession(exam,'practice',items);s.audio={q0:'bad',q1:4,unknown:8};
  assert.deepEqual(restoreExamSession(s,exam,map).audio,{q1:4});
  s.ready=true;assert.equal(restoreExamSession(s,exam,map),null);
});
