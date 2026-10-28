import { GODAN_ROWS } from './verb-forms.js';

// Explain the selected grammatical operation, never infer a learner's intent from edit distance.
export function exerciseHint(entry, kind, form, reading, answer) {
  const example = `${reading} → ${answer}.`;
  if (kind === 'noun' || kind === 'na-adjective') {
    const ending = { past: 'でした', negative: 'ではありません / じゃないです', past_negative: 'ではありませんでした / じゃなかったです' }[form];
    return `${kind === 'noun' ? 'Существительное' : 'な-прилагательное'}: добавьте ${ending}${kind === 'na-adjective' ? ', без な' : ''}. ${example}`;
  }
  if (kind === 'i-adjective') {
    const ending = { past: 'かったです', negative: 'くないです', past_negative: 'くなかったです' }[form];
    return `${reading === 'いい' || reading === 'よい' ? 'Исключение いい / よい: основа よ' : 'い-прилагательное: уберите последнее い'}, добавьте ${ending}. ${example}`;
  }
  const group = entry.type;
  const end = reading.at(-1);
  if (group === 'Irregular' || reading === 'ある' && form === 'plain_negative' || reading === 'くれる' && form === 'imperative') return `Исключение: ${example}`;
  if (form === 'te' || form === 'plain_past') {
    if (reading === 'いく' && group === 'Godan') return `Исключение 行く: ${example}`;
    let replacement = group === 'Ichidan' ? 'て' : 'うつる'.includes(end) ? 'って' : 'ぬぶむ'.includes(end) ? 'んで' : { く: 'いて', ぐ: 'いで', す: 'して' }[end];
    if (form === 'plain_past') replacement = replacement.replace('て', 'た').replace('で', 'だ');
    return `${group}: ${end} заменяется на ${replacement}. ${example}`;
  }
  const polite = { past: 'ました', negative: 'ません', past_negative: 'ませんでした' }[form];
  if (polite) return `${group}: ${group === 'Ichidan' ? 'уберите る' : `замените ${end} на ${GODAN_ROWS[end][1]}`}, добавьте ${polite}. ${example}`;
  if (group === 'Ichidan') return `Ichidan: уберите る, добавьте ${{ plain_negative: 'ない', conditional: 'れば', volitional: 'よう', imperative: 'ろ (или よ)' }[form]}. ${example}`;
  const row = GODAN_ROWS[end];
  const replacement = { plain_negative: row[0] + 'ない', conditional: row[2] + 'ば', volitional: row[3] + 'う', imperative: row[2] }[form];
  return `Godan: ${end} заменяется на ${replacement}. ${example}`;
}
