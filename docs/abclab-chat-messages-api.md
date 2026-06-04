# ABC Lab Chat Messages API 문서

> **버전**: v1  \
> **기준일**: 2026-03-06  \
> **베이스 URL**: `https://api.abclab.ktds.com`

---

## 개요
`/v1/chat-messages` 엔드포인트를 통해 LLM 기반 응답을 생성합니다. 요청은 JSON 본문으로 전송하며, 응답은 **Server-Sent Events(SSE)** 기반의 **스트리밍** 형태(`Content-Type: text/event-stream`)로 반환됩니다.

> ⚠️ **보안 주의**: API Key는 비밀입니다. 예제에서는 항상 `Bearer {API_KEY}` 형태의 **플레이스홀더**를 사용하세요. 실제 키를 저장소나 문서에 노출하지 마세요.

---

## 인증 및 헤더
- **Authorization**: `Bearer {API_KEY}`  
- **User-Agent**: 클라이언트 식별용 필수 헤더 (예: `MY_APP/1.0/chat-messages`)  
- **Content-Type**: `application/json`

```http
Authorization: Bearer {API_KEY}
User-Agent: MY_APP/1.0/chat-messages
Content-Type: application/json
```

---

## 엔드포인트
**POST** `/v1/chat-messages`

### 요청 본문(Body)
```json
{
  "inputs": {},
  "query": "사용자의 질문",
  "response_mode": "streaming",
  "conversation_id": "",
  "user": "user-unique-id",
  "files": [
    {
      "type": "image",
      "transfer_method": "remote_url",
      "url": "https://..."
    }
  ],
  "auto_generate_name": false
}
```

### 요청 파라미터 설명
| 필드 | 타입 | 필수 | 설명 |
|---|---|:---:|---|
| `query` | string | ✅ | 사용자의 질문 텍스트 |
| `inputs` | object |  | 앱에서 사전 정의한 변수의 **key-value**. 없으면 `{}` 로 전송 |
| `response_mode` | string | ✅ | `streaming` \| `blocking` (`blocking`은 *채팅앱에서는 미지원*) |
| `user` | string | ✅ | 사용자 식별자(고유값) |
| `conversation_id` | string |  | 동일 값 전달 시 대화 이어가기, 미전달/빈값은 새 대화 |
| `files` | array<object> |  | Vision 모델 사용 시 첨부 파일 목록 |
| └ `type` | string |  | 현재 `image` 지원 |
| └ `transfer_method` | string |  | `remote_url` \| `local_file` |
| └ `url` | string |  | `remote_url`인 경우 이미지 URL |
| └ `upload_file_id` | string |  | 파일 업로드 API 응답의 id |
| `auto_generate_name` | bool |  | 대화 제목 자동 생성 여부(기본값: `false`) |

---

## cURL 예시
```bash
curl -X POST 'https://api.abclab.ktds.com/v1/chat-messages' \
  --header 'Authorization: Bearer {API_KEY}' \
  --header 'User-Agent: MY_APP/1.0/chat-messages' \
  --header 'Content-Type: application/json' \
  --data-raw '{
    "inputs": {},
    "query": "SAP 기술정보 에이전트에 대해 알려줘",
    "response_mode": "streaming",
    "conversation_id": "",
    "user": "test1234",
    "files": [
      {
        "type": "image",
        "transfer_method": "remote_url",
        "url": "https://api.abclab.ktds.com/v1/logo/logo.png"
      }
    ]
  }'
```

---

## 응답 (SSE: Server-Sent Events)
- **Content-Type**: `text/event-stream`
- 각각의 **청크(chunk)** 는 `data: ` 로 시작하고 `\n\n` 로 구분됩니다.

### 이벤트 타입
#### 1) `message`, `agent_message` (대화형 앱에서 작동)
LLM이 생성한 응답 **부분 텍스트**가 순차 전송됩니다.
```json
{
  "event": "message",
  "task_id": "...",
  "message_id": "...",
  "conversation_id": "...",
  "answer": "텍스트 일부",
  "created_at": 1679586595
}
```

#### 2) `message_file`
도구(Tools)에 의해 **새 파일**이 생성된 경우 발생합니다.
```json
{
  "event": "message_file",
  "id": "file-id",
  "type": "image",
  "belongs_to": "...",
  "url": "https://...",
  "conversation_id": "..."
}
```

#### 3) `message_end`
메시지 수신이 **완료**되었을 때 발생합니다. 사용량/메타데이터 포함.
```json
{
  "event": "message_end",
  "task_id": "...",
  "message_id": "...",
  "conversation_id": "...",
  "metadata": {
    "usage": {
      "prompt_tokens": 1033,
      "prompt_unit_price": "0.001",
      "prompt_price_unit": "0.001",
      "prompt_price": "0.0010330",
      "completion_tokens": 135,
      "completion_unit_price": "0.002",
      "completion_price_unit": "0.001",
      "completion_price": "0.0002700",
      "total_tokens": 1168,
      "total_price": "0.0013030",
      "currency": "USD",
      "latency": 1.381760165997548
    },
    "retriever_resources": [
      {
        "position": 1,
        "dataset_id": "231a5c94-dc21-353c-9121-5361adc2cbdb",
        "dataset_name": "iPhone",
        "document_id": "4ss1aa71-2c3d-4071-c236-5d12aadd1e10",
        "document_name": "iPhone List",
        "segment_id": "1d492c7a-1221-3413-d1ds-13216b21271a",
        "score": 0.98457545,
        "content": "\"상품\",\"상품출시일\",\"가격\",\"요금제\",\"약정기간\""
      }
    ]
  }
}
```

