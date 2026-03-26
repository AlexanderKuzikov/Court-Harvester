// analyze-addresses.mjs
// Запуск: node analyze-addresses.mjs courts.json

import { readFileSync, writeFileSync } from 'fs';

const filePath = process.argv[2] || 'courts.json';
const data = JSON.parse(readFileSync(filePath, 'utf-8'));
const courts = data.courts || data;

const LOCALITY_TYPES = [
  { rx: /^г\.о\.?\s/i,      type: 'г.о.' },
  { rx: /^ЗАТО\s+г\.?\s*/i, type: 'ЗАТО' },
  { rx: /^ЗАТО\s/i,         type: 'ЗАТО' },
  { rx: /^гор\.?\s/i,       type: 'г'    },
  { rx: /^г\.?\s/i,         type: 'г'    },
  { rx: /^пгт\.?\s/i,       type: 'пгт'  },
  { rx: /^гп\.?\s/i,        type: 'гп'   },
  { rx: /^сп\.?\s/i,        type: 'сп'   },
  { rx: /^рп\.?\s/i,        type: 'рп'   },
  { rx: /^пос\.?\s/i,       type: 'п'    },
  { rx: /^п\.?\s/i,         type: 'п'    },
  { rx: /^ст-ца\.?\s/i,     type: 'ст'   },
  { rx: /^ст\.?\s/i,        type: 'ст'   },
  { rx: /^с\.?\s/i,         type: 'с'    },
  { rx: /^аул\.?\s/i,       type: 'аул'  },
  { rx: /^х\.?\s/i,         type: 'х'    },
  { rx: /^д\.?\s/i,         type: 'д'    },
];

const STREET_TYPES = [
  { rx: /^ул\.?\s/i,        type: 'ул'    },
  { rx: /^пр-кт\.?\s/i,     type: 'пр-кт' },
  { rx: /^просп\.?\s/i,     type: 'пр-кт' },
  { rx: /^про-т\.?\s*/i,    type: 'пр-кт' },
  { rx: /^пр\.?\s/i,        type: 'пр-кт' },
  { rx: /^б-р\.?\s/i,       type: 'б-р'   },
  { rx: /^бул\.?\s/i,       type: 'б-р'   },
  { rx: /^пер\.?\s/i,       type: 'пер'   },
  { rx: /^ш\.?\s/i,         type: 'ш'     },
  { rx: /^наб\.?\s/i,       type: 'наб'   },
  { rx: /^пл\.?\s/i,        type: 'пл'    },
  { rx: /^туп\.?\s/i,       type: 'туп'   },
  { rx: /^пр-д\.?\s/i,      type: 'пр-д'  },
  { rx: /^проезд\.?\s/i,    type: 'пр-д'  },
  { rx: /^мкрн?\.?\s/i,     type: 'мкр'   },
  { rx: /^кв-л\.?\s/i,      type: 'кв-л'  },
  { rx: /^тракт\.?\s/i,     type: 'тр'    },
  { rx: /^тер\.?\s/i,       type: 'тер'   },
  { rx: /^лн\.?\s/i,        type: 'лн'    },
  { rx: /^линия\.?\s/i,     type: 'лн'    },
];

const REGION_RX = /(^|\s)(обл|область|респ|республика|кр|край|АО|округ|авт\.?\s*округ|губерния)(\s|$|[,.])/i;
const DISTRICT_RX = /^.+\s+(р-н|район)$/i;
const FED_CITIES = ['Санкт-Петербург', 'Москва', 'Севастополь'];

