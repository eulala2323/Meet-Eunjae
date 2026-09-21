#!/usr/bin/env node
/**
 * KOSIS 주민등록인구 → ideal-type/data/population.json
 *
 * 키는 환경변수로만 읽습니다. 저장소에 절대 커밋하지 마세요.
 *
 *   export KOSIS_API_KEY="발급받은키"
 *   node tools/fetch-kosis.mjs --search 주민등록인구   # 표 ID 찾기
 *   node tools/fetch-kosis.mjs --raw                   # 응답 그대로 보기
 *   node tools/fetch-kosis.mjs                         # JSON 생성
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT  = resolve(ROOT, 'ideal-type/data/population.json');

const KEY = process.env.KOSIS_API_KEY;
if (!KEY) {
  console.error('✖ KOSIS_API_KEY 환경변수가 없습니다.\n  export KOSIS_API_KEY="발급받은키"');
  process.exit(1);
}

/* ─────────────────────────────────────────────────────────────
   가져올 표. KOSIS 표마다 파라미터 이름이 달라서, 실제 응답을 보고
   이 블록만 고치면 됩니다. --search 로 orgId/tblId 를 찾으세요.
   기본값: 행정구역(시도)별·성별·연령별(5세) 주민등록인구
   ───────────────────────────────────────────────────────────── */
const TABLE = {
  orgId:  '101',
  tblId:  'DT_1B04005N',
  itmId:  'T20',        // 총인구수
  objL1:  'ALL',        // 행정구역(시도)
  objL2:  'ALL',        // 성별
  objL3:  'ALL',        // 연령(5세)
  prdSe:  'M',          // 월 단위
  newEstPrdCnt: '1'     // 최신 1개 시점
};

/* 화면에서 쓰는 지역 키 ↔ KOSIS 지역명.
   KOSIS 는 '충청북도', '전라남도' 처럼 정식 명칭을 주고, 행정구역 개편으로
   '강원도 → 강원특별자치도' 같은 변경도 있어서 별칭을 함께 둡니다. */
const REGION_KEYS = [
  ['seoul',    '서울', ['서울', '서울특별시']],
  ['busan',    '부산', ['부산', '부산광역시']],
  ['daegu',    '대구', ['대구', '대구광역시']],
  ['incheon',  '인천', ['인천', '인천광역시']],
  ['gwangju',  '광주', ['광주', '광주광역시']],
  ['daejeon',  '대전', ['대전', '대전광역시']],
  ['ulsan',    '울산', ['울산', '울산광역시']],
  ['sejong',   '세종', ['세종', '세종시', '세종특별자치시']],
  ['gyeonggi', '경기', ['경기', '경기도']],
  ['gangwon',  '강원', ['강원', '강원도', '강원특별자치도']],
  ['chungbuk', '충북', ['충북', '충청북도']],
  ['chungnam', '충남', ['충남', '충청남도']],
  ['jeonbuk',  '전북', ['전북', '전라북도', '전북특별자치도']],
  ['jeonnam',  '전남', ['전남', '전라남도']],
  ['gyeongbuk','경북', ['경북', '경상북도']],
  ['gyeongnam','경남', ['경남', '경상남도']],
  ['jeju',     '제주', ['제주', '제주도', '제주특별자치도']]
];

const BAND_COUNT = 18;   // 0-4 … 85세 이상

