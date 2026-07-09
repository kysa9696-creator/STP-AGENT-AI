/*
 * KT DS STP AI Agent — app.js
 * ABC Lab Chat Messages API (SSE Streaming) 연동
 * 파일 첨부 기능 통합 버전
 */

/* ============================================================
    DIFY API CONFIG
    ============================================================ */
const DIFY_API = {
  endpoint : 'https://api.abclab.ktds.com/v1/chat-messages',
  apiKey   : 'app-QziT8XHSpSmJttsdopx6SHfn',
  userId   : 'stp-agent-user'
};

/* ============================================================
    DATASET API CONFIG (Knowledge / RAG)
    ============================================================ */
const DATASET_API = {
  baseUrl    : 'https://api.abclab.ktds.com/v1',
  apiKey     : 'dataset-A6SndVab2SRIcXyrXubLVLGn',
  datasetId  : '4249e8e0-d1cf-49c7-a371-d4ab9194c718'
};

/* ============================================================
    PDF.JS CONFIGURATION
    ============================================================ */
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

/* ============================================================
    STATE
    ============================================================ */
const state = {
  conversations      : [],
  currentConvId      : null,
  difyConversationId : null,
  isTyping           : false,
  stats              : { total: 0, resolved: 0, pending: 0, responseTimes: [] },
  pendingAttachments : [],
  extractedTextCache : {} // 파일별 추출된 텍스트 캐시
};

/* ============================================================
    THEME MANAGEMENT (2 themes: light ↔ dark)
    ============================================================ */
(function initTheme() {
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const body = document.body;
  
  const themes = ['light', 'dark'];
  const themeIcons = {
    light: '<i class="fa-solid fa-sun"></i>',
    dark: '<i class="fa-solid fa-moon"></i>'
  };
  const themeTitles = {
    light: '어두운 테마로 전환 🌙',
    dark: '밝은 테마로 전환 ☀️'
  };
  const themeToasts = {
    light: '밝은 테마가 활성화되었습니다 ☀️',
    dark: '어두운 테마가 활성화되었습니다 🌙'
  };
  
  // 저장된 테마 로드
  const savedTheme = localStorage.getItem('theme') || 'light';
  applyTheme(savedTheme);
  
  function applyTheme(theme) {
    body.classList.remove('dark-theme');
    if (theme === 'dark') body.classList.add('dark-theme');
    
    if (themeToggleBtn) {
      themeToggleBtn.innerHTML = themeIcons[theme];
      themeToggleBtn.title = themeTitles[theme];
    }
  }
  
  // 테마 전환 버튼 이벤트 (2-way toggle)
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', function() {
      const current = body.classList.contains('dark-theme') ? 'dark' : 'light';
      const nextTheme = current === 'dark' ? 'light' : 'dark';
      
      applyTheme(nextTheme);
      localStorage.setItem('theme', nextTheme);
      showToast(themeToasts[nextTheme], 'info');
    });
  }
})();

/* ============================================================
    KEYWORD MAP (카테고리 자동 감지)
    ============================================================ */
const KEYWORD_MAP = {
  sap_mm  : ['sap','mm','po','pr','migo','miro','me21','me51','mm01','mmbe','mb51','구매','발주','입고','자재','invoice','인보이스'],
  system  : ['신설법인','Netcore','P&M','법인','신설','프로세스','계약','지출결의','기성','준공','DIP','BPM','SRM','ERP','SES','입고','송장','지급'],
  account : ['계정','비밀번호','패스워드','권한','로그인','잠금','인증','account','접근','승인'],
  network : ['네트워크','vpn','ip','dns','방화벽','포트','연결','ping','접속','통신','network'],
  deploy  : ['mm 연동','연동','배치','material management','자재 연동','구매 연동','입고 연동','출고 연동','MIGO','MIRO','ME21','ME22','ME23','자재 마스터','物料管理','配着','J-FLOW'],
  security: ['담당자','KT ALPHA','alpha 담당자','alpha 담당','알파 담당자','알파 담당']
};

function detectCategory(text) {
  const lower = text.toLowerCase();
  
  // 담당자/연락처 키워드가 포함되면 무조건 security 카테고리로 우선 처리
  const contactKeywords = ['담당자'];
  if (contactKeywords.some(function(kw) { return lower.includes(kw); })) {
    return 'security';
  }
  
  const lowerText = text.toLowerCase();
  for (const [cat, keywords] of Object.entries(KEYWORD_MAP)) {
    if (keywords.some(function(kw) { return lowerText.includes(kw); })) return cat;
  }
  return 'etc';
}

function getCategoryLabel(cat) {
  const map = {
    all: '전체', 
    sap_mm: 'SAP MM 모듈', 
    system: '신설법인 프로세스',
    account: '시스템', 
    network: '네트워크', 
    deploy: 'MM 연동&배치',
    security: '담당자 연락처', 
    etc: '기타'
  };
  return map[cat] || '기타';
}

function getCategoryIcon(cat) {
  const map = {
    all: 'fa-solid fa-grip', 
    sap_mm: 'fa-solid fa-cubes',
    system: 'fa-solid fa-building-circle-arrow-right', 
    account: 'fa-solid fa-server', 
    network: 'fa-solid fa-network-wired', 
    deploy: 'fa-solid fa-network-wired',
    security: 'fa-solid fa-address-book', 
    etc: 'fa-solid fa-ellipsis'
  };
  return map[cat] || 'fa-solid fa-comment';
}

// BJH 추가 start
// URL 링크 기능
function openPage(type) {
  switch (type) {
    case 'workinghome':
      window.open('https://works.ktds.co.kr/group/wms/workingfromhome', '_blank');
      break;
    case 'overtime':
      window.open('https://works.ktds.co.kr/group/wms/overtime', '_blank');
      break;
    case 'holiday':
      window.open('https://works.ktds.co.kr/group/wms/holiday', '_blank');
      break;
    case 'businesstrip':
      window.open('https://works.ktds.co.kr/group/wms/businesstrip', '_blank');
      break;
    case 'weeklyreport':
      window.open('https://ktds-kms.atlassian.net/wiki/spaces/ERPX/pages/253081942/STP', '_blank');
      break;
    case 'kms':
      window.open('https://ktds-kms.atlassian.net/wiki/spaces/ERP/pages/159359809/MM', '_blank');
      break;
    case 'tms':
      window.open('https://tms.ktds.co.kr/tms/tm/tma002.run', '_blank');
      break;
    case 'tms_team':
      window.open('https://gdrive.kt.co.kr/link/EOQwRhmq4Uy6mqJxsPy-IQ?ccd=1014', '_blank');
      break;
    case 'tms_stp':
      window.open('https://gdrive.kt.co.kr/channel/968/edit?itemIdx=344094', '_blank');
      break;
    case 'ehp':
      window.open('https://gdrive.kt.co.kr/channel/968/edit?itemIdx=321110', '_blank');
      break;
    case 'FAQ':
      window.open('https://gdrive.kt.co.kr/channel/2693/edit?itemIdx=119622', '_blank');
      break;
    case 'meeting':
      window.open('https://srs.ktds.co.kr:8443/front/allFloorsMeeting.do', '_blank');
      break;
    case 'market':
      window.open('https://ktdstu.com/gnuboard-gnuboard5-6416560/index.php', '_blank');
      break;
    default:
    case 'smartwork':
      window.open('https://srs.ktds.co.kr:8443/front/webFloor.do', '_blank');
      break;
//      location.href = 'https://works.ktds.co.kr/group/main';
      window.open('https://works.ktds.co.kr/group/main', '_blank');
      break;
  }
}

// 메뉴 트리 open/close 및 그룹사 클릭 시 welcome 카드 변경
document.addEventListener("DOMContentLoaded", () => {
  // 트리 메뉴 열기/닫기
  document.querySelectorAll(".tree-title").forEach(title => {
    title.addEventListener("click", () => {
      const item = title.closest(".tree-item");
      
      // 그룹사 메뉴는 토글하지 않음 (클릭 시 welcome 카드만 변경)
      if (item.classList.contains("group-company") || item.closest(".group-company")) {
        return;
      }
      
      // 그 외 메뉴는 일반 토글 동작
      item.classList.toggle("open");
    });
  });

  // 그룹사 회사 클릭 시 welcome 카드 변경 (이전 내용 clear)
  const groupCompanies = document.querySelectorAll(".group-company");
  groupCompanies.forEach(company => {
    const title = company.querySelector(".tree-title");
    if (!title) return;
    
    const companyName = company.getAttribute("data-company");
    const spanEl = title.querySelector("span");
    if (!spanEl) return;
    const companyLabel = spanEl.textContent.trim();
    
    title.addEventListener("click", function(e) {
        e.stopPropagation(); // 이벤트 버블링 방지
        
        // 아이콘 설정 (회사별로 다른 아이콘 사용 가능)
        let iconClass = "fa-solid fa-building-circle-arrow-right";
        if (companyName === "cloud") iconClass = "fa-solid fa-cloud";
        else if (companyName === "alpha") iconClass = "icon-alpha";
        else if (companyName === "skylife") iconClass = "fa-solid fa-satellite-dish";
        else if (companyName === "sat") iconClass = "fa-solid fa-satellite";
        else if (companyName === "ds") iconClass = "icon-ktds";
        else if (companyName === "estate") iconClass = "fa-solid fa-house";
        else if (companyName === "engcore") iconClass = "fa-solid fa-gears";
        
        // chat messages 완전 clear 후 새로운 welcome 카드 생성
        const chatMessages = document.getElementById("chatMessages");
        if (chatMessages) {
          // 현재 카테고리 저장 (kt alpha, kt netcore | kt p&m, kt cloud 일 경우)
          if (companyName === "alpha") {
            chatMessages.dataset.currentCategory = "alpha";
          } else if (companyName === "netcore-pm") {
            chatMessages.dataset.currentCategory = "netcore-pm";
          } else if (companyName === "cloud") {
            chatMessages.dataset.currentCategory = "cloud";
          } else if (companyName === "skylife") {
            chatMessages.dataset.currentCategory = "skylife";
          }
          
          // netcore-pm 의 경우 신설법인 프로세스 버튼으로 변경
          if (companyName === "netcore-pm") {
            chatMessages.innerHTML = 
              '<div class="welcome-card">' +
                '<div class="welcome-icon"><i class="' + iconClass + '"></i></div>' +
                '<h2>' + companyLabel + ' - STP AI Agent</h2>' +
                '<p><strong>' + companyLabel + '</strong> 관련 문의사항을 자유롭게 질문해 주세요.<br/>신설법인 프로세스, 시스템 연동, RFC & 배치, 담당자 연락처 등 다양한 정보를 지원합니다.<br/>STP AI 에이전트가 실시간으로 정확한 답변을 제공합니다.</p>' +
                '<div class="quick-btns">' +
                  '<button class="quick-btn" data-msg="신설법인 (Netcore, P&M) 프로세스 알려주세요"><i class="fa-solid fa-building-circle-arrow-right"></i> 신설법인 프로세스</button>' +
                  '<button class="quick-btn" data-msg="STP 에서 업무할 때 주로 사용하는 연계 시스템에 대해서 알려주세요"><i class="fa-solid fa-desktop"></i> 시스템</button>' +
                  '<button class="quick-btn" data-msg="MM RFC & 배치에 대해 알려주세요"><i class="fa-solid fa-network-wired"></i> RFC & 배치</button>' +
                  '<button class="quick-btn" data-msg="STP 운영 담당부서를 알려주세요"><i class="fa-solid fa-address-book"></i> 담당자 연락처</button>' +
                '</div>' +
              '</div>';
          } else {
            chatMessages.innerHTML = 
              '<div class="welcome-card">' +
                '<div class="welcome-icon"><i class="' + iconClass + '"></i></div>' +
                '<h2>' + companyLabel + ' - STP AI Agent</h2>' +
                '<p><strong>' + companyLabel + '</strong> 관련 문의사항을 자유롭게 질문해 주세요.<br/>업무 프로세스, Table & T-code, RFC & 배치, 담당자 연락처 등 다양한 정보를 지원합니다.<br/>STP AI 에이전트가 실시간으로 정확한 답변을 제공합니다.</p>' +
                '<div class="quick-btns">' +
                  '<button class="quick-btn" data-msg="' + companyLabel + ' 업무 프로세스 알려주세요"><i class="fa-solid fa-building-circle-arrow-right"></i> 업무 프로세스</button>' +
                  '<button class="quick-btn" data-msg="' + companyLabel + ' Table & T-code 알려주세요"><i class="fa-solid fa-table"></i> Table & T-code</button>' +
                  '<button class="quick-btn" data-msg="' + companyLabel + ' RFC & 배치 알려주세요"><i class="fa-solid fa-network-wired"></i> RFC & 배치</button>' +
                  '<button class="quick-btn" data-msg="' + companyLabel + ' 담당자 연락처 알려주세요" data-category="' + (companyName === "alpha" ? "alpha" : companyName === "skylife" ? "skylife" : companyName === "cloud" ? "cloud" : companyName === "netcore-pm" ? "netcore-pm" : "") + '"><i class="fa-solid fa-address-book"></i> 담당자 연락처</button>' +
                '</div>' +
              '</div>';
          }
          // 새로 생성된 버튼에 이벤트 리스너 바인딩
          bindQuickButtons();
        }
      });
  });
  
  // 기타 메뉴 클릭 시 기본 welcome 카드 복원
  document.querySelectorAll(".tree-title").forEach(title => {
    title.addEventListener("click", function(e) {
      const item = title.closest(".tree-item");
      // 그룹사가 아니면 기본 카드 복원 (역량강화/교육사이트는 제외)
const hasExcludedCategory = item.closest('[data-category="capability"]') || item.closest('[data-category="education"]') || item.closest('[data-category="works"]') || item.closest('[data-category="shortcut"]') || item.closest('[data-category="worksupport"]');
      if (!item.classList.contains("group-company") && !item.closest(".group-company") && !hasExcludedCategory) {
        e.stopPropagation();
        
        const welcomeCard = document.querySelector(".welcome-card");
        if (!welcomeCard) return; // Knowledge/교육사이트 화면에서는 스킵
        
        const welcomeIcon = welcomeCard.querySelector(".welcome-icon .ai-orb");
        const welcomeTitle = welcomeCard.querySelector("h2");
        const welcomeDesc = welcomeCard.querySelector("p");
        const quickBtnsContainer = welcomeCard.querySelector(".quick-btns");
        
        if (welcomeIcon) {
          // AI Orb has its own CSS animation — no JS animation needed
        }
        
        if (welcomeTitle) {
          welcomeTitle.textContent = "";
          void welcomeTitle.offsetWidth;
          welcomeTitle.textContent = "안녕하세요! STP AI Agent 입니다.";
        }
        
        if (welcomeDesc) {
          welcomeDesc.innerHTML = "";
          void welcomeDesc.offsetWidth;
          welcomeDesc.innerHTML = "<strong>SAP MM</strong> 및 <strong>KT DS STP</strong> 업무 관련 문의사항을 자유롭게 질문해 주세요.<br/>구매 프로세스, 자재 관리, 신설법인 프로세스, 계정/권한 등 다양한 업무를 지원합니다.<br/>STP AI 에이전트가 실시간으로 정확한 답변을 제공합니다.";
        }
        
        if (quickBtnsContainer) {
          quickBtnsContainer.innerHTML = "";
          void quickBtnsContainer.offsetWidth;
          quickBtnsContainer.innerHTML = 
            '<button class="quick-btn" data-msg="SAP MM(Material Management) 모듈에 대해 알려주세요"><i class="fa-solid fa-cubes"></i> SAP MM 모듈</button>' +
            '<button class="quick-btn" data-msg="STP Table & T-code 알려주세요"><i class="fa-solid fa-table"></i> Table & T-code</button>' +
            '<button class="quick-btn" data-msg="신설법인 (Netcore, P&M) 프로세스 알려주세요"><i class="fa-solid fa-building-circle-arrow-right"></i> 신설법인 프로세스</button>' +
            '<button class="quick-btn" data-msg="STP에서 업무할 때 주로 사용하는 연계 시스템에 대해서 알려주세요"><i class="fa-solid fa-desktop"></i> 시스템</button>' +
            '<button class="quick-btn" data-msg="MM RFC & 배치에 대해 알려주세요"><i class="fa-solid fa-network-wired"></i> MM RFC & 배치</button>' +
            '<button class="quick-btn" data-msg="STP 운영 담당부서를 알려주세요"><i class="fa-solid fa-address-book"></i> 담당자 연락처</button>';
          bindQuickButtons();
        }
      }
    });
  });
});
/*
document.querySelector('.category-list').addEventListener('click', (e) => {
  const item = e.target.closest('li');
  if (!item) return;
  if (item.dataset.action === 'hide-chat') {
    document.getElementById('chatMessages').style.display = 'none';
//    item.classList.add('hidden');
  } else {
    document.getElementById('chatMessages').style.display = 'flex';
//    item.classList.remove('hidden');
  }
}); */

// 통합 복무 카드 표시 함수
function showWorksCards() {
  const chatMessages = document.getElementById('chatMessages');
  if (!chatMessages) return;

  chatMessages.innerHTML =
    '<div class="welcome-card" style="max-width:800px;margin:0 auto;">' +
      '<div class="welcome-icon"><i class="fa-solid fa-user"></i></div>' +
      '<h2>통합 복무</h2>' +
      '<p>복무 관련 신청 및 예약을 한 곳에서 처리할 수 있습니다.</p>' +
      '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:24px;">' +

      // 재택근무 신청
      '<a href="https://works.ktds.co.kr/group/wms/workingfromhome" target="_blank" rel="noopener noreferrer" style="display:flex;flex-direction:column;align-items:center;padding:24px 16px;background:var(--bg-card);border:1px solid var(--border-color);border-radius:12px;text-align:center;text-decoration:none;color:var(--text-primary);transition:all 0.3s ease;">' +
        '<div style="width:48px;height:48px;display:flex;align-items:center;justify-content:center;border-radius:12px;background:rgba(226,0,42,0.1);margin-bottom:12px;"><i class="fa-solid fa-house-chimney-user" style="font-size:22px;color:var(--kt-red);"></i></div>' +
        '<strong style="font-size:14px;margin-bottom:4px;">재택근무 신청</strong>' +
        '<span style="font-size:12px;color:var(--text-secondary);">재택근무 신청 및 조회</span>' +
      '</a>' +

      // 초과근무 신청
      '<a href="https://works.ktds.co.kr/group/wms/overtime" target="_blank" rel="noopener noreferrer" style="display:flex;flex-direction:column;align-items:center;padding:24px 16px;background:var(--bg-card);border:1px solid var(--border-color);border-radius:12px;text-align:center;text-decoration:none;color:var(--text-primary);transition:all 0.3s ease;">' +
        '<div style="width:48px;height:48px;display:flex;align-items:center;justify-content:center;border-radius:12px;background:rgba(37,99,235,0.1);margin-bottom:12px;"><i class="fa-solid fa-clock-rotate-left" style="font-size:22px;color:var(--kt-blue);"></i></div>' +
        '<strong style="font-size:14px;margin-bottom:4px;">초과근무 신청</strong>' +
        '<span style="font-size:12px;color:var(--text-secondary);">초과근무 신청 및 조회</span>' +
      '</a>' +

      // 휴가 신청
      '<a href="https://works.ktds.co.kr/group/wms/holiday" target="_blank" rel="noopener noreferrer" style="display:flex;flex-direction:column;align-items:center;padding:24px 16px;background:var(--bg-card);border:1px solid var(--border-color);border-radius:12px;text-align:center;text-decoration:none;color:var(--text-primary);transition:all 0.3s ease;">' +
        '<div style="width:48px;height:48px;display:flex;align-items:center;justify-content:center;border-radius:12px;background:rgba(16,185,129,0.1);margin-bottom:12px;"><i class="fa-solid fa-umbrella-beach" style="font-size:22px;color:var(--kt-green);"></i></div>' +
        '<strong style="font-size:14px;margin-bottom:4px;">휴가 신청</strong>' +
        '<span style="font-size:12px;color:var(--text-secondary);">휴가 신청 및 잔여일 조회</span>' +
      '</a>' +

      // 출장 신청
      '<a href="https://works.ktds.co.kr/group/wms/businesstrip" target="_blank" rel="noopener noreferrer" style="display:flex;flex-direction:column;align-items:center;padding:24px 16px;background:var(--bg-card);border:1px solid var(--border-color);border-radius:12px;text-align:center;text-decoration:none;color:var(--text-primary);transition:all 0.3s ease;">' +
        '<div style="width:48px;height:48px;display:flex;align-items:center;justify-content:center;border-radius:12px;background:rgba(245,158,11,0.1);margin-bottom:12px;"><i class="fa-solid fa-plane-departure" style="font-size:22px;color:#f59e0b;"></i></div>' +
        '<strong style="font-size:14px;margin-bottom:4px;">출장 신청</strong>' +
        '<span style="font-size:12px;color:var(--text-secondary);">출장 신청 및 조회</span>' +
      '</a>' +

      '</div>' +
      '<button class="quick-btn" id="worksBackHome" style="margin-top:20px;background:var(--bg-secondary);"><i class="fa-solid fa-arrow-left"></i> 목록으로</button>' +
    '</div>';

  const backBtn = document.getElementById('worksBackHome');
  if (backBtn) backBtn.addEventListener('click', function() { renderDefaultWelcomeCard(); });
}

// 공통업무 카드 표시 함수
function showShortcutCards() {
  const chatMessages = document.getElementById('chatMessages');
  if (!chatMessages) return;

  chatMessages.innerHTML =
    '<div class="welcome-card" style="max-width:800px;margin:0 auto;">' +
      '<div class="welcome-icon"><i class="fa-solid fa-users"></i></div>' +
      '<h2>공통 업무</h2>' +
      '<p>팀 공통 업무 관련 링크를 제공합니다.</p>' +
      '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-top:24px;">' +

       // 주간 보고
       '<a href="https://ktds-kms.atlassian.net/wiki/spaces/ERPX/pages/253081942/STP" target="_blank" rel="noopener noreferrer" style="display:flex;flex-direction:column;align-items:center;padding:24px 16px;background:var(--bg-card);border:1px solid var(--border-color);border-radius:12px;text-align:center;text-decoration:none;color:var(--text-primary);transition:all 0.3s ease;">' +
        '<div style="width:48px;height:48px;display:flex;align-items:center;justify-content:center;border-radius:12px;background:rgba(226,0,42,0.1);margin-bottom:12px;"><i class="fa-solid fa-users-viewfinder" style="font-size:22px;color:var(--kt-red);"></i></div>' +
        '<strong style="font-size:14px;margin-bottom:4px;">주간 보고</strong>' +
        '<span style="font-size:12px;color:var(--text-secondary);">주간 업무 보고</span>' +
      '</a>' +

       // MM 산출물
       '<a href="https://ktds-kms.atlassian.net/wiki/spaces/ERP/pages/159359809/MM" target="_blank" rel="noopener noreferrer" style="display:flex;flex-direction:column;align-items:center;padding:24px 16px;background:var(--bg-card);border:1px solid var(--border-color);border-radius:12px;text-align:center;text-decoration:none;color:var(--text-primary);transition:all 0.3s ease;">' +
        '<div style="width:48px;height:48px;display:flex;align-items:center;justify-content:center;border-radius:12px;background:rgba(37,99,235,0.1);margin-bottom:12px;"><i class="fa-solid fa-folder-open" style="font-size:22px;color:var(--kt-blue);"></i></div>' +
        '<strong style="font-size:14px;margin-bottom:4px;">MM 산출물</strong>' +
        '<span style="font-size:12px;color:var(--text-secondary);">계약/구매/물류 산출물</span>' +
      '</a>' +

       // I/F정의서
       '<a href="https://ktds-kms.atlassian.net/wiki/spaces/ERP/pages/159405193/MM" target="_blank" rel="noopener noreferrer" style="display:flex;flex-direction:column;align-items:center;padding:24px 16px;background:var(--bg-card);border:1px solid var(--border-color);border-radius:12px;text-align:center;text-decoration:none;color:var(--text-primary);transition:all 0.3s ease;">' +
        '<div style="width:48px;height:48px;display:flex;align-items:center;justify-content:center;border-radius:12px;background:rgba(59,130,246,0.1);margin-bottom:12px;"><i class="fa-solid fa-file-contract" style="font-size:22px;color:#3B82F6;"></i></div>' +
        '<strong style="font-size:14px;margin-bottom:4px;">I/F정의서</strong>' +
        '<span style="font-size:12px;color:var(--text-secondary);">MM I/F 정의서</span>' +
      '</a>' +

       // TMS
      '<a href="https://tms.ktds.co.kr/tms/tm/tma002.run" target="_blank" rel="noopener noreferrer" style="display:flex;flex-direction:column;align-items:center;padding:24px 16px;background:var(--bg-card);border:1px solid var(--border-color);border-radius:12px;text-align:center;text-decoration:none;color:var(--text-primary);transition:all 0.3s ease;">' +
        '<div style="width:48px;height:48px;display:flex;align-items:center;justify-content:center;border-radius:12px;background:rgba(16,185,129,0.1);margin-bottom:12px;"><i class="fa-solid fa-share-nodes" style="font-size:22px;color:#3b82f6;"></i></div>' +
        '<strong style="font-size:14px;margin-bottom:4px;">TMS</strong>' +
        '<span style="font-size:12px;color:var(--text-secondary);">TMS 입력</span>' +
      '</a>' +

      // TMS(팀)
      '<a href="https://gdrive.kt.co.kr/link/EOQwRhmq4Uy6mqJxsPy-IQ?ccd=1014" target="_blank" rel="noopener noreferrer" style="display:flex;flex-direction:column;align-items:center;padding:24px 16px;background:var(--bg-card);border:1px solid var(--border-color);border-radius:12px;text-align:center;text-decoration:none;color:var(--text-primary);transition:all 0.3s ease;">' +
        '<div style="width:48px;height:48px;display:flex;align-items:center;justify-content:center;border-radius:12px;background:rgba(16,185,129,0.1);margin-bottom:12px;"><i class="fa-solid fa-share-nodes" style="font-size:22px;color:var(--kt-green);"></i></div>' +
        '<strong style="font-size:14px;margin-bottom:4px;">TMS(팀)</strong>' +
        '<span style="font-size:12px;color:var(--text-secondary);">팀 TMS 공유</span>' +
      '</a>' +

      // TMS(STP)
      '<a href="https://gdrive.kt.co.kr/channel/968/edit?itemIdx=344094" target="_blank" rel="noopener noreferrer" style="display:flex;flex-direction:column;align-items:center;padding:24px 16px;background:var(--bg-card);border:1px solid var(--border-color);border-radius:12px;text-align:center;text-decoration:none;color:var(--text-primary);transition:all 0.3s ease;">' +
        '<div style="width:48px;height:48px;display:flex;align-items:center;justify-content:center;border-radius:12px;background:rgba(245,158,11,0.1);margin-bottom:12px;"><i class="fa-solid fa-share-nodes" style="font-size:22px;color:#f59e0b;"></i></div>' +
        '<strong style="font-size:14px;margin-bottom:4px;">TMS(STP)</strong>' +
        '<span style="font-size:12px;color:var(--text-secondary);">STP TMS 공유</span>' +
      '</a>' +

      // 프로그램/연동/배치
      '<a href="https://gdrive.kt.co.kr/channel/968/edit?itemIdx=321110" target="_blank" rel="noopener noreferrer" style="display:flex;flex-direction:column;align-items:center;padding:24px 16px;background:var(--bg-card);border:1px solid var(--border-color);border-radius:12px;text-align:center;text-decoration:none;color:var(--text-primary);transition:all 0.3s ease;">' +
        '<div style="width:48px;height:48px;display:flex;align-items:center;justify-content:center;border-radius:12px;background:rgba(59,130,246,0.1);margin-bottom:12px;"><i class="fa-solid fa-code-branch" style="font-size:22px;color:#3B82F6;"></i></div>' +
        '<strong style="font-size:14px;margin-bottom:4px;">프로그램/연동/배치</strong>' +
        '<span style="font-size:12px;color:var(--text-secondary);">프로그램 및 연동 정보</span>' +
      '</a>' +

      // MM 문의 정리
      '<a href="https://gdrive.kt.co.kr/channel/2693/edit?itemIdx=119622" target="_blank" rel="noopener noreferrer" style="display:flex;flex-direction:column;align-items:center;padding:24px 16px;background:var(--bg-card);border:1px solid var(--border-color);border-radius:12px;text-align:center;text-decoration:none;color:var(--text-primary);transition:all 0.3s ease;">' +
        '<div style="width:48px;height:48px;display:flex;align-items:center;justify-content:center;border-radius:12px;background:rgba(236,72,153,0.1);margin-bottom:12px;"><i class="fa-solid fa-clipboard-list" style="font-size:22px;color:#ec4899;"></i></div>' +
        '<strong style="font-size:14px;margin-bottom:4px;">MM 문의 정리</strong>' +
        '<span style="font-size:12px;color:var(--text-secondary);">MM FAQ 및 문의 정리</span>' +
      '</a>' +

      '</div>' +
      '<button class="quick-btn" id="shortcutBackHome" style="margin-top:20px;background:var(--bg-secondary);"><i class="fa-solid fa-arrow-left"></i> 목록으로</button>' +
    '</div>';

  const backBtn = document.getElementById('shortcutBackHome');
  if (backBtn) backBtn.addEventListener('click', function() { renderDefaultWelcomeCard(); });
}

// 업무지원 카드 표시 함수
function showWorkSupportCards() {
  const chatMessages = document.getElementById('chatMessages');
  if (!chatMessages) return;

  chatMessages.innerHTML =
    '<div class="welcome-card" style="max-width:800px;margin:0 auto;">' +
      '<div class="welcome-icon"><i class="fa-solid fa-briefcase"></i></div>' +
      '<h2>업무지원</h2>' +
      '<p>업무에 필요한 지원 서비스와 도구를 제공합니다.</p>' +
      '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:24px;">' +

      // 스마트워크 예약
      '<a href="https://srs.ktds.co.kr:8443/front/webFloor.do" target="_blank" rel="noopener noreferrer" style="display:flex;flex-direction:column;align-items:center;padding:24px 16px;background:var(--bg-card);border:1px solid var(--border-color);border-radius:12px;text-align:center;text-decoration:none;color:var(--text-primary);transition:all 0.3s ease;">' +
        '<div style="width:48px;height:48px;display:flex;align-items:center;justify-content:center;border-radius:12px;background:rgba(59,130,246,0.1);margin-bottom:12px;"><i class="fa-solid fa-computer" style="font-size:22px;color:#3B82F6;"></i></div>' +
        '<strong style="font-size:14px;margin-bottom:4px;">스마트워크 예약</strong>' +
        '<span style="font-size:12px;color:var(--text-secondary);">스마트워크 공간 예약</span>' +
      '</a>' +

      // 회의실 예약
      '<a href="https://srs.ktds.co.kr:8443/front/allFloorsMeeting.do" target="_blank" rel="noopener noreferrer" style="display:flex;flex-direction:column;align-items:center;padding:24px 16px;background:var(--bg-card);border:1px solid var(--border-color);border-radius:12px;text-align:center;text-decoration:none;color:var(--text-primary);transition:all 0.3s ease;">' +
        '<div style="width:48px;height:48px;display:flex;align-items:center;justify-content:center;border-radius:12px;background:rgba(236,72,153,0.1);margin-bottom:12px;"><i class="fa-solid fa-people-group" style="font-size:22px;color:#ec4899;"></i></div>' +
        '<strong style="font-size:14px;margin-bottom:4px;">회의실 예약</strong>' +
        '<span style="font-size:12px;color:var(--text-secondary);">회의실 예약 및 조회</span>' +
      '</a>' +

      // ds 나눔장터
      '<a href="https://ktdstu.com/gnuboard-gnuboard5-6416560/index.php" target="_blank" rel="noopener noreferrer" style="display:flex;flex-direction:column;align-items:center;padding:24px 16px;background:var(--bg-card);border:1px solid var(--border-color);border-radius:12px;text-align:center;text-decoration:none;color:var(--text-primary);transition:all 0.3s ease;">' +
        '<div style="width:48px;height:48px;display:flex;align-items:center;justify-content:center;border-radius:12px;background:rgba(226,0,42,0.1);margin-bottom:12px;"><i class="fa-solid fa-hand-holding-heart" style="font-size:22px;color:var(--kt-red);"></i></div>' +
        '<strong style="font-size:14px;margin-bottom:4px;">ds 나눔장터</strong>' +
        '<span style="font-size:12px;color:var(--text-secondary);">KT DS 나눔장터</span>' +
      '</a>' +

      '</div>' +
      '<button class="quick-btn" id="worksupportBackHome" style="margin-top:20px;background:var(--bg-secondary);"><i class="fa-solid fa-arrow-left"></i> 목록으로</button>' +
    '</div>';

  const backBtn = document.getElementById('worksupportBackHome');
  if (backBtn) backBtn.addEventListener('click', function() { renderDefaultWelcomeCard(); });
}

// 역량강화 카테고리 클릭 시 4 개 카드 표시
(function() {
  const categoryList = document.querySelector('.category-list');
  if (!categoryList) {
    console.warn('[app.js] category-list not found, skipping click handler');
    return;
  }
  categoryList.addEventListener('click', (e) => {
  // 1. 하위 메뉴 클릭 처리 (data-category가 있는 요소) - 우선순위 높음
  const item = e.target.closest('[data-category]');
  if (item) {
    const category = item.dataset.category;
    const action = item.dataset.action;
    
    // 역량강화/교육사이트/통합복무 클릭 시 이벤트 버블링 차단 (DOMContentLoaded 핸들러와 충돌 방지)
    if (category === 'capability' || category === 'education' || category === 'works' || category === 'shortcut' || category === 'worksupport') {
      e.stopPropagation();
    }
    
    // hide-chat 액션이 있는 경우 (공통업무)
    if (action === 'hide-chat') {
      const chatMessages = document.getElementById('chatMessages');
      if (chatMessages) {
        chatMessages.style.display = 'none';
        if (category === 'shortcut') {
          chatMessages.style.display = 'flex';
          chatMessages.innerHTML = 
            '<div class="welcome-card">' +
              '<div class="welcome-icon"><i class="fa-solid fa-users"></i></div>' +
              '<h2>공통 업무 시스템</h2>' +
              '<p>공통 업무와 관련된 문의는 아래 버튼을 클릭하거나 직접 질문해 주세요.</p>' +
              '<div class="quick-btns" style="display: flex; gap: 12px; flex-wrap: wrap; margin-top: 20px;">' +
                '<button class="quick-btn" data-msg="결재 시스템 알려줘"><i class="fa-solid fa-check-double"></i> 결재 시스템</button>' +
                '<button class="quick-btn" data-msg="문서 관리 방법"><i class="fa-solid fa-file"></i> 문서 관리</button>' +
                '<button class="quick-btn" data-msg="회의실 예약 방법"><i class="fa-solid fa-calendar-check"></i> 회의실 예약</button>' +
                '<button class="quick-btn" data-msg="내부 연락처 문의"><i class="fa-solid fa-address-book"></i> 연락처</button>' +
              '</div>' +
              '<button class="quick-btn" onclick="location.reload()" style="margin-top: 16px; background: var(--bg-secondary);"><i class="fa-solid fa-arrow-left"></i> 목록으로</button>' +
            '</div>';
          bindQuickButtons();
        }
      }
      return;
    }
    
    // 교육사이트 카테고리 처리
    if (category === 'education') {
      renderEducationSites();
      return;
    }

    // 역량강화 카테고리 처리
    if (category === 'capability') {
      // tree 메뉴 확장
      const treeItem = item.closest('.tree-item');
      if (treeItem && treeItem.querySelector('.tree-menu')) {
        treeItem.classList.add('open');
      }
      showCapabilityCards();
      return;
    }

    // 통합 복무 카테고리 처리
    if (category === 'works') {
      const treeItem = item.closest('.tree-item');
      if (treeItem && treeItem.querySelector('.tree-menu')) {
        treeItem.classList.add('open');
      }
      showWorksCards();
      return;
    }

    // 공통업무 카테고리 처리 (통합 복무 하위 메뉴)
    if (category === 'shortcut') {
      showShortcutCards();
      return;
    }

    // 업무지원 카테고리 처리 (통합 복무 하위 메뉴)
    if (category === 'worksupport') {
      showWorkSupportCards();
      return;
    }

    // Knowledge 카테고리 처리
    if (category === 'knowledge') {
      renderKnowledgeHome();
      return;
    }

    // 기타 카테고리 클릭 시 기본 동작
    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages) {
      chatMessages.style.display = 'flex';
    }
    return;
  }

  // 2. Tree 메뉴 토글 (역량강화 클릭 시 확장/축소) - 하위 메뉴가 아닌 경우만
  const treeTitle = e.target.closest('.tree-title');
  if (treeTitle) {
    const treeItem = treeTitle.closest('.tree-item');
    if (treeItem && treeItem.querySelector('.tree-menu')) {
      treeItem.classList.toggle('open');
      return;
    }
  }
  });
})();