function parseAddress(raw) {
  if (!raw || !raw.trim()) return { raw, error: 'empty' };

  const result = {
    raw,
    postal_code:     null,
    region:          null,
    district:        null,
    locality_type:   null,
    locality:        null,
    settlement_type: null,
    settlement:      null,
    street_type:     null,
    street:          null,
    house:           null,
    house_prefix:    null,
    building_type:   null,
    building:        null,
    office:          null,
    extra:           [],
    issues:          [],
    has_dots:        false,
  };

  result.has_dots = /[гулпдкс]\./i.test(raw);

  const parts = raw.split(',').map(s => s.trim()).filter(Boolean);

  // Почтовый индекс
  if (/^\d{6}$/.test(parts[0])) {
    result.postal_code = parts.shift();
  } else if (/^\d{6}[^,]/.test(parts[0])) {
    result.postal_code = parts[0].match(/^(\d{6})/)[1];
    parts[0] = parts[0].replace(/^\d{6}\s*/, '').trim();
    if (!parts[0]) parts.shift();
  } else if (/^\d{3}\s\d{3}/.test(parts[0])) {
    result.postal_code = parts[0].replace(/\s/, '');
    parts.shift();
  } else {
    result.issues.push('no_postal_code');
  }

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];

    // Регион
    if (REGION_RX.test(part) && !result.region) {
      result.region = part;
      continue;
    }

    // Район (Майкопский р-н, Буйнакский район)
    if (DISTRICT_RX.test(part) && !result.district && !result.locality) {
      result.district = part;
      continue;
    }

    // Населённый пункт первого уровня
    if (!result.locality) {
      // Города федерального значения без префикса
      const fed = FED_CITIES.find(c => part === c || part.startsWith(c + ','));
      if (fed) {
        result.locality_type = 'г';
        result.locality = fed;
        continue;
      }
      const lt = LOCALITY_TYPES.find(t => t.rx.test(part));
      if (lt) {
        result.locality_type = lt.type;
        result.locality = part.replace(lt.rx, '').trim();
        continue;
      }
    }

    // Населённый пункт второго уровня (settlement)
    if (result.locality && !result.street && !result.house) {
      const lt = LOCALITY_TYPES.find(t => t.rx.test(part));
      if (lt) {
        result.settlement_type = lt.type;
        result.settlement = part.replace(lt.rx, '').trim();
        continue;
      }
    }

    // Улица
    if (!result.street) {
      const st = STREET_TYPES.find(t => t.rx.test(part));
      if (st) {
        result.street_type = st.type;
        result.street = part.replace(st.rx, '').trim();
        continue;
      }
    }

    // Дом: д, зд, влд, вл, з/у
    const houseMatch = part.match(/^(д|зд|влд|вл|з\/у)\.?\s*(.+)/i);
    if (houseMatch && !result.house) {
      result.house_prefix = houseMatch[1].toLowerCase();
      result.house = houseMatch[2].trim();
      continue;
    }

    // Строение / корпус / литера
    const bldMatch = part.match(/^(стр|корп|к|лит|литера)\.?\s*(.+)/i);
    if (bldMatch) {
      result.building_type = bldMatch[1].toLowerCase();
      result.building = bldMatch[2].trim();
      continue;
    }

    // Офис / кабинет / помещение
    const offMatch = part.match(/^(оф|каб|пом|помещ|офис|кабинет|помещение)\.?\s*(.+)/i);
    if (offMatch) {
      result.office = offMatch[2].trim();
      continue;
    }

    result.extra.push(part);
  }

  if (!result.locality) result.issues.push('no_locality');
  if (!result.street)   result.issues.push('no_street');
  if (!result.house)    result.issues.push('no_house');
  if (result.extra.length) result.issues.push('has_extra_parts');

  return result;
}

function analyze(courts) {
  const parsed = courts.map(c => ({
    code:        c.code,
    court_type:  c.court_type,
    name:        c.name,
    address_raw: c.address,
    ...parseAddress(c.address),
  }));

  const total = parsed.length;

  const stats = {
    total,
    empty_address:   0,
    has_postal_code: 0,
    has_region:      0,
    has_district:    0,
    has_locality:    0,
    has_settlement:  0,
    has_street:      0,
    has_house:       0,
    has_building:    0,
    has_office:      0,
    has_extra:       0,
    has_dots:        0,
    by_court_type:   {},
    locality_types:  {},
    street_types:    {},
    building_types:  {},
    house_prefixes:  {},
    issues_summary:  {},
    samples: {
      no_postal_code:  [],
      no_locality:     [],
      no_street:       [],
      no_house:        [],
      has_extra_parts: [],
    },
  };

  for (const p of parsed) {
    stats.by_court_type[p.court_type] = (stats.by_court_type[p.court_type] || 0) + 1;

    if (p.error === 'empty') { stats.empty_address++; continue; }

    if (p.postal_code)   stats.has_postal_code++;
    if (p.region)        stats.has_region++;
    if (p.district)      stats.has_district++;
    if (p.locality)      stats.has_locality++;
    if (p.settlement)    stats.has_settlement++;
    if (p.street)        stats.has_street++;
    if (p.house)         stats.has_house++;
    if (p.building)      stats.has_building++;
    if (p.office)        stats.has_office++;
    if (p.extra.length)  stats.has_extra++;
    if (p.has_dots)      stats.has_dots++;

    if (p.locality_type)  stats.locality_types[p.locality_type]  = (stats.locality_types[p.locality_type]  || 0) + 1;
    if (p.street_type)    stats.street_types[p.street_type]      = (stats.street_types[p.street_type]      || 0) + 1;
    if (p.building_type)  stats.building_types[p.building_type]  = (stats.building_types[p.building_type]  || 0) + 1;
    if (p.house_prefix)   stats.house_prefixes[p.house_prefix]   = (stats.house_prefixes[p.house_prefix]   || 0) + 1;

    for (const issue of p.issues) {
      stats.issues_summary[issue] = (stats.issues_summary[issue] || 0) + 1;
      if (stats.samples[issue] && stats.samples[issue].length < 15) {
        stats.samples[issue].push(
          issue === 'has_extra_parts'
            ? { raw: p.raw, extra: p.extra }
            : p.raw
        );
      }
    }
  }

  return { stats, parsed };
}

