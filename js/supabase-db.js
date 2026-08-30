const SUPABASE_URL = 'https://kqmogqlukkviddjsfyeb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtxbW9ncWx1a2t2aWRkanNmeWViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5Mjc3NjYsImV4cCI6MjEwMzUwMzc2Nn0.nqWvvphNCdPGMDrEYLilk-wHmNkH2BhPTuvMwaCXqo8';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let passageArchiveDB = [], generatedQuestionsPool = [], mockExams = [], schoolBenchmarkDB = [], queuedPdfFiles = [];

// 🎯 DB 전체 동기화 및 사이드바 뱃지 업데이트
async function loadAllSupabaseData() {
  const { data: pData } = await supabaseClient.from('passages').select('*').order('created_at', { ascending: false });
  passageArchiveDB = pData || [];
  renderPassageArchiveTable();

  const { data: bData } = await supabaseClient.from('school_benchmark').select('*').order('created_at', { ascending: false });
  schoolBenchmarkDB = bData || [];
  renderBenchmarkTable();

  const { data: qData } = await supabaseClient.from('questions').select('*').order('created_at', { ascending: false });
  generatedQuestionsPool = qData || [];

  const examMap = {};
  passageArchiveDB.forEach(p => {
    if (!examMap[p.set_key]) {
      examMap[p.set_key] = { id: p.set_key, year: p.year, month: p.month, grade: `고${p.grade}`, title: `${p.year}년 ${p.month}월 학력평가`, questionCount: 0 };
    }
  });

  generatedQuestionsPool.forEach(q => {
    if (examMap[q.set_key]) {
      examMap[q.set_key].questionCount++;
    }
  });

  mockExams = Object.values(examMap);
  renderExamTable();
}

async function saveAll25Passages() {
  const year = document.getElementById('regYear')?.value || '2024';
  const month = document.getElementById('regMonth')?.value || '6';
  const grade = document.getElementById('regGrade')?.value || '3';
  const setKey = `${year}-${month}-${grade}`;
  const upsertData = [];

  passageNumberList.forEach(num => {
    const text = document.getElementById(`inputP_${num}`)?.value.trim();
    if (text) upsertData.push({ set_key: setKey, year, month, grade, passage_num: num, sample_text: text.substring(0, 30) + '...', full_text: text });
  });

  if (upsertData.length > 0) {
    await supabaseClient.from('passages').upsert(upsertData);
    alert('🎉 지문 DB 저장 완료!');
    await loadAllSupabaseData();
  }
}

async function deleteSinglePassage(id) {
  await supabaseClient.from('passages').delete().eq('id', id);
  await loadAllSupabaseData();
}

async function clearPassageArchiveDB() {
  if (confirm('지문 및 생성된 문제 DB를 전체 초기화하시겠습니까?')) {
    await supabaseClient.from('passages').delete().neq('id', 0);
    await loadAllSupabaseData();
  }
}