// 역량강화 4 개 카드 표시 함수
function showCapabilityCards() {
  const chatMessages = document.getElementById("chatMessages");
  if (!chatMessages) return;
  
  chatMessages.innerHTML = 
    '<div class="welcome-card" style="max-width: 800px; margin: 0 auto;">' +
      '<div class="welcome-icon"><i class="fa-solid fa-graduation-cap"></i></div>' +
      '<h2>역량강화 프로그램</h2>' +
      '<p>KT DS 의 핵심 역량 강화 프로그램을 소개합니다.<br/>아래 4 가지 분야 중 관심 있는 분야를 선택해 주세요.</p>' +
      '<div class="capability-grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-top: 24px;">' +
        '<div class="capability-card" data-capability="rap" style="background: var(--bg-card); border: 2px solid var(--border-color); border-radius: 12px; padding: 24px; text-align: center; cursor: pointer; transition: all 0.3s ease;">' +
          '<div style="font-size: 48px; color: var(--kt-red); margin-bottom: 12px;"><i class="fa-solid fa-code"></i></div>' +
          '<h3 style="margin: 0 0 8px 0; color: var(--text-primary);">RAP</h3>' +
          '<p style="margin: 0; font-size: 13px; color: var(--text-secondary);">SAP RESTful Application Programming</p>' +
        '</div>' +
        '<div class="capability-card" data-capability="s4hana" style="background: var(--bg-card); border: 2px solid var(--border-color); border-radius: 12px; padding: 24px; text-align: center; cursor: pointer; transition: all 0.3s ease;">' +
          '<div style="font-size: 48px; color: var(--kt-blue); margin-bottom: 12px;"><i class="fa-solid fa-database"></i></div>' +
          '<h3 style="margin: 0 0 8px 0; color: var(--text-primary);">S/4HANA</h3>' +
          '<p style="margin: 0; font-size: 13px; color: var(--text-secondary);">SAP S/4HANA 개발 및 운영</p>' +
        '</div>' +
        '<div class="capability-card" data-capability="btp" style="background: var(--bg-card); border: 2px solid var(--border-color); border-radius: 12px; padding: 24px; text-align: center; cursor: pointer; transition: all 0.3s ease;">' +
          '<div style="font-size: 48px; color: var(--kt-green); margin-bottom: 12px;"><i class="fa-solid fa-cloud"></i></div>' +
          '<h3 style="margin: 0 0 8px 0; color: var(--text-primary);">BTP</h3>' +
          '<p style="margin: 0; font-size: 13px; color: var(--text-secondary);">SAP Business Technology Platform</p>' +
        '</div>' +
        '<div class="capability-card" data-capability="newabap" style="background: var(--bg-card); border: 2px solid var(--border-color); border-radius: 12px; padding: 24px; text-align: center; cursor: pointer; transition: all 0.3s ease;">' +
          '<div style="font-size: 48px; color: var(--kt-orange); margin-bottom: 12px;"><i class="fa-solid fa-laptop-code"></i></div>' +
          '<h3 style="margin: 0 0 8px 0; color: var(--text-primary);">NEW ABAP</h3>' +
          '<p style="margin: 0; font-size: 13px; color: var(--text-secondary);">최신 ABAP 개발 기법</p>' +
        '</div>' +
      '</div>' +
    '</div>';
  
  // 카드 클릭 이벤트 바인딩
  document.querySelectorAll('.capability-card').forEach(card => {
    card.addEventListener('click', function() {
      const capability = this.dataset.capability;
      let title = '';
      let icon = '';
      let color = '';
      
      if (capability === 'rap') {
        title = 'RAP (RESTful Application Programming)';
        icon = 'fa-code';
        color = 'var(--kt-red)';
      } else if (capability === 's4hana') {
        title = 'S/4HANA';
        icon = 'fa-database';
        color = 'var(--kt-blue)';
      } else if (capability === 'btp') {
        title = 'BTP (Business Technology Platform)';
        icon = 'fa-cloud';
        color = 'var(--kt-green)';
      } else if (capability === 'newabap') {
        title = 'NEW ABAP';
        icon = 'fa-laptop-code';
        color = 'var(--kt-orange)';
      }
      
      this.parentElement.parentElement.innerHTML = 
        '<div class="welcome-card">' +
          '<div class="welcome-icon"><i class="fa-solid ' + icon + '"></i></div>' +
          '<h2 style="color: ' + color + ';">' + title + ' 프로그램</h2>' +
          '<p><strong>' + title + '</strong>에 대한 자세한 정보를 안내해 드립니다.<br/>구체적인 질문을 입력해 주시면 더 자세히 안내해 드립니다.</p>' +
          '<div class="quick-btns" style="display: flex; gap: 12px; flex-wrap: wrap; margin-top: 20px;">' +
            '<button class="quick-btn" data-msg="' + title + ' 기초 교육 내용 알려줘"><i class="fa-solid fa-book"></i> 기초 교육</button>' +
            '<button class="quick-btn" data-msg="' + title + ' 심화 과정 알려줘"><i class="fa-solid fa-layer-group"></i> 심화 과정</button>' +
            '<button class="quick-btn" data-msg="' + title + ' 자격증 정보 알려줘"><i class="fa-solid fa-certificate"></i> 자격증</button>' +
            '<button class="quick-btn" data-msg="' + title + ' 실무 프로젝트 사례"><i class="fa-solid fa-briefcase"></i> 실무 사례</button>' +
          '</div>' +
          '<button class="quick-btn" id="backToCapabilityList" style="margin-top: 16px; background: var(--bg-secondary);"><i class="fa-solid fa-arrow-left"></i> 목록으로</button>' +
        '</div>';
      
      bindQuickButtons();
      
      // 목록으로 버튼 클릭 시 4 개 카드 복귀
      const backBtn = document.getElementById('backToCapabilityList');
      if (backBtn) {
        backBtn.addEventListener('click', function() {
          showCapabilityCards();
        });
      }
    });
  });
}

// BJH 추가 end

// 기본 Welcome Card 렌더링 (Knowledge, 교육사이트 등에서 목록으로 복귀 시 사용)
function renderDefaultWelcomeCard() {
  const chatMessages = document.getElementById('chatMessages');
  if (!chatMessages) return;

  chatMessages.innerHTML =
    '<div class="welcome-card">' +
'<div class="welcome-icon"><div class="ai-orb"></div></div>' +
'<h2>안녕하세요! STP AI Agent 입니다.</h2>' +
      '<p><strong>SAP MM</strong> 및 <strong>KT DS STP</strong> 업무 관련 문의사항을 자유롭게 질문해 주세요.<br/>구매 프로세스, 자재 관리, 신설법인 프로세스, 계정/권한 등 다양한 업무를 지원합니다.<br/>STP AI 에이전트가 실시간으로 정확한 답변을 제공합니다.</p>' +
      '<div class="quick-btns">' +
        '<button class="quick-btn" data-msg="SAP MM(Material Management) 모듈에 대해 알려주세요"><i class="fa-solid fa-cubes"></i> SAP MM 모듈</button>' +
        '<button class="quick-btn" data-msg="STP Table & T-code 알려주세요"><i class="fa-solid fa-table"></i> Table & T-code</button>' +
        '<button class="quick-btn" data-msg="신설법인 (Netcore, P&M) 프로세스 알려주세요"><i class="fa-solid fa-building-circle-arrow-right"></i> 신설법인 프로세스</button>' +
        '<button class="quick-btn" data-msg="STP에서 업무할 때 주로 사용하는 연계 시스템에 대해서 알려주세요"><i class="fa-solid fa-desktop"></i> 시스템</button>' +
        '<button class="quick-btn" data-msg="MM RFC & 배치에 대해 알려주세요"><i class="fa-solid fa-network-wired"></i> MM RFC & 배치</button>' +
        '<button class="quick-btn" data-msg="STP 운영 담당부서를 알려주세요"><i class="fa-solid fa-address-book"></i> 담당자 연락처</button>' +
      '</div>' +
    '</div>';

  bindQuickButtons();
}

// 교육사이트 화면 렌더링 (3개 사이트 통합)
function renderEducationSites() {
  const chatMessages = document.getElementById('chatMessages');
  if (!chatMessages) return;

  chatMessages.innerHTML =
    '<div class="welcome-card" style="max-width:800px;margin:0 auto;">' +
      '<div class="welcome-icon"><i class="fa-solid fa-graduation-cap"></i></div>' +
      '<h2>교육사이트</h2>' +
      '<p>아래 교육사이트에서 다양한 교육 과정을 수강할 수 있습니다.</p>' +
      '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:24px;">' +

      // 1. 교육과정 신청
      '<a href="https://hr.ktds.co.kr/" target="_blank" rel="noopener noreferrer" style="display:flex;flex-direction:column;align-items:center;padding:24px 16px;background:var(--bg-card);border:1px solid var(--border-color);border-radius:12px;text-align:center;text-decoration:none;color:var(--text-primary);transition:all 0.3s ease;">' +
        '<div style="width:48px;height:48px;display:flex;align-items:center;justify-content:center;border-radius:12px;background:rgba(37,99,235,0.1);margin-bottom:12px;"><i class="fa-solid fa-clipboard-list" style="font-size:22px;color:var(--kt-blue);"></i></div>' +
        '<strong style="font-size:14px;margin-bottom:4px;">교육과정 신청</strong>' +
        '<span style="font-size:12px;color:var(--text-secondary);">HR 포털에서 교육과정 신청</span>' +
      '</a>' +

      // 2. Udemy 교육
      '<a href="https://ktds.udemy.com/organization/home/" target="_blank" rel="noopener noreferrer" style="display:flex;flex-direction:column;align-items:center;padding:24px 16px;background:var(--bg-card);border:1px solid var(--border-color);border-radius:12px;text-align:center;text-decoration:none;color:var(--text-primary);transition:all 0.3s ease;">' +
        '<div style="width:48px;height:48px;display:flex;align-items:center;justify-content:center;border-radius:12px;background:rgba(226,0,42,0.1);margin-bottom:12px;"><i class="fa-solid fa-graduation-cap" style="font-size:22px;color:var(--kt-red);"></i></div>' +
        '<strong style="font-size:14px;margin-bottom:4px;">Udemy 교육</strong>' +
        '<span style="font-size:12px;color:var(--text-secondary);">KT DS Udemy 교육 과정</span>' +
      '</a>' +

      // 3. KT학습플랫폼 지니어스
      '<a href="https://ktedu.kt.com/main/portalMain.do" target="_blank" rel="noopener noreferrer" style="display:flex;flex-direction:column;align-items:center;padding:24px 16px;background:var(--bg-card);border:1px solid var(--border-color);border-radius:12px;text-align:center;text-decoration:none;color:var(--text-primary);transition:all 0.3s ease;">' +
        '<div style="width:48px;height:48px;display:flex;align-items:center;justify-content:center;border-radius:12px;background:rgba(16,185,129,0.1);margin-bottom:12px;"><i class="fa-solid fa-laptop-code" style="font-size:22px;color:var(--kt-green);"></i></div>' +
        '<strong style="font-size:14px;margin-bottom:4px;">KT학습플랫폼 지니어스</strong>' +
        '<span style="font-size:12px;color:var(--text-secondary);">KT 그룹 학습 플랫폼</span>' +
      '</a>' +

      '</div>' +
      '<button class="quick-btn" id="educationBackHome" style="margin-top:20px;background:var(--bg-secondary);"><i class="fa-solid fa-arrow-left"></i> 목록으로</button>' +
    '</div>';

  const backBtn = document.getElementById('educationBackHome');
  if (backBtn) backBtn.addEventListener('click', function() { renderDefaultWelcomeCard(); });
}

/* ============================================================
  KNOWLEDGE MODULE — Dataset API 연동
  ============================================================ */

// Dataset API 호출 헬퍼 (DIFY_API 패턴 동일 - 직접 호출)
async function datasetApiCall(path, options = {}) {
  // 백엔드 프록시 URL (현재 도메인/포트 사용)
  const proxyUrl = window.location.origin + '/api/knowledge' + path;
  const directUrl = DATASET_API.baseUrl + path;
  
  try {
    // 1차: 백엔드 프록시 시도
    const res = await fetch(proxyUrl, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });
    
    if (!res.ok) {
      const errText = await res.text();
      throw new Error('Dataset API ' + res.status + ': ' + errText);
    }
    return res.json();
  } catch (proxyErr) {
    // 2차: 프록시 실패 시 직접 호출 시도 (CORS 허용 시)
    try {
      const res = await fetch(directUrl, {
        ...options,
        headers: {
          'Authorization': 'Bearer ' + DATASET_API.apiKey,
          'User-Agent': 'STP-AI-Agent/1.0',
          'Content-Type': 'application/json',
          ...(options.headers || {})
        }
      });
      
      if (!res.ok) {
        const errText = await res.text();
        throw new Error('Dataset API ' + res.status + ': ' + errText);
      }
      return res.json();
    } catch (directErr) {
      // 둘 다 실패하면 프록시 오류 반환 (더 유용한 정보)
      throw proxyErr;
    }
  }
}

// ============================================================
// Dataset API 연동 함수들
// ============================================================

// 지식 목록 조회 (GET /datasets)
async function fetchKnowledgeList() {
  const data = await datasetApiCall('/datasets');
  return data.data || data.datasets || [];
}

// 지식 검색 (POST /datasets/retrieve) - ABCLab Knowledge API
async function fetchKnowledgeSearch(query) {
  const data = await datasetApiCall('/datasets/retrieve', {
    method: 'POST',
    body: JSON.stringify({
      dataset_id: DATASET_API.datasetId,
      query: query,
      retrieval_model: {
        search_method: 'hybrid_search',
        reranking_enable: true,
        reranking_model: {
          reranking_provider_name: 'abclab',
          reranking_model_name: 'BAAI/bge-reranker-v2-m3'
        },
        top_k: 10,
        score_threshold_enabled: true,
        score_threshold: 0.7
      }
    })
  });
  return data;
}

// 지식 생성 (POST /datasets)
async function createKnowledge(name, description) {
  const data = await datasetApiCall('/datasets', {
    method: 'POST',
    body: JSON.stringify({
      name: name,
      description: description || '',
      permission: 'all_team_members',
      retrieval_model: {
        search_method: 'semantic_search',
        top_k: 15,
        score_threshold_enabled: true,
        score_threshold: 0.7
      }
    })
  });
  return data;
}

// 지식 삭제 (DELETE /datasets/{dataset_id})
async function deleteKnowledge(datasetId) {
  const data = await datasetApiCall('/datasets/' + datasetId, {
    method: 'DELETE'
  });
  return data;
}

// 검색 설정 수정 (PATCH /datasets/{dataset_id}/retrieval-model)
async function updateRetrievalModel(datasetId, retrievalModel) {
  const data = await datasetApiCall('/datasets/' + datasetId + '/retrieval-model', {
    method: 'PATCH',
    body: JSON.stringify(retrievalModel)
  });
  return data;
}

// 문서 목록 조회 (GET /datasets/{dataset_id}/documents)
async function fetchDocumentList(datasetId) {
  const data = await datasetApiCall('/datasets/' + datasetId + '/documents');
  return data.data || data.documents || [];
}

// 텍스트로 문서 생성 (POST /datasets/{dataset_id}/document/create_by_text)
async function createDocumentByText(datasetId, name, text) {
  const data = await datasetApiCall('/datasets/' + datasetId + '/document/create_by_text', {
    method: 'POST',
    body: JSON.stringify({
      name: name,
      text: text,
      indexing_technique: 'high_quality',
      process_rule: {
        mode: 'automatic'
      }
    })
  });
  return data;
}

// 문서 삭제 (DELETE /datasets/{dataset_id}/documents/{document_id})
async function deleteDocument(datasetId, documentId) {
  const data = await datasetApiCall('/datasets/' + datasetId + '/documents/' + documentId, {
    method: 'DELETE'
  });
  return data;
}

// 청크 목록 조회 (GET /datasets/{dataset_id}/documents/{document_id}/segments)
async function fetchSegmentList(datasetId, documentId) {
  const data = await datasetApiCall('/datasets/' + datasetId + '/documents/' + documentId + '/segments');
  return data.data || data.segments || [];
}

// 청크 생성 (POST /datasets/{dataset_id}/documents/{document_id}/segments)
async function createSegment(datasetId, documentId, content) {
  const data = await datasetApiCall('/datasets/' + datasetId + '/documents/' + documentId + '/segments', {
    method: 'POST',
    body: JSON.stringify({
      content: content
    })
  });
  return data;
}

// 청크 삭제 (DELETE /datasets/{dataset_id}/documents/{document_id}/segments/{segment_id})
async function deleteSegment(datasetId, documentId, segmentId) {
  const data = await datasetApiCall('/datasets/' + datasetId + '/documents/' + documentId + '/segments/' + segmentId, {
    method: 'DELETE'
  });
  return data;
}

// 인덱싱 상태 조회 (GET /datasets/{dataset_id}/documents/{batch}/indexing-status)
async function fetchIndexingStatus(datasetId, batch) {
  const data = await datasetApiCall('/datasets/' + datasetId + '/documents/' + batch + '/indexing-status');
  return data;
}

// ============================================================
// Knowledge UI 렌더링 함수들
// ============================================================

// Knowledge 홈 화면 렌더링
function renderKnowledgeHome() {
  const chatMessages = document.getElementById('chatMessages');
  if (!chatMessages) return;

  chatMessages.innerHTML =
    '<div class="welcome-card" style="max-width:900px;margin:0 auto;">' +
      '<div class="welcome-icon"><i class="fa-solid fa-lightbulb"></i></div>' +
      '<h2>💡 STP AI Knowledge</h2>' +
      '<p>KT DS 특화 지식을 RAG + LLM 모델에 학습시켜 더 정확하고 유용한 답변을 제공합니다.<br/>아래에서 지식을 검색하거나 새로운 지식을 추가해 주세요.</p>' +
      '<div style="background:linear-gradient(135deg, rgba(226,0,42,0.1), rgba(226,0,42,0.05));border:1px solid var(--kt-red);border-radius:12px;padding:20px;margin-top:20px;">' +
        '<h3 style="margin:0 0 12px 0;color:var(--kt-red);"><i class="fa-solid fa-rocket"></i> AI 학습용 지식 추가하기</h3>' +
        '<p style="margin:0 0 16px 0;font-size:14px;line-height:1.7;">STP AI가 더 똑똑해지도록 AI 학습용 지식을 추가해 주세요.<br/>아래 링크에서 KT DS 특화 지식을 등록하면 AI가 학습하여 더 정확한 답변을 제공합니다.</p>' +
        '<a href="https://studio.abclab.ktds.com/dashboard/knowledge" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:12px 24px;background:var(--kt-red);color:#fff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;transition:all 0.3s ease;box-shadow:0 4px 12px rgba(226,0,42,0.3);">' +
          '<i class="fa-solid fa-external-link-alt"></i> Knowledge Studio 열기' +
        '</a>' +
      '</div>' +
      '<div class="knowledge-actions" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:20px;">' +
        '<button class="quick-btn" id="knowledgeSearchBtn" style="padding:16px;font-size:15px;">' +
          '<i class="fa-solid fa-magnifying-glass"></i> 지식 검색' +
        '</button>' +
        '<button class="quick-btn" id="knowledgeCreateBtn" style="padding:16px;font-size:15px;">' +
          '<i class="fa-solid fa-plus-circle"></i> 지식 추가' +
        '</button>' +
        '<button class="quick-btn" id="knowledgeListBtn" style="padding:16px;font-size:15px;">' +
          '<i class="fa-solid fa-list"></i> 지식 목록' +
        '</button>' +
        '<button class="quick-btn" id="knowledgeUpdateBtn" style="padding:16px;font-size:15px;">' +
          '<i class="fa-solid fa-pen-to-square"></i> 지식 수정' +
        '</button>' +
          '<button class="quick-btn" id="knowledgeStpAiBtn" style="padding:16px;font-size:15px;grid-column:1 / -1;background:linear-gradient(135deg, var(--kt-red), var(--kt-red-dark));color:#fff;">' +
          '<i class="fa-solid fa-brain"></i> STP AI Knowledge' +
        '</button>' +
      '</div>' +
    '</div>';

  // 버튼 바인딩
  const searchBtn = document.getElementById('knowledgeSearchBtn');
  if (searchBtn) searchBtn.addEventListener('click', function() { renderKnowledgeSearch(); });

  const createBtn = document.getElementById('knowledgeCreateBtn');
  if (createBtn) createBtn.addEventListener('click', function() { renderKnowledgeCreate(); });

  const listBtn = document.getElementById('knowledgeListBtn');
  if (listBtn) listBtn.addEventListener('click', function() { loadKnowledgeList(); });

  const updateBtn = document.getElementById('knowledgeUpdateBtn');
  if (updateBtn) updateBtn.addEventListener('click', function() { renderKnowledgeUpdate(); });

  const stpAiBtn = document.getElementById('knowledgeStpAiBtn');
  if (stpAiBtn) stpAiBtn.addEventListener('click', function() { loadStpAiKnowledge(); });
}

// ============================================================
// STP AI Knowledge - STP AI Dataset 문서 관리
// ============================================================

// STP AI Knowledge 홈 화면
function renderStpAiKnowledgeHome() {
  const chatMessages = document.getElementById('chatMessages');
  if (!chatMessages) return;

  chatMessages.innerHTML =
    '<div class="welcome-card" style="max-width:800px;margin:0 auto;">' +
      '<div class="welcome-icon" style="background:linear-gradient(135deg, var(--kt-red), var(--kt-red-dark));"><i class="fa-solid fa-brain"></i></div>' +
      '<h2>🧠 STP AI Knowledge</h2>' +
      '<p>STP AI가 학습하는 지식(Dataset)을 직접 관리할 수 있습니다.<br/>문서를 추가하거나 수정하면 AI가 더 정확한 답변을 제공합니다.</p>' +
      '<div style="background:linear-gradient(135deg, rgba(226,0,42,0.1), rgba(194,24,91,0.05));border:1px solid var(--kt-red);border-radius:12px;padding:16px;margin-top:16px;">' +
        '<div style="display:flex;align-items:center;gap:10px;">' +
          '<i class="fa-solid fa-database" style="font-size:24px;color:var(--kt-red);"></i>' +
          '<div>' +
            '<strong style="color:var(--text-primary);">STP AI Dataset</strong><br/>' +
            '<span style="font-size:12px;color:var(--text-secondary);">ID: ' + DATASET_API.datasetId + '</span>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:20px;">' +
        '<button class="quick-btn" id="stpAiDocListBtn" style="padding:16px;font-size:15px;">' +
          '<i class="fa-solid fa-file-lines"></i> 문서 목록' +
        '</button>' +
        '<button class="quick-btn" id="stpAiDocCreateBtn" style="padding:16px;font-size:15px;">' +
          '<i class="fa-solid fa-plus-circle"></i> 문서 추가' +
        '</button>' +
        '<button class="quick-btn" id="stpAiSearchBtn" style="padding:16px;font-size:15px;grid-column:1 / -1;">' +
          '<i class="fa-solid fa-magnifying-glass"></i> 지식 검색' +
        '</button>' +
      '</div>' +
      '<button class="quick-btn" id="knowledgeBackHome" style="margin-top:16px;background:var(--bg-secondary);"><i class="fa-solid fa-arrow-left"></i> Knowledge 홈으로</button>' +
    '</div>';

  document.getElementById('stpAiDocListBtn').addEventListener('click', function() {
    loadDocumentListForStpAi();
  });
  document.getElementById('stpAiDocCreateBtn').addEventListener('click', function() {
    renderDocumentCreateForStpAi();
  });
  document.getElementById('stpAiSearchBtn').addEventListener('click', function() {
    renderKnowledgeSearch();
  });
  document.getElementById('knowledgeBackHome').addEventListener('click', function() {
    renderKnowledgeHome();
  });
}

// STP AI Knowledge 진입점
function loadStpAiKnowledge() {
  renderStpAiKnowledgeHome();
}

// STP AI Dataset 문서 목록 로드
async function loadDocumentListForStpAi() {
  const chatMessages = document.getElementById('chatMessages');
  if (!chatMessages) return;

  chatMessages.innerHTML =
    '<div class="welcome-card" style="max-width:800px;margin:0 auto;">' +
      '<div class="welcome-icon"><i class="fa-solid fa-file-lines"></i></div>' +
      '<h2>📄 STP AI 문서 목록</h2>' +
      '<p>STP AI Dataset 에 등록된 문서 목록입니다.</p>' +
      '<div id="documentListResults" style="margin-top:20px;text-align:left;">' +
        '<div style="text-align:center;padding:20px;"><i class="fa-solid fa-spinner fa-spin" style="font-size:24px;color:var(--kt-red);"></i><br/><span style="color:var(--text-secondary);">로딩 중...</span></div>' +
      '</div>' +
      '<div style="display:flex;gap:10px;margin-top:16px;">' +
        '<button class="quick-btn" id="documentCreateBtn" style="padding:12px 24px;"><i class="fa-solid fa-plus"></i> 문서 추가</button>' +
        '<button class="quick-btn" id="documentBackBtn" style="padding:12px 24px;background:var(--bg-secondary);"><i class="fa-solid fa-arrow-left"></i> STP AI Knowledge</button>' +
      '</div>' +
    '</div>';

  document.getElementById('documentBackBtn').addEventListener('click', function() { renderStpAiKnowledgeHome(); });
  document.getElementById('documentCreateBtn').addEventListener('click', function() { renderDocumentCreateForStpAi(); });

  try {
    const documents = await fetchDocumentList(DATASET_API.datasetId);
    const resultsDiv = document.getElementById('documentListResults');

    if (!documents || documents.length === 0) {
      resultsDiv.innerHTML = '<div style="text-align:center;padding:30px;background:var(--bg-secondary);border-radius:12px;"><i class="fa-solid fa-folder-open" style="font-size:36px;color:var(--text-secondary);margin-bottom:12px;"></i><br/><strong>등록된 문서가 없습니다</strong><br/><span style="font-size:13px;color:var(--text-secondary);">새로운 문서를 추가해 주세요.</span></div>';
      return;
    }

    let html = '<div style="margin-bottom:12px;color:var(--text-secondary);font-size:13px;"><i class="fa-solid fa-check-circle" style="color:var(--kt-green);"></i> ' + documents.length + ' 개의 문서가 등록되어 있습니다.</div>';

    documents.forEach(function(doc, i) {
      const name = doc.name || '제목 없음';
      const id = doc.id || '';
      const status = doc.indexing_status || doc.status || '';
      const created = doc.created_at ? new Date(doc.created_at * 1000).toLocaleDateString('ko-KR') : '';

      html += '<div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:10px;padding:16px;margin-bottom:12px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
          '<strong style="color:var(--kt-red);"><i class="fa-solid fa-file-lines"></i> ' + escapeHtml(name) + '</strong>' +
          '<span style="font-size:11px;color:var(--text-secondary);">' + escapeHtml(status) + '</span>' +
        '</div>' +
        '<div style="font-size:11px;color:var(--text-secondary);">ID: ' + escapeHtml(id) + (created ? ' · 등록일: ' + created : '') + '</div>' +
        '<div style="margin-top:10px;display:flex;gap:8px;">' +
          '<button class="quick-btn document-segments-btn" data-dataset-id="' + escapeHtml(DATASET_API.datasetId) + '" data-document-id="' + escapeHtml(id) + '" style="padding:6px 14px;font-size:12px;"><i class="fa-solid fa-layer-group"></i> 청크 보기</button>' +
          '<button class="quick-btn document-delete-btn" data-dataset-id="' + escapeHtml(DATASET_API.datasetId) + '" data-document-id="' + escapeHtml(id) + '" style="padding:6px 14px;font-size:12px;background:var(--bg-secondary);"><i class="fa-solid fa-trash"></i> 삭제</button>' +
        '</div>' +
      '</div>';
    });

    resultsDiv.innerHTML = html;

    // 청크 보기 버튼 바인딩
    resultsDiv.querySelectorAll('.document-segments-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        const dsId = this.dataset.datasetId;
        const docId = this.dataset.documentId;
        loadSegmentListForStpAi(dsId, docId);
      });
    });

    // 문서 삭제 버튼 바인딩
    resultsDiv.querySelectorAll('.document-delete-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        const dsId = this.dataset.datasetId;
        const docId = this.dataset.documentId;
        executeDeleteDocumentForStpAi(dsId, docId);
      });
    });

  } catch (err) {
    const resultsDiv = document.getElementById('documentListResults');
    resultsDiv.innerHTML = '<div style="text-align:center;padding:20px;background:var(--bg-secondary);border-radius:12px;color:var(--kt-red);"><i class="fa-solid fa-triangle-exclamation"></i> 목록 조회 오류: ' + escapeHtml(err.message) + '</div>';
  }
}

// STP AI Dataset 문서 생성 화면
function renderDocumentCreateForStpAi() {
  const chatMessages = document.getElementById('chatMessages');
  if (!chatMessages) return;

  chatMessages.innerHTML =
    '<div class="welcome-card" style="max-width:700px;margin:0 auto;">' +
      '<div class="welcome-icon"><i class="fa-solid fa-plus-circle"></i></div>' +
      '<h2>📝 STP AI 문서 추가</h2>' +
      '<p>텍스트로 새로운 문서를 생성해 STP AI Dataset 에 추가해 주세요.</p>' +
      '<div style="margin-top:20px;">' +
        '<label style="display:block;margin-bottom:6px;font-size:13px;font-weight:600;color:var(--text-primary);">문서 이름 *</label>' +
        '<input type="text" id="documentNameInput" placeholder="예: STP 구매 프로세스 가이드" style="width:100%;padding:12px 16px;border:1px solid var(--border-color);border-radius:8px;font-size:14px;background:var(--bg-card);color:var(--text-primary);box-sizing:border-box;margin-bottom:16px;"/>' +
        '<label style="display:block;margin-bottom:6px;font-size:13px;font-weight:600;color:var(--text-primary);">문서 내용 *</label>' +
        '<textarea id="documentTextInput" placeholder="문서 내용을 입력하세요..." rows="10" style="width:100%;padding:12px 16px;border:1px solid var(--border-color);border-radius:8px;font-size:14px;background:var(--bg-card);color:var(--text-primary);box-sizing:border-box;resize:vertical;margin-bottom:20px;"></textarea>' +
      '</div>' +
      '<div style="display:flex;gap:10px;">' +
        '<button class="quick-btn" id="documentCreateGoBtn" style="padding:12px 24px;"><i class="fa-solid fa-plus"></i> 생성하기</button>' +
        '<button class="quick-btn" id="documentBackBtn" style="padding:12px 24px;background:var(--bg-secondary);"><i class="fa-solid fa-arrow-left"></i> 취소</button>' +
      '</div>' +
      '<div id="documentCreateResult" style="margin-top:16px;"></div>' +
    '</div>';

  document.getElementById('documentCreateGoBtn').addEventListener('click', function() {
    const name = document.getElementById('documentNameInput').value.trim();
    const text = document.getElementById('documentTextInput').value.trim();
    if (!name || !text) {
      document.getElementById('documentCreateResult').innerHTML = '<div style="color:var(--kt-red);font-size:13px;"><i class="fa-solid fa-circle-exclamation"></i> 문서 이름과 내용을 입력해 주세요.</div>';
      return;
    }
    executeDocumentCreateForStpAi(name, text);
  });

  document.getElementById('documentBackBtn').addEventListener('click', function() { loadDocumentListForStpAi(); });
  document.getElementById('documentNameInput').focus();
}

// STP AI Dataset 문서 생성 실행
async function executeDocumentCreateForStpAi(name, text) {
  const resultDiv = document.getElementById('documentCreateResult');
  resultDiv.innerHTML = '<div style="text-align:center;padding:16px;"><i class="fa-solid fa-spinner fa-spin" style="font-size:20px;color:var(--kt-red);"></i><br/><span style="color:var(--text-secondary);">생성 중...</span></div>';

  try {
    const data = await createDocumentByText(DATASET_API.datasetId, name, text);
    const id = data.id || data.document_id || '';
    resultDiv.innerHTML = '<div style="text-align:center;padding:16px;background:rgba(16,185,129,0.1);border-radius:8px;color:var(--kt-green);"><i class="fa-solid fa-check-circle"></i> 문서가 성공적으로 생성되었습니다!<br/><span style="font-size:12px;">ID: ' + escapeHtml(id) + '</span></div>';

    setTimeout(function() {
      loadDocumentListForStpAi();
    }, 1500);
  } catch (err) {
    resultDiv.innerHTML = '<div style="text-align:center;padding:16px;background:var(--bg-secondary);border-radius:8px;color:var(--kt-red);"><i class="fa-solid fa-triangle-exclamation"></i> 생성 오류: ' + escapeHtml(err.message) + '</div>';
  }
}

// STP AI Dataset 문서 삭제 실행
async function executeDeleteDocumentForStpAi(datasetId, documentId) {
  if (!confirm('정말 이 문서를 삭제하시겠습니까?')) return;

  try {
    await deleteDocument(datasetId, documentId);
    showToast('문서가 성공적으로 삭제되었습니다.', 'success');
    loadDocumentListForStpAi();
  } catch (err) {
    showToast('삭제 오류: ' + err.message, 'error');
  }
}

// STP AI Dataset 청크 목록 로드
async function loadSegmentListForStpAi(datasetId, documentId) {
  const chatMessages = document.getElementById('chatMessages');
  if (!chatMessages) return;

  chatMessages.innerHTML =
    '<div class="welcome-card" style="max-width:800px;margin:0 auto;">' +
      '<div class="welcome-icon"><i class="fa-solid fa-layer-group"></i></div>' +
      '<h2>📦 청크 목록</h2>' +
      '<p>문서의 청크(Segment) 목록입니다.</p>' +
      '<div id="segmentListResults" style="margin-top:20px;text-align:left;">' +
        '<div style="text-align:center;padding:20px;"><i class="fa-solid fa-spinner fa-spin" style="font-size:24px;color:var(--kt-red);"></i><br/><span style="color:var(--text-secondary);">로딩 중...</span></div>' +
      '</div>' +
      '<div style="display:flex;gap:10px;margin-top:16px;">' +
        '<button class="quick-btn" id="segmentBackBtn" style="padding:12px 24px;background:var(--bg-secondary);"><i class="fa-solid fa-arrow-left"></i> 문서 목록으로</button>' +
      '</div>' +
    '</div>';

  document.getElementById('segmentBackBtn').addEventListener('click', function() { loadDocumentListForStpAi(); });

  try {
    const segments = await fetchSegmentList(datasetId, documentId);
    const resultsDiv = document.getElementById('segmentListResults');

    if (!segments || segments.length === 0) {
      resultsDiv.innerHTML = '<div style="text-align:center;padding:30px;background:var(--bg-secondary);border-radius:12px;"><i class="fa-solid fa-folder-open" style="font-size:36px;color:var(--text-secondary);margin-bottom:12px;"></i><br/><strong>청크가 없습니다</strong></div>';
      return;
    }

    let html = '<div style="margin-bottom:12px;color:var(--text-secondary);font-size:13px;"><i class="fa-solid fa-check-circle" style="color:var(--kt-green);"></i> ' + segments.length + ' 개의 청크가 있습니다.</div>';

    segments.forEach(function(seg, i) {
      const content = seg.content || '내용 없음';
      const id = seg.id || '';

      html += '<div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:10px;padding:16px;margin-bottom:12px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
          '<strong style="color:var(--kt-red);">청크 #' + (i + 1) + '</strong>' +
          '<span style="font-size:11px;color:var(--text-secondary);">ID: ' + escapeHtml(id) + '</span>' +
        '</div>' +
        '<div style="font-size:13px;line-height:1.7;color:var(--text-primary);white-space:pre-wrap;">' + escapeHtml(content).substring(0, 500) + '</div>' +
      '</div>';
    });

    resultsDiv.innerHTML = html;
  } catch (err) {
    const resultsDiv = document.getElementById('segmentListResults');
    resultsDiv.innerHTML = '<div style="text-align:center;padding:20px;background:var(--bg-secondary);border-radius:12px;color:var(--kt-red);"><i class="fa-solid fa-triangle-exclamation"></i> 조회 오류: ' + escapeHtml(err.message) + '</div>';
  }
}

// 지식 검색 화면
function renderKnowledgeSearch() {
  const chatMessages = document.getElementById('chatMessages');
  if (!chatMessages) return;

  chatMessages.innerHTML =
    '<div class="welcome-card" style="max-width:800px;margin:0 auto;">' +
      '<div class="welcome-icon"><i class="fa-solid fa-magnifying-glass"></i></div>' +
      '<h2>지식 검색</h2>' +
      '<p>STP AI Knowledge Base 에서 원하는 지식을 검색해 보세요.</p>' +
      '<div style="display:flex;gap:10px;margin-top:20px;">' +
        '<input type="text" id="knowledgeSearchInput" placeholder="검색어를 입력하세요..." style="flex:1;padding:12px 16px;border:1px solid var(--border-color);border-radius:8px;font-size:14px;background:var(--bg-card);color:var(--text-primary);"/>' +
        '<button class="quick-btn" id="knowledgeSearchGoBtn" style="padding:12px 24px;white-space:nowrap;"><i class="fa-solid fa-search"></i> 검색</button>' +
      '</div>' +
      '<div id="knowledgeSearchResults" style="margin-top:20px;text-align:left;"></div>' +
      '<button class="quick-btn" id="knowledgeBackHome" style="margin-top:16px;background:var(--bg-secondary);"><i class="fa-solid fa-arrow-left"></i> 목록으로</button>' +
    '</div>';

  document.getElementById('knowledgeSearchGoBtn').addEventListener('click', function() {
    const query = document.getElementById('knowledgeSearchInput').value.trim();
    if (query) executeKnowledgeSearch(query);
  });

  const input = document.getElementById('knowledgeSearchInput');
  if (input) {
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        const query = input.value.trim();
        if (query) executeKnowledgeSearch(query);
      }
    });
  }

  const backBtn = document.getElementById('knowledgeBackHome');
  if (backBtn) backBtn.addEventListener('click', function() { renderKnowledgeHome(); });

  input.focus();
}

// 지식 검색 실행
async function executeKnowledgeSearch(query) {
  const resultsDiv = document.getElementById('knowledgeSearchResults');
  resultsDiv.innerHTML = '<div style="text-align:center;padding:20px;"><i class="fa-solid fa-spinner fa-spin" style="font-size:24px;color:var(--kt-red);"></i><br/><span style="color:var(--text-secondary);">검색 중...</span></div>';

  try {
    const data = await fetchKnowledgeSearch(query);

    // ABCLab Knowledge API 응답 파싱: { records: [{ score, segment: { content } }] }
    let docs = [];
    if (data.records && Array.isArray(data.records)) {
      docs = data.records.map(function(r) {
        return {
          content: r.segment?.content || '',
          score: r.score || 0,
          source: r.segment?.metadata?.source || ''
        };
      });
    } else if (data.docs) {
      docs = data.docs;
    } else if (data.data) {
      docs = data.data;
    }

    if (docs.length === 0) {
      resultsDiv.innerHTML = '<div style="text-align:center;padding:30px;background:var(--bg-secondary);border-radius:12px;"><i class="fa-solid fa-folder-open" style="font-size:36px;color:var(--text-secondary);margin-bottom:12px;"></i><br/><strong>검색 결과가 없습니다</strong><br/><span style="font-size:13px;color:var(--text-secondary);">"' + escapeHtml(query) + '" 에 대한 지식이 아직 등록되지 않았습니다.</span></div>';
      return;
    }

    let html = '<div style="margin-bottom:12px;color:var(--text-secondary);font-size:13px;"><i class="fa-solid fa-check-circle" style="color:var(--kt-green);"></i> ' + docs.length + ' 개의 지식 항목을 찾았습니다.</div>';

    docs.forEach(function(doc, i) {
      const content = doc.content || doc.page_content || doc.text || '내용 없음';
      const source = doc.source || doc.metadata?.source || '';
      const score = doc.score !== undefined ? ' (관련도: ' + (doc.score * 100).toFixed(1) + '%)' : '';

      html += '<div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:10px;padding:16px;margin-bottom:12px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
          '<strong style="color:var(--kt-red);"><i class="fa-solid fa-file-lines"></i> 지식 #' + (i + 1) + score + '</strong>' +
          (source ? '<span style="font-size:11px;color:var(--text-secondary);background:var(--bg-secondary);padding:2px 8px;border-radius:4px;">' + escapeHtml(source) + '</span>' : '') +
        '</div>' +
        '<div style="font-size:13px;line-height:1.7;color:var(--text-primary);white-space:pre-wrap;">' + escapeHtml(content).substring(0, 1000) + '</div>' +
      '</div>';
    });

    resultsDiv.innerHTML = html;
  } catch (err) {
    console.error('[Knowledge Search Error]', err);
    let errorMsg = err.message;
    // 백엔드에서 반환한 상세 오류 정보 파싱
    try {
      const errData = JSON.parse(err.message);
      if (errData.full_error) {
        const backendErr = JSON.parse(errData.full_error);
        errorMsg = (backendErr.message || backendErr.error || err.message);
      }
    } catch(e) {}
    resultsDiv.innerHTML = '<div style="text-align:center;padding:20px;background:var(--bg-secondary);border-radius:12px;color:var(--kt-red);"><i class="fa-solid fa-triangle-exclamation"></i> 검색 오류: ' + escapeHtml(errorMsg) + '<br/><span style="font-size:12px;color:var(--text-secondary);">백엔드 로그를 확인하세요.</span></div>';
  }
}

