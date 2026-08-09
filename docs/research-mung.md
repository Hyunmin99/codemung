# 멍때리기 심층 리서치 — codemung 배경 문서

> 목적: "코드를 작성하면서 멍때릴 수 있는 그래픽 효과"를 설계하기 위한 과학적·문화적 배경 정리.

## 1. 멍때리기란 무엇인가

멍때리기는 특정 과제에 주의를 기울이지 않고, 목적 없는 몽롱한 의식 상태에 머무는 것을 말한다. 뇌과학적으로는 2001년 마커스 라이클(Marcus Raichle)이 명명한 **디폴트 모드 네트워크(DMN, Default Mode Network)**가 활성화되는 상태다. DMN은 외부 과제에 집중하지 않을 때 — 멍하니 있을 때, 공상할 때, 과거를 회상하거나 미래를 상상할 때 — 스스로 가동되는 뇌의 '기본값' 회로로, 자기 성찰, 정서 평가, 기억 정리, 타인 감정 추론 같은 고차원 인지 활동을 무의식적으로 수행한다.

핵심: 멍때리기는 뇌가 꺼진 상태가 아니라, **내향적 처리 모드로 전환된 상태**다.

## 2. 사람들은 어떻게 멍을 때리는가

한국에서 멍때리기는 하나의 문화가 됐다. 대표적 방식은 대상 앞에서의 수동적 응시다.

- **불멍**: 모닥불·촛불·벽난로 영상을 바라보기. 가장 대중적.
- **물멍**: 강, 바다, 어항, 빗소리와 물결.
- **숲멍/산멍/구름멍**: 자연 풍경 응시.
- **한강 멍때리기 대회**: 번아웃을 겪은 예술가 웁쓰양이 시작한 행사로, 90분간 아무것도 하지 않고 심박 안정도를 겨룬다. "아무것도 하지 않는 것은 뒤처지는 것"이라는 통념에 대한 반문이 흥행 배경이다.

공통 패턴: **느리고, 반복적이되 완전히 규칙적이지는 않은, 예측 불가능성이 약간 섞인 자극**(불꽃의 흔들림, 물결, 구름)을 바라본다. 심리학에서는 이를 **부드러운 매혹(soft fascination)**이라 부른다 — 주의를 강제로 붙잡지 않으면서 은은하게 끌어당기는 자극.

## 3. 멍때리기의 효능 (연구 근거)

- **주의력 회복**: 주의회복이론(ART, Kaplan)에 따르면 지시적 주의(directed attention)는 소모성 자원이며, soft fascination 자극이 이를 회복시킨다. 멜버른대 Kate Lee의 실험에서는 **단 40초** 녹색 옥상 조망 마이크로 브레이크만으로 집중력이 6% 상승한 반면, 콘크리트 조망 그룹은 8% 하락했다.
- **창의성·문제 해결(부화 효과)**: 100건 이상의 실험 메타분석에서 문제에서 잠시 떨어져 있는 '부화(incubation)'가 창의적 해결 확률을 유의하게 높였고, 특히 **저부하 활동을 하는 휴식**이 고부하 활동 휴식보다 효과가 컸다. 디버깅 중 산책하다 답이 떠오르는 그 현상이다. 최근 연구는 DMN 활동을 교란하면 독창성이 감소함을 보여 인과관계까지 확인했다.
- **기억·학습**: 짧은 무활동 휴식이 기억 공고화에 도움을 준다. 코넬대 실험에서 가만히 있던 그룹이 얼굴 인식 과제를 더 빠르고 정확하게 수행했다.
- **정서·신체 안정**: 불멍·물멍은 심박수 안정, 근긴장 완화, 호흡 감속 등 명상과 유사한 이완 반응을 일으킨다.

## 4. 좋은 멍때리기의 조건

