# Gibbs 混合實驗室

熱統計物理一 Week 6：Gibbs paradox 與粒子不可分辨性。繁體中文、完全離線、無外部程式依賴的單檔互動實驗，以及四頁 PDF 報告。

## 作業交付

- [`index.html`](index.html)：直接用瀏覽器開啟；不需要伺服器或安裝套件。
- [`output/pdf/Gibbs_Paradox_Report.pdf`](output/pdf/Gibbs_Paradox_Report.pdf)：四頁文字報告，含操作、模型、實際結果、兩題回答、參考與 AI 協作說明。

單獨複製以上兩個檔案即可提交。其他資料是可編輯來源與驗證證據。

## 操作

1. 選擇理想／磁性、A+A／A+B，共四種情境。
2. 設定每側粒子數、T*、C* 與種子；變更參數會重新準備並暫停。
3. 可先保持隔板關閉，按「取樣 100 sweeps」讓初始構型鬆弛。
4. 按「移除隔板，開始混合」。暫停、繼續或「重新準備」均可。
5. 查看理論混合熵基準、來源混合指標 m、位能與左右計數；可下載 CSV、JSON、PNG。JSON 是狀態與資料紀錄，介面不提供還原匯入。

來源顏色只是歷史追蹤；在 A+A 模式啟用顏色不會改變物種。Einstein 固體的計數小實驗位於頁面下方的問答內。

## 物理模型與適用範圍

- 正則系綜 Metropolis Monte Carlo，對稱位置／角度提案，接受率 `min(1, exp(-ΔU/T))`。每 sweep 嘗試更新 N 次。這不是分子動力學或布朗動力學；sweep 不代表物理時間，無法用來估計真實擴散係數或混合速率。
- 二維固定盒子 24σ × 14σ；理想模式是互不作用的點粒子。磁性模式是直徑 σ=1 的硬圓盤，使用完整 r⁻³ 偶極位能，全粒子對計算且無截斷。C*=0 仍有硬核排斥。未開隔板阻擋粒子但不屏蔽偶極作用。
- 長度以 σ、能量以固定 ε 為單位；T*=kBT/ε、C*=C/(εσ³)。UI 位能讀值是 U/(NkBT)。理想粒子的平衡位置分布不隨 T 改變。
- A/B 擁有完全相同的力學參數。等溫、初始同密度、均勻體相的熱力學極限下，A+B 的混合熵基準是 NkB ln2；A+A 沒有廣延組合混合項。
- `m` 是最初兩側來源群的左右分布 Shannon 指標，0 ≤ m ≤ ln2，包含有限樣本波動且不計完整相關性；它不是完整熱力學熵。每群24個理想點粒子均勻平衡時，E[m]=0.67185248。
- 有限粒子數、硬核隔板移除後可達面積的變化、外壁與相關性會造成額外修正；0/ln2 是體相參考，不是有限模擬系統全部熵變的測量結果。有限取樣不能當作平衡收斂證明。

## 重建與驗證

網頁僅需 Node.js：

```sh
node scripts/build.cjs
node --test tests/physics.test.cjs
node scripts/run_experiments.cjs
```

瀏覽器測試需 Playwright 與 Chromium（或設定 `NODE_PATH` 指向既有 Playwright 安裝）：

```sh
node tests/browser.cjs
```

PDF 使用真正 LaTeX 排版，來源為 [`report/latex/main.tex`](report/latex/main.tex)。建置需 Python、pypdf 及 Tectonic；繁體中文優先採用 macOS Songti TC，其他平台使用 Fandol 字型。首次編譯需下載 TeX 套件，之後可用快取離線建置：

```sh
python3 scripts/build_report.py
```

可用 `--tectonic /path/to/tectonic` 指定引擎，或以 `--only-cached` 禁止下載。圖表與數值由 `results/` 自動產生，不需手動抄寫；編譯後會檢查頁數與文字溢出，再更新交付 PDF。詳細流程見 [`report/README.md`](report/README.md)。

正式數據：理想點粒子、C=0 硬核對照、C=1.5 偶極，各配 A+A/A+B 與種子 17、29、43、71、101，共30次運行。每側24顆、T=1，隔板關閉200 sweeps，撤板後4000 sweeps；每20 sweeps記錄，晚期窗為撤板後3000–4000 sweeps。報告誤差為5個種子晚期均值的樣本標準差，不是標準誤。A+A/A+B 配對的機械序列完全相同，不能當成獨立重複樣本。

驗證證據位於 `results/`：原始曲線、實驗彙整、瀏覽器結果、畫面截圖及物理驗證摘要。`tests/physics.test.cjs` 包含能量梯度、雙力矩、頭尾吸引、側向排斥、對稱性、不可穿越隔板、硬核、總能量、種子重現與均勻取樣等測試。介面測試覆蓋離線、四模式、暫停／重設、參數、三種下載、來源顏色、375/768/1440px與減少動態效果設定。

## 來源與製作

參考陳欣佑助教 2026-10-15《Gibbs Paradox & Particle Indistinguishability》及所附三個 HTML 的教學情境。主要沿用混合比較與廣延性的概念；Langmuir 範例僅作背景參考。本專案重新實作物理模型、介面、資料記錄與驗證，未修改助教原始資料。

程式、報告與排版由 OpenAI Codex 協作產生與檢查；實驗數據由本專案程式實際執行。補充理論來源見 PDF，以及 [David Tong 統計物理](https://www.damtp.cam.ac.uk/user/tong/statphys/statmechhtml/S2.html)、[LAMMPS 偶極作用公式](https://docs.lammps.org/pair_dipole.html)、[Jack Simons 第7章](https://simons.hec.utah.edu/ITCSecondEdition/chapter7.pdf)。