// 지식 목록 로드
async function loadKnowledgeList() {
  const chatMessages = document.getElementById('chatMessages');
  if (!chatMessages) return;

  chatMessages.innerHTML =
    '<div class="welcome-card" style="max-width:800px;margin:0 auto;">' +
      '<div class="welcome-icon"><i class="fa-solid fa-list"></i></div>' +
      '<h2>지식 목록</h2>' +
      '<p>등록된 모든 지식(Dataset) 목록입니다.</p>' +
      '<div id="knowledgeListResults" style="margin-top:20px;text-align:left;">' +
        '<div style="text-align:center;padding:20px;"><i class="fa-solid fa-spinner fa-spin" style="font-size:24px;color:var(--kt-red);"></i><br/><span style="color:var(--text-secondary);">로딩 중...</span></div>' +
      '</div>' +
      '<button class="quick-btn" id="knowledgeBackHome" style="margin-top:16px;background:var(--bg-secondary);"><i class="fa-solid fa-arrow-left"></i> 목록으로</button>' +
    '</div>';

  const backBtn = document.getElementById('knowledgeBackHome');
  if (backBtn) backBtn.addEventListener('click', function() { renderKnowledgeHome(); });

  try {
    const datasets = await fetchKnowledgeList();
    const resultsDiv = document.getElementById('knowledgeListResults');

    if (!datasets || datasets.length === 0) {
      resultsDiv.innerHTML = '<div style="text-align:center;padding:30px;background:var(--bg-secondary);border-radius:12px;"><i class="fa-solid fa-database" style="font-size:36px;color:var(--text-secondary);margin-bottom:12px;"></i><br/><strong>등록된 지식이 없습니다</strong><br/><span style="font-size:13px;color:var(--text-secondary);">새로운 지식을 추가해 주세요.</span></div>';
      return;
    }

    let html = '<div style="margin-bottom:12px;color:var(--text-secondary);font-size:13px;"><i class="fa-solid fa-check-circle" style="color:var(--kt-green);"></i> ' + datasets.length + ' 개의 지식 항목이 등록되어 있습니다.</div>';

    datasets.forEach(function(ds, i) {
      const name = ds.name || '제목 없음';
      const desc = ds.description || '';
      const id = ds.id || '';
      const status = ds.indexing_status || ds.status || '';
      const created = ds.created_at ? new Date(ds.created_at * 1000).toLocaleDateString('ko-KR') : '';

      html += '<div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:10px;padding:16px;margin-bottom:12px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
          '<strong style="color:var(--kt-red);"><i class="fa-solid fa-database"></i> ' + escapeHtml(name) + '</strong>' +
          '<span style="font-size:11px;color:var(--text-secondary);">' + escapeHtml(status) + '</span>' +
        '</div>' +
        (desc ? '<div style="font-size:13px;color:var(--text-secondary);margin-bottom:6px;">' + escapeHtml(desc) + '</div>' : '') +
        '<div style="font-size:11px;color:var(--text-secondary);">ID: ' + escapeHtml(id) + (created ? ' · 등록일: ' + created : '') + '</div>' +
        '<div style="margin-top:10px;display:flex;gap:8px;">' +
          '<button class="quick-btn knowledge-docs-btn" data-dataset-id="' + escapeHtml(id) + '" style="padding:6px 14px;font-size:12px;"><i class="fa-solid fa-file-lines"></i> 문서 보기</button>' +
        '</div>' +
      '</div>';
    });

    resultsDiv.innerHTML = html;

    // 문서 보기 버튼 바인딩
    resultsDiv.querySelectorAll('.knowledge-docs-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        const datasetId = this.dataset.datasetId;
        loadDocumentList(datasetId);
      });
    });


  } catch (err) {
    const resultsDiv = document.getElementById('knowledgeListResults');
    resultsDiv.innerHTML = '<div style="text-align:center;padding:20px;background:var(--bg-secondary);border-radius:12px;color:var(--kt-red);"><i class="fa-solid fa-triangle-exclamation"></i> 목록 조회 오류: ' + escapeHtml(err.message) + '</div>';
  }
}

// 지식 추가 화면
function renderKnowledgeCreate() {
  const chatMessages = document.getElementById('chatMessages');
  if (!chatMessages) return;

  chatMessages.innerHTML =
    '<div class="welcome-card" style="max-width:700px;margin:0 auto;">' +
      '<div class="welcome-icon"><i class="fa-solid fa-plus-circle"></i></div>' +
      '<h2>새 지식 추가</h2>' +
      '<p>새로운 지식(Dataset)을 생성해 STP AI 에 학습시켜 주세요.</p>' +
      '<div style="margin-top:20px;">' +
        '<label style="display:block;margin-bottom:6px;font-size:13px;font-weight:600;color:var(--text-primary);">지식 이름 *</label>' +
        '<input type="text" id="knowledgeNameInput" placeholder="예: STP 구매 프로세스 가이드" style="width:100%;padding:12px 16px;border:1px solid var(--border-color);border-radius:8px;font-size:14px;background:var(--bg-card);color:var(--text-primary);box-sizing:border-box;margin-bottom:16px;"/>' +
        '<label style="display:block;margin-bottom:6px;font-size:13px;font-weight:600;color:var(--text-primary);">설명</label>' +
        '<textarea id="knowledgeDescInput" placeholder="지식에 대한 설명을 입력하세요..." rows="4" style="width:100%;padding:12px 16px;border:1px solid var(--border-color);border-radius:8px;font-size:14px;background:var(--bg-card);color:var(--text-primary);box-sizing:border-box;resize:vertical;margin-bottom:20px;"></textarea>' +
      '</div>' +
      '<div style="display:flex;gap:10px;">' +
        '<button class="quick-btn" id="knowledgeCreateGoBtn" style="padding:12px 24px;"><i class="fa-solid fa-plus"></i> 생성하기</button>' +
        '<button class="quick-btn" id="knowledgeBackHome" style="padding:12px 24px;background:var(--bg-secondary);"><i class="fa-solid fa-arrow-left"></i> 취소</button>' +
      '</div>' +
      '<div id="knowledgeCreateResult" style="margin-top:16px;"></div>' +
    '</div>';

  document.getElementById('knowledgeCreateGoBtn').addEventListener('click', function() {
    const name = document.getElementById('knowledgeNameInput').value.trim();
    const desc = document.getElementById('knowledgeDescInput').value.trim();
    if (!name) {
      document.getElementById('knowledgeCreateResult').innerHTML = '<div style="color:var(--kt-red);font-size:13px;"><i class="fa-solid fa-circle-exclamation"></i> 지식 이름을 입력해 주세요.</div>';
      return;
    }
    executeKnowledgeCreate(name, desc);
  });

  const backBtn = document.getElementById('knowledgeBackHome');
  if (backBtn) backBtn.addEventListener('click', function() { renderKnowledgeHome(); });

  document.getElementById('knowledgeNameInput').focus();
}

// 지식 생성 실행
async function executeKnowledgeCreate(name, desc) {
  const resultDiv = document.getElementById('knowledgeCreateResult');
  resultDiv.innerHTML = '<div style="text-align:center;padding:16px;"><i class="fa-solid fa-spinner fa-spin" style="font-size:20px;color:var(--kt-red);"></i><br/><span style="color:var(--text-secondary);">생성 중...</span></div>';

  try {
    const data = await createKnowledge(name, desc);
    const id = data.id || data.dataset_id || '';
    resultDiv.innerHTML =
      '<div style="background:var(--bg-card);border:1px solid var(--kt-green);border-radius:10px;padding:16px;text-align:center;">' +
        '<i class="fa-solid fa-circle-check" style="font-size:28px;color:var(--kt-green);margin-bottom:8px;"></i><br/>' +
        '<strong style="color:var(--kt-green);">지식 생성 완료!</strong><br/>' +
        '<span style="font-size:13px;color:var(--text-secondary);">ID: ' + escapeHtml(id) + '</span><br/>' +
        '<span style="font-size:12px;color:var(--text-secondary);">이제 파일 업로드 또는 텍스트 입력으로 지식을 채워주세요.</span>' +
      '</div>';
  } catch (err) {
    resultDiv.innerHTML = '<div style="color:var(--kt-red);font-size:13px;"><i class="fa-solid fa-triangle-exclamation"></i> 생성 오류: ' + escapeHtml(err.message) + '</div>';
  }
}

// 지식 수정 화면
function renderKnowledgeUpdate() {
  const chatMessages = document.getElementById('chatMessages');
  if (!chatMessages) return;

  chatMessages.innerHTML =
    '<div class="welcome-card" style="max-width:800px;margin:0 auto;">' +
      '<div class="welcome-icon"><i class="fa-solid fa-pen-to-square"></i></div>' +
      '<h2>지식 수정</h2>' +
      '<p>기존 지식의 검색 설정을 수정하거나 내용을 업데이트할 수 있습니다.</p>' +
      '<div style="margin-top:20px;">' +
        '<label style="display:block;margin-bottom:6px;font-size:13px;font-weight:600;color:var(--text-primary);">검색어 기반 지식 조회</label>' +
        '<div style="display:flex;gap:10px;">' +
          '<input type="text" id="knowledgeUpdateQuery" placeholder="수정할 지식을 검색하세요..." style="flex:1;padding:12px 16px;border:1px solid var(--border-color);border-radius:8px;font-size:14px;background:var(--bg-card);color:var(--text-primary);"/>' +
          '<button class="quick-btn" id="knowledgeUpdateSearchBtn" style="padding:12px 20px;white-space:nowrap;"><i class="fa-solid fa-search"></i> 조회</button>' +
        '</div>' +
      '</div>' +
      '<div id="knowledgeUpdateResults" style="margin-top:20px;text-align:left;"></div>' +
      '<button class="quick-btn" id="knowledgeBackHome" style="margin-top:16px;background:var(--bg-secondary);"><i class="fa-solid fa-arrow-left"></i> 목록으로</button>' +
    '</div>';

  document.getElementById('knowledgeUpdateSearchBtn').addEventListener('click', function() {
    const query = document.getElementById('knowledgeUpdateQuery').value.trim();
    if (query) executeKnowledgeSearchForUpdate(query);
  });

  const input = document.getElementById('knowledgeUpdateQuery');
  if (input) {
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        const query = input.value.trim();
        if (query) executeKnowledgeSearchForUpdate(query);
      }
    });
  }

  const backBtn = document.getElementById('knowledgeBackHome');
  if (backBtn) backBtn.addEventListener('click', function() { renderKnowledgeHome(); });

  input.focus();
}

// 지식 수정용 검색 실행
async function executeKnowledgeSearchForUpdate(query) {
  const resultsDiv = document.getElementById('knowledgeUpdateResults');
  resultsDiv.innerHTML = '<div style="text-align:center;padding:20px;"><i class="fa-solid fa-spinner fa-spin" style="font-size:24px;color:var(--kt-red);"></i><br/><span style="color:var(--text-secondary);">조회 중...</span></div>';

  try {
    const data = await fetchKnowledgeSearch(query);
    const docs = data.docs || data.data || [];

    if (docs.length === 0) {
      resultsDiv.innerHTML = '<div style="text-align:center;padding:30px;background:var(--bg-secondary);border-radius:12px;"><i class="fa-solid fa-folder-open" style="font-size:36px;color:var(--text-secondary);margin-bottom:12px;"></i><br/><strong>검색 결과가 없습니다</strong></div>';
      return;
    }

    let html = '<div style="margin-bottom:12px;color:var(--text-secondary);font-size:13px;"><i class="fa-solid fa-check-circle" style="color:var(--kt-green);"></i> ' + docs.length + ' 개의 지식 항목을 찾았습니다.</div>';

    docs.forEach(function(doc, i) {
      const content = doc.content || doc.page_content || doc.text || '내용 없음';
      const docId = doc.id || doc.document_id || '';

      html += '<div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:10px;padding:16px;margin-bottom:12px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
          '<strong style="color:var(--kt-red);"><i class="fa-solid fa-file-lines"></i> 지식 #' + (i + 1) + '</strong>' +
          '<span style="font-size:11px;color:var(--text-secondary);">ID: ' + escapeHtml(docId) + '</span>' +
        '</div>' +
        '<div style="font-size:13px;line-height:1.7;color:var(--text-primary);white-space:pre-wrap;margin-bottom:10px;">' + escapeHtml(content).substring(0, 800) + '</div>' +
        '<div style="display:flex;gap:8px;">' +
          '<button class="quick-btn knowledge-edit-btn" data-doc-id="' + escapeHtml(docId) + '" style="padding:6px 14px;font-size:12px;"><i class="fa-solid fa-pen"></i> 수정</button>' +
          '<button class="quick-btn knowledge-delete-btn" data-doc-id="' + escapeHtml(docId) + '" style="padding:6px 14px;font-size:12px;background:var(--bg-secondary);"><i class="fa-solid fa-trash"></i> 삭제</button>' +
        '</div>' +
      '</div>';
    });

    resultsDiv.innerHTML = html;

    // 수정/삭제 버튼 바인딩
    resultsDiv.querySelectorAll('.knowledge-edit-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        const docId = this.dataset.docId;
        showToast('지식 수정: ' + docId + ' (Dify Dashboard 에서 직접 수정)', 'info');
      });
    });
    resultsDiv.querySelectorAll('.knowledge-delete-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        const docId = this.dataset.docId;
        showToast('지식 삭제: ' + docId + ' (Dify Dashboard 에서 직접 삭제)', 'info');
      });
    });
  } catch (err) {
    resultsDiv.innerHTML = '<div style="text-align:center;padding:20px;background:var(--bg-secondary);border-radius:12px;color:var(--kt-red);"><i class="fa-solid fa-triangle-exclamation"></i> 조회 오류: ' + escapeHtml(err.message) + '</div>';
  }
}

// ============================================================
// Document API UI 함수들
// ============================================================

// 문서 목록 로드
async function loadDocumentList(datasetId) {
  const chatMessages = document.getElementById('chatMessages');
  if (!chatMessages) return;

  chatMessages.innerHTML =
    '<div class="welcome-card" style="max-width:800px;margin:0 auto;">' +
      '<div class="welcome-icon"><i class="fa-solid fa-file-lines"></i></div>' +
      '<h2>문서 목록</h2>' +
      '<p>지식(Dataset) 에 등록된 문서 목록입니다.</p>' +
      '<div id="documentListResults" style="margin-top:20px;text-align:left;">' +
        '<div style="text-align:center;padding:20px;"><i class="fa-solid fa-spinner fa-spin" style="font-size:24px;color:var(--kt-red);"></i><br/><span style="color:var(--text-secondary);">로딩 중...</span></div>' +
      '</div>' +
      '<div style="display:flex;gap:10px;margin-top:16px;">' +
        '<button class="quick-btn" id="documentCreateBtn" style="padding:12px 24px;"><i class="fa-solid fa-plus"></i> 문서 추가</button>' +
        '<button class="quick-btn" id="documentBackBtn" style="padding:12px 24px;background:var(--bg-secondary);"><i class="fa-solid fa-arrow-left"></i> 목록으로</button>' +
      '</div>' +
    '</div>';

  document.getElementById('documentBackBtn').addEventListener('click', function() { loadKnowledgeList(); });
  document.getElementById('documentCreateBtn').addEventListener('click', function() { renderDocumentCreate(datasetId); });

  try {
    const documents = await fetchDocumentList(datasetId);
    const resultsDiv = document.getElementById('documentListResults');

    if (!documents || documents.length === 0) {
      resultsDiv.innerHTML = '<div style="text-align:center;padding:30px;background:var(--bg-secondary);border-radius:12px;"><i class="fa-solid fa-folder-open" style="font-size:36px;color:var(--text-secondary);margin-bottom:12px;"></i><br/><strong>등록된 문서가 없습니다</strong><br/><span style="font-size:13px;color:var(--text-secondary);">새로운 문서를 추가해 주세요.</span></div>';
      return;
    }

    let html = '<div style="margin-bottom:12px;color:var(--text-secondary);font-size:13px;"><i class="fa-solid fa-check-circle" style="color:var(--kt-green);"></i> ' + documents.length + ' 개의 문서가 등록되어 있습니다.</div>';

    documents.forEach(function(doc, i) {
      const name = doc.name || '제목 없음';
      const id = doc.id || '';
      const status = doc.indexing_status || doc.status || '';
      const created = doc.created_at ? new Date(doc.created_at * 1000).toLocaleDateString('ko-KR') : '';

      html += '<div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:10px;padding:16px;margin-bottom:12px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
          '<strong style="color:var(--kt-red);"><i class="fa-solid fa-file-lines"></i> ' + escapeHtml(name) + '</strong>' +
          '<span style="font-size:11px;color:var(--text-secondary);">' + escapeHtml(status) + '</span>' +
        '</div>' +
        '<div style="font-size:11px;color:var(--text-secondary);">ID: ' + escapeHtml(id) + (created ? ' · 등록일: ' + created : '') + '</div>' +
        '<div style="margin-top:10px;display:flex;gap:8px;">' +
          '<button class="quick-btn document-segments-btn" data-dataset-id="' + escapeHtml(datasetId) + '" data-document-id="' + escapeHtml(id) + '" style="padding:6px 14px;font-size:12px;"><i class="fa-solid fa-layer-group"></i> 청크 보기</button>' +
        '</div>' +
      '</div>';
    });

    resultsDiv.innerHTML = html;

    // 청크 보기 버튼 바인딩
    resultsDiv.querySelectorAll('.document-segments-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        const dsId = this.dataset.datasetId;
        const docId = this.dataset.documentId;
        loadSegmentList(dsId, docId);
      });
    });


  } catch (err) {
    const resultsDiv = document.getElementById('documentListResults');
    resultsDiv.innerHTML = '<div style="text-align:center;padding:20px;background:var(--bg-secondary);border-radius:12px;color:var(--kt-red);"><i class="fa-solid fa-triangle-exclamation"></i> 목록 조회 오류: ' + escapeHtml(err.message) + '</div>';
  }
}

// 문서 생성 화면
function renderDocumentCreate(datasetId) {
  const chatMessages = document.getElementById('chatMessages');
  if (!chatMessages) return;

  chatMessages.innerHTML =
    '<div class="welcome-card" style="max-width:700px;margin:0 auto;">' +
      '<div class="welcome-icon"><i class="fa-solid fa-plus-circle"></i></div>' +
      '<h2>새 문서 추가</h2>' +
      '<p>텍스트로 새로운 문서를 생성해 지식(Dataset) 에 추가해 주세요.</p>' +
      '<div style="margin-top:20px;">' +
        '<label style="display:block;margin-bottom:6px;font-size:13px;font-weight:600;color:var(--text-primary);">문서 이름 *</label>' +
        '<input type="text" id="documentNameInput" placeholder="예: STP 구매 프로세스 가이드" style="width:100%;padding:12px 16px;border:1px solid var(--border-color);border-radius:8px;font-size:14px;background:var(--bg-card);color:var(--text-primary);box-sizing:border-box;margin-bottom:16px;"/>' +
        '<label style="display:block;margin-bottom:6px;font-size:13px;font-weight:600;color:var(--text-primary);">문서 내용 *</label>' +
        '<textarea id="documentTextInput" placeholder="문서 내용을 입력하세요..." rows="10" style="width:100%;padding:12px 16px;border:1px solid var(--border-color);border-radius:8px;font-size:14px;background:var(--bg-card);color:var(--text-primary);box-sizing:border-box;resize:vertical;margin-bottom:20px;"></textarea>' +
      '</div>' +
      '<div style="display:flex;gap:10px;">' +
        '<button class="quick-btn" id="documentCreateGoBtn" style="padding:12px 24px;"><i class="fa-solid fa-plus"></i> 생성하기</button>' +
        '<button class="quick-btn" id="documentBackBtn" style="padding:12px 24px;background:var(--bg-secondary);"><i class="fa-solid fa-arrow-left"></i> 취소</button>' +
      '</div>' +
      '<div id="documentCreateResult" style="margin-top:16px;"></div>' +
    '</div>';

  document.getElementById('documentCreateGoBtn').addEventListener('click', function() {
    const name = document.getElementById('documentNameInput').value.trim();
    const text = document.getElementById('documentTextInput').value.trim();
    if (!name || !text) {
      document.getElementById('documentCreateResult').innerHTML = '<div style="color:var(--kt-red);font-size:13px;"><i class="fa-solid fa-circle-exclamation"></i> 문서 이름과 내용을 입력해 주세요.</div>';
      return;
    }
    executeDocumentCreate(datasetId, name, text);
  });

  document.getElementById('documentBackBtn').addEventListener('click', function() { loadDocumentList(datasetId); });
  document.getElementById('documentNameInput').focus();
}

// 문서 생성 실행
async function executeDocumentCreate(datasetId, name, text) {
  const resultDiv = document.getElementById('documentCreateResult');
  resultDiv.innerHTML = '<div style="text-align:center;padding:16px;"><i class="fa-solid fa-spinner fa-spin" style="font-size:20px;color:var(--kt-red);"></i><br/><span style="color:var(--text-secondary);">생성 중...</span></div>';

  try {
    const data = await createDocumentByText(datasetId, name, text);
    const id = data.id || data.document_id || '';
    resultDiv.innerHTML =
      '<div style="background:var(--bg-card);border:1px solid var(--kt-green);border-radius:10px;padding:16px;text-align:center;">' +
        '<i class="fa-solid fa-circle-check" style="font-size:28px;color:var(--kt-green);margin-bottom:8px;"></i><br/>' +
        '<strong style="color:var(--kt-green);">문서 생성 완료!</strong><br/>' +
        '<span style="font-size:13px;color:var(--text-secondary);">ID: ' + escapeHtml(id) + '</span>' +
      '</div>';
  } catch (err) {
    resultDiv.innerHTML = '<div style="color:var(--kt-red);font-size:13px;"><i class="fa-solid fa-triangle-exclamation"></i> 생성 오류: ' + escapeHtml(err.message) + '</div>';
  }
}

// ============================================================
// Segment API UI 함수들
// ============================================================

// 청크 목록 로드
async function loadSegmentList(datasetId, documentId) {
  const chatMessages = document.getElementById('chatMessages');
  if (!chatMessages) return;

  chatMessages.innerHTML =
    '<div class="welcome-card" style="max-width:800px;margin:0 auto;">' +
      '<div class="welcome-icon"><i class="fa-solid fa-layer-group"></i></div>' +
      '<h2>청크 목록</h2>' +
      '<p>문서에 등록된 청크(Segment) 목록입니다.</p>' +
      '<div id="segmentListResults" style="margin-top:20px;text-align:left;">' +
        '<div style="text-align:center;padding:20px;"><i class="fa-solid fa-spinner fa-spin" style="font-size:24px;color:var(--kt-red);"></i><br/><span style="color:var(--text-secondary);">로딩 중...</span></div>' +
      '</div>' +
      '<div style="display:flex;gap:10px;margin-top:16px;">' +
        '<button class="quick-btn" id="segmentCreateBtn" style="padding:12px 24px;"><i class="fa-solid fa-plus"></i> 청크 추가</button>' +
        '<button class="quick-btn" id="segmentBackBtn" style="padding:12px 24px;background:var(--bg-secondary);"><i class="fa-solid fa-arrow-left"></i> 목록으로</button>' +
      '</div>' +
    '</div>';

  document.getElementById('segmentBackBtn').addEventListener('click', function() { loadDocumentList(datasetId); });
  document.getElementById('segmentCreateBtn').addEventListener('click', function() { renderSegmentCreate(datasetId, documentId); });

  try {
    const segments = await fetchSegmentList(datasetId, documentId);
    const resultsDiv = document.getElementById('segmentListResults');

    if (!segments || segments.length === 0) {
      resultsDiv.innerHTML = '<div style="text-align:center;padding:30px;background:var(--bg-secondary);border-radius:12px;"><i class="fa-solid fa-folder-open" style="font-size:36px;color:var(--text-secondary);margin-bottom:12px;"></i><br/><strong>등록된 청크가 없습니다</strong><br/><span style="font-size:13px;color:var(--text-secondary);">새로운 청크를 추가해 주세요.</span></div>';
      return;
    }

    let html = '<div style="margin-bottom:12px;color:var(--text-secondary);font-size:13px;"><i class="fa-solid fa-check-circle" style="color:var(--kt-green);"></i> ' + segments.length + ' 개의 청크가 등록되어 있습니다.</div>';

    segments.forEach(function(seg, i) {
      const content = seg.content || seg.text || '내용 없음';
      const id = seg.id || '';

      html += '<div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:10px;padding:16px;margin-bottom:12px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
          '<strong style="color:var(--kt-red);"><i class="fa-solid fa-layer-group"></i> 청크 #' + (i + 1) + '</strong>' +
          '<span style="font-size:11px;color:var(--text-secondary);">ID: ' + escapeHtml(id) + '</span>' +
        '</div>' +
        '<div style="font-size:13px;line-height:1.7;color:var(--text-primary);white-space:pre-wrap;">' + escapeHtml(content).substring(0, 500) + '</div>' +
      '</div>';
    });

    resultsDiv.innerHTML = html;


  } catch (err) {
    const resultsDiv = document.getElementById('segmentListResults');
    resultsDiv.innerHTML = '<div style="text-align:center;padding:20px;background:var(--bg-secondary);border-radius:12px;color:var(--kt-red);"><i class="fa-solid fa-triangle-exclamation"></i> 목록 조회 오류: ' + escapeHtml(err.message) + '</div>';
  }
}

// 청크 생성 화면
function renderSegmentCreate(datasetId, documentId) {
  const chatMessages = document.getElementById('chatMessages');
  if (!chatMessages) return;

  chatMessages.innerHTML =
    '<div class="welcome-card" style="max-width:700px;margin:0 auto;">' +
      '<div class="welcome-icon"><i class="fa-solid fa-plus-circle"></i></div>' +
      '<h2>새 청크 추가</h2>' +
      '<p>텍스트로 새로운 청크(Segment)를 생성해 문서에 추가해 주세요.</p>' +
      '<div style="margin-top:20px;">' +
        '<label style="display:block;margin-bottom:6px;font-size:13px;font-weight:600;color:var(--text-primary);">청크 내용 *</label>' +
        '<textarea id="segmentTextInput" placeholder="청크 내용을 입력하세요..." rows="8" style="width:100%;padding:12px 16px;border:1px solid var(--border-color);border-radius:8px;font-size:14px;background:var(--bg-card);color:var(--text-primary);box-sizing:border-box;resize:vertical;margin-bottom:20px;"></textarea>' +
      '</div>' +
      '<div style="display:flex;gap:10px;">' +
        '<button class="quick-btn" id="segmentCreateGoBtn" style="padding:12px 24px;"><i class="fa-solid fa-plus"></i> 생성하기</button>' +
        '<button class="quick-btn" id="segmentBackBtn" style="padding:12px 24px;background:var(--bg-secondary);"><i class="fa-solid fa-arrow-left"></i> 취소</button>' +
      '</div>' +
      '<div id="segmentCreateResult" style="margin-top:16px;"></div>' +
    '</div>';

  document.getElementById('segmentCreateGoBtn').addEventListener('click', function() {
    const text = document.getElementById('segmentTextInput').value.trim();
    if (!text) {
      document.getElementById('segmentCreateResult').innerHTML = '<div style="color:var(--kt-red);font-size:13px;"><i class="fa-solid fa-circle-exclamation"></i> 청크 내용을 입력해 주세요.</div>';
      return;
    }
    executeSegmentCreate(datasetId, documentId, text);
  });

  document.getElementById('segmentBackBtn').addEventListener('click', function() { loadSegmentList(datasetId, documentId); });
  document.getElementById('segmentTextInput').focus();
}

// 청크 생성 실행
async function executeSegmentCreate(datasetId, documentId, text) {
  const resultDiv = document.getElementById('segmentCreateResult');
  resultDiv.innerHTML = '<div style="text-align:center;padding:16px;"><i class="fa-solid fa-spinner fa-spin" style="font-size:20px;color:var(--kt-red);"></i><br/><span style="color:var(--text-secondary);">생성 중...</span></div>';

  try {
    const data = await createSegment(datasetId, documentId, text);
    const id = data.id || data.segment_id || '';
    resultDiv.innerHTML =
      '<div style="background:var(--bg-card);border:1px solid var(--kt-green);border-radius:10px;padding:16px;text-align:center;">' +
        '<i class="fa-solid fa-circle-check" style="font-size:28px;color:var(--kt-green);margin-bottom:8px;"></i><br/>' +
        '<strong style="color:var(--kt-green);">청크 생성 완료!</strong><br/>' +
        '<span style="font-size:13px;color:var(--text-secondary);">ID: ' + escapeHtml(id) + '</span>' +
      '</div>';
  } catch (err) {
    resultDiv.innerHTML = '<div style="color:var(--kt-red);font-size:13px;"><i class="fa-solid fa-triangle-exclamation"></i> 생성 오류: ' + escapeHtml(err.message) + '</div>';
  }
}

/* ============================================================
   STP 운영 담당자 연락처 키워드 감지 및 즉시 응답
    ============================================================ */

/* --- 구조화된 담당자 데이터 (이름 검색용) --- */
const CONTACT_DATABASE = [
  // STP 운영 담당자 (general)
  { name: '채혜성', rank: '책임', group: 'stp', area: 'KT · Alpha · Skylife', team: '', note: '', roles: ['stp 운영'] },
  { name: '장미경', rank: '책임', group: 'stp', area: 'KT · Alpha · Skylife', team: '', note: '', roles: ['stp 운영'] },
  { name: '배지현', rank: '선임', group: 'stp', area: 'KT · Alpha · Skylife', team: '', note: '', roles: ['stp 운영'] },
  { name: '조혜승', rank: '선임', group: 'stp', area: 'Netcore · P&M · Cloud · Sat', team: '', note: '', roles: ['stp 운영'] },
  { name: '김연수', rank: '선임', group: 'stp', area: 'Netcore · P&M · Cloud · Sat', team: '', note: '', roles: ['stp 운영'] },
  { name: '김정환', rank: '과장', group: 'stp', area: 'KT ds · engcore · estate', team: '', note: '', roles: ['stp 운영'] },
  // KT ALPHA 시스템 담당자
  { name: '강남석', rank: '책임', group: 'alpha', area: 'ERP PM', team: '재무DX개발팀', note: '', roles: ['pm', 'erp pm', '프로젝트 관리'] },
  { name: '김인수', rank: '과장', group: 'alpha', area: 'ERP FI 담당자', team: '협력사', note: 'ALPHA 전반적인 프로세스 및 배포 등 모든 문의', roles: ['fi', 'erp fi', '회계'] },
  { name: '오슬기', rank: '과장', group: 'alpha', area: 'BO 시스템 담당', team: '방송플랫폼개발팀', note: '', roles: ['bo', 'bo 시스템'] },
  { name: '신지수', rank: '과장', group: 'alpha', area: '수불입고 / 구매입고', team: '회계서비스팀', note: '', roles: ['수불입고', '구매입고', '입고'] },
  { name: '이영미', rank: '과장', group: 'alpha', area: '수불출고 / 신구품전환 / 월마감', team: 'SCM팀', note: '', roles: ['수불출고', '신구품전환', '월마감', '출고'] },
  { name: '김소연', rank: '차장', group: 'alpha', area: '회계처리', team: '회계팀', note: '', roles: ['회계처리', '회계'] },
  { name: '오준혁', rank: '사원', group: 'alpha', area: 'KIMS 담당', team: '인프라DX팀', note: '그룹웨어는 가온아이 솔루션 회사측 담당자 (오준혁 사원에게 선 연락)', roles: ['kims', '그룹웨어'] },
  { name: '김동진', rank: '과장', group: 'alpha', area: '자재코드연동', team: '방송플랫폼개발팀', note: '', roles: ['자재코드', '자재코드연동'] },
  // kt netcore | kt p&m 시스템 담당자
  { name: '김민정', rank: '책임', group: 'netcore-pm', area: 'ERP PM', team: '재무 DX 서비스팀', note: '', roles: ['pm', 'erp pm', '프로젝트 관리'] },
  { name: '김기연', rank: '위원', group: 'netcore-pm', area: 'ERP FI 담당자', team: '협력사', note: '', roles: ['fi', 'erp fi', '회계'] },
  { name: '김소영', rank: '대리', group: 'netcore-pm', area: 'ERP CO 담당자 / ERP FM 담당자', team: '협력사', note: '', roles: ['co', 'fm', 'erp co', 'erp fm', '손익', '재원'] },
  { name: '강권찬', rank: '위원', group: 'netcore-pm', area: 'BPM 담당자', team: '협력사', note: '', roles: ['bpm'] },
  { name: '박봉희', rank: '위원', group: 'netcore-pm', area: 'SRM 담당자', team: '협력사', note: '', roles: ['srm'] },
  { name: '김성현', rank: '대리', group: 'netcore-pm', area: 'ATACAMA', team: '협력사', note: '', roles: ['atacama', '설계'] },
  { name: '김의성', rank: '차장', group: 'netcore-pm', area: '넷코어 IT 담당자', team: '구매계약부', note: '', roles: ['it', '넷코어 it'] },
  { name: '한지석', rank: '사원', group: 'netcore-pm', area: '넷코어 IT 담당자', team: '구매계약부', note: '', roles: ['it', '넷코어 it'] },
  // KT CLOUD - 협력사/ITO담당자
  { name: '박병철', rank: '', group: 'cloud', area: 'FI (AP/AR/GL)', team: 'ITO (협력사)', note: '010-2557-6024', roles: ['fi', 'ap', 'ar', 'gl'] },
  { name: '신정우', rank: '', group: 'cloud', area: 'FI (AP/AR/GL)', team: 'ITO (협력사)', note: '', roles: ['fi', 'ap', 'ar', 'gl'] },
  { name: '백종환', rank: '', group: 'cloud', area: 'FI (AP/AR/GL)', team: 'ITO (협력사)', note: '', roles: ['fi', 'ap', 'ar', 'gl'] },
  { name: '최정섭', rank: '', group: 'cloud', area: '펌뱅킹 (자금 관리)', team: 'ITO (협력사)', note: '010-3542-5112', roles: ['펌뱅킹', '자금'] },
  { name: '권재순', rank: '', group: 'cloud', area: 'Bizplay (법인카드 관리)', team: 'ITO (협력사)', note: '010-2642-1243', roles: ['bizplay', '법인카드'] },
  { name: '김나나', rank: '', group: 'cloud', area: 'MM (물자/공사/용역 구매)', team: 'ITO (협력사)', note: '', roles: ['mm', '구매', '물자'] },
  { name: '인한얼', rank: '과장', group: 'cloud', area: 'HR (인사/조직,연동)', team: 'ITO (협력사)', note: '010-4188-6982', roles: ['hr', '인사'] },
  { name: '현재유', rank: '', group: 'cloud', area: 'BC', team: 'ITO (협력사)', note: '', roles: ['bc'] },
  { name: '신동민', rank: '', group: 'cloud', area: 'BC', team: 'ITO (협력사)', note: '', roles: ['bc'] },
  { name: '송근배', rank: '과장', group: 'cloud', area: 'GRC (권한,계정,감사대응)', team: 'ITO (협력사)', note: '010-8961-9421', roles: ['grc', '권한', '계정', '감사'] },
  { name: '조승현', rank: '차장', group: 'cloud', area: 'MDM', team: 'ITO (애버커스)', note: '', roles: ['mdm'] },
  { name: '신현명', rank: '차장', group: 'cloud', area: '바코드', team: 'ITO (협력사)', note: '010-4517-2997', roles: ['바코드'] },
  { name: '오규환', rank: '', group: 'cloud', area: '바코드', team: 'ITO (애버커스)', note: '', roles: ['바코드'] },
  { name: '이주헌', rank: '과장', group: 'cloud', area: 'SRM', team: 'ITO (협력사)', note: '', roles: ['srm'] },
  { name: '장웅재', rank: '', group: 'cloud', area: 'BC', team: 'KT DS ITO (재무DX 서비스팀)', note: '', roles: ['bc'] },
  { name: '송은주', rank: '', group: 'cloud', area: 'MDM', team: 'KT DS ITO (Biz DX서비스팀)', note: '', roles: ['mdm'] },
  { name: '최승희', rank: '', group: 'cloud', area: 'EAI', team: 'KT DS ITO (Biz DX서비스팀)', note: '', roles: ['eai'] },
  { name: '정다운', rank: '', group: 'cloud', area: 'EAI', team: 'KT DS ITO (Biz DX서비스팀)', note: '', roles: ['eai'] },
  { name: '백민아', rank: '', group: 'cloud', area: 'PS (프로젝트 관리)', team: 'KT DS ITO (물류 DX 서비스팀)', note: '', roles: ['ps', '프로젝트 관리'] },
  { name: '이상호', rank: '', group: 'cloud', area: 'PS (프로젝트 관리)', team: 'KT DS ITO (물류 DX 서비스팀)', note: '', roles: ['ps', '프로젝트 관리'] },
  { name: '천혜연', rank: '', group: 'cloud', area: 'PM (설비관리/바코드)', team: 'KT DS ITO (물류 DX 서비스팀)', note: '', roles: ['pm', '설비관리', '바코드'] },
  { name: '박재운', rank: '', group: 'cloud', area: 'CO/FM (손익/예산 관리)', team: 'KT DS ITO (재무DX 서비스팀)', note: '', roles: ['co', 'fm', '손익', '예산'] },
  { name: '원승희', rank: '', group: 'cloud', area: 'CO/FM (손익/예산 관리)', team: 'KT DS ITO (재무DX 서비스팀)', note: '', roles: ['co', 'fm', '손익', '예산'] },
  // KT SKYLIFE 시스템 담당자
  { name: '인하영', rank: '책임', group: 'skylife', area: 'ERP PM / ERP HR ITO', team: '물류DX개발팀', note: '', roles: ['pm', 'erp pm', 'hr', 'erp hr'] },
  { name: '김참이', rank: '선임', group: 'skylife', area: 'ERP HR ITO', team: '물류DX개발팀', note: '', roles: ['hr', 'erp hr'] },
  { name: '김혜지', rank: '선임', group: 'skylife', area: 'ERP FI ITO', team: '재무DX개발팀', note: '', roles: ['fi', 'erp fi'] },
  { name: '송치현', rank: '과장', group: 'skylife', area: 'ERP CO ITO', team: '재무DX개발팀(협력사)', note: '', roles: ['co', 'erp co'] },
  { name: '김이준', rank: '선임', group: 'skylife', area: 'ERP EP ITO', team: '물류DX개발팀', note: '', roles: ['ep', 'erp ep'] },
  { name: '장웅재', rank: '책임', group: 'skylife', area: 'ERP BC ITO', team: '재무DX개발팀', note: '', roles: ['bc', 'erp bc'] },
  { name: '전형순', rank: '팀장', group: 'skylife', area: 'skylife ERP 운영 전반', team: 'skylife IT기획팀', note: '', roles: ['운영', 'erp 운영'] },
  { name: '선윤오', rank: '사원', group: 'skylife', area: 'skylife ERP 운영 전반 / 자재코드 생성 및 IMG 세팅', team: 'skylife IT기획팀', note: '', roles: ['운영', 'erp 운영', '자재코드'] },
  { name: '박승현', rank: '대리', group: 'skylife', area: '기초입고 / 구매입고 / 단가조정 / 출고 / 물류 월 마감', team: '기술전략팀', note: '', roles: ['입고', '기초입고', '구매입고', '단가조정', '출고', '월마감'] },
  { name: '안지홍', rank: '사원', group: 'skylife', area: '기초입고 / 구매입고 / 단가조정 / 출고 / 물류 월 마감', team: '기술전략팀', note: '', roles: ['입고', '기초입고', '구매입고', '단가조정', '출고', '월마감'] }
];

