#!/usr/bin/env python3
"""Build a four-page, data-backed Traditional Chinese Gibbs paradox report."""
from __future__ import annotations
import csv
import json
import math
import os
from pathlib import Path
from html import escape
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph, Table, TableStyle
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'report/report_source.json'
SUMMARY = ROOT / 'results/experiment-summary.json'
SERIES = ROOT / 'results/timeseries.csv'
OUTPUT = ROOT / 'output/pdf/Gibbs_Paradox_Report.pdf'
W, H = A4
LEFT, RIGHT, BOTTOM = 44, 44, 44
WIDTH = W - LEFT - RIGHT
INK = colors.HexColor('#18332F')
MUTED = colors.HexColor('#566963')
GREEN = colors.HexColor('#17665D')
TEAL = colors.HexColor('#248A7D')
BLUE = colors.HexColor('#4477AA')
OCHRE = colors.HexColor('#B57D30')
PAPER = colors.HexColor('#F1F6F3')
RULE = colors.HexColor('#CCD9D1')


def numeric(x):
    if not isinstance(x, (int, float)) or not math.isfinite(x):
        raise ValueError(f'Non-finite experiment value: {x!r}')
    return float(x)


def metric(obj, *names):
    for name in names:
        if name in obj:
            return obj[name]
    raise KeyError(f'Expected one of {names}; got {list(obj)}')


def load_data():
    for path in (SOURCE, SUMMARY, SERIES):
        if not path.is_file():
            raise FileNotFoundError(f'Required source/evidence missing: {path}')
    source = json.loads(SOURCE.read_text())
    summary = json.loads(SUMMARY.read_text())
    modes = summary.get('modes', [])
    if not modes or not summary.get('config', {}).get('seeds'):
        raise ValueError('Experiment summary must contain modes and actual seeds')
    for mode in modes:
        if not mode.get('seedResults'):
            raise ValueError('Every mode must contain individual seed results')
    with SERIES.open(newline='') as f:
        series = list(csv.DictReader(f))
    if not series:
        raise ValueError('No timeseries samples')
    checks = summary.get('checks', {})
    if checks.get('failed', 0) or checks.get('passed') is False or checks.get('passed') != checks.get('total'):
        raise ValueError('Experiment checks contain failures')
    return source, summary, series


