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

const typeCategories = [
  { category: '대의/내용', types: ['주제/제목', '함축의미', '일치/불일치', '요약'], bg: 'bg-amber-500' },
  { category: '어법/어휘', types: ['어법', '어휘'], bg: 'bg-sky-600' },
  { category: '언어논리', types: ['빈칸', '흐름', '순서', '삽입'], bg: 'bg-cyan-600' },
  { category: '주관식', types: ['주관식(서술/단답형)'], bg: 'bg-slate-800' }
];

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function callGeminiWithRetry(apiKey, promptText, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await callGeminiUniversal(apiKey, promptText);
    } catch (err) {
      if (attempt === maxRetries) throw err;
      await delay(2000 * attempt);
    }
  }
}

// 🎯 JSON 안전 파서 (특수문자 파싱 에러 방지)
function safeJsonParse(rawStr) {
  try {
    let clean = rawStr.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(clean);
  } catch (e) {
    try {
      let sanitized = rawStr
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .replace(/[\u0000-\u001F]+/g, ' ')
        .trim();
      return JSON.parse(sanitized);
    } catch (err) {
      console.error("JSON Parse Fail:", rawStr);
      throw new Error("AI 응답 데이터 파싱 실패 (JSON 형식 오류)");
    }
  }
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
        if (p.includes(origWord)) {
          p = p.replace(origWord, `${sym} <u>${modWord}</u>`);
        }
      });
      finalPassage = p;
    }
    finalOptions = ['①', '②', '③', '④', '⑤'];
  } else if (qType.includes('빈칸')) {
    if (item.target_blank_word && origPassage.includes(item.target_blank_word)) {
      finalPassage = origPassage.replace(item.target_blank_word, '__________');
    }
  } else if (qType.includes('함축의미')) {
    if (item.target_phrase && origPassage.includes(item.target_phrase)) {
      finalPassage = origPassage.replace(item.target_phrase, `<u>${item.target_phrase}</u>`);
    }
  } else if (qType.includes('순서')) {
    const sentences = origPassage.split('. ');
    givenBoxText = sentences.slice(0, 2).join('. ') + '.';
    const remainPart = sentences.slice(2).join('. ');
    const third = Math.floor(remainPart.length / 3);
    finalPassage = `(A) ${remainPart.substring(0, third)}\n<br/>(B) ${remainPart.substring(third, third*2)}\n<br/>(C) ${remainPart.substring(third*2)}`;
  } else if (qType.includes('삽입')) {
    let gSent = item.given_sentence || item.given_box || '';
    if (!gSent || gSent.includes('주어진 문장을 읽고')) {
      const sList = origPassage.split('. ');
      gSent = sList.length > 2 ? sList[2] + '.' : origPassage.substring(0, 50) + '...';
    }
    givenBoxText = gSent;

    const s = origPassage.split('. ');
    if (s.length >= 5) {
      finalPassage = `${s[0]}. ( ① ) ${s[1]}. ( ② ) ${s[2]}. ( ③ ) ${s[3]}. ( ④ ) ${s[4]}. ( ⑤ ) ${s.slice(5).join('. ')}`;
    }
  } else if (qType.includes('요약')) {
    summaryText = item.summary_text || '';
    if (finalOptions.length > 0) {
      finalOptions = finalOptions.map((o, idx) => {
        if (typeof o === 'object' && o !== null) {
          return `(A) ${o.A || o.a || ''}  ---  (B) ${o.B || o.b || ''}`;
        } else if (typeof o === 'string' && o.trim().startsWith('{')) {
          try {
            const p = JSON.parse(o);
            return `(A) ${p.A || ''}  ---  (B) ${p.B || ''}`;
          } catch(e) { return o; }
        }
        return o;
      });
    }
  } else if (qType.includes('주관식')) {
    conditionText = item.condition_text || '[조건] 본문 어휘 및 구문 맥락을 활용하여 작성하시오.';
  }

  let ansText = item.answer || '본문 맥락에 맞는 조건별 정답';
  if (typeof ansText === 'object' && ansText !== null) {
    ansText = Object.entries(ansText).map(([k, v]) => `(${k}) ${v}`).join(' / ');
  } else if (typeof ansText === 'string' && ansText.trim().startsWith('{')) {
    try {
      const pAns = JSON.parse(ansText);
      ansText = Object.entries(pAns).map(([k, v]) => `(${k}) ${v}`).join(' / ');
    } catch(e) {}
  }

  return {
    passage_id: passageId, set_key: setKey, passage_num: String(passageNum), type: qType,
    difficulty: selectedDifficulty || '상', title: finalTitle, passage: finalPassage,
    given_box: givenBoxText, condition_box: conditionText, summary_box: summaryText,
    options: finalOptions, answer: String(ansText), explanation: item.explanation || '본문 맥락 기반 정밀 해설입니다.'
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

  if (targetPassages.length === 0) {
    const numbers = setKey.match(/\d+/g);
    if (numbers && numbers.length >= 2) {
      const year = numbers[0];
      const month = numbers[1];
      targetPassages = passageArchiveDB.filter(p => 
        String(p.year) === year && String(p.month) === month
      );
    }
  }

  if (targetPassages.length === 0) {
    logBox.innerHTML = `<div class="text-rose-400 font-bold">❌ 지문 검색 실패</div>`;
    return alert(`선택 세트[${setKey}]의 지문을 DB에서 찾을 수 없습니다.`);
  }

  const selectedTypes = Array.from(document.querySelectorAll('input[name="adminGenType"]:checked')).map(cb => cb.value);
  if (selectedTypes.length === 0) return alert('유형을 선택하세요.');

  logBox.innerHTML = `<div>🚀 [기출 원문 Few-Shot 주입 엔진 가동] 총 ${targetPassages.length}개 지문 출제 시작...</div>`;

  const benchmarkSamples = schoolBenchmarkDB.slice(0, 15).map(b => 
    ` - [${b.school || '고교'} ${b.type || '유형'}] 실제 시험지 발문: "${b.title || ''}"`
  ).join('\n');

  await supabaseClient.from('questions').delete().eq('set_key', setKey).eq('difficulty', selectedDifficulty);

  let totalCount = 0;

  for (let pObj of targetPassages) {
    const promptText = `
당신은 대한민국 고등학교 영어 내신 출제 전문가입니다.

[출제 대상 지문 ${pObj.passage_num}번]:
${pObj.full_text}

[실제 학교 기출 시험지의 원문 발문 예시 자료 (이 발문 어조를 100% 복제할 것)]:
${benchmarkSamples || "대한민국 고교 정식 내신 표준 발문 지침 적용"}

[출제 요청 난이도]: ${selectedDifficulty}
[출제 요청 유형들 (${selectedTypes.length}개)]: ${selectedTypes.join(', ')}

위 지문을 바탕으로 요청된 유형 ${selectedTypes.length}개를 각각 1문항씩 생성하세요.

⚠️ 엄격 출제 지침:
1. 각 문항의 'title' 필드에는 위 기출 원문 발문 예시처럼 고등학교 정식 내신 시험지 발문 어조를 100% 동일하게 작성하세요.
2. '일치/불일치' 유형은 반드시 "다음 글의 내용과 일치하지 않는 것은?" 또는 "다음 글의 내용과 일치하는 것은?" 중 하나로 명확히 단일 지정하세요.
3. '주관식' 유형은 answer 필드에 모범 답안 문장을 적으세요.
`;
    try {
      const rawJson = await callGeminiWithRetry(apiKey, promptText);
      const parsed = safeJsonParse(rawJson);

      if (Array.isArray(parsed)) {
        const seenTypes = new Set();
        const exactItems = [];

        for (let item of parsed) {
          const rawType = item.type || '';
          
          const matchedType = selectedTypes.find(st => 
            st === rawType || 
            (st.includes('주관식') && (rawType.includes('주관식') || rawType.includes('서술') || rawType.includes('단답'))) ||
            (st.includes('일치') && rawType.includes('일치')) ||
            (st.includes('주제') && (rawType.includes('주제') || rawType.includes('제목')))
          );

          if (matchedType && !seenTypes.has(matchedType)) {
            seenTypes.add(matchedType);
            item.type = matchedType; 
            exactItems.push(item);
          }
        }

        const verifiedItems = exactItems.map((item) => processVerifiedQuestion(item, pObj.full_text, item.type, setKey, pObj.passage_num, pObj.id));
        const { error } = await supabaseClient.from('questions').insert(verifiedItems);
        if (!error) totalCount += verifiedItems.length;
        logBox.innerHTML += `<div class="text-emerald-300">✓ ${pObj.passage_num}번 완료 (+${verifiedItems.length}문항)</div>`;
        logBox.scrollTop = logBox.scrollHeight;
      }
    } catch (e) {
      logBox.innerHTML += `<div class="text-rose-400">❌ ${pObj.passage_num}번 에러: ${e.message}</div>`;
    }
  }

  logBox.innerHTML += `<div class="text-emerald-300 font-bold mt-2">🎉 완벽 출제 완료! 총 ${totalCount}문항 적재됨</div>`;
  alert(`🎉 [난이도: ${selectedDifficulty}] 기출 원문 1:1 반영 ${totalCount}문항 출제 완료!`);
  await loadAllSupabaseData();
}

