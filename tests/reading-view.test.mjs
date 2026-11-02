import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { passageHTML,choiceExplanation } from '../static/js/reading-view.js';
import { createExam } from '../static/js/mock-engine.js';
const bank=JSON.parse(readFileSync(new URL('../data/mock-exam.json',import.meta.url)));
test('exam view never highlights evidence or exposes word cards before review',()=>{
 const exam=createExam(bank,3);
 const q=exam.sections.flatMap(s=>s.questions).find(q=>q.type==='reading-text');
 const plain=passageHTML(q);assert.ok(!plain.includes('<mark'));assert.ok(!plain.includes('data-reading-word'));
 const review=passageHTML(q,true);assert.ok(review.includes('<mark'));assert.ok(review.includes('data-reading-word'));
});
test('wrong-choice reasoning stays attached to the option text after shuffling',()=>{
 for(let seed=0;seed<20;seed++){
  const exam=createExam(bank,seed);
  for(const q of exam.sections.flatMap(s=>s.questions).filter(q=>q.type==='reading-text')){
   assert.equal(choiceExplanation(q,q.correct),'');
   const wrong=(q.correct+1)%4;
   assert.ok(choiceExplanation(q,wrong).includes('Почему ваш вариант'));
   assert.ok(q.choiceNotes[q.choices[wrong]]);
   assert.ok(q.evidence.every(e=>q.passageText.includes(e)));
  }
 }
});
test('rendering quoted text and dictionary words escapes markup',()=>{
 const q={id:'q',passageText:'<script>本</script>',evidence:['本'],wordRefs:[{id:1,text:'本'}]};
 const html=passageHTML(q,true);assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));
});
