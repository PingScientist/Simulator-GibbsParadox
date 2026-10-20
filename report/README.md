# LaTeX 報告來源

`latex/main.tex` 是四頁繁體中文報告的可編輯來源。正文行內與展示公式均使用 LaTeX 數學環境，圖表由 PGFPlots 以實際數據繪製；PDF 文字可選取，公式與圖表皆為向量內容。

## 建置

需要 Python、pypdf 與 Tectonic。從專案根目錄執行：

```sh
python3 scripts/build_report.py
```

建置會先由 `scripts/prepare_report_data.py` 讀取 `results/experiment-summary.json`、`results/timeseries.csv` 與驗證紀錄，更新 `latex/generated/data.tex` 及 `mixing-curves.dat`，再以 Tectonic 編譯整份文件。缺少數據、紀錄未通過驗證、頁數不等於四頁、缺字或文字溢出時，建置會停止，不取代既有交付檔。

Tectonic 可在 PATH 中，也可用 `--tectonic /path/to/tectonic` 或環境變數 `TECTONIC` 指定。macOS 安裝包含 Tectonic 的 ChatGPT app 時，腳本也會尋找其內附引擎。首次編譯需網路下載標準 TeX 套件；快取完整後可加 `--only-cached` 離線建置。若需指定快取位置，使用 `TECTONIC_CACHE_DIR`。

繁體中文優先使用 Songti TC，無此字型時改用 TeX 的 Fandol Song。也可在其他支援 XeLaTeX 的環境編譯 `latex/main.tex`；需要先保留或產生 `generated/` 的資料檔。

## 編修與檢查

- 修改文字或公式：編輯 `latex/main.tex`。
- 更新實驗：先執行 `node scripts/run_experiments.cjs`，再重建 PDF；不要手動修改生成的表格數據。
- 使用 Codex 內建 LaTeX 編輯器時，開啟 `report/latex/` 資料夾即可編輯與預覽；對外交付檔仍由建置腳本匯出。
- 完成編譯後須將四頁渲染成影像，逐頁檢查公式、表格、圖例、字型及頁邊界。編譯成功不等於版面已驗證。

最終交付檔：`output/pdf/Gibbs_Paradox_Report.pdf`。報告依序為模型與操作、計算與實驗結果、兩題回答、驗證與來源。提交作業只需此 PDF 與根目錄的 `index.html`。
