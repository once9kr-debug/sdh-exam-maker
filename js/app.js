// SDH STUDIO - Main Application Controller
const App = {
  currentSetKey: null,
  currentQuestions: [],
  selectedQuestions: [],

  async init() {
    this.bindEvents();
    const ok = await AppState.init();
    if (ok) {
      this.renderExamTable();
      this.populateMockSelect();
      this.renderBenchmarkList();
    }
  },

  switchView(viewName) {
    const views = ['examList', 'examDetail', 'regPassage', 'benchmarkDB', 'aiGenerator', 'paperView'];
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

  renderExamTable() {
    const container = document.getElementById('examTableBody');
    if (!container) return;

    if (AppState.mockSets.length === 0) {
      container.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-slate-400">등록된 모의고사 지문 세트가 없습니다.</td></tr>`;
      return;
    }

    container.innerHTML = AppState.mockSets.map((exam, idx) => `
      <tr class="border-b hover:bg-slate-50/80 transition text-xs">
        <td class="p-4 text-center font-bold text-slate-500">${idx + 1}</td>
        <td class="p-4"><span class="px-2 py-0.5 bg-slate-100 font-bold text-slate-700 rounded-md">${exam.grade}</span></td>
        <td class="p-4 font-bold text-slate-900">${exam.title}</td>
        <td class="p-4 text-center">
          <span class="px-2.5 py-1 bg-cyan-50 text-cyan-700 font-bold rounded-lg border border-cyan-100">${exam.questionCount}문항</span>
        </td>
        <td class="p-4 text-center flex justify-center items-center gap-2">
          <button onclick="App.openExamDetail('${exam.id}')" class="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-cyan-400 rounded-xl font-bold transition flex items-center gap-1.5">
            <i class="fa-solid fa-sliders text-xs"></i> 문항 선택/출제
          </button>
          <button onclick="App.clearSetQuestions('${exam.id}')" title="이 세트의 변형문제 비우기" class="px-2.5 py-1.5 border border-rose-200 text-rose-500 hover:bg-rose-50 rounded-xl font-bold transition">
            <i class="fa-solid fa-trash-can text-xs"></i>
          </button>
        </td>
      </tr>
    `).join('');
  },

  openExamDetail(setKey) {
    this.currentSetKey = setKey;
    const exam = AppState.mockSets.find(e => e.id === setKey);
    const questions = AppState.getQuestionsBySet(setKey);

    document.getElementById('detailExamTitle').innerText = exam ? exam.title : setKey;
    document.getElementById('detailTotalCount').innerText = `전체 보유 문항: ${questions.length}개`;

    const passageNums = [...new Set(questions.map(q => q.passage_num))].sort((a, b) => Number(a) - Number(b));
    const pContainer = document.getElementById('detailPassageFilters');
    pContainer.innerHTML = passageNums.map(n => `
      <label class="flex items-center gap-1.5 px-3 py-1.5 bg-white border rounded-lg cursor-pointer hover:bg-slate-50 text-xs font-bold text-slate-700">
        <input type="checkbox" name="filterPassage" value="${n}" checked onchange="App.filterDetailQuestions()">
        <span>${n}번</span>
      </label>
    `).join('');

    const types = [...new Set(questions.map(q => q.type))];
    const tContainer = document.getElementById('detailTypeFilters');
    tContainer.innerHTML = types.map(t => `
      <label class="flex items-center gap-1.5 px-3 py-1.5 bg-white border rounded-lg cursor-pointer hover:bg-slate-50 text-xs font-bold text-slate-700">
        <input type="checkbox" name="filterType" value="${t}" checked onchange="App.filterDetailQuestions()">
        <span>${t}</span>
      </label>
    `).join('');

    this.filterDetailQuestions();
    this.switchView('examDetail');
  },

  filterDetailQuestions() {
    const questions = AppState.getQuestionsBySet(this.currentSetKey);
    const checkedPassages = Array.from(document.querySelectorAll('input[name="filterPassage"]:checked')).map(cb => cb.value);
    const checkedTypes = Array.from(document.querySelectorAll('input[name="filterType"]:checked')).map(cb => cb.value);

    this.selectedQuestions = questions.filter(q => checkedPassages.includes(q.passage_num) && checkedTypes.includes(q.type));

    const listContainer = document.getElementById('detailQuestionList');
    document.getElementById('detailSelectedCount').innerText = `선택된 출제 문항: ${this.selectedQuestions.length}개`;

    if (this.selectedQuestions.length === 0) {
      listContainer.innerHTML = `<div class="p-8 text-center text-slate-400 bg-white rounded-xl border border-dashed">선택된 조건에 해당하는 문항이 없습니다.</div>`;
      return;
    }

    listContainer.innerHTML = this.selectedQuestions.map((q, idx) => `
      <div class="p-4 bg-white border rounded-xl space-y-2 text-xs relative group hover:border-cyan-500 transition">
        <div class="flex justify-between items-center pr-8">
          <span class="font-bold text-slate-900">${idx + 1}. [${q.passage_num}번] ${q.title}</span>
          <span class="px-2 py-0.5 bg-amber-50 text-amber-700 font-bold rounded">${q.type}</span>
        </div>
        <p class="text-slate-600 line-clamp-2">${q.passage.replace(/<[^>]*>?/gm, '')}</p>
        <div class="text-[11px] text-slate-500 font-bold">정답: ${q.answer}</div>
        <button onclick="App.deleteSingleQuestion(${q.id})" title="문항 삭제" class="absolute top-3 right-3 text-slate-300 hover:text-rose-500 p-1 transition">
          <i class="fa-solid fa-trash-can text-sm"></i>
        </button>
      </div>
    `).join('');
  },

  async deleteSingleQuestion(id) {
    if (confirm('이 문항을 삭제하시겠습니까?')) {
      await AppState.deleteQuestion(id);
      this.filterDetailQuestions();
      this.renderExamTable();
    }
  },

  async clearSetQuestions(setKey) {
    if (confirm(`'${setKey}' 세트에 생성된 변형문제를 모두 비우시겠습니까?`)) {
      await AppState.clearQuestionsBySet(setKey);
      this.renderExamTable();
      if (this.currentSetKey === setKey) {
        this.openExamDetail(setKey);
      }
    }
  },

  toggleAllFilter(name, check) {
    document.querySelectorAll(`input[name="${name}"]`).forEach(cb => cb.checked = check);
    this.filterDetailQuestions();
  },

  generateSelectedPaper() {
    if (this.selectedQuestions.length === 0) {
      alert('출제할 문항을 최소 1개 이상 선택해 주세요.');
      return;
    }
    PaperRenderer.render(this.selectedQuestions);
    this.switchView('paperView');
  },

  populateMockSelect() {
    const select = document.getElementById('selectMockSet');
    if (!select) return;
    select.innerHTML = '<option value="">-- 모의고사 세트를 선택하세요 --</option>' + 
      AppState.mockSets.map(e => `<option value="${e.id}">${e.title}</option>`).join('');
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
    document.getElementById('paperFontSize')?.addEventListener('change', (e) => {
      PaperRenderer.setFontSize(e.target.value);
    });
    document.getElementById('chkShowWatermark')?.addEventListener('change', (e) => {
      PaperRenderer.toggleWatermark(e.target.checked);
    });
    document.getElementById('chkShowAnswerPage')?.addEventListener('change', (e) => {
      PaperRenderer.toggleAnswers(e.target.checked);
    });
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
