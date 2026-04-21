import * as vscode from 'vscode';
import * as path from 'path';
import { execSync } from 'child_process';

type Mood = 'idle' | 'happy' | 'very_happy' | 'sad';

interface TompeiState {
  lastOpenedDate: string;
  streak: number;
}

function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

function getYesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

function updateStreak(context: vscode.ExtensionContext): { streak: number; sadBecauseStreakBroke: boolean } {
  const today = getToday();
  const yesterday = getYesterday();
  const stored = context.globalState.get<TompeiState>('tompeiState') ?? { lastOpenedDate: '', streak: 0 };

  let streak = stored.streak;
  let sadBecauseStreakBroke = false;

  if (stored.lastOpenedDate === today) {
    // already counted today
  } else if (stored.lastOpenedDate === yesterday) {
    streak += 1;
  } else if (stored.lastOpenedDate === '') {
    streak = 1;
  } else {
    if (streak > 1) sadBecauseStreakBroke = true;
    streak = 1;
  }

  context.globalState.update('tompeiState', { lastOpenedDate: today, streak });
  return { streak, sadBecauseStreakBroke };
}

function findGitRepos(rootPath: string): string[] {
  try {
    const result = execSync(
      `find . -name ".git" -type d -not -path "*/node_modules/*" -maxdepth 6`,
      { cwd: rootPath, encoding: 'utf8', timeout: 5000 }
    );
    return result.trim().split('\n')
      .filter(Boolean)
      .map(p => path.join(rootPath, path.dirname(p)));
  } catch {
    return [rootPath];
  }
}

function countTodayCommits(): number {
  const folders = vscode.workspace.workspaceFolders ?? [];
  const today = getToday();
  let total = 0;
  for (const folder of folders) {
    const repos = findGitRepos(folder.uri.fsPath);
    for (const repoPath of repos) {
      try {
        const result = execSync(
          `git log --oneline --after="${today} 00:00:00" HEAD 2>/dev/null`,
          { cwd: repoPath, encoding: 'utf8', timeout: 3000 }
        );
        total += result.trim() ? result.trim().split('\n').length : 0;
      } catch {
        // not a git repo, skip
      }
    }
  }
  return total;
}

function determineMood(streak: number, sadBecauseStreakBroke: boolean, commitsToday: number): Mood {
  if (sadBecauseStreakBroke) return 'sad';
  if (streak >= 7 || commitsToday >= 5) return 'very_happy';
  if (streak >= 3 || commitsToday >= 3) return 'happy';
  return 'idle';
}