// 🎯 API 503 방지용 지연 함수
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 🎯 학교 기출 PDF 정밀 파싱 엔진 (완전 보완)
async function startBatchPdfClassification() {
  const apiKey = getStoredApiKey();
  if (!apiKey) return toggleApiKeyModal();
  if (queuedPdfFiles.length === 0) return alert('분석할 PDF 파일이 없습니다.');

  const logBox = document.getElementById('pdfLogTerminal'), btn = document.getElementById('btnStartBatch');
  btn.disabled = true; 
  btn.innerHTML = '<i class="fa-solid fa-bolt fa-spin"></i> 정밀 기출 분석 진행 중...';

  logBox.innerHTML = `<div>🚀 [BATCH START] 총 ${queuedPdfFiles.length}개 시험지 정밀 분석 가동...</div>`;

  for (let i = 0; i < queuedPdfFiles.length; i++) {
    const file = queuedPdfFiles[i];
    logBox.innerHTML += `<div class="text-amber-400">⏳ [${i+1}/${queuedPdfFiles.length}] '${file.name}' 텍스트 추출 및 AI 분석 중...</div>`;
    logBox.scrollTop = logBox.scrollHeight;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = '';
      for (let p = 1; p <= pdf.numPages; p++) {
        fullText += (await (await pdf.getPage(p)).getTextContent()).items.map(item => item.str).join(' ') + '\n';
      }

      const parserPrompt = `
당신은 대한민국 고등학교 영어 시험지 분석 전문가입니다.
[시험지 원문]:
${fullText.slice(0, 15000)}

시험지의 핵심 킬러 문항 1개를 분석하여 반드시 아래 규격의 JSON 객체로 작성하세요:
{
  "school": "학교명 (예: 광명고등학교)",
  "exam": "시험구분 (예: 1학기 기말)",
  "type": "유형 (예: 어법 / 빈칸 / 순서 / 서술형 중 하나)",
  "title": "발문 요약 (예: 윗글의 밑줄 친 부분 중 어법상 틀린 것은?)",
  "trick": "핵심 킬러 함정 패턴 분석 1문장"
}
`;
      // API 호출 전 1초 대기 (503 연돈 초과 에러 방지)
      await sleep(1000);

      const rawJson = await callGeminiUniversal(apiKey, parserPrompt);
      let cleanedJson = rawJson.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanedJson);
      
      if (parsed && parsed.school) {
        await supabaseClient.from('school_benchmark').insert([parsed]);
        logBox.innerHTML += `<div class="text-emerald-300">✓ [${file.name}] DB 분석 및 적재 완료!</div>`;
      } else {
        logBox.innerHTML += `<div class="text-rose-400">❌ [${file.name}] 데이터 형식이 올바르지 않습니다.</div>`;
      }
    } catch (err) {
      logBox.innerHTML += `<div class="text-rose-400">❌ [${file.name}] 분석 에러: ${err.message}</div>`;
    }
    logBox.scrollTop = logBox.scrollHeight;
  }

  logBox.innerHTML += `<div class="text-cyan-300 font-bold mt-2">🎉 전체 PDF 분석 및 DB 적재 완료!</div>`;
  btn.disabled = false; 
  btn.innerHTML = '<i class="fa-solid fa-bolt"></i> 초고속 동시 병렬 분석 및 DB 적재 시작';
  clearQueuedFiles();
  
  // 🎯 DB 및 사이드바/하단 테이블 즉시 동기화
  await loadAllSupabaseData(); 
}

// 🎯 하단 기출 목록 테이블 및 사이드바 수량 뱃지 렌더링
function renderBenchmarkTable() {
  const tbody = document.getElementById('benchmarkTableBody');
  const totalCount = document.getElementById('tableTotalCount');
  const badge = document.getElementById('benchmarkCountBadge');

  const count = schoolBenchmarkDB.length;
  if (totalCount) totalCount.innerText = count;
  if (badge) badge.innerText = `기출 ${count}제`;

  if (tbody) {
    if (count === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="py-8 text-center text-slate-400">축적된 기출 DB가 없습니다. PDF 시험지를 드롭하여 등록하세요.</td></tr>`;
    } else {
      tbody.innerHTML = schoolBenchmarkDB.map((item, idx) => `
        <tr class="hover:bg-slate-50 transition">
          <td class="py-3 px-4 text-center font-bold text-slate-400">${idx + 1}</td>
          <td class="py-3 px-4 font-bold text-slate-800">${item.school || '고등학교'} (${item.exam || '기출'})</td>
          <td class="py-3 px-4 text-center">
            <span class="bg-cyan-50 text-cyan-800 border border-cyan-200 px-2.5 py-1 rounded-md font-bold text-[11px]">${item.type || '기출'}</span>
          </td>
          <td class="py-3 px-4">
            <div class="font-bold text-slate-900 text-xs mb-0.5">${item.title}</div>
            <div class="text-[11px] text-emerald-700"><strong>함정 패턴:</strong> ${item.trick}</div>
          </td>
        </tr>
      `).join('');
    }
  }
}

async function resetBenchmarkDB() {
  if(confirm('정말 기출 DB를 전체 초기화하시겠습니까?')) {
    await supabaseClient.from('school_benchmark').delete().neq('id', 0);
    await loadAllSupabaseData();
  }
}
