import requests
import json
from typing import Optional, Dict, List, Any

class AbclabApiClient:
    """ABC Lab API 클라이언트"""
    
    def __init__(self, api_key: str, base_url: str = "https://api.abclab.ktds.com/v1", app_name: str = "MyApp"):
        """
        API 클라이언트 초기화
        
        Args:
            api_key: API 인증 키
            base_url: API 기본 URL
            app_name: 사용자 애플리케이션 이름
        """
        self.api_key = api_key
        self.base_url = base_url
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "User-Agent": f"{app_name}/1.0",
            "Content-Type": "application/json"
        }
    
    def chat_message(
        self,
        query: str,
        user: str,
        inputs: Optional[Dict[str, Any]] = None,
        response_mode: str = "streaming",
        conversation_id: Optional[str] = None,
        files: Optional[List[Dict[str, Any]]] = None,
        auto_generate_name: bool = False
    ) -> requests.Response:
        """
        채팅 메시지 전송 (LLM 응답 받기)
        
        Args:
            query: 사용자 질문
            user: 사용자 식별자 (Unique)
            inputs: 사전 정의 변수 (없으면 {})
            response_mode: streaming 또는 blocking
            conversation_id: 대화 ID (없으면 신규 생성)
            files: 이미지/문서 파일 목록
            auto_generate_name: 대화 제목 자동 생성 여부
            
        Returns:
            requests.Response: API 응답
        """
        url = f"{self.base_url}/chat-messages"
        
        payload = {
            "query": query,
            "user": user,
            "response_mode": response_mode,
            "inputs": inputs if inputs is not None else {},
            "auto_generate_name": auto_generate_name
        }
        
        if conversation_id:
            payload["conversation_id"] = conversation_id
        
        if files:
            payload["files"] = files
        
        response = requests.post(url, headers=self.headers, json=payload)
        response.raise_for_status()
        
        return response
    
    def chat_message_streaming(
        self,
        query: str,
        user: str,
        inputs: Optional[Dict[str, Any]] = None,
        conversation_id: Optional[str] = None,
        files: Optional[List[Dict[str, Any]]] = None,
        auto_generate_name: bool = False
    ) -> Any:
        """
        스트리밍 방식으로 채팅 메시지 전송
        
        Args:
            query: 사용자 질문
            user: 사용자 식별자
            inputs: 사전 정의 변수
            conversation_id: 대화 ID
            files: 파일 목록
            auto_generate_name: 대화 제목 자동 생성 여부
            
        Yields:
            str: 각 이벤트 데이터
        """
        url = f"{self.base_url}/chat-messages"
        
        payload = {
            "query": query,
            "user": user,
            "response_mode": "streaming",
            "inputs": inputs if inputs is not None else {},
            "auto_generate_name": auto_generate_name
        }
        
        if conversation_id:
            payload["conversation_id"] = conversation_id
        
        if files:
            payload["files"] = files
        
        response = requests.post(
            url, 
            headers=self.headers, 
            json=payload,
            stream=True
        )
        response.raise_for_status()
        
        for line in response.iter_lines():
            if line:
                decoded_line = line.decode('utf-8')
                if decoded_line.startswith('data:'):
                    data = decoded_line[5:].strip()
                    if data == '[DONE]':
                        break
                    yield data
    
    def upload_file(self, file_path: str, user: str) -> Dict[str, Any]:
        """
        파일 업로드
        
        Args:
            file_path: 업로드할 파일 경로
            user: 사용자 식별자
            
        Returns:
            Dict[str, Any]: 업로드된 파일 정보
            
        Raises:
            requests.HTTPError: 업로드 실패 시
        """
        url = f"{self.base_url}/files/upload"
        
        files = {
            "file": open(file_path, "rb"),
            "user": (None, user)
        }
        
        # 헤더에서 Content-Type 제거 (multipart/form-data 자동 설정)
        upload_headers = {
            "Authorization": f"Bearer {self.api_key}",
            "User-Agent": self.headers["User-Agent"]
        }
        
        response = requests.post(url, headers=upload_headers, files=files)
        response.raise_for_status()
        
        files["file"].close()
        
        return response.json()
    
    def get_conversation_history(self, conversation_id: str, user: str) -> Dict[str, Any]:
        """
        대화 기록 조회 (참고용 - 가이드에 명시되지 않음)
        
        Args:
            conversation_id: 대화 ID
            user: 사용자 식별자
            
        Returns:
            Dict[str, Any]: 대화 기록
        """
        # 가이드에 명시된 엔드포인트가 아니므로 참고용으로만 사용
        url = f"{self.base_url}/conversations/{conversation_id}"
        params = {"user": user}
        
        response = requests.get(url, headers=self.headers, params=params)
        response.raise_for_status()
        
        return response.json()


# 사용 예제
if __name__ == "__main__":
    # API 키 설정
    API_KEY = "YOUR_API_KEY"
    USER_ID = "test1234"
    
    # 클라이언트 생성
    client = AbclabApiClient(api_key=API_KEY)
    
    # 1. 일반 채팅 메시지 (blocking)
    try:
        response = client.chat_message(
            query="STP 도구 에이전트에 대해 알려줘",
            user=USER_ID,
            response_mode="blocking"
        )
        print("Response:", response.json())
    except requests.exceptions.HTTPError as e:
        print(f"Error: {e}")
    
    # 2. 스트리밍 채팅 메시지
    print("\n--- Streaming Response ---")
    try:
        for event_data in client.chat_message_streaming(
            query="안녕하세요? 소개해 주세요.",
            user=USER_ID
        ):
            try:
                event = json.loads(event_data)
                if "answer" in event:
                    print(event["answer"], end="", flush=True)
            except json.JSONDecodeError:
                print(event_data)
    except requests.exceptions.HTTPError as e:
        print(f"\nError: {e}")
    
    # 3. 파일 업로드 후 채팅
    try:
        # 파일 업로드
        file_info = client.upload_file(
            file_path="path/to/image.jpg",
            user=USER_ID
        )
        print(f"Uploaded file: {file_info['name']}")
        
        # 업로드된 파일로 채팅
        response = client.chat_message(
            query="이 이미지에 대해 설명해 주세요.",
            user=USER_ID,
            files=[{
                "type": "image",
                "transfer_method": "remote_url",
                "url": file_info.get("url", "")
            }]
        )
        print("Response:", response.json())
    except requests.exceptions.HTTPError as e:
        print(f"Error: {e}")