#### 4) `message_replace`
모더레이션이 활성화되어 필터링이 필요한 내용을 **교체**할 때 발생합니다.
```json
{
  "event": "message_replace",
  "task_id": "...",
  "message_id": "...",
  "conversation_id": "...",
  "answer": "대체된 텍스트",
  "created_at": 1679586595
}
```

#### 5) `ping`
연결 유지를 위한 **ping** 이벤트
```json
{"event": "ping"}
```

#### 6) `error`
에러 이벤트 (HTTP 상태, 코드, 메시지 포함)
```json
{
  "event": "error",
  "task_id": "...",
  "message_id": "...",
  "status": 400,
  "code": "invalid_param",
  "message": "비정상적인 파라미터 입력"
}
```

---

## SSE 예시 스트림 (원문 형태)
```text
data: {"event": "message", "message_id": "2ac3ab98-b2c6-4031-b334-81d423be3295", "conversation_id": "55231984-6128-5bd1-8d91-34566b4215f1", "answer": "안녕", "created_at": 1679586595}

data: {"event": "message", "message_id": "2ac3ab98-b2c6-4031-b334-81d423be3295", "conversation_id": "55231984-6128-5bd1-8d91-34566b4215f1", "answer": "하세요", "created_at": 1679586595}

data: {
  "event": "message_end",
  "id": "5e52ce04-874b-4d27-9045-b3bc80def685",
  "conversation_id": "55231984-6128-5bd1-8d91-34566b4215f1",
  "metadata": {
    "usage": {
      "prompt_tokens": 1033,
      "prompt_unit_price": "0.001",
      "prompt_price_unit": "0.001",
      "prompt_price": "0.0010330",
      "completion_tokens": 135,
      "completion_unit_price": "0.002",
      "completion_price_unit": "0.001",
      "completion_price": "0.0002700",
      "total_tokens": 1168,
      "total_price": "0.0013030",
      "currency": "USD",
      "latency": 1.381760165997548,
      "retriever_resources": [
        {
          "position": 1,
          "dataset_id": "231a5c94-dc21-353c-9121-5361adc2cbdb",
          "dataset_name": "iPhone",
          "document_id": "4ss1aa71-2c3d-4071-c236-5d12aadd1e10",
          "document_name": "iPhone List",
          "segment_id": "1d492c7a-1221-3413-d1ds-13216b21271a",
          "score": 0.98457545,
          "content": "\"상품\",\"상품출시일\",\"가격\",\"요금제\",\"약정기간\""
        }
      ]
    }
  }
}
```

---

## 에러 코드
다음은 대표적인 오류 응답 케이스입니다.

| HTTP | 코드 | 설명 |
|:---:|---|---|
| 404 | `Conversation does not exists` | 대화가 존재하지 않음 |
| 400 | `invalid_param` | 비정상적인 파라미터 입력 |
| 400 | `app_unavailable` | 앱 설정을 사용할 수 없음 |
| 400 | `provider_not_initialize` | 사용 가능한 모델 자격 증명 구성 없음 |
| 400 | `provider_quota_exceeded` | 모델 호출 할당량 부족 |
| 400 | `model_currently_not_support` | 현재 모델을 사용할 수 없음 |
| 400 | `completion_request_error` | 텍스트 생성 실패 |
| 400 | `file_too_large` | 파일 크기가 최대 제한을 초과 |
| 400 | `unsupported_file_type` | 지원되지 않는 파일 유형 |
| 413 | `file_upload_failed` | 파일 업로드 실패 |
| 500 | `internal server error` | 내부 서버 오류 |

---

## 구현 팁
- **SSE 처리**: `text/event-stream` 응답을 수신할 때는 `data:` 라인을 파싱하고, 공백 줄(`\n\n`)을 **메시지 경계**로 인식하세요.
- **재시도 전략**: 네트워크 오류 시 백오프 기반 재연결을 구현하고, `conversation_id`를 보존해 맥락을 잇도록 하세요.
- **User-Agent**: 조직/앱명과 버전을 포함해 운영/모니터링 시 누가 호출했는지 추적 가능하게 유지하세요.
- **보안**: 키는 환경변수/비밀관리(Vault)에 저장하고 소스에 하드코딩 금지. 서버 측 프록시를 통해 호출하여 클라이언트에 키가 노출되지 않도록 권장.

---

## 빠른 체크리스트
- [ ] `Authorization: Bearer {API_KEY}` 설정했는가?
- [ ] `User-Agent` 헤더 포함했는가?
- [ ] `response_mode`를 `streaming`으로 설정했는가?
- [ ] SSE 파서를 통해 `message` → `message_end` 흐름을 처리하는가?
- [ ] 오류 코드/재시도 로직을 구현했는가?

