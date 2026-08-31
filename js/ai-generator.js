const standardTitleMap = {
  '주제/제목': '다음 글의 주제 및 제목으로 가장 적절한 것은?',
  '함축의미': '다음 글의 밑줄 친 부분이 의미하는 바로 가장 적절한 것은?',
  '일치': '다음 글의 내용과 일치하는 것은?',
  '불일치': '다음 글의 내용과 일치하지 않는 것은?',
  '어법': '다음 글의 밑줄 친 부분 중, 어법상 틀린 것은?',
  '어휘': '다음 글의 밑줄 친 부분 중, 문맥상 낱말의 쓰임이 적절하지 않은 것은?',
  '빈칸': '다음 빈칸에 들어갈 말로 가장 적절한 것은?',
  '흐름': '다음 글에서 전체 흐름과 관계 없는 문장은?',
  '순서': '주어진 글 다음에 이어질 글의 순서로 가장 적절한 것은?',
  '삽입': '글의 흐름으로 보아, 주어진 문장이 들어가기에 가장 적절한 곳은?',
  '요약': '다음 글의 내용을 한 문장으로 요약하고자 한다. 빈칸 (A), (B)에 들어갈 말로 적절한 것은?',
  '주관식(서술/단답형)': '[주관식 서술/단답형] 다음 글을 읽고 [조건]에 맞추어 답안을 작성하시오.'
};

let selectedDifficulty = '상';
let filteredQuestions = [];

function setDifficulty(diff) {
  selectedDifficulty = diff;
  ['상', '중', '하'].forEach(d => {
    const btn = document.getElementById(`btnDiff_${d}`);
    if (btn) {
      if (d === diff) btn.className = 'py-2.5 bg-slate-900 text-white font-bold rounded-xl text-xs transition';
      else btn.className = 'py-2.5 bg-slate-100 text-slate-600 font-bold rounded-xl text-xs hover:bg-slate-200 transition';
    }
  });
}

function getStoredApiKey() { return localStorage.getItem('SDH_GEMINI_API_KEY') || ''; }
function toggleApiKeyModal() {
  const k = prompt('Gemini API Key를 입력하세요:', getStoredApiKey());
  if (k !== null) { localStorage.setItem('SDH_GEMINI_API_KEY', k.trim()); alert('API Key가 저장되었습니다.'); }
}

async function callGeminiUniversal(apiKey, prompt) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  });
  if (!res.ok) throw new Error(`API 오류 (${res.status})`);
  const data = await res.json();
  return data.candidates[0].content.parts[0].text;
}

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

function safeJsonParse(rawStr) {
  try {
    return JSON.parse(rawStr.replace(/```json/g, '').replace(/```/g, '').trim());
  } catch (e) {
    return JSON.parse(rawStr.replace(/```json/gi, '').replace(/```/g, '').replace(/[\u0000-\u001F]+/g, ' ').trim());
  }
}

function updateProgressBar(current, total) {
  const logBox = document.getElementById('generationLogBox');
  if (!logBox) return;
  const percent = Math.round((current / total) * 100);
  const progressBarHtml = `
    <div class="my-2 p-2 bg-slate-900 rounded-lg border border-slate-800">
      <div class="flex justify-between text-[11px] text-cyan-400 font-bold mb-1">
        <span>출제 진행률 (${current}/${total} 지문)</span><span>${percent}%</span>
      </div>
      <div class="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
        <div class="bg-cyan-500 h-2 rounded-full transition-all duration-300" style="width: ${percent}%"></div>
      </div>
    </div>
  `;
  const existingBar = document.getElementById('genProgressBar');
  if (existingBar) existingBar.outerHTML = `<div id="genProgressBar">${progressBarHtml}</div>`;
  else logBox.insertAdjacentHTML('afterbegin', `<div id="genProgressBar">${progressBarHtml}</div>`);
}

