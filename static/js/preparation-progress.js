import { randomFromSeed } from './mock-engine.js';
export const PREPARATION_KEY = 'n5.preparation.v1';
const DAY = 86400000;
const REVIEW_INTERVALS = [1, 3, 7, 14, 30];
export const skillKey = question => question.skill || question.family || question.id;
export function emptyProgress() {
  return { version: 1, questions: {}, skills: {}, topics: {}, exams: [], session: null };
}
export function loadPreparation(storage = localStorage) {
  try {
    const data = JSON.parse(storage.getItem(PREPARATION_KEY));
    if (data?.version === 1 && data.questions && !Array.isArray(data.questions)
        && data.topics && !Array.isArray(data.topics) && Array.isArray(data.exams)) {
      data.skills ||= {};
      return data;
    }
  } catch { /* Storage must not prevent practice. */ }
  return emptyProgress();
}
export function savePreparation(progress, storage = localStorage) {
  try { storage.setItem(PREPARATION_KEY, JSON.stringify(progress)); return true; }
  catch { return false; }
}
function newStats() {
  return { attempts: 0, correct: 0, incorrect: 0, skipped: 0, unknown: 0, hinted: 0,
    revealed: 0, fresh: 0, freshCorrect: 0, repeat: 0, repeatCorrect: 0, elapsed: 0, recent: [] };
}
export function hydrateSkills(progress, bank) {
  progress.skills ||= {};
  if (progress.skillsHydrated) return;
  const questions = new Map(bank.items.map(q => [q.id, q]));
  // Existing saves retain totals. Their per-question last attempts can seed the new schedule.
  for (const [id, previous] of Object.entries(progress.questions).sort((a,b) => a[1].last-b[1].last)) {
    const q = questions.get(id);
    if (!q || !previous.last) continue;
    const key = skillKey(q), good = previous.status === 'correct';
    const skill = progress.skills[key] ||= { topic: q.topic, streak: 0, recent: [], recovery: 0 };
    skill.last = previous.last;
    skill.due = previous.last + (good ? DAY : 600000);
    skill.needsPractice = !good && !['skipped'].includes(previous.status);
    const event = { id, family: q.family || id, at: previous.last, status: previous.status,
      independent: ['correct','incorrect','unknown'].includes(previous.status) };
    skill.recent = [...skill.recent, event].slice(-20);
    const topic = progress.topics[q.topic] ||= newStats();
    topic.recent = [...(topic.recent || []), event].slice(-40);
  }
  progress.skillsHydrated = true;
}
export function topicAssessment(progress, topic) {
  const recent = (progress.topics[topic]?.recent || []).filter(e => e.independent).slice(-20);
  const correct = recent.filter(e => e.status === 'correct').length;
  const examples = new Set(recent.map(e => e.family || e.id)).size;
  const enough = recent.length >= 5 && examples >= 3;
  return { count: recent.length, correct, examples,
    state: !enough ? 'insufficient' : correct / recent.length < .8 ? 'weak' : 'good' };
}
export function noteAnswer(progress, question, status, duration = 0, now = Date.now(), assistance = 0) {
  const previous = progress.questions[question.id];
  const seen = previous?.attempts > 0;
  const key = skillKey(question);
  progress.skills ||= {};
  progress.skillsHydrated = true;
  const skill = progress.skills[key] ||= { topic: question.topic, streak: 0, recent: [], recovery: 0 };
  const stats = progress.topics[question.topic] ||= newStats();
  const helped = assistance > 0 || status === 'hinted' || status === 'revealed';
  const lastEvidence = previous?.lastEvidence ?? (previous?.status !== 'skipped' ? previous?.last : null);
  const independent = !helped && ['correct','incorrect','unknown'].includes(status)
    && (!lastEvidence || now - lastEvidence >= DAY);
  const event = { id: question.id, family: question.family || question.id, status, at: now, independent, assistance };
  for (const field of ['attempts', status, seen ? 'repeat' : 'fresh']) stats[field] = (stats[field] || 0) + 1;
  if (status === 'correct') {
    const field = seen ? 'repeatCorrect' : 'freshCorrect';
    stats[field] = (stats[field] || 0) + 1;
  }
  if (assistance > 0) stats.reference = (stats.reference || 0) + 1;
  stats.elapsed = (stats.elapsed || 0) + Math.max(0, duration);
  if (duration > 0) stats.timed = (stats.timed || 0) + 1;
  stats.last = now;
  stats.recent ||= [];
  if (independent) stats.recent = [...stats.recent, event].slice(-20);
  skill.recent = [...(skill.recent || []), event].slice(-20);
  if (status === 'correct' && independent) {
    if (!skill.lastSuccess || now - skill.lastSuccess >= DAY) {
      skill.streak = (skill.streak || 0) + 1;
      skill.lastSuccess = now;
    }
    skill.recovery = (skill.recovery || 0) + 1;
    if (skill.recovery >= 2) skill.needsPractice = false;
    // A single right answer cannot postpone an unresolved mistake.
    skill.due = now + (skill.needsPractice ? 600000 : REVIEW_INTERVALS[Math.min(skill.streak - 1,4)] * DAY);
  } else if (status !== 'correct' && status !== 'skipped') {
    skill.streak = 0;
    skill.lastSuccess = null;
    skill.recovery = 0;
    if (status !== 'skipped') skill.needsPractice = true;
    skill.due = now + 600000;
  }
  skill.last = now;
  progress.questions[question.id] = { attempts: (previous?.attempts || 0) + 1, last: now, status, lastEvidence: status === 'skipped' ? lastEvidence : now };
  return { fresh: !seen, status, duration, independent, assistance };
}
export function archiveExam(progress, exam, now = Date.now()) {
  if (exam.phase !== 'finished') return false;
  const id = `${exam.created}:${exam.seed}`;
  if (exam.archived || progress.exams.some(run => run.id === id)) return false;
  const run = { id, at: now, correct: 0, total: 0, fresh: 0, freshCorrect: 0, repeat: 0,
    repeatCorrect: 0, skipped: 0, unopened: 0, incorrect: 0, elapsed: 0, topics: {} };
  for (const section of exam.sections) {
    run.elapsed += section.duration || 0;
    for (const q of section.questions) {
      const a = section.answers[q.id];
      const status = a === undefined ? 'skipped' : a === q.correct ? 'correct' : 'incorrect';
      const unopened = a === undefined && !section.viewed?.includes(q.id);
      run.total++;
      if (unopened) { run.unopened++; continue; }
      const result = noteAnswer(progress, q, status, section.elapsed?.[q.id] || 0, now);
      if (status === 'correct') run.correct++;
      if (status === 'incorrect') run.incorrect++;
      if (status === 'skipped') run.skipped++;
      const bucket = result.fresh ? 'fresh' : 'repeat';
      run[bucket]++;
      if (status === 'correct') run[bucket+'Correct']++;
      const topic = run.topics[q.topic] ||= { total: 0, correct: 0 };
      topic.total++;
      if (status === 'correct') topic.correct++;
    }
  }
  progress.exams = [...progress.exams, run].slice(-30);
  return true;
}
export function weakTopics(progress) {
  return Object.keys(progress.topics).filter(topic => topicAssessment(progress, topic).state === 'weak');
}
export function troubleSkills(progress) {
  return Object.entries(progress.skills || {}).filter(([,s]) => s.needsPractice).map(([key]) => key);
}
export function dueSkills(progress, now = Date.now()) {
  return Object.entries(progress.skills || {}).filter(([,s]) => s.due <= now).map(([key]) => key);
}
export function dueTopics(progress, now = Date.now()) {
  return [...new Set(dueSkills(progress, now).map(key => progress.skills[key].topic))];
}
export function practicePlan(bank, progress, { topic = '', mode = 'all', count = 10, seed = Date.now(), now = Date.now() } = {}) {
  const weak = weakTopics(progress);
  const keys = mode === 'mistakes' ? troubleSkills(progress) : mode === 'due' ? dueSkills(progress,now) : null;
  const random = randomFromSeed(seed), used = new Set(), skillCounts = new Map();
  const candidates = bank.items.filter(q => (!topic || q.topic === topic)
    && (!keys || keys.includes(skillKey(q))) && (mode !== 'weak' || weak.includes(q.topic)))
    .map(q => ({ q, random: random() }));
  const questions = [];
  while (questions.length < count) {
    const eligible = candidates.filter(({q}) => !used.has(q.family || q.passage || q.id));
    eligible.sort((a,b) => (skillCounts.get(skillKey(a.q)) || 0) - (skillCounts.get(skillKey(b.q)) || 0)
      || (progress.questions[a.q.id]?.attempts || 0) - (progress.questions[b.q.id]?.attempts || 0) || a.random-b.random);
    if (!eligible.length) break;
    const { q } = eligible[0], key = skillKey(q);
    used.add(q.family || q.passage || q.id);
    skillCounts.set(key, (skillCounts.get(key) || 0)+1);
    const choices = q.choices.map((text,i) => ({ text, correct:i===q.correct, random:random() })).sort((a,b)=>a.random-b.random);
    const passage = bank.passages.find(p => p.id === q.passage);
    questions.push({ ...q, choices:choices.map(c=>c.text), correct:choices.findIndex(c=>c.correct),
      hint:bank.skills.find(s=>s.id===q.skill) || {}, passageText:passage?.text || '', translation:passage?.translation || '', wordRefs:passage?.words || [], fresh:!progress.questions[q.id] });
  }
  return { questions, index:0, results:[], hintLevel:0, started:now, topic, mode };
}
