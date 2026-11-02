export const MOCK_KEY = 'n5.mock.v1';
export const BLUEPRINT = [
  { label: 'Лексика и письменность', minutes: 20, quotas: { 'reading-kanji': 8, orthography: 5, context: 4, paraphrase: 3 } },
  { label: 'Грамматика и чтение', minutes: 40, quotas: { 'grammar-choice': 16, 'sentence-order': 3, 'text-grammar': 2, 'reading-text': 8 } },
];
function shuffle(items, random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function randomFromSeed(seed) {
  let state = seed >>> 0;
  return () => { state += 0x6D2B79F5; let t = state; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function createExam(bank, seed, recent = [], now = Date.now()) {
  const random = randomFromSeed(seed);
  const passages = new Map(bank.passages.map(p => [p.id, p.text]));
  const recentSet = new Set(recent);
  const usedFamilies = new Set();
  const sections = BLUEPRINT.map(section => {
    const questions = [];
    for (const [type, count] of Object.entries(section.quotas)) {
      const candidates = bank.items.filter(q => q.type === type);
      const groups = new Map();
      for (const q of candidates) {
        const family = q.passage || q.family || q.id;
        if (!groups.has(family)) groups.set(family, []);
        groups.get(family).push(q);
      }
      const available = shuffle([...groups.values()], random).map(group => group[0].passage ? group : [group[Math.floor(random() * group.length)]]);
      const picked = [], topicCounts = new Map();
      while (picked.length < count) {
        const eligible = available.filter(group => group.length + picked.length <= count && !usedFamilies.has(group[0].family || group[0].passage || group[0].id));
        eligible.sort((a,b) => Number(a.some(q => recentSet.has(q.id))) - Number(b.some(q => recentSet.has(q.id)))
          || (topicCounts.get(a[0].topic) || 0) - (topicCounts.get(b[0].topic) || 0));
        const group = eligible[0];
        if (!group) break;
        picked.push(...group);
        usedFamilies.add(group[0].family || group[0].passage || group[0].id);
        topicCounts.set(group[0].topic, (topicCounts.get(group[0].topic) || 0) + group.length);
      }
      if (picked.length !== count) throw new Error(`Недостаточно заданий: ${type}`);
      for (const q of picked) {
        const options = shuffle(q.choices.map((text, i) => ({ text, correct: i === q.correct })), random);
        questions.push({ ...q, passageText: passages.get(q.passage) || '', translation: bank.passages.find(p => p.id === q.passage)?.translation || '', choices: options.map(o => o.text), correct: options.findIndex(o => o.correct) });
      }
    }
    return { label: section.label, minutes: section.minutes, questions, answers: {}, marked: [], timedOut: false, elapsed: {}, started: null };
  });
  sections[0].started = now;
  return { version: 1, seed, created: now, section: 0, index: 0, phase: 'active', deadline: now + sections[0].minutes * 60000, sections };
}
export function completeSection(exam, timedOut = false, now = Date.now()) {
  const section = exam.sections[exam.section];
  section.duration = Math.max(0, Math.min(section.minutes * 60000, now - (section.started ?? exam.created)));
  exam.sections[exam.section].timedOut = timedOut;
  exam.phase = exam.section === exam.sections.length - 1 ? 'finished' : 'between';
  exam.deadline = null;
}
export function startNextSection(exam, now = Date.now()) {
  if (exam.phase !== 'between') return;
  exam.section++; exam.index = 0; exam.phase = 'active';
  exam.sections[exam.section].started = now;
  exam.deadline = now + exam.sections[exam.section].minutes * 60000;
}
export function results(exam) {
  return exam.sections.map(section => ({ label: section.label, total: section.questions.length,
    correct: section.questions.filter(q => section.answers[q.id] === q.correct).length,
    skipped: section.questions.filter(q => !Number.isInteger(section.answers[q.id])).length }));
}
export function validSession(exam) {
  return exam?.version === 1 && ['active','between','finished'].includes(exam.phase)
    && exam.sections?.length === 2 && Number.isInteger(exam.section) && exam.section >= 0 && exam.section < 2
    && Number.isInteger(exam.index) && exam.index >= 0 && exam.index < exam.sections[exam.section].questions.length
    && (exam.phase !== 'active' || Number.isFinite(exam.deadline))
    && exam.sections.every(s => Array.isArray(s.questions) && s.questions.length && s.answers && Array.isArray(s.marked)
      && s.questions.every(q => typeof q.id === 'string' && typeof q.prompt === 'string' && Array.isArray(q.choices) && q.choices.length === 4 && Number.isInteger(q.correct) && q.correct >= 0 && q.correct < 4));
}