/**
 * 질문에서人名 추출 (한국어 2-4글자 + 직급 패턴)
 */
function extractPersonName(text) {
  // "김성현 대리는", "김성현은", "김성현", "김성현 과장" 등 패턴
  var namePatterns = [
    // 이름 + 직급: 김성현 대리, 김인수 과장, 강남석 책임
    /([가-힣]{2,4})\s*(대리|과장|차장|부장|책임|위원|선임|사원|팀장)/,
    // 이름 + 은/는/이/가: 김성현은, 김성현이, 김성현은
    /([가-힣]{2,4})(?:은|는|이|가)/,
    // "OOO 어떤", "OOO 누구", "OOO 알려": 김성현 어떤, 김성현 누구
    /([가-힣]{2,4})\s*(?:어떤|누구|알려)/,
  ];
  
  for (var i = 0; i < namePatterns.length; i++) {
    var match = text.match(namePatterns[i]);
    if (match) return match[1];
  }
  return null;
}

/**
 * 이름으로 담당자 검색 (모든 그룹사 데이터베이스 검색)
 * 매칭된 담당자 배열 반환 (0개 = 없음, 1개+ = 매칭됨)
 */
function searchContactByName(personName) {
  var results = [];
  for (var i = 0; i < CONTACT_DATABASE.length; i++) {
    var entry = CONTACT_DATABASE[i];
    if (entry.name === personName) {
      results.push(entry);
    }
  }
  return results;
}

/**
 * 검색된 담당자 정보를 HTML 응답으로 빌드
 */
function buildPersonSearchAnswer(results, personName) {
  if (results.length === 0) return null;
  
  var html = '<strong>🔍 ' + personName + ' 담당자 검색 결과</strong><br/><br/>';
  html += '<div style="font-size:13px;">';
  
  for (var i = 0; i < results.length; i++) {
    var r = results[i];
    var groupLabel = '';
    if (r.group === 'stp') groupLabel = 'STP 운영';
    else if (r.group === 'alpha') groupLabel = 'KT ALPHA';
    else if (r.group === 'netcore-pm') groupLabel = 'kt netcore | kt p&m';
    else if (r.group === 'cloud') groupLabel = 'KT CLOUD';
    else if (r.group === 'skylife') groupLabel = 'KT SKYLIFE';
    
    html += '<div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:8px;padding:12px 16px;margin-bottom:8px;">';
    html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">';
    html += '<span style="background:var(--kt-red);color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:bold;">' + groupLabel + '</span>';
    html += '<strong style="font-size:15px;">' + r.name + (r.rank ? ' ' + r.rank : '') + '</strong>';
    html += '</div>';
    html += '<div style="padding-left:4px;">';
    html += '<div>📌 <strong>담당 영역:</strong> ' + r.area + '</div>';
    if (r.team) {
      html += '<div>🏢 <strong>소속:</strong> ' + r.team + '</div>';
    }
    if (r.note) {
      html += '<div>💡 <strong>비고:</strong> ' + r.note + '</div>';
    }
    html += '</div>';
    html += '</div>';
  }
  
  html += '</div>';
  html += '<br/><small style="color:var(--text-secondary);">전체 담당자 목록은 "STP 운영 담당부서를 알려주세요"를 참고해 주세요.</small>';
  
  return html;
}

/**
 * 그룹사 감지 (질문 텍스트에서)
 */
function detectGroupFromText(text) {
  var lower = text.toLowerCase();
  if (lower.includes('alpha') || lower.includes('알파')) return 'alpha';
  if (lower.includes('netcore') || lower.includes('p&m') || lower.includes('넷코어') || lower.includes('신설법인')) return 'netcore-pm';
  if (lower.includes('kt cloud') || lower.includes('ktcloud') || lower.includes('kt 클라우드') || lower.includes('클라우드')) return 'cloud';
  if (lower.includes('skylife') || lower.includes('스카이라이프')) return 'skylife';
  return null;
}

/**
 * 역할/직책 기반 담당자 검색
 * "kt netcore PM 누구야?" → group='netcore-pm', role='pm' → 김민정 책임
 */
function searchContactByRole(text) {
  var detectedGroup = detectGroupFromText(text);
  if (!detectedGroup) return null;
  
  // 질문에서 역할 키워드 추출 (그룹사 키워드 제거 후 남은 부분)
  var cleaned = text.toLowerCase()
    .replace(/kt\s*/g, '')
    .replace(/netcore/g, '')
    .replace(/p&m/g, '')
    .replace(/알파/g, '')
    .replace(/alpha/g, '')
    .replace(/클라우드/g, '')
    .replace(/cloud/g, '')
    .replace(/스카이라이프/g, '')
    .replace(/skylife/g, '')
    .replace(/넷코어/g, '')
    .replace(/신설법인/g, '')
    .replace(/누구/g, '')
    .replace(/야/g, '')
    .replace(/해/g, '')
    .replace(/줘/g, '')
    .replace(/어/g, '')
    .replace(/아/g, '')
    .replace(/는/g, '')
    .replace(/은/g, '')
    .replace(/이/g, '')
    .replace(/가/g, '')
    .replace(/의/g, '')
    .replace(/의/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  if (!cleaned) return null;
  
  // CONTACT_DATABASE에서 group 매칭 + roles/area 매칭
  var results = [];
  for (var i = 0; i < CONTACT_DATABASE.length; i++) {
    var entry = CONTACT_DATABASE[i];
    if (entry.group !== detectedGroup) continue;
    
    // roles 배열 매칭
    if (entry.roles) {
      for (var j = 0; j < entry.roles.length; j++) {
        if (cleaned.includes(entry.roles[j]) || entry.roles[j].includes(cleaned)) {
          results.push(entry);
          break;
        }
      }
    }
    
    // area 매칭 (roles로 못 찾으면 area로도 시도)
    if (results.length === 0 && entry.area) {
      var areaLower = entry.area.toLowerCase();
      if (cleaned.includes(areaLower) || areaLower.includes(cleaned)) {
        results.push(entry);
      }
    }
  }
  
  return results.length > 0 ? results : null;
}

/**
 * 역할 검색 결과를 HTML 응답으로 빌드
 */
function buildRoleSearchAnswer(results, text, group) {
  if (!results || results.length === 0) return null;
  
  var groupLabel = '';
  if (group === 'alpha') groupLabel = 'KT ALPHA';
  else if (group === 'netcore-pm') groupLabel = 'kt netcore | kt p&m';
  else if (group === 'cloud') groupLabel = 'KT CLOUD';
  else if (group === 'skylife') groupLabel = 'KT SKYLIFE';
  
  var html = '<strong>🔍 ' + groupLabel + ' 담당자 검색 결과</strong><br/><br/>';
  html += '<div style="font-size:13px;">';
  
  for (var i = 0; i < results.length; i++) {
    var r = results[i];
    html += '<div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:8px;padding:12px 16px;margin-bottom:8px;">';
    html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">';
    html += '<span style="background:var(--kt-red);color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:bold;">' + groupLabel + '</span>';
    html += '<strong style="font-size:15px;">' + r.name + (r.rank ? ' ' + r.rank : '') + '</strong>';
    html += '</div>';
    html += '<div style="padding-left:4px;">';
    html += '<div>📌 <strong>담당 영역:</strong> ' + r.area + '</div>';
    if (r.team) {
      html += '<div>🏢 <strong>소속:</strong> ' + r.team + '</div>';
    }
    if (r.note) {
      html += '<div>💡 <strong>비고:</strong> ' + r.note + '</div>';
    }
    html += '</div>';
    html += '</div>';
  }
  
  html += '</div>';
  html += '<br/><small style="color:var(--text-secondary);">전체 담당자 목록은 "' + groupLabel + ' 담당자 연락처 알려주세요"를 참고해 주세요.</small>';
  
  return html;
}

const CONTACT_KEYWORDS = ['STP 담당자','STP 연락처','STP 담당부서','STP 운영 담당','STP 운영담당','STP 담당자 연락','STP 책임자'];

function isContactQuery(text) {
  // "시스템" 단독 단어는 담당자 연락처로 처리하지 않음
  if (text.trim() === '시스템') return false;
  
  // PO 관련 쿼리는 담당자 연락처로 처리하지 않음
  const lowerText = text.toLowerCase();
  if (lowerText.includes('po') || lowerText.includes('구매오더') || lowerText.includes('발주서')) {
    return false;
  }
  
  // 담당자/연락처 키워드가 포함되면 담당자 연락처로 처리 (우선순위 최상)
  // AI 모델의 PII 마스킹을 우회하기 위해 연락처 조회 의도가 명확한 패턴만 감지
  // '담당자', '연락처' 등 단일 키워드는 제거 (거짓 양성 방지: "김성현 대리는 어떤 담당자야?" 등)
  const contactKeywords = [
    // STP 운영 담당자 명시적 요청
    'STP 담당자','STP 담당부서','STP 운영 담당','STP 운영담당','STP 책임자',
    // 연락처 조회 의도가 명확한 패턴
    '담당자 연락처','연락처 알려','담당자 알려','담당부서 알려','운영 담당 알려',
    '담당자 연락','담당자 누구','누가 담당','누가 책임','누구에게','누구한테',
    '문의처','문의 방법','연락 방법',
    // 전화번호 조회 의도
    '전화번호','전화번호 알려','전화 알려','휴대폰','핸드폰',
    // 그룹사별 담당자 연락처 요청
    'alpha 담당자','alpha 담당','알파 담당자','알파 담당',
    'netcore 담당','넷코어 담당','p&m 담당','클라우드 담당','skylife 담당','스카이라이프 담당',
    // 일반 연락처 요청 (단일 '연락처'는 제외, 의도 명확한 패턴만)
    '연락처 주세요','연락처 알려줘','연락처 찾아','담당자 주세요','담당자 찾아',
    '내부 연락처','연락처 문의'
  ];
  if (contactKeywords.some(function(kw) { return text.includes(kw); })) {
    return true;
  }
  
  return false;
}

function buildContactAnswer() {
  const stpContact =
    '<strong>📋 STP 운영 담당자 연락처</strong><br/><br/>' +
    '<table style="width:100%;border-collapse:collapse;font-size:13px;">' +
      '<thead>' +
        '<tr style="background:var(--kt-red);color:#fff;">' +
          '<th style="padding:8px 12px;text-align:left;border-radius:4px 0 0 0;">담당 영역</th>' +
          '<th style="padding:8px 12px;text-align:left;border-radius:0 4px 0 0;">담당자</th>' +
        '</tr>' +
      '</thead>' +
      '<tbody>' +
        '<tr style="background:var(--dark-card);">' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"><strong>KT · Alpha · Skylife</strong></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">채혜성 책임 / 장미경 책임 / 배지현 선임</td>' +
        '</tr>' +
        '<tr style="background:var(--dark-bg);">' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"><strong>Netcore · P&M · Cloud · Sat</strong></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">조혜승 선임 / 김연수 선임</td>' +
        '</tr>' +
        '<tr style="background:var(--dark-card);">' +
          '<td style="padding:8px 12px;"><strong>KT ds · engcore · estate</strong></td>' +
          '<td style="padding:8px 12px;">김정환 과장</td>' +
        '</tr>' +
      '</tbody>' +
    '</table>' +
    '<br/>문의 사항이 있으시면 담당자에게 직접 연락해 주시거나,<br/>ITSM 에 등록 부탁드립니다.<br/><br/>';

  return stpContact;
}

function buildAlphaContactAnswer() {
  const alphaContact =
    '<strong>📋 KT ALPHA 시스템 담당자</strong><br/>' +
    '<table style="width:100%;border-collapse:collapse;font-size:13px;">' +
      '<thead>' +
        '<tr style="background:var(--kt-red);color:#fff;">' +
          '<th style="padding:8px 12px;text-align:left;border-radius:4px 0 0 0;">구분</th>' +
          '<th style="padding:8px 12px;text-align:left;">담당자</th>' +
          '<th style="padding:8px 12px;text-align:left;">소속</th>' +
          '<th style="padding:8px 12px;text-align:left;border-radius:0 4px 0 0;">비고</th>' +
        '</tr>' +
      '</thead>' +
      '<tbody>' +
        '<tr style="background:var(--dark-card);">' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"><strong>ERP PM</strong></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">강남석 책임</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">재무DX개발팀</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"></td>' +
        '</tr>' +
        '<tr style="background:var(--dark-bg);">' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"><strong>ERP FI 담당자</strong></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">김인수 과장</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">협력사</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"><div style="line-height:1.4;">ALPHA 전반적인 프로세스 및 배포 등 모든 문의</div></td>' +
        '</tr>' +
        '<tr style="background:var(--dark-card);">' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"><strong>BO 시스템 담당</strong></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">오슬기 과장</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">방송플랫폼개발팀</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"></td>' +
        '</tr>' +
        '<tr style="background:var(--dark-bg);">' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"><strong>수불입고</strong></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">신지수 과장</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">회계서비스팀</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"></td>' +
        '</tr>' +
        '<tr style="background:var(--dark-card);">' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"><strong>수불출고</strong></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">이영미 과장</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">SCM팀</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"></td>' +
        '</tr>' +
        '<tr style="background:var(--dark-bg);">' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"><strong>구매입고</strong></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">신지수 과장</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">회계서비스팀</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"></td>' +
        '</tr>' +
        '<tr style="background:var(--dark-card);">' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"><strong>신구품전환</strong></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">이영미 과장</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">SCM팀</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"></td>' +
        '</tr>' +
        '<tr style="background:var(--dark-bg);">' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"><strong>월마감</strong></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">이영미 과장</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">SCM팀</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"></td>' +
        '</tr>' +
        '<tr style="background:var(--dark-card);">' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"><strong>회계처리</strong></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">김소연 차장</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">회계팀</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"></td>' +
        '</tr>' +
        '<tr style="background:var(--dark-bg);">' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"><strong>KIMS 담당</strong></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">오준혁 사원</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">인프라DX팀</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"></td>' +
        '</tr>' +
        '<tr style="background:var(--dark-card);">' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"><strong>그룹웨어</strong></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">담당자</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">가온아이 솔루션</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">오준혁 사원에게 선 연락</td>' +
        '</tr>' +
        '<tr style="background:var(--dark-bg);">' +
          '<td style="padding:8px 12px;"><strong>자재코드연동</strong></td>' +
          '<td style="padding:8px 12px;">김동진 과장</td>' +
          '<td style="padding:8px 12px;">방송플랫폼개발팀</td>' +
          '<td style="padding:8px 12px;"></td>' +
        '</tr>' +
      '</tbody>' +
    '</table>' +
    '<br/><div style="font-size:12px;color:#667;line-height:1.0;">' +
    '* BO 담당자는 업무별로 상이하므로, 정확한 BO 담당자는 해당 사업부서에 문의해 주세요.' +
    '</div>';

  return alphaContact;
}

function buildNetcorePmContactAnswer() {
  const netcorePmContact =
    '<strong>📋 kt netcore | kt p&m 시스템 담당자</strong><br/>' +
    '<table style="width:100%;border-collapse:collapse;font-size:13px;">' +
      '<thead>' +
        '<tr style="background:var(--kt-red);color:#fff;">' +
          '<th style="padding:8px 12px;text-align:left;border-radius:4px 0 0 0;">구분</th>' +
          '<th style="padding:8px 12px;text-align:left;">담당자</th>' +
          '<th style="padding:8px 12px;text-align:left;">소속</th>' +
          '<th style="padding:8px 12px;text-align:left;border-radius:0 4px 0 0;">비고</th>' +
        '</tr>' +
      '</thead>' +
      '<tbody>' +
        '<tr style="background:var(--dark-card);">' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"><strong>ERP PM</strong></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">김민정 책임</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">재무 DX 서비스팀</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"></td>' +
        '</tr>' +
        '<tr style="background:var(--dark-bg);">' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"><strong>ERP FI 담당자</strong></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">김기연 위원</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">협력사</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"></td>' +
        '</tr>' +
        '<tr style="background:var(--dark-card);">' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"><strong>ERP CO 담당자</strong></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">김소영 대리</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">협력사</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"></td>' +
        '</tr>' +
        '<tr style="background:var(--dark-bg);">' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"><strong>ERP FM 담당자</strong></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">김소영 대리</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">협력사</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"></td>' +
        '</tr>' +
        '<tr style="background:var(--dark-card);">' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"><strong>BPM 담당자</strong></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">강권찬 위원</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">협력사</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"></td>' +
        '</tr>' +
        '<tr style="background:var(--dark-bg);">' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"><strong>SRM 담당자</strong></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">박봉희 위원</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">협력사</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"></td>' +
        '</tr>' +
        '<tr style="background:var(--dark-card);">' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"><strong>ATACAMA</strong></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">김성현 대리</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">협력사</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"></td>' +
        '</tr>' +
        '<tr style="background:var(--dark-bg);">' +
          '<td style="padding:8px 12px;"><strong>넷코어 IT 담당자</strong></td>' +
          '<td style="padding:8px 12px;">김의성 차장, 한지석 사원</td>' +
          '<td style="padding:8px 12px;">구매계약부</td>' +
          '<td style="padding:8px 12px;"></td>' +
        '</tr>' +
      '</tbody>' +
    '</table>';

  return netcorePmContact;
}

function buildKtCloudContactAnswer() {
  const ktCloudContact =
    '<strong>📋 협력사/ITO담당자 안내/연락처</strong><br/>' +
    '<table style="width:100%;border-collapse:collapse;font-size:13px;">' +
      '<thead>' +
        '<tr style="background:var(--kt-red);color:#fff;">' +
          '<th style="padding:8px 12px;text-align:left;border-radius:4px 0 0 0;">모듈</th>' +
          '<th style="padding:8px 12px;text-align:left;">업무</th>' +
          '<th style="padding:8px 12px;text-align:left;">ITO (협력사)</th>' +
          '<th style="padding:8px 12px;text-align:left;border-radius:0 4px 0 0;">KT DS ITO</th>' +
        '</tr>' +
      '</thead>' +
      '<tbody>' +
        '<tr style="background:var(--dark-card);">' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"><strong>FI</strong></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">AP/AR/GL</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">박병철 (010-2557-6024)<br/>신정우 / 백종환</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">재무DX 서비스팀</td>' +
        '</tr>' +
        '<tr style="background:var(--dark-bg);">' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"><strong>FI</strong></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">고정자산관리</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"></td>' +
        '</tr>' +
        '<tr style="background:var(--dark-card);">' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"><strong>펌뱅킹</strong></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">자금 관리(펌뱅킹)</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">최정섭 (010-3542-5112)</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"></td>' +
        '</tr>' +
        '<tr style="background:var(--dark-bg);">' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"><strong>Bizplay</strong></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">법인카드 관리 (Bizplay)</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">권재순 (010-2642-1243)</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"></td>' +
        '</tr>' +
        '<tr style="background:var(--dark-card);">' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"><strong>MM</strong></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">물자/공사/용역 구매</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">김나나</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">물류 DX 서비스팀 조혜승</td>' +
        '</tr>' +
        '<tr style="background:var(--dark-bg);">' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"><strong>PS</strong></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">프로젝트 관리</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">물류 DX 서비스팀 백민아, 이상호</td>' +
        '</tr>' +
        '<tr style="background:var(--dark-card);">' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"><strong>PM</strong></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">설비관리(바코드)</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">물류 DX 서비스팀 천혜연</td>' +
        '</tr>' +
        '<tr style="background:var(--dark-bg);">' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"><strong>CO/FM</strong></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">손익/예산 관리</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">재무DX 서비스팀 박재운 / 원승희</td>' +
        '</tr>' +
        '<tr style="background:var(--dark-card);">' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"><strong>CO/FM</strong></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">재원(FM)</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"></td>' +
        '</tr>' +
        '<tr style="background:var(--dark-bg);">' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"><strong>PPM</strong></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">투자사업계획 관리</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"></td>' +
        '</tr>' +
        '<tr style="background:var(--dark-card);">' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"><strong>HR</strong></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">인사/조직,연동</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">인한얼 과장 (010-4188-6982)</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"></td>' +
        '</tr>' +
        '<tr style="background:var(--dark-bg);">' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"><strong>BC</strong></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">BC</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">현재유, 신동민</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">재무DX 서비스팀 장웅재</td>' +
        '</tr>' +
        '<tr style="background:var(--dark-card);">' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"><strong>GRC</strong></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">권한,계정, 감사대응</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">송근배 과장 (010-8961-9421)</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"></td>' +
        '</tr>' +
        '<tr style="background:var(--dark-bg);">' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"><strong>MDM</strong></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">MDM</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">조승현 차장 (애버커스)</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">Biz DX서비스팀 송은주</td>' +
        '</tr>' +
        '<tr style="background:var(--dark-card);">' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"><strong>바코드</strong></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">바코드</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">신현명 차장 (010-4517-2997)<br/>오규환 (애버커스)</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"></td>' +
        '</tr>' +
        '<tr style="background:var(--dark-bg);">' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"><strong>EAI</strong></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">EAI</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">Biz DX서비스팀 최승희, 정다운</td>' +
        '</tr>' +
        '<tr style="background:var(--dark-card);">' +
          '<td style="padding:8px 12px;"><strong>SRM</strong></td>' +
          '<td style="padding:8px 12px;">SRM</td>' +
          '<td style="padding:8px 12px;">이주헌 과장</td>' +
          '<td style="padding:8px 12px;"></td>' +
        '</tr>' +
      '</tbody>' +
    '</table>';

  return ktCloudContact;
}

function buildSkylifeContactAnswer() {
  const skylifeContact =
    '<strong>📋 KT SKYLIFE 시스템 담당자</strong><br/>' +
    '<table style="width:100%;border-collapse:collapse;font-size:13px;">' +
      '<thead>' +
        '<tr style="background:var(--kt-red);color:#fff;">' +
          '<th style="padding:8px 12px;text-align:left;border-radius:4px 0 0 0;">KT SKYLIFE 업무</th>' +
          '<th style="padding:8px 12px;text-align:left;">사업부서 담당자</th>' +
          '<th style="padding:8px 12px;text-align:left;">사업부서</th>' +
          '<th style="padding:8px 12px;text-align:left;">시스템 담당자</th>' +
          '<th style="padding:8px 12px;text-align:left;border-radius:0 4px 0 0;">시스템 담당팀</th>' +
        '</tr>' +
      '</thead>' +
      '<tbody>' +
        '<tr style="background:var(--dark-card);">' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"><strong>ERP PM</strong></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">인하영 책임</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">물류DX개발팀</td>' +
        '</tr>' +
        '<tr style="background:var(--dark-bg);">' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"><strong>ERP HR ITO</strong></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">인하영 책임, 김참이 선임</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">물류DX개발팀</td>' +
        '</tr>' +
        '<tr style="background:var(--dark-card);">' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"><strong>ERP FI ITO</strong></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">김혜지 선임</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">재무DX개발팀</td>' +
        '</tr>' +
        '<tr style="background:var(--dark-bg);">' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"><strong>ERP CO ITO</strong></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">송치현 과장</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">재무DX개발팀(협력사)</td>' +
        '</tr>' +
        '<tr style="background:var(--dark-card);">' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"><strong>ERP EP ITO</strong></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">김이준 선임</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">물류DX개발팀</td>' +
        '</tr>' +
        '<tr style="background:var(--dark-bg);">' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"><strong>ERP BC ITO</strong></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">장웅재 책임</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">재무DX개발팀</td>' +
        '</tr>' +
        '<tr style="background:var(--dark-card);">' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"><strong>skylife ERP 운영 전반</strong></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">전형순 팀장, 선윤오 사원</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">skylife IT기획팀</td>' +
        '</tr>' +
        '<tr style="background:var(--dark-bg);">' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"><strong>자재코드 생성 및 IMG 세팅</strong></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">선윤오 사원</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">skylife IT기획팀</td>' +
        '</tr>' +
        '<tr style="background:var(--dark-card);">' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"><strong>기초입고</strong></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">박승현 대리 → 안지홍 사원</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">기술전략팀</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"></td>' +
        '</tr>' +
        '<tr style="background:var(--dark-bg);">' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"><strong>구매입고</strong></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">박승현 대리 → 안지홍 사원</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">기술전략팀</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"></td>' +
        '</tr>' +
        '<tr style="background:var(--dark-card);">' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"><strong>단가조정</strong></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">박승현 대리 → 안지홍 사원</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">기술전략팀</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"></td>' +
        '</tr>' +
        '<tr style="background:var(--dark-bg);">' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"><strong>출고</strong></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">박승현 대리 → 안지홍 사원</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">기술전략팀</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"></td>' +
        '</tr>' +
        '<tr style="background:var(--dark-card);">' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"><strong>물류 월 마감</strong></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">박승현 대리 → 안지홍 사원</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);">기술전략팀</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"></td>' +
        '</tr>' +
        '<tr style="background:var(--dark-bg);">' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"><strong>OTS 출고</strong></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"></td>' +
        '</tr>' +
        '<tr style="background:var(--dark-card);">' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"><strong>SCIS 수불연동</strong></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"></td>' +
        '</tr>' +
        '<tr style="background:var(--dark-bg);">' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"><strong>영업전산 시스템</strong></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"></td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid var(--border-color);"></td>' +
        '</tr>' +
        '<tr style="background:var(--dark-card);">' +
          '<td style="padding:8px 12px;"><strong>구매계약 시스템</strong></td>' +
          '<td style="padding:8px 12px;"></td>' +
          '<td style="padding:8px 12px;"></td>' +
          '<td style="padding:8px 12px;"></td>' +
          '<td style="padding:8px 12px;"></td>' +
        '</tr>' +
      '</tbody>' +
    '</table>';

  return skylifeContact;
}

/* ============================================================
    STP 연계 시스템 키워드 감지 및 즉시 응답
    ============================================================ */
const SYSTEM_KEYWORDS = ['STP 연계 시스템', 'STP연계시스템', 'STP시스템', 'STP 시스템', 'stp연계시스템', 'stp 연계 시스템', 'bpm', 'eai', 'srm', 'easy erp', 'easyerp', 'itsm', 'it sm', 'ep ', '연계 시스템', '시스템 주소', '시스템 url', '시스템 링크', '시스템 접속', 'bpm 주소', 'bpm url', 'bpm 링크', 'bpm 접속', 'eai 주소', 'eai url', 'srm 주소', 'srm url', 'erp 주소', 'erp url', 'itsm 주소', 'itsm url', 'ep 주소', 'ep url', '그룹메일', 'groupmail'];

/**
 * URL/접속 의도 감지 키워드
 * 이 키워드가 없으면 시스템 설명 질문 → AI에 넘김
 */
const SYSTEM_URL_INTENT_KEYWORDS = [
  '주소', 'url', '링크', '접속', '로그인', '홈페이지', '사이트', 'web', 'portal',
  'url 주소', '접속 주소', '접속 링크', '로그인 주소', '홈페이지 주소',
  '어디서', '어디서 접속', '어디서 로그인'
];

/**
 * 설명/정의 의도 감지 키워드
 * 이 키워드가 있으면 고정답변 X → AI에 넘김
 */
const SYSTEM_EXPLANATION_KEYWORDS = [
  '어떤 시스템', '뭐야', '뭐지', '무엇이야', '무엇이지', '설명', '설명해', '설명해줘',
  '설명해주세요', '의미', '뜻', '기능', '역할', '용도', '목적', '차이', '차이점',
  '비교', '어떤 차이', '어떤 의미', '어떤 역할', '어떤 기능',
  'is what', 'what is', 'what does', 'difference', 'explain'
];

function isSystemQuery(text) {
  const lowerText = text.toLowerCase().trim();

  // "시스템" 단독으로는 시스템 카테고리가 아님
  if (lowerText === '시스템') return false;

  // 시스템 키워드가 포함되어야 함
  var hasSystemKeyword = SYSTEM_KEYWORDS.some(function(kw) { return lowerText.includes(kw.toLowerCase()); });
  if (!hasSystemKeyword) return false;

  // 설명/정의 의도면 고정답변 X → AI에 넘김
  if (SYSTEM_EXPLANATION_KEYWORDS.some(function(kw) { return lowerText.includes(kw); })) {
    return false;
  }

  // "STP 연계 시스템" / "연계 시스템" 등 전체 안내 요청은 항상 true
  var fullListKeywords = ['STP 연계 시스템', 'STP연계시스템', 'STP시스템', 'STP 시스템', 'stp연계시스템', 'stp 연계 시스템', '연계 시스템'];
  if (fullListKeywords.some(function(kw) { return lowerText.includes(kw); })) {
    return true;
  }

  // 개별 시스템 키워드 + URL/접속 의도 키워드가 함께 있으면 true
  var hasUrlIntent = SYSTEM_URL_INTENT_KEYWORDS.some(function(kw) { return lowerText.includes(kw); });
  if (hasUrlIntent) return true;

  // 개별 시스템 키워드만 있고 URL 의도도, 설명 의도도 없으면 → AI에 넘김
  return false;
}

/**
 * 사용자가 묻는 시스템 유형 감지
 * 'bpm' | 'eai' | 'srm' | 'easy_erp' | 'itsm' | 'ep' | 'groupmail' | 'all'
 */
function detectSystemType(text) {
  const lower = text.toLowerCase();

  // 개별 시스템 키워드 우선 매칭
  if (/bpm/.test(lower)) return 'bpm';
  if (/eai/.test(lower)) return 'eai';
  if (/srm/.test(lower)) return 'srm';
  if (/easy[\s_]*erp|easyerp/.test(lower)) return 'easy_erp';
  if (/itsm|it[\s_]*sm/.test(lower)) return 'itsm';
  if (/\bep\b/.test(lower)) return 'ep';
  if (/그룹메일|groupmail/.test(lower)) return 'groupmail';

  // 전체 시스템 안내
  return 'all';
}

function buildSystemAnswer(systemType) {
  systemType = systemType || 'all';

  var systemBlocks = {
    bpm: {
      title: '📝 BPM (Business Process Management)',
      html: '<ul style="font-size:13px;line-height:2.0;color:var(--text-secondary);margin:0;">' +
        '<li><strong>BPM 개발:</strong> <a href="http://bpdev.kt.com:8103/bizflow/KTFBPM/ktf_login2.jsp" target="_blank" style="color:#2574A9;text-decoration:none;">http://bpdev.kt.com:8103/bizflow/KTFBPM/ktf_login2.jsp</a></li>' +
        '<li><strong>BPM 품질:</strong> <a href="http://bpdev.kt.com/bizflow/KTFBPM/ktf_login2.jsp" target="_blank" style="color:#2574A9;text-decoration:none;">http://bpdev.kt.com/bizflow/KTFBPM/ktf_login2.jsp</a></li>' +
        '<li><strong>KT CLOUD BPM 개발:</strong> <a href="http://bpmdev.ktcloud.com/bizflow/KTFBPM/ktf_login_ext.jsp?Febbpm!02" target="_blank" style="color:#2574A9;text-decoration:none;">http://bpmdev.ktcloud.com/bizflow/KTFBPM/ktf_login_ext.jsp?Febbpm!02</a></li>' +
        '<li><strong>KT CLOUD BPM 운영:</strong> <a href="http://bpm.ktcloud.com/bizflow/KTERPBPM/log/ds_log/ds_log.jsp" target="_blank" style="color:#2574A9;text-decoration:none;">http://bpm.ktcloud.com/bizflow/KTERPBPM/log/ds_log/ds_log.jsp</a></li>' +
        '</ul>'
    },
    eai: {
      title: '🔗 EAI (Enterprise Application Integration)',
      html: '<ul style="font-size:13px;line-height:2.0;color:var(--text-secondary);margin:0;">' +
        '<li><strong>EAI 개발:</strong> <a href="http://10.217.52.41:8801/EAIAdmin/main/main.jsp" target="_blank" style="color:#2574A9;text-decoration:none;">http://10.217.52.41:8801/EAIAdmin/main/main.jsp</a></li>' +
        '<li><strong>EAI 품질:</strong> <a href="http://10.217.45.82:8811/EAIAdmin/main/main.jsp" target="_blank" style="color:#2574A9;text-decoration:none;">http://10.217.45.82:8811/EAIAdmin/main/main.jsp</a></li>' +
        '<li><strong>EAI 운영:</strong> <a href="http://10.220.18.11:9011/EAIAdmin/main/main.jsp" target="_blank" style="color:#2574A9;text-decoration:none;">http://10.220.18.11:9011/EAIAdmin/main/main.jsp</a></li>' +
        '</ul>'
    },
    easy_erp: {
      title: '💼 Easy ERP',
      html: '<ul style="font-size:13px;line-height:2.0;color:var(--text-secondary);margin:0;">' +
        '<li><strong>Easy ERP 개발:</strong> <a href="http://keddev.kt.com/ERP/cm/view/CMV0010" target="_blank" style="color:#2574A9;text-decoration:none;">http://keddev.kt.com/ERP/cm/view/CMV0010</a></li>' +
        '<li><strong>Easy ERP 품질:</strong> <a href="http://keqqas.kt.com/ERP/cm/view/CMV0010" target="_blank" style="color:#2574A9;text-decoration:none;">http://keqqas.kt.com/ERP/cm/view/CMV0010</a></li>' +
        '<li><strong>Easy ERP 운영:</strong> <a href="http://easyerp.kt.com/ERP/cm/view/CMV0010" target="_blank" style="color:#2574A9;text-decoration:none;">http://easyerp.kt.com/ERP/cm/view/CMV0010</a></li>' + '비밀번호: init1234!' +
        '</ul>'
    },
    itsm: {
      title: '🛠️ ITSM (IT Service Management)',
      html: '<ul style="font-size:13px;line-height:2.0;color:var(--text-secondary);margin:0;">' +
        '<li><strong>사용자:</strong> <a href="https://itsm.ktds.co.kr/kt/index.do" target="_blank" style="color:#2574A9;text-decoration:none;">https://itsm.ktds.co.kr/kt/index.do</a></li>' +
        '<li><strong>운영자:</strong> <a href="http://itsm.ktds.co.kr/oper/index.do" target="_blank" style="color:#2574A9;text-decoration:none;">http://itsm.ktds.co.kr/oper/index.do</a></li>' +
        '</ul>'
    },
    srm: {
      title: '🤝 SRM (Supplier Relationship Management)',
      html: '<ul style="font-size:13px;line-height:2.0;color:var(--text-secondary);margin:0;">' +
        '<li><strong>SRM 개발:</strong> <a href="https://srmdev.kt.com/kt_b0i8t6s2r1m_nigol.jsp" target="_blank" style="color:#2574A9;text-decoration:none;">https://srmdev.kt.com/kt_b0i8t6s2r1m_nigol.jsp</a></li>' +
        '<li><strong>SRM 품질:</strong> <a href="https://srmqa.kt.com/kt_b0i8t6s2r1m_nigol.jsp" target="_blank" style="color:#2574A9;text-decoration:none;">https://srmqa.kt.com/kt_b0i8t6s2r1m_nigol.jsp</a></li>' +
        '</ul>'
    },
    ep: {
      title: '🖥️ EP',
      html: '<ul style="font-size:13px;line-height:2.0;color:var(--text-secondary);margin:0;">' +
        '<li><strong>EP 운영:</strong> <a href="http://biterp.kt.com/" target="_blank" style="color:#2574A9;text-decoration:none;">http://biterp.kt.com/</a></li>' +
        '</ul>'
    },
    groupmail: {
      title: '📬 그룹메일 아카이브 (Groupmail Archive)',
      html: '<ul style="font-size:13px;line-height:2.0;color:var(--text-secondary);margin:0;">' +
        '<li><strong>그룹메일 아카이브:</strong> <a href="https://groupmail.kt.co.kr:8443/" target="_blank" style="color:#2574A9;text-decoration:none;">https://groupmail.kt.co.kr:8443/</a></li>' +
        '</ul>'
    }
  };

  var systemNames = {
    bpm: 'BPM',
    eai: 'EAI',
    easy_erp: 'Easy ERP',
    itsm: 'ITSM',
    srm: 'SRM',
    ep: 'EP',
    groupmail: '그룹메일 아카이브'
  };

  var result = '';

  if (systemType === 'all') {
    // 전체 시스템 안내
    result = '<strong>🖥️ STP 연계 시스템 안내</strong><br/><br/>' +
      '<div style="background:var(--info-bg-light, #E8F4FD);border-left:4px solid #2574A9;padding:12px 16px;border-radius:8px;margin-bottom:16px;">' +
      '<strong>📌 주요 연계 시스템:</strong> BPM, EAI, EASY ERP, SRM, ITSM, EP, 그룹메일</div>';

    var keys = ['eai', 'bpm', 'easy_erp', 'itsm', 'srm', 'ep', 'groupmail'];
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var block = systemBlocks[key];
      result += '<h4 style="color:var(--kt-red);margin:16px 0 10px 0;font-size:15px;">' + block.title + '</h4>' +
        '<div style="background:var(--bg-card, #F5EFE6);border:1px solid var(--border-color);border-radius:8px;padding:14px;margin-bottom:12px;">' +
        block.html + '</div>';
    }
  } else {
    // 개별 시스템만 안내
    var block = systemBlocks[systemType];
    var sysName = systemNames[systemType] || systemType;
    if (block) {
      result = '<strong>🖥️ ' + sysName + ' 접속 주소</strong><br/><br/>' +
        '<div style="background:var(--bg-card, #F5EFE6);border:1px solid var(--border-color);border-radius:8px;padding:14px;">' +
        block.html + '</div>';
    }
  }

  result += '<br/><hr style="border:0;border-top:1px solid var(--border-color);margin:16px 0;">' +
    '<div style="font-size:12px;color:var(--text-muted);line-height:1.6;">' +
    '💡 참고: 각 시스템 접속 시 별도의 인증이 필요할 수 있습니다.<br/>' +
    '문의사항이 있으시면 해당 시스템 담당자에게 연락해 주세요.' +
    '</div>';

  return result;
}

