# KOSIS 인구 데이터 갱신

`ideal-type/index.html` 의 인구 계산은 기본적으로 페이지에 내장된 추정표를 씁니다.
아래 절차로 `ideal-type/data/population.json` 을 만들어 두면, 그 파일이 있을 때만
실측값으로 자동 대체됩니다. 파일이 없거나 형식이 어긋나면 내장표로 조용히 돌아가므로
페이지가 깨지는 일은 없습니다.

## API 키 다루기

키는 **환경변수로만** 씁니다. 저장소에 넣지 마세요.

```bash
export KOSIS_API_KEY="발급받은키"
```

키를 `.env` 같은 파일에 적어 두더라도 `.gitignore` 에 걸려 있어야 합니다.
이미 커밋해 버렸다면 KOSIS 사이트에서 키를 폐기하고 새로 발급받는 편이 빠릅니다.

## 사용법

```bash
# 1) 쓸 표를 찾는다 (orgId / tblId 확인)
node tools/fetch-kosis.mjs --search 주민등록인구

# 2) 응답이 예상한 모양인지 먼저 눈으로 본다
node tools/fetch-kosis.mjs --raw

# 3) 실제로 JSON 을 만든다
node tools/fetch-kosis.mjs
```

3번이 성공하면 `ideal-type/data/population.json` 이 생깁니다. 이 파일은
**커밋해야 합니다** — 정적 사이트가 배포 후에 읽는 파일입니다.

## 표가 안 맞을 때

스크립트 상단 `TABLE` 블록의 `orgId`, `tblId`, `itmId`, `objL1~3`, `prdSe` 를
고치면 됩니다. KOSIS 는 표마다 분류 축 순서가 달라서, `--raw` 로 실제 응답의
`C1_NM`(지역) · `C2_NM`(성별) · `C3_NM`(연령) 이 실제로 그 순서인지 확인하세요.
순서가 다르면 `build()` 의 매핑을 그에 맞게 바꿉니다.

검증에 실패하면 파일을 쓰지 않고 이유를 출력합니다:

- 시도가 17개가 안 되면 → 지역명 매칭 실패 (`REGION_KEYS` 의 별칭 확인)
- 합계가 5천만 근처가 아니면 → 파라미터가 틀렸거나 시군구 행이 섞인 것

## 오프라인으로 변환만 시험하기

```bash
node tools/fetch-kosis.mjs --fixture 저장해둔응답.json
```
