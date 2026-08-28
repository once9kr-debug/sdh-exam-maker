import { NextResponse } from 'next/server';

export async function POST(req) {
  try {
    const { passage, questionTypes } = await req.json();
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY가 설정되지 않았습니다.' }, { status: 500 });
    }

    const prompt = `
너는 대한민국 고등학교 영어 내신 시험문제 출제 전문가이다. 
아래 [지문]을 바탕으로 지정된 [문제 유형]에 맞는 변형문제를 제작해라.

[지문]
${passage}

[요구 문제 유형]
${questionTypes.join(', ')}

[출력 형식]
반드시 다음 JSON 배열 형식으로만 응답해야 한다. 마크다운이나 추가 설명 문구는 제외해라.
[
  {
    "question_type": "어법",
    "question_text": "다음 글의 밑줄 친 부분 중, 어법상 틀린 것은?",
    "passage_with_marks": "지문 내 밑줄 ①... ②... 표시 포함 텍스트",
    "options": ["① working", "② what", "③ achieving", "④ which", "⑤ that"],
    "answer": "① working",
    "explanation": "and 뒤의 병렬구조에 의해 work와 병렬을 이루는 원형 동사가 올 자리이다."
  }
]
`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" }
      })
    });

    const data = await response.json();
    if (!data.candidates || !data.candidates[0]) {
      return NextResponse.json({ error: 'Gemini API 응답을 받지 못했습니다.' }, { status: 500 });
    }

    const resultText = data.candidates[0].content.parts[0].text;
    const questions = JSON.parse(resultText);

    return NextResponse.json({ questions });
  } catch (error) {
    console.error('Gemini API Error:', error);
    return NextResponse.json({ error: '문제 생성 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
