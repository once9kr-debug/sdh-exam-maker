// SDH STUDIO - Global State & Data Layer
const SUPABASE_URL = 'https://kqmogqlukkviddjsfyeb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtxbW9ncWx1a2t2aWRkanNmeWViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5Mjc3NjYsImV4cCI6MjEwMzUwMzc2Nn0.nqWvvphNCdPGMDrEYLilk-wHmNkH2BhPTuvMwaCXqo8';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const AppState = {
  currentUser: { role: 'admin', name: '관리자' },
  passages: [],
  benchmarks: [],
  questions: [],
  workbooks: [],
  mockSets: [],

  // 1. 초기 데이터 로드 (페이징 최적화)
  async init() {
    try {
      const [pRes, bRes, qRes] = await Promise.all([
        supabaseClient.from('passages').select('*').order('created_at', { ascending: false }).limit(300),
        supabaseClient.from('school_benchmark').select('*').order('created_at', { ascending: false }).limit(200),
        supabaseClient.from('questions').select('*').order('created_at', { ascending: false }).limit(500)
      ]);

      this.passages = pRes.data || [];
      this.benchmarks = bRes.data || [];
      this.questions = qRes.data || [];

      this.rebuildMockSets();
      return true;
    } catch (err) {
      console.error('State Init Error:', err);
      return false;
    }
  },

  // 2. 모의고사 세트 메타 구성
  rebuildMockSets() {
    const setMap = {};
    this.passages.forEach(p => {
      const pYear = p.year || '2024';
      const pMonth = p.month || '3';
      const rawGrade = String(p.grade || '1').replace('고', '');
      const pGrade = `고${rawGrade}`;
      const setKey = p.set_key || `${pYear}-${pMonth}-${rawGrade}`;

      if (!setMap[setKey]) {
        setMap[setKey] = {
          id: setKey,
          year: pYear,
          month: pMonth,
          grade: pGrade,
          title: `${pYear}년 ${pMonth}월 학력평가 (${pGrade})`,
          passageCount: 0,
          questionCount: 0
        };
      }
      setMap[setKey].passageCount++;
    });

    this.questions.forEach(q => {
      const matchedKey = Object.keys(setMap).find(k => k === q.set_key || k.startsWith(q.set_key) || q.set_key.startsWith(k));
      if (matchedKey) setMap[matchedKey].questionCount++;
    });

    this.mockSets = Object.values(setMap);
  },

  // 3. 지문 DB 저장/업데이트
  async savePassageBatch(passagesArray) {
    const { data, error } = await supabaseClient.from('passages').upsert(passagesArray).select();
    if (!error) {
      await this.init();
      return { success: true, data };
    }
    return { success: false, error };
  },

  // 4. 기출 벤치마크 단건 저장
  async saveBenchmark(benchmarkItem) {
    const { data, error } = await supabaseClient.from('school_benchmark').insert([benchmarkItem]).select();
    if (!error && data) {
      this.benchmarks.unshift(data[0]);
      return { success: true, data: data[0] };
    }
    return { success: false, error };
  },

  // 5. 기출 DB 전체 초기화
  async clearBenchmarks() {
    const { error } = await supabaseClient.from('school_benchmark').delete().neq('id', 0);
    if (!error) {
      this.benchmarks = [];
      return true;
    }
    return false;
  },

  // 6. 생성된 변형문제 저장
  async saveGeneratedQuestions(questionsArray) {
    const { data, error } = await supabaseClient.from('questions').insert(questionsArray).select();
    if (!error) {
      this.questions.unshift(...(data || []));
      this.rebuildMockSets();
      return { success: true, count: questionsArray.length };
    }
    return { success: false, error };
  },

  // 7. 특정 세트의 문제 불러오기
  getQuestionsBySet(setKey, difficulty = null) {
    return this.questions.filter(q => {
      const matchSet = q.set_key === setKey || setKey.includes(q.set_key) || q.set_key.includes(setKey);
      return difficulty ? matchSet && q.difficulty === difficulty : matchSet;
    });
  }
};
