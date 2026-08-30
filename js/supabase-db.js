const SUPABASE_URL = 'https://kqmogqlukkviddjsfyeb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtxbW9ncWx1a2t2aWRkanNmeWViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5Mjc3NjYsImV4cCI6MjEwMzUwMzc2Nn0.nqWvvphNCdPGMDrEYLilk-wHmNkH2BhPTuvMwaCXqo8';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let passageArchiveDB = [], generatedQuestionsPool = [], mockExams = [], schoolBenchmarkDB = [], queuedPdfFiles = [];

// 🎯 DB 전체 동기화 로직
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

// 🎯 학교 기출 PDF 파싱 및 DB 즉시 반영
async function startBatchPdfClassification() {
  const apiKey = getStoredApiKey();
  if (!apiKey) return toggleApiKeyModal();
  if (queuedPdfFiles.length === 0) return alert('분석할 PDF 파일이 없습니다.');

  const logBox = document.getElementById('pdfLogTerminal'), btn = document.getElementById('btnStartBatch');
  btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-bolt fa-spin"></i> 정밀 기출 분석 진행 중...';

  logBox.innerHTML = `<div>[BATCH START] 총 ${queuedPdfFiles.length}개 시험지 정밀 분석 가동...</div>`;

  for (let file of queuedPdfFiles) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = '';
      for (let p = 1; p <= pdf.numPages; p++) fullText += (await (await pdf.getPage(p)).getTextContent()).items.map(item => item.str).join(' ') + '\n';

      const parserPrompt = `
당신은 대한민국 고등학교 영어 시험지 분석 전문가입니다.
[시험지 원문]:
${fullText.slice(0, 15000)}

시험지의 핵심 킬러 문항 1개를 뽑아 JSON 객체로 작성하세요:
{
  "school": "충남고",
  "exam": "1학기 기말",
  "type": "어법",
  "title": "다음 밑줄 중 어법상 틀린 것은?",
  "trick": "준동사 vs 본동사 위치 착시 수일치 함정"
}
`;
      const rawJson = await callGeminiUniversal(apiKey, parserPrompt);
      let cleanedJson = rawJson.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanedJson);
      
      if (parsed && parsed.school) {
        await supabaseClient.from('school_benchmark').insert([parsed]);
        logBox.innerHTML += `<div class="text-emerald-300">✓ [${file.name}] DB 분석 및 적재 완료!</div>`;
      }
    } catch (err) {
      logBox.innerHTML += `<div class="text-rose-400">❌ [${file.name}] 분석 에러: ${err.message}</div>`;
    }
  }

  btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-bolt"></i> 초고속 동시 병렬 분석 및 DB 적재 시작';
  clearQueuedFiles();
  await loadAllSupabaseData(); // DB 기출 수량 즉시 새로고침
}

function renderBenchmarkTable() {
  const tbody = document.getElementById('benchmarkTableBody'), totalCount = document.getElementById('tableTotalCount');
  const badge = document.getElementById('benchmarkCountBadge');
  if (totalCount) totalCount.innerText = schoolBenchmarkDB.length;
  if (badge) badge.innerText = `기출 ${schoolBenchmarkDB.length}제`;
  if (tbody) tbody.innerHTML = schoolBenchmarkDB.map((item, idx) => `
    <tr class="hover:bg-slate-50">
      <td class="py-2.5 px-4 text-center font-bold text-slate-400">${idx + 1}</td>
      <td class="py-2.5 px-4 font-bold text-slate-800">${item.school || '고교'} (${item.exam || '기말'})</td>
      <td class="py-2.5 px-4 text-center"><span class="bg-cyan-50 text-cyan-800 border border-cyan-200 px-2 py-0.5 rounded font-bold">${item.type}</span></td>
      <td class="py-2.5 px-4"><div class="font-bold text-slate-800">${item.title}</div><div class="text-[11px] text-emerald-700"><strong>함정 패턴:</strong> ${item.trick}</div></td>
    </tr>
  `).join('');
}

async function resetBenchmarkDB() {
  if(confirm('정말 기출 DB를 전체 초기화하시겠습니까?')) {
    await supabaseClient.from('school_benchmark').delete().neq('id', 0);
    await loadAllSupabaseData();
  }
}
