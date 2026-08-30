// js/ai-generator.js 내 executeFastParallelGenerate 함수의 응답 처리 부분 교정

if (Array.isArray(parsed)) {
  const seenTypes = new Set();
  const exactItems = [];

  // 🎯 선택된 11개 유형에 대해 유형당 딱 1문항만 엄격 선별 (중복 제거)
  for (let item of parsed) {
    const itemType = item.type || selectedTypes[0];
    
    // 유효한 선택 유형이고, 아직 수집되지 않은 유형인 경우만 수집
    if (selectedTypes.includes(itemType) && !seenTypes.has(itemType)) {
      seenTypes.add(itemType);
      exactItems.push(item);
    }
  }

  // 선별된 1:1 매칭 문항만 파서 통과 및 DB 인서트
  const verifiedItems = exactItems.map((item) => 
    processVerifiedQuestion(item, pObj.full_text, item.type, setKey, pObj.passage_num, pObj.id)
  );

  const { error } = await supabaseClient.from('questions').insert(verifiedItems);
  if (!error) totalCount += verifiedItems.length;
  logBox.innerHTML += `<div class="text-emerald-300">✓ ${pObj.passage_num}번 완료 [기출패턴 반영 및 중복검증 완료] (+${verifiedItems.length}문항)</div>`;
  logBox.scrollTop = logBox.scrollHeight;
}