class Report:
    def __init__(self, source):
        font = os.environ.get('REPORT_CJK_FONT', '/System/Library/Fonts/Supplemental/Arial Unicode.ttf')
        if not Path(font).is_file():
            raise FileNotFoundError('Set REPORT_CJK_FONT to a Traditional Chinese TrueType font')
        pdfmetrics.registerFont(TTFont('ReportCJK', font))
        self.s = source
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        self.c = canvas.Canvas(str(OUTPUT), pagesize=A4, pageCompression=1)
        self.c.setTitle(source['title'])
        self.c.setAuthor('Coursework project; prepared with OpenAI Codex assistance')
        self.c.setSubject('Gibbs paradox, canonical sampling, mixing diagnostics, Einstein solid')
        self.page = 0
        self.y = 0
        self.styles = {
            'body': ParagraphStyle('body',fontName='ReportCJK',fontSize=10.0,leading=16.3,textColor=INK,wordWrap='CJK',spaceAfter=0),
            'small': ParagraphStyle('small',fontName='ReportCJK',fontSize=8.5,leading=13.2,textColor=MUTED,wordWrap='CJK'),
            'equation': ParagraphStyle('equation',fontName='ReportCJK',fontSize=10.1,leading=20.0,textColor=GREEN,wordWrap='CJK',alignment=1),
            'cell': ParagraphStyle('cell',fontName='ReportCJK',fontSize=8,leading=11.5,textColor=INK,wordWrap='CJK'),
            'headcell': ParagraphStyle('headcell',fontName='ReportCJK',fontSize=8,leading=11.5,textColor=GREEN,wordWrap='CJK'),
        }

    def newpage(self, label):
        if self.page:
            self.footer()
            self.c.showPage()
        self.page += 1
        c = self.c
        c.setFillColor(GREEN)
        c.rect(LEFT, H-41, 29, 3, fill=1, stroke=0)
        c.setFont('Helvetica',7.8)
        c.drawString(LEFT+39,H-40,'GIBBS PARADOX / COURSE REPORT')
        c.setFillColor(MUTED)
        c.setFont('Helvetica',7.5)
        c.drawRightString(W-RIGHT,H-40,self.s['date'])
        c.setFillColor(INK)
        c.setFont('ReportCJK',21 if self.page==1 else 18)
        c.drawString(LEFT,H-79,self.s['title'] if self.page==1 else label)
        self.y = H-99
        if self.page==1:
            c.setFont('ReportCJK',10)
            c.setFillColor(MUTED)
            c.drawString(LEFT,self.y,label+'  /  單檔互動網頁與可重現數值實驗')
            self.y -= 23
        else:
            self.y -= 7

    def footer(self):
        c=self.c
        c.setStrokeColor(RULE)
        c.line(LEFT,35,W-RIGHT,35)
        c.setFillColor(MUTED)
        c.setFont('ReportCJK',7)
        c.drawString(LEFT,23,'熱統計物理一 · Week 6 · Gibbs paradox')
        c.setFont('Helvetica',7)
        c.drawRightString(W-RIGHT,23,f'{self.page} / 4')

    def para(self,text,kind='body',gap=8,indent=0):
        p=Paragraph(text,self.styles[kind])
        _,h=p.wrap(WIDTH-indent,1000)
        if self.y-h < BOTTOM:
            raise ValueError(f'Page {self.page} overflows by {BOTTOM-(self.y-h):.1f} pt: {text[:75]}')
        p.drawOn(self.c,LEFT+indent,self.y-h)
        self.y-=h+gap
        return h

    def section(self,title):
        self.y-=5
        self.c.setFillColor(GREEN)
        self.c.setFont('ReportCJK',11)
        self.c.drawString(LEFT,self.y,title)
        self.y-=20

    def equation(self,text):
        p=Paragraph(text,self.styles['equation'])
        _,h=p.wrap(WIDTH-16,1000)
        if self.y-h-12 < BOTTOM:
            raise ValueError(f'Equation overflows on page {self.page}')
        self.c.setFillColor(PAPER)
        self.c.roundRect(LEFT,self.y-h-12,WIDTH,h+12,4,fill=1,stroke=0)
        p.drawOn(self.c,LEFT+8,self.y-h-6)
        self.y-=h+20

    def table(self,rows,widths):
        styled=[]
        for j,row in enumerate(rows):
            styled.append([Paragraph(str(v),self.styles['headcell' if j==0 else 'cell']) for v in row])
        t=Table(styled,colWidths=widths,hAlign='LEFT')
        t.setStyle(TableStyle([
            ('BACKGROUND',(0,0),(-1,0),PAPER),
            ('LINEBELOW',(0,0),(-1,0),0.7,RULE),
            ('LINEBELOW',(0,1),(-1,-1),0.35,RULE),
            ('VALIGN',(0,0),(-1,-1),'MIDDLE'),
            ('LEFTPADDING',(0,0),(-1,-1),7),
            ('RIGHTPADDING',(0,0),(-1,-1),7),
            ('TOPPADDING',(0,0),(-1,-1),6),
            ('BOTTOMPADDING',(0,0),(-1,-1),6),
        ]))
        _,height=t.wrap(WIDTH,1000)
        if self.y-height < BOTTOM:
            raise ValueError('Result table overflows')
        t.drawOn(self.c,LEFT,self.y-height)
        self.y-=height+9

    def chart(self,series,summary,height=176):
        seed=int(summary['config']['seeds'][0])
        groups=[]
        labels={'ideal':'理想點粒子','hardcore':'硬核 C=0','dipole':'偶極作用'}
        for interaction,col in [('ideal',BLUE),('hardcore',OCHRE),('dipole',TEAL)]:
            candidates=[m for m in summary['modes'] if m.get('identity')=='AB' and m.get('interaction')==interaction]
            if not candidates:
                continue
            name=candidates[0]['mode']
            # caseId disambiguates zero/nonzero-coupling instances using the same engine mode.
            case_id=candidates[0].get('caseId',candidates[0].get('id',name))
            pts=[]
            for row in series:
                rowid=row.get('case',row.get('caseId',row.get('id',row.get('mode'))))
                if row.get('phase') and row['phase'] != 'open':
                    continue
                if rowid not in (case_id,name) or int(row['seed'])!=seed:
                    continue
                if row.get('interaction') and row['interaction']!=interaction:
                    continue
                y=float(metric(row,'originMixingPerParticle','mixingPerParticle','labelMixingPerParticle'))
                x=float(row['sweep'])
                if math.isfinite(x) and math.isfinite(y):
                    pts.append((x,y))
            if pts:
                groups.append((labels[interaction],col,sorted(pts)))
        if not groups:
            raise ValueError('No AB timeseries suitable for report plot')
        top=self.y
        left=LEFT+36; right=W-RIGHT-8; bottom=top-height+23
        plot_top=top-42
        max_x=max(p[0] for _,_,ps in groups for p in ps)
        max_y=0.74
        c=self.c
        c.setFont('ReportCJK',8)
        c.setFillColor(MUTED)
        c.drawString(LEFT,top-8,f'來源分布指標 m　/　seed {seed}')
        for yy in (0,0.2,0.4,0.6):
            y=bottom+(plot_top-bottom)*yy/max_y
            c.setStrokeColor(RULE);c.setLineWidth(.35);c.line(left,y,right,y)
            c.setFillColor(MUTED);c.setFont('Helvetica',7);c.drawRightString(left-7,y-2.4,f'{yy:.1f}')
        yy=math.log(2)
        y=bottom+(plot_top-bottom)*yy/max_y
        c.setStrokeColor(MUTED);c.setDash(3,3);c.line(left,y,right,y);c.setDash()
        c.setFont('Helvetica',7);c.drawRightString(right,y+3,'ln 2')
        for label,col,pts in groups:
            c.setStrokeColor(col);c.setLineWidth(1.2)
            path=c.beginPath()
            for i,(xx,yy) in enumerate(pts):
                px=left+(right-left)*xx/max_x
                py=bottom+(plot_top-bottom)*yy/max_y
                (path.moveTo if i==0 else path.lineTo)(px,py)
            c.drawPath(path)
        for xx in (0,max_x/2,max_x):
            x=left+(right-left)*xx/max_x
            c.setFillColor(MUTED);c.setFont('Helvetica',7);c.drawCentredString(x,bottom-12,f'{xx:.0f}')
        c.setFont('Helvetica',7);c.drawRightString(right,bottom-23,'MC sweeps')
        lx=left+5
        for label,col,_ in groups:
            c.setStrokeColor(col);c.setLineWidth(1.5);c.line(lx,top-25,lx+13,top-25)
            c.setFillColor(INK);c.setFont('ReportCJK',7.5);c.drawString(lx+17,top-28,label)
            lx+=112
        self.y=top-height-6

    def save(self):
        self.footer();self.c.save()
        reader=PdfReader(OUTPUT)
        if len(reader.pages)!=4:
            raise ValueError(f'Expected exactly four pages, got {len(reader.pages)}')
        text='\n'.join(p.extract_text() or '' for p in reader.pages)
        for needle in ('不可分辨','Einstein','Metropolis','N!'):
            if needle not in text:
                raise ValueError(f'PDF text extraction missing {needle!r}')
        print(f'{OUTPUT}\n4 pages; {len(text)} extractable characters; actual results loaded.')