function pct(n, total) {
  return `${String(n).padStart(5)}  (${((n / total) * 100).toFixed(1)}%)`;
}

function printReport(stats) {
  const t = stats.total;
  console.log('\n════════════════════════════════════════════');
  console.log(' АНАЛИЗ АДРЕСОВ СУДОВ');
  console.log('════════════════════════════════════════════');
  console.log(`Всего записей:          ${t}`);
  console.log(`Пустых адресов:         ${stats.empty_address}`);
  console.log(`Адресов с точками:      ${pct(stats.has_dots, t)}`);

  console.log('\n── Компоненты ──────────────────────────────');
  console.log(`Есть индекс:            ${pct(stats.has_postal_code, t)}`);
  console.log(`Есть регион:            ${pct(stats.has_region, t)}`);
  console.log(`Есть район:             ${pct(stats.has_district, t)}`);
  console.log(`Есть нас. пункт:        ${pct(stats.has_locality, t)}`);
  console.log(`Есть settlement (2й):   ${pct(stats.has_settlement, t)}`);
  console.log(`Есть улица:             ${pct(stats.has_street, t)}`);
  console.log(`Есть дом:               ${pct(stats.has_house, t)}`);
  console.log(`Есть корп/стр:          ${pct(stats.has_building, t)}`);
  console.log(`Есть офис/каб:          ${pct(stats.has_office, t)}`);
  console.log(`Есть extra (неизв.):    ${pct(stats.has_extra, t)}`);

  console.log('\n── По типу суда ────────────────────────────');
  for (const [k, v] of Object.entries(stats.by_court_type).sort((a, b) => b[1] - a[1]))
    console.log(`  ${k.padEnd(8)} ${v}`);

  console.log('\n── Типы нас. пунктов ───────────────────────');
  for (const [k, v] of Object.entries(stats.locality_types).sort((a, b) => b[1] - a[1]))
    console.log(`  ${k.padEnd(8)} ${v}`);

  console.log('\n── Типы улиц ───────────────────────────────');
  for (const [k, v] of Object.entries(stats.street_types).sort((a, b) => b[1] - a[1]))
    console.log(`  ${k.padEnd(8)} ${v}`);

  console.log('\n── Типы строений ───────────────────────────');
  for (const [k, v] of Object.entries(stats.building_types).sort((a, b) => b[1] - a[1]))
    console.log(`  ${k.padEnd(8)} ${v}`);

  console.log('\n── Префиксы дома ───────────────────────────');
  for (const [k, v] of Object.entries(stats.house_prefixes).sort((a, b) => b[1] - a[1]))
    console.log(`  ${k.padEnd(8)} ${v}`);

  console.log('\n── Проблемы ────────────────────────────────');
  for (const [k, v] of Object.entries(stats.issues_summary).sort((a, b) => b[1] - a[1]))
    console.log(`  ${k.padEnd(25)} ${pct(v, t)}`);

  for (const [key, label] of [
    ['no_locality',     'нет нас. пункта'],
    ['no_street',       'нет улицы'],
    ['no_house',        'нет дома'],
    ['no_postal_code',  'нет индекса'],
    ['has_extra_parts', 'лишние части'],
  ]) {
    const samples = stats.samples[key];
    if (samples && samples.length) {
      console.log(`\n── Примеры: ${label} ${'─'.repeat(Math.max(0, 31 - label.length))}`);
      samples.forEach(s => {
        if (typeof s === 'string') console.log('  ' + s);
        else console.log(`  ${s.raw}\n    → extra: ${JSON.stringify(s.extra)}`);
      });
    }
  }

  console.log('\n════════════════════════════════════════════\n');
}

const { stats, parsed } = analyze(courts);
printReport(stats);
writeFileSync('address-analysis.json', JSON.stringify({ stats, parsed }, null, 2), 'utf-8');
console.log('Детальный разбор → address-analysis.json');