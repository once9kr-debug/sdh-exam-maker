import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

export async function POST(req) {
  try {
    const { passage, questionTypes } = await req.json();
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY가 Vercel에 설정되지 않았습니다.' }, { status: 400 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-1.5-flash',
      generationConfig: { responseMimeType: "application/json" }
    });

    const prompt = `
너는 대한민국 고등학교 영어 내신 시험문제 출제 전문가이다. 
아래 [지문]을 바탕으로 지정된 [문제 유형]에 맞는 변형문제를 제작해라.

[지문]
${passage}

[요구 문제 유형]
${questionTypes.join(', ')}

[출력 형식]
반드시 다음 JSON 구조를 갖춘 배열로만 응답해야 한다:
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

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    const questions = JSON.parse(responseText);

    return NextResponse.json({ questions });
  } catch (error) {
    console.error('Gemini API Error:', error);
    return NextResponse.json({ error: `API 오류: ${error.message}` }, { status: 500 });
  }
}
