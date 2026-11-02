import { randomFromSeed } from './mock-engine.js';
export const PREPARATION_KEY = 'n5.preparation.v1';
const DAY = 86400000;
export function emptyProgress() { return { version: 1, questions: {}, topics: {}, exams: [], session: null }; }
export function loadPreparation(storage = localStorage) {
  try {
    const data = JSON.parse(storage.getItem(PREPARATION_KEY));
    if (data?.version === 1 && data.questions && !Array.isArray(data.questions) && data.topics && !Array.isArray(data.topics) && Array.isArray(data.exams)) return data;
  } catch { /* Practice remains available when storage is unavailable. */ }
  return emptyProgress();
}
export function savePreparation(progress, storage = localStorage) {
  try { storage.setItem(PREPARATION_KEY, JSON.stringify(progress)); return true; } catch { return false; }
}
export function noteAnswer(progress, question, status, duration = 0, now = Date.now()) {
  const seen = progress.questions[question.id]?.attempts > 0;
  const stats = progress.topics[question.topic] ||= { attempts: 0, correct: 0, incorrect: 0, skipped: 0, hinted: 0, fresh: 0, freshCorrect: 0, repeat: 0, repeatCorrect: 0, elapsed: 0, streak: 0 };
  for (const key of ['attempts',status,seen ? 'repeat' : 'fresh']) stats[key] = (stats[key] || 0) + 1;
  if (status === 'correct') { const key = seen ? 'repeatCorrect' : 'freshCorrect'; stats[key] = (stats[key] || 0) + 1; }
  stats.elapsed = (stats.elapsed || 0) + Math.max(0,duration);
  if(duration > 0) stats.timed = (stats.timed || 0) + 1;
  if (status === 'correct') {
    stats.streak = !stats.lastSuccess || now - stats.lastSuccess >= DAY ? (stats.streak || 0) + 1 : Math.max(1,stats.streak || 0);
    if (!stats.lastSuccess || now - stats.lastSuccess >= DAY) stats.lastSuccess = now;
  } else { stats.streak = 0; stats.lastSuccess = null; }
  stats.last = now;
  stats.due = now + (status === 'correct' ? [1,3,7,14,30][Math.min(stats.streak-1,4)] * DAY : 10 * 60000);
  progress.questions[question.id] = { attempts: (progress.questions[question.id]?.attempts || 0) + 1, last: now, status };
  return { fresh: !seen, status, duration };
}
export function archiveExam(progress, exam, now = Date.now()) {
  if (exam.phase !== 'finished') return false;
  const id = `${exam.created}:${exam.seed}`;
  // The marker lives with the saved exam, so trimming history cannot reimport it.
  if (exam.archived || progress.exams.some(run => run.id === id)) return false;
  const run = { id, at: now, correct: 0, total: 0, fresh: 0, freshCorrect: 0, repeat: 0, repeatCorrect: 0, skipped: 0, elapsed: 0, topics: {} };
  for (const section of exam.sections) {
    run.elapsed += section.duration || 0;
    for (const q of section.questions) {
      const a = section.answers[q.id];
      const status = a === undefined ? 'skipped' : a === q.correct ? 'correct' : 'incorrect';
      const prior = progress.questions[q.id];
      const result = noteAnswer(progress,q,status,section.elapsed?.[q.id] || 0,now);
      if (a === undefined && !section.viewed?.includes(q.id)) {
        if (prior) progress.questions[q.id] = prior; else delete progress.questions[q.id];
      }
      run.total++; if(status === 'correct') run.correct++; if(status === 'skipped') run.skipped++;
      const bucket = result.fresh ? 'fresh' : 'repeat'; run[bucket]++; if (status === 'correct') run[bucket+'Correct']++;
      const topic = run.topics[q.topic] ||= { total: 0, correct: 0 }; topic.total++; if(status==='correct') topic.correct++;
    }
  }
  progress.exams = [...progress.exams,run].slice(-30);
  return true;
}
export function weakTopics(progress) {
  return Object.entries(progress.topics).filter(([,s]) => s.attempts && s.correct / s.attempts < .8).map(([id]) => id);
}
export function dueTopics(progress, now = Date.now()) {
  return Object.entries(progress.topics).filter(([,s]) => s.due <= now).map(([id]) => id);
}
export function practicePlan(bank, progress, { topic = '', mode = 'all', count = 10, seed = Date.now(), now = Date.now() } = {}) {
  const topics = topic ? [topic] : mode === 'weak' ? weakTopics(progress) : mode === 'due' ? dueTopics(progress,now) : bank.topics.map(t => t.id);
  const random = randomFromSeed(seed), used = new Set(), topicCounts = new Map();
  const candidates = bank.items.filter(q => topics.includes(q.topic)).map(q => ({ q, random: random() }));
  const questions = [];
  while (questions.length < count) {
    const eligible = candidates.filter(({q}) => !used.has(q.family || q.passage || q.id));
    eligible.sort((a,b) => (topicCounts.get(a.q.topic) || 0) - (topicCounts.get(b.q.topic) || 0)
      || (progress.questions[a.q.id]?.attempts || 0) - (progress.questions[b.q.id]?.attempts || 0) || a.random-b.random);
    if (!eligible.length) break;
    const {q} = eligible[0]; used.add(q.family || q.passage || q.id); topicCounts.set(q.topic,(topicCounts.get(q.topic)||0)+1);
    const choices = q.choices.map((text,i) => ({ text, correct:i===q.correct, random:random() })).sort((a,b)=>a.random-b.random);
    questions.push({...q, choices:choices.map(c=>c.text),correct:choices.findIndex(c=>c.correct),passageText:bank.passages.find(p=>p.id===q.passage)?.text||'', translation:bank.passages.find(p=>p.id===q.passage)?.translation||'', fresh:!progress.questions[q.id]});
  }
  return { questions, index:0, results:[], hinted:false, started:now, answer:null, topic, mode };
}