def fmean(stat, scale=1):
    mean=numeric(metric(stat,'mean')) * scale
    std=numeric(metric(stat,'sampleStd','std','sd')) * abs(scale)
    return f'{mean:.3f} ± {std:.3f}'


def main():
    src,summary,series=load_data()
    r=Report(src)
    p=src['page1'];r.newpage(p['title']);r.para(p['lead'])
    r.section('操作流程')
    for i,t in enumerate(p['operation'],1):r.para(f'{i}　{t}',gap=5)
    r.section('物理模型與單位');r.para(p['model']);r.equation(p['potential']);r.para(p['potential_note'],kind='small')
    r.section('如何計算');r.para(p['sampling']);r.equation(p['acceptance']);r.para(p['units'],kind='small')

    p=src['page2'];r.newpage(p['title']);r.para(p['metric']);r.equation(p['metric_equation']);r.para(p['reference'])
    config=summary['config']
    seeds=', '.join(map(str,config['seeds']))
    protocol=(f"每側 {config['nPerSide']} 顆，T={config.get('temp',1):g}；偶極 C={config.get('coupling',1.5):g}。種子 {seeds}。"
              f"隔板關閉取樣 {config['closedBurnSweeps']} sweeps，撤板後 {config['openSweeps']} sweeps，"
              f"每 {config['sampleEvery']} sweeps 記錄；晚期窗從 {config['lateWindowStart']} sweeps 開始。")
    r.para(protocol,kind='small',gap=8)
    r.chart(series,summary,height=184)
    r.para(p['caption'],kind='small',gap=9)
    rows=[['模型（A+B）','晚期來源指標 m','晚期 U / (Nk<sub>B</sub>T)','體相 ΔS / NkB']]
    labels={'ideal':'理想點粒子','hardcore':'硬核 C=0','dipole':'磁偶極硬圓盤'}
    for interaction in ('ideal','hardcore','dipole'):
        modes=[m for m in summary['modes'] if m.get('identity')=='AB' and m.get('interaction')==interaction]
        if not modes:continue
        a=modes[0]['acrossSeeds']
        rows.append([labels[interaction],fmean(metric(a,'originMixingPerParticle','mixingPerParticle','labelMixingPerParticle')),fmean(a['energyPerParticle'], scale=1/config['temp']),'A+B: ln 2<br/>A+A: 0'])
    r.table(rows,[117,135,135,WIDTH-387])
    finite_mean = numeric(summary['originDiagnosticReference']['finiteNIdealEquilibriumMean'])
    table_note = p['table_note'].replace('{nPerSide}', str(config['nPerSide'])).replace('{finiteMean}', f'{finite_mean:.5f}')
    r.para(table_note,kind='small',gap=0)

    p=src['page3'];r.newpage(p['title']);r.section(p['q1_title']);r.para(p['q1_a']);r.equation(p['q1_eq']);r.para(p['q1_b']);r.equation(p['mix_eq']);r.para(p['q1_c']);r.para(p['q1_d']);r.section(p['q2_title']);r.para(p['q2_a']);r.equation(p['q2_eq']);r.para(p['q2_b'])

    p=src['page4'];r.newpage(p['title']);r.section('驗證與範圍');r.para(p['validation'])
    checks=summary.get('checks',{})
    # Print evidence supplied by the experiment script without inventing test counts.
    checks_text=[]
    for key,value in checks.items():
        if isinstance(value,bool):checks_text.append(f'{escape(key)}：'+('通過' if value else '未通過'))
        elif isinstance(value,(int,float,str)):checks_text.append(f'{escape(key)}：{escape(str(value))}')
    if 'passed' in checks and 'total' in checks:
        r.para(f"實驗紀錄檢查：{checks['passed']} / {checks['total']} 項通過。各 A+A / A+B 配對採用相同種子，構型取樣序列一致；它們不是兩組獨立樣本。",kind='small')
    elif checks_text:r.para('實驗紀錄檢查：'+'；'.join(checks_text)+'。',kind='small')
    browser_path=ROOT/'results/browser-checks.json'
    if browser_path.exists():
        browser=json.loads(browser_path.read_text())
        if browser.get('passed') != browser.get('total'):
            raise ValueError('Browser checks did not all pass')
        r.para(f"介面操作：{escape(browser.get('browser','Browser'))} {browser['passed']} / {browser['total']} 項通過，涵蓋離線操作、控制與匯出，以及桌機、平板與手機版面。",kind='small')
    validation_path=ROOT/'results/validation-summary.json'
    if validation_path.exists():
        validation=json.loads(validation_path.read_text())
        if validation.get('failed',0):raise ValueError('Validation summary reports failures')
        if isinstance(validation.get('summary'),str):r.para(escape(validation['summary']),kind='small')
        elif 'passed' in validation and 'total' in validation:r.para(f"自動驗證：{validation['passed']} / {validation['total']} 項通過。",kind='small')
    r.para(p['limits']);r.section('結論')
    for i,t in enumerate(p['conclusions'],1):r.para(f'{i}　{t}',gap=6)
    r.section('參考範例與製作說明');r.para(p['attribution'],kind='small')
    r.section('參考資料')
    for t in p['references']:r.para(t,kind='small',gap=8)
    r.save()


if __name__=='__main__':main()
