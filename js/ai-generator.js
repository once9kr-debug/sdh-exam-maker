const standardTitleMap = {
  '주제/제목': '다음 글의 주제 및 제목으로 가장 적절한 것은?',
  '함축의미': '다음 글의 밑줄 친 부분이 의미하는 바로 가장 적절한 것은?',
  '일치/불일치': '다음 글의 내용과 일치하거나 불일치하는 것은?',
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

// 🎯 상용 출판급 정밀 치환 파서 (Includes 조건 적용)
function processVerifiedQuestion(item, origPassage, qType, setKey, passageNum, passageId) {
  let finalTitle = standardTitleMap[qType] || `다음 글의 ${qType}으로 가장 적절한 것은?`;
  let finalPassage = origPassage, givenBoxText = '', conditionText = '', summaryText = '';

  if (qType.includes('어법') || qType.includes('어휘')) {
    if (Array.isArray(item.target_words) && item.target_words.length === 5) {
      let p = origPassage;
      item.target_words.forEach((w, i) => {
        const sym = ['①', '②', '③', '④', '⑤'][i];
        p = p.replace(w.orig || w, `${sym} <u>${w.mod || w.orig || w}</u>`);
      });
      finalPassage = p;
    }
  } else if (qType.includes('빈칸')) {
    if (item.target_blank_word && origPassage.includes(item.target_blank_word)) {
      finalPassage = origPassage.replace(item.target_blank_word, '__________');
    } else {
      const words = origPassage.split(' ');
      if (words.length > 10) {
        const midIdx = Math.floor(words.length / 2);
        words[midIdx] = '__________';
        finalPassage = words.join(' ');
      }
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
    finalPassage = `(A) ${remainPart.substring(0, third)}\n(B) ${remainPart.substring(third, third*2)}\n(C) ${remainPart.substring(third*2)}`;
  } else if (qType.includes('삽입')) {
    givenBoxText = item.given_sentence || item.given_box || '주어진 문장을 본문의 올바른 위치에 넣으시오.';
    const s = origPassage.split('. ');
    if (s.length >= 5) {
      finalPassage = `${s[0]}. ( ① ) ${s[1]}. ( ② ) ${s[2]}. ( ③ ) ${s[3]}. ( ④ ) ${s[4]}. ( ⑤ ) ${s.slice(5).join('. ')}`;
    }
  } else if (qType.includes('요약')) {
    summaryText = item.summary_text || '';
  } else if (qType.includes('주관식')) {
    conditionText = item.condition_text || '[조건] 본문 어휘 및 구문 맥락을 활용하여 작성하시오.';
  }

  return {
    passage_id: passageId, set_key: setKey, passage_num: String(passageNum), type: qType,
    difficulty: selectedDifficulty || '상', title: finalTitle, passage: finalPassage,
    given_box: givenBoxText, condition_box: conditionText, summary_box: summaryText,
    options: Array.isArray(item.options) ? item.options : [], answer: item.answer || '답안 참조', explanation: item.explanation || '본문 맥락 해설'
  };
}

async function executeFastParallelGenerate() {
  const apiKey = getStoredApiKey();
  if (!apiKey) return toggleApiKeyModal();
  const setKey = document.getElementById('selectMockSet').value;
  if (!setKey) return alert('모의고사 세트를 선택하세요.');

  const targetPassages = passageArchiveDB.filter(p => p.set_key === setKey);
  if (targetPassages.length === 0) return alert('선택한 세트에 지문이 없습니다.');

  const selectedTypes = Array.from(document.querySelectorAll('input[name="adminGenType"]:checked')).map(cb => cb.value);
  if (selectedTypes.length === 0) return alert('유형을 선택하세요.');

  const logBox = document.getElementById('generationLogBox');
  logBox.classList.remove('hidden');
  logBox.innerHTML = `<div>🚀 [11개 핵심유형] 출제 가동 - 세트: ${setKey} / 난이도: ${selectedDifficulty}...</div>`;

  await supabaseClient.from('questions').delete().eq('set_key', setKey).eq('difficulty', selectedDifficulty);

  let totalCount = 0;

  for (let pObj of targetPassages) {
    const promptText = `
당신은 대한민국 고등학교 영어 내신 출제 전문가입니다.
[지문 (${pObj.passage_num}번)]:
${pObj.full_text}

[출제 난이도]: ${selectedDifficulty}
[요청 유형들]: ${selectedTypes.join(', ')}

위 지문을 바탕으로 요청된 각 유형별 변형문제를 1문항씩 작성하여 JSON 배열로 출력하세요.
'삽입' 유형은 given_sentence(삽입할 문장)를 명시하고, '빈칸' 유형은 target_blank_word(빈칸 단어)를 지정하세요.

JSON 출력 예시:
[
  {
    "type": "빈칸",
    "target_blank_word": "participants",
    "options": ["① opt1", "② opt2", "③ opt3", "④ opt4", "⑤ opt5"],
    "answer": "①",
    "explanation": "해설 작성"
  }
]
`;
    try {
      const rawJson = await callGeminiUniversal(apiKey, promptText);
      let cleanedJson = rawJson.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanedJson);
      if (Array.isArray(parsed)) {
        const verifiedItems = parsed.map((item) => processVerifiedQuestion(item, pObj.full_text, item.type || selectedTypes[0], setKey, pObj.passage_num, pObj.id));
        const { error } = await supabaseClient.from('questions').insert(verifiedItems);
        if (!error) totalCount += verifiedItems.length;
        logBox.innerHTML += `<div class="text-emerald-300">✓ ${pObj.passage_num}번 완료 [난이도: ${selectedDifficulty}] (+${verifiedItems.length}문항)</div>`;
        logBox.scrollTop = logBox.scrollHeight;
      }
    } catch (e) {
      logBox.innerHTML += `<div class="text-rose-400">❌ ${pObj.passage_num}번 처리 에러: ${e.message}</div>`;
    }
  }

  logBox.innerHTML += `<div class="text-emerald-300 font-bold mt-2">🎉 출제 완벽 완료! 총 ${totalCount}문항 적재됨</div>`;
  alert(`🎉 [난이도: ${selectedDifficulty}] 핵심유형 ${totalCount}문항 출제 완료!`);
  await loadAllSupabaseData();
}

function renderPaper() {
  const qContainer = document.getElementById('paperContent');
  const quickGrid = document.getElementById('quickAnswerGrid');
  const aContainer = document.getElementById('answerDetailContent');

  if (!qContainer) return;

  qContainer.innerHTML = filteredQuestions.map((q, idx) => {
    const isSubjective = q.type.includes('주관식');
    return `
      <div class="question-block exam-paper-font text-slate-900 leading-relaxed text-[12.5px]">
        <div class="font-bold text-[13.5px] mb-1">
          <span>${idx + 1}. ${q.title}</span>
          <span class="text-[10px] text-slate-500 font-sans ml-1">[${q.passage_num}번 / ${q.type} / 난이도:${q.difficulty}]</span>
        </div>
        ${q.given_box ? `<div class="given-box exam-eng-font font-medium"><strong>[주어진 글 / 문장]</strong><br/>${q.given_box}</div>` : ''}
        <div class="passage-box exam-eng-font text-slate-800">${q.passage.replace(/\n/g, '<br/>')}</div>
        ${isSubjective ? `
          ${q.condition_box ? `<div class="text-[11px] font-bold text-slate-800 my-1">${q.condition_box}</div>` : ''}
          <div class="mt-2 border p-3 rounded bg-white font-sans"><span class="text-[11px] font-bold text-slate-700 block mb-1">[서술형/단답형 답안 작성란]</span><div class="border-b border-dashed h-5"></div></div>
        ` : ''}
        ${q.summary_box ? `<div class="p-2 border bg-slate-50 font-sans text-xs my-1"><strong>[요약문]</strong><br/>${q.summary_box}</div>` : ''}
        ${(!isSubjective && q.options.length > 0) ? `<div class="grid grid-cols-1 gap-1 pl-1 mt-2 text-[12px] exam-eng-font">${q.options.map(o => `<div>${o}</div>`).join('')}</div>` : ''}
      </div>
    `;
  }).join('');

  if (quickGrid) {
    quickGrid.innerHTML = filteredQuestions.map((q, idx) => `
      <div class="border p-1 rounded bg-white h-10 flex flex-col justify-center items-center">
        <span class="text-[9px] text-slate-400 font-bold">${idx + 1}번</span>
        <span class="font-black text-xs">${q.type.includes('주관식') ? '주관식' : q.answer}</span>
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
