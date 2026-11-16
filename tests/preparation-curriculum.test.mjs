import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lessonFor, lessonItems, objectiveItems, lessonPicker, reviewFor, reviewResults, archiveReview, reviewHistory } from '../static/js/preparation-curriculum.js';
import { practicePlan, emptyProgress, loadPreparation, savePreparation } from '../static/js/preparation-progress.js';
import { preparationSettings } from '../static/js/preparation-setup.js';
import { createExam } from '../static/js/mock-engine.js';
const bank = JSON.parse(readFileSync(new URL('../data/mock-exam.json', import.meta.url)));

test('all 25 lessons have rules, separate examples and targeted independent exercises', () => {
  assert.deepEqual(bank.curriculum.lessons.map(l => l.number), Array.from({length:25}, (_,i) => i+1));
  for (const lesson of bank.curriculum.lessons) {
    assert.ok(lessonItems(bank, lesson.number).length);
    for (const objective of lesson.objectives) {
      assert.ok(objective.rule && objective.example, objective.id);
      assert.ok(objective.minimumExamples >= 8, objective.id);
      const questions = objectiveItems(bank, objective);
      assert.ok(new Set(questions.map(q=>q.family)).size >= objective.minimumExamples, objective.id);
      assert.ok(questions.every(q=>bank.skills.some(s=>s.id===q.skill && s.rule && s.example)));
    }
  }
});

test('each lesson plan stays in its material and shuffles without changing correct answers', () => {
  for (const lesson of bank.curriculum.lessons) {
    const allowed = new Set(lessonItems(bank,lesson.number).map(q=>q.id));
    const plan = practicePlan(bank,emptyProgress(),{lesson:String(lesson.number),count:20,seed:lesson.number});
    assert.equal(plan.lesson,String(lesson.number));
    assert.ok(plan.questions.length);
    for (const q of plan.questions) {
      assert.ok(allowed.has(q.id),`lesson ${lesson.number}: ${q.id}`);
      const original = bank.items.find(item=>item.id===q.id);
      assert.equal(q.choices[q.correct],original.choices[original.correct]);
    }
  }
  assert.equal(practicePlan(bank,emptyProgress(),{lesson:'missing'}).questions.length,0);
});

test('plain forms and foundations cannot silently regress to mostly negative forms', () => {
  const plan = practicePlan(bank,emptyProgress(),{lesson:'24',count:10,seed:50});
  for (const skill of ['foundations:dictionary','foundations:plain-ta','foundations:plain-nakatta','foundations:plain-da','foundations:plain-datta','plain:negative']) {
    assert.ok(plan.questions.some(q=>q.skill===skill),skill);
  }
  for (const requirement of bank.coverage.requirements) {
    assert.ok(new Set(objectiveItems(bank,requirement).map(q=>q.family)).size >= requirement.minimumExamples,requirement.id);
  }
});

test('saved lessons are validated and rule views escape authored content', () => {
  assert.equal(preparationSettings({lesson:'24'},bank).lesson,'24');
  assert.equal(preparationSettings({lesson:'99'},bank).lesson,'');
  const modified = structuredClone(bank);
  lessonFor(modified,5).objectives[0].rule='<img src=x onerror=alert(1)>';
  const html=lessonPicker(modified,'5');
  assert.match(html,/&lt;img/);
  assert.doesNotMatch(html,/<img/);
  assert.equal((html.match(/<option /g)||[]).length,31);
  const lessons=lessonPicker(bank,'17',{view:'lessons',allowTopics:false});
  assert.equal((lessons.match(/<option /g)||[]).length,25);
  assert.doesNotMatch(lessons,/<option value="review-/);
  const reviews=lessonPicker(bank,'review-5',{view:'reviews',allowTopics:false});
  assert.equal((reviews.match(/<option /g)||[]).length,5);
  assert.match(reviews,/Правила пяти уроков/);
});

test('five-lesson reviews cover every lesson equally with distinct families', () => {
  assert.deepEqual(bank.curriculum.reviews.map(r=>r.afterLesson),[5,10,15,20,25]);
  for (const review of bank.curriculum.reviews) {
    assert.equal(preparationSettings({lesson:review.id},bank).lesson,review.id);
    assert.match(lessonPicker(bank,review.id),/Правила пяти уроков/);
    const lessonSets=new Map(review.lessonNumbers.map(number=>[number,new Set(lessonItems(bank,number).map(q=>q.id))]));
    for (const count of [5,10,20]) for (let seed=0;seed<20;seed++) {
      const plan=practicePlan(bank,emptyProgress(),{lesson:review.id,count,seed});
      assert.equal(plan.questions.length,count);
      assert.equal(new Set(plan.questions.map(q=>q.family)).size,count);
      for (const number of review.lessonNumbers) {
        const questions=plan.questions.filter(q=>q.reviewLesson===number);
        assert.equal(questions.length,count/5,`${review.id}: lesson ${number}`);
        assert.ok(questions.every(q=>lessonSets.get(number).has(q.id)));
      }
    }
  }
  assert.equal(reviewFor(bank,'review-6'),undefined);
  assert.equal(practicePlan(bank,emptyProgress(),{lesson:'review-6'}).questions.length,0);
});

test('review results persist once and retain per-lesson independent success', () => {
  const progress=emptyProgress();
  const session=practicePlan(bank,progress,{lesson:'review-10',count:10,seed:10,now:12345});
  progress.session=session;
  session.results=session.questions.map((q,i)=>({id:q.id,status:i<5?'correct':'hinted'}));
  assert.equal(archiveReview(bank,progress,session),false,'incomplete reviews are not archived');
  session.index=session.questions.length;
  assert.equal(archiveReview(bank,progress,session,50000),true);
  assert.equal(archiveReview(bank,progress,session,60000),false,'reload cannot duplicate a result');
  assert.equal(progress.reviewRuns[0].correct,5);
  assert.ok(reviewResults(bank,session).every(l=>l.total===2&&l.correct===1));
  let stored;
  const storage={getItem:()=>stored,setItem:(key,value)=>stored=value};
  assert.equal(savePreparation(progress,storage),true);
  const restored=loadPreparation(storage);
  assert.deepEqual(restored.session,session);
  assert.deepEqual(restored.reviewRuns,progress.reviewRuns);
  assert.match(reviewHistory(bank,restored),/Повторение уроков 6–10/);
  assert.equal(archiveReview(bank,restored,restored.session),false);
  restored.reviewRuns.push({id:'bad',lessons:null});stored=JSON.stringify(restored);
  assert.equal(loadPreparation(storage).reviewRuns.length,1,'malformed history cannot break the home page');
});

test('teaching tasks about group names and explicit form conversion stay out of mock exams', () => {
  for (let seed=0;seed<30;seed++) {
    const exam=createExam(bank,seed);
    assert.ok(exam.sections.flatMap(s=>s.questions).every(q=>!q.practiceOnly));
  }
});
