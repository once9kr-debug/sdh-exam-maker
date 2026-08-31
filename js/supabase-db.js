const SUPABASE_URL = 'https://kqmogqlukkviddjsfyeb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtxbW9ncWx1a2t2aWRkanNmeWViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5Mjc3NjYsImV4cCI6MjEwMzUwMzc2Nn0.nqWvvphNCdPGMDrEYLilk-wHmNkH2BhPTuvMwaCXqo8';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let passageArchiveDB = [], generatedQuestionsPool = [], mockExams = [], schoolBenchmarkDB = [], queuedPdfFiles = [];

function updateBenchmarkCountUI(count) {
  const badge = document.getElementById('benchmarkCountBadge');
  const totalCountEl = document.getElementById('tableTotalCount');
  if (badge) badge.innerText = `기출 ${count}제`;
  if (totalCountEl) totalCountEl.innerText = count;
}

// 🎯 대용량 DB 부하 방지를 위한 최신 데이터 페이징 조회
async function loadAllSupabaseData() {
  const { data: pData } = await supabaseClient
    .from('passages')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(300);
  passageArchiveDB = pData || [];

  const { data: bData } = await supabaseClient
    .from('school_benchmark')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);
  schoolBenchmarkDB = bData || [];
  updateBenchmarkCountUI(schoolBenchmarkDB.length);

  const { data: qData } = await supabaseClient
    .from('questions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);
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
    if (matchedKey) {
      examMap[matchedKey].questionCount++;
    }
  });

  mockExams = Object.values(examMap);
  populateSelectMockSetDropdown();
}

function populateSelectMockSetDropdown() {
  const select = document.getElementById('selectMockSet');
  if (!select) return;
  select.innerHTML = '<option value="">-- 모의고사 세트를 선택하세요 --</option>' + 
    mockExams.map(e => `<option value="${e.id}">${e.title} (${e.questionCount}문항 적재됨)</option>`).join('');
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function callGeminiWithRetry(apiKey, promptText, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await callGeminiUniversal(apiKey, promptText);
    } catch (err) {
      if (attempt === maxRetries) throw err;
      await sleep(2000 * attempt);
    }
  }
}

// 🎯 PDF 실제 기출 발문 정밀 파서
async function startBatchPdfClassification() {
  const apiKey = getStoredApiKey();
  if (!apiKey) return toggleApiKeyModal();
  if (queuedPdfFiles.length === 0) return alert('분석할 PDF 파일이 없습니다.');

  const logBox = document.getElementById('pdfLogTerminal');
  const btn = document.getElementById('btnStartBatch');

  btn.disabled = true; 
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> 정밀 기출 분석 및 원문 추출 중...';
  logBox.innerHTML = `<div>🚀 [BENCHMARK PARSER] 총 ${queuedPdfFiles.length}개 시험지 정밀 원문 추출 가동...</div>`;

  for (let i = 0; i < queuedPdfFiles.length; i++) {
    const file = queuedPdfFiles[i];
    logBox.innerHTML += `<div class="text-amber-400">⏳ [${i+1}/${queuedPdfFiles.length}] '${file.name}' 실제 발문 원문 추출 중...</div>`;
    logBox.scrollTop = logBox.scrollHeight;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = '';
      for (let p = 1; p <= pdf.numPages; p++) {
        fullText += (await (await pdf.getPage(p)).getTextContent()).items.map(item => item.str).join(' ') + '\n';
      }

      const parserPrompt = `
당신은 대한민국 고등학교 영어 내신 시험지 원문 분석가입니다.
[시험지 텍스트]:
${fullText.slice(0, 15000)}

위 시험지에서 가장 대표적인 킬러 문항 1개를 찾아 아래 규격의 JSON으로 작성하세요:
{
  "school": "학교명 (예: 세종고)",
  "exam": "시험구분 (예: 1학기 기말)",
  "type": "유형 (어법, 어휘, 빈칸, 순서, 삽입, 서술형, 주제, 요약 중 1개)",
  "raw_title": "시험지에 실제로 쓰인 발문 문장 전체 (예: '다음 글의 밑줄 친 ①~⑤ 중 어법상 틀린 것만을 고른 것은?')",
  "trick": "핵심 출제 킬러 포인트 1문장 요약"
}
`;
      await sleep(1000);

      const rawJson = await callGeminiWithRetry(apiKey, parserPrompt);
      let cleanedJson = rawJson.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanedJson);
      
      if (parsed && parsed.school) {
        const insertPayload = {
          id: Date.now() + Math.floor(Math.random() * 1000),
          school: parsed.school,
          exam: parsed.exam || '기출',
          type: parsed.type || '어법',
          title: parsed.raw_title || parsed.title || '실제 기출 발문',
          trick: parsed.trick || '기출 정밀 분석 완료'
        };

        const { data: inserted, error } = await supabaseClient
          .from('school_benchmark')
          .insert([insertPayload])
          .select();
        
        if (!error && inserted && inserted.length > 0) {
          schoolBenchmarkDB.unshift(inserted[0]);
          updateBenchmarkCountUI(schoolBenchmarkDB.length);
          logBox.innerHTML += `<div class="text-emerald-300 font-bold">✓ [${file.name}] 실제 기출 원문 적재 성공!</div>`;
        }
      }
    } catch (err) {
      logBox.innerHTML += `<div class="text-rose-400">❌ [${file.name}] 에러: ${err.message}</div>`;
    }
  }

  logBox.innerHTML += `<div class="text-cyan-300 font-bold mt-3">🎉 기출 원문 DB 적재 완료!</div>`;
  btn.disabled = false;
  btn.innerHTML = '초고속 동시 병렬 분석 및 DB 적재 시작';
}

document.addEventListener('DOMContentLoaded', () => {
  loadAllSupabaseData();
});
