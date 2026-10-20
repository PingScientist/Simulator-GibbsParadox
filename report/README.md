# PDF 報告來源

`report_source.json` 是四頁繁體中文報告的可編輯文字與公式來源。`scripts/build_report.py` 使用 ReportLab 產生可選取文字、嵌入字型及原生向量圖表的 PDF，讀取 `results/experiment-summary.json` 和 `results/timeseries.csv` 的實際資料；資料不存在或未通過基本驗證時會停止，不會填入虛構結果。

建置順序：先執行專案實驗，再執行 `python3 scripts/build_report.py`。需要 ReportLab 及 pypdf，並可透過 `REPORT_CJK_FONT` 指定支援繁體中文的 TrueType 字型。預設使用 macOS Arial Unicode。

最終交付檔：`output/pdf/Gibbs_Paradox_Report.pdf`。建置固定四頁，任何段落越界都會直接報錯；完成後仍須渲染並檢查四頁版面。原始 JSON、實驗資料及建置程式保留供重現，提交作業只需 HTML 與 PDF。
