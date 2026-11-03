export function counterPool(counters, selected) {
  return counters.filter(counter => selected.includes(counter.id)).flatMap(counter =>
    counter.forms.map(form => ({ key: `${counter.id}:${form.number}`, counter, form })));
}

export function counterExercise(item) {
  const { counter, form } = item;
  return {
    kind: 'counter', answers: form.readings,
    displayAnswers: form.readings.map(reading => `${form.written}（${reading}）`),
    hint: `${form.written} читается ${form.readings[0]}. ${counter.rule}`,
  };
}

export function counterSession(pool, limit, random = Math.random) {
  const keys = pool.map(item => item.key);
  for (let i = keys.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [keys[i], keys[j]] = [keys[j], keys[i]];
  }
  return { keys: keys.slice(0, limit), position: 0, answers: {} };
}

export function restoreCounterSession(session, pool) {
  const keys = new Set(pool.map(item => item.key));
  if (!session || !Array.isArray(session.keys) || !session.keys.length || session.keys.length > 20
    || new Set(session.keys).size !== session.keys.length || session.keys.some(key => !keys.has(key))
    || !Number.isInteger(session.position) || session.position < 0 || session.position > session.keys.length
    || !session.answers || typeof session.answers !== 'object') return null;
  const statuses = ['correct', 'incorrect', 'unknown', 'answer', 'skip'];
  const answers = {};
  for (const key of session.keys) {
    const answer = session.answers[key];
    if (!answer || typeof answer !== 'object') continue;
    answers[key] = {
      value: typeof answer.value === 'string' ? answer.value.slice(0, 160) : '',
      status: statuses.includes(answer.status) ? answer.status : null,
      first: statuses.includes(answer.first) ? answer.first : null,
      firstValue: typeof answer.firstValue === 'string' ? answer.firstValue.slice(0, 160) : '',
      assisted: answer.assisted === true,
    };
  }
  return { keys: session.keys, position: session.position, answers };
}
