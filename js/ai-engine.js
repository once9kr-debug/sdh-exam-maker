// SDH STUDIO - AI Generation & Benchmark Engine
const AIEngine = {
  standardTitles: {
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
  },

  getApiKey() {
    return localStorage.getItem('SDH_GEMINI_API_KEY') || '';
  },

  setApiKey(key) {
    localStorage.setItem('SDH_GEMINI_API_KEY', key.trim());
  },

  async callGemini(promptText, maxRetries = 3) {
    const apiKey = this.getApiKey();
    if (!apiKey) throw new Error('API Key가 등록되지 않았습니다.');

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
        });

        if (!res.ok) throw new Error(`API 응답 오류 (${res.status})`);
        const data = await res.json();
        return data.candidates[0].content.parts[0].text;
      } catch (err) {
        if (attempt === maxRetries) throw err;
        await new Promise(r => setTimeout(r, 2000 * attempt));
      }
    }
  },

  safeJsonParse(rawStr) {
    try {
      return JSON.parse(rawStr.replace(/```json/g, '').replace(/```/g, '').trim());
    } catch (e) {
      const sanitized = rawStr.replace(/```json/gi, '').replace(/```/g, '').replace(/[\u0000-\u001F]+/g, ' ').trim();
      return JSON.parse(sanitized);
    }
  },

  // 11개 유형별 문항 전처리
  formatQuestion(item, origPassage, qType, setKey, passageNum, passageId, difficulty) {
    let title = item.title || this.standardTitles[qType] || `다음 글의 ${qType}으로 가장 적절한 것은?`;
    let passage = origPassage;
    let givenBox = '', conditionBox = '', summaryBox = '';
    let options = Array.isArray(item.options) ? item.options : [];

    if (qType.includes('어법') || qType.includes('어휘')) {
      if (Array.isArray(item.target_words) && item.target_words.length === 5) {
        let p = origPassage;
        item.target_words.forEach((w, i) => {
          const sym = ['①', '②', '③', '④', '⑤'][i];
          const origWord = w.orig || w;
          const modWord = w.mod || origWord;
          if (p.includes(origWord)) p = p.replace(origWord, `${sym} <u>${modWord}</u>`);
        });
        passage = p;
      }
      options = ['①', '②', '③', '④', '⑤'];
    } else if (qType.includes('빈칸')) {
      if (item.target_blank_word && origPassage.includes(item.target_blank_word)) {
        passage = origPassage.replace(item.target_blank_word, '__________');
      }
    } else if (qType.includes('함축의미')) {
      if (item.target_phrase && origPassage.includes(item.target_phrase)) {
        passage = origPassage.replace(item.target_phrase, `<u>${item.target_phrase}</u>`);
      }
    } else if (qType.includes('순서')) {
      const sentences = origPassage.split('. ');
      givenBox = sentences.slice(0, 2).join('. ') + '.';
      const remainPart = sentences.slice(2).join('. ');
      const third = Math.floor(remainPart.length / 3);
      passage = `(A) ${remainPart.substring(0, third)}\n<br/>(B) ${remainPart.substring(third, third * 2)}\n<br/>(C) ${remainPart.substring(third * 2)}`;
    } else if (qType.includes('삽입')) {
      let gSent = item.given_sentence || item.given_box || '';
      if (!gSent) {
        const sList = origPassage.split('. ');
        gSent = sList.length > 2 ? sList[2] + '.' : origPassage.substring(0, 50) + '...';
      }
      givenBox = gSent;
      const s = origPassage.split('. ');
      if (s.length >= 5) {
        passage = `${s[0]}. ( ① ) ${s[1]}. ( ② ) ${s[2]}. ( ③ ) ${s[3]}. ( ④ ) ${s[4]}. ( ⑤ ) ${s.slice(5).join('. ')}`;
      }
    } else if (qType.includes('요약')) {
      summaryBox = item.summary_text || '';
    } else if (qType.includes('주관식')) {
      conditionBox = item.condition_text || '[조건] 본문 어휘 및 구문 맥락을 활용하여 작성하시오.';
    }

    let ansText = item.answer || '조건에 맞는 정답';
    if (typeof ansText === 'object' && ansText !== null) {
      ansText = Object.entries(ansText).map(([k, v]) => `(${k}) ${v}`).join(' / ');
    }

    return {
      passage_id: passageId,
      set_key: setKey,
      passage_num: String(passageNum),
      type: qType,
      difficulty: difficulty || '상',
      title: title,
      passage: passage,
      given_box: givenBox,
      condition_box: conditionBox,
      summary_box: summaryBox,
      options: options,
      answer: String(ansText),
      explanation: item.explanation || '본문 맥락 기반 정밀 해설입니다.'
    };
  },

  // 일괄 출제 실행
  async generateQuestions(setKey, selectedTypes, difficulty, onProgress) {
    const passages = AppState.passages.filter(p => p.set_key === setKey);
    if (passages.length === 0) throw new Error('해당 세트의 지문 데이터를 찾을 수 없습니다.');

    const benchmarkSamples = AppState.benchmarks.slice(0, 15).map(b => 
      ` - [${b.school} ${b.type}] 실제 시험지 발문: "${b.raw_title || b.title}"`
    ).join('\n');

    const allGenerated = [];

    for (let i = 0; i < passages.length; i++) {
      const p = passages[i];
      if (onProgress) onProgress(i + 1, passages.length, `${p.passage_num}번 지문 출제 중...`);

      const promptText = `
당신은 대한민국 고등학교 영어 내신 출제 전문가입니다.

[출제 대상 지문 ${p.passage_num}번]:
${p.full_text}

[실제 학교 기출 시험지의 원문 발문 예시 자료 (이 어조를 100% 복제할 것)]:
${benchmarkSamples || "대한민국 고교 정식 내신 표준 발문 지침 적용"}

[출제 요청 난이도]: ${difficulty}
[출제 요청 유형들 (${selectedTypes.length}개)]: ${selectedTypes.join(', ')}

위 지문을 바탕으로 요청된 유형들을 각각 1문항씩 생성하여 JSON 배열 규격으로 반환하세요.
`;

      try {
        const rawJson = await this.callGemini(promptText);
        const parsed = this.safeJsonParse(rawJson);

        if (Array.isArray(parsed)) {
          parsed.forEach(item => {
            const matchedType = selectedTypes.find(st => item.type && item.type.includes(st)) || selectedTypes[0];
            const formatted = this.formatQuestion(item, p.full_text, matchedType, setKey, p.passage_num, p.id, difficulty);
            allGenerated.push(formatted);
          });
        }
      } catch (err) {
        console.error(`Passage ${p.passage_num} Gen Error:`, err);
      }
    }

    if (allGenerated.length > 0) {
      await AppState.saveGeneratedQuestions(allGenerated);
    }
    return allGenerated;
  }
};