/* ============================================================
    STP Table & T-code 키워드 감지 및 즉시 응답
    ============================================================ */
const TABLE_TCODE_KEYWORDS = [ 'STP Table', 'STP 테이블', 'stp table', 'STP T-Code', 'STP 티코드', 'STP TCode', 'stp tcode' ];

function isTableTcodeQuery(text) {
  const lowerText = text.toLowerCase().trim();
  
  // 에러 관련 키워드는 Table & T-code 로 처리하지 않음
  const errorKeywords = ['에러', 'error', '오류', '확인해줘', '확인해 주세요', '잘못돼', '잘못된', '안돼', '안 되는', '작동 안', '실패', 'exception'];
  if (errorKeywords.some(function(kw) { return lowerText.includes(kw); })) {
    return false;
  }
  
  return TABLE_TCODE_KEYWORDS.some(function(kw) { return lowerText.includes(kw.toLowerCase()); });
}

function buildTableTcodeAnswer() {
  const tableTcodeAnswer =
    '<strong>📋 STP Table & T-Code 가이드</strong><br/><br/>' +
    
    '<h4 style="color:#333333;margin:16px 0 10px 0;font-size:15px;font-weight:700;">🔧 주요 T-Code 목록</h4>' +
    
    '<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px;">' +
      '<thead>' +
        '<tr style="background:linear-gradient(135deg, #6B9AC4, #5A8AB5);color:#fff;">' +
          '<th style="padding:10px;border-radius:4px 0 0 0;">구분</th>' +
          '<th style="padding:10px;">T-Code</th>' +
          '<th style="padding:10px;border-radius:0 4px 0 0;">내역</th>' +
        '</tr>' +
      '</thead>' +
      '<tbody>' +
        '<tr style="background:var(--bg-secondary);"><td style="padding:8px;border:1px solid var(--border-color);"><strong>I/F</strong></td><td style="padding:8px;border:1px solid var(--border-color);font-family:var(--code-font, Consolas, Monaco, monospace);font-weight:600;">ZSBMMTE9003</td><td style="padding:8px;border:1px solid var(--border-color);">I/F 모니터링 - 신설법인</td></tr>' +
        '<tr style="background:var(--bg-card);"><td style="padding:8px;border:1px solid var(--border-color);"><strong>I/F</strong></td><td style="padding:8px;border:1px solid var(--border-color);font-family:monospace;">ZSBMMTE0170</td><td style="padding:8px;border:1px solid var(--border-color);">Interface 재처리 프로그램</td></tr>' +
        '<tr style="background:var(--bg-secondary);"><td style="padding:8px;border:1px solid var(--border-color);"><strong>I/F</strong></td><td style="padding:8px;border:1px solid var(--border-color);font-family:monospace;">ZSHAE0300</td><td style="padding:8px;border:1px solid var(--border-color);">덤프 현행관리</td></tr>' +
        '<tr style="background:var(--bg-card);"><td style="padding:8px;border:1px solid var(--border-color);"><strong>I/F</strong></td><td style="padding:8px;border:1px solid var(--border-color);font-family:monospace;">ZSHAE0500</td><td style="padding:8px;border:1px solid var(--border-color);">배치잡현행관리</td></tr>' +
        '<tr style="background:var(--bg-secondary);"><td style="padding:8px;border:1px solid var(--border-color);"><strong>공통코드</strong></td><td style="padding:8px;border:1px solid var(--border-color);font-family:monospace;">ZSBMMTC0040</td><td style="padding:8px;border:1px solid var(--border-color);">공통코드관리</td></tr>' +
        '<tr style="background:var(--bg-card);"><td style="padding:8px;border:1px solid var(--border-color);"><strong>DIP</strong></td><td style="padding:8px;border:1px solid var(--border-color);font-family:monospace;">ZSBMMTE01902</td><td style="padding:8px;border:1px solid var(--border-color);">DIP 요청관리</td></tr>' +
        '<tr style="background:var(--bg-secondary);"><td style="padding:8px;border:1px solid var(--border-color);"><strong>DIP</strong></td><td style="padding:8px;border:1px solid var(--border-color);font-family:monospace;">ZSBMMTE019021</td><td style="padding:8px;border:1px solid var(--border-color);">DIP 변경계약</td></tr>' +
        '<tr style="background:var(--bg-card);"><td style="padding:8px;border:1px solid var(--border-color);"><strong>DIP</strong></td><td style="padding:8px;border:1px solid var(--border-color);font-family:monospace;">ZSBMMTE019061</td><td style="padding:8px;border:1px solid var(--border-color);">DIP 공사 총액계약 생성</td></tr>' +
        '<tr style="background:var(--bg-secondary);"><td style="padding:8px;border:1px solid var(--border-color);"><strong>DIP</strong></td><td style="padding:8px;border:1px solid var(--border-color);font-family:monospace;">ZSBMMTE019062</td><td style="padding:8px;border:1px solid var(--border-color);">DIP 용역 총액계약 생성</td></tr>' +
        '<tr style="background:var(--bg-card);"><td style="padding:8px;border:1px solid var(--border-color);"><strong>DIP</strong></td><td style="padding:8px;border:1px solid var(--border-color);font-family:monospace;">ZSBMMTE019032</td><td style="padding:8px;border:1px solid var(--border-color);">DIP 용역 단가계약 (렌탈) 생성</td></tr>' +
        '<tr style="background:var(--bg-secondary);"><td style="padding:8px;border:1px solid var(--border-color);"><strong>DIP</strong></td><td style="padding:8px;border:1px solid var(--border-color);font-family:monospace;">ZSBMMTE0350</td><td style="padding:8px;border:1px solid var(--border-color);">용역 단가 (렌탈) 정산요청 프로그램</td></tr>' +
        '<tr style="background:var(--bg-card);"><td style="padding:8px;border:1px solid var(--border-color);"><strong>PR</strong></td><td style="padding:8px;border:1px solid var(--border-color);font-family:monospace;">ZSBMMTW0010</td><td style="padding:8px;border:1px solid var(--border-color);">구매요청 (PR) 결재 요청</td></tr>' +
        '<tr style="background:var(--bg-secondary);"><td style="padding:8px;border:1px solid var(--border-color);"><strong>PO</strong></td><td style="padding:8px;border:1px solid var(--border-color);font-family:monospace;">ZSBMMTE0340</td><td style="padding:8px;border:1px solid var(--border-color);">SRM 사업자 변경 계약 건에 대한 구매문서 생성/변경</td></tr>' +
        '<tr style="background:var(--bg-card);"><td style="padding:8px;border:1px solid var(--border-color);"><strong>SES(기성)</strong></td><td style="padding:8px;border:1px solid var(--border-color);font-family:monospace;">ML81N</td><td style="padding:8px;border:1px solid var(--border-color);">서비스 입력 시트</td></tr>' +
        '<tr style="background:var(--bg-secondary);"><td style="padding:8px;border:1px solid var(--border-color);"><strong>SES(기성)</strong></td><td style="padding:8px;border:1px solid var(--border-color);font-family:monospace;">ZSBMMTE0220</td><td style="padding:8px;border:1px solid var(--border-color);">미처리 내역 확인 및 처리</td></tr>' +
        '<tr style="background:var(--bg-card);"><td style="padding:8px;border:1px solid var(--border-color);"><strong>SES(기성)</strong></td><td style="padding:8px;border:1px solid var(--border-color);font-family:monospace;">ZSBMMTE0600</td><td style="padding:8px;border:1px solid var(--border-color);">선금/차감금 전표 생성</td></tr>' +
        '<tr style="background:var(--bg-secondary);"><td style="padding:8px;border:1px solid var(--border-color);"><strong>IV</strong></td><td style="padding:8px;border:1px solid var(--border-color);font-family:monospace;">ZEVRR0050</td><td style="padding:8px;border:1px solid var(--border-color);">지출결의 생성</td></tr>' +
        '<tr style="background:var(--bg-card);"><td style="padding:8px;border:1px solid var(--border-color);"><strong>IV</strong></td><td style="padding:8px;border:1px solid var(--border-color);font-family:monospace;">ZSBMMTW0030</td><td style="padding:8px;border:1px solid var(--border-color);">지출결의 결재 요청</td></tr>' +
        '<tr style="background:var(--bg-secondary);"><td style="padding:8px;border:1px solid var(--border-color);"><strong>IV</strong></td><td style="padding:8px;border:1px solid var(--border-color);font-family:monospace;">ZSBMMTE0090</td><td style="padding:8px;border:1px solid var(--border-color);">지체상금 송장처리</td></tr>' +
        '<tr style="background:var(--bg-card);"><td style="padding:8px;border:1px solid var(--border-color);"><strong>IV</strong></td><td style="padding:8px;border:1px solid var(--border-color);font-family:monospace;">ZEVRR0030</td><td style="padding:8px;border:1px solid var(--border-color);">[EVR] 전자 (세금) 계산서 모니터링 (STP)</td></tr>' +
        '<tr style="background:var(--bg-secondary);"><td style="padding:8px;border:1px solid var(--border-color);"><strong>Report</strong></td><td style="padding:8px;border:1px solid var(--border-color);font-family:monospace;">ZSBMMTR0110</td><td style="padding:8px;border:1px solid var(--border-color);">구매 상세내역 리포트</td></tr>' +
        '<tr style="background:var(--bg-card);"><td style="padding:8px;border:1px solid var(--border-color);"><strong>Report</strong></td><td style="padding:8px;border:1px solid var(--border-color);font-family:monospace;">ZSBMMTR0040N</td><td style="padding:8px;border:1px solid var(--border-color);">My 구매요청 조회</td></tr>' +
        '<tr style="background:var(--bg-secondary);"><td style="padding:8px;border:1px solid var(--border-color);"><strong>Report</strong></td><td style="padding:8px;border:1px solid var(--border-color);font-family:monospace;">ZSBMMTR0100</td><td style="padding:8px;border:1px solid var(--border-color);">지출결의 상세내역 리포트</td></tr>' +
      '</tbody>' +
    '</table>' +
    
    '<h4 style="color:#333333;margin:16px 0 10px 0;font-size:15px;font-weight:700;">💾 주요 Table 목록</h4>' +
    
    '<table style="width:100%;border-collapse:collapse;font-size:13px;">' +
      '<thead>' +
        '<tr style="background:linear-gradient(135deg, #6B9AC4, #5A8AB5);color:#fff;">' +
          '<th style="padding:10px;border-radius:4px 0 0 0;">구분</th>' +
          '<th style="padding:10px;">테이블</th>' +
          '<th style="padding:10px;">테이블명</th>' +
          '<th style="padding:10px;border-radius:0 4px 0 0;">설명</th>' +
        '</tr>' +
      '</thead>' +
      '<tbody>' +
        '<tr style="background:var(--bg-secondary);"><td style="padding:8px;border:1px solid var(--border-color);"><strong>I/F</strong></td><td style="padding:8px;border:1px solid var(--border-color);font-family:monospace;">ZTSBMMT0500</td><td style="padding:8px;border:1px solid var(--border-color);">[STP 모듈 공통] I/F 로그 관리 테이블</td><td style="padding:8px;border:1px solid var(--border-color);"></td></tr>' +
        '<tr style="background:var(--bg-card);"><td style="padding:8px;border:1px solid var(--border-color);"><strong>ATACAMA</strong></td><td style="padding:8px;border:1px solid var(--border-color);font-family:monospace;">ZTSBMMT0090</td><td style="padding:8px;border:1px solid var(--border-color);">DSS 설계 구매요청 DATA 관리 HEADER</td><td style="padding:8px;border:1px solid var(--border-color);">최초 계약 데이터 (현재 설계 테이블)</td></tr>' +
        '<tr style="background:var(--bg-secondary);"><td style="padding:8px;border:1px solid var(--border-color);"><strong>ATACAMA</strong></td><td style="padding:8px;border:1px solid var(--border-color);font-family:monospace;">ZTSBMMT0091</td><td style="padding:8px;border:1px solid var(--border-color);">DSS 설계 구매요청 DATA 관리 ITEM</td><td style="padding:8px;border:1px solid var(--border-color);"></td></tr>' +
        '<tr style="background:var(--bg-card);"><td style="padding:8px;border:1px solid var(--border-color);"><strong>ATACAMA</strong></td><td style="padding:8px;border:1px solid var(--border-color);font-family:monospace;">ZTSBMMT0090I</td><td style="padding:8px;border:1px solid var(--border-color);">DIP Head Interface 정보</td><td style="padding:8px;border:1px solid var(--border-color);">ATACAM 이력 테이블 (히스토리)</td></tr>' +
        '<tr style="background:var(--bg-secondary);"><td style="padding:8px;border:1px solid var(--border-color);"><strong>ATACAMA</strong></td><td style="padding:8px;border:1px solid var(--border-color);font-family:monospace;">ZTSBMMT0091I</td><td style="padding:8px;border:1px solid var(--border-color);">DIP Item Interface log</td><td style="padding:8px;border:1px solid var(--border-color);"></td></tr>' +
        '<tr style="background:var(--bg-card);"><td style="padding:8px;border:1px solid var(--border-color);"><strong>ATACAMA</strong></td><td style="padding:8px;border:1px solid var(--border-color);font-family:monospace;">ZTSBMMT0090H</td><td style="padding:8px;border:1px solid var(--border-color);">DIP Interface Head History</td><td style="padding:8px;border:1px solid var(--border-color);">변경계약 전 이전 차수 설계 테이블</td></tr>' +
        '<tr style="background:var(--bg-secondary);"><td style="padding:8px;border:1px solid var(--border-color);"><strong>ATACAMA</strong></td><td style="padding:8px;border:1px solid var(--border-color);font-family:monospace;">ZTSBMMT0091H</td><td style="padding:8px;border:1px solid var(--border-color);">DIP Interface Item History</td><td style="padding:8px;border:1px solid var(--border-color);"></td></tr>' +
        '<tr style="background:var(--bg-card);"><td style="padding:8px;border:1px solid var(--border-color);"><strong>DIP</strong></td><td style="padding:8px;border:1px solid var(--border-color);font-family:monospace;">ZTSBMMT0092</td><td style="padding:8px;border:1px solid var(--border-color);">DIP 헤더</td><td style="padding:8px;border:1px solid var(--border-color);"></td></tr>' +
        '<tr style="background:var(--bg-secondary);"><td style="padding:8px;border:1px solid var(--border-color);"><strong>DIP</strong></td><td style="padding:8px;border:1px solid var(--border-color);font-family:monospace;">ZTSBMMT0093</td><td style="padding:8px;border:1px solid var(--border-color);">DIP 품목</td><td style="padding:8px;border:1px solid var(--border-color);"></td></tr>' +
        '<tr style="background:var(--bg-card);"><td style="padding:8px;border:1px solid var(--border-color);"><strong>DIP</strong></td><td style="padding:8px;border:1px solid var(--border-color);font-family:monospace;">ZTSBMMT0092H</td><td style="padding:8px;border:1px solid var(--border-color);">DIP Request Head History</td><td style="padding:8px;border:1px solid var(--border-color);"></td></tr>' +
        '<tr style="background:var(--bg-secondary);"><td style="padding:8px;border:1px solid var(--border-color);"><strong>DIP</strong></td><td style="padding:8px;border:1px solid var(--border-color);font-family:monospace;">ZTSBMMT0093H</td><td style="padding:8px;border:1px solid var(--border-color);">DIP Request Item History</td><td style="padding:8px;border:1px solid var(--border-color);"></td></tr>' +
        '<tr style="background:var(--bg-card);"><td style="padding:8px;border:1px solid var(--border-color);"><strong>BPM</strong></td><td style="padding:8px;border:1px solid var(--border-color);font-family:monospace;">ZTSBMMT0220</td><td style="padding:8px;border:1px solid var(--border-color);">[STP]BPM(결재) 수신 Log</td><td style="padding:8px;border:1px solid var(--border-color);">BPM 모든 이력 테이블 (MM)</td></tr>' +
        '<tr style="background:var(--bg-secondary);"><td style="padding:8px;border:1px solid var(--border-color);"><strong>BPM</strong></td><td style="padding:8px;border:1px solid var(--border-color);font-family:monospace;">ZTSHA1000</td><td style="padding:8px;border:1px solid var(--border-color);">BPM 전자결재 수신 Log</td><td style="padding:8px;border:1px solid var(--border-color);">BPM 모든 연동 테이블</td></tr>' +
        '<tr style="background:var(--bg-card);"><td style="padding:8px;border:1px solid var(--border-color);"><strong>BPM</strong></td><td style="padding:8px;border:1px solid var(--border-color);font-family:monospace;">ZTSHA1001</td><td style="padding:8px;border:1px solid var(--border-color);">BPM 전자결재 수신 Process 별 RFC Mapping</td><td style="padding:8px;border:1px solid var(--border-color);">BPM 유형</td></tr>' +
        '<tr style="background:var(--bg-secondary);"><td style="padding:8px;border:1px solid var(--border-color);"><strong>SRM</strong></td><td style="padding:8px;border:1px solid var(--border-color);font-family:monospace;">ZTSBMMT0531</td><td style="padding:8px;border:1px solid var(--border-color);">SRM 계약진행상태 전송 이력 저장 아이템</td><td style="padding:8px;border:1px solid var(--border-color);"></td></tr>' +
        '<tr style="background:var(--bg-card);"><td style="padding:8px;border:1px solid var(--border-color);"><strong>SRM</strong></td><td style="padding:8px;border:1px solid var(--border-color);font-family:monospace;">ZTSBMMT0040</td><td style="padding:8px;border:1px solid var(--border-color);">SRM 협력사 정보</td><td style="padding:8px;border:1px solid var(--border-color);"></td></tr>' +
        '<tr style="background:var(--bg-secondary);"><td style="padding:8px;border:1px solid var(--border-color);"><strong>SRM</strong></td><td style="padding:8px;border:1px solid var(--border-color);font-family:monospace;">ZTSBMMT0560</td><td style="padding:8px;border:1px solid var(--border-color);">ERP 협력사 생성 및 변경 Log(ERP TO SRM)</td><td style="padding:8px;border:1px solid var(--border-color);"></td></tr>' +
        '<tr style="background:var(--bg-card);"><td style="padding:8px;border:1px solid var(--border-color);"><strong>SRM</strong></td><td style="padding:8px;border:1px solid var(--border-color);font-family:monospace;">ZTSBMMT0630</td><td style="padding:8px;border:1px solid var(--border-color);">사업자 변경 CBO 테이블</td><td style="padding:8px;border:1px solid var(--border-color);"></td></tr>' +
        '<tr style="background:var(--bg-secondary);"><td style="padding:8px;border:1px solid var(--border-color);"><strong>PR</strong></td><td style="padding:8px;border:1px solid var(--border-color);font-family:monospace;">EBAN</td><td style="padding:8px;border:1px solid var(--border-color);">구매 요청</td><td style="padding:8px;border:1px solid var(--border-color);">EBAN 데이터 가지고 SRM 에 호출</td></tr>' +
        '<tr style="background:var(--bg-card);"><td style="padding:8px;border:1px solid var(--border-color);"><strong>PR</strong></td><td style="padding:8px;border:1px solid var(--border-color);font-family:monospace;">EBKN</td><td style="padding:8px;border:1px solid var(--border-color);">구매요청 계정지정</td><td style="padding:8px;border:1px solid var(--border-color);"></td></tr>' +
        '<tr style="background:var(--bg-secondary);"><td style="padding:8px;border:1px solid var(--border-color);"><strong>PO</strong></td><td style="padding:8px;border:1px solid var(--border-color);font-family:monospace;">EKKO</td><td style="padding:8px;border:1px solid var(--border-color);">구매문서헤더</td><td style="padding:8px;border:1px solid var(--border-color);"></td></tr>' +
        '<tr style="background:var(--bg-card);"><td style="padding:8px;border:1px solid var(--border-color);"><strong>PO</strong></td><td style="padding:8px;border:1px solid var(--border-color);font-family:monospace;">EKPO</td><td style="padding:8px;border:1px solid var(--border-color);">구매문서품목</td><td style="padding:8px;border:1px solid var(--border-color);"></td></tr>' +
        '<tr style="background:var(--bg-secondary);"><td style="padding:8px;border:1px solid var(--border-color);"><strong>PO</strong></td><td style="padding:8px;border:1px solid var(--border-color);font-family:monospace;">EKBE</td><td style="padding:8px;border:1px solid var(--border-color);">구매 오더 이력</td><td style="padding:8px;border:1px solid var(--border-color);"></td></tr>' +
        '<tr style="background:var(--bg-card);"><td style="padding:8px;border:1px solid var(--border-color);"><strong>PO</strong></td><td style="padding:8px;border:1px solid var(--border-color);font-family:monospace;">EKKN</td><td style="padding:8px;border:1px solid var(--border-color);">구매 문서의 계정 지정</td><td style="padding:8px;border:1px solid var(--border-color);"></td></tr>' +
        '<tr style="background:var(--bg-secondary);"><td style="padding:8px;border:1px solid var(--border-color);"><strong>PO</strong></td><td style="padding:8px;border:1px solid var(--border-color);font-family:monospace;">ZTSBMMT0120</td><td style="padding:8px;border:1px solid var(--border-color);">SRM I/F PO 생성정보 헤더</td><td style="padding:8px;border:1px solid var(--border-color);">최초계약 (SRM -> SAP)</td></tr>' +
        '<tr style="background:var(--bg-card);"><td style="padding:8px;border:1px solid var(--border-color);"><strong>PO</strong></td><td style="padding:8px;border:1px solid var(--border-color);font-family:monospace;">ZTSBMMT0121</td><td style="padding:8px;border:1px solid var(--border-color);">SRM I/F PO 생성정보 아이템</td><td style="padding:8px;border:1px solid var(--border-color);">최초계약 (SRM -> SAP)</td></tr>' +
        '<tr style="background:var(--bg-secondary);"><td style="padding:8px;border:1px solid var(--border-color);"><strong>PO</strong></td><td style="padding:8px;border:1px solid var(--border-color);font-family:monospace;">ZTSBMMT0350</td><td style="padding:8px;border:1px solid var(--border-color);">SRM Interface 계약/구매오더 생성/변경 Log 헤더</td><td style="padding:8px;border:1px solid var(--border-color);">변경계약 (SRM -> SAP), 사업자변경계약</td></tr>' +
        '<tr style="background:var(--bg-card);"><td style="padding:8px;border:1px solid var(--border-color);"><strong>PO</strong></td><td style="padding:8px;border:1px solid var(--border-color);font-family:monospace;">ZTSBMMT0351</td><td style="padding:8px;border:1px solid var(--border-color);">SRM Interface 계약/구매오더 생성/변경 Log 품목</td><td style="padding:8px;border:1px solid var(--border-color);">변경계약 (SRM -> SAP), 사업자변경계약</td></tr>' +
        '<tr style="background:var(--bg-secondary);"><td style="padding:8px;border:1px solid var(--border-color);"><strong>선급금</strong></td><td style="padding:8px;border:1px solid var(--border-color);font-family:monospace;">ZTSBMMT0540</td><td style="padding:8px;border:1px solid var(--border-color);">선급금 I/F 수신 데이터 이력 저장</td><td style="padding:8px;border:1px solid var(--border-color);"></td></tr>' +
        '<tr style="background:var(--bg-card);"><td style="padding:8px;border:1px solid var(--border-color);"><strong>SES(기성)</strong></td><td style="padding:8px;border:1px solid var(--border-color);font-family:monospace;">ZTSBMMT0510</td><td style="padding:8px;border:1px solid var(--border-color);">SES 생성 SRM I/F 수신 데이터 이력 저장 헤더</td><td style="padding:8px;border:1px solid var(--border-color);"></td></tr>' +
        '<tr style="background:var(--bg-secondary);"><td style="padding:8px;border:1px solid var(--border-color);"><strong>SES(기성)</strong></td><td style="padding:8px;border:1px solid var(--border-color);font-family:monospace;">ZTSBMMT0511</td><td style="padding:8px;border:1px solid var(--border-color);">SES 생성 SRM I/F 수신 데이터 이력 저장 아이템</td><td style="padding:8px;border:1px solid var(--border-color);"></td></tr>' +
        '<tr style="background:var(--bg-card);"><td style="padding:8px;border:1px solid var(--border-color);"><strong>SES(기성)</strong></td><td style="padding:8px;border:1px solid var(--border-color);font-family:monospace;">ESSR</td><td style="padding:8px;border:1px solid var(--border-color);">서비스 입력시 헤더데이터</td><td style="padding:8px;border:1px solid var(--border-color);"></td></tr>' +
        '<tr style="background:var(--bg-secondary);"><td style="padding:8px;border:1px solid var(--border-color);"><strong>자재문서</strong></td><td style="padding:8px;border:1px solid var(--border-color);font-family:monospace;">MKPF</td><td style="padding:8px;border:1px solid var(--border-color);">자재전표 헤더</td><td style="padding:8px;border:1px solid var(--border-color);"></td></tr>' +
        '<tr style="background:var(--bg-card);"><td style="padding:8px;border:1px solid var(--border-color);"><strong>자재문서</strong></td><td style="padding:8px;border:1px solid var(--border-color);font-family:monospace;">MSEG</td><td style="padding:8px;border:1px solid var(--border-color);">자재전표 품목</td><td style="padding:8px;border:1px solid var(--border-color);"></td></tr>' +
        '<tr style="background:var(--bg-secondary);"><td style="padding:8px;border:1px solid var(--border-color);"><strong>IV</strong></td><td style="padding:8px;border:1px solid var(--border-color);font-family:monospace;">ZTEVR0030</td><td style="padding:8px;border:1px solid var(--border-color);">[EVR] 전자세금계산서 AR 데이터 Header 테이블</td><td style="padding:8px;border:1px solid var(--border-color);"></td></tr>' +
        '<tr style="background:var(--bg-card);"><td style="padding:8px;border:1px solid var(--border-color);"><strong>IV</strong></td><td style="padding:8px;border:1px solid var(--border-color);font-family:monospace;">ZTEVR0050</td><td style="padding:8px;border:1px solid var(--border-color);">[EVR] 전자세금계산서 AP 상태관리 Log</td><td style="padding:8px;border:1px solid var(--border-color);">세금계산서 이력</td></tr>' +
        '<tr style="background:var(--bg-secondary);"><td style="padding:8px;border:1px solid var(--border-color);"><strong>IV</strong></td><td style="padding:8px;border:1px solid var(--border-color);font-family:monospace;">ZTEVR0060</td><td style="padding:8px;border:1px solid var(--border-color);">[EVR] 전자세금계산서 AP 상태관리 Header</td><td style="padding:8px;border:1px solid var(--border-color);">세금계산서 헤더</td></tr>' +
        '<tr style="background:var(--bg-card);"><td style="padding:8px;border:1px solid var(--border-color);"><strong>IV</strong></td><td style="padding:8px;border:1px solid var(--border-color);font-family:monospace;">ZTEVR0070</td><td style="padding:8px;border:1px solid var(--border-color);">[EVR] 전자세금계산서 AP 데이터 Header 테이블</td><td style="padding:8px;border:1px solid var(--border-color);">세금계산서 아이템</td></tr>' +
        '<tr style="background:var(--bg-secondary);"><td style="padding:8px;border:1px solid var(--border-color);"><strong>IV</strong></td><td style="padding:8px;border:1px solid var(--border-color);font-family:monospace;">ZTSBMMT0230</td><td style="padding:8px;border:1px solid var(--border-color);">[STP] 협력사 임시송장 결재 상세 내역</td><td style="padding:8px;border:1px solid var(--border-color);"></td></tr>' +
        '<tr style="background:var(--bg-card);"><td style="padding:8px;border:1px solid var(--border-color);"><strong>IV</strong></td><td style="padding:8px;border:1px solid var(--border-color);font-family:monospace;">RBKP</td><td style="padding:8px;border:1px solid var(--border-color);">송장 헤더</td><td style="padding:8px;border:1px solid var(--border-color);"></td></tr>' +
        '<tr style="background:var(--bg-secondary);"><td style="padding:8px;border:1px solid var(--border-color);"><strong>IV</strong></td><td style="padding:8px;border:1px solid var(--border-color);font-family:monospace;">RSEG</td><td style="padding:8px;border:1px solid var(--border-color);">송장 품목</td><td style="padding:8px;border:1px solid var(--border-color);"></td></tr>' +
        '<tr style="background:var(--bg-card);"><td style="padding:8px;border:1px solid var(--border-color);"><strong>FI</strong></td><td style="padding:8px;border:1px solid var(--border-color);font-family:monospace;">BKPF</td><td style="padding:8px;border:1px solid var(--border-color);">회계전표 헤더</td><td style="padding:8px;border:1px solid var(--border-color);"></td></tr>' +
        '<tr style="background:var(--bg-secondary);"><td style="padding:8px;border:1px solid var(--border-color);"><strong>FI</strong></td><td style="padding:8px;border:1px solid var(--border-color);font-family:monospace;">BSEG</td><td style="padding:8px;border:1px solid var(--border-color);">회계전표 품목</td><td style="padding:8px;border:1px solid var(--border-color);"></td></tr>' +
      '</tbody>' +
    '</table>' +
    
    '<br/><hr style="border:0;border-top:1px solid var(--border-color);margin:16px 0;">' +
    '<div style="font-size:12px;color:var(--text-muted);line-height:1.6;">' +
    '📚 참고: 위 T-Code 와 Table 은 STP 모듈 관련 주요 항목입니다.<br/>' +
    '🔍 더 상세한 정보는 SAP 시스템 내 도움말 또는 관련 매뉴얼을 참고해 주세요.' +
    '</div>';
    
  return tableTcodeAnswer;
}

/* ============================================================
    STP 신설법인 프로세스 키워드 감지 및 즉시 응답
    ============================================================ */
const NEW_COMPANY_KEYWORDS = ['신설법인 프로세스','신설법인프로세스','넷코어프로세스','넷코어 프로세스','피엔엠프로세스','피엔엠 프로세스','netcore 프로세스','netcore프로세스', 'NETCORE 프로세스', 'NETCORE프로세스', 'p&m 프로세스','p&m프로세스','P&M프로세스', 'P&M 프로세스' ];

function isNewCompanyQuery(text) {
  // 담당자/연락처 키워드가 포함되면 프로세스가 아닌 담당자 연락처로 처리
  const contactKeywords = ['담당자'];
  if (contactKeywords.some(function(kw) { return text.includes(kw); })) {
    return false;
  }
  return NEW_COMPANY_KEYWORDS.some(function(kw) { return text.includes(kw); });
}

function buildNewCompanyAnswer() {
  const newCompanyProcess =
    '<strong>🏢 신설법인 (Netcore, P&M) 구매 프로세스 가이드</strong><br/><br/>' +
    
    '<div style="background:var(--info-bg-light, #E8F4FD);border-left:4px solid #2574A9;padding:12px 16px;border-radius:8px;margin-bottom:16px;">' +
    '<strong>📌 전체 흐름:</strong> DIP 요청 → BPM 결재 → PR 생성 → SRM 계약 → ERP PO → (선금) → SES → 입고 (GR) → 송장 (I/V) → 지출결의 → 결재 → 지급' +
    '</div>' +
    
    '<h4 style="color:var(--kt-red);margin:16px 0 10px 0;font-size:15px;">📋 1. 구매 기본 정보 관리</h4>' +
    
    '<div style="background:var(--bg-secondary, #FFFDF9);border:1px solid var(--border-color);border-radius:8px;padding:14px;margin-bottom:12px;">' +
    '<strong>① 자재코드</strong><br/>' +
    '<ul style="font-size:13px;line-height:1.8;color:var(--text-secondary);margin-left:12px;">' +
    '<li>신설법인은 <strong>자재코드 미관리</strong>, 자재 구매 없음</li>' +
    '<li>구매 업무는 <strong>KT 프로그램의 업무대행 ID</strong>로 처리</li>' +
    '<li>자재코드는 MDM 시스템에서 생성 후 ERP 로 인터페이스</li>' +
    '</ul>' +
    '</div>' +
    
    '<div style="background:var(--bg-card, #F5EFE6);border:1px solid var(--border-color);border-radius:8px;padding:14px;margin-bottom:12px;">' +
    '<strong>② 벤더 (협력업체) 마스터</strong><br/>' +
    '<ul style="font-size:13px;line-height:1.8;color:var(--text-secondary);margin-left:12px;">' +
    '<li><strong>KT:</strong> 사업자등록번호 기반 코드 생성</li>' +
    '<li><strong>신설법인:</strong> 4~, 5~ 로 시작 (LFA1 에서 사업자번호 조회 가능)</li>' +
    '<li>SAP(FI) 에서 BP 직접 생성 가능하나, <strong>구매조직 확장 불가</strong> → 구매 불가능</li>' +
    '</ul>' +
    '</div>' +
    
    '<h4 style="color:var(--kt-red);margin:16px 0 10px 0;font-size:15px;">💰 2. 계약 유형 및 예산 기준</h4>' +
    
    '<div style="background:var(--kt-red-bg);border-left:4px solid var(--kt-red);padding:12px 16px;border-radius:8px;margin-bottom:12px;">' +
    '<strong>예산 차감 기준:</strong> PR(구매요청) 단계에서 차감 (코스트센터 예산 체크 적용)' +
    '</div>' +
    
    '<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px;">' +
      '<thead>' +
        '<tr style="background:linear-gradient(135deg, #6B9AC4, #5A8AB5);color:#fff;">' +
          '<th style="padding:10px;border-radius:4px 0 0 0;">계약 유형</th>' +
          '<th style="padding:10px;">특징</th>' +
          '<th style="padding:10px;border-radius:0 4px 0 0;">주의사항</th>' +
        '</tr>' +
      '</thead>' +
      '<tbody>' +
        '<tr style="background:var(--bg-secondary, #FFFDF9);">' +
          '<td style="padding:10px;border:1px solid var(--border-color);"><strong>총액계약</strong></td>' +
          '<td style="padding:10px;border:1px solid var(--border-color);">- 계약요청 시 <strong>예산 필수</strong><br/>- 계약금액 전체를 사전에 확보</td>' +
          '<td style="padding:10px;border:1px solid var(--border-color);">예산 확보 후 진행</td>' +
        '</tr>' +
        '<tr style="background:var(--bg-card, #F5EFE6);">' +
          '<td style="padding:10px;border:1px solid var(--border-color);"><strong>단가계약</strong></td>' +
          '<td style="padding:10px;border:1px solid var(--border-color);">- 계약요청 시 <strong>예산 불필요</strong><br/>- 일정 기간 단가만 계약<br/>- 계약 참조 후 기성 기준으로 PO 생성</td>' +
          '<td style="padding:10px;border:1px solid var(--border-color);">유연한 발주 가능</td>' +
        '</tr>' +
      '</tbody>' +
    '</table>' +
    
    '<h4 style="color:var(--kt-red);margin:16px 0 10px 0;font-size:15px;">🔄 3. 상세 업무 흐름</h4>' +
    
    '<div style="background:var(--bg-secondary, #FFFDF9);border:1px solid var(--border-color);border-radius:8px;padding:14px;margin-bottom:12px;">' +
    '<strong>3-1. 계약요청 ~ 계약 완료</strong><br/>' +
    '<div style="font-size:13px;line-height:2.0;color:var(--text-secondary);margin-top:8px;">' +
    '1️⃣ <strong>DIP 요청</strong> (ZSBMMTE019061 / 019062)<br/>' +
    '2️⃣ <strong>BPM 결재</strong><br/>' +
    '3️⃣ <strong>PR 생성</strong> (ME53N) - BPM 승인 시 자동 생성<br/>' +
    '4️⃣ <strong>PR → SRM 전송</strong><br/>' +
    '5️⃣ <strong>SRM 에서 계약 (SES) 생성</strong><br/>' +
    '6️⃣ <strong>ERP PO 생성</strong> (ME23N)<br/>' +
    '7️⃣ <strong>계약 완료</strong>' +
    '</div>' +
    '</div>' +
    
    '<div style="background:var(--warning-bg-light, #FFF8E1);border-left:3px solid #FFA000;padding:12px 16px;border-radius:8px;margin-bottom:12px;">' +
    '<strong>3-1.5. 선금 처리 (선택 사항)</strong><br/>' +
    '<ul style="font-size:13px;line-height:1.6;margin-left:12px;">' +
    '<li>영세 업체 현금 유동성 문제 시 <strong>최초 1 회 선금 지급</strong> 가능</li>' +
    '<li>계약담당자 승인/반려 (ZSBMMTE0220)</li>' +
    '<li>지출결의 전 <strong>선금 차감 필수</strong></li>' +
    '<li>이후 기성 금액에서 <strong>선금 분할 차감</strong> 처리</li>' +
    '</ul>' +
    '</div>' +
    
    '<div style="background:var(--bg-card, #F5EFE6);border:1px solid var(--border-color);border-radius:8px;padding:14px;margin-bottom:12px;">' +
    '<strong>3-2. 기성/준공 처리</strong><br/>' +
    '<ul style="font-size:13px;line-height:1.8;color:var(--text-secondary);margin-left:12px;">' +
    '<li>협력사가 SRM 에서 기성·준공 신청</li>' +
    '<li>ERP 에 SES 자동 생성</li>' +
    '<li>계약담당자 승인</li>' +
    '<li>ERP 입고전표 (GR) 생성</li>' +
    '</ul>' +
    '</div>' +
    
    '<div style="background:var(--bg-secondary, #FFFDF9);border:1px solid var(--border-color);border-radius:8px;padding:14px;margin-bottom:12px;">' +
    '<strong>3-3. 지출 처리</strong><br/>' +
    '<ul style="font-size:13px;line-height:1.8;color:var(--text-secondary);margin-left:12px;">' +
    '<li><strong>지출결의 생성</strong> (ZEVRR0050) - 입고 승인 건만 대상</li>' +
    '<li><strong>세금계산서 처리 방식:</strong>' +
    '<ul>' +
    '<li>역발행: KT 요청 → 협력사 승인 → 국세청 → ERP 임시송장 생성</li>' +
    '<li>정발행: 협력사 발행 → KT 승인 → 국세청 → ERP 송장 연동</li>' +
    '</ul>' +
    '</li>' +
    '<li><strong>지출결의 결재</strong> (ZSBMMTW0030) - 세금계산서 맵핑된 임시송장만 결재 가능</li>' +
    '<li>회계팀 승인 → 전기 처리</li>' +
    '</ul>' +
    '</div>' +
    
    '<h4 style="color:var(--kt-red);margin:16px 0 10px 0;font-size:15px;">⚠️ 4. 참고 사항</h4>' +
    
    '<div style="background:var(--danger-bg-light, #FEEAE6);border-left:4px solid #FF7043;padding:12px 16px;border-radius:8px;margin-bottom:12px;">' +
    '<strong>지체상금</strong><br/>' +
    '<ul style="font-size:13px;line-height:1.6;margin-left:12px;">' +
    '<li>납품일 초과 입고 시 <strong>자동 지체 대상</strong></li>' +
    '<li>지체송장 생성 후 지급 금액에서 차감</li>' +
    '<li>예외처리 가능 (사유 입력)</li>' +
    '</ul>' +
    '</div>' +
    
    '<div style="background:var(--success-bg-light, #E8F5E9);border-left:4px solid #66BB6A;padding:12px 16px;border-radius:8px;">' +
    '<strong>공동수급</strong><br/>' +
    '<ul style="font-size:13px;line-height:1.6;margin-left:12px;">' +
    '<li>SRM 계약 시 공동수급 여부 선택 가능</li>' +
    '<li>입고 (기성) 는 <strong>주계약업체 기준</strong></li>' +
    '<li>송장은 업체별 계약 비율로 분리 발행</li>' +
    '</ul>' +
    '</div>' +
    
    '<br/><hr style="border:0;border-top:1px solid var(--border-color);margin:16px 0;">' +
    '<div style="font-size:12px;color:var(--text-muted);line-height:1.6;">' +
    '📚 상세 문의: KT DS 물류 DX 개발팀 STP 파트 <br/>' +
    '🔗 관련 T-Code: ZSBMMTE01902, ZSBMMTE0220, ME53N, ME23N, ZEVRR0050, ZSBMMTW0030, ZEVRR0030' +
    '</div>' +
    
    '<br/><hr style="border:0;border-top:1px solid var(--border-color);margin:16px 0;">' +
    '<div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:8px;padding:16px;text-align:center;">' +
    '<strong style="color:var(--kt-red);font-size:13px;">📚 관련 매뉴얼</strong><br/><br/>' +
    '<div style="display:flex;flex-wrap:wrap;gap:12px;justify-content:center;">' +
    '<a href="docs/manual/계약부서 매뉴얼.pptx" download style="display:inline-flex;align-items:center;gap:8px;padding:8px 14px;border:1px solid var(--border-color);border-radius:8px;font-size:12px;color:var(--text-secondary);text-decoration:none;transition:var(--transition);">' +
    '<i class="fa-solid fa-file-powerpoint" style="color:#D24726;font-size:14px;"></i> 계약부서 매뉴얼' +
    '</a>' +
    '<a href="docs/manual/Netcore 매뉴얼.pptx" download style="display:inline-flex;align-items:center;gap:8px;padding:8px 14px;border:1px solid var(--border-color);border-radius:8px;font-size:12px;color:var(--text-secondary);text-decoration:none;transition:var(--transition);">' +
    '<i class="fa-solid fa-file-powerpoint" style="color:#D24726;font-size:14px;"></i> Netcore 매뉴얼' +
    '</a>' +
    '<a href="docs/manual/P&M 매뉴얼.pptx" download style="display:inline-flex;align-items:center;gap:8px;padding:8px 14px;border:1px solid var(--border-color);border-radius:8px;font-size:12px;color:var(--text-secondary);text-decoration:none;transition:var(--transition);">' +
    '<i class="fa-solid fa-file-powerpoint" style="color:#D24726;font-size:14px;"></i> P&M 매뉴얼' +
    '</a>' +
    '</div>' +
    '<br/><small style="color:var(--text-muted);display:block;margin-top:8px;">파일을 클릭하면 다운로드됩니다.</small>' +
    '</div>';
    
  return newCompanyProcess;
}

