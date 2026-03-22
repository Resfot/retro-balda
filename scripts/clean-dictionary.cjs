/**
 * clean-dictionary.cjs
 *
 * Filters dictionary_categorized.json to keep only valid nominative singular
 * Russian nouns for БАЛДА. Outputs to dictionary_categorized_clean.json.
 *
 * Usage: node scripts/clean-dictionary.cjs
 */

const fs = require('fs');
const path = require('path');

const INPUT = path.join(__dirname, '..', 'public', 'dictionary_categorized.json');
const OUTPUT = path.join(__dirname, '..', 'public', 'dictionary_categorized_clean.json');
const REMOVED_LOG = path.join(__dirname, 'output', 'removed_words.json');

const dict = JSON.parse(fs.readFileSync(INPUT, 'utf-8'));
const entries = Object.entries(dict);

console.log(`Input: ${entries.length} words\n`);

// ─── Stage 1: Remove explicitly tagged non-nouns ───
const REMOVE_CATEGORIES = new Set(['verb', 'adjective']);

// ─── Stage 2: Morphological filters for remaining words ───
// CONSERVATIVE: only remove patterns that are VERY unlikely to be valid nom.sg. nouns

// Words to explicitly remove (known bad entries from bug reports + manual review)
const EXPLICIT_REMOVE = new Set([
  // Bug report examples
  'карт',        // genitive plural of карта
  'манко',       // not a real word (манка is)
  // Pronouns
  'вами',        // instrumental of вы
  'нами',        // instrumental of мы
  'кого',        // genitive of кто
  'его',         // genitive of он
  'вам',         // dative of вы
  // Instrumental plurals
  'вещами',      'годами',      'группами',
  'местами',     'месяцами',    'урывками',    'часами',
  // Adverbs / non-nouns
  'много',       'намного',     'немного',     'итого',
  'потому',      'поэтому',     'довольно',    'дорого',
  'недорого',
  // Adverbs ending in -но (confirmed from morphology analysis)
  'безумно',     'взаимно',     'досрочно',    'достойно',
  'доступно',    'законно',     'изящно',      'надежно',
  'нарочно',     'насильно',    'научно',      'нахально',
  'небрежно',    'неважно',     'невольно',    'необычно',
  'неточно',     'неудобно',    'обычно',      'отдельно',
  'отлично',     'отчаянно',    'подобно',     'подробно',
  'покойно',     'привычно',    'прилично',    'прочно',
  'разумно',
  // Adverbs ending in -но (from 'other' category — all confirmed non-nouns)
  // NOTE: звено, пятно, говно are real nouns and NOT listed here
  'азартно',     'бедно',       'бережно',     'больно',
  'важно',       'верно',       'вероятно',    'вечно',
  'видно',       'вкусно',      'влажно',      'властно',
  'внезапно',    'возможно',    'временно',    'всемирно',
  'вторично',    'выгодно',     'грамотно',    'грозно',
  'грустно',     'грязно',      'гуманно',     'давно',
  'детально',    'длинно',      'дословно',    'дружно',
  'духовно',     'душевно',     'ежегодно',    'жадно',
  'жалобно',     'жизненно',    'жирно',       'забавно',
  'заметно',     'заодно',      'идеально',    'известно',
  'именно',      'искренно',    'коварно',     'конечно',
  'косвенно',    'кошмарно',    'красочно',    'крупно',
  'легально',    'лично',       'медленно',    'мирно',
  'можно',       'мрачно',      'мутно',       'мысленно',
  'наверно',     'наглядно',    'наивно',      'напрасно',
  'нежно',       'нервно',      'нечестно',    'неясно',
  'нудно',       'нужно',       'обидно',      'обратно',
  'опасно',      'особенно',    'охотно',      'ошибочно',
  'пассивно',    'печально',    'плавно',      'платно',
  'плотно',      'покорно',     'полезно',     'полно',
  'понятно',     'поздно',      'примерно',    'приятно',
  'противно',    'публично',    'равно',       'радостно',
  'рано',        'реально',     'ровно',       'свободно',
  'секретно',    'сердечно',    'серьезно',    'сильно',
  'скромно',     'скучно',      'словно',      'сложно',
  'случайно',    'смешно',      'смутно',      'сносно',
  'совестно',    'согласно',    'солнечно',    'спокойно',
  'срочно',      'странно',     'страстно',    'страшно',
  'стыдно',      'тактично',    'темно',       'тесно',
  'типично',     'точно',       'трудно',      'уверенно',
  'ударно',      'удачно',      'удобно',      'ужасно',
  'умеренно',    'уместно',     'умно',        'упорно',
  'условно',     'успешно',     'устно',       'халатно',
  'цинично',     'частично',    'честно',      'чудесно',
  'шикарно',     'шумно',       'щекотно',     'экономно',
  'явно',        'ясно',
  // Adverbs ending in -ски/-чески
  'всячески',
  // Adverb-like forms ending in -ую
  'вплотную',    'впрямую',     'впустую',     'вручную',
  'вслепую',     'втихую',      'зачастую',    'напрямую',
  // Particles, conjunctions, prepositions, pronouns, adverbs (non-nouns)
  'ближе',       'больше',      'будто',       'вверх',
  'вдоль',       'ведь',        'везде',       'весьма',
  'видимо',      'вместе',      'вниз',        'внутри',
  'вокруг',      'вон',         'вот',         'вперед',
  'вполне',      'всегда',      'всюду',       'выше',
  'где',         'даже',        'дальше',      'едва',
  'еле',         'если',        'еще',         'затем',
  'зачем',       'здесь',       'или',         'иногда',
  'как',         'когда',       'крайне',      'кроме',
  'кругом',      'куда',        'либо',        'лишь',
  'лучше',       'между',       'меньше',      'мимо',
  'мол',         'наверное',    'назад',       'наконец',
  'наоборот',    'наружу',      'нет',         'нигде',
  'ниже',        'никогда',     'ничего',      'однажды',
  'однако',      'около',       'опять',       'откуда',
  'отсюда',      'очень',       'перед',       'повсюду',
  'пожалуй',     'пока',        'после',       'потом',
  'почему',      'почти',       'прежде',      'против',
  'пускай',      'пусть',       'ради',        'раз',
  'разве',       'сквозь',      'слишком',     'сначала',
  'снова',       'совсем',      'спасибо',     'сперва',
  'среди',       'сюда',        'так',         'также',
  'там',         'тогда',       'тоже',        'только',
  'туда',        'тут',         'уже',         'хоть',
  'хотя',        'хуже',        'чем',         'через',
  'что',         'чтоб',        'чтобы',       'чуть',
  'это',         'якобы',
  // Typo
  'priём',       // transliteration error
]);