function getWebviewContent(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  mood: Mood,
  streak: number,
  commitsToday: number
): string {
  const uri = (file: string) =>
    webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'images', file)).toString();

  const images = {
    idle: uri('idle.png'),
    happy: uri('happy.png'),
    very_happy: uri('very_happy.png'),
    sad: uri('sad.png'),
    clicked: uri('clicked.png'),
    sleeping: uri('sleeping.png'),
  };

  const messages: Record<Mood, string> = {
    idle: '今日もよろしく！',
    happy: `${streak}日連続！いい感じ！`,
    very_happy: `${streak}日連続！最高すぎる！`,
    sad: '連続記録が途切れちゃった...',
  };

  const csp = `default-src 'none'; img-src ${webview.cspSource}; style-src 'unsafe-inline'; script-src 'unsafe-inline';`;

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    width: 100%; height: 100%;
    overflow: hidden;
    background: transparent;
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
    user-select: none;
  }
  #stage {
    position: relative;
    width: 100%; height: 100%;
  }
  #statsBar {
    position: absolute;
    top: 8px; left: 0; right: 0;
    text-align: center;
    font-size: 11px;
    opacity: 0.45;
  }
  #charEl {
    position: absolute;
    width: 90px; height: 90px;
    cursor: pointer;
    bottom: 16px;
  }
  #charImg {
    width: 100%; height: 100%;
    object-fit: contain;
    transform-origin: center bottom;
    display: block;
  }
  #bubble {
    position: absolute;
    background: var(--vscode-editor-background, #1e1e1e);
    border: 1px solid var(--vscode-panel-border, #444);
    border-radius: 8px;
    padding: 4px 8px;
    font-size: 11px;
    white-space: nowrap;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.3s;
  }
  #bubble.visible { opacity: 1; }
</style>
</head>
<body>
<div id="stage">
  <div id="statsBar">連続 ${streak} 日 ／ コミット ${commitsToday} 件</div>
  <div id="charEl" onclick="handleClick()">
    <img id="charImg" src="${images[mood]}" alt="とん平">
  </div>
  <div id="bubble"></div>
</div>

<script>
  let MOOD       = '${mood}';
  const IMAGES   = ${JSON.stringify(images)};
  const MESSAGES = ${JSON.stringify(messages)};
  const SLEEP_MS = 5 * 60 * 1000;

  // speed: px/frame, bobH: px height, bobSpeed: rad/frame, squash: max scale delta
  const CFG = {
    idle:       { speed: 0.35, bobH: 5,  bobSpeed: 0.055, squash: 0.08 },
    happy:      { speed: 0.9,  bobH: 7,  bobSpeed: 0.055, squash: 0.07 },
    very_happy: { speed: 1.5,  bobH: 11, bobSpeed: 0.075, squash: 0.09 },
    sad:        { speed: 0.15, bobH: 1,  bobSpeed: 0.018, squash: 0.02 },
  };

  const CHAR_SIZE = 90;
  const charEl  = document.getElementById('charEl');
  const imgEl   = document.getElementById('charImg');
  const bubbleEl= document.getElementById('bubble');

  let posX       = 20;
  let dirX       = 1;       // +1 = right, -1 = left
  let bobTime    = 0;
  let displayState = MOOD;  // current visual state
  let isAnimating  = false;
  let sleepTimer   = null;
  let bubbleTimer  = null;

  function maxX() { return window.innerWidth - CHAR_SIZE; }

  function showBubble(text) {
    clearTimeout(bubbleTimer);
    bubbleEl.textContent = text;
    // position above character
    const bx = Math.min(posX, window.innerWidth - 120);
    const by = window.innerHeight - CHAR_SIZE - 50;
    bubbleEl.style.left = bx + 'px';
    bubbleEl.style.top  = by + 'px';
    bubbleEl.classList.add('visible');
    bubbleTimer = setTimeout(() => bubbleEl.classList.remove('visible'), 2500);
  }

  function applyTransform(flipX, bobY, scaleX, scaleY) {
    imgEl.style.transform =
      'translateY(' + bobY + 'px) scaleX(' + (flipX * scaleX) + ') scaleY(' + scaleY + ')';
  }

  function frame() {
    if (displayState === 'clicked' || displayState === 'sleeping') {
      requestAnimationFrame(frame);
      return;
    }

    const cfg = CFG[MOOD];

    // horizontal movement
    posX += dirX * cfg.speed;
    if (posX <= 0)       { posX = 0;      dirX =  1; }
    if (posX >= maxX())  { posX = maxX(); dirX = -1; }
    charEl.style.left = posX + 'px';

    // bob
    bobTime += cfg.bobSpeed;
    const bobProgress = Math.abs(Math.sin(bobTime)); // 0=ground, 1=peak
    const bobY  = -bobProgress * cfg.bobH;
    const sq    = cfg.squash * (1 - bobProgress);    // squash most on landing
    const scaleX = 1 + sq;
    const scaleY = 1 - sq;

    // flip: character faces left naturally → flip when going right
    const flipX = dirX > 0 ? -1 : 1;

    applyTransform(flipX, bobY, scaleX, scaleY);

    requestAnimationFrame(frame);
  }

  function scheduleSleep() {
    clearTimeout(sleepTimer);
    sleepTimer = setTimeout(() => {
      if (!isAnimating) {
        displayState = 'sleeping';
        imgEl.src = IMAGES['sleeping'];
        imgEl.style.transform = 'scaleX(1) scaleY(1)';
        imgEl.style.animation = 'breath 3.5s ease-in-out infinite';
      }
    }, SLEEP_MS);
  }

  function handleClick() {
    if (isAnimating) return;
    isAnimating = true;
    clearTimeout(sleepTimer);

    const wasSleeping = displayState === 'sleeping';
    imgEl.style.animation = '';

    displayState = 'clicked';
    imgEl.src = IMAGES['clicked'];
    applyTransform(1, 0, 1, 1); // forward-facing, no flip

    const msg = wasSleeping ? '！？（びっくり起床）' : MESSAGES[MOOD] || 'ぽよ！';
    showBubble(msg);

    // clicked pop: scale up then back
    let t = 0;
    const POP_FRAMES = [
      [1.35, -7, 0.92, 1.08],
      [0.88,  3, 1.18, 0.80],
      [1.12, -3, 0.96, 1.04],
      [0.96,  1, 1.03, 0.97],
      [1.00,  0, 1.00, 1.00],
    ];
    function popStep() {
      if (t >= POP_FRAMES.length) {
        displayState = MOOD;
        imgEl.src = IMAGES[MOOD];
        isAnimating = false;
        scheduleSleep();
        vscode.postMessage({ type: 'requestUpdate' }); // クリック後に最新情報を要求
        return;
      }
      const [sc, ty, sx, sy] = POP_FRAMES[t++];
      imgEl.style.transform = 'scale(' + sc + ') translateY(' + ty + 'px) scaleX(' + sx + ') scaleY(' + sy + ')';
      setTimeout(popStep, 80);
    }
    popStep();
  }

  // breathing animation for sleep (injected as style)
  const style = document.createElement('style');
  style.textContent = '@keyframes breath { 0%,100%{transform:scaleX(1.04) scaleY(0.97) translateY(2px)} 50%{transform:scaleX(1) scaleY(1) translateY(0)} }';
  document.head.appendChild(style);

  requestAnimationFrame(frame);
  scheduleSleep();

  // 拡張機能からの更新を受信
  window.addEventListener('message', event => {
    const { commitsToday, mood } = event.data;
    document.getElementById('statsBar').textContent =
      '連続 ${streak} 日 ／ コミット ' + commitsToday + ' 件';
    if (mood !== MOOD && displayState !== 'clicked' && displayState !== 'sleeping') {
      MOOD = mood;
      imgEl.src = IMAGES[MOOD];
    }
  });
</script>
</body>
</html>`;
}

class TompeiViewProvider implements vscode.WebviewViewProvider {
  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly mood: Mood,
    private readonly streak: number,
    private readonly commitsToday: number
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _ctx: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'images')],
    };
    webviewView.webview.html = getWebviewContent(
      webviewView.webview,
      this.extensionUri,
      this.mood,
      this.streak,
      this.commitsToday
    );

    const sendUpdate = () => {
      const newCommits = countTodayCommits();
      const newMood = determineMood(this.streak, false, newCommits);
      webviewView.webview.postMessage({ commitsToday: newCommits, mood: newMood });
    };

    // クリック時にwebviewからリクエストが来たら更新
    webviewView.webview.onDidReceiveMessage(msg => {
      if (msg.type === 'requestUpdate') sendUpdate();
    });

    // 5分ごとにも自動更新
    const poll = setInterval(sendUpdate, 5 * 60 * 1000);
    webviewView.onDidDispose(() => clearInterval(poll));
  }
}

export function activate(context: vscode.ExtensionContext) {
  const { streak, sadBecauseStreakBroke } = updateStreak(context);
  const commitsToday = countTodayCommits();
  const mood = determineMood(streak, sadBecauseStreakBroke, commitsToday);

  const provider = new TompeiViewProvider(context.extensionUri, mood, streak, commitsToday);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('tompei.view', provider)
  );
}

export function deactivate() {}
