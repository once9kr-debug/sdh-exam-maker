// SDH STUDIO - Main Application Controller
const App = {
  currentQuestions: [],

  async init() {
    this.bindEvents();
    const ok = await AppState.init();
    if (ok) {
      this.renderExamList();
      this.populateMockSelect();
      this.renderBenchmarkList();
    }
  },

  switchView(viewName) {
    const views = ['examList', 'regPassage', 'benchmarkDB', 'aiGenerator', 'paperView'];
    views.forEach(v => {
      const el = document.getElementById(`view-${v}`);
      if (el) el.classList.add('hidden');
    });
    const target = document.getElementById(`view-${viewName}`);
    if (target) target.classList.remove('hidden');
  },

  setMode(mode) {
    AppState.currentUser.role = mode;
    const adminGroup = document.getElementById('adminMenuGroup');
    const label = document.getElementById('currentModeLabel');
    const btnAdmin = document.getElementById('modeBtn_admin');
    const btnTeacher = document.getElementById('modeBtn_teacher');

    if (mode === 'admin') {
      if (adminGroup) adminGroup.classList.remove('hidden');
      if (label) label.innerText = '관리자 접속 중';
      btnAdmin.className = 'flex-1 py-1.5 rounded-lg bg-cyan-500 text-slate-950 transition font-bold';
      btnTeacher.className = 'flex-1 py-1.5 rounded-lg text-slate-400 hover:text-white transition font-bold';
    } else {
      if (adminGroup) adminGroup.classList.add('hidden');
      if (label) label.innerText = '선생님 모드 접속 중';
      btnTeacher.className = 'flex-1 py-1.5 rounded-lg bg-cyan-500 text-slate-950 transition font-bold';
      btnAdmin.className = 'flex-1 py-1.5 rounded-lg text-slate-400 hover:text-white transition font-bold';
      this.switchView('examList');
    }
  },

  renderExamList() {
    const container = document.getElementById('examTableContainer');
    if (!container) return;

    if (AppState.mockSets.length === 0) {
      container.innerHTML = `<div class="col-span-3 p-8 text-center text-slate-400 bg-white rounded-2xl border border-dashed">보관된 모의고사 세트가 없습니다.</div>`;
      return;
    }

    container.innerHTML = AppState.mockSets.map(exam => `
      <div class="bg-white p-5 rounded-2xl border hover:border-cyan-500 shadow-sm transition space-y-4">
        <div class="flex justify-between items-start">
          <div>
            <span class="bg-slate-100 text-slate-600 font-bold text-[10px] px-2 py-0.5 rounded-full">${exam.grade}</span>
            <h3 class="font-black text-slate-900 text-sm mt-1">${exam.title}</h3>
          </div>
          <span class="bg-cyan-50 text-cyan-700 font-bold text-xs px-2.5 py-1 rounded-lg border border-cyan-100">${exam.questionCount}문항</span>
        </div>
        <button onclick="App.loadPaper('${exam.id}')" class="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-cyan-400 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5">
          <i class="fa-solid fa-print"></i> 문제지 미리보기 및 인쇄
        </button>
      </div>
    `).join('');
  },

  populateMockSelect() {
    const select = document.getElementById('selectMockSet');
    if (!select) return;
    select.innerHTML = '<option value="">-- 모의고사 세트를 선택하세요 --</option>' + 
      AppState.mockSets.map(e => `<option value="${e.id}">${e.title}</option>`).join('');
  },

  loadPaper(setKey) {
    this.currentQuestions = AppState.getQuestionsBySet(setKey);
    if (this.currentQuestions.length === 0) {
      alert('출제된 변형문제가 없습니다. AI Engine에서 먼저 생성해주세요.');
      return;
    }
    PaperRenderer.render(this.currentQuestions);
    this.switchView('paperView');
  },

  renderBenchmarkList() {
    const container = document.getElementById('benchmarkFolderContainer');
    const badge = document.getElementById('benchmarkCountBadge');
    if (badge) badge.innerText = `기출 ${AppState.benchmarks.length}제`;
    if (!container) return;

    if (AppState.benchmarks.length === 0) {
      container.innerHTML = `<div class="p-8 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed">등록된 기출 DB가 없습니다.</div>`;
      return;
    }

    container.innerHTML = AppState.benchmarks.map(b => `
      <div class="p-3 border rounded-xl bg-slate-50 text-xs flex justify-between">
        <div><strong>[${b.school}]</strong> ${b.raw_title || b.title}</div>
        <div class="text-cyan-700 font-bold">${b.trick || '기출 패턴'}</div>
      </div>
    `).join('');
  },

  bindEvents() {
    // 폰트 크기 변경
    document.getElementById('paperFontSize')?.addEventListener('change', (e) => {
      PaperRenderer.setFontSize(e.target.value);
    });
    // 워터마크 토글
    document.getElementById('chkShowWatermark')?.addEventListener('change', (e) => {
      PaperRenderer.toggleWatermark(e.target.checked);
    });
    // 정답지 토글
    document.getElementById('chkShowAnswerPage')?.addEventListener('change', (e) => {
      PaperRenderer.toggleAnswers(e.target.checked);
    });
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
