import { escapeHTML as esc } from './ui.js';
import { learningOverview, overviewCards, resumeLinks } from './learning-overview.js';
import { topicAssessment } from './preparation-progress.js';

export function homePage(catalog, storage = localStorage) {
  const base = catalog.base;
  const overview = learningOverview(storage,base,Date.now(),catalog);
  const {training,preparation} = overview;
  const prep = preparation.session;
  const prepPath = overview.resumptions.find(item=>item.id==='preparation')?.href || `${base}/preparation`;
  const prepOngoing = Array.isArray(prep?.questions) && prep.questions.length && Number.isInteger(prep.index) && prep.index >= 0 && prep.index < prep.questions.length;
  const formsOngoing = training.session?.current && !training.session.finished;
  const resume = prepOngoing
    ? `<a class="primary home-cta" href="${prepPath}">Продолжить · задание ${prep.index + 1} из ${prep.questions.length}</a>`
    : formsOngoing ? `<a class="primary home-cta" href="${base}/practice">Продолжить слова и формы</a>` : '';
  const {mistakes,due,nextDue} = overview.review;
  const savedLinks = resumeLinks(overview,{exclude:['preparation','forms'],limit:5});
  const lastExam = preparation.exams.filter(run => Number.isInteger(run?.total) && run.total > 0 && Number.isInteger(run.correct) && run.correct >= 0 && run.correct <= run.total).at(-1);
  const assessments = Object.keys(preparation.topics).map(id => topicAssessment(preparation,id));
  const strong = assessments.filter(topic => topic.state === 'good').length;
  const weak = assessments.filter(topic => topic.state === 'weak').length;
  const completedLesson = Array.isArray(prep?.questions) && prep.questions.length && prep.index === prep.questions.length ? Number(prep.lesson) : 0;
  const nextLesson = Number.isInteger(completedLesson) && completedLesson > 0 && completedLesson < 25 ? completedLesson + 1 : Math.min(25, Math.max(1, Math.floor(Number(preparation.courseSetup?.lessons?.lesson) || 1)));
  const lessonTitle = catalog.courseLessons?.find(lesson => lesson.number === nextLesson)?.title || (nextLesson === 1 ? 'Именное сказуемое и первые частицы' : 'Правила, примеры и практика');
  const recommendation = resume ? '' : due
    ? `<h2>Повторение на сегодня</h2><p>Подошёл срок повторения: ${due}. Проверьте, что запомнилось.</p><a class="primary home-cta" href="${base}/preparation?mode=due">Повторить сегодня</a>`
    : mistakes
      ? `<h2>Разберите ошибки</h2><p>Правил для повторения: ${mistakes}.</p><a class="primary home-cta" href="${base}/preparation?mode=mistakes">Повторить ошибки</a>`
      : `<p class="home-kicker">Следующий шаг · урок ${nextLesson}</p><h2>${esc(lessonTitle)}</h2><p>Изучите правило и закрепите его в 10 заданиях.</p><p class="home-help">Около 10 минут · в своём темпе</p><a class="primary home-cta" href="${base}/course?lesson=${nextLesson}">Начать урок ${nextLesson}</a>`;
  return `<h1>Моё обучение</h1><section class="home-intro" aria-label="Рекомендуемое занятие">
    ${resume ? `<div class="home-resume"><h2>Вернуться к занятию</h2>${resume}<p class="home-help">${esc(overview.resumptions.find(item=>item.id=== (prepOngoing?'preparation':'forms'))?.reason || 'Занятие ещё не завершено.')}</p></div>` : ''}
    ${recommendation}
    <div class="home-alternative"><a href="${base}/preparation?quick=1">Смешанная тренировка · 10 заданий →</a></div></section>
    ${overview.hasActivity || assessments.length || mistakes || due || nextDue || lastExam ? `<section class="home-card home-saved" aria-labelledby="home-progress-title"><h2 id="home-progress-title">Прогресс и повторение</h2>
      <p>${assessments.length ? `Тем с устойчивым результатом: ${strong}. Нужна практика: ${weak}.` : 'После первых занятий здесь появятся результаты по темам.'}</p>
      <p>${mistakes ? `Правил с ошибками: ${mistakes}.` : 'Ошибки для повторения появятся после занятий.'} ${due ? `К повторению сегодня: ${due}.` : nextDue ? `Ближайшее повторение: ${new Date(nextDue).toLocaleString('ru-RU',{dateStyle:'short',timeStyle:'short'})}.` : ''}</p>
      ${mistakes ? `<a class="secondary home-cta" href="${base}/preparation?mode=mistakes">Повторить ошибки</a>` : ''}
      ${due ? `<a class="secondary home-cta" href="${base}/preparation?mode=due">Повторить сегодня</a>` : ''}
      ${lastExam ? `<p>Последний письменный пробник: ${lastExam.correct} из ${lastExam.total}. Это результат тренировки, а не оценка JLPT.</p>` : ''}
      <details class="progress-details"><summary>Результаты по всем разделам</summary>${overviewCards(overview)}</details><a href="${base}/progress">Подробные результаты →</a></section>` : `<p class="home-empty-progress">После первых занятий здесь появятся результаты по темам. <a href="${base}/progress">Подробные результаты →</a></p>`}
    ${savedLinks ? `<section class="home-card home-saved"><h2>Сохранённая работа</h2><div class="home-grid">${savedLinks}</div></section>` : ''}
    <div class="home-grid">
      <section class="home-card"><h2>Учиться</h2><p>25 уроков с правилами и заданиями. Повторение после каждых пяти уроков.</p><a href="${base}/course">Уроки 1–25 →</a><a href="${base}/course/workbook">Практика по тетради →</a><a href="${base}/course/reviews">Повторение по урокам →</a><a href="${base}/workbooks">Заниматься по учебнику →</a></section>
      <section class="home-card"><h2>Повторять</h2><p>Вспоминайте слова и вводите формы глаголов, прилагательных и существительных.</p><a href="${base}/practice">Тренировать слова и формы →</a></section>
      <section class="home-card"><h2>Найти справку</h2><p>Найдите слово, чтение или значение; откройте спряжения и грамматику.</p><a href="${base}/vocabulary/complete">Открыть словарь →</a><a href="${base}/grammar/verbs">Грамматика →</a></section>
      <section class="home-card"><h2>Проверить знания</h2><p>Письменный пробник: лексика, грамматика и чтение с таймером. Без аудирования.</p><a href="${base}/mock">Письменный пробник →</a><a href="${base}/exams">Экзаменационные варианты →</a></section>
      <section class="home-card"><h2>Слушать</h2><p>Слушайте полные записи подряд или тренируйтесь с заданиями.</p><a href="${base}/audio">Слушать аудио →</a><a href="${base}/exams">Выбрать вариант с аудио →</a></section>
      <section class="home-card"><h2>Читать</h2><p>Книги на японском для начинающих.</p><a href="${base}/library">Книги Tadoku →</a></section>
    </div>`;
}
