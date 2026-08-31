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

async function loadAllSupabaseData() {
  const { data: pData } = await supabaseClient.from('passages').select('*').order('created_at', { ascending: false });
  passageArchiveDB = pData || [];
  renderPassageArchiveTable();

  const { data: bData } = await supabaseClient.from('school_benchmark').select('*').order('created_at', { ascending: false });
  schoolBenchmarkDB = bData || [];
  
  updateBenchmarkCountUI(schoolBenchmarkDB.length);
  renderBenchmarkFolderView();

  const { data: qData } = await supabaseClient.from('questions').select('*').order('created_at', { ascending: false });
  generatedQuestionsPool = qData || [];

  const examMap = {};
  passageArchiveDB.forEach(p => {
    const pYear = p.year || '2024';
    const pMonth = p.month || '3';
    const pGrade = p.grade ? (String(p.grade).startsWith('고') ? p.grade : `고${p.grade}`) : '고1';
    const setKey = p.set_key || `${pYear}-${pMonth}-${pGrade.replace('고', '')}`;

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
    if (text) upsertData.push({ set_key: setKey, year, month, grade: `고${grade}`, passage_num: num, sample_text: text.substring(0, 30) + '...', full_text: text });
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

// 🎯 [개편] PDF에서 실제 학교 기출 '원문 발문' 및 '보기 양식' 전체를 보존 추출
async function startBatchPdfClassification() {
  const apiKey = getStoredApiKey();
  if (!apiKey) return toggleApiKeyModal();
  if (queuedPdfFiles.length === 0) return alert('분석할 PDF 파일이 없습니다.');

  const logBox = document.getElementById('pdfLogTerminal');
  const btn = document.getElementById('btnStartBatch');
  const statusBadge = document.getElementById('parsedItemCount');

  btn.disabled = true; 
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> 정밀 기출 분석 및 원문 추출 중...';

  logBox.innerHTML = `<div>🚀 [BENCHMARK PARSER] 총 ${queuedPdfFiles.length}개 시험지 정밀 원문 추출 가동...</div>`;

  for (let i = 0; i < queuedPdfFiles.length; i++) {
    const file = queuedPdfFiles[i];
    const percent = Math.round(((i) / queuedPdfFiles.length) * 100);

    if (statusBadge) {
      statusBadge.innerHTML = `<span class="text-amber-500 font-bold"><i class="fa-solid fa-sync fa-spin mr-1"></i>[${i+1}/${queuedPdfFiles.length}] 원문 파싱 중 (${percent}%)</span>`;
    }

    logBox.innerHTML += `
      <div class="my-1 text-slate-600">──────────────────────────────────────────</div>
      <div class="text-amber-400">⏳ [${i+1}/${queuedPdfFiles.length}] '${file.name}' 실제 발문 및 보기 원문 추출 중...</div>
    `;
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
  "raw_title": "시험지에 실제로 쓰인 발문 문장 전체 (예: '다음 글의 밑줄 친 ①~⑤ 중 어법상 틀린 것의 개수는?')",
  "raw_sample": "시험지의 보기 또는 조건 박스 양식 전체",
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
          trick: parsed.trick || '기출 정밀 분석 완료',
          raw_sample: parsed.raw_sample || ''
        };

        const { data: inserted, error } = await supabaseClient
          .from('school_benchmark')
          .insert([insertPayload])
          .select();
        
        if (!error && inserted && inserted.length > 0) {
          schoolBenchmarkDB.unshift(inserted[0]);
          updateBenchmarkCountUI(schoolBenchmarkDB.length);
          renderBenchmarkFolderView();
          logBox.innerHTML += `<div class="text-emerald-300 font-bold">✓ [${file.name}] 실제 기출 원문 적재 성공!</div>`;
        } else {
          logBox.innerHTML += `<div class="text-rose-400">❌ [${file.name}] 저장 실패: ${error?.message}</div>`;
        }
      }
    } catch (err) {
      logBox.innerHTML += `<div class="text-rose-400">❌ [${file.name}] 에러: ${err.message}</div>`;
    }
    logBox.scrollTop = logBox.scrollHeight;
  }

  if (statusBadge) statusBadge.innerHTML = `<span class="text-emerald-400 font-bold">✓ 정밀 원문 적재 완료</span>`;
  logBox.innerHTML += `<div class="text-cyan-300 font-bold mt-3">🎉 기출 원문 DB 적재 완료!</div>`;
  
  btn.disabled = false; 
  btn.innerHTML = '<i class="fa-solid fa-bolt"></i> 초고속 동시 병렬 분석 및 DB 적재 시작';
  clearQueuedFiles();
}