/* ============================================================
    SAP PO 조회 키워드 감지 및 API 호출
    ============================================================ */
const PO_KEYWORDS = [ ];

function isPOQuery(text) {
  const lower = text.toLowerCase();
  
  // 1. PO 키워드가 포함되어야 함
  const hasKeyword = PO_KEYWORDS.some(function(kw) { 
    return lower.includes(kw.toLowerCase()); 
  });
  
  // 2. PO 번호 패턴이 포함되어야 함 (XX-XXXXX 형식 또는 10 자리 숫자)
  const hasPONumber = /(\d{4})-(\d{5})/.test(text) || /\b(\d{10})\b/.test(text);
  
  // 키워드 OR 번호 중 하나라도 있으면 true
  // (번호만 있어도 PO 조회, 키워드 + 번호 조합도 PO 조회)
  return hasKeyword || hasPONumber;
}

// PO 번호 추출 (여러 개 지원)
function extractPONumbers(text) {
  const numbers = [];
  
  // 패턴 1: XX-XXXXX 형식 (예: 2008-00201)
  const matches1 = text.matchAll(/(\d{4})-(\d{5})/g);
  for (const match of matches1) {
    numbers.push(match[0]);
  }
  
  // 패턴 2: 10 자리 숫자 (예: 4500001234)
  const matches2 = text.matchAll(/\b(\d{10})\b/g);
  for (const match of matches2) {
    numbers.push(match[1]);
  }
  
  // 중복 제거
  return [...new Set(numbers)];
}

// 단일 PO 번호 추출 (하위 호환성)
function extractPONumber(text) {
  const numbers = extractPONumbers(text);
  return numbers.length > 0 ? numbers[0] : null;
}

// SAP PO API 호출 - 특정 PO 조회
async function fetchPOInfo(poNumber) {
  console.log('[DEBUG] fetchPOInfo called with:', poNumber);
  try {
    console.log('[DEBUG] Fetching from:', 'http://localhost:3000/api/po-headers/' + poNumber);
    const response = await fetch('http://localhost:3000/api/po-headers/' + poNumber);
    console.log('[DEBUG] Response status:', response.status);
    const result = await response.json();
    console.log('[DEBUG] API Result:', result);
    
    if (result.success && result.data) {
      const data = result.data;
      console.log('[DEBUG] Data found:', data);
      return '<div style="background:linear-gradient(135deg, #667eea 0%, #764ba2 100%);border-radius:10px;padding:12px;margin:12px 0;box-shadow:0 3px 10px rgba(102, 126, 234, 0.3);">' +
        '<div style="color:#fff;margin-bottom:8px;">' +
        '<strong style="font-size:13px;">📋 PO 정보</strong>' +
        '</div>' +
        '<div style="background:rgba(255,255,255,0.15);backdrop-filter:blur(10px);border-radius:6px;padding:8px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 4px;border-bottom:1px solid rgba(255,255,255,0.2);gap:12px;">' +
        '<span style="color:rgba(255,255,255,0.85);font-size:11px;flex:0 0 40%;">구매오더 번호</span>' +
        '<span style="color:#fff;font-weight:600;font-size:12px;white-space:nowrap;background:rgba(255,255,255,0.2);padding:3px 8px;border-radius:3px;flex:0 0 auto;">' + data.PurchaseOrder + '</span>' +
        '</div>' +
        '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 4px;border-bottom:1px solid rgba(255,255,255,0.2);gap:12px;">' +
        '<span style="color:rgba(255,255,255,0.85);font-size:11px;flex:0 0 40%;">회사코드</span>' +
        '<span style="color:#fff;font-weight:500;white-space:nowrap;flex:0 0 auto;">' + data.CompanyCode + '</span>' +
        '</div>' +
        '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 4px;border-bottom:1px solid rgba(255,255,255,0.2);gap:12px;">' +
        '<span style="color:rgba(255,255,255,0.85);font-size:11px;flex:0 0 40%;">문서유형</span>' +
        '<span style="color:#fff;font-weight:500;white-space:nowrap;flex:0 0 auto;">' + data.DocumentType + '</span>' +
        '</div>' +
        '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 4px;border-bottom:1px solid rgba(255,255,255,0.2);gap:12px;">' +
        '<span style="color:rgba(255,255,255,0.85);font-size:11px;flex:0 0 40%;">구매조직</span>' +
        '<span style="color:#fff;font-weight:500;white-space:nowrap;flex:0 0 auto;">' + data.PurchOrg + '</span>' +
        '</div>' +
        '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 4px;gap:12px;">' +
        '<span style="color:rgba(255,255,255,0.85);font-size:11px;flex:0 0 40%;">구매그룹</span>' +
        '<span style="color:#fff;font-weight:500;white-space:nowrap;flex:0 0 auto;">' + data.PurchGroup + '</span>' +
        '</div>' +
        '</div>' +
        '</div>';
    } else {
      console.log('[DEBUG] No data found in result:', result);
      return '❌ PO 정보를 찾을 수 없습니다.<br/>오류: ' + (result.error || '알 수 없는 오류');
    }
  } catch (error) {
    return '❌ SAP API 연결 실패.<br/>오류: ' + error.message;
  }
}

// PO 목록 조회
async function fetchPOList(top = 10) {
  try {
    const response = await fetch('http://localhost:3000/api/po-headers?top=' + top);
    const result = await response.json();
    
    if (result.success && result.data && result.data.value && result.data.value.length > 0) {
      var html = '<strong>📋 최신 PO 목록 (최신 ' + result.data.value.length + '건)</strong><br/><br/>';
      html += '<table style="width:100%;border-collapse:collapse;font-size:13px;">';
      html += '<tr style="background:var(--kt-red);color:#fff;">';
      html += '<th style="padding:8px;">구매오더</th>';
      html += '<th style="padding:8px;">회사코드</th>';
      html += '<th style="padding:8px;">문서유형</th>';
      html += '<th style="padding:8px;">구매그룹</th>';
      html += '</tr>';
      
      result.data.value.forEach(function(po) {
        html += '<tr style="background:var(--bg-secondary);">';
        html += '<td style="padding:8px;border:1px solid var(--border-color);">' + po.PurchaseOrder + '</td>';
        html += '<td style="padding:8px;border:1px solid var(--border-color);">' + po.CompanyCode + '</td>';
        html += '<td style="padding:8px;border:1px solid var(--border-color);">' + po.DocumentType + '</td>';
        html += '<td style="padding:8px;border:1px solid var(--border-color);">' + po.PurchGroup + '</td>';
        html += '</tr>';
      });
      
      html += '</table>';
      return html;
    } else {
      return '📭 조회된 PO 가 없습니다.';
    }
  } catch (error) {
    return '❌ SAP API 연결 실패.<br/>오류: ' + error.message;
  }
}

/* ============================================================
    STP MM 연동&배치 키워드 감지 및 즉시 응답
    ============================================================ */
const MM_INTEGRATION_KEYWORDS = ['MM 연동', 'MM 연동&배치', 'STP MM RFC&배치', 'MM RFC & 배치'];

function isDeployProcessQuery(text) {
  return MM_INTEGRATION_KEYWORDS.some(function(kw) { return text.includes(kw); });
}

function buildDeployProcessAnswer() {
  const deployProcess =
    '<strong>🚀 STP 배포 프로세스 가이드</strong><br/><br/>' +
    
    '<div style="background:var(--kt-red-bg);border-left:4px solid var(--kt-red);padding:12px 16px;border-radius:8px;margin-bottom:16px;">' +
    '<strong>⚠️ 중요:</strong> 모든 배포는 사전 승인 절차를 거쳐야 하며, 비업무 시간대 (18:00~06:00) 에 진행됩니다.' +
    '</div>' +
    
    '<h4 style="color:var(--kt-red);margin:16px 0 10px 0;font-size:15px;">📋 1. 배포 전 준비사항</h4>' +
    '<table style="width:100%;border-collapse:collapse;font-size:13px;">' +
      '<tr style="background:var(--dark-card);">' +
        '<td style="padding:8px 12px;border:1px solid var(--dark-border);width:25%"><strong>1. 배포 계획서 작성</strong></td>' +
        '<td style="padding:8px 12px;border:1px solid var(--dark-border);">- 배포 내용, 일정, 영향도 분석<br/>- 롤백 계획 포함</td>' +
      '</tr>' +
      '<tr style="background:var(--dark-bg);">' +
        '<td style="padding:8px 12px;border:1px solid var(--dark-border);"><strong>2. QA 검증 완료</strong></td>' +
        '<td style="padding:8px 12px;border:1px solid var(--dark-border);">- QA 팀의 배포 승인서 (Release Approval)<br/>- 테스트 결과서 첨부</td>' +
      '</tr>' +
      '<tr style="background:var(--dark-card);">' +
        '<td style="padding:8px 12px;border:1px solid var(--dark-border);"><strong>3. 배포 승인 요청</strong></td>' +
        '<td style="padding:8px 12px;border:1px solid var(--dark-border);">- ITSM 의 "배포 승인" 워크플로우 이용<br/>- 최소 3 영업일 전 신청</td>' +
      '</tr>' +
    '</table>' +
    
    '<h4 style="color:var(--kt-red);margin:16px 0 10px 0;font-size:15px;">🔄 2. 배포 절차</h4>' +
    '<div style="background:var(--dark-surface);border:1px solid var(--dark-border);border-radius:8px;padding:12px;font-size:13px;line-height:1.8;">' +
    '1️⃣ <strong>배포 요청</strong> → ITSM "배포 관리" 메뉴에서 신청<br/>' +
    '2️⃣ <strong>승인 심사</strong> → CAB(변경자문위원회) 승인 (필요시)<br/>' +
    '3️⃣ <strong>배포 전 브리핑</strong> → 배포 1 시간 전 관련자 알림<br/>' +
    '4️⃣ <strong>배포 실행</strong> → 배포 스크립트 수행 및 검증<br/>' +
    '5️⃣ <strong>배포 완료 보고</strong> → ITSM 에 결과 등록 및 관련자 알림<br/>' +
    '</div>' +
    
    '<h4 style="color:var(--kt-red);margin:16px 0 10px 0;font-size:15px;">📅 3. 배포 일정</h4>' +
    '<table style="width:100%;border-collapse:collapse;font-size:13px;">' +
      '<thead>' +
        '<tr style="background:var(--kt-red);color:#fff;">' +
          '<th style="padding:8px 12px;text-align:center;">배포 유형</th>' +
          '<th style="padding:8px 12px;text-align:center;">실시 시간</th>' +
          '<th style="padding:8px 12px;text-align:center;">주의사항</th>' +
        '</tr>' +
      '</thead>' +
      '<tbody>' +
        '<tr style="background:var(--dark-card);">' +
          '<td style="padding:8px 12px;border:1px solid var(--dark-border);text-align:center;"><strong>정기 배포</strong></td>' +
          '<td style="padding:8px 12px;border:1px solid var(--dark-border);text-align:center;">화/목 18:00~22:00</td>' +
          '<td style="padding:8px 12px;border:1px solid var(--dark-border);text-align:center;">주말 배포 금지</td>' +
        '</tr>' +
        '<tr style="background:var(--dark-bg);">' +
          '<td style="padding:8px 12px;border:1px solid var(--dark-border);text-align:center;"><strong>긴급 배포</strong></td>' +
          '<td style="padding:8px 12px;border:1px solid var(--dark-border);text-align:center;">24 시간 (승인 필요)</td>' +
          '<td style="padding:8px 12px;border:1px solid var(--dark-border);text-align:center;">CAB 승인 필수</td>' +
        '</tr>' +
        '<tr style="background:var(--dark-card);">' +
          '<td style="padding:8px 12px;border:1px solid var(--dark-border);text-align:center;"><strong>월말 배포</strong></td>' +
          '<td style="padding:8px 12px;border:1px solid var(--dark-border);text-align:center;">말일 전일 18:00~24:00</td>' +
          '<td style="padding:8px 12px;border:1px solid var(--dark-border);text-align:center;">월마감 영향 확인</td>' +
        '</tr>' +
      '</tbody>' +
    '</table>' +
    
    '<h4 style="color:var(--kt-red);margin:16px 0 10px 0;font-size:15px;">🔧 4. 배포 도구</h4>' +
    '<ul style="font-size:13px;line-height:1.8;color:var(--text-secondary);">' +
    '<li><strong>CI/CD:</strong> Jenkins, GitLab CI</li>' +
    '<li><strong>배포 자동화:</strong> Ansible, Chef, Puppet</li>' +
    '<li><strong>컨테이너:</strong> Docker, Kubernetes</li>' +
    '<li><strong>모니터링:</strong> Splunk, Zabbix, ELK</li>' +
    '</ul>' +
    
    '<h4 style="color:var(--kt-red);margin:16px 0 10px 0;font-size:15px;">⚠️ 5. 주의사항</h4>' +
    '<div style="background:#FFF3CD;border-left:4px solid #FFC107;padding:12px 16px;border-radius:8px;font-size:13px;line-height:1.6;">' +
    '🔸 배포 2 시간 전까지 <strong>롤백 계획</strong> 반드시 준비<br/>' +
    '🔸 배포 중 장애 발생 시 즉시 <strong>롤백</strong> 절차 수행<br/>' +
    '🔸 배포 완료 후 <strong>1 시간 이내</strong> 모니터링 집중<br/>' +
    '🔸 월마감 기간 (말일 - 익일 09:00) 배포 금지<br/>' +
    '🔸 중요한 배포는 <strong>CAB 승인</strong> 필수<br/>' +
    '</div>' +
    
    '<br/><hr style="border:0;border-top:1px solid var(--border-color);margin:10px 0;">' +
    '<div style="font-size:12px;color:var(--text-muted);line-height:1.6;">' +
    '📞 배포 관련 문의: <strong>배포관리팀 (내선 1234)</strong><br/>' +
    '📧 Email: <strong>deploy@ktds.com</strong><br/>' +
    '🌐 ITSM: <strong>https://itsms.ktds.com → 배포 관리</strong>' +
    '</div>';
    
  return deployProcess;
}

/* ============================================================
    DOM REFS
   ============================================================ */
const $chatMessages   = document.getElementById('chatMessages');
const $userInput      = document.getElementById('userInput');
const $sendBtn        = document.getElementById('sendBtn');
const $charCount      = document.getElementById('charCount');
const $msgCategory    = document.getElementById('msgCategory');
const $newChatBtn     = document.getElementById('newChatBtn');
const $clearBtn       = document.getElementById('clearBtn');
const $exportBtn      = document.getElementById('exportBtn');
const $statTotal      = document.getElementById('stat-total');
const $statResolved   = document.getElementById('stat-resolved');
const $statPending    = document.getElementById('stat-pending');
const $statAvg        = document.getElementById('stat-avg');
const $historyList    = document.getElementById('historyList');
const $historySearch  = document.getElementById('historySearch');
const $toastContainer = document.getElementById('toastContainer');

/* 파일 첨부 관련 DOM refs */
const $fileAttachBtn  = document.getElementById('fileAttachBtn');
const $imageAttachBtn = document.getElementById('imageAttachBtn');
const $fileInput      = document.getElementById('fileInput');
const $imageInput     = document.getElementById('imageInput');
const $attachedFiles  = document.getElementById('attachedFiles');

/* ============================================================
    IMAGE PREVIEW MODAL (Lightbox)
   ============================================================ */
const $imagePreviewModal   = document.getElementById('imagePreviewModal');
const $imagePreviewImg     = document.getElementById('imagePreviewImg');
const $imagePreviewCounter = document.getElementById('imagePreviewCounter');
const $closeImagePreviewBtn = document.getElementById('closeImagePreviewBtn');
const $prevImageBtn        = document.getElementById('prevImageBtn');
const $nextImageBtn        = document.getElementById('nextImageBtn');

let currentImageIndex = 0;
let currentImageList  = [];

function openImagePreview(imageSrc, allImages, index) {
  currentImageList  = allImages || [imageSrc];
  currentImageIndex = index !== undefined ? index : 0;
  updateImagePreview();
  $imagePreviewModal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeImagePreview() {
  $imagePreviewModal.style.display = 'none';
  document.body.style.overflow = '';
  currentImageList = [];
}

function updateImagePreview() {
  if (currentImageList.length === 0) return;
  currentImageIndex = Math.max(0, Math.min(currentImageIndex, currentImageList.length - 1));
  $imagePreviewImg.src = currentImageList[currentImageIndex];

  if (currentImageList.length > 1) {
    $imagePreviewCounter.textContent = (currentImageIndex + 1) + ' / ' + currentImageList.length;
    $imagePreviewCounter.style.display = 'block';
    $prevImageBtn.style.display = 'flex';
    $nextImageBtn.style.display = 'flex';
  } else {
    $imagePreviewCounter.style.display = 'none';
    $prevImageBtn.style.display = 'none';
    $nextImageBtn.style.display = 'none';
  }
}

function navigateImagePreview(direction) {
  if (currentImageList.length <= 1) return;
  currentImageIndex += direction;
  if (currentImageIndex < 0) currentImageIndex = currentImageList.length - 1;
  if (currentImageIndex >= currentImageList.length) currentImageIndex = 0;
  updateImagePreview();
}

// Modal 이벤트 바인딩
if ($closeImagePreviewBtn) {
  $closeImagePreviewBtn.addEventListener('click', closeImagePreview);
}
if ($prevImageBtn) {
  $prevImageBtn.addEventListener('click', function() { navigateImagePreview(-1); });
}
if ($nextImageBtn) {
  $nextImageBtn.addEventListener('click', function() { navigateImagePreview(1); });
}
if ($imagePreviewModal) {
  // 모달 배경 클릭 시 닫기
  $imagePreviewModal.addEventListener('click', function(e) {
    if (e.target === $imagePreviewModal || e.target.classList.contains('image-preview-container')) {
      closeImagePreview();
    }
  });
}

// 키보드 네비게이션
document.addEventListener('keydown', function(e) {
  if ($imagePreviewModal && $imagePreviewModal.style.display !== 'none') {
    if (e.key === 'Escape') closeImagePreview();
    if (e.key === 'ArrowLeft') navigateImagePreview(-1);
    if (e.key === 'ArrowRight') navigateImagePreview(1);
  }
});

/**
 * 모든 이미지 요소에 클릭 이벤트 바인딩 (delegate 패턴)
 * - 첨부 미리보기 썸네일
 * - 채팅 메시지 내 이미지
 */
function bindImageClickHandlers() {
  // 첨부 미리보기 이미지
  document.querySelectorAll('.attachment-preview').forEach(function(img) {
    img.addEventListener('click', function(e) {
      e.stopPropagation();
      // 현재 화면의 모든 이미지 수집
      const allImages = collectAllClickableImages();
      const idx = allImages.indexOf(this.src);
      openImagePreview(this.src, allImages, idx >= 0 ? idx : 0);
    });
  });

  // 채팅 메시지 내 이미지 (msg-bubble img + attBox img)
  document.querySelectorAll('.msg-bubble img, .msg-content img').forEach(function(img) {
    // 이미 바인딩된 경우 중복 방지
    if (!img.dataset.imageBound) {
      img.dataset.imageBound = 'true';
      img.addEventListener('click', function(e) {
        e.stopPropagation();
        const allImages = collectAllClickableImages();
        const idx = allImages.indexOf(this.src);
        openImagePreview(this.src, allImages, idx >= 0 ? idx : 0);
      });
    }
  });
}

/**
 * 현재 화면에서 클릭 가능한 모든 이미지 src 수집
 */
function collectAllClickableImages() {
  const seen = new Set();
  const images = [];
  document.querySelectorAll('.attachment-preview, .msg-bubble img, .msg-content img').forEach(function(img) {
    if (img.src && !seen.has(img.src)) {
      seen.add(img.src);
      images.push(img.src);
    }
  });
  return images;
}

// DOMContentLoaded 시 초기 바인딩 + MutationObserver 로 동적 이미지 감지
document.addEventListener('DOMContentLoaded', function() {
  bindImageClickHandlers();

  // 동적으로 추가되는 이미지를 감지하여 클릭 핸들러 바인딩
  const observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      mutation.addedNodes.forEach(function(node) {
        if (node.nodeType !== 1) return; // ElementNode 아님
        // node 자체가 이미지인 경우
        if (node.tagName === 'IMG' && (node.classList.contains('attachment-preview') || node.closest('.msg-bubble, .msg-content'))) {
          if (!node.dataset.imageBound) {
            node.dataset.imageBound = 'true';
            node.addEventListener('click', function(e) {
              e.stopPropagation();
              const allImages = collectAllClickableImages();
              const idx = allImages.indexOf(this.src);
              openImagePreview(this.src, allImages, idx >= 0 ? idx : 0);
            });
          }
        }
        // node 자손에 이미지가 있는 경우
        const childImgs = node.querySelectorAll ? node.querySelectorAll('img') : [];
        childImgs.forEach(function(img) {
          if (!img.dataset.imageBound) {
            img.dataset.imageBound = 'true';
            img.addEventListener('click', function(e) {
              e.stopPropagation();
              const allImages = collectAllClickableImages();
              const idx = allImages.indexOf(this.src);
              openImagePreview(this.src, allImages, idx >= 0 ? idx : 0);
            });
          }
        });
      });
    });
  });

  if ($chatMessages) {
    observer.observe($chatMessages, { childList: true, subtree: true });
  }
  if ($attachedFiles) {
    observer.observe($attachedFiles, { childList: true, subtree: true });
  }
});

/* ============================================================
    TABS
   ============================================================ */
document.querySelectorAll('.nav-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    const tab = btn.dataset.tab;
    document.querySelectorAll('.nav-btn').forEach(function(b) { b.classList.remove('active'); });
    btn.classList.add('active');
    document.querySelectorAll('.tab-section').forEach(function(s) { s.classList.remove('active'); });
    const tabEl = document.getElementById('tab-' + tab);
    if (tabEl) tabEl.classList.add('active');
    if (tab === 'history') renderHistory('');
  });
});

/* ============================================================
    CATEGORY SIDEBAR
   ============================================================ */
document.querySelectorAll('.category-item').forEach(function(item) {
  item.addEventListener('click', function() {
    document.querySelectorAll('.category-item').forEach(function(i) { i.classList.remove('active'); });
    item.classList.add('active');
    const label = item.querySelector('span');
    const category = item.dataset.category;
    
    // 카테고리별 고정답변 표시
    const bubble = createAgentBubble(category);
    
    switch(category) {
      case 'all':
        if (bubble) bubble.innerHTML = '<strong>👋 전체 문의 카테고리</strong><br/><br/>다양한 업무 카테고리가 있습니다.<br/>왼쪽 목록에서 원하는 카테고리를 선택하거나 직접 질문해 주세요.<br/><br/>주요 지원 분야:<br/>• SAP MM 모듈<br/>• Table & T-code<br/>• 신설법인 프로세스<br/>• STP 연계 시스템<br/>• MM 연동&배치<br/>• 담당자 연락처';
        break;
        
      case 'sap_mm':
        if (bubble) bubble.innerHTML = '<strong>📦 SAP MM (Material Management) 모듈</strong><br/><br/>' +
          '<div style="background:var(--info-bg-light, #E8F4FD);border-left:4px solid #2574A9;padding:12px 16px;border-radius:8px;margin:12px 0;">' +
          '<strong>SAP MM 은 자재 관리 및 구매 프로세스를 통합 관리하는 모듈</strong>입니다.' +
          '</div>' +
          '<h4 style="color:var(--kt-red);margin:16px 0 10px 0;font-size:15px;">🎯 주요 기능</h4>' +
          '<ul style="font-size:13px;line-height:2.0;color:var(--text-secondary);margin-left:12px;">' +
          '<li><strong>구매 프로세스</strong> - PR(구매요청) → PO(구매주문) → 입고 → 송장 처리</li>' +
          '<li><strong>자재 관리</strong> - 자재 마스터, 재고 관리, 이동</li>' +
          '<li><strong>공급업체 관리</strong> - 벤더 마스터, 계약 관리</li>' +
          '<li><strong>품질 관리</strong> - 입고 검사, 품질 검사</li>' +
          '</ul>' +
          '<h4 style="color:var(--kt-red);margin:16px 0 10px 0;font-size:15px;">📌 주요 T-Code</h4>' +
          '<ul style="font-size:13px;line-height:1.8;color:var(--text-secondary);margin-left:12px;">' +
          '<li><strong>ME21N</strong> - 구매주문 생성</li>' +
          '<li><strong>ME22N</strong> - 구매주문 변경</li>' +
          '<li><strong>ME23N</strong> - 구매주문 조회</li>' +
          '<li><strong>MIGO</strong> - 자재 이동 (입고/출고)</li>' +
          '<li><strong>MIRO</strong> - 송장 처리</li>' +
          '<li><strong>MMBE</strong> - 재고 조회</li>' +
          '</ul>' +
          '<br/><div style="font-size:12px;color:var(--text-muted);">더 구체적인 질문을 해주시면 상세히 안내해 드립니다.</div>';
        break;
        
      case 'data':
        if (bubble) bubble.innerHTML = buildTableTcodeAnswer();
        break;
        
      case 'system':
        if (bubble) bubble.innerHTML = buildNewCompanyAnswer();
        break;
        
      case 'account':
        if (bubble) bubble.innerHTML = buildSystemAnswer('all');
        break;
        
      case 'deploy':
        if (bubble) bubble.innerHTML = buildMMIntegrationAnswer();
        break;
        
      case 'security':
        if (bubble) bubble.innerHTML = buildContactAnswer();
        break;
        
      case 'etc':
        if (bubble) bubble.innerHTML = `
        <strong>❓ 기타 문의</strong><br/><br/>
        SAP MM 및 STP 업무와 관련된 다른 질문이 있으시면 자유롭게 말씀해 주세요.<br/><br/>
        AI 에이전트가 가능한 범위 내에서 정확한 답변을 드립니다.
        `;
        break;

      case 'works':
        if (bubble) bubble.innerHTML = `
            <div>
              <div class="quick-btns">
                <button onclick="openPage('workinghome')" class="quick-btn">
                  <i class="fa-solid fa-house-chimney-user"></i> 재택근무 신청</button>
                <button onclick="openPage('overtime')" class="quick-btn">
                  <i class="fa-solid fa-clock-rotate-left"></i> 초과근무 신청</button>
                <button onclick="openPage('holiday')" class="quick-btn">
                  <i class="fa-solid fa-umbrella-beach"></i> 휴가 신청</button>
                <button onclick="openPage('businesstrip')" class="quick-btn">
                  <i class="fa-solid fa-plane-departure"></i> 출장 신청</button>
                <button onclick="openPage('smartwork')" class="quick-btn">
                  <i class="fa-solid fa-computer"></i> 스마트워크 예약</button>
                <button onclick="openPage('meeting')" class="quick-btn">
                  <i class="fa-solid fa-people-group + fa-door-open"></i> 회의실 예약</button>
                <button onclick="openPage('market')" class="quick-btn">
                  <i class="fa-solid fa-hand-holding-heart"></i> ds 나눔장터</button>
              </div>
            </div>
            `;
        break;

        case 'shortcut':
        if (bubble) bubble.innerHTML = `
            <div>
              <div class="quick-btns">
                <button onclick="openPage('weeklyreport')" class="quick-btn">
                  <i class="fa-solid fa-users-viewfinder"></i> 주간 보고</button>
                <button onclick="openPage('kms')" class="quick-btn">
                  <i class="fa-solid fa-folder-open"></i> MM(계약/구매/물류) 산출물</button>
                <button onclick="openPage('tms')" class="quick-btn">
                  <i class="fa-solid fa-share-nodes"></i> TMS</button>
                <button onclick="openPage('tms_team')" class="quick-btn">
                  <i class="fa-solid fa-share-nodes"></i> TMS(팀)</button>
                <button onclick="openPage('tms_stp')" class="quick-btn">
                  <i class="fa-solid fa-share-nodes"></i> TMS(STP)</button>
                <button onclick="openPage('ehp')" class="quick-btn">
                  <i class="fa-solid fa-code-branch"></i> 프로그램/연동/배치</button>
                <button onclick="openPage('FAQ')" class="quick-btn">
                  <i class="fa-solid fa-clipboard-list"></i> MM 문의 정리</button>
              </div>
            </div>
            `;
        break;

      default:
        if (bubble) bubble.innerHTML = `
        <strong>📋 카테고리 정보</strong><br/><br/>
        선택하신 카테고리에 대한 정보를 제공합니다.<br/>
        구체적인 질문을 해주시면 더 상세한 답변을 드립니다.
        `;
    }
    
    scrollBottom();
    showToast(getCategoryLabel(category) + ' 정보 표시됨', 'info');
  });
});

/* BJH
하위 트리 bubble용
document.querySelectorAll('.tree-title').forEach(function(item) {
  item.addEventListener('click', function() {
    document.querySelectorAll('.tree-title').forEach(function(i) { i.classList.remove('active'); });
    item.classList.add('active');

    const category = item.dataset.category;
    const bubble = createAgentBubble(category);
    
    switch(category) {
      case 'company':
        if (bubble) bubble.innerHTML = buildNewCompanyAnswer();
        break;
    }
    showToast(getCategoryLabel(category) + ' 정보 표시됨', 'info');
  });
});
*/

/* ============================================================
    STP MM 연동&배치 답변 함수
    ============================================================ */
function buildMMIntegrationAnswer() {
  const mmIntegrationAnswer = `
    <h4 style="font-size:15px;color:var(--text-primary);">🔗 MM 프로그램/연동/배치</h4>
    <a href="https://gdrive.kt.co.kr/channel/968/edit?itemIdx=321110" target="_blank" rel="noopener noreferrer" style="color:var(--text-secondary);font-size:13px;text-decoration:underline;">
      <i class="fa-solid fa-external-link-alt" style="font-size:11px;"></i> MM(STP/SCP) 프로그램/연동/배치 리스트
    </a><br/><br/>

    <h4 style="font-size:15px;color:var(--text-primary);">🔗 J-FLOW 소개</h4>
    <div style="background:var(--bg-card);border-left:4px solid var(--kt-red);padding:16px 20px;border-radius:8px;margin-bottom:20px;color:var(--text-secondary);">
      <strong>J-FLOW 는 KT DS 전사 Batch 작업 통합 시스템</strong><br/><br/>
      기업 내 배치작업에 대한 계획 및 수행정보를 파악하여 업무의 가용성을 보증하여 업무 효율성을 높이며<br/>
      <strong>장애 발생을 사전에 예방하는 시스템</strong>입니다.
    </div>

    <h4 style="color:var(--kt-red);margin:20px 0 12px 0;font-size:15px;">🎯 주요 기능</h4>
    <ul style="font-size:13px;line-height:2.0;color:var(--text-secondary);">
      <li><strong>배치 작업 통합 관리</strong> - 전사 배치작업의 계획 및 수행 상태 모니터링</li>
      <li><strong>업무 가용성 보증</strong> - 작업 순서 및 의존성 관리로 정상 운영 보장</li>
      <li><strong>효율성 향상</strong> - 자동화된 작업 스케줄링으로 인력 절감</li>
      <li><strong>장애 예방</strong> - 이상 징후 조기 감지 및 사전 대응</li>
    </ul>

    <div style="background:var(--bg-card);border-left:4px solid var(--kt-blue);border-radius:8px;padding:14px 16px;margin:20px 0;">
      <strong style="color:var(--kt-blue);font-size:14px;">📌 별첨: J-FLOW 작업 등록 시 주의사항</strong><br/><br/>
      <div style="font-size:13px;line-height:1.8;color:var(--text-secondary);">
        <strong>1. 작업 등록</strong><br/>
        J-FLOW 시스템에서 배치 작업을 등록할 때 <strong>변형 (Variant)</strong> 값을 등록할 수 있습니다.<br/><br/>

        <strong>2. 결재 절차</strong><br/>
        작업을 등록하면 <strong>KT 경영플랫폼 팀</strong>에서 결재 절차를 진행합니다.<br/><br/>

        <strong>3. 변형 값 등록 시 오류 발생 (⚠️ 중요)</strong><br/>
        <div style="background:var(--warning-bg,var(--bg-hover));border-left:3px solid var(--warning-color,#FFC107);padding:10px 12px;border-radius:4px;margin:8px 0;">
          <strong>원인:</strong> 변형 값을 <strong>한글</strong>로 등록하면 Control-M 시스템이 인식하지 못합니다.<br/>
          <strong>해결:</strong> 변형 값은 <strong>무조건 영문</strong>으로 등록해야 합니다.<br/><br/>
          <strong>예시:</strong><br/>
          <span style="color:var(--kt-red);">❌ 잘못된 예:</span> 변형 = "입고처리"<br/>
          <span style="color:#5cb85c;">✅ 올바른 예:</span> 변형 = "INBOUND_PROCESS"
        </div>
      </div>
    </div><br/>

    <div style="text-align:left;margin-bottom:16px;">
      <strong style="color:var(--text-secondary);font-size:13px;"><i class="fa-solid fa-link"></i> 관련 문서</strong><br/>
      <a href="https://ktds-kms.atlassian.net/wiki/spaces/ERPX/pages/168165467/MM_" target="_blank" rel="noopener noreferrer" style="color:var(--text-secondary);font-size:13px;text-decoration:underline;">
        <i class="fa-solid fa-external-link-alt" style="font-size:11px;"></i> ERPX 위키 - J-FLOW 배치 정보 참조
      </a>
    </div>

    <hr style="border:0;border-top:1px solid var(--border-color);margin:16px 0;">
    <div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:8px;padding:16px;text-align:center;">
      <strong style="color:var(--text-primary);">📚 추가 자료</strong><br/><br/>
      <div style="display:flex;flex-wrap:wrap;gap:16px;justify-content:center;">
        <a href="docs/manual/J-FLOW 사용자 매뉴얼.doc" download style="display:inline-flex;align-items:center;gap:8px;padding:8px 16px;border:1px solid var(--border-color);border-radius:8px;font-size:13px;color:var(--text-secondary);text-decoration:none;transition:var(--transition);">
          <i class="fa-solid fa-file-word" style="color:var(--kt-blue,var(--space-primary));font-size:16px;"></i> J-FLOW 사용자 메뉴얼
        </a>
        <a href="docs/manual/J-FLOW 배치잡 연동 방법 정리(FM).ppt" download style="display:inline-flex;align-items:center;gap:8px;padding:8px 16px;border:1px solid var(--border-color);border-radius:8px;font-size:13px;color:var(--text-secondary);text-decoration:none;transition:var(--transition);">
          <i class="fa-solid fa-file-powerpoint" style="color:var(--kt-red);font-size:16px;"></i> JFLOW 배치잡 연동 방법 정리 (FM)
        </a>
        <a href="docs/manual/배치잡 리스트 .xlsx" download style="display:inline-flex;align-items:center;gap:8px;padding:8px 16px;border:1px solid var(--border-color);border-radius:8px;font-size:13px;color:var(--text-secondary);text-decoration:none;transition:var(--transition);">
          <i class="fa-solid fa-file-excel" style="color:#217346;font-size:16px;"></i> 배치잡 리스트
        </a>
      </div><br/>
      <small style="color:var(--text-muted);display:block;margin-top:8px;">파일을 클릭하면 다운로드됩니다.</small>
    </div>
  `;
    
  return mmIntegrationAnswer;
}

