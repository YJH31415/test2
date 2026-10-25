# ASHFLOW — Iceland Volcano Simulation

웹 브라우저에서 아이슬란드 에이야퍄틀라요쿨(Eyjafjallajökull) 화산재 확산을 탐색하는 **연구용 시뮬레이션 프로토타입**입니다. GitHub에 바로 올릴 수 있는 Vite + React + TypeScript 프로젝트 구조로 구성했습니다.

> **중요한 한계:** 기본 실행 모드는 `DEMO MODEL`입니다. 화면에 표시되는 입자 궤적과 농도는 실제 2010년 관측값이 아니라, UI와 시뮬레이션 흐름을 검증하기 위한 결정론적 단순 모델입니다. Open-Meteo 연결 모드는 2010년 ERA5 지표 기상 일부를 요청할 수 있지만, 지표 바람만으로 완전한 3차원 대기장을 복원할 수는 없습니다. 결과를 실제 항공 안전 판단이나 역사적 재현의 증거로 사용하지 마세요.

## 기능

- MapLibre 기반 인터랙티브 지구본 지도
- 재생/일시정지, 초기화, 1×~500× 재생 속도
- 입자 방출량·입자 크기·난류·침적을 조절하는 실험 패널
- 런던, 파리, 프랑크푸르트, 오슬로, 스톡홀름 도시별 모델 농도/경보
- 30분 시뮬레이션 스냅샷, 요약 통계 및 CSV/JSON 내보내기
- Open-Meteo Historical Weather API의 지표 바람 데이터를 가져오는 선택적 어댑터
- API 응답이 실패해도 데모 모델로 UI를 계속 사용할 수 있는 구조

## 시작하기

필수 조건: Node.js 20 이상 및 npm.

```bash
npm install
npm run dev
```

Vite가 출력하는 로컬 주소를 브라우저에서 엽니다. 정적 빌드:

```bash
npm run typecheck
npm run build
npm run preview
```

## 데이터 모드

화면 오른쪽 상단의 `DEMO MODEL` / `FETCH 2010 SURFACE WEATHER` 선택을 사용합니다.

- **DEMO MODEL**: 네트워크 없이 동작하는 재현 가능한 단순 바람장.
- **FETCH 2010 SURFACE WEATHER**: Open-Meteo Historical Weather API에서 2010-04-14부터 2010-04-22까지의 10 m 바람을 요청합니다. 이 어댑터는 단순 시각화 모델에 지표 바람 방향을 참고값으로 적용합니다. 요청 범위/서비스 가용성에 따라 API 오류가 날 수 있습니다.

Open-Meteo 문서: https://open-meteo.com/en/docs/historical-weather-api

Open-Meteo 자료를 사용하는 경우 서비스 약관과 출처 표기를 확인하세요. API 응답을 실제 3D 대기장으로 오해하지 않도록 결과 화면에 모드가 표시됩니다.

## 물리 모델과 한계

현재 엔진은 구면 좌표를 사용해 입자 위치를 갱신하고, 바람 이류·간단한 중력 침강·난류 확산·지표 침적을 근사합니다. 이 구현은 제품 구조와 실험 흐름을 시작하기 위한 기준선입니다.

아직 포함되지 않은 검증된 구성요소:
- 검증된 전 지구 3D 바람장과 수직 속도
- 압력면/기하학적 고도 변환 및 시공간 보간
- 입자 응집, 복잡한 습식 제거, 입자 모양·밀도 분포의 관측 기반 보정
- 관측된 2010년 화산재 농도와의 정량적 검증
- 공식 항공 운항 안전 기준과의 연계

화면의 농도 경보 임계값은 프로젝트 데모용 값이며 공식 항공 기준이 아닙니다.

## GitHub 배포

1. 이 ZIP을 풀고 폴더에서 Git 저장소를 초기화합니다.
2. `npm install`, `npm run build`를 실행합니다.
3. GitHub에 새 저장소를 만든 뒤 아래 명령으로 올립니다.

```bash
git init
git add .
git commit -m "Initial ASHFLOW simulation prototype"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git
git push -u origin main
```

GitHub Pages를 쓰려면 Vite `base` 경로를 저장소 이름에 맞게 설정하고 Pages 배포 워크플로를 추가하세요. 기본 구성은 `npm run build`로 생성되는 `dist/` 폴더를 정적 호스팅하는 방식입니다.

## 주요 디렉터리

```text
src/
  components/   UI 패널과 통계
  engine/       입자 모델 및 타입
  services/     Open-Meteo 어댑터
  App.tsx       앱 상태/시뮬레이션 루프
  styles.css    전체 스타일
```

## 라이선스

프로젝트 코드는 MIT License로 제공됩니다. 외부 지도 타일/기상 자료는 각 제공자의 별도 약관을 따릅니다.