function renderBenchmarkFolderView() {
  const container = document.getElementById('benchmarkFolderContainer');
  if (!container) return;

  if (schoolBenchmarkDB.length === 0) {
    container.innerHTML = `<div class="p-8 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed">축적된 기출 DB가 없습니다. PDF 시험지를 드롭하여 등록하세요.</div>`;
    return;
  }

  const categories = [
    { key: '어법', label: '어법 / 어휘 유형', icon: 'fa-spell-check', bg: 'bg-sky-50 border-sky-200 text-sky-900', badgeBg: 'bg-sky-600' },
    { key: '빈칸', label: '빈칸 추론 유형', icon: 'fa-square-minus', bg: 'bg-cyan-50 border-cyan-200 text-cyan-900', badgeBg: 'bg-cyan-600' },
    { key: '순서', label: '순서 / 삽입 / 흐름 유형', icon: 'fa-arrow-down-short-wide', bg: 'bg-indigo-50 border-indigo-200 text-indigo-900', badgeBg: 'bg-indigo-600' },
    { key: '서술형', label: '주관식 / 서술형 유형', icon: 'fa-pen-to-square', bg: 'bg-amber-50 border-amber-200 text-amber-900', badgeBg: 'bg-amber-600' },
    { key: '기타', label: '대의 파악 / 기타 유형', icon: 'fa-file-lines', bg: 'bg-slate-50 border-slate-200 text-slate-900', badgeBg: 'bg-slate-700' }
  ];

  const groups = { 어법: [], 빈칸: [], 순서: [], 서술형: [], 기타: [] };
  
  schoolBenchmarkDB.forEach(item => {
    const t = item.type || '';
    if (t.includes('서술') || t.includes('주관')) groups['서술형'].push(item);
    else if (t.includes('어법') || t.includes('어휘')) groups['어법'].push(item);
    else if (t.includes('빈칸')) groups['빈칸'].push(item);
    else if (t.includes('순서') || t.includes('삽입') || t.includes('흐름')) groups['순서'].push(item);
    else groups['기타'].push(item);
  });

  container.innerHTML = categories.map((cat, folderIdx) => {
    const list = groups[cat.key] || [];
    return `
      <div class="border rounded-2xl overflow-hidden bg-white shadow-sm transition">
        <button onclick="toggleBenchmarkFolder(${folderIdx})" class="w-full p-4 flex items-center justify-between ${cat.bg} font-bold text-sm">
          <div class="flex items-center gap-3">
            <i class="fa-solid ${cat.icon} text-lg"></i>
            <span>${cat.label}</span>
            <span class="${cat.badgeBg} text-white text-[10px] px-2.5 py-0.5 rounded-full font-extrabold">${list.length}건</span>
          </div>
          <i id="folderIcon_${folderIdx}" class="fa-solid fa-chevron-down text-slate-400 transition-transform duration-200"></i>
        </button>
        
        <div id="folderContent_${folderIdx}" class="hidden divide-y divide-slate-100 border-t">
          ${list.length === 0 ? `<div class="p-4 text-center text-xs text-slate-400">등록된 기출이 없습니다.</div>` : list.map((item, idx) => `
            <div class="p-3.5 hover:bg-slate-50 transition flex items-start gap-4 text-xs">
              <span class="font-bold text-slate-400 w-6 shrink-0 text-center">${idx + 1}</span>
              <div class="w-44 shrink-0 font-bold text-slate-800">${item.school || '고교'} <span class="text-[11px] text-slate-500 font-normal">(${item.exam || '기출'})</span></div>
              <div class="flex-1">
                <div class="font-bold text-slate-900 mb-0.5">[원문 발문] ${item.title}</div>
                <div class="text-[11px] text-cyan-700"><strong>포인트:</strong> ${item.trick}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');
}

function toggleBenchmarkFolder(idx) {
  const content = document.getElementById(`folderContent_${idx}`);
  const icon = document.getElementById(`folderIcon_${idx}`);
  if (content) {
    content.classList.toggle('hidden');
    if (icon) icon.classList.toggle('rotate-180');
  }
}

async function resetBenchmarkDB() {
  if(confirm('정말 기출 DB를 전체 초기화하시겠습니까?')) {
    await supabaseClient.from('school_benchmark').delete().neq('id', 0);
    await loadAllSupabaseData();
  }
}