if ($userInput) {
  $userInput.addEventListener('input', function() {
    const len = $userInput.value.length;
    if ($charCount) {
      $charCount.textContent = len;
      $charCount.className = len > 9500 ? 'over' : '';
    }
    autoResizeTextarea($userInput);
  });

  $userInput.addEventListener('paste', function(e) {
    console.log('[DEBUG] Paste event detected');
    const clipboardData = e.clipboardData || window.clipboardData;
    const items = clipboardData && clipboardData.items ? Array.from(clipboardData.items) : [];
    console.log('[DEBUG] Clipboard items:', items.length);

    // 이미지 항목 감지 (kind==='file' 이고 type이 image/ 로 시작)
    const imageItems = items.filter(function(item) {
      return item.kind === 'file' && item.type.startsWith('image/');
    });
    console.log('[DEBUG] Image items found:', imageItems.length);

    if (imageItems.length > 0) {
      e.preventDefault();
      imageItems.forEach(function(item, index) {
        const file = item.getAsFile();
        if (!file) return;
        const name = file.name && file.name !== 'image.png' && file.name !== 'blob'
          ? file.name
          : 'pasted-image-' + Date.now() + '-' + (index + 1) + '.png';
        const attachment = { file: file, name: name, type: 'image' };
        attachment.preview = URL.createObjectURL(file);
        state.pendingAttachments.push(attachment);
        console.log('[DEBUG] Added attachment:', name, 'Type: image', 'Preview:', !!attachment.preview);
      });
      console.log('[DEBUG] Total attachments:', state.pendingAttachments.length);
      renderAttachments();
      console.log('[DEBUG] renderAttachments() called');

      // 이미지 첨부 완료 안내
      showToast('이미지가 첨부되었습니다. 질문을 입력하거나 바로 전송하세요.', 'info');
    } else {
      console.log('[DEBUG] No image items found in clipboard');
    }
  });

  // 드래그 앤 드롭 이벤트 핸들러
  const $chatInputArea = document.querySelector('.chat-input-area');
  if ($chatInputArea) {
    // 드래그 시작 - 브라우저 기본 동작 방지
    $chatInputArea.addEventListener('dragover', function(e) {
      e.preventDefault();
      e.stopPropagation();
      $chatInputArea.classList.add('drag-over');
    });

    // 드래그 종료 - 스타일 제거
    $chatInputArea.addEventListener('dragleave', function(e) {
      e.preventDefault();
      e.stopPropagation();
      // 실제 영역 밖으로 나갔을 때만 클래스 제거
      if (!e.currentTarget.contains(e.relatedTarget)) {
        $chatInputArea.classList.remove('drag-over');
      }
    });

    // 드롭 - 파일 처리
    $chatInputArea.addEventListener('drop', function(e) {
      e.preventDefault();
      e.stopPropagation();
      $chatInputArea.classList.remove('drag-over');

      const files = e.dataTransfer.files;
      if (!files || files.length === 0) {
        console.log('[DEBUG] No files dropped');
        return;
      }

      console.log('[DEBUG] Files dropped:', files.length);
      
      Array.from(files).forEach(function(file, index) {
        const isImage = file.type && file.type.startsWith('image/');
        const name = file.name;
        const attachment = { file: file, name: name, type: isImage ? 'image' : 'file' };
        
        if (isImage) {
          attachment.preview = URL.createObjectURL(file);
        }
        
        state.pendingAttachments.push(attachment);
        console.log('[DEBUG] Added dropped file:', name, 'Type:', attachment.type);
      });

      renderAttachments();
      console.log('[DEBUG] Total attachments after drop:', state.pendingAttachments.length);
    });
  }

  $userInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
}
  });
}

if ($sendBtn)    $sendBtn.addEventListener('click', handleSend);
if ($newChatBtn) $newChatBtn.addEventListener('click', startNewConversation);
if ($clearBtn)   $clearBtn.addEventListener('click', clearChat);
if ($exportBtn)  $exportBtn.addEventListener('click', exportChat);

if ($historySearch) {
  $historySearch.addEventListener('input', function() {
    renderHistory($historySearch.value.trim());
  });
}
/* ============================================================
    DIFY FILE UPLOAD FUNCTIONS
    ============================================================ */

/**
 * 파일을 Dify 에 업로드하고 upload_file_id 반환
 * @param {File} file - 업로드할 파일
 * @returns {Promise<string>} upload_file_id
 */
async function uploadFileToDify(file) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('user', DIFY_API.userId);

  try {
    console.log('[Image Upload] 시작:', file.name, 'size:', file.size, 'type:', file.type);
    const response = await fetch('https://api.abclab.ktds.com/v1/files/upload', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + DIFY_API.apiKey
      },
      body: formData
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[Image Upload] HTTP 에러:', response.status, errText);
      throw new Error('파일 업로드 실패: ' + response.status + ' - ' + errText);
    }

    const data = await response.json();
    console.log('[Image Upload] 응답:', JSON.stringify(data));
    console.log('[Image Upload] fileId:', data.id, 'name:', data.name, 'size:', data.size, 'mime:', data.mime_type);
    return data.id;
  } catch (err) {
    console.error('[Dify File Upload] 오류:', err);
    throw err;
  }
}

/**
 * 이미지를 base64 data URL 로 변환
 * @param {File} file 
 * @returns {Promise<string>} data:image/...;base64,...
 */
function imageToBase64(file) {
  return new Promise(function(resolve, reject) {
    const reader = new FileReader();
    reader.onload = function() { resolve(reader.result); };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Tesseract.js 로 이미지에서 텍스트 추출 (클라이언트 측 OCR)
 * @param {File} file 
 * @returns {Promise<string>} 추출된 텍스트
 */
async function extractTextFromImage(file) {
  return new Promise(function(resolve, reject) {
    // Tesseract.js 동적 로드
    if (typeof Tesseract === 'undefined') {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      script.onload = function() {
        processOCR(file).then(resolve).catch(reject);
      };
      script.onerror = function() {
        reject(new Error('Tesseract.js 로딩 실패'));
      };
      document.head.appendChild(script);
    } else {
      processOCR(file).then(resolve).catch(reject);
    }
  });
}

async function processOCR(file) {
  const imgEl = document.createElement('img');
  imgEl.src = URL.createObjectURL(file);
  await new Promise(function(r) { imgEl.onload = r; });

  const { data: { text } } = await Tesseract.recognize(imgEl, 'kor+eng', {
    logger: function(m) {
      if (m.status === 'recognizing text') {
        console.log('[OCR] 진행률:', Math.round(m.progress * 100) + '%');
      }
    }
  });
  URL.revokeObjectURL(imgEl.src);
  console.log('[OCR] 추출 완료, 텍스트 길이:', text.length);
  return text.trim();
}

/**
 * 파일 타입 감지 (이미지/문서/오디오/비디오)
 * @param {File} file 
 * @returns {string} 파일 타입
 */
function getFileType(file) {
  const type = file.type || '';
  const name = file.name.toLowerCase();

  if (type.startsWith('image/') || 
      /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(name)) {
    return 'image';
  }

  if (type.startsWith('audio/') || 
      /\.(mp3|m4a|wav|webm)$/i.test(name)) {
    return 'audio';
  }

  if (type.startsWith('video/') || 
      /\.(mp4|mov|mpeg|webm)$/i.test(name)) {
    return 'video';
  }

  // 문서: PDF, TXT, DOCX, CSV, PPTX, MD
  if (type.startsWith('text/') || 
      type === 'application/pdf' || 
      type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      type === 'application/vnd.ms-excel' ||
      /\.(txt|pdf|docx|csv|md|html|htm)$/i.test(name)) {
    return 'document';
  }

  return 'document'; // 기본값: 문서
}

/* ============================================================
    DOCUMENT TEXT EXTRACTION FUNCTIONS
    ============================================================ */
/**
 * 문서 파일에서 텍스트 추출 (PDF, DOCX, TXT, XLSX, PPTX 등)
 * @param {File} file - 추출할 파일
 * @returns {Promise<string>} 추출된 텍스트
 */
async function extractTextFromDocument(file) {
  const fileName = file.name.toLowerCase();
  const fileType = file.type;

  try {
    // TXT/CSV 파일 - 직접 읽기
    if (fileType === 'text/plain' || fileType === 'text/csv' || 
        fileName.endsWith('.txt') || fileName.endsWith('.csv')) {
      return await readTextFile(file);
    }

    // PDF 파일 - pdf.js 사용
    if (fileType === 'application/pdf' || fileName.endsWith('.pdf')) {
      return await extractTextFromPDF(file);
    }

    // DOCX 파일 - mammoth.js 사용
    if (fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
        fileName.endsWith('.docx')) {
      return await extractTextFromDOCX(file);
    }

    // XLSX 파일 - 기본 텍스트 추출 (간단한 버전)
    if (fileType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || 
        fileType === 'application/vnd.ms-excel' ||
        fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      return await extractTextFromExcel(file);
    }

    // PPTX 파일 - 기본 텍스트 추출 (간단한 버전)
    if (fileType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' || 
        fileName.endsWith('.pptx') || fileName.endsWith('.ppt')) {
      return await extractTextFromPowerPoint(file);
    }

    // HTML 파일
    if (fileName.endsWith('.html') || fileName.endsWith('.htm')) {
      return await extractTextFromHTML(file);
    }

    // 그 외 파일은 읽기 시도
    if (fileType.startsWith('text/') || fileName.endsWith('.md')) {
      return await readTextFile(file);
    }

    // 지원되지 않는 형식
    console.warn('[Document Extraction] 지원되지 않는 파일 형식:', file.name);
    return '[지원되지 않는 파일 형식: ' + file.name + ']';

  } catch (error) {
    console.error('[Document Extraction] 오류:', file.name, error);
    return '[텍스트 추출 실패: ' + file.name + ' - ' + error.message + ']';
  }
}

/**
 * 텍스트 파일 읽기
 */
async function readTextFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = (e) => reject(new Error('파일 읽기 실패'));
    reader.readAsText(file);
  });
}

/**
 * PDF 에서 텍스트 추출 (pdf.js)
 */
async function extractTextFromPDF(file) {
  if (typeof pdfjsLib === 'undefined') {
    throw new Error('pdf.js 라이브러리가 로드되지 않았습니다.');
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item) => item.str).join(' ');
    fullText += '--- 페이지 ' + pageNum + ' ---\n' + pageText + '\n\n';
  }

  return fullText.trim();
}

/**
 * DOCX 에서 텍스트 추출 (mammoth.js)
 */
async function extractTextFromDOCX(file) {
  if (typeof mammoth === 'undefined') {
    throw new Error('mammoth.js 라이브러리가 로드되지 않았습니다.');
  }

  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
  return result.value || '[DOCX 파일에서 텍스트를 추출할 수 없습니다.]';
}

/**
 * Excel 파일에서 텍스트 추출 (기본 구현)
 * 실제 구현을 위해서는 sheetjs 같은 라이브러리 필요
 */
async function extractTextFromExcel(file) {
  // 간단한 구현: 파일 이름과 크기 정보만 반환
  // 실제 Excel 텍스트 추출을 위해서는 SheetJS 라이브러리 필요
  return '[Excel 파일: ' + file.name + ']\n' +
         '[파일 크기: ' + Math.round(file.size / 1024) + ' KB]\n' +
         '[참고: 완전한 Excel 텍스트 추출을 위해서는 SheetJS 라이브러리가 필요합니다.]\n\n' +
         '이 파일은 Excel 형식입니다. AI 가 파일 메타정보를 기반으로 답변합니다.';
}

/**
 * PowerPoint 파일에서 텍스트 추출 (기본 구현)
 */
async function extractTextFromPowerPoint(file) {
  // 간단한 구현: 파일 이름과 크기 정보만 반환
  // 실제 PowerPoint 텍스트 추출을 위해서는 specialized library 필요
  return '[PowerPoint 파일: ' + file.name + ']\n' +
         '[파일 크기: ' + Math.round(file.size / 1024) + ' KB]\n' +
         '[참고: 완전한 PowerPoint 텍스트 추출을 위해서는 specialized 라이브러리가 필요합니다.]\n\n' +
         '이 파일은 PowerPoint 형식입니다. AI 가 파일 메타정보를 기반으로 답변합니다.';
}

/**
 * HTML 파일에서 텍스트 추출
 */
async function extractTextFromHTML(file) {
  const htmlContent = await readTextFile(file);
  // 간단한 HTML 태그 제거
  const text = htmlContent
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return text || '[HTML 파일에서 텍스트를 추출할 수 없습니다.]';
}

/**
 * 첨부 파일의 텍스트를 모두 추출하여 반환 (문서 파일만 처리, 이미지는 DIFY API 로 직접 업로드)
 * @param {Array} attachments - 첨부 파일 목록
 * @returns {Promise<string>} 추출된 텍스트들 (파일별 구분)
 */
async function extractAllAttachmentsText(attachments) {
  if (!attachments || attachments.length === 0) return '';

  const extractionPromises = attachments.map(async (attachment) => {
    const fileName = attachment.name;
    const fileType = attachment.type || getFileType(attachment.file);

    // 캐시 확인
    if (state.extractedTextCache[fileName]) {
      console.log('[Attachment Extraction] 캐시에서 텍스트 로드:', fileName);
      return { fileName, text: state.extractedTextCache[fileName] };
    }

    // 문서 파일 - 텍스트 추출 (이미지는 DIFY API 로 직접 업로드됨)
    console.log('[Document Extraction] 텍스트 추출 시작:', fileName);
    const extractedText = await extractTextFromDocument(attachment.file);

    // 캐시에 저장
    state.extractedTextCache[fileName] = extractedText;

    return { fileName, text: extractedText };
  });

  const results = await Promise.all(extractionPromises);

  // 결과 필터링 및 포맷팅
  const validResults = results.filter(function(r) { return r !== null && r.text; });

  if (validResults.length === 0) return '';

  let combinedText = '\n\n=== 첨부 파일 내용 ===\n\n';
  validResults.forEach((result, index) => {
    combinedText += '--- [파일 ' + (index + 1) + ': ' + result.fileName + '] ---\n';
    combinedText += result.text;
    combinedText += '\n\n';
  });
  combinedText += '===========================\n';

  return combinedText;
}

/* ============================================================
    FILE ATTACHMENT FUNCTIONS
    ============================================================ */
function renderAttachments() {
  console.log('[DEBUG] renderAttachments() called, pendingAttachments:', state.pendingAttachments.length);
  if (!$attachedFiles) {
    console.log('[DEBUG] $attachedFiles is null!');
    return;
  }
  $attachedFiles.innerHTML = '';
  if (state.pendingAttachments.length === 0) {
    $attachedFiles.style.display = 'none';
    console.log('[DEBUG] No attachments, hiding container');
    return;
  }
  console.log('[DEBUG] Rendering', state.pendingAttachments.length, 'attachments');
  $attachedFiles.style.display = 'flex';
  state.pendingAttachments.forEach(function(item, idx) {
    console.log('[DEBUG] Rendering item', idx, ':', item.name, 'Type:', item.type, 'Preview:', !!item.preview);
    const wrap = document.createElement('div');
    wrap.className = 'attachment-item';

    if (item.type === 'image' && item.preview) {
      const img = document.createElement('img');
      img.src = item.preview;
      img.alt = item.name;
      img.className = 'attachment-preview';
      wrap.appendChild(img);
      console.log('[DEBUG] Added image preview');
    } else {
      const icon = document.createElement('i');
      icon.className = item.type === 'image' ? 'fa-solid fa-image' : 'fa-solid fa-file-lines';
      icon.className += ' attachment-icon';
      wrap.appendChild(icon);
      console.log('[DEBUG] Added icon (no preview)');
    }

    const name = document.createElement('span');
    name.textContent = item.name;
    name.className = 'attachment-name';
    wrap.appendChild(name);

    // 미리보기 버튼 (문서 파일만)
    if (item.type !== 'image') {
      const previewBtn = document.createElement('button');
      previewBtn.type = 'button';
      previewBtn.innerHTML = '<i class="fa-solid fa-eye"></i>';
      previewBtn.className = 'attachment-remove';
      previewBtn.title = '텍스트 미리보기';
      previewBtn.addEventListener('click', async function() {
        showToast('텍스트 추출 중...', 'info');
        try {
          const text = await extractTextFromDocument(item.file);
          showExtractPreview(text);
        } catch (err) {
          showToast('텍스트 추출 실패: ' + err.message, 'error');
        }
      });
      wrap.appendChild(previewBtn);
    }

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    remove.className = 'attachment-remove';
    remove.title = '제거';
    remove.addEventListener('click', function() {
      state.pendingAttachments.splice(idx, 1);
      renderAttachments();
    });
    wrap.appendChild(remove);

    $attachedFiles.appendChild(wrap);
  });
  console.log('[DEBUG] renderAttachments() completed');
}

function addFiles(files) {
  Array.from(files || []).forEach(function(file) {
    const isImage = file.type && file.type.startsWith('image/');
    const attachment = { file: file, name: file.name, type: isImage ? 'image' : 'file' };
    if (isImage) attachment.preview = URL.createObjectURL(file);
    state.pendingAttachments.push(attachment);
  });
  renderAttachments();
}

if ($fileAttachBtn && $fileInput) {
  $fileAttachBtn.addEventListener('click', function() { $fileInput.click(); });
  $fileInput.addEventListener('change', function(e) { addFiles(e.target.files); });
}

if ($imageAttachBtn && $imageInput) {
  $imageAttachBtn.addEventListener('click', function() { $imageInput.click(); });
  $imageInput.addEventListener('change', function(e) { addFiles(e.target.files); });
}

/* ============================================================
   QUICK BUTTONS
   ============================================================ */
function bindQuickButtons() {
  document.querySelectorAll('.quick-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      if (!$userInput) return;
      
      const msg = btn.dataset.msg || '';
      const btnCategory = btn.dataset.category;
      
      // "시스템" 버튼일 경우 고정 답변 바로 표시 (좌측 메뉴 시스템과 동일)
      if (msg && msg.includes('연계 시스템')) {
        const bubble = createAgentBubble('account');
        if (bubble) {
          bubble.innerHTML = buildSystemAnswer('all');
          scrollBottom();
          
          // 통계 업데이트
          state.stats.total++;
          state.stats.resolved++;
          updateStats();
        }
        return;
      }
      
      // "신설법인 프로세스" 버튼일 경우 고정 답변 바로 표시
      if (msg && msg.includes('신설법인')) {
        const bubble = createAgentBubble('system');
        if (bubble) {
          bubble.innerHTML = buildNewCompanyAnswer();
          scrollBottom();
          
          // 통계 업데이트
          state.stats.total++;
          state.stats.resolved++;
          updateStats();
        }
        return;
      }
      
      // 일반 버튼 - 질문 입력
      $userInput.value = msg;
      if ($charCount) $charCount.textContent = $userInput.value.length;
      autoResizeTextarea($userInput);
      $userInput.focus();
      
      // 담당자 연락처 버튼일 경우 data-category 속성 전달
      if (btnCategory && $chatMessages) {
        // data-category 가 있으면 chatMessages 에 카테고리 저장 (기존 값 덮어쓰기)
        $chatMessages.dataset.currentCategory = btnCategory;
      }
      // data-category 가 없으면 chatMessages 에 이미 저장된 currentCategory 를 그대로 유지
      
      handleSend();
    });
  });
}
bindQuickButtons();

/* ============================================================
   SUGGESTION CHIPS (빠른 추천 질문)
   ============================================================ */
function bindSuggestionChips() {
  document.querySelectorAll('.suggestion-chip').forEach(function(chip) {
    chip.addEventListener('click', function() {
      if (!$userInput) return;
      const msg = chip.dataset.msg || '';
      $userInput.value = msg;
      if ($charCount) $charCount.textContent = $userInput.value.length;
      autoResizeTextarea($userInput);
      $userInput.focus();
      handleSend();
    });
  });
}
bindSuggestionChips();

/* ============================================================
    SEND MESSAGE
    ============================================================ */
