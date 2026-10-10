# Prism Browser Community

[English](README.md) | [简体中文](README.zh-CN.md) | **[繁體中文](README.zh-TW.md)** | [Русский](README.ru.md) | [Tiếng Việt](README.vi.md) | [ไทย](README.th.md) | [Português (Brasil)](README.pt-BR.md)

[Français](README.fr.md) | [Українська](README.uk.md) | [Español](README.es.md) | [Türkçe](README.tr.md) | [日本語](README.ja.md) | [हिन्दी](README.hi.md)

作者：[DFarm](https://x.com/DFarm_club) · 官網：[prismbrowser.app](https://prismbrowser.app/)

Prism Browser 是以自訂 Chromium 為基礎的本機指紋瀏覽器環境管理器。每個環境都有獨立的 Cookie、快取、擴充功能資料、代理設定與指紋設定，可用來管理多個彼此隔離的瀏覽器身分。

環境資料、Cookie、代理憑證與瀏覽紀錄預設保存在使用者自己的裝置上。Community 版免費使用，不限制本機環境數量。

## 原始碼維護說明

本儲存庫將持續公開，供學習、檢閱與社群自行建置使用。自 `v0.3.17` 起，產品版的新功能、修正與後續原始碼不再定期同步至此。隨著桌面應用程式、指紋核心、跨平台封裝及 Pro 功能愈來愈複雜，同時維護多條分支帶來了較高的開發與測試成本。

本次例外移植了 0.3.19 的通用多語言支援，並翻譯既有公開介面；不包含 Pro 私有執行階段、授權服務、新增 Pro 功能或私有發佈設定，也不代表恢復產品原始碼的持續同步。

既有原始碼、提交紀錄與歷史版本會保留。最新功能、修正與安裝程式請參閱[官網](https://prismbrowser.app/)及 [Releases](../../releases)。

## 語言

桌面介面與 README 提供 **13 種語言**：簡體中文、繁體中文、英語、俄語、越南語、泰語、巴西葡萄牙語、法語、烏克蘭語、西班牙語、土耳其語、日語及印地語。可使用頁首連結切換 README 語言。

- 首次啟動依系統首選顯示語言匹配；不支援或無法讀取時使用英語。
- 可用右上角選單即時切換；手動選擇儲存在本機，之後啟動會優先採用。
- 介面語言與環境指紋語言、時區彼此獨立；切換不會清除名稱、備註、標籤或尚未儲存的編輯內容。
- 翻譯詞庫隨程式提供，無須線上翻譯。貢獻方式請參閱[多語言開發說明（中文／英文）](docs/localization.md)。

## 下載與開始使用

從 [Releases](../../releases) 下載適合系統的版本：macOS 可選 DMG 或 ZIP，Windows 可選安裝程式或免安裝 Portable 版。發佈套件包含可直接使用的 Chromium 144 指紋核心，一般使用者不必自行編譯。

若系統攔截未簽署的版本，macOS 可在「系統設定 → 隱私權與安全性」確認開啟；Windows 可在 SmartScreen 選擇「其他資訊 → 仍要執行」。僅從本專案 Releases 下載，並核對發佈說明提供的 SHA-256。

1. 開啟 Prism Browser，選擇新增環境。
2. 設定名稱，以及所需的系統、語言、時區、螢幕與硬體身分。
3. 不需要代理時使用直接連線；否則輸入代理協定、主機、連接埠及憑證，並測試連線。
4. 儲存環境後開啟。關閉視窗後，Cookie、快取、書籤與擴充功能資料仍保留在該環境中。

每個環境使用獨立資料目錄。複製環境會保留設定，同時產生新的環境身分與種子。

## 功能

全部功能都在本機執行，沒有帳號、訂閱或啟用。本機自動化 API、排程任務與本機 AI · MCP 控制都屬於免費版本，指紋核心隨應用程式提供。

Community 提供不限數量的本機環境、獨立瀏覽資料、HTTP／HTTPS／SOCKS5 代理與 WebRTC 防洩漏。可設定 User-Agent、語言、時區、螢幕、CPU、記憶體及 GPU 身分，並維持 Canvas、WebGL、Audio、DOMRect、字型、Speech 與 WebGPU 的一致性。

另支援複製、分組、標籤、收藏、批次操作、資源回收筒，以及 Cookie、單一環境和完整工作區的本機遷移。macOS Dock 與 Windows 工作列圖示可顯示環境編號。

## 驗證範圍

專案使用 Pixelscan、CreepJS、BrowserLeaks、IPhey，以及 Prism 指紋矩陣和環境資料稽核工具，檢查身分一致性、相同種子重新啟動的穩定性、不同種子的隔離、iframe／Worker 一致性及儲存持久性。

第三方測試會變動，無法保證永久通過所有測試。代理品質、IP 信譽、遠端桌面、系統字型與實際硬體也會影響結果。

## 開發與自行建置

需要 Node.js 22 以上、npm 與平台的基本建置工具。在儲存庫根目錄執行：

```bash
# 安裝、檢查與建置
npm ci
npm run typecheck
npm run build

# 開發模式
npm run dev

# macOS 封裝
npm run dist:mac

# Windows 封裝
npm run dist:win
```

這些封裝指令不包含指紋核心。自行編譯 Chromium 144 建議準備 32 GB 記憶體及約 300 GB SSD 空間，並使用不含空格的短路徑。

- macOS arm64：需要 Xcode、Git、Python 3、Ninja 與 APFS 磁碟。請先接受 Xcode 授權；參閱[建置指南](tools/macos-kernel/README.md)。
- Windows x64：需要 Windows 10／11、Visual Studio 的 C++ 桌面開發工具、Windows SDK、Git、Python 3 與 NTFS 磁碟。建議使用乾淨的 Python 虛擬環境；參閱[建置指南](tools/windows-kernel/README.md)。

固定版本、上游提交、修補順序及 SHA-256 位於 `tools/kernel-lock.json`，共用修補位於 `tools/kernel-patches`。建置中斷後可重新執行平台的 `Build-Kernel` 指令繼續；產物位於建置根目錄下的 `artifacts/<version>-<platform>`，紀錄位於 `logs`。完整命令另見 [English README](README.md)。

在應用程式的瀏覽器核心管理頁選擇匯入本機建置：macOS 選取 `Chromium.app`，Windows 選取包含 `chrome.exe` 的目錄。匯入後先檢查，再啟用該核心；既有環境的資料與設定會保留。

## 安全回報與授權

請勿在公開 Issue 貼出啟用碼、代理密碼、Cookie、錢包資訊、私密金鑰或含個資的診斷資料。回報時提供去識別化的重現步驟、版本、平台與影響。指紋檢測分數變化不一定是安全漏洞；請附上測試網站、時間、核心版本及失敗欄位。

Prism Browser Community 自有程式碼採用 [MIT License](LICENSE)。Chromium、Electron 及其他第三方元件仍適用各自授權；散佈 Chromium 時必須保留相關 `LICENSE`、`LICENSES` 與聲明。原始碼授權不自動授予 Prism 名稱、標誌與圖示的商標使用權。

僅限合法且經授權的瀏覽器隔離、自動化測試、隱私研究及帳號管理用途，並遵守目標網站條款與當地法律。

## Star 歷史

[![Prism Browser Community Star History](https://api.star-history.com/svg?repos=DFarm6/Prism-Browser-Community&type=Date)](https://www.star-history.com/#DFarm6/Prism-Browser-Community&Date)