function processVerifiedQuestion(item, origPassage, qType, setKey, passageNum, passageId) {
  let finalTitle = item.title || standardTitleMap[qType] || `다음 글의 ${qType}으로 가장 적절한 것은?`;
  let finalPassage = origPassage, givenBoxText = '', conditionText = '', summaryText = '';
  let finalOptions = Array.isArray(item.options) ? item.options : [];

  if (qType.includes('어법') || qType.includes('어휘')) {
    if (Array.isArray(item.target_words) && item.target_words.length === 5) {
      let p = origPassage;
      item.target_words.forEach((w, i) => {
        const sym = ['①', '②', '③', '④', '⑤'][i];
        const origWord = w.orig || w;
        const modWord = w.mod || origWord;
        if (p.includes(origWord)) p = p.replace(origWord, `${sym} <u>${modWord}</u>`);
      });
      finalPassage = p;
    }
    finalOptions = ['①', '②', '③', '④', '⑤'];
  } else if (qType.includes('빈칸')) {
    if (item.target_blank_word && origPassage.includes(item.target_blank_word)) {
      finalPassage = origPassage.replace(item.target_blank_word, '__________');
    }
  } else if (qType.includes('순서')) {
    const sentences = origPassage.split('. ');
    givenBoxText = sentences.slice(0, 2).join('. ') + '.';
    const remainPart = sentences.slice(2).join('. ');
    const third = Math.floor(remainPart.length / 3);
    finalPassage = `(A) ${remainPart.substring(0, third)}\n<br/>(B) ${remainPart.substring(third, third*2)}\n<br/>(C) ${remainPart.substring(third*2)}`;
  } else if (qType.includes('주관식')) {
    conditionText = item.condition_text || '[조건] 본문 어휘 및 구문 맥락을 활용하여 작성하시오.';
  }

  return {
    passage_id: passageId, set_key: setKey, passage_num: String(passageNum), type: qType,
    difficulty: selectedDifficulty || '상', title: finalTitle, passage: finalPassage,
    given_box: givenBoxText, condition_box: conditionText, summary_box: summaryText,
    options: finalOptions, answer: String(item.answer || '모범 답안'), explanation: item.explanation || '해설'
  };
}

async function executeFastParallelGenerate() {
  const apiKey = getStoredApiKey();
  if (!apiKey) return toggleApiKeyModal();
  const setKey = document.getElementById('selectMockSet').value;
  if (!setKey) return alert('모의고사 세트를 선택하세요.');

  const logBox = document.getElementById('generationLogBox');
  logBox.classList.remove('hidden');

  let targetPassages = passageArchiveDB.filter(p => p.set_key === setKey);
  if (targetPassages.length === 0) return alert(`선택 세트[${setKey}] 지문이 없습니다.`);

  const selectedTypes = Array.from(document.querySelectorAll('input[name="adminGenType"]:checked')).map(cb => cb.value);
  if (selectedTypes.length === 0) return alert('유형을 선택하세요.');

  logBox.innerHTML = `<div>🚀 [Few-Shot 주입 엔진] 총 ${targetPassages.length}개 지문 출제 시작...</div>`;

  await supabaseClient.from('questions').delete().eq('set_key', setKey).eq('difficulty', selectedDifficulty);
  filteredQuestions = [];
  let totalCount = 0;

  for (let i = 0; i < targetPassages.length; i++) {
    const pObj = targetPassages[i];
    updateProgressBar(i + 1, targetPassages.length);

    const promptText = `
고교 영어 내신 출제 전문가로서 [지문 ${pObj.passage_num}번]:
${pObj.full_text}
요청 유형(${selectedTypes.join(', ')})을 1문항씩 생성하여 JSON 배열로 반환하세요.
`;
    try {
      const rawJson = await callGeminiWithRetry(apiKey, promptText);
      const parsed = safeJsonParse(rawJson);

      if (Array.isArray(parsed)) {
        const verifiedItems = parsed.map(item => processVerifiedQuestion(item, pObj.full_text, item.type || '어법', setKey, pObj.passage_num, pObj.id));
        const { error } = await supabaseClient.from('questions').insert(verifiedItems);
        if (!error) {
          totalCount += verifiedItems.length;
          filteredQuestions.push(...verifiedItems);
        }
        logBox.innerHTML += `<div class="text-emerald-300">✓ ${pObj.passage_num}번 완료 (+${verifiedItems.length}문항)</div>`;
      }
    } catch (e) {
      logBox.innerHTML += `<div class="text-rose-400">❌ ${pObj.passage_num}번 에러: ${e.message}</div>`;
    }
  }

  renderPaper();
  switchView('paperView');
}