/* ── 공통 호출 ── */
async function call(url, label) {
  let res;
  try {
    res = await fetch(url, { headers: { 'User-Agent': 'ideal-type-calculator/1.0' } });
  } catch (e) {
    throw new Error(`${label} 연결 실패: ${e.message}`);
  }
  if (!res.ok) throw new Error(`${label} HTTP ${res.status}`);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${label} 응답이 JSON이 아닙니다. 앞부분:\n${text.slice(0, 400)}`);
  }
  /* KOSIS 오류는 200 으로 오면서 err/errMsg 를 담아 보냅니다 */
  if (json && !Array.isArray(json) && (json.err || json.errMsg)) {
    throw new Error(`${label} KOSIS 오류 ${json.err ?? ''}: ${json.errMsg ?? JSON.stringify(json)}`);
  }
  return json;
}

/* ── 표 검색 ── */
async function search(keyword) {
  const url = 'https://kosis.kr/openapi/statisticsSearch.do?' + new URLSearchParams({
    method: 'getList', apiKey: KEY, searchNm: keyword,
    format: 'json', jsonVD: 'Y'
  });
  const rows = await call(url, '표 검색');
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return console.log('검색 결과가 없습니다.');
  console.log(`검색 결과 ${list.length}건 (앞 20건)\n`);
  for (const r of list.slice(0, 20)) {
    console.log(`  orgId=${r.ORG_ID}  tblId=${r.TBL_ID}`);
    console.log(`    ${r.TBL_NM ?? ''}  [${r.STAT_NM ?? ''}]`);
  }
  console.log('\n위에서 맞는 표를 골라 tools/fetch-kosis.mjs 의 TABLE 블록에 넣으세요.');
}

/* ── 데이터 조회 ── */
async function fetchRows() {
  const url = 'https://kosis.kr/openapi/Param/statisticsParameterData.do?' + new URLSearchParams({
    method: 'getList', apiKey: KEY, format: 'json', jsonVD: 'Y', ...TABLE
  });
  const rows = await call(url, '데이터 조회');
  if (!Array.isArray(rows)) throw new Error(`배열이 아닌 응답:\n${JSON.stringify(rows).slice(0, 400)}`);
  if (!rows.length) throw new Error('빈 배열이 왔습니다. 파라미터(objL/itmId/prdSe)를 확인하세요.');
  return rows;
}

/* ── 연령 문자열 → 5세 구간 번호 ── */
function bandOf(name) {
  if (!name) return -1;
  const s = String(name).replace(/\s/g, '');
  if (/^(계|합계|전체|총계)$/.test(s)) return -1;
  if (/100세이상/.test(s)) return 17;
  const over = s.match(/^(\d+)세이상$/);
  if (over) return Math.min(Math.floor(+over[1] / 5), BAND_COUNT - 1);
  const range = s.match(/^(\d+)[-~](\d+)세$/);
  if (range) return Math.min(Math.floor(+range[1] / 5), BAND_COUNT - 1);
  const one = s.match(/^(\d+)세$/);
  if (one) return Math.min(Math.floor(+one[1] / 5), BAND_COUNT - 1);
  return -1;
}
function sexOf(name) {
  const s = String(name ?? '').replace(/\s/g, '');
  if (/^(남자|남성|남)$/.test(s)) return 'M';
  if (/^(여자|여성|여)$/.test(s)) return 'F';
  return null;   // '계' 등은 버림
}
function regionOf(name) {
  const s = String(name ?? '').replace(/\s/g, '');
  if (/^(전국|계|합계)$/.test(s)) return null;
  /* 정확히 일치하는 이름만 받습니다. 시군구 행('경기도 수원시')이 섞여 들어와
     중복 합산되는 사고를 막기 위해 앞글자 매칭은 쓰지 않습니다. */
  for (const [key, , aliases] of REGION_KEYS) {
    if (aliases.includes(s)) return key;
  }
  return null;
}

/* ── 변환 ── */
function build(rows) {
  const regions = {};
  const skipped = { region: new Set(), age: new Set(), sex: new Set() };
  let used = 0, period = null;

  for (const r of rows) {
    period = period ?? r.PRD_DE ?? null;
    const key = regionOf(r.C1_NM);
    const sex = sexOf(r.C2_NM);
    const band = bandOf(r.C3_NM);
    if (!key) { if (r.C1_NM) skipped.region.add(r.C1_NM); continue; }
    if (!sex) { if (r.C2_NM) skipped.sex.add(r.C2_NM); continue; }
    if (band < 0) { if (r.C3_NM) skipped.age.add(r.C3_NM); continue; }

    const v = Number(r.DT);
    if (!Number.isFinite(v)) continue;

    regions[key] ??= { n: REGION_KEYS.find(x => x[0] === key)[1],
                       bands: { M: Array(BAND_COUNT).fill(0), F: Array(BAND_COUNT).fill(0) } };
    regions[key].bands[sex][band] += v;
    used++;
  }

  return { regions, used, period, skipped };
}

function validate({ regions, used, period }) {
  const problems = [];
  const found = Object.keys(regions);
  if (found.length < 17) {
    problems.push(`시도 ${found.length}/17 개만 인식했습니다. 누락: ` +
      REGION_KEYS.filter(([k]) => !regions[k]).map(([, n]) => n).join(', '));
  }
  let total = 0;
  for (const k of found) {
    const b = regions[k].bands;
    total += b.M.reduce((a, c) => a + c, 0) + b.F.reduce((a, c) => a + c, 0);
  }
  if (total < 4e7 || total > 6e7) {
    problems.push(`전국 합계가 ${total.toLocaleString()}명 입니다. 5천만 근처가 아니면 파라미터가 틀렸을 수 있습니다.`);
  }
  if (!used) problems.push('분류된 행이 하나도 없습니다.');
  return { problems, total, period };
}

/* ── 실행 ── */
const args = process.argv.slice(2);

if (args[0] === '--search') {
  await search(args[1] ?? '주민등록인구');
  process.exit(0);
}

let rows;
try {
  /* --fixture <파일>: 네트워크 대신 저장해 둔 응답으로 변환만 시험 */
  const fx = args.indexOf('--fixture');
  rows = fx >= 0
    ? JSON.parse(await (await import('node:fs/promises')).readFile(args[fx + 1], 'utf8'))
    : await fetchRows();
} catch (e) {
  console.error('✖ ' + e.message);
  process.exit(1);
}

if (args[0] === '--raw') {
  console.log(`행 ${rows.length}개. 앞 3개:\n`);
  console.log(JSON.stringify(rows.slice(0, 3), null, 2));
  console.log('\n분류 기준 컬럼(C1_NM=지역, C2_NM=성별, C3_NM=연령)이 맞는지 확인하세요.');
  process.exit(0);
}

const built = build(rows);
const { problems, total, period } = validate(built);

console.log(`행 ${rows.length}개 중 ${built.used}개 사용 · 시점 ${period ?? '?'} · 합계 ${total.toLocaleString()}명`);
for (const s of ['region', 'sex', 'age']) {
  const v = [...built.skipped[s]];
  if (v.length) console.log(`  건너뜀(${s}): ${v.slice(0, 8).join(', ')}${v.length > 8 ? ' …' : ''}`);
}

if (problems.length) {
  console.error('\n✖ 검증 실패 — 파일을 쓰지 않았습니다:');
  for (const p of problems) console.error('  · ' + p);
  console.error('\n  node tools/fetch-kosis.mjs --raw 로 실제 응답을 확인하세요.');
  process.exit(1);
}

const payload = {
  source: 'KOSIS 주민등록인구현황',
  orgId: TABLE.orgId,
  tblId: TABLE.tblId,
  period,
  total,
  fetchedAt: new Date().toISOString().slice(0, 10),
  regions: built.regions
};

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(payload, null, 1) + '\n', 'utf8');
console.log(`\n✔ ${OUT} 생성 완료`);
