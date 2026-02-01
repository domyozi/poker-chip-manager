# PWA化完了！ 🎉

## 📦 追加されたファイル

- `manifest.json` - PWAの設定ファイル
- `sw.js` - Service Worker（オフライン対応）
- `icon.svg` - アイコンのベースSVG
- `poker.html` - PWAメタタグとService Worker登録を追加

## 🎨 アイコン画像の生成

SVGから192pxと512pxのPNG画像を生成する必要があります。

### 方法1: オンラインツール（最速）
1. https://cloudconvert.com/svg-to-png にアクセス
2. `icon.svg` をアップロード
3. サイズを**192x192**に設定 → 変換 → `icon-192.png` として保存
4. 同じ手順で**512x512**に設定 → 変換 → `icon-512.png` として保存

### 方法2: コマンドライン（ImageMagick使用）
```bash
# ImageMagickがインストールされている場合
convert icon.svg -resize 192x192 icon-192.png
convert icon.svg -resize 512x512 icon-512.png
```

### 方法3: Figma / Illustrator / Inkscape
1. `icon.svg` を開く
2. 192x192でPNG書き出し → `icon-192.png`
3. 512x512でPNG書き出し → `icon-512.png`

## 🚀 GitHubにデプロイ

```bash
# 生成したPNG画像を含めて全てpush
git add manifest.json sw.js icon.svg icon-192.png icon-512.png poker.html
git commit -m "Add PWA support"
git push
```

## 📱 インストール方法

デプロイ後、スマホで以下の手順：

### iOS (Safari)
1. https://domyozi.github.io/poker-chip-manager/ を開く
2. 画面下部の**共有ボタン**（□↑）をタップ
3. 「**ホーム画面に追加**」を選択
4. 「追加」をタップ
→ ホーム画面にアプリアイコンが追加される！

### Android (Chrome)
1. https://domyozi.github.io/poker-chip-manager/ を開く
2. メニュー（⋮）から「**ホーム画面に追加**」を選択
3. 「追加」をタップ
→ ホーム画面にアプリアイコンが追加される！

または、アドレスバーに**インストールアイコン**（＋）が表示されるのでタップ。

## ✨ PWAの機能

- ✅ **オフライン動作**: 一度開けば、ネット接続なしでも使える
- ✅ **ホーム画面アイコン**: ネイティブアプリのように起動
- ✅ **全画面表示**: ブラウザUIが消えてアプリ風に
- ✅ **高速起動**: キャッシュにより瞬時に起動

## 🎯 次のステップ

1. PNG画像を生成
2. GitHubにpush
3. スマホでインストール
4. 友達とポーカー！🃏

---

**Note**: manifest.jsonの`start_url`と`scope`は`/poker-chip-manager/`になっています。
もしルートドメインを使う場合は`/`に変更してください。
