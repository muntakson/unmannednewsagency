# Paperclip으로 자율 AI 뉴스 에이전시 구축하기

## Approtech Times (적정기술 타임즈) 기술 심층 분석

---

## 목차

1. [자율 AI 에이전트의 부상](#1-자율-ai-에이전트의-부상)
2. [OpenClaw: 개별 에이전트](#2-openclaw-개별-에이전트)
3. [Paperclip: 조직 오케스트레이터](#3-paperclip-조직-오케스트레이터)
4. [Paperclip 내부 동작 원리](#4-paperclip-내부-동작-원리)
5. [Approtech Times란?](#5-approtech-news란)
6. [무인 뉴스 에이전시에 Paperclip을 사용하는 이유](#6-무인-뉴스-에이전시에-paperclip을-사용하는-이유)
7. [Approtech Times 동작 방식](#7-approtech-news-동작-방식)
8. [Approtech Times 코드베이스 내부 구조](#8-approtech-news-코드베이스-내부-구조)
9. [수동 기사 생성: 관리자 대시보드](#9-수동-기사-생성-관리자-대시보드)
10. [자율 운영: 하트비트, 큐, 캐스케이드](#10-자율-운영-하트비트-큐-캐스케이드)
11. [배운 교훈](#11-배운-교훈)

---

## 1. 자율 AI 에이전트의 부상

자율 AI 에이전트의 역사는 초기 규칙 기반 시스템(ELIZA, 1966; 전문가 시스템, 1970-80년대)에서 2000년대의 계획 수립 가능 에이전트(STRIPS, HTN 플래너)를 거쳐, 현대의 대규모 언어 모델(LLM) 기반 에이전트 시대까지 이어진다.

돌파구는 2023-2024년에 LLM이 도구 사용 능력을 갖추면서 찾아왔다. 단순히 텍스트를 생성하는 것을 넘어, 에이전트가 함수를 호출하고, 웹을 검색하고, 코드를 작성하고, API와 상호작용할 수 있게 된 것이다. AutoGPT(2023년 3월)는 LLM이 목표를 설정하고, 이를 작업으로 분해하여 반복적으로 실행할 수 있음을 보여주었다. BabyAGI는 작업 큐가 자율적 행동을 이끌 수 있음을 증명했고, CrewAI는 역할이 부여된 다중 에이전트 팀 개념을 정립했다.

그러나 이러한 초기 프레임워크에는 치명적인 한계가 있었다: 단일 세션 스크립트로 동작한다는 점이었다. 프로세스가 종료되면 에이전트의 상태도 사라졌다. 영속적인 작업 관리, 조직 계층 구조, 비용 통제, 그리고 터미널을 지속적으로 감시하지 않고도 사람이 감독할 수 있는 방법이 없었다.

이것이 바로 OpenClaw와 Paperclip이 해결하고자 하는 간극이다 — 다만 근본적으로 다른 추상화 수준에서 접근한다.

## 2. OpenClaw: 개별 에이전트

OpenClaw는 오픈소스 자율 코딩 에이전트다. 고도로 유능한 개별 직원이라고 생각하면 된다. OpenClaw는 다음을 수행할 수 있다:

- 작업 수신 (CLI 또는 웹훅을 통해)
- 접근 방식 계획
- 코드 작성 및 실행
- 도구 사용 (파일 시스템, 셸, API)
- 작업이 완료될 때까지 반복

OpenClaw는 **개별 실행**에 탁월하다. 명확하게 정의된 작업 — "이 Express 앱에 사용자 인증을 구현해주세요" — 을 주면 계획하고, 코딩하고, 테스트하고, 결과물을 제출한다. 단일 세션, 단일 컨텍스트 윈도우 내에서 하나의 목표에 집중하여 동작한다.

**OpenClaw와 Paperclip의 통합 방식:**

Paperclip 아키텍처에서 OpenClaw는 여러 가능한 *어댑터* 중 하나다. Paperclip이 OpenClaw 에이전트를 깨워야 할 때, HTTP 웹훅을 전송한다:

```
Paperclip 서버
  |  POST https://openclaw-endpoint/webhook
  |  Body: { paperclip: { runId, agentId, issueId, context... } }
  v
OpenClaw가 웨이크 신호를 수신
  |  작업 컨텍스트를 읽음
  |  작업을 실행
  |  결과를 보고
```

Paperclip의 OpenClaw 어댑터(`packages/adapters/openclaw/`)는 본질적으로 웨이크 페이로드를 전달하고 응답을 수집하는 HTTP 클라이언트다. OpenClaw를 로컬에서 실행하지 않으며, 웹훅을 통해 원격 OpenClaw 인스턴스를 트리거한다.

**우리의 유스케이스에서 OpenClaw의 한계:** OpenClaw는 코드 중심 작업을 위해 설계되었다. 조직 구조, 편집 워크플로우, 다중 에이전트 협업을 기본적으로 이해하지 못한다. 우수한 직원이지만, 혼자서 뉴스룸을 운영할 수는 없다.

## 3. Paperclip: 조직 오케스트레이터

Paperclip의 슬로건이 그 본질을 담고 있다: **"OpenClaw가 직원이라면, Paperclip은 회사다."**

Paperclip은 AI 에이전트 팀을 오케스트레이션하여 비즈니스를 운영하는 Node.js 서버와 React UI다. 다음을 제공한다:

| 기능 | 설명 |
|---|---|
| **조직도** | 계층 구조, 역할, 보고 체계. 에이전트에게는 상사, 직함, 직무 기술서가 있다. |
| **이슈 트래킹** | 모든 작업이 상태, 담당자, 우선순위, 전체 이력을 갖는 티켓 시스템. |
| **하트비트 스케줄러** | 에이전트가 설정 가능한 간격으로 깨어나 작업을 확인하고 자율적으로 행동한다. |
| **목표 정렬** | 모든 작업은 회사 미션으로 추적된다. 에이전트는 *무엇*을 해야 하고 *왜* 해야 하는지 안다. |
| **비용 통제** | 에이전트별 월간 예산. 토큰 사용량 추적과 지출 한도. |
| **거버넌스** | 승인 게이트, 설정 버전 관리, 일시 정지/종료 제어. |
| **멀티 컴퍼니** | 하나의 배포로 완전한 데이터 격리를 유지하며 여러 회사를 운영한다. |
| **어댑터 시스템** | 어떤 에이전트 런타임이든 연결 — Claude Code, Codex, Cursor, OpenClaw, Ollama, Groq, Bash, HTTP. |

### 핵심 통찰: 오케스트레이션과 실행의 분리

Paperclip에는 LLM이 포함되어 있지 않다. 텍스트를 생성하거나 코드를 작성하지 않는다. 대신, 에이전트가 팀으로서 기능하는 데 필요한 **조직 인프라**를 제공한다:

```
   Paperclip (오케스트레이터)
   +-----------------------+
   | 조직도                |    에이전트 (실행자)
   | 이슈 트래커           |    +------------------+
   | 하트비트 스케줄러 ----+--->| Claude Code      |
   | 예산 관리자           |    | Codex            |
   | 감사 로그             |    | OpenClaw         |
   | API 게이트웨이        |    | Groq + Llama 3.3 |
   | 웹 대시보드           |    | Cursor           |
   +-----------------------+    | 임의 HTTP 엔드포인트|
                                +------------------+
```

이 분리 덕분에 오케스트레이션을 변경하지 않고도 에이전트 런타임을 교체할 수 있다. Approtech Times는 Groq API(llama-3.3-70b-versatile)로 운영되지만, 필요에 따라 다른 어댑터로 전환할 수 있으며, 조직 구조, 작업 이력, 워크플로우 로직은 완전히 동일하게 유지된다.

## 4. Paperclip 내부 동작 원리

### 아키텍처

Paperclip은 네 가지 주요 컴포넌트로 구성된 TypeScript 모노레포다:

```
paperclip/
  server/          -- Express.js API 서버 (포트 3100)
  ui/              -- React + Vite 대시보드
  cli/             -- 커맨드라인 인터페이스
  packages/
    adapters/      -- 에이전트 런타임 어댑터
      claude-local/    -- Claude Code (로컬 CLI)
      codex-local/     -- OpenAI Codex (로컬 CLI)
      cursor-local/    -- Cursor (로컬 CLI)
      opencode-local/  -- OpenCode (로컬 CLI)
      openclaw/        -- OpenClaw (HTTP 웹훅)
      ollama-local/    -- Ollama (로컬 HTTP API)
      groq/            -- Groq 클라우드 API
    adapter-utils/     -- 공유 어댑터 유틸리티
    db/                -- Drizzle ORM 스키마 + 마이그레이션
    shared/            -- 공유 상수 및 타입
```

### 서버

Paperclip 서버(`server/src/`)는 다음으로 구성된 Express.js 애플리케이션이다:

- **라우트** (`routes/`): 이슈, 에이전트, 회사, 목표, 비용, 헬스 체크를 위한 REST API 엔드포인트
- **서비스** (`services/`): 하트비트 스케줄링, 이슈 관리, 활동 로깅, 비용 추적 비즈니스 로직
- **어댑터** (`adapters/`): 어댑터 타입을 실행 모듈에 매핑하는 레지스트리
- **데이터베이스**: 내장 PostgreSQL (포트 54329) + Drizzle ORM

### 어댑터 패턴

각 어댑터는 표준 인터페이스를 구현한다:

```typescript
interface AdapterModule {
  execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult>;
  testEnvironment(config): Promise<TestResult>;
}
```

`execute` 함수는 다음을 포함하는 컨텍스트를 받는다:
- `runId` — 고유 실행 식별자
- `agent` — 에이전트의 설정, 역할, 회사
- `config` — 어댑터별 설정 (API 키, 모델, 시스템 프롬프트)
- `context` — 웨이크 컨텍스트 (어떤 이슈가 트리거했는지, 이유)
- `onLog(stream, data)` — stdout/stderr 로깅 콜백
- `onMeta(info)` — 메타데이터 콜백 (사용 모델, 토큰 등)

반환값:
- `exitCode`, `signal`, `timedOut`
- `usage` — 토큰 수
- `summary` — 에이전트가 수행한 작업의 텍스트 요약
- `resultJson` — 구조화된 출력 (전체 stdout 캡처)

### 하트비트 서비스

하트비트 서비스(`server/src/services/heartbeat.ts`, 2,325줄)는 자율 운영의 엔진이다. 다음을 관리한다:

1. **타이머 기반 웨이크**: 스케줄러가 30초마다(`HEARTBEAT_SCHEDULER_INTERVAL_MS`) 실행된다. 각 에이전트에 대해 `lastHeartbeatAt` 이후 `intervalSec`이 경과했는지 확인한다. 경과했으면 웨이크를 큐에 넣는다.

2. **할당 기반 웨이크**: 이슈가 생성되거나 재할당되면(`routes/issues.ts`), 서버가 즉시 `heartbeat.wakeup(assigneeAgentId, { source: "assignment" })`를 호출한다. 이것이 에이전트가 서로를 트리거하는 방식이다.

3. **온디맨드 웨이크**: 외부 시스템(대시보드, API 클라이언트)이 `POST /api/agents/:id/wakeup`을 호출하여 에이전트를 즉시 깨운다.

4. **실행 큐**: 웨이크업 요청은 큐에 저장된다. 스케줄러가 에이전트별로 순차 처리한다(설정 가능한 동시성, 기본값 1). 이는 중복 실행을 방지한다.

5. **실행 라이프사이클**: 각 실행은 `queued -> running -> succeeded/failed/cancelled`로 전환된다. 전체 stdout/stderr가 캡처되고, 토큰 사용량이 추적되며, 결과는 데이터베이스에 저장된다.

```
하트비트 스케줄러 (30초마다)
  |
  각 에이전트에 대해:
  |  if (현재 - lastHeartbeatAt > intervalSec):
  |    enqueueWakeup(agentId, source="timer")
  |
  큐에 있는 각 웨이크업에 대해:
  |  if (에이전트가 아직 실행 중이 아니면):
  |    adapter = getAdapter(agent.adapterType)
  |    result = await adapter.execute(context)
  |    결과를 데이터베이스에 저장
  |    에이전트 상태 업데이트
```

## 5. Approtech Times란?

Approtech Times(적정기술 타임즈)는 적정기술(Appropriate Technology)을 다루는 완전 자율적 AI 기반 뉴스 웹사이트다. `appro.iotok.org`에서 발행된다.

주목할 점은 **사람이 기사를 작성하거나, 편집하거나, 발행하지 않는다**는 것이다. 뉴스 발굴에서 기사 작성, 웹 발행에 이르는 전체 편집 과정이 Paperclip으로 조정되는 네 명의 AI 에이전트 팀에 의해 수행된다.

### 적정기술이란?

적정기술(Appropriate Technology)은 개발도상국과 소외 지역 주민의 삶의 질을 개선하기 위해 해당 지역의 문화적, 경제적, 환경적 조건에 맞게 설계된 기술을 말한다. 값비싼 첨단 기술이 아닌, 현지에서 구할 수 있는 재료와 기술로 구현할 수 있는 실용적인 해결책이다.

사이트가 다루는 주제:
- 물/위생 — 태양광 정수기, 저비용 필터, 빗물 수확 시스템
- 에너지 — 태양광 패널, 바이오매스 스토브, 오프그리드 발전
- 건강 — 저비용 의료기기, 원격 진료, 백신 냉장 시스템
- 농업 — 관개 시스템, 토양 센서, 소규모 농기계
- AI for Development — 개발을 위한 인공지능 활용
- 교육 — 오프라인 교육 도구, 저비용 컴퓨터, 디지털 문해력
- 주거 — 저비용 주택, 내진 설계, 현지 재료 활용 건축

### 뉴스 소스

Approtech Times는 국내외 다양한 적정기술 소스에서 뉴스를 수집한다:

**국내 소스:**
- [적정기술학회](http://appropriate.or.kr/) — 한국 적정기술 학술 단체
- [나눔과기술](http://www.stiweb.org/) — 소외된 이웃을 위한 기술 나눔 NGO
- [국경없는과학자회](https://www.facebook.com/profile.php?id=100063973212117) — 개발도상국에 과학자·엔지니어를 파견하는 NGO

**국제 소스:**
- [Engineering for Change](https://www.engineeringforchange.org/)
- [Practical Action](https://practicalaction.org/news/)
- [MIT D-Lab](https://d-lab.mit.edu/news)
- [Appropriate Technology Network](https://www.appropriatetech.net/)
- [Appropedia](https://www.appropedia.org/Appropriate_technology)
- [Appropriate Technology Magazine](https://appropriate-technology.com/)
- [UNESCO Appropriate Technology](https://www.unesco.org/en/tags/appropriate-technology)

**학술 소스:**
- [Journal of Appropriate Technology](https://link.springer.com/journal/42250/articles) (Springer)

각 기사에는 다음이 포함된다:
- 원본 기사의 `og:image` 메타 태그에서 가져온 히어로 이미지
- 출처로 연결되는 이미지 크레딧
- 원본 기사로 연결되는 출처 표기 박스
- 토큰 사용량과 비용 투명성 (예: "Groq: 51.9k tokens - $0.03")

## 6. 무인 뉴스 에이전시에 Paperclip을 사용하는 이유

뉴스 에이전시는 Paperclip의 모델에 완벽하게 매핑되는 자연스러운 조직 구조를 가지고 있다:

| 뉴스 에이전시 역할 | Paperclip 개념 | Approtech Times 에이전트 |
|---|---|---|
| 편집장 | CEO 에이전트 (조직도 권한) | CEO |
| 취재 기자 | 리서치 도구를 가진 엔지니어 에이전트 | Scout |
| 기자 | 작문 능력을 가진 엔지니어 에이전트 | Writer |
| 교열 편집자 | 검토 능력을 가진 엔지니어 에이전트 | Editor |
| 편집 일정표 | 우선순위가 있는 이슈 트래커 | Paperclip 이슈 |
| 발행 일정 | 하트비트 간격 | 12시간 타이머 |
| 발행된 기사 | 설명이 있는 완료 이슈 | Done 상태 |
| 업무 배정 데스크 | 이슈 할당 + 자동 웨이크 | 할당 트리거 |

Paperclip 없이 이를 구축하려면 다음이 필요하다:
- 커스텀 작업 큐와 스케줄러
- 커스텀 에이전트 상태 관리
- 커스텀 에이전트 간 통신 프로토콜
- 커스텀 로깅과 비용 추적
- 커스텀 관리자 대시보드

Paperclip은 이 모든 것을 기본으로 제공한다. Approtech Times 애플리케이션 자체는 약 660줄의 코드(웹사이트를 렌더링하는 Express 서버)에 불과하다. 모든 오케스트레이션, 스케줄링, 에이전트 조정, 상태 관리는 Paperclip이 처리한다.

### 경제성

Approtech Times는 Groq API의 `llama-3.3-70b-versatile` 모델로 운영된다. 기사당 일반적인 비용:

| 단계 | 토큰 | 비용 |
|---|---|---|
| Scout 리서치 (웹 검색 + 패치) | ~30-50k | $0.02-0.03 |
| Writer 기사 생성 | ~15-25k | $0.01-0.02 |
| 기사당 합계 | ~45-75k | $0.03-0.05 |

하루에 하트비트 사이클 2회, 사이클당 약 2-3개 기사를 생산하면, 일일 운영 비용은 약 $0.10-0.30이다. 이로써 완전 자율 적정기술 뉴스 사이트를 무기한 경제적으로 운영할 수 있다.

## 7. Approtech Times 동작 방식

### 에이전트 팀

Approtech Times는 각각 특정 역할, 시스템 프롬프트, 어댑터가 설정된 네 명의 에이전트로 운영된다:

**Scout (뉴스 스카우트)**
- 어댑터: Groq (llama-3.3-70b-versatile)
- 역할: `engineer`
- 보고 대상: CEO
- 하트비트: 12시간
- 도구: `list_my_issues`, `update_issue`, `create_issue`, `list_agents`, `web_search`, `fetch_url`
- 미션: 국내외 적정기술 소스에서 뉴스를 검색하고, 스토리 브리프를 작성하고, Writer에게 기사를 할당

**Writer (기술 작가)**
- 어댑터: Groq (llama-3.3-70b-versatile)
- 역할: `engineer`
- 보고 대상: CEO
- 하트비트: 12시간
- 도구: `list_my_issues`, `update_issue`, `create_issue`, `list_agents`
- 미션: 스토리 브리프를 일반 독자가 이해할 수 있는 완전한 기사로 변환

**Editor (콘텐츠 편집자)**
- 어댑터: Groq (llama-3.3-70b-versatile)
- 역할: `engineer`
- 보고 대상: CEO
- 하트비트: 12시간
- 도구: Writer와 동일
- 미션: 기사의 품질, 정확성, 출처 표기, 이미지 크레딧 검토

**CEO (편집장)**
- 어댑터: Groq (llama-3.3-70b-versatile)
- 역할: `ceo`
- 하트비트: 12시간
- 도구: Writer와 동일
- 미션: 편집 우선순위 설정, 팀 조정, 국내외 적정기술 기사의 균형 있는 보도 보장

### 도구 시스템

에이전트는 `packages/adapters/ollama-local/src/server/tools.ts`에 정의된 통합 도구 시스템을 통해 Paperclip API와 실제 웹 모두와 상호작용한다:

**Paperclip API 도구:**

| 도구 | 용도 |
|---|---|
| `list_my_issues` | 호출 에이전트에게 할당된 모든 이슈 목록 |
| `list_company_issues` | 회사의 모든 이슈 목록 |
| `get_issue` | 특정 이슈의 상세 정보 조회 |
| `update_issue` | 상태, 설명 등 필드 변경 |
| `create_issue` | 새 이슈 생성 (선택적으로 다른 에이전트에게 할당) |
| `add_comment` | 이슈에 댓글 추가 |
| `list_agents` | 회사의 모든 에이전트 목록 (할당을 위한 ID 확인) |

**웹 도구:**

| 도구 | 용도 |
|---|---|
| `web_search` | 키워드로 웹 검색 — 적정기술 관련 최신 뉴스 검색 |
| `fetch_url` | 임의 URL 패치 — 텍스트 콘텐츠, 페이지 제목, `og:image`, 출처 표기 추출 |

Approtech Times의 Scout는 시스템 프롬프트에 지정된 적정기술 소스 URL에 `fetch_url`을 직접 사용한다:
- 국내: 적정기술학회, 나눔과기술, 국경없는과학자회 Facebook 페이지
- 국제: Engineering for Change, Practical Action, MIT D-Lab, Appropriatetech.net, Appropedia, UNESCO
- 학술: Springer Journal of Appropriate Technology

`fetch_url` 도구는 RSS/Atom 피드와 HTML 페이지 모두를 처리한다. HTML 페이지의 경우:
1. `og:image`와 `twitter:image` 메타 태그 추출
2. 스크립트, 스타일, 내비게이션, 푸터 제거
3. 본문 텍스트 추출
4. 출처 표기를 포함하도록 에이전트에게 안내하는 `source_note`가 포함된 구조화된 데이터 반환

### 기사 파이프라인

```
발견             리서치           작성             검토             발행
---------        --------         -------          ------           -----------
fetch_url   -->  fetch_url  -->   update_issue --> update_issue --> appro.iotok.org
적정기술 소스     기사 읽기         전체 기사를       상태를            에 게시
모니터링           이미지 추출       설명에 작성       "in_review"
                                                    또는 "done"으로 설정
```

각 단계는 이슈 상태 전환으로 추적된다:

```
todo --> in_progress --> in_review --> done
```

## 8. Approtech Times 코드베이스 내부 구조

Approtech Times는 Paperclip API에서 데이터를 읽는 독립형 Express.js 애플리케이션이다:

```
approtechnews/
  server.js            -- 메인 Express 서버 (~660줄)
  public/
    styles.css         -- 그린 테마 다크 CSS
  package.json         -- 의존성: express, marked
  BOOK-CHAPTER-KO.md   -- 이 문서
```

### server.js 구조

서버는 다음 섹션으로 구성된다:

**1. 데이터 패칭**

```javascript
const PAPERCLIP_API = "http://127.0.0.1:3100/api";
const COMPANY_ID = process.env.COMPANY_ID; // 환경 변수로 전달 (필수)

async function fetchIssues(status) { /* GET /api/companies/:id/issues */ }
async function fetchIssue(id) { /* GET /api/issues/:id */ }
async function fetchAgents() { /* GET /api/companies/:id/agents */ }
async function getArticles() { /* done + in_review + in_progress 결합 */ }
```

Approtech Times는 자체 데이터베이스가 없다. Paperclip API에서 직접 읽는다. 이슈가 곧 기사다. 이슈 제목이 기사 헤드라인이 되고, 이슈 설명(마크다운)이 기사 본문이 된다. 이슈 상태가 초안인지 발행된 것인지를 결정한다.

**2. 콘텐츠 추출 유틸리티**

```javascript
function extractImage(desc) { /* ![alt](url) 또는 원시 이미지 URL 찾기 */ }
function extractSource(desc) { /* Source: [title](url) 패턴 찾기 */ }
function extractImageCredit(desc) { /* *Image: [domain](url)* 찾기 */ }
function cleanIssueTitle(title) { /* "Write article on", "Scout:" 등 제거 */ }
function extractSummary(desc, maxLen) { /* 카드 프리뷰를 위한 마크다운 제거 */ }
function getCategory(issue) { /* 분류: Water, Energy, Health, Agriculture, AI, Education, Housing, Guide, News */ }
function articleCard(issue, featured, tokenUsage) { /* 기사 카드 HTML 렌더링 */ }
```

카테고리 시스템은 적정기술 분야에 맞게 설계되어 있다: Water(물/위생), Energy(에너지), Health(건강), Agriculture(농업), AI(인공지능), Education(교육), Housing(주거), Guide(가이드), News(뉴스).

**3. 토큰 사용량 추적**

```javascript
async function fetchTokenUsageByIssue() {
  // Paperclip API에서 하트비트 실행 기록을 패치
  // stdout을 파싱하여 각 실행이 작업한 이슈 ID를 확인
  // 이슈별 inputTokens + outputTokens 집계
}

// Groq 가격: 입력 $0.59/M, 출력 $0.79/M
function formatTokenCost(tokenInfo) {
  // "Groq: 51.9k tokens - $0.03" 반환
}
```

**4. 공개 라우트**

| 라우트 | 용도 |
|---|---|
| `GET /` | 홈페이지 — 히어로 섹션, 추천 기사, 기사 그리드 |
| `GET /news` | 모든 기사 페이지 (전체 그리드) |
| `GET /article/:id` | 기사 상세 — 히어로 이미지, 본문, 출처, 토큰 |
| `GET /status` | 뉴스룸 상태 — 에이전트 카드, 콘텐츠 파이프라인 보드 |
| `GET /about` | 적정기술 뉴스 소개 페이지 |
| `GET /dashboard` | 관리자 대시보드 (9절 참조) |

**5. 관리자 API 프록시**

```javascript
POST /dashboard/api/issues          // 새 이슈 생성
POST /dashboard/api/issues/:id/status  // 이슈 상태 변경
POST /dashboard/api/agents/:id/wakeup  // 에이전트 깨우기
```

이 프록시 엔드포인트는 브라우저가 Paperclip API(localhost:3100에서 실행)에 직접 접근할 수 없기 때문에 존재한다(사이트는 퍼블릭 도메인으로 접근). Approtech Times 서버가 브리지 역할을 한다.

**6. 레이아웃과 렌더링**

모든 페이지는 서버 사이드 렌더링된다. `layout()` 함수가 콘텐츠를 일관된 HTML 셸로 감싼다:
- Google Fonts (Inter, JetBrains Mono)
- 활성 상태가 표시되는 네비게이션 바
- Paperclip 출처가 표기된 푸터
- 캐시 버스팅된 CSS

기사 설명은 `marked` 라이브러리를 사용하여 마크다운에서 HTML로 렌더링된다. 렌더링 전에 서버가 `Source:` 줄과 `![image]()` 마크다운을 제거한다(이들은 별도의 구조화된 요소로 표시되기 때문).

### styles.css 구조

CSS는 테마를 위해 CSS 커스텀 프로퍼티를 사용한다. Approtech Times는 적정기술의 지속 가능성을 상징하는 그린 테마를 채택했다:

```css
:root {
  --bg: #0a0b0a;
  --bg-card: #131614;
  --border: #2a2e2a;
  --text: #e4e7e4;
  --accent: #22c55e;      /* 그린 액센트 */
  --accent-dim: #16a34a;
  /* ... */
}
```

히어로 그라디언트는 `linear-gradient(135deg, #e4e7e4 0%, #22c55e 100%)`으로, 추천 카드는 그린 틴트 그라디언트를 사용한다. 코드 색상은 `#4ade80`(그린)이다.

## 9. 수동 기사 생성: 관리자 대시보드

`/dashboard`의 관리자 대시보드를 통해 사람이 AI 뉴스룸을 직접 지시할 수 있다.

### 기사 생성하기

대시보드에는 세 가지 컨트롤이 있는 "기사 생성" 폼이 포함되어 있다:

1. **주제 입력** — 자유 텍스트 필드 (예: "태양광 정수기 신기술")
2. **모드 선택**:
   - "Scout가 조사 후 Writer가 작성" — 전체 파이프라인
   - "Writer가 바로 작성" — 리서치 단계 생략
3. **우선순위** — 높음 / 보통 / 낮음

### "생성" 클릭 시 동작

**모드: Scout가 조사 후 Writer가 작성**

```
관리자가 "나눔과기술 창의설계경진대회"를 입력하고 생성 클릭
  |
  |  1. JavaScript가 POST /dashboard/api/issues 전송
  |     Body: {
  |       title: "Scout: Research 나눔과기술 창의설계경진대회",
  |       description: "이 주제를 조사하고 상세한 스토리 브리프를 작성...",
  |       assigneeAgentId: "aa92e04b-...",  // Scout의 ID
  |       priority: "medium",
  |       status: "todo"
  |     }
  |
  |  2. Paperclip API가 데이터베이스에 이슈 생성
  |     issues.ts 라우트 핸들러가 assigneeAgentId 설정을 감지
  |     heartbeat.wakeup(scoutId, { source: "assignment" }) 호출
  |
  |  3. JavaScript가 POST /dashboard/api/agents/scout/wakeup 전송
  |     이것은 이중 안전을 위한 보조 웨이크업 (벨트와 멜빵)
  |
  |  4. 대시보드에 토스트 표시: "리서치 작업 생성 & Scout 깨움"
  |     2초 후 페이지 새로고침
  v
Scout가 수 초 내에 깨어남 (invocationSource: "assignment")
```

**모드: Writer가 바로 작성**

```
관리자가 "Writer가 바로 작성"을 선택하고 생성 클릭
  |
  |  "나눔과기술 창의설계경진대회" 이슈 생성
  |  Writer에게 직접 할당
  |  Writer를 즉시 깨움
  v
Writer가 깨어나 Scout 리서치 단계 없이 기사 작성
```

### 기타 대시보드 기능

- **에이전트 깨우기** — `POST /api/agents/:id/wakeup`으로 에이전트를 즉시 깨움
- **전체 에이전트 깨우기** — 네 에이전트를 순차적으로 깨움
- **이슈 상태 변경** — 드롭다운으로 이슈를 todo/in_progress/in_review/done/cancelled로 이동
- **멈춘 이슈 감지** — 진행 중/검토 중이지만 활성 에이전트 실행이 없는 이슈를 배너로 표시

## 10. 자율 운영: 하트비트, 큐, 캐스케이드

이것이 Approtech Times 자율 운영의 핵심이다. 사람이 있을 필요가 없다. 시스템은 스스로 무기한 작동한다.

### 세 가지 트리거 메커니즘

| 트리거 | 출처 | 속도 | 유스케이스 |
|---|---|---|---|
| **하트비트 타이머** | `heartbeat_scheduler` | 매 `intervalSec`마다 | 주기적 자율 작업 |
| **할당 감지** | `issues.ts` 라우트 | 즉시 (~30초) | 에이전트 간 위임 |
| **수동 웨이크업** | 대시보드 / API | 즉시 | 사람이 지시한 작업 |

### 트리거 1: 하트비트 타이머

Paperclip 서버는 30초마다 스케줄러 함수(`tickTimers`)를 실행한다:

```typescript
// server/src/services/heartbeat.ts, 2203줄
tickTimers: async (now = new Date()) => {
  const allAgents = await db.select().from(agents);
  for (const agent of allAgents) {
    // 일시 정지/종료된 에이전트는 건너뜀
    if (agent.status === "paused" || agent.status === "terminated") continue;

    const policy = parseHeartbeatPolicy(agent);
    if (!policy.enabled || policy.intervalSec <= 0) continue;

    // 충분한 시간이 경과했는지 확인
    const baseline = new Date(agent.lastHeartbeatAt ?? agent.createdAt).getTime();
    const elapsedMs = now.getTime() - baseline;
    if (elapsedMs < policy.intervalSec * 1000) continue;

    // 웨이크를 큐에 넣음
    await enqueueWakeup(agent.id, {
      source: "timer",
      triggerDetail: "system",
      reason: "heartbeat_timer",
    });
  }
}
```

Scout의 12시간 타이머가 발동하면:

```
하트비트 타이머가 Scout에 대해 발동
  |
  v
Scout의 Groq 어댑터 execute()가 실행:
  1. 사전 패치: list_my_issues() -- CEO로부터의 작업이 있을 수 있거나 비어있음
  2. 시스템 프롬프트: "적정기술 소스를 fetch_url로 확인하라"
  3. tool_choice: "required" (첫 턴) -- 도구 호출을 강제
  4. fetch_url("http://appropriate.or.kr/") -- 적정기술학회 확인
     |  반환: {title, content, links...}
  5. fetch_url("http://www.stiweb.org/") -- 나눔과기술 확인
     |  반환: {title, content, links...}
  6. fetch_url("https://www.engineeringforchange.org/") -- 국제 소스 확인
     |  반환: 최신 기사 목록
  7. create_issue("태양광 정수기 신기술로 깨끗한 물 공급", assignee=Writer)
     |  이것이 할당 감지를 트리거 (아래 참조)
  8. Scout가 자신의 작업을 완료로 표시
```

**Scout는 어떻게 자율적으로 주제를 선택하는가?** Scout의 시스템 프롬프트에는 확인할 특정 적정기술 소스 URL과 시도할 검색 쿼리가 포함되어 있다. 할당된 작업 없이 깨어나면, 이 지침을 따라 국내외 적정기술 소스에서 최신 뉴스를 검색한다. `fetch_url` 도구가 각 소스의 실시간 콘텐츠를 가져오므로, 주제는 항상 최신이고 실제적이다.

### 트리거 2: 할당 감지

Scout가 `assigneeAgentId = Writer`로 `create_issue`를 호출하면, Paperclip API의 이슈 생성 핸들러가 작동한다:

```typescript
// server/src/routes/issues.ts, 382줄
if (issue.assigneeAgentId) {
  void heartbeat.wakeup(issue.assigneeAgentId, {
    source: "assignment",
    triggerDetail: "system",
    reason: "issue_assigned",
    payload: { issueId: issue.id, mutation: "create" },
  });
}
```

이것은 즉시 Writer에 대한 웨이크업을 큐에 넣는다. Writer는 12시간 하트비트를 기다릴 필요가 없다 — 수 초 내에 깨어난다.

```
Scout가 create_issue(assignee=Writer) 호출
  |
  v
Paperclip API가 이슈 생성
  |  issues.ts가 assigneeAgentId 설정을 감지
  |  heartbeat.wakeup(writerId, source="assignment") 호출
  v
하트비트 서비스가 Writer에 대한 웨이크업을 큐에 넣음
  |  다음 스케줄러 틱(30초 이내)이 큐를 처리
  v
Writer의 Groq 어댑터 execute()가 실행:
  1. list_my_issues() -- 새 "todo" 작업을 확인
  2. update_issue(status="in_progress")
  3. Scout가 작성한 스토리 브리프를 읽음
  4. 전체 기사를 설명에 작성 (일반 독자가 이해할 수 있는 언어로)
  5. update_issue(status="in_review")
  v
기사가 appro.iotok.org에 게시
```

### 트리거 3: 수동 웨이크업

대시보드가 `POST /api/agents/:id/wakeup`을 호출한다:

```typescript
// 웨이크업 엔드포인트가 source="on_demand"로 큐에 넣음
heartbeat.wakeup(agentId, {
  source: "on_demand",    // 타이머도 할당도 아님
  triggerDetail: "manual", // 유효 값: manual, ping, callback, system
});
```

### 전체 자율 캐스케이드

다음은 사람의 개입 없이 하루 두 번 실행되는 전체 캐스케이드다:

```
0시간: 하트비트가 Scout에 대해 발동
  |
  SCOUT (invocationSource: "heartbeat", triggerDetail: "system")
  |  fetch_url("http://appropriate.or.kr/") --> 적정기술학회 최신 소식 확인
  |  fetch_url("http://www.stiweb.org/") --> 나눔과기술 최신 활동 확인
  |  fetch_url("https://www.engineeringforchange.org/") --> 국제 뉴스 확인
  |  web_search("appropriate technology 2026") --> 추가 뉴스 검색
  |  create_issue("태양광 정수기 신기술", assignee=Writer)  --+
  |  create_issue("나눔과기술 창의설계경진대회", assignee=Writer)  --+
  |  완료.                                                         |
  |                                                                |
  +--- ~30초 후 (할당 감지) ----------------------------------------+
  |
  WRITER (invocationSource: "assignment", triggerDetail: "system")
  |  list_my_issues() --> 2개의 새 "todo" 작업 확인
  |  "태양광 정수기 신기술" 수행
  |  update_issue(status="in_progress")
  |  전체 기사 작성 (600-1200단어, 일반 독자 대상)
  |  update_issue(description="이미지와 출처가 포함된 전체 기사")
  |  update_issue(status="in_review")
  |  완료.
  |
  +--- 다음 하트비트 또는 할당 ---
  |
  WRITER가 "나눔과기술 창의설계경진대회"를 위해 다시 깨어남
  |  동일 과정
  |  완료.
  |
  +--- Editor 하트비트 발동 ---
  |
  EDITOR (invocationSource: "heartbeat")
  |  "in_review" 기사 확인
  |  출처 표기, 이미지 크레딧, 기술적 정확성 검토
  |  검토 후 "done"으로 이동
  |  완료.
  |
  v
기사가 appro.iotok.org에 발행
```

### 실행 큐

Paperclip은 큐 시스템을 통해 에이전트가 동시에 여러 번 실행되지 않도록 보장한다:

1. 각 웨이크업 요청은 `agentWakeupRequests` 테이블에 저장된다
2. 스케줄러가 FIFO로 요청을 처리한다
3. 에이전트별 잠금(`startLocksByAgent`)이 동시 실행을 방지한다
4. 에이전트당 기본 최대 동시 실행 수: 1
5. 새 웨이크업이 도착했을 때 에이전트가 이미 실행 중이면, 요청은 큐에 남는다

### 속도 제한과 재시도

Groq 어댑터에는 API 속도 제한을 위한 재시도 로직이 포함되어 있다:

```typescript
// packages/adapters/groq/src/server/execute.ts
for (let attempt = 0; attempt < 3; attempt++) {
  const res = await fetch(groqEndpoint, { ... });
  if (res.status === 429 && attempt < 2) {
    const retryAfter = parseInt(res.headers.get("retry-after") || "", 10);
    const waitMs = (retryAfter > 0 ? retryAfter : (attempt + 1) * 5) * 1000;
    await new Promise(r => setTimeout(r, waitMs));
    continue;
  }
  break;
}
```

또한, 에이전트 하트비트는 시차를 두어(Scout: 12시간, Writer: 12시간, Editor: 12시간, CEO: 12시간) 모든 에이전트가 동시에 발동하여 속도 제한에 걸리는 것을 방지한다.

### 도구 호출 안정성

Groq 어댑터는 안정적인 도구 호출을 위해 두 가지 전략을 사용한다:

1. **첫 턴에 `tool_choice: "required"`** — LLM이 텍스트 출력 대신 구조화된 도구 호출을 생성하도록 강제한다. 이후 턴에서는 `tool_choice: "auto"`로 모델이 도구와 텍스트 중 선택할 수 있게 한다.

2. **텍스트 폴백 파서** — 모델이 도구 호출을 텍스트로 출력하면(예: `<function(update_issue)>{"issue_id": "..."}`), 어댑터가 이 패턴을 파싱하여 실제 도구 호출로 실행한다:

```typescript
const textToolPattern = /<function(?:=|\()(\w+)\)?>\s*(\{[\s\S]*?\})/g;
while ((match = textToolPattern.exec(assistantContent)) !== null) {
  toolCalls.push({
    id: `text_tc_${turn}_${callId++}`,
    type: "function",
    function: { name: match[1], arguments: match[2] },
  });
}
```

### 대화 루프

각 에이전트 실행은 다중 턴 대화 루프(최대 15턴)다:

```
턴 0: 시스템 프롬프트 + 사용자 프롬프트 + 사전 패치된 작업
      tool_choice: "required" --> 첫 도구 호출 강제
턴 1: 도구 결과 + 어시스턴트 응답
      tool_choice: "auto" --> 모델이 결정
턴 2: 추가 도구 호출 또는 최종 텍스트 응답
...
턴 N: 더 이상 도구 호출 없음 --> 대화 종료

넛지: 모델이 도구 결과를 받았지만 행동하지 않고
      할 일을 설명만 했다면, 넛지 메시지가
      주입됨: "이제 도구를 사용하여 행동하세요."
```

## 11. 배운 교훈

### 성공한 것들

1. **Paperclip의 이슈 시스템을 기사 데이터베이스로 활용.** 기사를 이슈 설명으로 저장함으로써 별도의 CMS 구축을 피했다. 이슈 상태가 자연스럽게 편집 워크플로우에 매핑된다.

2. **다양한 적정기술 소스 직접 접근.** DuckDuckGo를 사용한 일반 웹 검색 대신, 적정기술학회, 나눔과기술, Engineering for Change 등 신뢰할 수 있는 소스 URL에 `fetch_url`을 직접 사용하여 안정적이고 관련성 높은 콘텐츠를 확보한다.

3. **첫 턴에 `tool_choice: "required"`.** 이 단일 변경으로 가장 답답했던 문제 — LLM이 도구를 실제로 호출하지 않고 할 일을 설명하기만 하는 것 — 를 해결했다.

4. **og:image 추출.** 대부분의 뉴스 사이트는 Open Graph 이미지를 포함한다. 이를 추출하면 이미지 생성 없이도 전문적인 히어로 이미지를 기사에 넣을 수 있다.

5. **하트비트 시차 + 재시도 로직.** 여러 에이전트가 동시에 발동할 때 속도 제한이 전체 파이프라인을 중단시키는 것을 방지한다.

6. **멀티 컴퍼니 아키텍처 활용.** Paperclip의 멀티 컴퍼니 지원 덕분에, 하나의 Paperclip 인스턴스에서 ESP32 Times와 Approtech Times를 완전히 격리된 상태로 동시 운영할 수 있다. 에이전트, 이슈, 설정이 회사별로 독립적이다.

### 어려웠던 것들

1. **모델의 도구 호출 안정성.** Groq의 `llama-3.3-70b-versatile`은 때때로 구조화된 `tool_calls` 대신 텍스트로 도구 호출을 출력한다. 폴백 파서가 필수적이었다.

2. **에이전트 프롬프트 엔지니어링.** 에이전트가 일관되게 출처 URL과 이미지를 포함하도록 하려면 시스템 프롬프트와 도구 결과의 `source_note` 모두에서 명시적이고 반복적인 지시가 필요했다.

3. **멈춘 이슈 누적.** 에이전트가 오류(속도 제한, API 실패)로 중단되면, 이슈가 활성 실행 없이 `in_progress`나 `in_review` 상태로 멈춘다. 관리자 대시보드의 멈춘 이슈 감지와 일괄 상태 변경은 이를 위해 구축되었다.

4. **제목에 프롬프트 유출.** 에이전트가 "Write article on 태양광 정수기" 같은 제목으로 이슈를 생성한다 — "Write article on" 접두사는 프롬프트의 일부이지 실제 헤드라인이 아니다. 표시 측에서 제목 정리 로직이 필요했다.

5. **Facebook 페이지 스크래핑.** 국경없는과학자회의 Facebook 페이지는 동적 렌더링으로 인해 `fetch_url`로 콘텐츠를 완전히 추출하기 어렵다. 소셜 미디어 소스는 공개 RSS 피드나 웹사이트보다 접근성이 낮다.

### 더 큰 그림

Approtech Times는 Paperclip이 최소한의 사람 개입으로 기능하는 자율적 비즈니스 — 이 경우에는 적정기술 뉴스 에이전시 — 를 오케스트레이션할 수 있음을 보여준다. 동일한 패턴은 다음에 적용할 수 있다:

- **고객 지원**: Scout가 수신 티켓을 모니터링, Writer가 응답 초안 작성, Editor가 검토
- **콘텐츠 마케팅**: CEO가 전략 수립, Scout가 경쟁사 조사, Writer가 콘텐츠 제작
- **코드 리뷰**: Scout가 리뷰가 필요한 PR 식별, Reviewer가 코드 분석, Reporter가 결과 요약
- **시장 조사**: Scout가 데이터 소스 모니터링, Analyst가 보고서 제작, CEO가 전략 조정

핵심 통찰은 Paperclip이 **조직적 기반** — 조직도, 작업 관리, 하트비트, 예산, 거버넌스 — 을 제공하고, 에이전트가 **지능**을 제공한다는 것이다. 이러한 관심사의 분리를 통해, 감사 가능하고, 통제 가능하며, 경제적으로 지속 가능한 자율 시스템을 구축할 수 있다.

Approtech Times는 이 패턴이 기술 뉴스(ESP32 Times)뿐 아니라 사회적 가치가 있는 적정기술 분야에도 동일하게 적용될 수 있음을 증명한다. 하나의 Paperclip 인스턴스에서 여러 뉴스 에이전시를 운영하면서, 각각은 독립적인 미션, 소스, 편집 방향을 유지할 수 있다.

---

*Approtech Times는 `appro.iotok.org`에서 운영된다. Paperclip 오케스트레이션 플랫폼은 [github.com/paperclipai/paperclip](https://github.com/paperclipai/paperclip)에서 이용할 수 있다.*