function renderPaper() {
  const qContainer = document.getElementById('paperContent');
  const quickGrid = document.getElementById('quickAnswerGrid');
  const aContainer = document.getElementById('answerDetailContent');

  if (!qContainer) return;

  const circles = ['①', '②', '③', '④', '⑤'];

  qContainer.innerHTML = filteredQuestions.map((q, idx) => {
    const isSubjective = q.type.includes('주관식');

    return `
      <div class="question-block exam-paper-font text-slate-900 leading-relaxed text-[12.5px] break-inside-avoid mb-6">
        <div class="font-bold text-[13.5px] mb-1">
          <span>${idx + 1}. ${q.title}</span>
          <span class="text-[10px] text-slate-500 font-sans ml-1">[${q.passage_num}번 / ${q.type} / 난이도:${q.difficulty}]</span>
        </div>
        ${q.given_box ? `<div class="given-box exam-eng-font font-medium my-1"><strong>[주어진 글 / 문장]</strong><br/>${q.given_box}</div>` : ''}
        <div class="passage-box exam-eng-font text-slate-800">${q.passage.replace(/\n/g, '<br/>')}</div>
        ${isSubjective ? `
          ${q.condition_box ? `<div class="text-[11px] font-bold text-slate-800 my-1">${q.condition_box}</div>` : ''}
          <div class="mt-2 border p-3 rounded bg-white font-sans"><span class="text-[11px] font-bold text-slate-700 block mb-1">[서술형/단답형 답안 작성란]</span><div class="border-b border-dashed h-5"></div></div>
        ` : ''}
        ${q.summary_box ? `<div class="p-2 border bg-slate-50 font-sans text-xs my-1"><strong>[요약문]</strong><br/>${q.summary_box}</div>` : ''}
        ${(!isSubjective && q.options.length > 0) ? `
          <div class="grid grid-cols-1 gap-1 pl-1 mt-2 text-[12px] exam-eng-font">
            ${q.options.map((o, oIdx) => {
              const strVal = String(o).trim();
              const formattedText = /^[①-⑤]/.test(strVal) ? strVal : `${circles[oIdx] || ''} ${strVal}`;
              return `<div>${formattedText}</div>`;
            }).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  if (quickGrid) {
    quickGrid.innerHTML = filteredQuestions.map((q, idx) => {
      let displayAns = q.type.includes('주관식') ? '서술형' : q.answer;
      if (displayAns.includes('{')) displayAns = '정답 참조';
      if (displayAns.length > 6) displayAns = displayAns.substring(0, 6) + '..';

      return `
        <div class="border p-1 rounded bg-white min-h-[44px] flex flex-col justify-center items-center shadow-sm">
          <span class="text-[9px] text-slate-400 font-bold mb-0.5">${idx + 1}번</span>
          <span class="font-black text-[10px] text-slate-800 truncate w-full text-center px-0.5">${displayAns}</span>
        </div>
      `;
    }).join('');
  }

  if (aContainer) {
    aContainer.innerHTML = filteredQuestions.map((q, idx) => `
      <div class="question-block border-b pb-2 mb-2 break-inside-avoid">
        <div class="font-bold text-slate-900 mb-1">[${idx + 1}번 정답 : <strong class="text-blue-700">${q.answer}</strong>]</div>
        <div class="text-[11px] text-slate-700 font-sans bg-slate-50 p-2 rounded">${q.explanation}</div>
      </div>
    `).join('');
  }
}
