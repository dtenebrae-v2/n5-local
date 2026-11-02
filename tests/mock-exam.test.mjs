import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BLUEPRINT, createExam, completeSection, startNextSection, results, validSession } from '../static/js/mock-engine.js';
const bank = JSON.parse(readFileSync(new URL('../data/mock-exam.json', import.meta.url)));
test('variants obey quotas, keep passage questions together and shuffle answer keys', () => {
  for (let seed = 0; seed < 100; seed++) {
    const exam = createExam(bank, seed, [], 1000);
    assert.ok(validSession(exam));
    assert.equal(exam.deadline, 1201000);
    exam.sections.forEach((section, i) => {
      assert.equal(new Set(section.questions.map(q => q.id)).size, section.questions.length);
      for (const [type,count] of Object.entries(BLUEPRINT[i].quotas)) assert.equal(section.questions.filter(q => q.type === type).length, count);
      for (const q of section.questions) {
        const original = bank.items.find(v => v.id === q.id);
        assert.equal(q.choices[q.correct], original.choices[original.correct]);
        if (q.passage) assert.deepEqual(section.questions.filter(v => v.passage === q.passage).map(v => v.id).sort(), bank.items.filter(v => v.passage === q.passage).map(v => v.id).sort());
      }
    });
    assert.ok(exam.sections.flatMap(s => s.questions).some(q => q.correct !== 0));
  }
});
test('seed is reproducible and recent families are avoided where possible', () => {
  assert.deepEqual(createExam(bank,12,[],0),createExam(bank,12,[],0));
  const first = createExam(bank,12,[],0);
  assert.notDeepEqual(first.sections,createExam(bank,13,[],0).sections);
  const recent = first.sections.flatMap(s => s.questions.map(q => q.id));
  const next = createExam(bank,12,recent,0);
  assert.ok(next.sections[0].questions.filter(q => q.type === 'reading-kanji').every(q => !recent.includes(q.id)));
  const families = next.sections.flatMap(s => s.questions.filter(q => !q.passage).map(q => q.family));
  assert.equal(families.length,new Set(families).size);
});
test('section boundaries, persisted snapshots, unanswered and incorrect answers', () => {
  const exam = createExam(bank,1,[],0), first = exam.sections[0];
  first.answers[first.questions[0].id] = first.questions[0].correct;
  first.answers[first.questions[1].id] = (first.questions[1].correct+1)%4;
  assert.deepEqual(results(exam)[0],{label:first.label,total:20,correct:1,skipped:18});
  completeSection(exam,true);
  assert.equal(exam.phase,'between'); assert.equal(exam.deadline,null);
  assert.ok(validSession(JSON.parse(JSON.stringify(exam))));
  startNextSection(exam,5000); assert.equal(exam.section,1); assert.equal(exam.deadline,2405000);
  startNextSection(exam,8000); assert.equal(exam.deadline,2405000);
  completeSection(exam); assert.equal(exam.phase,'finished'); assert.ok(validSession(exam));
  assert.ok(!validSession({...exam,section:99}));
});