1. **저부하 자극**: 인지적 노력이 필요 없어야 한다. 텍스트, 알림, 퀴즈성 요소는 금물. 부화 효과도 저부하 휴식에서 가장 크다.
2. **Soft fascination**: 완전 정적이면 지루하고, 너무 화려하면 주의를 강탈한다. 불꽃·물결·구름처럼 "느린 무작위성"이 이상적.
3. **자연 요소**: 자연(또는 자연을 닮은) 시각 자극이 회복 효과가 가장 크다. 실제 자연이 아닌 화면 속 자연 영상도 효과가 있다.
4. **짧아도 된다**: 40초 마이크로 브레이크로도 측정 가능한 효과. 길이보다 질.
5. **충분한 선행 몰입**: 부화 효과는 문제에 충분히 몰두한 뒤 떨어질 때 크다. 즉 코딩 몰입 → 멍 → 복귀 사이클이 이상적.
6. **반추(rumination) 회피**: 멍때리기가 부정적 생각의 되새김으로 흐르면 오히려 불안·우울을 키운다. 외부의 부드러운 자극에 시선을 두는 것이 반추를 막는 닻 역할을 한다 — 사람들이 그냥 눈을 감지 않고 불·물을 '보는' 이유.

## 5. codemung 설계 시사점

- 코드 옆에서 흐르는 **느리고 유기적인 그래픽**(불꽃, 물결, 파티클, 구름 노이즈)이 과학적으로 정확한 방향이다. Perlin/simplex 노이즈 기반의 느린 무작위 움직임이 soft fascination을 재현한다.
- **텍스트·숫자·알림 없는** 순수 시각 자극이어야 한다. 인지 부하가 생기는 순간 회복 효과가 사라진다.
- 자연 모티프(물, 불, 하늘, 초록)를 우선 채택할 것. 추상 그래픽이라도 자연의 리듬(1/f 노이즈)을 따르면 좋다.
- 40초~수 분의 **마이크로 브레이크** 단위로 설계해도 충분하다. "긴 휴식 앱"일 필요가 없다.
- 몰입 → 멍 → 복귀 사이클을 지원하면 부화 효과를 극대화할 수 있다 (예: 일정 시간 타이핑 후 은은하게 멍 모드 제안).
- 채도 낮고 대비 약한, 주의를 강탈하지 않는 시각 톤. 화려한 이펙트는 오히려 역효과.

## 출처

- [KISTI 과학향기 — 멍 때리기, 뇌의 수행 능력을 높여준다](https://scent.kisti.re.kr/site/main/archive/article/%EB%A9%8D-%EB%95%8C%EB%A6%AC%EA%B8%B0-%EB%87%8C%EC%9D%98-%EC%88%98%ED%96%89-%EB%8A%A5%EB%A0%A5%EC%9D%84-%EB%86%92%EC%97%AC%EC%A4%80%EB%8B%A4-20191113073000)
- [세계일보 — '멍 때리기'의 효과](https://m.segye.com/view/20210804510416)
- [Oxford Brain — DMN dynamics and causal role in creative thinking](https://academic.oup.com/brain/article/147/10/3409/7695856)
- [Attention Restoration Theory — Wikipedia](https://en.wikipedia.org/wiki/Attention_restoration_theory)
- [Lee et al. 2015 — 40-second green roof views sustain attention](https://www.sciencedirect.com/science/article/abs/pii/S0272494415000328)
- [HBR — Gazing at Nature Makes You More Productive (Kate Lee 인터뷰)](https://hbr.org/2015/09/gazing-at-nature-makes-you-more-productive)
- [Incubation in Insight Problem Solving — Creativity Research Journal](https://www.tandfonline.com/doi/abs/10.1207/s15326934crj1601_13)
- [Nature Sci. Reports — Mind wandering during creative incubation](https://www.nature.com/articles/s41598-025-09736-y)
- [KCI — '불멍'에서 마음과 대상의 문제](https://www.kci.go.kr/kciportal/ci/sereArticleSearch/ciSereArtiView.kci?sereArticleSearchBean.artiId=ART002789069)
- [브라보마이라이프 — 불멍·물멍·숲멍, 명상 효과로 인기](https://bravo.etoday.co.kr/view/atc_view/12749)
- [서울시 한강 멍때리기 대회](https://hangang.seoul.go.kr/www/eventMng/detail.do?mid=538&evntSn=268)
- [Mind wandering and depression — ScienceDirect](https://www.sciencedirect.com/science/article/pii/S0149763421005765)
