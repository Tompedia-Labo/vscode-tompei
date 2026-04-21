# とん平 for VS Code

とん平があなたのコーディングを見守ってくれる VS Code 拡張機能です。

## 機能

- エクスプローラーの「とん平の部屋」タブにとん平が表示されます
- VS Code を開いた**連続日数**と**今日のコミット数**によって気分が変わります
- 左右をふわふわ歩き回ります
- 5分間操作がないと寝ます（クリックで起こせます）

### 気分の変化

| 気分 | 条件 |
|------|------|
| very_happy | 連続7日以上 または 今日のコミット5件以上 |
| happy | 連続3日以上 または 今日のコミット3件以上 |
| idle | それ以外（デフォルト） |
| sad | 連続記録が途切れたとき |

## インストール方法

ターミナルで以下のコマンドを実行してください（初回・アップデート共通）：

```bash
curl -L -o /tmp/vscode-tompei.vsix https://github.com/Tompedia-Labo/vscode-tompei/releases/latest/download/vscode-tompei.vsix && code --install-extension /tmp/vscode-tompei.vsix && rm /tmp/vscode-tompei.vsix
```

または、[Releases](https://github.com/Tompedia-Labo/vscode-tompei/releases/latest) ページから `vscode-tompei.vsix` をダウンロードして：

1. VS Code を開く
2. 拡張機能タブの `...` →「VSIXからインストール...」を選択
3. ダウンロードしたファイルを選択

### インストール後

- エクスプローラー（Cmd+Shift+E）を開くと「とん平の部屋」タブが表示されます
- タブが見当たらない場合はエクスプローラー内を右クリック →「とん平の部屋」にチェックを入れてください

## 使い方

- **クリック** → とん平がリアクションします
- **5分放置** → とん平が寝ます。クリックで起こせます
- 毎日 VS Code を開くと連続日数が増え、とん平が喜びます

---

## 開発者の方へ

### 開発環境のセットアップ

```bash
git clone https://github.com/Tompedia-Labo/vscode-tompei.git
cd vscode-tompei
npm install
```

### デバッグ実行

VS Code でこのフォルダを開き、`F5` を押すと拡張機能開発ホストが起動します。エクスプローラーに「とん平の部屋」が表示されれば成功です。

### 気分を強制指定してデバッグする

[src/extension.ts](src/extension.ts) の `determineMood` 関数を一時的に書き換えることで任意の気分で確認できます：

```typescript
function determineMood(...): Mood {
  return 'happy'; // DEBUG: force mood
}
```

確認後は元に戻してください。

### ビルド

```bash
npm run compile
```

### ローカルへのインストール

```bash
npx vsce package --out vscode-tompei.vsix --allow-missing-repository && code --install-extension vscode-tompei.vsix && rm vscode-tompei.vsix
```

### ブランチ運用

- **develop** — 普段の開発はこのブランチで行います
- **main** — リリース時のみ develop からマージします

```bash
# 開発時
git checkout develop
# ... 開発・コミット ...
git push origin develop
```

### リリース手順

1. `package.json` の `version` を更新（例: `0.1.0` → `0.2.0`）
2. develop ブランチでコミット・プッシュ
3. main にマージしてタグを打つ

```bash
git checkout main
git merge develop
git push origin main

git tag v0.2.0
git push origin v0.2.0
```

GitHub Actions が自動で .vsix をビルドし、Releases ページに公開されます。

### プロジェクト構成

```
vscode-tompei/
├─ src/
│  └─ extension.ts   # 拡張機能本体
├─ images/
│  ├─ idle.png
│  ├─ happy.png
│  ├─ very_happy.png
│  ├─ sad.png
│  ├─ clicked.png
│  ├─ sleeping.png
│  └─ icon.svg       # Activity Bar アイコン
├─ .github/
│  └─ workflows/
│     └─ release.yml # リリース自動化
├─ package.json
└─ tsconfig.json
```
