# Yachoo

B급 파티 감성의 로컬 멀티플레이 Yacht Dice 웹 게임입니다. DB 없이 브라우저 `localStorage`에 닉네임과 코스튬 설정을 저장하며, 정적 파일만으로 실행됩니다.

## 실행

```bash
npm run generate:sfx
npm run verify
```

브라우저에서 `index.html`을 열면 바로 플레이할 수 있습니다. 정적 사이트라서 GitHub Pages, Vercel, Netlify 등에 그대로 배포할 수 있습니다.

## 친구 목소리 SFX

`assets/sfx/` 폴더에 아래 파일명을 추가하면 게임 안의 보이스 패드에서 재생됩니다.

- `voice_01.wav` 또는 `voice_01.mp3` - "야"
- `voice_02.wav` 또는 `voice_02.mp3` - "뭐하냐고"
- `voice_03.wav` 또는 `voice_03.mp3` - "되겠냐고"
- `voice_04.wav` 또는 `voice_04.mp3` - "잠시만"

이미 포함된 효과음은 `button_click.wav`, `dice_roll.wav`, `score_lock.wav`, `confetti_pop.wav`, `buzzer.wav`입니다.

## 배포

GitHub Pages 배포용 워크플로가 `.github/workflows/pages.yml`에 포함되어 있습니다. `main` 브랜치에 push하면 정적 파일이 Pages에 올라갑니다.