function renderPaper() {
  const qContainer = document.getElementById('paperContent');
  const quickGrid = document.getElementById('quickAnswerGrid');
  const aContainer = document.getElementById('answerDetailContent');
  if (!qContainer) return;

  const circles = ['①', '②', '③', '④', '⑤'];

  qContainer.innerHTML = filteredQuestions.map((q, idx) => `
    <div class="question-block exam-paper-font text-slate-900 leading-relaxed text-[12.5px] mb-6">
      <div class="font-bold text-[13.5px] mb-1">${idx + 1}. ${q.title} <span class="text-[10px] text-slate-500 font-sans">[${q.passage_num}번]</span></div>
      ${q.given_box ? `<div class="given-box exam-eng-font my-1"><strong>[주어진 글]</strong><br/>${q.given_box}</div>` : ''}
      <div class="passage-box exam-eng-font text-slate-800">${q.passage.replace(/\n/g, '<br/>')}</div>
      ${q.options.length > 0 ? `<div class="grid grid-cols-1 gap-1 pl-1 mt-2">${q.options.map((o, oIdx) => `<div>${/^[①-⑤]/.test(String(o)) ? o : `${circles[oIdx]} ${o}`}</div>`).join('')}</div>` : ''}
    </div>
  `).join('');

  if (quickGrid) {
    quickGrid.innerHTML = filteredQuestions.map((q, idx) => `
      <div class="border p-1 rounded bg-white min-h-[44px] flex flex-col justify-center items-center shadow-sm">
        <span class="text-[9px] text-slate-400 font-bold">${idx + 1}번</span>
        <span class="font-black text-[10px] text-slate-800 truncate w-full text-center">${q.answer}</span>
      </div>
    `).join('');
  }

  if (aContainer) {
    aContainer.innerHTML = filteredQuestions.map((q, idx) => `
      <div class="question-block border-b pb-2 mb-2">
        <div class="font-bold text-slate-900 mb-1">[${idx + 1}번 정답 : <strong class="text-blue-700">${q.answer}</strong>]</div>
        <div class="text-[11px] text-slate-700 font-sans bg-slate-50 p-2 rounded">${q.explanation}</div>
      </div>
    `).join('');
  }
}

function updatePaperHeader() {
  const val = document.getElementById('paperCustomTitle')?.value;
  const target = document.getElementById('paperTitleDisplay');
  if (target && val) target.innerText = val;
}

function changePaperFontSize() {
  const sizeClass = document.getElementById('paperFontSize')?.value || 'text-[12.5px]';
  const container = document.getElementById('paperContent');
  if (container) container.className = `exam-columns-2 text-slate-900 ${sizeClass}`;
}

function togglePaperWatermark() {
  const isChecked = document.getElementById('chkShowWatermark')?.checked;
  const headerBox = document.getElementById('paperHeaderBox');
  if (headerBox) headerBox.style.opacity = isChecked ? '1' : '0.4';
}

function toggleAnswerPage() {
  const isChecked = document.getElementById('chkShowAnswerPage')?.checked;
  const answerSec = document.getElementById('paperAnswerSection');
  if (answerSec) answerSec.classList.toggle('hidden', !isChecked);
}
