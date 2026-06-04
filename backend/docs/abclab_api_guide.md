# ABC Lab API 가이드

## 기본 정보
- **API URL**: https://api.abclab.ktds.com/v1
- **인증 방식**: API Key (Bearer Token)

```http
Authorization: Bearer YOUR_API_KEY
User-Agent: YOUR_APP_NAME/1.0
```

---

## 1. Chat Messages API

### Endpoint
- **POST** `/chat-messages`

### 설명
채팅 메시지를 전송하여 LLM 응답을 받습니다.

### Request Body
| 필드 | 타입 | 설명 |
|------|------|------|
| query | string | 사용자 질문 |
| inputs | object | 사전 정의 변수 (없으면 `{}`) |
| response_mode | string | streaming / blocking |
| user | string | 사용자 식별자 (Unique) |
| conversation_id | string | 대화 ID (없으면 신규 생성) |
| files | array | 이미지/문서 파일 목록 |
| auto_generate_name | bool | 대화 제목 자동 생성 여부 |

### cURL 예제
```bash
curl -X POST 'https://api.abclab.ktds.com/v1/chat-messages' \
  --header 'Authorization: Bearer {API_KEY}' \
  --header 'Content-Type: application/json' \
  --data-raw '{
    "inputs": {},
    "query": "STP 도구 에이전트에 대해 알려줘",
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

### Response (Streaming)
- **Content-Type**: `text/event-stream`
- 각 이벤트는 `data:` 로 시작하며 `\n\n` 으로 구분됩니다.

#### 주요 이벤트 타입
- `message` / `agent_message` : LLM 응답 청크
- `message_file` : 파일 생성 이벤트
- `message_end` : 메시지 종료
- `message_replace` : 필터링 대체
- `ping` : 연결 유지
- `error` : 에러 발생

---

### Error Codes
| HTTP | 코드 | 설명 |
|------|------|------|
| 404 | Conversation does not exists | 대화 없음 |
| 400 | invalid_param | 파라미터 오류 |
| 400 | provider_quota_exceeded | 모델 호출 초과 |
| 413 | file_upload_failed | 파일 업로드 실패 |
| 500 | internal server error | 내부 서버 오류 |

---

## 2. File Upload API

### Endpoint
- **POST** `/files/upload`

### 설명
채팅 메시지에서 사용할 파일을 업로드합니다.

### Request (multipart/form-data)
| 필드 | 타입 | 설명 |
|------|------|------|
| file | File | 업로드 파일 (png, jpg, jpeg, webp, gif) |
| user | string | 사용자 식별자 |

### cURL 예제
```bash
curl -X POST 'https://api.abclab.ktds.com/v1/files/upload' \
  --header 'Authorization: Bearer {API_KEY}' \
  --form 'file=@"path/to/image.jpg"' \
  --form 'user="test1234"'
```

### Response Body
| 필드 | 타입 | 설명 |
|------|------|------|
| id | string | 파일 ID |
| name | string | 파일명 |
| size | int | 크기(bytes) |
| extension | string | 확장자 |
| mime_type | string | MIME 타입 |
| created_by | string | 업로더 |
| created_at | int | 생성 시각 |

### 파일 업로드 에러
| HTTP | 코드 | 설명 |
|------|------|------|
| 400 | no_file_uploaded | 파일 없음 |
| 400 | unsupported_file_type | 지원 안함 |
| 413 | file_upload_failed | 업로드 실패 |
| 503 | s3_connection_failed | S3 연결 실패 |
| 500 | internal server error | 서버 오류 |