function handleSend() {
  if (!$userInput) return;
  const text = $userInput.value.trim();
  if ((!text && state.pendingAttachments.length === 0) || state.isTyping) return;
  if (text.length > 10000) { showToast('10,000 자 이내로 입력해 주세요.', 'error'); return; }

  const category = 'all'; // 카테고리 선택박스 삭제로 항상 'all' 사용

  if (!state.currentConvId) createConversation(text || '첨부 파일 전송', category);
  else updateConversation(text || '첨부 파일 전송');

  appendUserMessage(text, category, state.pendingAttachments);

  $userInput.value = '';
  if ($charCount) $charCount.textContent = '0';
  autoResizeTextarea($userInput);

  // 첨부 파일은 callAIAgent 에서 OCR 처리 후 초기화됨
  // state.pendingAttachments = [];  // ❌ 제거 - OCR 처리 전에 삭제되지 않도록
  // renderAttachments();              // ❌ 제거

  state.stats.total++;
  state.stats.pending++;
updateStats();

  // 이미지 첨부가 있으면 고정 답변 로직 모두 건너뛰고 AI에게 직접 전송
  const hasImageAttachment = state.pendingAttachments && state.pendingAttachments.some(function(a) { return a.type === 'image'; });
  if (hasImageAttachment) {
    callAIAgent(text || '첨부된 이미지를 분석해주세요.', category);
    return;
  }

  // 빈 질문일 경우 카테고리별 고정 답변 제공
  if (!text || text.trim() === '') {
    const bubble = createAgentBubble(category);
    
    // 현재 chatMessages 의 데이터 속성에서 카테고리 확인 (kt alpha 일 경우)
    const currentCategory = $chatMessages ? $chatMessages.dataset.currentCategory : null;
    
    console.log('[DEBUG] currentCategory:', currentCategory, 'category:', category);
    
    if (currentCategory === 'alpha') {
      // kt alpha 담당자 연락처
      console.log('[DEBUG] Showing Alpha Contact');
      if (bubble) {
        bubble.innerHTML = buildAlphaContactAnswer();
      }
      // 카테고리 초기화
      if ($chatMessages) {
        delete $chatMessages.dataset.currentCategory;
      }
    } else if (currentCategory === 'netcore-pm') {
      // kt netcore | kt p&m 담당자 연락처
      console.log('[DEBUG] Showing Netcore/P&M Contact');
      if (bubble) {
        bubble.innerHTML = buildNetcorePmContactAnswer();
      }
      // 카테고리 초기화
      if ($chatMessages) {
        delete $chatMessages.dataset.currentCategory;
      }
    } else if (currentCategory === 'cloud') {
      // KT CLOUD 담당자 연락처
      console.log('[DEBUG] Showing KT CLOUD Contact');
      if (bubble) {
        bubble.innerHTML = buildKtCloudContactAnswer();
      }
      // 카테고리 초기화
      if ($chatMessages) {
        delete $chatMessages.dataset.currentCategory;
      }
    } else if (currentCategory === 'skylife') {
      // KT SKYLIFE 담당자 연락처
      console.log('[DEBUG] Showing KT SKYLIFE Contact');
      if (bubble) {
        bubble.innerHTML = buildSkylifeContactAnswer();
      }
      // 카테고리 초기화
      if ($chatMessages) {
        delete $chatMessages.dataset.currentCategory;
      }
    } else if (category === 'security') {
      // 담당자 연락처
      if (bubble) {
        bubble.innerHTML = buildContactAnswer();
      }
    } else if (category === 'data') {
      // Table & T-code
      if (bubble) {
        bubble.innerHTML = buildTableTcodeAnswer();
      }
    } else if (category === 'system') {
      // 신설법인 프로세스
      if (bubble) {
        bubble.innerHTML = buildNewCompanyAnswer();
      }
    } else if (category === 'deploy') {
      // MM 연동&배치
      if (bubble) {
        bubble.innerHTML = buildMMIntegrationAnswer();
      }
    } else if (category === 'sap_mm') {
      // SAP MM 모듈
      if (bubble) {
        bubble.innerHTML = '<div style="background:var(--kt-red-bg);border-left:4px solid var(--kt-red);padding:12px 16px;border-radius:8px;margin-bottom:12px;">' +
          '<strong>📌 SAP MM (Material Management) 모듈</strong><br/>' +
          '구매, 자재 관리, 재고 관리 업무를 지원하는 SAP 의 핵심 모듈입니다.<br/>' +
          '아래와 같은 주요 기능을 제공합니다:' +
          '</div>' +
          '<div style="background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:8px;padding:14px;margin-bottom:12px;">' +
          '<strong>🔹 주요 기능</strong><br/>' +
          '<ul style="font-size:13px;line-height:1.8;color:var(--text-secondary);margin-left:12px;">' +
          '<li><strong>구매 관리:</strong> PO(구매주문서), PR(구매요청서) 생성 및 승인</li>' +
          '<li><strong>자재 마스터:</strong> 자재 코드, 단위, 분류 관리</li>' +
          '<li><strong>벤더 마스터:</strong> 협력사 정보 관리</li>' +
          '<li><strong>입고/출고 관리:</strong> MIGO 를 통한 자재 이동</li>' +
          '<li><strong>인보이스 검증:</strong> MIRO 를 통한 송장 처리</li>' +
          '<li><strong>재고 관리:</strong> MB51, MMBE 등으로 재고 조회</li>' +
          '</ul>' +
          '</div>' +
          '<div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:8px;padding:14px;">' +
          '<strong>🔹 주요 T-Code</strong><br/>' +
          '<ul style="font-size:13px;line-height:1.8;color:var(--text-secondary);margin-left:12px;">' +
          '<li><strong>ME21N:</strong> 구매주문서 생성</li>' +
          '<li><strong>ME51N:</strong> 구매요청서 생성</li>' +
          '<li><strong>MIGO:</strong> 자재 이동 (입고/출고)</li>' +
          '<li><strong>MIRO:</strong> 송장 검증</li>' +
          '<li><strong>MMBE:</strong> 재고 일괄 조회</li>' +
          '<li><strong>MB51:</strong> 자재 이동 내역 조회</li>' +
          '</ul>' +
          '</div>' +
          '<br/><div style="font-size:12px;color:var(--text-muted);">💡 구체적인 질문을 입력해 주시면 더 자세히 안내해 드립니다.<br/>(예: "PO 생성 방법", "재고 조회 T-code", "입고 처리 절차" 등)</div>';
      }
    } else if (category === 'account') {
      // 시스템
      if (bubble) {
        bubble.innerHTML = '<div style="background:#FFF3CD;border-left:4px solid #FFC107;padding:12px 16px;border-radius:8px;margin-bottom:12px;">' +
          '<strong>⚠️ 시스템 장애/오류 문의</strong><br/>' +
          '시스템 관련 장애, 오류, 성능 저하 등의 문제가 발생하셨다면 아래 절차를 따라주세요.' +
          '</div>' +
          '<div style="background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:8px;padding:14px;margin-bottom:12px;">' +
          '<strong>📋 장애 신고 절차</strong><br/>' +
          '<ol style="font-size:13px;line-height:1.8;color:var(--text-secondary);margin-left:18px;">' +
          '<li><strong>증상 기록:</strong> 오류 메시지, 발생 시간, 재현 방법 기록</li>' +
          '<li><strong>ITSM 등록:</strong> "시스템 장애 신고" 메뉴에서 상세 정보 입력</li>' +
          '<li><strong>우선순위 확인:</strong> 장애 등급에 따른 처리 우선순위 적용</li>' +
          '<li><strong>진행 상황 확인:</strong> ITSM 에서 실시간 진행 상황 조회</li>' +
          '</ol>' +
          '</div>' +
          '<div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:8px;padding:14px;margin-bottom:12px;">' +
          '<strong>🔍 주요 시스템 오류 유형</strong><br/>' +
          '<ul style="font-size:13px;line-height:1.8;color:var(--text-secondary);margin-left:12px;">' +
          '<li><strong>서버 장애:</strong> 서비스 중단, 응답 없음</li>' +
          '<li><strong>네트워크 오류:</strong> 연결 실패, 타임아웃</li>' +
          '<li><strong>데이터 오류:</strong> DB 연결 실패, 쿼리 에러</li>' +
          '<li><strong>성능 저하:</strong> 느린 응답, 시스템 지연</li>' +
          '</ul>' +
          '</div>' +
          '<div style="background:#E8F4FD;border-left:4px solid #2574A9;padding:14px;border-radius:8px;margin-bottom:12px;">' +
          '<strong>🔗 STP 업무 연계 시스템 및 접속 URL</strong><br/>' +
          '<div style="font-size:13px;line-height:1.9;color:var(--text-secondary);margin-top:8px;">' +
          'STP 에서 업무할 때 주로 사용하는 연계 시스템은 <strong>BPM, EAI, EASY ERP, SRM, ITS</strong>가 있습니다.' +
          '</div>' +
          '<table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:10px;">' +
          '<thead>' +
            '<tr style="background:#2574A9;color:#fff;">' +
              '<th style="padding:8px;text-align:left;border-radius:4px 0 0 0;">시스템</th>' +
              '<th style="padding:8px;text-align:left;">접속 URL</th>' +
            '</tr>' +
          '</thead>' +
          '<tbody>' +
            '<tr style="background:var(--bg-secondary);">' +
              '<td style="padding:8px;border:1px solid var(--border-color);"><strong>EAI 개발</strong></td>' +
              '<td style="padding:8px;border:1px solid var(--border-color);"><a href="http://10.217.52.41:8801/EAIAdmin/main/main.jsp" target="_blank" style="color:#2574A9;text-decoration:none;">http://10.217.52.41:8801/EAIAdmin/main/main.jsp</a></td>' +
            '</tr>' +
            '<tr style="background:var(--bg-card);">' +
              '<td style="padding:8px;border:1px solid var(--border-color);"><strong>EAI 품질</strong></td>' +
              '<td style="padding:8px;border:1px solid var(--border-color);"><a href="http://10.217.45.82:8811/EAIAdmin/main/main.jsp" target="_blank" style="color:#2574A9;text-decoration:none;">http://10.217.45.82:8811/EAIAdmin/main/main.jsp</a></td>' +
            '</tr>' +
            '<tr style="background:var(--bg-secondary);">' +
              '<td style="padding:8px;border:1px solid var(--border-color);"><strong>EAI 운영</strong></td>' +
              '<td style="padding:8px;border:1px solid var(--border-color);"><a href="http://10.220.18.11:9011/EAIAdmin/main/main.jsp" target="_blank" style="color:#2574A9;text-decoration:none;">http://10.220.18.11:9011/EAIAdmin/main/main.jsp</a></td>' +
            '</tr>' +
            '<tr style="background:var(--bg-card);"><td colspan="2" style="padding:4px;border:none;height:8px;"></td></tr>' +
            '<tr style="background:var(--bg-secondary);">' +
              '<td style="padding:8px;border:1px solid var(--border-color);"><strong>BPM 개발</strong></td>' +
              '<td style="padding:8px;border:1px solid var(--border-color);"><a href="http://bpdev.kt.com:8103/bizflow/KTFBPM/ktf_login2.jsp" target="_blank" style="color:#2574A9;text-decoration:none;">http://bpdev.kt.com:8103/bizflow/KTFBPM/ktf_login2.jsp</a></td>' +
            '</tr>' +
            '<tr style="background:var(--bg-card);">' +
              '<td style="padding:8px;border:1px solid var(--border-color);"><strong>BPM 품질</strong></td>' +
              '<td style="padding:8px;border:1px solid var(--border-color);"><a href="http://bpdev.kt.com/bizflow/KTFBPM/ktf_login2.jsp" target="_blank" style="color:#2574A9;text-decoration:none;">http://bpdev.kt.com/bizflow/KTFBPM/ktf_login2.jsp</a></td>' +
            '</tr>' +
            '<tr style="background:var(--bg-card);"><td colspan="2" style="padding:4px;border:none;height:8px;"></td></tr>' +
            '<tr style="background:var(--bg-secondary);">' +
              '<td style="padding:8px;border:1px solid var(--border-color);"><strong>Easy ERP 개발</strong></td>' +
              '<td style="padding:8px;border:1px solid var(--border-color);"><a href="http://keddev.kt.com/ERP/cm/view/CMV0010" target="_blank" style="color:#2574A9;text-decoration:none;">http://keddev.kt.com/ERP/cm/view/CMV0010</a></td>' +
            '</tr>' +
            '<tr style="background:var(--bg-card);"><td colspan="2" style="padding:4px;border:none;height:8px;"></td></tr>' +
            '<tr style="background:var(--bg-secondary);">' +
              '<td style="padding:8px;border:1px solid var(--border-color);"><strong>ITS 사용자</strong></td>' +
              '<td style="padding:8px;border:1px solid var(--border-color);"><a href="https://itsm.ktds.co.kr/kt/index.do" target="_blank" style="color:#2574A9;text-decoration:none;">https://itsm.ktds.co.kr/kt/index.do</a></td>' +
            '</tr>' +
            '<tr style="background:var(--bg-card);">' +
              '<td style="padding:8px;border:1px solid var(--border-color);"><strong>ITS 운영자</strong></td>' +
              '<td style="padding:8px;border:1px solid var(--border-color);"><a href="http://itsm.ktds.co.kr/oper/index.do" target="_blank" style="color:#2574A9;text-decoration:none;">http://itsm.ktds.co.kr/oper/index.do</a></td>' +
            '</tr>' +
            '<tr style="background:var(--bg-card);"><td colspan="2" style="padding:4px;border:none;height:8px;"></td></tr>' +
            '<tr style="background:var(--bg-secondary);">' +
              '<td style="padding:8px;border:1px solid var(--border-color);"><strong>SRM</strong></td>' +
              '<td style="padding:8px;border:1px solid var(--border-color);"><a href="https://srmdev.kt.com/kt_b0i8t6s2r1m_nigol.jsp" target="_blank" style="color:#2574A9;text-decoration:none;">https://srmdev.kt.com/kt_b0i8t6s2r1m_nigol.jsp</a></td>' +
            '</tr>' +
          '</tbody>' +
        '</table>' +
        '</div>' +
        '<br/><div style="font-size:12px;color:var(--text-muted);">💡 구체적인 오류 내용을 입력해 주시면 더 자세히 안내해 드립니다.<br/>(예: "서버 응답 없음", "오류 메시지 503", "시스템 느려짐" 등)</div>';
      }
    }
    
    if (bubble) {
      scrollBottom();
      state.stats.pending = Math.max(0, state.stats.pending - 1);
      state.stats.resolved += 1;
      updateStats();
      const conv = state.conversations.find(function(c) { return c.id === state.currentConvId; });
      if (conv) conv.status = 'done';
      return;
    }
  }

  // 담당자 역할/직책 검색 (이름 검색보다 먼저 - "kt netcore PM 누구야?" 등)
  var roleResults = searchContactByRole(text);
  if (roleResults) {
    console.log('[DEBUG] Role search found:', roleResults.length, 'matches for:', text);
    var bubble_role = createAgentBubble('etc');
    if (bubble_role) bubble_role.innerHTML = buildRoleSearchAnswer(roleResults, text, detectGroupFromText(text));
    scrollBottom();
    state.stats.pending  = Math.max(0, state.stats.pending - 1);
    state.stats.resolved += 1;
    updateStats();
    var conv_role = state.conversations.find(function(c) { return c.id === state.currentConvId; });
    if (conv_role) conv_role.status = 'done';
    return;
  }
  
  // 담당자 이름 검색 (최우선순위 - 이름이 포함된 질문은 먼저 담당자 DB 검색)
  var personName = extractPersonName(text);
  if (personName) {
    var personResults = searchContactByName(personName);
    if (personResults.length > 0) {
      console.log('[DEBUG] Person name found:', personName, '->', personResults.length, 'matches');
      var bubble = createAgentBubble('etc');
      if (bubble) bubble.innerHTML = buildPersonSearchAnswer(personResults, personName);
      scrollBottom();
      state.stats.pending  = Math.max(0, state.stats.pending - 1);
      state.stats.resolved += 1;
      updateStats();
      var conv = state.conversations.find(function(c) { return c.id === state.currentConvId; });
      if (conv) conv.status = 'done';
      return;
    }
  }
  
  // 담당자 연락처 질문 감지 (최우선순위 - 다른 모든 질문보다 먼저 검사)
  console.log('[DEBUG] Checking contact query:', text);
  if (isContactQuery(text)) {
    console.log('[DEBUG] Contact query detected!');
    const startTime = Date.now();
    const bubble = createAgentBubble('etc');
    
    // 현재 카테고리 확인 (메뉴 클릭으로 설정된 카테고리)
    let currentCategory = $chatMessages ? $chatMessages.dataset.currentCategory : null;
    
    // 질문 텍스트에서 그룹사 키워드 감지 (메뉴 클릭 안했어도 자동 감지)
    const lowerText = text.toLowerCase();
    if (!currentCategory) {
      if (lowerText.includes('alpha') || lowerText.includes('알파')) {
        currentCategory = 'alpha';
        console.log('[DEBUG] Detected Alpha from query text');
      } else if (lowerText.includes('netcore') || lowerText.includes('p&m') || lowerText.includes('넷코어') || lowerText.includes('신설법인')) {
        currentCategory = 'netcore-pm';
        console.log('[DEBUG] Detected Netcore/P&M from query text');
      } else if (lowerText.includes('kt cloud') || lowerText.includes('ktcloud') || lowerText.includes('kt 클라우드') || lowerText.includes('클라우드')) {
        currentCategory = 'cloud';
        console.log('[DEBUG] Detected KT CLOUD from query text');
      } else if (lowerText.includes('skylife') || lowerText.includes('스카이라이프')) {
        currentCategory = 'skylife';
        console.log('[DEBUG] Detected KT SKYLIFE from query text');
      }
    }
    
    console.log('[DEBUG] Final category:', currentCategory);
    
    if (currentCategory === 'alpha') {
      // KT ALPHA 담당자 연락처
      console.log('[DEBUG] Showing Alpha Contact');
      if (bubble) bubble.innerHTML = buildAlphaContactAnswer();
      // 카테고리 초기화
      if ($chatMessages) {
        delete $chatMessages.dataset.currentCategory;
      }
      scrollBottom();
      state.stats.pending   = Math.max(0, state.stats.pending - 1);
      state.stats.resolved += 1;
      updateStats();
      const conv_alpha = state.conversations.find(function(c) { return c.id === state.currentConvId; });
      if (conv_alpha) conv_alpha.status = 'done';
      return;
    } else if (currentCategory === 'netcore-pm') {
      // kt netcore | kt p&m 담당자 연락처
      console.log('[DEBUG] Showing Netcore/P&M Contact');
      if (bubble) bubble.innerHTML = buildNetcorePmContactAnswer();
      // 카테고리 초기화
      if ($chatMessages) {
        delete $chatMessages.dataset.currentCategory;
      }
      scrollBottom();
      state.stats.pending   = Math.max(0, state.stats.pending - 1);
      state.stats.resolved += 1;
      updateStats();
      const conv_netcore = state.conversations.find(function(c) { return c.id === state.currentConvId; });
      if (conv_netcore) conv_netcore.status = 'done';
      return;
    } else if (currentCategory === 'cloud') {
      // KT CLOUD 담당자 연락처
      console.log('[DEBUG] Showing KT CLOUD Contact');
      if (bubble) bubble.innerHTML = buildKtCloudContactAnswer();
      // 카테고리 초기화
      if ($chatMessages) {
        delete $chatMessages.dataset.currentCategory;
      }
      scrollBottom();
      state.stats.pending   = Math.max(0, state.stats.pending - 1);
      state.stats.resolved += 1;
      updateStats();
      const conv_cloud = state.conversations.find(function(c) { return c.id === state.currentConvId; });
      if (conv_cloud) conv_cloud.status = 'done';
      return;
    } else if (currentCategory === 'skylife') {
      // KT SKYLIFE 담당자 연락처
      console.log('[DEBUG] Showing KT SKYLIFE Contact');
      if (bubble) bubble.innerHTML = buildSkylifeContactAnswer();
      // 카테고리 초기화
      if ($chatMessages) {
        delete $chatMessages.dataset.currentCategory;
      }
      scrollBottom();
      state.stats.pending   = Math.max(0, state.stats.pending - 1);
      state.stats.resolved += 1;
      updateStats();
      const conv_skylife = state.conversations.find(function(c) { return c.id === state.currentConvId; });
      if (conv_skylife) conv_skylife.status = 'done';
      return;
    } else {
      // 그룹사 감지 실패 → CONTACT_DATABASE 에서 역할/영역 기반 검색 시도
      console.log('[DEBUG] Group detection failed, searching CONTACT_DATABASE by role/area...');
      var roleFallback = searchContactByRole(text);
      if (roleFallback && roleFallback.length > 0) {
        console.log('[DEBUG] Found ' + roleFallback.length + ' contacts by role/area fallback');
        if (bubble) bubble.innerHTML = buildRoleSearchAnswer(roleFallback, text, detectGroupFromText(text));
      } else {
        // STP 운영 담당자 일반 문의인지 확인
        var stpGeneralKeywords = ['STP 담당자','STP 담당부서','STP 운영 담당','STP 운영담당','STP 책임자','STP 운영 담당부서'];
        var isSTPGeneral = stpGeneralKeywords.some(function(kw) { return text.includes(kw); });
        if (isSTPGeneral) {
          // STP 일반 담당자 문의 → 고정답변 표시
          console.log('[DEBUG] STP general contact query, showing buildContactAnswer');
          if (bubble) bubble.innerHTML = buildContactAnswer();
        } else {
          // 그 외 역할 기반 문의 → DIFY AI 로 넘김
          console.log('[DEBUG] No contact found in DATABASE, falling through to DIFY AI');
          if (bubble) bubble.parentElement.parentElement.remove();
        }
      }

      if (roleFallback || isSTPGeneral) {
        scrollBottom();
        const elapsed = Date.now() - startTime;
        state.stats.pending   = Math.max(0, state.stats.pending - 1);
        state.stats.resolved += 1;
        updateStats();
        const conv = state.conversations.find(function(c) { return c.id === state.currentConvId; });
        if (conv) conv.status = 'done';
        return;
      }
      // DIFY AI 로 fallthrough
    }
  }

  // 연계 시스템 질문 감지
  if (isSystemQuery(text)) {
    const startTime = Date.now();
    const systemType = detectSystemType(text);
    const bubble = createAgentBubble('account');
    if (bubble) bubble.innerHTML = buildSystemAnswer(systemType);
    scrollBottom();
    const elapsed = Date.now() - startTime;
    state.stats.pending   = Math.max(0, state.stats.pending - 1);
    state.stats.resolved += 1;
    updateStats();
    const conv = state.conversations.find(function(c) { return c.id === state.currentConvId; });
    if (conv) conv.status = 'done';
    return;
  }

  // Table & T-code 질문 감지 (우선순위 높음)
  if (isTableTcodeQuery(text)) {
    const startTime = Date.now();
    const bubble = createAgentBubble('data');
    if (bubble) bubble.innerHTML = buildTableTcodeAnswer();
    scrollBottom();
    const elapsed = Date.now() - startTime;
    state.stats.responseTimes.push(elapsed);
    state.stats.pending   = Math.max(0, state.stats.pending - 1);
    state.stats.resolved += 1;
    updateStats();
    const conv = state.conversations.find(function(c) { return c.id === state.currentConvId; });
    if (conv) conv.status = 'done';
    return;
  }

  // 신설법인 프로세스 질문 감지 (우선순위 높음)
  if (isNewCompanyQuery(text)) {
    const startTime = Date.now();
    const bubble = createAgentBubble('system');
    if (bubble) bubble.innerHTML = buildNewCompanyAnswer();
    scrollBottom();
    const elapsed = Date.now() - startTime;
    state.stats.responseTimes.push(elapsed);
    state.stats.pending   = Math.max(0, state.stats.pending - 1);
    state.stats.resolved += 1;
    updateStats();
    const conv = state.conversations.find(function(c) { return c.id === state.currentConvId; });
    if (conv) conv.status = 'done';
    return;
  }

  // SAP PO 조회 질문 감지 (우선순위 높음)
  console.log('[DEBUG] Checking PO query:', text);
  console.log('[DEBUG] isPOQuery result:', isPOQuery(text));
  if (isPOQuery(text)) {
    console.log('[DEBUG] PO query detected!');
    const poNumbers = extractPONumbers(text);
    
    // PO 번호가 포함된 경우 (예: "2008-00201 조회해줘" 또는 "2008-00201, 2008-00203 정보 알려줘")
    if (poNumbers.length > 0) {
      const startTime = Date.now();
      const bubble = createAgentBubble('sap_mm');
      
      if (poNumbers.length === 1) {
        // 단일 PO 조회
        if (bubble) bubble.innerHTML = '🔍 PO ' + poNumbers[0] + ' 정보를 조회 중입니다...';
      } else {
        // 여러 PO 조회
        if (bubble) bubble.innerHTML = '🔍 ' + poNumbers.length + '개 PO 정보를 조회 중입니다...<br/>' +
          '<small>조회할 PO: ' + poNumbers.join(', ') + '</small>';
      }
      scrollBottom();
      
      // 모든 PO 조회 (병렬)
      Promise.all(poNumbers.map(function(poNum) {
        return fetchPOInfo(poNum).then(function(result) {
          return { poNumber: poNum, result: result, success: result.includes('PurchaseOrder') || result.includes('📋') };
        }).catch(function(error) {
          return { poNumber: poNum, result: '❌ 오류: ' + error.message, success: false };
        });
      })).then(function(results) {
        let html = '';
        
        if (poNumbers.length === 1) {
          // 단일 PO 결과
          const firstResult = results[0];
          if (firstResult.success) {
            html = firstResult.result;
          } else {
            html = firstResult.result;
          }
        } else {
          // 여러 PO 결과
          html = '<div style="background:linear-gradient(135deg, #667eea 0%, #764ba2 100%);border-radius:16px;padding:20px;margin:12px 0;box-shadow:0 8px 24px rgba(102, 126, 234, 0.4);">' +
            '<div style="color:#fff;margin-bottom:16px;">' +
            '<strong style="font-size:16px;">📋 PO 목록 조회 결과</strong><br/>' +
            '<small style="opacity:0.9;">총 ' + results.length + '개 PO 조회 완료</small>' +
            '</div>';
          
          results.forEach(function(res, index) {
            if (res.success) {
              // 성공한 PO 결과에서 HTML 추출 (카드 디자인만 유지)
              html += '<div style="background:rgba(255,255,255,0.95);border-radius:12px;padding:16px;margin-top:12px;">' +
                '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">' +
                '<i class="fa-solid fa-check-circle" style="color:#4CAF50;font-size:20px;"></i>' +
                '<strong style="color:#333;font-size:15px;">PO #' + (index + 1) + ': ' + res.poNumber + '</strong>' +
                '</div>';
              
              // 성공한 결과에서 테이블 부분만 추출하여 표시
              // 간단한 방법: 결과를 다시 파싱하거나, 성공적인 포맷으로 재구성
              html += res.result.replace(/<div[^>]*style="background:linear-gradient[^>]*>/, '<div style="background:linear-gradient(135deg, #667eea 0%, #764ba2 100%);border-radius:16px;padding:20px;margin:12px 0;box-shadow:0 8px 24px rgba(102, 126, 234, 0.4);">');
              html += '</div>';
            } else {
              html += '<div style="background:rgba(255,255,255,0.95);border-radius:12px;padding:16px;margin-top:12px;">' +
                '<div style="display:flex;align-items:center;gap:10px;">' +
                '<i class="fa-solid fa-times-circle" style="color:#FF5722;font-size:20px;"></i>' +
                '<strong style="color:#333;font-size:15px;">PO #' + (index + 1) + ': ' + res.poNumber + '</strong>' +
                '</div>' +
                '<div style="color:#FF5722;margin-top:8px;">' + res.result + '</div>' +
                '</div>';
            }
          });
          
          html += '</div>';
        }
        
        if (bubble) bubble.innerHTML = html;
        scrollBottom();
        const elapsed = Date.now() - startTime;
        state.stats.responseTimes.push(elapsed);
        state.stats.pending   = Math.max(0, state.stats.pending - 1);
        state.stats.resolved += 1;
        updateStats();
        const conv = state.conversations.find(function(c) { return c.id === state.currentConvId; });
        if (conv) conv.status = 'done';
      });
      return;
    } else {
      // PO 번호 없이 "PO 목록 알려줘" 같은 경우
      const startTime = Date.now();
      const bubble = createAgentBubble('sap_mm');
      if (bubble) bubble.innerHTML = '🔍 최신 PO 목록을 조회 중입니다...';
      scrollBottom();
      
      fetchPOList(10).then(function(result) {
        if (bubble) bubble.innerHTML = result;
        scrollBottom();
        const elapsed = Date.now() - startTime;
        state.stats.responseTimes.push(elapsed);
        state.stats.pending   = Math.max(0, state.stats.pending - 1);
        state.stats.resolved += 1;
        updateStats();
        const conv = state.conversations.find(function(c) { return c.id === state.currentConvId; });
        if (conv) conv.status = 'done';
      }).catch(function(error) {
        if (bubble) bubble.innerHTML = '❌ PO 목록 조회 중 오류가 발생했습니다.<br/>오류: ' + error.message;
        scrollBottom();
        const elapsed = Date.now() - startTime;
        state.stats.responseTimes.push(elapsed);
        state.stats.pending   = Math.max(0, state.stats.pending - 1);
        state.stats.resolved += 1;
        updateStats();
        const conv = state.conversations.find(function(c) { return c.id === state.currentConvId; });
        if (conv) conv.status = 'done';
      });
      return;
    }
  }

  // MM 연동&배치 질문 감지
  if (isDeployProcessQuery(text)) {
    const startTime = Date.now();
    const bubble = createAgentBubble('deploy');
    if (bubble) bubble.innerHTML = buildMMIntegrationAnswer();
    scrollBottom();
    const elapsed = Date.now() - startTime;
    state.stats.responseTimes.push(elapsed);
    state.stats.pending   = Math.max(0, state.stats.pending - 1);
    state.stats.resolved += 1;
    updateStats();
    const conv = state.conversations.find(function(c) { return c.id === state.currentConvId; });
    if (conv) conv.status = 'done';
    return;
  }

  callAIAgent(text, category);
}

/* ============================================================
    DIFY SSE API 호출 (ABC Lab Chat Messages API)
    ============================================================ */
async function callAIAgent(userText, category) {
  state.isTyping = true;
  if ($sendBtn) $sendBtn.disabled = true;
  const agentAvatarEl = document.querySelector('.agent-avatar');
  if (agentAvatarEl) agentAvatarEl.classList.add('agent-pulse');
  setAIStatus('generating');

  const typingRow = document.createElement('div');
  typingRow.className = 'message-row agent';
  typingRow.id = 'typingIndicator';
  typingRow.innerHTML =
    '<div class="msg-avatar"><div class="ai-orb"></div></div>' +
    '<div class="msg-content">' +
      '<div class="msg-meta">' +
        '<span class="msg-name">STP AI Agent</span>' +
      '</div>' +
      '<div class="typing-indicator">' +
        '<div class="typing-dots">' +
          '<span class="typing-dot"></span>' +
          '<span class="typing-dot"></span>' +
          '<span class="typing-dot"></span>' +
        '</div>' +
        '<span class="typing-text" id="typingText">분석 중...</span>' +
      '</div>' +
    '</div>';
  if ($chatMessages) {
    $chatMessages.appendChild(typingRow);
    scrollBottom();
  }

  const startTime = Date.now();
  let answerBubble = null;
  let answerText   = '';

  try {
    // 첨부 파일 처리: 이미지는 DIFY 업로드, 문서는 텍스트 추출
    let extractedText = '';
    const uploadedFiles = [];
    if (state.pendingAttachments && state.pendingAttachments.length > 0) {
      const imageAttachments = state.pendingAttachments.filter(function(a) {
        return a.type === 'image';
      });
      const docAttachments = state.pendingAttachments.filter(function(a) {
        return a.type !== 'image';
      });

      // 이미지 파일: DIFY 업로드 + OCR 텍스트 추출 병렬 실행
      // (Vision 모델이 이미지를 못 볼 경우를 대비해 OCR 텍스트도 쿼리에 포함)
      if (imageAttachments.length > 0) {
        updateTypingText('이미지 업로드 및 OCR 분석 중... (' + imageAttachments.length + '개 이미지)');
        setAIStatus('analyzing');
        showToast('이미지를 분석 중입니다...', 'info');

        // 모든 이미지에 대해 업로드 + OCR 을 병렬로 실행
        const imagePromises = imageAttachments.map(async function(att) {
          var result = { name: att.name, uploadOk: false, ocrText: '' };

          // 1) DIFY 에 이미지 업로드 (비전 모델용)
          try {
            const fileId = await uploadFileToDify(att.file);
            uploadedFiles.push({
              type: 'image',
              transfer_method: 'local_file',
              upload_file_id: fileId
            });
            result.uploadOk = true;
            console.log('[Image Upload] 업로드 완료:', att.name, 'fileId:', fileId);
          } catch (uploadErr) {
            console.error('[Image Upload] 업로드 실패:', att.name, uploadErr);
          }

          // 2) OCR 텍스트 추출 (비전 모델 폴백용) — 업로드와 병렬
          try {
            const ocrText = await extractTextFromImage(att.file);
            if (ocrText && ocrText.length > 10) {
              result.ocrText = ocrText;
              console.log('[OCR] 성공:', att.name, '텍스트 길이:', ocrText.length);
            } else {
              console.log('[OCR] 텍스트가 너무 짧음:', att.name);
            }
          } catch (ocrErr) {
            console.warn('[OCR] 실패:', att.name, ocrErr.message);
          }

          return result;
        });

        const imageResults = await Promise.all(imagePromises);

        // OCR 텍스트가 있으면 쿼리에 포함
        var ocrTexts = [];
        imageResults.forEach(function(r) {
          if (r.ocrText) {
            ocrTexts.push('\n--- 이미지 OCR: ' + r.name + ' ---\n' + r.ocrText);
          }
        });

        if (ocrTexts.length > 0) {
          extractedText += '\n\n[이미지 OCR 결과]\n' + ocrTexts.join('\n');
          console.log('[Image OCR] 총', ocrTexts.length, '개 이미지에서 텍스트 추출 완료');
        } else {
          console.warn('[Image OCR] 모든 이미지에서 OCR 텍스트 추출 실패');
        }
      }

      // 문서 파일은 텍스트만 추출하여 쿼리에 추가
      if (docAttachments.length > 0) {
        console.log('[Document Extraction] 텍스트 추출 시작:', docAttachments.length, '개 파일');
        updateTypingText('문서 내용 추출 중... (' + docAttachments.length + '개 파일)');
        setAIStatus('analyzing');

        try {
          extractedText = await extractAllAttachmentsText(docAttachments);
          if (extractedText) {
            console.log('[Document Extraction] 추출 완료, 텍스트 길이:', extractedText.length);
          }
        } catch (extractError) {
          console.error('[Document Extraction] 추출 오류:', extractError);
          showToast('문서 분석 중 오류가 발생했습니다: ' + extractError.message, 'error');
        }
      }

      if (uploadedFiles.length > 0 || extractedText) {
        updateTypingText('파일 분석 완료, 응답 생성 중...');
      }
    }

    // 문서 텍스트가 있으면 사용자 입력에 추가
    let finalQuery = userText;
    if (extractedText) {
      finalQuery = userText + extractedText;
      console.log('[AI Request] 문서 텍스트 포함, 전체 쿼리 길이:', finalQuery.length);
    }

    const body = {
      inputs          : {},
      query           : finalQuery,
      response_mode   : 'streaming',
      conversation_id : state.difyConversationId || '',
      user            : DIFY_API.userId,
      auto_generate_name: false,
      files           : uploadedFiles
    };

    const res = await fetch(DIFY_API.endpoint, {
      method  : 'POST',
      headers : {
        'Content-Type'  : 'application/json',
        'Authorization' : 'Bearer ' + DIFY_API.apiKey,
        'User-Agent'    : 'STP-Agent/1.0/chat-messages'
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error('HTTP ' + res.status + ' — ' + errText);
    }

    const indicator = document.getElementById('typingIndicator');
    if (indicator) indicator.remove();

    const detectedCat = detectCategory(userText);
    answerBubble = createAgentBubble(detectedCat);

    const reader  = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let   buffer  = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop();

      for (const part of parts) {
        const line = part.trim();
        if (!line.startsWith('data:')) continue;

        const jsonStr = line.replace(/^data:\s*/, '');
        if (jsonStr === '[DONE]') continue;

        let parsed;
        try { parsed = JSON.parse(jsonStr); } catch(e) { continue; }

        const evt = parsed.event;
        if (parsed.conversation_id && !state.difyConversationId) {
          state.difyConversationId = parsed.conversation_id;
        }

        if (evt === 'message' || evt === 'agent_message') {
          answerText += (parsed.answer || '');
          if (answerBubble) {
            answerBubble.innerHTML = markdownToHtml(answerText);
            scrollBottom();
          }
        } else if (evt === 'message_replace') {
          answerText = parsed.answer || answerText;
          if (answerBubble) {
            answerBubble.innerHTML = markdownToHtml(answerText);
            scrollBottom();
          }
        } else if (evt === 'message_end') {
          const elapsed = Date.now() - startTime;
          state.stats.responseTimes.push(elapsed);
          state.stats.pending   = Math.max(0, state.stats.pending - 1);
          state.stats.resolved += 1;
          updateStats();
          
          // Add confidence badge to answer (removed - not needed)

          const conv = state.conversations.find(function(c) { return c.id === state.currentConvId; });
          if (conv) conv.status = 'done';

        } else if (evt === 'error') {
          throw new Error('[' + (parsed.code || 'error') + '] ' + (parsed.message || '알 수 없는 오류'));
        }
      }
    }

    if (!answerText.trim() && answerBubble) {
      answerBubble.innerHTML = '응답을 받지 못했습니다. 다시 시도해 주세요.';
    }

    // 첨부 파일 처리 완료 후 초기화 (OCR 처리 후)
    if (state.pendingAttachments && state.pendingAttachments.length > 0) {
      console.log('[Cleanup] 첨부 파일 처리 완료, 초기화');
      state.pendingAttachments = [];
      if ($attachedFiles) {
        renderAttachments();
      }
    }

  } catch (err) {
    console.error('[STP AI Agent] API 호출 실패:', err);
    const indicator = document.getElementById('typingIndicator');
    if (indicator) indicator.remove();

    if (!answerBubble) {
      answerBubble = createAgentBubble('etc');
    }
    if (answerBubble) {
      answerBubble.classList.add('error-bubble');
      answerBubble.innerHTML =
        '⚠️ AI 응답을 가져오지 못했습니다.<br><br>' +
        '<strong>오류 내용:</strong> ' + escapeHtml(err.message) +
        '<br><br>잠시 후 다시 시도해 주세요.<br>문제가 지속되면 STP 운영팀 (1588-0000) 에 문의해 주세요.';
    }

    state.stats.pending = Math.max(0, state.stats.pending - 1);
    updateStats();
    showToast('AI 응답 오류: ' + err.message, 'error');

  } finally {
    state.isTyping = false;
    if ($sendBtn) $sendBtn.disabled = false;
    if (agentAvatarEl) agentAvatarEl.classList.remove('agent-pulse');
    setAIStatus('idle');
    scrollBottom();
  }
}

function appendUserMessage(text, category, attachments) {
  if (!$chatMessages) return;
  const time     = getTimeString();
  const catLabel = getCategoryLabel(category);
  const row      = document.createElement('div');
  row.className  = 'message-row user';
  row.innerHTML  =
    '<div class="msg-avatar"><i class="fa-solid fa-user"></i></div>' +
    '<div class="msg-content">' +
      '<div class="msg-meta" style="justify-content:flex-end">' +
        '<span class="msg-time">' + time + '</span>' +
        '<span class="msg-name">나</span>' +
      '</div>' +
      (category !== 'all'
        ? '<span class="msg-category-tag"><i class="fa-solid fa-tag"></i>' + catLabel + '</span>'
        : '') +
      '<div class="msg-bubble">' + escapeHtml(text) + '</div>' +
    '</div>';
  
  if (attachments && attachments.length > 0) {
    const attBox = document.createElement('div');
    attBox.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;';
    attachments.forEach(function(a) {
      if (a.type === 'image' && a.preview) {
        const img = document.createElement('img');
        img.src = a.preview;
        img.alt = a.name;
        img.style.cssText = 'max-width:180px;max-height:180px;border-radius:10px;border:1px solid rgba(0,0,0,.1);';
        attBox.appendChild(img);
      } else {
        // 문서 파일 아이콘과 레이블
        const fileWrapper = document.createElement('div');
        fileWrapper.style.cssText = 'display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;background:#f5f5f5;border:1px solid rgba(0,0,0,.12);font-size:13px;';
        
        const icon = document.createElement('i');
        icon.className = getFileIcon(a.name);
        icon.style.cssText = 'color:#E2002A;font-size:14px;';
        fileWrapper.appendChild(icon);
        
        const label = document.createElement('span');
        label.textContent = a.name;
        label.style.cssText = 'max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        fileWrapper.appendChild(label);
        
        attBox.appendChild(fileWrapper);
      }
    });
    row.querySelector('.msg-content').appendChild(attBox);
  }
  
  $chatMessages.appendChild(row);
  scrollBottom();
}

/**
 * 파일 확장자에 따른 아이콘 클래스 반환
 */
function getFileIcon(fileName) {
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith('.pdf')) return 'fa-solid fa-file-pdf';
  if (lowerName.endsWith('.doc') || lowerName.endsWith('.docx')) return 'fa-solid fa-file-word';
  if (lowerName.endsWith('.xls') || lowerName.endsWith('.xlsx')) return 'fa-solid fa-file-excel';
  if (lowerName.endsWith('.ppt') || lowerName.endsWith('.pptx')) return 'fa-solid fa-file-powerpoint';
  if (lowerName.endsWith('.txt') || lowerName.endsWith('.csv')) return 'fa-solid fa-file-lines';
  if (lowerName.endsWith('.html') || lowerName.endsWith('.htm')) return 'fa-solid fa-file-code';
  if (lowerName.endsWith('.zip')) return 'fa-solid fa-file-zipper';
  return 'fa-solid fa-file';
}

function createAgentBubble(category) {
  if (!$chatMessages) return null;
  const time     = getTimeString();
  const catLabel = getCategoryLabel(category);
  const row      = document.createElement('div');
  row.className  = 'message-row agent';

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';

  const content = document.createElement('div');
  content.className = 'msg-content';
  content.innerHTML =
    '<div class="msg-meta">' +
      '<span class="msg-name">STP AI Agent</span>' +
      '<span class="api-badge"><i class="fa-solid fa-microchip"></i> Dify AI</span>' +
      '<span class="msg-time">' + time + '</span>' +
    '</div>' +
    '<span class="msg-category-tag"><i class="fa-solid fa-tag"></i>' + catLabel + '</span>';
  content.appendChild(bubble);

  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  avatar.innerHTML = '<div class="ai-orb"></div>';

  row.appendChild(avatar);
  row.appendChild(content);
  $chatMessages.appendChild(row);
  scrollBottom();

  return bubble;
}

function buildWelcomeHTML() {
  return '<div class="welcome-card">' +
'<div class="welcome-icon"><div class="ai-orb"></div></div>' +
'<h2>안녕하세요! STP AI Agent 입니다.</h2>' +
    '<p><strong>SAP MM</strong> 및 <strong>KT DS STP</strong> 업무 관련 문의사항을 자유롭게 질문해 주세요.<br/>' +
    '구매 프로세스, 자재 관리, 신설법인 프로세스, 계정/권한 등 다양한 업무를 지원합니다.<br/>' +
    'STP AI 에이전트가 실시간으로 정확한 답변을 제공합니다.</p>' +
    '<div class="quick-btns">' +
      '<button class="quick-btn" data-msg="SAP MM(Material Management) 모듈에 대해 알려주세요"><i class="fa-solid fa-cubes"></i> SAP MM 모듈</button>' +
      '<button class="quick-btn" data-msg="STP Table & T-code 알려주세요"><i class="fa-solid fa-table"></i> Table & T-code</button>' +
      '<button class="quick-btn" data-msg="신설법인 (Netcore, P&M) 프로세스 알려주세요"><i class="fa-solid fa-building-circle-arrow-right"></i> 신설법인 프로세스</button>' +
      '<button class="quick-btn" data-msg="STP에서 업무할 때 주로 사용하는 연계 시스템에 대해서 알려주세요"><i class="fa-solid fa-desktop"></i> 시스템</button>' +
      '<button class="quick-btn" data-msg="MM RFC & 배치에 대해 알려주세요"><i class="fa-solid fa-network-wired"></i> MM RFC & 배치</button>' +
      '<button class="quick-btn" data-msg="STP 운영 담당부서를 알려주세요"><i class="fa-solid fa-address-book"></i> 담당자 연락처</button>' +
    '</div>' +
  '</div>';
}

function createConversation(firstMsg, category) {
  const id = Date.now().toString();
  state.currentConvId = id;
  state.conversations.unshift({
    id      : id,
    category: category,
    title   : firstMsg.length > 30 ? firstMsg.slice(0, 30) + '...' : firstMsg,
    preview : firstMsg,
    time    : getDateTimeString(),
    status  : 'ing'
  });
}

function updateConversation(newMsg) {
  const conv = state.conversations.find(function(c) { return c.id === state.currentConvId; });
  if (conv) conv.preview = newMsg;
}

function startNewConversation() {
  state.currentConvId      = null;
  state.difyConversationId = null;
  state.pendingAttachments = [];
  renderAttachments();
  if ($chatMessages) {
    $chatMessages.innerHTML = buildWelcomeHTML();
    bindQuickButtons();
  }
  showToast('새 대화가 시작되었습니다.', 'success');
}

function clearChat() {
  if (!confirm('현재 대화 내용을 삭제하시겠습니까?')) return;
  state.currentConvId      = null;
  state.difyConversationId = null;
  state.pendingAttachments = [];
  renderAttachments();
  if ($chatMessages) {
    $chatMessages.innerHTML = buildWelcomeHTML();
    bindQuickButtons();
  }
  showToast('대화가 초기화되었습니다.', 'info');
}

function exportChat() {
  if (!$chatMessages) return;
  const rows = $chatMessages.querySelectorAll('.message-row');
  if (rows.length === 0) { showToast('내보낼 대화 내용이 없습니다.', 'error'); return; }

  let content = 'KT DS STP AI Agent 대화 내보내기\n';
  content += '출력 일시: ' + getDateTimeString() + '\n';
  content += '='.repeat(60) + '\n\n';

  rows.forEach(function(row) {
    const isUser = row.classList.contains('user');
    const name   = isUser ? '[ 나 ]' : '[ STP AI Agent ]';
    const bubble = row.querySelector('.msg-bubble');
    const time   = row.querySelector('.msg-time');
    if (bubble) {
      content += name + ' ' + (time ? time.textContent : '') + '\n';
      content += bubble.innerText + '\n\n';
    }
  });

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = 'STP_AI_Chat_' + new Date().toISOString().slice(0,10) + '.txt';
  a.click();
  showToast('대화 내용을 내보냈습니다.', 'success');
}

function renderHistory(filter) {
  if (!$historyList) return;
  const items = filter
    ? state.conversations.filter(function(c) {
        return c.title.includes(filter) || c.preview.includes(filter);
      })
    : state.conversations;

  if (items.length === 0) {
    $historyList.innerHTML =
      '<div style="text-align:center;padding:60px 0;color:var(--text-muted)">' +
      '<i class="fa-solid fa-inbox" style="font-size:40px;margin-bottom:12px;display:block"></i>' +
      '대화 이력이 없습니다.</div>';
    return;
  }

  $historyList.innerHTML = items.map(function(conv) {
    const icon = getCategoryIcon(conv.category);
    const statusClass = conv.status === 'done' ? 'status-done' : 'status-ing';
    const statusLabel = conv.status === 'done' ? '처리완료' : '처리중';
    return '<div class="history-item">' +
      '<div class="history-cat-icon"><i class="' + icon + '"></i></div>' +
      '<div class="history-info">' +
        '<div class="history-title">' + escapeHtml(conv.title) + '</div>' +
        '<div class="history-preview">' + escapeHtml(conv.preview) + '</div>' +
      '</div>' +
      '<div class="history-meta">' +
        '<span class="history-date">' + conv.time + '</span>' +
        '<span class="history-status ' + statusClass + '">' + statusLabel + '</span>' +
      '</div>' +
    '</div>';
  }).join('');
}

function updateStats() {
  if ($statTotal)    $statTotal.textContent    = state.stats.total;
  if ($statResolved) $statResolved.textContent = state.stats.resolved;
  if ($statPending)  $statPending.textContent  = state.stats.pending;
  if ($statAvg) {
    if (state.stats.responseTimes.length > 0) {
      const sum = state.stats.responseTimes.reduce(function(a, b) { return a + b; }, 0);
      const avg = Math.round(sum / state.stats.responseTimes.length / 100) / 10;
      $statAvg.textContent = avg + 's';
    } else {
      $statAvg.textContent = '0s';
    }
  }
}

function showToast(msg, type) {
  if (!$toastContainer) return;
  type = type || 'info';
  const iconMap = { success: 'fa-circle-check', error: 'fa-circle-exclamation', info: 'fa-circle-info' };
  const icon = iconMap[type] || 'fa-circle-info';
  const toast = document.createElement('div');
  toast.className = 'toast' + (type === 'success' ? ' success' : type === 'error' ? ' error-toast' : '');
  toast.innerHTML = '<i class="fa-solid ' + icon + '"></i>' + escapeHtml(msg);
  $toastContainer.appendChild(toast);
  setTimeout(function() { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 3500);
}

function scrollBottom() {
  if ($chatMessages) $chatMessages.scrollTop = $chatMessages.scrollHeight;
}

function updateTypingText(text) {
  const typingTextEl = document.getElementById('typingText');
  if (typingTextEl) {
    typingTextEl.textContent = text;
  }
}

/* ============================================================
   AI STATUS INDICATOR
   ============================================================ */
function setAIStatus(status) {
  const agentDesc = document.querySelector('.agent-desc');
  if (!agentDesc) return;

  const statusMap = {
    'idle':         { cls: 'status-idle',         icon: '🟢', text: '대기중' },
    'generating':   { cls: 'status-generating',    icon: '🔵', text: '답변 생성중' },
    'analyzing':    { cls: 'status-analyzing',     icon: '🟣', text: '문서 분석중' },
    'searching':    { cls: 'status-searching',     icon: '🟡', text: 'Knowledge 검색중' }
  };

  const s = statusMap[status] || statusMap['idle'];
  agentDesc.className = 'agent-desc ' + s.cls;
  agentDesc.innerHTML = s.icon + ' ' + s.text + ' &nbsp;·&nbsp; <i class="fa-solid fa-microchip" style="color:var(--kt-red)"></i> 오늘도 당신을 응원합니다!';
}

function autoResizeTextarea(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 180) + 'px';
}

function getTimeString() {
  return new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

function getDateTimeString() {
  return new Date().toLocaleString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function markdownToHtml(text) {
  // 원본 내용 보존하면서 불필요한 빈 줄만 제거
  let processed = text;
  
  // ## 헤더 제거 (가독성 개선을 위해 모든 헤더 마크다운 제거)
  processed = processed.replace(/^#{1,6}\s+(.*)$/gm, '$1');
  
  // --- 구분선 제거
  processed = processed.replace(/^---$/gm, '');
  
  // 표 구분선行 제거 (|-----|-----| 같은行)
  processed = processed.replace(/^\|[-:\s|]+\|$/gm, '');
  
  // 불필요한 빈 줄 제거 (3 개 이상 → 1 개로)
  processed = processed.replace(/\n{3,}/g, '\n\n');
  
  // 코드 블록 처리
  processed = processed.replace(/```[\w]*\n?([\s\S]*?)```/g,
    '<pre style="background:var(--bg-card);padding:10px;border-radius:6px;font-size:12px;overflow-x:auto;margin:8px 0;border:1px solid var(--border-color)"><code>$1</code></pre>');
  
  // 볼드 텍스트 처리
  processed = processed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  
  // 볼드 처리 후 남은 단독 * 제거 (전화번호 등 숫자 마스킹 방지)
  processed = processed.replace(/\*/g, '');
  
  // 인라인 코드 처리
  processed = processed.replace(/`([^`\n]+)`/g,
    '<code style="background:var(--bg-card);padding:2px 6px;border-radius:4px;font-size:12px;color:var(--kt-red);border:1px solid var(--border-color)">$1</code>');
  
  // 리스트 처리 (• 기호 유지)
  processed = processed.replace(/^•\s+(.*)$/gm, '• $1');
  
  // 테이블 행 처리 (간결하게)
  processed = processed.replace(/\|(.+)\|/g, '<div style="display:flex;border-bottom:1px solid var(--border-color);padding:6px 12px;margin:0;font-size:13px;line-height:1.6;background:var(--bg-card)">$1</div>');
  
  // 표 제목행 (첫 번째 행) 강조
  let firstDiv = true;
  processed = processed.replace(/<div style="display:flex.*?>(.+?)<\/div>/g, function(match, content) {
    if (firstDiv) {
      firstDiv = false;
      return '<div style="display:flex;border-bottom:2px solid var(--kt-red);padding:6px 12px;margin:0;font-size:13px;font-weight:600;color:var(--kt-red);line-height:1.6;background:var(--kt-red-muted)">' + content + '</div>';
    }
    return match;
  });
  
  // 최종 줄바꿈 처리
  processed = processed.replace(/\n/g, '<br/>');
  
  return processed;
}

/* ============================================================
   EXTRACTED TEXT PREVIEW MODAL FUNCTIONS
   ============================================================ */
let currentExtractedText = '';

function showExtractPreview(text) {
  const modal = document.getElementById('extractPreviewModal');
  const previewView = document.getElementById('previewView');
  const previewEditor = document.getElementById('previewEditor');
  
  if (!modal || !previewView || !previewEditor) return;
  
  currentExtractedText = text;
  previewView.textContent = text;
  previewEditor.value = text;
  
  // 기본 탭: 미리보기
  document.querySelectorAll('.preview-tab').forEach(tab => tab.classList.remove('active'));
  document.querySelector('.preview-tab[data-tab="preview"]').classList.add('active');
  previewView.style.display = 'block';
  previewEditor.style.display = 'none';
  
  modal.style.display = 'flex';
  setTimeout(() => modal.classList.add('active'), 10);
}

function hideExtractPreview() {
  const modal = document.getElementById('extractPreviewModal');
  if (!modal) return;
  
  modal.classList.remove('active');
  setTimeout(() => modal.style.display = 'none', 200);
}

function switchPreviewTab(tabName) {
  const previewView = document.getElementById('previewView');
  const previewEditor = document.getElementById('previewEditor');
  const tabs = document.querySelectorAll('.preview-tab');
  
  if (!previewView || !previewEditor) return;
  
  tabs.forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });
  
  if (tabName === 'edit') {
    previewView.style.display = 'none';
    previewEditor.style.display = 'block';
  } else {
    previewView.textContent = previewEditor.value;
    previewView.style.display = 'block';
    previewEditor.style.display = 'none';
  }
}

function copyExtractedText() {
  const text = currentExtractedText || document.getElementById('previewEditor')?.value || '';
  if (!text) {
    showToast('복사할 텍스트가 없습니다.', 'error');
    return;
  }
  
  navigator.clipboard.writeText(text).then(() => {
    showToast('텍스트를 클립보드에 복사했습니다.', 'success');
  }).catch(() => {
    showToast('복사 실패: ' + text.substring(0, 50) + '...', 'error');
  });
}

function applyExtractedText() {
  const text = document.getElementById('previewEditor')?.value || currentExtractedText || '';
  const userInput = document.getElementById('userInput');
  
  if (!userInput) {
    showToast('입력 필드를 찾을 수 없습니다.', 'error');
    return;
  }
  
  // 기존 텍스트 뒤에 추가
  const currentText = userInput.value.trim();
  userInput.value = currentText ? currentText + '\n\n' + text : text;
  
  // 입력 이벤트 트리거
  userInput.dispatchEvent(new Event('input'));
  userInput.focus();
  
  hideExtractPreview();
  showToast('텍스트를 입력창에 적용했습니다.', 'success');
}

/* ============================================================
    HELPER FUNCTIONS
    ============================================================ */

/**
 * 글자 수 카운터 업데이트
 */
function updateCharCount() {
  if (!$userInput || !$charCount) return;
  const len = $userInput.value.length;
  $charCount.textContent = len;
  
  // 900 자 이상이면 경고 색상
  if (len > 900) {
    $charCount.style.color = '#FF5722';
  } else if (len > 500) {
    $charCount.style.color = '#FF9800';
  } else {
    $charCount.style.color = 'var(--text-muted)';
  }
}

/* ============================================================
    INITIALIZATION
    ============================================================ */
document.addEventListener('DOMContentLoaded', function() {
  updateCharCount();
  renderAttachments();
  updateStats();
  setAIStatus('idle');

  /* ============================================================
     SIDEBAR TOGGLE
     ============================================================ */
  const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
  const sidebar = document.getElementById('sidebar');
  if (sidebarToggleBtn && sidebar) {
    sidebarToggleBtn.addEventListener('click', function() {
      sidebar.classList.toggle('collapsed');
    });
  }
  
  // 모달 이벤트 리스너 설정
  const closePreviewBtn = document.getElementById('closePreviewBtn');
  const copyTextBtn = document.getElementById('copyTextBtn');
  const applyTextBtn = document.getElementById('applyTextBtn');
  
  if (closePreviewBtn) {
    closePreviewBtn.addEventListener('click', hideExtractPreview);
  }
  if (copyTextBtn) {
    copyTextBtn.addEventListener('click', copyExtractedText);
  }
  if (applyTextBtn) {
    applyTextBtn.addEventListener('click', applyExtractedText);
  }
  
  // 탭 전환 이벤트
  document.querySelectorAll('.preview-tab').forEach(tab => {
    tab.addEventListener('click', function() {
      switchPreviewTab(this.dataset.tab);
    });
  });
  
  // 모달 외부 클릭 시 닫기
  const modalOverlay = document.getElementById('extractPreviewModal');
  if (modalOverlay) {
    modalOverlay.addEventListener('click', function(e) {
      if (e.target === modalOverlay) {
        hideExtractPreview();
      }
    });
  }
  
  console.log(
    '%c KT DS STP AI Agent 초기화 완료 (ABC Lab Dify SSE 연동 + 파일 첨부 기능 + OCR + 미리보기) ',
    'background:#E2002A;color:#fff;padding:4px 10px;border-radius:4px;font-weight:bold'
  );
});
