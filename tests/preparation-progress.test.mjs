import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { emptyProgress,noteAnswer,archiveExam,practicePlan,dueTopics,dueSkills,weakTopics,loadPreparation,savePreparation,skillKey,topicAssessment,hydrateSkills,troubleSkills } from '../static/js/preparation-progress.js';
import { createExam,completeSection,startNextSection } from '../static/js/mock-engine.js';
const bank=JSON.parse(readFileSync(new URL('../data/mock-exam.json',import.meta.url)));
const DAY=86400000,now=2000000000;
const question=(id,skill='rule:a',topic='test')=>({id,family:id,skill,topic});
test('each word or construction keeps its own schedule and unresolved mistake',()=>{
 const p=emptyProgress(),a=question('a'),b=question('b','rule:b');
 noteAnswer(p,a,'incorrect',8000,now);
 noteAnswer(p,b,'correct',4000,now+1000);
 assert.equal(p.skills['rule:a'].due,now+600000);
 assert.equal(p.skills['rule:a'].needsPractice,true);
 assert.equal(p.skills['rule:b'].due,now+1000+DAY);
 assert.deepEqual(dueSkills(p,now+600001),['rule:a']);
 const a2=question('a2');noteAnswer(p,a2,'correct',5000,now+2000);
 assert.equal(p.skills['rule:a'].needsPractice,true,'One success on related material cannot erase the failure');
});
test('spacing grows across days, not repeated answers in a single sitting',()=>{
 const p=emptyProgress(),a=question('a'),b=question('b');
 noteAnswer(p,a,'correct',1000,now);noteAnswer(p,b,'correct',1000,now+1000);
 assert.equal(p.skills['rule:a'].streak,1);
 noteAnswer(p,a,'correct',1000,now+DAY+1000);
 assert.equal(p.skills['rule:a'].streak,2);assert.equal(p.skills['rule:a'].due,now+4*DAY+1000);
 noteAnswer(p,a,'hinted',1000,now+DAY+2000,1);
 assert.equal(p.skills['rule:a'].streak,0);assert.ok(troubleSkills(p).includes('rule:a'));
});
test('mistake practice uses another example of the exact failed rule',()=>{
 const p=emptyProgress(),q=bank.items.find(q=>q.topic==='ability');
 noteAnswer(p,q,'incorrect',1000,now);
 assert.equal(topicAssessment(p,q.topic).state,'insufficient');
 const plan=practicePlan(bank,p,{mode:'mistakes',seed:1,now});
 assert.ok(plan.questions.length>1);
 assert.ok(plan.questions.every(v=>skillKey(v)===skillKey(q)));
 assert.notEqual(plan.questions[0].id,q.id);assert.ok(plan.questions[0].fresh);
 assert.equal(practicePlan(bank,p,{mode:'due',now}).questions.length,0);
 assert.ok(practicePlan(bank,p,{mode:'due',now:now+600001}).questions.every(v=>skillKey(v)===skillKey(q)));
});
test('unopened exam questions affect the exam score but not knowledge or review schedules',()=>{
 const p=emptyProgress(),exam=createExam(bank,3,[],now);
 assert.equal(archiveExam(p,exam,now),false);
 const s=exam.sections[0],q=s.questions[0],skip=s.questions[1],bad=s.questions[2];
 s.answers[q.id]=q.correct;s.answers[bad.id]=(bad.correct+1)%4;s.viewed=[q.id,skip.id,bad.id];
 completeSection(exam,false,now+10000);startNextSection(exam,now+20000);completeSection(exam,true,now+2400000);
 assert.ok(archiveExam(p,exam,now+2400000));const run=p.exams[0];
 assert.equal(run.total,49);assert.equal(run.correct,1);assert.equal(run.incorrect,1);assert.equal(run.skipped,1);assert.equal(run.unopened,46);
 assert.equal(Object.values(p.topics).reduce((n,s)=>n+s.attempts,0),3);
 assert.equal(Object.keys(p.questions).length,3);
 assert.equal(Object.values(p.topics).reduce((n,s)=>n+topicAssessment(p,Object.keys(p.topics).find(k=>p.topics[k]===s)).count,0),2);
 assert.equal(archiveExam(p,exam),false);
 exam.archived=true;p.exams=[];assert.equal(archiveExam(p,exam),false);
});
test('a viewed skip leaves an existing known item schedule and assessment unchanged',()=>{
 const p=emptyProgress(),q=question('a');
 noteAnswer(p,q,'correct',1000,now);
 const due=p.skills['rule:a'].due;
 noteAnswer(p,q,'skipped',1000,now+DAY);
 assert.equal(p.skills['rule:a'].due,due);assert.equal(p.skills['rule:a'].streak,1);
 assert.equal(topicAssessment(p,'test').count,1);
 assert.ok(noteAnswer(p,q,'correct',1000,now+DAY+1000).independent);
});
test('perfect same-day results are not weak, and insufficient samples are labelled honestly',()=>{
 const p=emptyProgress();
 for(let i=0;i<4;i++)noteAnswer(p,question('q'+i),'correct',1000,now);
 assert.equal(topicAssessment(p,'test').state,'insufficient');
 noteAnswer(p,question('q4'),'correct',1000,now);
 assert.equal(topicAssessment(p,'test').state,'good');assert.deepEqual(weakTopics(p),[]);
 assert.ok(dueTopics(p,now+DAY).includes('test'));
});
test('recent independent results recover from old failures and ignore same-question cramming',()=>{
 const p=emptyProgress();
 for(let i=0;i<20;i++)noteAnswer(p,question('bad'+i),'incorrect',1000,now);
 assert.ok(weakTopics(p).includes('test'));
 for(let i=0;i<30;i++)noteAnswer(p,question('bad0'),'correct',1000,now+1000+i);
 assert.ok(weakTopics(p).includes('test'));
 for(let i=0;i<20;i++)noteAnswer(p,question('new'+i),'correct',1000,now+2000+i);
 assert.equal(topicAssessment(p,'test').state,'good');
 assert.ok(p.topics.test.correct/p.topics.test.attempts<1);
 assert.equal(topicAssessment(p,'test').count,20);
});
test('reference, example, revealed answer and explicit unknown remain distinct',()=>{
 const p=emptyProgress();
 noteAnswer(p,question('a'),'hinted',1000,now,1);
 noteAnswer(p,question('b'),'hinted',1000,now,2);
 noteAnswer(p,question('c'),'revealed',1000,now,3);
 noteAnswer(p,question('d'),'unknown',1000,now);
 assert.equal(p.topics.test.reference,3);assert.equal(p.topics.test.revealed,1);assert.equal(p.topics.test.unknown,1);
 assert.equal(topicAssessment(p,'test').count,1);assert.equal(topicAssessment(p,'test').correct,0);
});
test('existing per-question progress seeds individual schedules without losing totals',()=>{
 const q=bank.items[0],p=emptyProgress();delete p.skills;
 p.questions[q.id]={attempts:7,last:now,status:'correct'};
 p.topics[q.topic]={attempts:7,correct:7};
 hydrateSkills(p,bank);hydrateSkills(p,bank);
 assert.equal(p.topics[q.topic].attempts,7);assert.equal(p.skills[skillKey(q)].due,now+DAY);
 assert.equal(topicAssessment(p,q.topic).count,1);
});
test('profile storage and study session survive reload and blocked storage',()=>{
 let value=null;const storage={getItem:()=>value,setItem:(k,v)=>{value=v;}};
 const p=loadPreparation(storage);p.session=practicePlan(bank,p,{topic:'dates',seed:1,now});
 assert.ok(savePreparation(p,storage));assert.deepEqual(loadPreparation(storage),p);
 value='{bad';assert.deepEqual(loadPreparation(storage),emptyProgress());
 assert.equal(savePreparation(p,{setItem(){throw Error();}}),false);
});

test('book counter 冊 does not share the long-object 本 schedule',()=>{
 const books=bank.items.find(q=>q.id==='balance:3');
 const pencils=bank.items.find(q=>q.id==='prep:144');
 const progress=emptyProgress();
 noteAnswer(progress,pencils,'incorrect',1000,now);
 noteAnswer(progress,books,'correct',1000,now+1000);
 assert.notEqual(skillKey(books),skillKey(pencils));
 assert.ok(troubleSkills(progress).includes(skillKey(pencils)));
 assert.equal(progress.skills[skillKey(pencils)].due,now+600000);
});
