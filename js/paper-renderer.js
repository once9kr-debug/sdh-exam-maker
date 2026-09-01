// SDH STUDIO - Exam Paper & Answer Sheet Renderer
const PaperRenderer = {
  circles: ['①', '②', '③', '④', '⑤'],

  render(questions, containerId = 'paperContent') {
    const container = document.getElementById(containerId);
    const quickGrid = document.getElementById('quickAnswerGrid');
    const answerContainer = document.getElementById('answerDetailContent');

    if (!container) return;

    // 1. 문제 본문 2단 렌더링
    container.innerHTML = questions.map((q, idx) => {
      const isSubjective = q.type && q.type.includes('주관식');
      return `
        <div class="question-block exam-paper-font text-slate-900 leading-relaxed text-[12.5px] mb-6">
          <div class="font-bold text-[13.5px] mb-1">
            <span>${idx + 1}. ${q.title}</span>
            <span class="text-[10px] text-slate-500 font-sans ml-1">[${q.passage_num}번 / ${q.type} / 난이도:${q.difficulty}]</span>
          </div>
          ${q.given_box ? `<div class="p-2.5 bg-slate-50 border border-slate-300 rounded font-sans text-xs my-1.5"><strong>[주어진 글 / 문장]</strong><br/>${q.given_box}</div>` : ''}
          <div class="exam-eng-font text-slate-800 leading-normal my-1">${q.passage.replace(/\n/g, '<br/>')}</div>
          ${isSubjective ? `
            ${q.condition_box ? `<div class="text-[11px] font-bold text-slate-800 my-1">${q.condition_box}</div>` : ''}
            <div class="mt-2 border p-3 rounded bg-white font-sans"><span class="text-[11px] font-bold text-slate-700 block mb-1">[서술형/단답형 답안 작성란]</span><div class="border-b border-dashed h-5"></div></div>
          ` : ''}
          ${q.summary_box ? `<div class="p-2 border bg-slate-50 font-sans text-xs my-1"><strong>[요약문]</strong><br/>${q.summary_box}</div>` : ''}
          ${(!isSubjective && Array.isArray(q.options) && q.options.length > 0) ? `
            <div class="grid grid-cols-1 gap-1 pl-1 mt-2 text-[12px] exam-eng-font">
              ${q.options.map((o, oIdx) => {
                const str = String(o).trim();
                const formatted = /^[①-⑤]/.test(str) ? str : `${this.circles[oIdx] || ''} ${str}`;
                return `<div>${formatted}</div>`;
              }).join('')}
            </div>
          ` : ''}
        </div>
      `;
    }).join('');

    // 2. 빠른 정답표 그리드
    if (quickGrid) {
      quickGrid.innerHTML = questions.map((q, idx) => `
        <div class="border p-1 rounded bg-white min-h-[44px] flex flex-col justify-center items-center shadow-sm">
          <span class="text-[9px] text-slate-400 font-bold mb-0.5">${idx + 1}번</span>
          <span class="font-black text-[10px] text-slate-800 truncate w-full text-center px-0.5">${q.answer}</span>
        </div>
      `).join('');
    }

    // 3. 정밀 정답 및 해설지
    if (answerContainer) {
      answerContainer.innerHTML = questions.map((q, idx) => `
        <div class="question-block border-b pb-2 mb-2 break-inside-avoid">
          <div class="font-bold text-slate-900 mb-1">[${idx + 1}번 정답 : <strong class="text-blue-700">${q.answer}</strong>]</div>
          <div class="text-[11px] text-slate-700 font-sans bg-slate-50 p-2 rounded">${q.explanation}</div>
        </div>
      `).join('');
    }
  },

  setFontSize(sizeClass) {
    const el = document.getElementById('paperContent');
    if (el) el.className = `exam-columns-2 text-slate-900 ${sizeClass}`;
  },

  toggleWatermark(show) {
    const box = document.getElementById('paperHeaderBox');
    if (box) box.style.opacity = show ? '1' : '0.4';
  },

  toggleAnswers(show) {
    const sec = document.getElementById('paperAnswerSection');
    if (sec) sec.classList.toggle('hidden', !show);
  }
};
