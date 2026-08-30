// js/supabase-db.js 내 startBatchPdfClassification 함수 업데이트

async function startBatchPdfClassification() {
  const apiKey = getStoredApiKey();
  if (!apiKey) return toggleApiKeyModal();
  if (queuedPdfFiles.length === 0) return alert('분석할 PDF 파일이 없습니다.');

  const logBox = document.getElementById('pdfLogTerminal');
  const btn = document.getElementById('btnStartBatch');
  const statusBadge = document.getElementById('parsedItemCount');

  btn.disabled = true; 
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> 정밀 기출 분석 진행 중...';

  logBox.innerHTML = `<div>🚀 [BATCH START] 총 ${queuedPdfFiles.length}개 시험지 정밀 분석 가동...</div>`;

  for (let i = 0; i < queuedPdfFiles.length; i++) {
    const file = queuedPdfFiles[i];
    const percent = Math.round(((i) / queuedPdfFiles.length) * 100);
    const progressBar = '▓'.repeat(Math.floor(percent / 10)) + '░'.repeat(10 - Math.floor(percent / 10));

    // 우측 상단 뱃지 동적 업데이트
    if (statusBadge) {
      statusBadge.innerHTML = `<span class="text-amber-500 font-bold"><i class="fa-solid fa-sync fa-spin mr-1"></i>[${i+1}/${queuedPdfFiles.length}] 분석 중 (${percent}%)</span>`;
    }

    logBox.innerHTML += `
      <div class="my-1 text-slate-400">──────────────────────────────────────────</div>
      <div class="text-cyan-300 font-bold">[PROGRESS: ${progressBar} ${percent}%]</div>
      <div class="text-amber-400 animate-pulse">⏳ [${i+1}/${queuedPdfFiles.length}] '${file.name}' AI 킬러 패턴 분석 중... <i class="fa-solid fa-circle-notch fa-spin"></i></div>
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
당신은 대한민국 고등학교 영어 시험지 분석 전문가입니다.
[시험지 원문]:
${fullText.slice(0, 15000)}

시험지의 핵심 킬러 문항 1개를 분석하여 반드시 아래 규격의 JSON 객체로 작성하세요:
{
  "school": "학교명",
  "exam": "시험구분",
  "type": "유형",
  "title": "발문 요약",
  "trick": "핵심 킬러 함정 패턴 분석 1문장"
}
`;
      await sleep(1000); // API 초과 방지 지연

      const rawJson = await callGeminiUniversal(apiKey, parserPrompt);
      let cleanedJson = rawJson.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanedJson);
      
      if (parsed && parsed.school) {
        await supabaseClient.from('school_benchmark').insert([parsed]);
        logBox.innerHTML += `<div class="text-emerald-300 font-bold">✓ [${file.name}] DB 적재 성공!</div>`;
      } else {
        logBox.innerHTML += `<div class="text-rose-400">❌ [${file.name}] 데이터 형식이 올바르지 않습니다.</div>`;
      }
    } catch (err) {
      logBox.innerHTML += `<div class="text-rose-400">❌ [${file.name}] 분석 에러: ${err.message}</div>`;
    }
    logBox.scrollTop = logBox.scrollHeight;
  }

  // 완료 후 UI 원복
  if (statusBadge) statusBadge.innerHTML = `<span class="text-emerald-400 font-bold">✓ 전체 분석 완료</span>`;
  logBox.innerHTML += `<div class="text-cyan-300 font-bold mt-3">🎉 전체 PDF 분석 및 DB 적재 완벽 완료!</div>`;
  
  btn.disabled = false; 
  btn.innerHTML = '<i class="fa-solid fa-bolt"></i> 초고속 동시 병렬 분석 및 DB 적재 시작';
  clearQueuedFiles();
  
  await loadAllSupabaseData(); 
}