// Patterns that indicate NON-nouns (very conservative)
function isLikelyNotNoun(word) {
  // ── Participles ──
  if (/[щш]ийся$/.test(word)) return 'participle (-щийся)';
  if (/[щш]аяся$/.test(word)) return 'participle (-щаяся)';
  if (/ющийся$/.test(word)) return 'participle (-ющийся)';

  // Note: adverbs (-но, -ски, -ую) and instrumental plurals (-ами) are handled
  // via the EXPLICIT_REMOVE set to avoid false positives on loan words
  // (домино, нейтрино, пастрами, салями, etc.)

  return null;
}

// ─── Process ───
const removed = { byCategory: {}, byExplicit: [], byMorphology: {} };
const clean = {};
let removedCount = 0;

for (const [word, category] of entries) {
  // Stage 1: Remove by category
  if (REMOVE_CATEGORIES.has(category)) {
    removed.byCategory[category] = (removed.byCategory[category] || 0) + 1;
    removedCount++;
    continue;
  }

  // Stage 2: Explicit removal list
  if (EXPLICIT_REMOVE.has(word)) {
    removed.byExplicit.push(word);
    removedCount++;
    continue;
  }

  // Stage 3: Morphological filter
  const reason = isLikelyNotNoun(word);
  if (reason) {
    if (!removed.byMorphology[reason]) removed.byMorphology[reason] = [];
    removed.byMorphology[reason].push(word);
    removedCount++;
    continue;
  }

  clean[word] = category;
}

// ─── Output ───
const cleanCount = Object.keys(clean).length;

console.log('=== REMOVAL SUMMARY ===\n');
console.log(`By category:`);
for (const [cat, count] of Object.entries(removed.byCategory)) {
  console.log(`  ${cat}: ${count}`);
}

console.log(`\nExplicitly removed: ${removed.byExplicit.length}`);
console.log(`  ${removed.byExplicit.join(', ')}`);

console.log(`\nBy morphology:`);
for (const [reason, words] of Object.entries(removed.byMorphology)) {
  console.log(`  ${reason}: ${words.length}`);
  console.log(`    Examples: ${words.slice(0, 10).join(', ')}`);
}

console.log(`\n=== TOTALS ===`);
console.log(`Before: ${entries.length}`);
console.log(`Removed: ${removedCount}`);
console.log(`After: ${cleanCount}`);
console.log(`Reduction: ${((removedCount / entries.length) * 100).toFixed(1)}%`);

// Write clean dictionary
fs.writeFileSync(OUTPUT, JSON.stringify(clean, null, 0), 'utf-8');
console.log(`\nWritten to: ${OUTPUT}`);

// Write removal log
fs.mkdirSync(path.dirname(REMOVED_LOG), { recursive: true });
fs.writeFileSync(REMOVED_LOG, JSON.stringify(removed, null, 2), 'utf-8');
console.log(`Removal log: ${REMOVED_LOG}`);

// ── Spot-check: verify known good nouns survived ──
console.log('\n=== SPOT CHECK: Known good nouns ===');
const goodNouns = ['балда', 'карта', 'манка', 'стол', 'книга', 'окно', 'зерно', 'дерево', 'молоко', 'облако',
  'абажур', 'абрикос', 'салями', 'цунами', 'оригами', 'виски', 'такси', 'кофе', 'метро', 'авеню',
  'пятно', 'вино', 'дно', 'бревно', 'звено', 'весло', 'зеркало', 'масло'];
for (const w of goodNouns) {
  const status = clean[w] ? '✓' : (dict[w] ? '✗ REMOVED (was: ' + dict[w] + ')' : '- not in dict');
  console.log(`  ${w}: ${status}`);
}

// ── Spot-check: verify known bad words were removed ──
console.log('\n=== SPOT CHECK: Known bad words ===');
const badWords = ['карт', 'манко', 'вами', 'вещами', 'бьющийся', 'учащаяся', 'вплотную'];
for (const w of badWords) {
  const status = clean[w] ? '✗ STILL IN DICT' : '✓ removed';
  console.log(`  ${w}: ${status}`);
}
