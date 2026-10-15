# draft-pane

[English](README.md)

[![test](https://github.com/meganemura/draft-pane/actions/workflows/test.yml/badge.svg)](https://github.com/meganemura/draft-pane/actions/workflows/test.yml)

Claude Code の plugin（Claude Mod）である。skill の `draft-pane:draft` は、頼まれた下書きを Claude に
ブロックの中へ書かせる。ペインは、まだ返事をしていない最新の下書きを表示する。利用者は、範囲をドラッグして
コメントを書く、下書き全体に 1 つコメントを書く、または承認する。1 回の Submit で、すべてのコメントを、
各範囲を引用した 1 つのプロンプトとして送る。目的は、その場でフィードバックを返し、往復の回数を減らすこと
である。

## 見た目

```
D3 README, the Install section
## Install
Run the two commands below.
[ x ] > Run the two commands below.  1 sentence is enough
The first one adds the marketplace, the second one installs the plugin.
> the second one installs the plugin
comment: [        ]
[ whole draft ] [ Approve ] [ Submit ]  1 comment
```

## 必要なもの

- Claude Code 2.1.273 以降と、`CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`
- ターミナルのセッション、または Claude Code Desktop の Code タブ。プリントモード（`-p`）にはペインが無い。

## インストール

```sh
claude plugin marketplace add meganemura/draft-pane
claude plugin install draft-pane@draft-pane
```

チェックアウトした作業ツリーで開発するときは、その作業ツリーから plugin を読み込む。

```sh
CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude --plugin-dir /path/to/draft-pane/plugin
```

`CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` を毎回のセッションで設定するには、`settings.json` の `env` に書く。

```json
{
  "env": {
    "CLAUDE_CODE_ENABLE_FUNCTION_HOOKS": "1"
  }
}
```

### Claude Code Desktop

ペインは Claude Code Desktop の Code タブにも描かれる。上のコマンドで user スコープにインストールした
plugin は、デスクトップアプリでも読み込まれる。デスクトップアプリでは `/plugin` が動かない。アプリから
インストールするときは、プロンプト欄の横の + から Plugins を開き、Add marketplace で
`meganemura/draft-pane` を追加してから Add plugin を選ぶ。

デスクトップでは、アプリが描けるものを使ってペインを描く。

- 各下書きは 1 枚のカードになり、番号、タイトル、行数・語数・文字数を表示する。
- 下書きの表示は 3 つある。`Comment`（ターミナルと同じく、テキストをドラッグしてコメントする）、
  `Preview`（下書きを Markdown として描く。Markdown でもテキストでもないファイルの下書きは、
  シンタックスハイライト付きのコードとして描く）、`Changes from D<n>`（この下書きが改訂した下書きとの
  差分。両方がトランスクリプトにあり、どちらもファイルの下書きでないときに出る）。
- 改訂した下書きには、それより前の下書きの流れを点で描く。点にポインタを乗せると、その下書きの
  タイトルが出る。
- タブの下の帯は、下書きのどこにコメントが付いているかを示す。印にポインタを乗せると、そのコメントが出る。
- 各コメントは `Remove` ボタン付きのカードになる。ファイルの下書きは、そのファイルへのリンクを出す。

ターミナルのペインは [使い方](#使い方) のとおりで、変わらない。

デスクトップアプリは `--plugin-dir` を受け取らない。デスクトップでチェックアウトした作業ツリーを
使って開発するときは、`~/.claude/settings.json` の `env` に次を書く。

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "/path/to/draft-pane/plugin",
    "CLAUDE_CODE_PLUGIN_DIR_WATCH": "1"
  }
}
```

## 使い方

`/draft-pane:draft <下書きにしたいもの>` で始める。`/draft-pane` はペインを表示または非表示にし、
キーボードのフォーカスをペインに渡す。下書きの範囲をマウスでドラッグすると、その範囲が終わる行の
すぐ下に、引用した範囲の行が出る。その下に `comment` という入力欄が出る。コメントを入力して Enter を
押すと追加される。空のまま Enter を押すと、その範囲を捨てる。追加したコメントは、引用した語句の行の
すぐ下に、下書きでのその行の順に並ぶ。すでにコメントが付いた行をまたいで選択することはできない。
2 つのコメントの間の行の中でドラッグする。`whole draft` を押すと、下書き全体への 1 つのコメントの
入力欄が開く。入力して Enter を押すと追加される。もう一度ボタンを押して入力し直すと、前のコメントを
置き換える。コメントの横の `x` を押すと、そのコメントを消す。`Submit` を押すとすべてのコメントを送り、
`Approve` を押すと承認を送る。どちらも、Enter で追加していないテキストが入力欄に残っている間は送らない。
矢印キーでコントロール間を移動し、Enter で押し、Esc でフォーカスをプロンプト欄に戻す。一度ペインを
表示すると、それ以降は下書きが届いたときにキーボードを奪わずにペインが自動で開く。止めるときは
`/draft-pane` でペインを隠す。

## draft ブロック

plugin の skill は、各下書きを `draft` というラベルのフェンス付きブロックの中に書く。

```draft
D3: README, the Install section
## Install

Run the two commands below. The first one adds the marketplace, the second one installs the plugin.
```

1 行目は `D<n>: <タイトル>` である。その後の行が下書きの本文である。番号は会話全体で 1 つの連番で、
再利用しない。改訂は新しい番号の新しいブロックで、1 行目は `D<m> (revises D<n>): <タイトル>` になる。
ペインは、`draft` ブロックを含む最新のアシスタントメッセージの下書きだけを表示する。後のメッセージが
下書きを出すと、返事をしたかどうかにかかわらず、古い下書きはペインから消える。

下書きがすでにファイルとしてあるときは、ブロックは本文の代わりにそのファイルを指す。

```draft
D5: The article on pane plugins
file: /work/notes/article.md
```

ヘッダのすぐ次の行の `file: <パス>` があると、その下書きはファイルの下書きになる。ブロック内の
それ以降の行は無視する。パスは絶対パスか、セッションの作業ディレクトリからの相対パスである。`~` は
展開しないので、パスは省略せずに書く。macOS では、システムが保護するフォルダ（書類、デスクトップ、
ダウンロード）の下のファイルを最初に読むとき、ターミナルアプリへのアクセス許可のダイアログが出ることが
ある。

## フィードバックのプロンプト

`Submit` を押すと、1 つのプロンプトを送る。

```
Feedback (draft-pane) on D3:
> Run the two commands below.
1 sentence is enough. "below" is not needed.
> the second one installs the plugin
Name the plugin, not "the plugin".
(whole draft) Make the whole section shorter.
```

`> ` の行が範囲の引用で、次の行がコメントである。範囲は下書きに出てくる順に並ぶ。下書き全体への
コメントは最後に来る。

ファイルの下書きでは、2 行目が引用元のファイルを示す。

```
Feedback (draft-pane) on D5:
file: /work/notes/article.md
> a quoted span from the file
Shorten this sentence.
```

## Approve の意味

Approve は `Feedback (draft-pane) on D3:` に続けて `(approved)` を送る。下書きをそのまま使うという
意味である。コメントが残っている間、Approve は送らない。コメントが 0 件のとき、Submit は送らない。
どちらも、Enter で追加していないテキストが入力欄に残っている間は送らない。どの理由かはステータス行に
出る。

## トランスクリプトが正である

ペインが表示する下書きはすべて、アシスタントメッセージの中のテキストである。ペインが送るフィードバックは
すべて、下書きを引用するプロンプトである。plugin をアンインストールした人も、トランスクリプトだけで
すべての下書きとすべてのフィードバックを読める。

## 開発

コミットの前と CI で、3 つのゲートを通す。`claude plugin validate plugin`、
`npx -p typescript tsc -p plugin/hooks`、`CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude plugin
test plugin` である。

## ライセンス

MIT。[LICENSE](LICENSE) を参照。
