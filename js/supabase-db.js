const SUPABASE_URL = 'https://kqmogqlukkviddjsfyeb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtxbW9ncWx1a2t2aWRkanNmeWViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5Mjc3NjYsImV4cCI6MjEwMzUwMzc2Nn0.nqWvvphNCdPGMDrEYLilk-wHmNkH2BhPTuvMwaCXqo8';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let passageArchiveDB = [], generatedQuestionsPool = [], mockExams = [], schoolBenchmarkDB = [], queuedPdfFiles = [];
const passageNumberList = [18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,43];

// 🎯 화면 전환 관리
function switchView(viewName) {
  const views = ['examList', 'regPassage', 'benchmarkDB', 'aiGenerator', 'paperView'];
  views.forEach(v => {
    const el = document.getElementById(`view-${v}`);
    if (el) el.classList.add('hidden');
  });
  const target = document.getElementById(`view-${viewName}`);
  if (target) target.classList.remove('hidden');
}

// 🎯 시스템 모드 토글 (관리자/선생님)
function setSystemMode(mode) {
  const adminGroup = document.getElementById('adminMenuGroup');
  const label = document.getElementById('currentModeLabel');
  const btnAdmin = document.getElementById('modeBtn_admin');
  const btnTeacher = document.getElementById('modeBtn_teacher');

  if (mode === 'admin') {
    if (adminGroup) adminGroup.classList.remove('hidden');
    if (label) label.innerText = '관리자 접속 중';
    btnAdmin.className = 'flex-1 py-1.5 rounded-lg bg-cyan-500 text-slate-950 transition font-bold';
    btnTeacher.className = 'flex-1 py-1.5 rounded-lg text-slate-400 hover:text-white transition font-bold';
  } else {
    if (adminGroup) adminGroup.classList.add('hidden');
    if (label) label.innerText = '선생님 모드 접속 중';
    btnTeacher.className = 'flex-1 py-1.5 rounded-lg bg-cyan-500 text-slate-950 transition font-bold';
    btnAdmin.className = 'flex-1 py-1.5 rounded-lg text-slate-400 hover:text-white transition font-bold';
    switchView('examList');
  }
}

function updateBenchmarkCountUI(count) {
  const badge = document.getElementById('benchmarkCountBadge');
  if (badge) badge.innerText = `기출 ${count}제`;
}

// 🎯 Supabase 데이터 수집 및 보관함 카드 렌더링
async function loadAllSupabaseData() {
  const { data: pData } = await supabaseClient.from('passages').select('*').order('created_at', { ascending: false }).limit(300);
  passageArchiveDB = pData || [];

  const { data: bData } = await supabaseClient.from('school_benchmark').select('*').order('created_at', { ascending: false }).limit(200);
  schoolBenchmarkDB = bData || [];
  updateBenchmarkCountUI(schoolBenchmarkDB.length);
  renderBenchmarkFolderView();

  const { data: qData } = await supabaseClient.from('questions').select('*').order('created_at', { ascending: false }).limit(500);
  generatedQuestionsPool = qData || [];

  const examMap = {};
  passageArchiveDB.forEach(p => {
    const pYear = p.year || '2024';
    const pMonth = p.month || '3';
    const rawGrade = String(p.grade || '1').replace('고', '');
    const pGrade = `고${rawGrade}`;
    const setKey = p.set_key || `${pYear}-${pMonth}-${rawGrade}`;

    if (!examMap[setKey]) {
      examMap[setKey] = {
        id: setKey,
        year: pYear,
        month: pMonth,
        grade: pGrade,
        title: `${pYear}년 ${pMonth}월 학력평가 (${pGrade})`,
        questionCount: 0
      };
    }
  });

  generatedQuestionsPool.forEach(q => {
    const matchedKey = Object.keys(examMap).find(k => k === q.set_key || k.startsWith(q.set_key) || q.set_key.startsWith(k));
    if (matchedKey) examMap[matchedKey].questionCount++;
  });

  mockExams = Object.values(examMap);
  renderExamTable();
  populateSelectMockSetDropdown();
}

function renderExamTable() {
  const container = document.getElementById('examTableContainer');
  if (!container) return;

  if (mockExams.length === 0) {
    container.innerHTML = `<div class="col-span-3 p-8 text-center text-slate-400 bg-white rounded-2xl border border-dashed">보관된 모의고사 세트가 없습니다.</div>`;
    return;
  }

  container.innerHTML = mockExams.map(exam => `
    <div class="bg-white p-5 rounded-2xl border hover:border-cyan-500 shadow-sm transition space-y-4">
      <div class="flex justify-between items-start">
        <div>
          <span class="bg-slate-100 text-slate-600 font-bold text-[10px] px-2 py-0.5 rounded-full">${exam.grade}</span>
          <h3 class="font-black text-slate-900 text-sm mt-1">${exam.title}</h3>
        </div>
        <span class="bg-cyan-50 text-cyan-700 font-bold text-xs px-2.5 py-1 rounded-lg border border-cyan-100">${exam.questionCount}문항</span>
      </div>
      <button onclick="loadPaperForExam('${exam.id}')" class="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-cyan-400 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5">
        <i class="fa-solid fa-print"></i> 문제지 미리보기 및 인쇄
      </button>
    </div>
  `).join('');
}

function loadPaperForExam(setKey) {
  filteredQuestions = generatedQuestionsPool.filter(q => q.set_key === setKey || setKey.includes(q.set_key));
  if (filteredQuestions.length === 0) return alert('이 세트로 출제된 변형문제가 없습니다. AI Engine에서 먼저 생성해주세요.');
  renderPaper();
  switchView('paperView');
}

