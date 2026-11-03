export function examItems(exam) {
  return exam.sections.flatMap(section => section.groups.flatMap(group => group.items.map(q => ({
    ...q, examId:exam.id, sectionId:section.id, sectionTitle:section.title, group:group.number,
    groupTitle:group.title, audio:section.audio, reference:section.reference,
  }))));
}

export function shuffled(items, random = Math.random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function practiceItems(items, limit = 10, random = Math.random) {
  const families = new Set();
  return shuffled(items.filter(q => q.correct !== null && (!q.audio || q.clip)), random)
    .filter(q => { if (families.has(q.family)) return false; families.add(q.family); return true; }).slice(0,limit);
}

export function newExamSession(exam, mode, items = examItems(exam)) {
  return { version:1, examId:exam.id, revision:exam.revision, mode, keys:items.map(q => q.id),
    index:0, section:0, ready:mode === 'exam', deadline:null, locked:[], answers:{}, finished:false, audio:{} };
}

export function restoreExamSession(value, exam, items) {
  if (!value || value.version !== 1 || value.examId !== exam.id || value.revision !== exam.revision
      || !['exam','practice'].includes(value.mode) || !Array.isArray(value.keys) || !value.keys.length
      || new Set(value.keys).size !== value.keys.length || !value.keys.every(id => items.has(id))
      || !Number.isInteger(value.index) || value.index < 0 || value.index > value.keys.length
      || !Number.isInteger(value.section) || value.section < 0 || value.section >= exam.sections.length
      || typeof value.ready !== 'boolean' || typeof value.finished !== 'boolean'
      || !Array.isArray(value.locked) || !value.locked.every(id => exam.sections.some(s => s.id === id))
      || (value.deadline !== null && (!Number.isFinite(value.deadline) || value.deadline <= 0))
      || !value.answers || typeof value.answers !== 'object' || Array.isArray(value.answers)) return null;
  if (value.mode === 'exam' && (value.keys.join('|') !== examItems(exam).map(q => q.id).join('|')
      || (!value.ready && !value.finished && value.deadline === null)
      || value.locked.join('|') !== exam.sections.slice(0,value.finished ? exam.sections.length : value.section).map(s => s.id).join('|')
      || (!value.finished && items.get(value.keys[value.index])?.sectionId !== exam.sections[value.section].id))) return null;
  if (value.mode === 'practice' && (value.ready || value.deadline !== null || value.locked.length
      || new Set(value.keys.map(id => items.get(id).family)).size !== value.keys.length)) return null;
  for (const [id, answer] of Object.entries(value.answers)) {
    if (!value.keys.includes(id) || !answer || ![null, ...Array.from({length:items.get(id).choices}, (_,i) => i)].includes(answer.choice)
        || ![null,'correct','incorrect','unknown','revealed','skip','ungraded'].includes(answer.first)
        || ![null, ...Array.from({length:items.get(id).choices}, (_,i) => i)].includes(answer.firstChoice)) return null;
  }
  const audio = Object.fromEntries(Object.entries(value.audio || {}).filter(([key,position]) =>
    (key === exam.id || items.has(key)) && Number.isFinite(position) && position >= 0));
  return {...value, audio};
}

export function answerRecord(session, id) {
  return session.answers[id] ||= { choice:null, first:null, firstChoice:null, status:null };
}

export function checkPractice(session, question, action = 'check') {
  const answer = answerRecord(session, question.id);
  if (action === 'check' && answer.choice === null) return false;
  const status = question.correct === null ? 'ungraded' : action === 'check'
    ? (answer.choice === question.correct ? 'correct' : 'incorrect') : action;
  if (answer.first === null) { answer.first = status; answer.firstChoice = answer.choice; }
  answer.status = status;
  return true;
}

export function beginExamSection(session, exam, now = Date.now()) {
  if (session.mode !== 'exam' || session.finished || !session.ready) return;
  session.ready = false;
  session.deadline = now + exam.sections[session.section].seconds * 1000;
}

export function finishExamSection(session, exam) {
  if (session.mode !== 'exam' || session.finished || session.ready) return;
  const section = exam.sections[session.section];
  if (!session.locked.includes(section.id)) session.locked.push(section.id);
  session.deadline = null;
  if (session.section === exam.sections.length - 1) session.finished = true;
  else {
    session.section++; session.ready = true;
    const ids = new Set(exam.sections[session.section].groups.flatMap(g => g.items.map(q => q.id)));
    session.index = session.keys.findIndex(id => ids.has(id));
  }
}

export function expireExamSection(session, exam, now = Date.now()) {
  if (session.mode === 'exam' && !session.ready && !session.finished && session.deadline <= now) {
    finishExamSection(session, exam); return true;
  }
  return false;
}

export function examSummary(session, items) {
  const result = {correct:0, incorrect:0, skipped:0, ungraded:0, total:session.keys.length};
  for (const id of session.keys) {
    const q = items.get(id), answer = session.answers[id];
    if (q.correct === null) result.ungraded++;
    else if (session.mode === 'practice') {
      if (answer?.first === 'correct') result.correct++;
      else if (answer?.first === 'incorrect') result.incorrect++;
      else result.skipped++;
    } else if (answer?.choice === null || answer?.choice === undefined) result.skipped++;
    else if (answer.choice === q.correct) result.correct++;
    else result.incorrect++;
  }
  return result;
}
