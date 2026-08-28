'use client';

import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function ExamGenerator() {
  const [passage, setPassage] = useState('');
  const [title, setTitle] = useState('');
  const [selectedTypes, setSelectedTypes] = useState(['어법', '어휘']);
  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState([]);

  const handleTypeChange = (type) => {
    setSelectedTypes(prev => 
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  const generateExam = async () => {
    if (!passage.trim()) return alert('영어 지문을 입력해 주세요.');
    setLoading(true);

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passage, questionTypes: selectedTypes })
      });
      const data = await res.json();

      if (data.questions) {
        setQuestions(data.questions);

        if (supabaseUrl && supabaseAnonKey) {
          const { data: passageData } = await supabase
            .from('passages')
            .insert([{ title: title || '무제 지문', content: passage }])
            .select();

          if (passageData && passageData[0]) {
            const passageId = passageData[0].id;
            const questionsToInsert = data.questions.map(q => ({
              passage_id: passageId,
              question_type: q.question_type,
              question_text: q.question_text,
              options: q.options,
              answer: q.answer,
              explanation: q.explanation
            }));
            await supabase.from('questions').insert(questionsToInsert);
          }
        }
      } else if (data.error) {
        alert(data.error);
      }
    } catch (err) {
      alert('문제 생성 및 DB 저장 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <script src="https://cdn.tailwindcss.com"></script>
      <div className="min-h-screen bg-slate-100 text-slate-800">
        <header className="print:hidden bg-slate-900 text-white p-4 flex justify-between items-center shadow">
          <h1 className="text-xl font-bold text-indigo-400">SDH Premium Decoding</h1>
          <button 
            onClick={() => window.print()} 
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded text-sm font-semibold transition"
          >
            🖨️ 시험지 인쇄 / PDF 저장
          </button>
        </header>

        <main className="max-w-7xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          <section className="print:hidden lg:col-span-5 bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-4">
            <div>
              <label className="block font-bold mb-1 text-slate-900">지문 제목</label>
              <input 
                type="text" 
                placeholder="Ex) 2026년 3월 고2 모의고사 21번" 
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded text-sm mb-3 focus:outline-indigo-500"
              />
              
              <label className="block font-bold mb-1 text-slate-900">영어 지문 입력</label>
              <textarea 
                rows={10} 
                value={passage}
                onChange={(e) => setPassage(e.target.value)}
                placeholder="변형문제를 만들 영어 지문 전체를 붙여넣으세요..."
                className="w-full p-3 border border-slate-300 rounded text-sm focus:outline-indigo-500"
              />
            </div>

            <div>
              <label className="block font-bold mb-2 text-slate-900">문제 유형 선택</label>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {['어법', '어휘', '빈칸추론', '순서배열', '문장삽입', '서술형영작'].map((type) => (
                  <label key={type} className="flex items-center gap-2 p-2 border rounded cursor-pointer hover:bg-slate-50">
                    <input 
                      type="checkbox" 
                      checked={selectedTypes.includes(type)}
                      onChange={() => handleTypeChange(type)}
                    />
                    {type}
                  </label>
                ))}
              </div>
            </div>

            <button 
              onClick={generateExam} 
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-lg shadow transition disabled:bg-indigo-300"
            >
              {loading ? '🤖 Gemini API 연동 문제 생성 중...' : '⚡ 변형문제 자동 생성 및 DB 저장'}
            </button>
          </section>

          <section className="lg:col-span-7 bg-white p-8 rounded-xl border border-slate-200 shadow-sm print:m-0 print:p-0 print:border-none">
            <div className="border-b-2 border-slate-900 pb-3 mb-6 flex justify-between items-end">
              <div>
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">SDH HIGH SCHOOL ENGLISH EXAM</h2>
                <p className="text-xs text-slate-600">에스디에이치어학원 고등부 변형문제집</p>
              </div>
              <div className="text-right text-xs text-slate-600 space-y-1">
                <div>성명: ____________________</div>
                <div>점수: ____________________</div>
              </div>
            </div>

            {questions.length === 0 ? (
              <div className="text-center text-slate-400 py-32 border-2 border-dashed border-slate-200 rounded-lg">
                지문을 입력하고 생성 버튼을 누르면 인쇄용 시험지가 출력됩니다.
              </div>
            ) : (
              <div className="space-y-6 text-sm">
                <div className="bg-slate-50 p-4 rounded border text-xs text-slate-700 leading-relaxed">
                  <strong>[지문] {title}</strong><br/>
                  {passage}
                </div>

                {questions.map((q, idx) => (
                  <div key={idx} className="space-y-2 border-b pb-4">
                    <div className="font-bold text-slate-900">{idx + 1}. {q.question_text}</div>
                    {q.passage_with_marks && (
                      <p className="text-xs text-slate-700 bg-slate-50 p-3 rounded leading-relaxed">
                        {q.passage_with_marks}
                      </p>
                    )}
                    {q.options && (
                      <div className="grid grid-cols-1 gap-1 pl-2 text-xs text-slate-700">
                        {q.options.map((opt, oIdx) => (
                          <div key={oIdx}>{opt}</div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </main>
      </div>
    </>
  );
}