function populateSelectMockSetDropdown() {
  const select = document.getElementById('selectMockSet');
  if (!select) return;
  select.innerHTML = '<option value="">-- 모의고사 세트를 선택하세요 --</option>' + 
    mockExams.map(e => `<option value="${e.id}">${e.title}</option>`).join('');
}

// 🎯 18~45번 동적 입력 박스 생성
function renderPassageInputs() {
  const container = document.getElementById('passageInputContainer');
  if (!container) return;
  container.innerHTML = passageNumberList.map(num => `
    <div class="p-3 bg-slate-50 border rounded-xl space-y-1">
      <label class="font-bold text-slate-700 text-xs block">[지문 ${num}번]</label>
      <textarea id="inputP_${num}" rows="3" class="w-full p-2 border rounded-lg text-xs font-mono" placeholder="${num}번 영어 원문 지문을 붙여넣으세요..."></textarea>
    </div>
  `).join('');
}

async function saveAll25Passages() {
  const year = document.getElementById('regYear')?.value || '2024';
  const month = document.getElementById('regMonth')?.value || '3';
  const grade = document.getElementById('regGrade')?.value || '1';
  const setKey = `${year}-${month}-${grade}`;
  const upsertData = [];

  passageNumberList.forEach(num => {
    const text = document.getElementById(`inputP_${num}`)?.value.trim();
    if (text) upsertData.push({ set_key: setKey, year, month, grade: `고${grade}`, passage_num: String(num), sample_text: text.substring(0, 30) + '...', full_text: text });
  });

  if (upsertData.length > 0) {
    await supabaseClient.from('passages').upsert(upsertData);
    alert('🎉 지문 DB 저장 완료!');
    await loadAllSupabaseData();
  }
}

// 🎯 PDF 드롭존 이벤트 바인딩
function initPdfDropZone() {
  const dropZone = document.getElementById('pdfDropZone');
  const fileInput = document.getElementById('pdfFileInput');
  if (!dropZone || !fileInput) return;

  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('border-cyan-500'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('border-cyan-500'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('border-cyan-500');
    if (e.dataTransfer.files) handlePdfSelect({ target: { files: e.dataTransfer.files } });
  });
}

function handlePdfSelect(e) {
  const files = Array.from(e.target.files).filter(f => f.type === 'application/pdf');
  queuedPdfFiles = files;
  const badge = document.getElementById('parsedItemCount');
  if (badge) badge.innerText = `대기 중인 파일: ${queuedPdfFiles.length}개`;
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function startBatchPdfClassification() {
  const apiKey = getStoredApiKey();
  if (!apiKey) return alert('API Key 설정이 필요합니다.');
  if (queuedPdfFiles.length === 0) return alert('분석할 PDF 파일이 없습니다.');

  const logBox = document.getElementById('pdfLogTerminal');
  logBox.innerHTML = `<div>🚀 [BENCHMARK PARSER] 총 ${queuedPdfFiles.length}개 시험지 정밀 원문 추출 시작...</div>`;

  for (let i = 0; i < queuedPdfFiles.length; i++) {
    const file = queuedPdfFiles[i];
    logBox.innerHTML += `<div class="text-amber-400">⏳ [${i+1}/${queuedPdfFiles.length}] '${file.name}' 파싱 중...</div>`;
    
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = '';
      for (let p = 1; p <= pdf.numPages; p++) {
        fullText += (await (await pdf.getPage(p)).getTextContent()).items.map(item => item.str).join(' ') + '\n';
      }

      const parserPrompt = `
[시험지 텍스트]: ${fullText.slice(0, 15000)}
위 시험지에서 킬러 문항 1개의 JSON 작성:
{ "school": "학교명", "exam": "시험구분", "type": "어법", "raw_title": "시험지 실제 발문 전체", "trick": "킬러 포인트" }
`;
      const rawJson = await callGeminiWithRetry(apiKey, parserPrompt);
      const parsed = JSON.parse(rawJson.replace(/```json/g, '').replace(/```/g, '').trim());

      if (parsed && parsed.school) {
        const { data: inserted } = await supabaseClient.from('school_benchmark').insert([{
          id: Date.now() + Math.floor(Math.random() * 1000),
          school: parsed.school, exam: parsed.exam || '기출', type: parsed.type || '어법',
          title: parsed.raw_title || '실제 기출 발문', trick: parsed.trick || '정밀 분석 완료'
        }]).select();

        if (inserted) {
          schoolBenchmarkDB.unshift(inserted[0]);
          updateBenchmarkCountUI(schoolBenchmarkDB.length);
          renderBenchmarkFolderView();
          logBox.innerHTML += `<div class="text-emerald-300">✓ [${file.name}] 적재 성공!</div>`;
        }
      }
    } catch (err) {
      logBox.innerHTML += `<div class="text-rose-400">❌ [${file.name}] 에러: ${err.message}</div>`;
    }
  }
}

function renderBenchmarkFolderView() {
  const container = document.getElementById('benchmarkFolderContainer');
  if (!container) return;
  if (schoolBenchmarkDB.length === 0) {
    container.innerHTML = `<div class="p-8 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed">등록된 기출 DB가 없습니다.</div>`;
    return;
  }
  container.innerHTML = schoolBenchmarkDB.map((b, i) => `
    <div class="p-3 border rounded-xl bg-slate-50 text-xs flex justify-between">
      <div><strong>[${b.school}]</strong> ${b.title}</div>
      <div class="text-cyan-700 font-bold">${b.trick}</div>
    </div>
  `).join('');
}

async function resetBenchmarkDB() {
  if (confirm('기출 DB를 전체 초기화하시겠습니까?')) {
    await supabaseClient.from('school_benchmark').delete().neq('id', 0);
    await loadAllSupabaseData();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadAllSupabaseData();
  renderPassageInputs();
  initPdfDropZone();
});
