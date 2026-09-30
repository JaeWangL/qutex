# 수식 글꼴과 한글 문서의 닮은 정도

Qutex Math 0.2.0은 **Latin Modern Math 1.959 기반의 근호 간격 보정본**이다.
0.1.0의 이름 변경 기준본에서 나아가, 실제 한컴 PDF와 비교한 근호 위 여백을
OpenType MATH 값으로 조정했다. 자형 전체가 HYhwpEQ와 같다는 의미는 아니다.
숫자 근호의 측정 범위와 남은 차이는 [근호 조사](radical-font-investigation.md)에 있다.

## 확인한 사실

- [GUST의 공식 배포](https://www.gust.org.pl/projects/e-foundry/lm-math/download)는
  Latin Modern Math 1.959를 OpenType 수식 글꼴로 제공한다. GUST Font License와
  LPPL 1.3c 이상에 따라 배포·수정할 수 있으며, 파생물 이름 변경 권고를 따른다.
- [한컴 개발자 포럼의 답변](https://forum.developer.hancom.com/t/topic/2882)은
  해당 EquationCreate 환경의 기본값이 HancomEQN이며 EqFontName을 HYhwpEQ로
  지정할 수 있다고 설명한다. 이는 Latin Modern가 한컴의 기본 수식 글꼴이라는
  주장을 뒷받침하지 않는다. 한컴 버전과 문서의 실제 글꼴 설정도 구별해야 한다.
- [한컴의 사용권 안내](https://help.hancom.com/hoffice120/ko-KR/HShow/license/license.htm)는
  HancomEQN의 권리자를 태광문화사로 명시한다.
  [한컴의 Mac용 한글 글꼴 안내](https://www.hancom.com/support/faqCenter/faq/detail/2462)는
  HYhwpEQ의 권리자를 한양정보통신으로 명시한다. 이 저장소에는 해당 글꼴을 포함하지 않는다.
- 동일 크기 숫자 3의 비교에서는 Latin Modern가 STIX Two / XITS보다 참고 한컴
  출력과 가까웠다. 이 한 글자의 결과를 전체 글꼴에 대한 순위로 확대하지 않는다.
  문서 형식(HWP/HWPX) 자체가 단일 글꼴이나 특정 자형을 정하지도 않는다.

## 현재 산출물

| 파일 | 역할 | 변경 범위 |
| --- | --- | --- |
| `fonts/QutexMath-Regular.otf` | 데스크톱·서버용 OpenType 수식 글꼴 | 근호 간격 2개 상수·이름·출처 메타데이터 |
| `fonts/QutexMath-Regular.woff2` | 브라우저용 동일 글꼴 | 무손실 WOFF2 포장 |
| `fonts/NotoSerifKR.woff2` | 수식 안 한글 텍스트용 보조 글꼴 | 무손실 WOFF2 포장 |
| `fonts/QutexScript-Regular.woff2` | 장식형 수식 대문자 26자용 보조 글꼴 | OFL KaTeX Script 원본의 Unicode 매핑·이름 변경 |
| `fonts/upstream/noto-serif-kr/NotoSerifKR[wght].ttf` | 서버에서 한글 윤곽선 추출에 사용할 원본 | 변경 없음 |

Qutex Math는 원본의 4,802개 글리프와 2,045개 Unicode 매핑을 보존한다. MATH
테이블에서 `RadicalVerticalGap`은 50→250, `RadicalDisplayStyleVerticalGap`은
148→250으로 바뀌었다(1000 units/em). 다른 상수, 이탤릭 보정, 수식 악센트,
확장 글리프와 조립 정보는 유지한다.
획 굵기, 글자 폭, 분수선 두께를 임의로 바꾸거나 폰트 전체를 얇게 만드는 처리는 없다.

Noto Serif KR은 [공식 Noto CJK 프로젝트](https://github.com/notofonts/noto-cjk) 계열의
Google Fonts 배포본이다. SIL Open Font License 1.1을 함께 보존하며, 원본 전체
글리프를 보관한다. 현대 한글 11,172 음절을 포함한다. 특정 예제에 나타난 한글만
남기는 부분집합은 만들지 않는다. **수식용 MATH 글꼴의 대체가 아니라 한글 텍스트
보조 글꼴**이다. 모든 문자와 수식 기호가 완전히 지원된다는 의미는 아니다.

Noto Serif KR 원본의 기본 인스턴스는 ExtraLight(200)다. 일반 본문에는 400을
명시한다. CSS `@font-face`는 `font-weight: 200 900` 범위를 선언하고,
서버의 fontkit 등에서는 `getVariation({ wght: 400 })`로 정규 굵기를 선택한다.
이 과정을 생략한 200 굵기를 Qutex Math의 획과 비교해서는 안 된다.

Temml 원본에 동봉된 `Temml.woff2`는 name 테이블의 라이선스 항목에 FontCreator
가정용 에디션의 상업 이용 제한 문구가 들어 있다. 저장소의 원본 스냅샷은 유지하되,
Qutex 배포·CDN에는 이 바이너리를 사용하지 않는다. 대신 공식 KaTeX 저장소의
OFL 1.1 `KaTeX_Script-Regular.ttf`에서 독립적으로 Qutex Script를 생성한다.
원본 Temml 글꼴의 자형·바이너리는 빌드 입력으로 사용하지 않는다.

Qutex Script는 Unicode 장식 대문자 26개에 기존 KaTeX A–Z 자형을 연결하며,
원래의 자형과 advance를 검증해 보존한다. 프라임 7종은 Qutex Math에서 표시한다.
자세한 출처와 라이선스는 `fonts/README-Qutex-Script.md`, 재현 명령은
`tools/build-script-font.py`, 검증 결과는 `fonts/script-build.json`에 있다.

## 재현과 검증

`fonts/upstream/*/SOURCE.json`에 다운로드 URL, 고정한 버전·커밋, 파일 해시가 있다.
Latin Modern 원본 ZIP도 보존한다. 원본 라이선스·README·manifest는 원래 이름을
유지하고, 수정한 결과물은 Qutex Math 이름으로 분리한다.

```sh
python3 -m venv .venv-fonts
.venv-fonts/bin/pip install -r fonts/build-requirements.txt
.venv-fonts/bin/python tools/build-font.py
```

빌드는 원본 SHA-256을 먼저 확인하고 cmap·hmtx·hhea·OS/2·GDEF·GPOS·GSUB,
글리프 순서 및 모든 글리프 윤곽선이 원본과 같은지 검사한다. MATH는 허용한
두 상수만 바꾼 예상 테이블 전체와 비교해 다른 값의 변경을 차단한다. OTF/WOFF2를 다시
열어서 검증하고 고정 도구 버전과 결과 해시를 `fonts/build.json`에 기록한다.
현재 시간으로 폰트 내부 타임스탬프를 바꾸지 않아 동일 도구 버전으로 재현할 수 있다.

같은 글꼴 이름만으로 브라우저와 SVG 결과가 같다고 보장할 수 없다. 실제 폰트 파일,
조판 경로, 장치 배율과 PDF 변환까지 확인해야 한다. 고배율 래스터의 간격과 실제
SVG 경로의 간격이 다르게 나와 폰트 간격값 250은 SVG의 실제 윤곽선 측정으로
선택한 뒤 고정했다. 이후 작은 크기에서 선이 1 CSS 픽셀로 반올림되는 문제는
폰트 획을 얇게 만드는 방식이 아니라, SVG를 더 정밀한 좌표에서 조판하고 원래
크기로 정규화하는 출력 경로에서 다룬다. 이 경로에서도 동일한 250 폰트를 사용하며,
브라우저 화면의 픽셀 반올림과 SVG의 최종 결과는 구별한다.
폰트 파일 보존 검사와 최종 수식 이미지 비교는 별개의 검증이다.

## 한컴에 가까운 자형으로 발전시키는 조건

이번 작업에 사용자가 제공한 로컬 HWP를 조사한 결과, 수식(EQEDIT) 5,413개가
모두 **HYhwpEQ, 기준 크기 11pt**로 지정되어 있었다. 따라서 이 참고 문서의
목표는 HancomEQN 기본값이 아니라 HYhwpEQ 출력이다. 문서에 포함된 미리보기는
723×1024 픽셀이며, 해당 HWP와 정확히 대응하는 기준 PDF는 확보하지 못했다.
별도의 관련 문서에서 원래 한컴이 출력한 PDF를 확보하여 HYhwpEQ 숫자 근호의
물리 간격을 측정했다. 두 자료가 같은 문서의 입력/출력이라는 주장은 하지 않는다.
원문 HWP/PDF, 미리보기 및 추출한 문제 내용은 로컬 검증 자료이며
이 저장소의 배포·CDN 자산에 포함하지 않는다.

한컴에서 만든 기준 PDF 또는 정상 출력과 문서의 수식 글꼴·기준 크기를 함께 확보한다.
HWP에 글꼴 이름만 있거나 저해상도 미리보기만 있으면 획 두께의 정답으로 사용하지
않는다. 사용자 문서는 허락된 로컬 평가에만 사용하고 저장소의 공개 자산으로 넣지 않는다.

비교 시 양쪽을 동일한 포인트 크기·색상·기준선·렌더링 해상도에 놓는다. 박스 폭에
맞추어 강제 확대하거나 두 엔진이 서로 다른 수식을 그리는 상태에서는 글꼴 유사도를
판정하지 않는다. 먼저 다음 지표를 분리한다.

1. 숫자·영문 이탤릭·그리스 문자 자형과 획 대비, x-height, advance.
2. 분수선·근호선의 두께와 연결, 위아래 여백, 기준선·수학 축.
3. 위아래 첨자의 크기·위치, 극한과 합·적분의 limit 배치.
4. 괄호·중괄호·근호의 큰 크기 변형과 조립 이음새.
5. 한글 본문과 수식의 크기·기준선·행간 관계.

글꼴의 실제 문제만 폰트에서 수정하고, 엔진의 간격·SVG 박스 배율 문제는 엔진에서
수정한다. 자형 수정본은 별도 버전으로 기록하고 기준본과 같은 폭넓은 수식 집합에서
재검증한다. 현재 버전은 간격 2개 상수만 보정했으며 글리프 윤곽선을 바꾸지 않았다.
