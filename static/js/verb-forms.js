// Kana rows apply only to verified Godan verbs; sources are linked in the reference view.
export const GODAN_ROWS = {
  う: ['わ', 'い', 'え', 'お'], く: ['か', 'き', 'け', 'こ'],
  ぐ: ['が', 'ぎ', 'げ', 'ご'], す: ['さ', 'し', 'せ', 'そ'],
  つ: ['た', 'ち', 'て', 'と'], ぬ: ['な', 'に', 'ね', 'の'],
  ぶ: ['ば', 'び', 'べ', 'ぼ'], む: ['ま', 'み', 'め', 'も'],
  る: ['ら', 'り', 'れ', 'ろ'],
};
export const VERB_FORM_LABELS = {
  plain_negative: 'Отрицание · ない', plain_past: 'Прошедшее · た', te: 'Связующая · て',
  conditional: 'Условие · ば', volitional: 'Намерение / предложение', imperative: 'Приказ',
};
const EXCEPTIONS = {
  ある: { plain_negative: ['ない'] },
  いく: { te: ['いって'], plain_past: ['いった'] },
  くれる: { imperative: ['くれ'] },
};

export function verbForms(reading, group) {
  let naiStem, masuStem, baStem, volitional, imperative, te;
  const root = reading.slice(0, -1);
  if (group === 'Godan' && GODAN_ROWS[reading.at(-1)]) {
    const [a, i, e, o] = GODAN_ROWS[reading.at(-1)];
    naiStem = root + a; masuStem = root + i; baStem = root + e;
    volitional = root + o + 'う'; imperative = [baStem];
    const end = reading.at(-1);
    te = root + ('うつる'.includes(end) ? 'って' : 'むぶぬ'.includes(end) ? 'んで'
      : end === 'く' ? 'いて' : end === 'ぐ' ? 'いで' : 'して');
  } else if (group === 'Ichidan' && reading.endsWith('る')) {
    naiStem = masuStem = root; baStem = root + 'れ';
    volitional = root + 'よう'; imperative = [root + 'ろ', root + 'よ']; te = root + 'て';
  } else if (group === 'Irregular' && ['する', 'くる'].includes(reading)) {
    const suru = reading === 'する';
    naiStem = suru ? 'し' : 'こ'; masuStem = suru ? 'し' : 'き';
    baStem = suru ? 'すれ' : 'くれ'; volitional = suru ? 'しよう' : 'こよう';
    imperative = suru ? ['しろ', 'せよ'] : ['こい']; te = suru ? 'して' : 'きて';
  } else return null;
  const forms = {
    dictionary: [reading], masu: [masuStem + 'ます'],
    past: [masuStem + 'ました'], negative: [masuStem + 'ません'],
    past_negative: [masuStem + 'ませんでした'],
    plain_negative: [naiStem + 'ない'], te: [te],
    plain_past: [te.slice(0, -1) + (te.endsWith('で') ? 'だ' : 'た')],
    conditional: [baStem + 'ば'], volitional: [volitional], imperative,
  };
  if ((group === 'Godan' && ['ある', 'いく'].includes(reading))
      || (group === 'Ichidan' && reading === 'くれる')) Object.assign(forms, EXCEPTIONS[reading]);
  return { forms, naiStem, masuStem, baStem, group };
}
