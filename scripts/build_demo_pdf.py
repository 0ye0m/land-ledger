#!/usr/bin/env python3
"""Build LAND LEDGER Full Product Demo Walkthrough PDF (landscape 1020x720 deck).
Pipeline: assemble HTML -> poster_validate check-html -> html2pdf-next.js -> meta.set -> pdf_qa.
"""
import os, sys, subprocess, shutil

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from demo_pdf_data1 import SECTIONS_1
from demo_pdf_data2 import SECTIONS_2, HOWTO, ENDING

BASE = '/home/z/my-project/download'
HTML_PATH = os.path.join(BASE, 'land-ledger-demo-walkthrough.html')
PDF_PATH = os.path.join(BASE, 'land-ledger-demo-walkthrough.pdf')
SKILL = '/home/z/my-project/skills/pdf'
SHOT_DIR = os.path.join(BASE, 'demo-screenshots')

CSS = """
@page { size: 1020px 720px; margin: 0; }
:root {
  --m950:#2c100c; --m900:#38160f; --m700:#7a2e26; --terra:#b0654f;
  --cream:#faf6f1; --paper:#ffffff; --ink:#2b211c; --muted:#6f5f54; --line:#e9ddd1;
}
* { box-sizing: border-box; }
html, body {
  margin: 0; padding: 0; width: 1020px;
  background: #2c100c; color: #f3ece4;
  font-family: 'Inter', 'Liberation Sans', sans-serif;
  line-break: strict; word-break: normal; overflow-wrap: break-word;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
@media screen {
  html { display: flex; justify-content: center; background: #2c100c; padding: 24px 0; }
  body { box-shadow: 0 10px 60px rgba(0,0,0,.5); }
}
.page {
  width: 1020px; height: 720px; position: relative;
  break-after: page; page-break-after: always;
  background: #faf6f1; color: #2b211c;
}
.page.last { break-after: auto; page-break-after: auto; }
img { display: block; }

/* ---------- COVER ---------- */
.cover { display: flex; flex-direction: column; justify-content: center; padding: 0 96px; background: #38160f; color: #f3ece4; }
.cov-brand { position: absolute; top: 62px; left: 96px; display: flex; align-items: center; gap: 12px; }
.cov-mark { width: 16px; height: 16px; background: #b0654f; }
.cov-brand span { font-size: 14px; font-weight: 700; letter-spacing: .42em; color: #cf9a86; }
.cov-kicker { font-size: 13px; font-weight: 600; letter-spacing: .34em; color: #b0654f; }
.cov-title { margin: 20px 0 0; font-family: 'Playfair Display', 'Liberation Serif', serif; font-weight: 900; font-size: 62px; line-height: 1.08; color: #f7f1ea; }
.cov-sub { margin-top: 24px; font-size: 17px; line-height: 1.65; color: rgba(243,236,228,.72); max-width: 660px; }
.cov-chips { margin-top: 36px; display: flex; flex-wrap: wrap; gap: 10px; max-width: 100%; }
.chip { border: 1px solid rgba(207,154,134,.4); color: #e8d9cf; font-size: 11px; font-weight: 600; letter-spacing: .18em; padding: 9px 14px; }
.cov-foot { position: absolute; bottom: 60px; left: 96px; right: 96px; display: flex; justify-content: space-between; font-size: 11px; font-weight: 500; letter-spacing: .08em; color: rgba(243,236,228,.55); }

/* ---------- DIVIDER ---------- */
.divider { padding: 0 96px; display: flex; flex-direction: column; justify-content: center; }
.div-num { position: absolute; top: 30px; right: 60px; font-family: 'Playfair Display', 'Liberation Serif', serif; font-weight: 900; font-size: 290px; line-height: 1; color: rgba(122,46,38,.08); }
.div-act { font-size: 12px; font-weight: 700; letter-spacing: .3em; color: #b0654f; }
.div-title { margin: 18px 0 0; font-family: 'Playfair Display', 'Liberation Serif', serif; font-weight: 900; font-size: 46px; line-height: 1.12; color: #38160f; max-width: 780px; }
.div-rule { width: 72px; height: 4px; background: #7a2e26; margin: 42px 0; }
.div-intro { font-size: 16.5px; line-height: 1.7; color: #4a3c33; max-width: 720px; }
.div-foot { position: absolute; bottom: 40px; left: 96px; right: 96px; display: flex; justify-content: space-between; font-size: 10px; font-weight: 600; letter-spacing: .22em; color: #93796a; }

/* ---------- STEP ---------- */
.step { padding: 24px 50px 16px; }
.st-head { display: flex; align-items: center; gap: 14px; }
.st-chip { background: #7a2e26; color: #f8efe7; font-size: 11px; font-weight: 800; letter-spacing: .16em; padding: 7px 10px; white-space: nowrap; }
.st-title { font-size: 19px; font-weight: 800; color: #38160f; white-space: nowrap; }
.st-sec { margin-left: auto; font-size: 10px; font-weight: 700; letter-spacing: .2em; color: #93796a; white-space: nowrap; }
.st-shot { width: 900px; margin: 12px auto 0; border: 1px solid #e9ddd1; background: #ffffff; }
.st-shot img { width: 100%; height: auto; }
.st-cap { width: 900px; margin: 10px auto 0; font-size: 13.5px; line-height: 1.55; color: #57483d; text-align: left; }

/* ---------- HOW TO ---------- */
.howto { padding: 46px 64px 40px; }
.how-kicker { font-size: 12px; font-weight: 700; letter-spacing: .3em; color: #b0654f; }
.how-title { margin: 12px 0 0; font-family: 'Playfair Display', 'Liberation Serif', serif; font-weight: 900; font-size: 40px; color: #38160f; }
.how-lead { margin-top: 14px; font-size: 14.5px; line-height: 1.65; color: #57483d; max-width: 860px; }
.how-cols { display: flex; gap: 40px; margin-top: 22px; }
.how-left { flex: 1.12; min-width: 0; }
.how-right { flex: .88; min-width: 0; display: flex; flex-direction: column; gap: 16px; }
.how-h { font-size: 11px; font-weight: 800; letter-spacing: .24em; color: #7a2e26; padding-bottom: 8px; border-bottom: 2px solid #7a2e26; }
.act-row { display: flex; gap: 14px; align-items: baseline; padding: 8px 0; border-bottom: 1px solid #e9ddd1; }
.act-n { font-family: 'Playfair Display', 'Liberation Serif', serif; font-weight: 900; font-size: 15px; color: #b0654f; width: 28px; flex-shrink: 0; }
.act-t { font-size: 13.5px; font-weight: 700; color: #2b211c; white-space: nowrap; }
.act-d { font-size: 12.5px; color: #6f5f54; margin-left: auto; text-align: right; }
.panel { background: #ffffff; border: 1px solid #e9ddd1; padding: 18px 20px; }
.panel-h { font-size: 12px; font-weight: 800; letter-spacing: .18em; color: #7a2e26; margin-bottom: 10px; }
.q-step { display: flex; gap: 10px; font-size: 12.5px; line-height: 1.5; color: #4a3c33; margin-bottom: 8px; }
.q-n { font-weight: 800; color: #b0654f; flex-shrink: 0; }
.video-note { font-size: 12.5px; line-height: 1.6; color: #4a3c33; }
.video-note b { color: #2b211c; }

/* ---------- ENDING ---------- */
.ending { padding: 54px 72px 44px; background: #38160f; color: #f3ece4; display: flex; flex-direction: column; }
.end-kicker { font-size: 12px; font-weight: 700; letter-spacing: .3em; color: #b0654f; }
.end-title { margin: 12px 0 0; font-family: 'Playfair Display', 'Liberation Serif', serif; font-weight: 900; font-size: 44px; color: #f7f1ea; }
.end-sub { margin-top: 12px; font-size: 14.5px; color: rgba(243,236,228,.7); }
.end-cols { display: flex; gap: 36px; margin-top: 26px; flex: 1; min-height: 0; }
.end-left { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 16px; }
.end-right { flex: 1.25; min-width: 0; }
.dark-panel { background: rgba(243,236,228,.06); border: 1px solid rgba(207,154,134,.28); padding: 18px 20px; }
.dp-h { font-size: 11px; font-weight: 800; letter-spacing: .2em; color: #cf9a86; margin-bottom: 12px; }
.pr-row { display: flex; gap: 14px; font-size: 12.5px; line-height: 1.5; color: rgba(243,236,228,.85); margin-bottom: 9px; }
.pr-id { font-weight: 800; color: #e8b9a5; white-space: nowrap; }
.acc-head { font-size: 10px; font-weight: 800; letter-spacing: .18em; color: #cf9a86; padding-bottom: 8px; border-bottom: 1px solid rgba(207,154,134,.28); }
.acc-row { font-size: 12px; line-height: 1.45; color: rgba(243,236,228,.88); padding: 6.5px 0; border-bottom: 1px solid rgba(207,154,134,.14); white-space: nowrap; }
.acc-mail { font-family: 'Liberation Mono', monospace; font-size: 11px; color: rgba(243,236,228,.75); }
.pw-note, .vid-note { margin-top: 12px; font-size: 12px; line-height: 1.6; color: rgba(243,236,228,.72); }
.end-close { border-top: 1px solid rgba(243,236,228,.18); padding-top: 16px; margin-top: 4px; display: flex; justify-content: space-between; align-items: baseline; }
.end-close .brand { font-size: 13px; font-weight: 700; letter-spacing: .34em; color: #cf9a86; }
.end-close .tag { font-family: 'Playfair Display', 'Liberation Serif', serif; font-size: 15px; font-style: italic; color: rgba(243,236,228,.8); }
"""


def esc(s):
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def build_html():
    parts = []
    A = parts.append

    # ---------- COVER ----------
    A('<div class="page cover">')
    A('<div class="cov-brand"><div class="cov-mark"></div><span>LAND LEDGER</span></div>')
    A('<div class="cov-kicker">FULL PRODUCT DEMO WALKTHROUGH</div>')
    A('<h1 class="cov-title">Every record sealed.<br>Every action accountable.</h1>')
    A('<div class="cov-sub">A complete guided tour of the platform - ten acts, sixty-one screens, five roles, '
      'one blockchain-backed land registry. Read it as a script, present it as a story.</div>')
    A('<div class="cov-chips">')
    for c in ['10 ACTS', '61 SCREENS', '5 ROLES', 'LIVE MFA', 'ON-CHAIN PROOF']:
        A(f'<div class="chip">{c}</div>')
    A('</div>')
    A('<div class="cov-foot"><span>Prepared 12 October 2026</span>'
      '<span>Companion recording: land-ledger-full-demo.mp4 (7:15)</span></div>')
    A('</div>')

    # ---------- HOW TO ----------
    A('<div class="page howto">')
    A(f'<div class="how-kicker">{esc(HOWTO["kicker"])}</div>')
    A(f'<h2 class="how-title">{esc(HOWTO["title"])}</h2>')
    A(f'<p class="how-lead">{esc(HOWTO["lead"])}</p>')
    A('<div class="how-cols">')
    A('<div class="how-left">')
    A(f'<div class="how-h">{esc(HOWTO["acts_note"]).upper()}</div>')
    for n, t, d in HOWTO['acts']:
        A(f'<div class="act-row"><div class="act-n">{n}</div><div class="act-t">{esc(t)}</div>'
          f'<div class="act-d">{esc(d)}</div></div>')
    A('</div>')
    A('<div class="how-right">')
    A('<div class="panel">')
    A(f'<div class="panel-h">{esc(HOWTO["quick_title"]).upper()}</div>')
    for i, q in enumerate(HOWTO['quick'], 1):
        A(f'<div class="q-step"><div class="q-n">{i}.</div><div>{esc(q)}</div></div>')
    A('</div>')
    A('<div class="panel">')
    A(f'<div class="panel-h">{esc(HOWTO["video_title"]).upper()}</div>')
    A(f'<div class="video-note"><b>land-ledger-full-demo.mp4</b> - 7 minutes 15 seconds, the full story performed '
      f'live on a pristine seed, in the same order as this deck. Screenshots in these pages are frames from that '
      f'same capture session.</div>')
    A('</div>')
    A('</div></div></div>')

    # ---------- SECTIONS + STEPS ----------
    step_no = 0
    total = sum(len(s['steps']) for s in SECTIONS_1 + SECTIONS_2)
    for sec in SECTIONS_1 + SECTIONS_2:
        # divider
        A('<div class="page divider">')
        A(f'<div class="div-num">{sec["num"]}</div>')
        A(f'<div class="div-act">ACT {sec["num"]} &middot; {esc(sec["rng"])}</div>')
        A(f'<h2 class="div-title">{esc(sec["title"])}</h2>')
        A('<div class="div-rule"></div>')
        A(f'<p class="div-intro">{esc(sec["intro"])}</p>')
        A('<div class="div-foot"><span>LAND LEDGER</span><span>FULL PRODUCT DEMO WALKTHROUGH</span></div>')
        A('</div>')
        # steps
        for fname, title, cap in sec['steps']:
            step_no += 1
            A('<div class="page step">')
            A('<div class="st-head">')
            A(f'<span class="st-chip">STEP {step_no:02d} / {total}</span>')
            A(f'<span class="st-title">{esc(title)}</span>')
            A(f'<span class="st-sec">ACT {sec["num"]} &middot; {esc(sec["title"]).upper()}</span>')
            A('</div>')
            # verify file exists
            if not os.path.exists(os.path.join(SHOT_DIR, fname)):
                raise SystemExit(f'MISSING SCREENSHOT: {fname}')
            A(f'<div class="st-shot"><img src="demo-screenshots/{fname}" alt="{esc(title)}"></div>')
            A(f'<div class="st-cap">{esc(cap)}</div>')
            A('</div>')

    # ---------- ENDING ----------
    A('<div class="page ending last">')
    A(f'<div class="end-kicker">HANDOVER</div>')
    A(f'<h2 class="end-title">{esc(ENDING["title"])}</h2>')
    A(f'<div class="end-sub">{esc(ENDING["sub"])}</div>')
    A('<div class="end-cols">')
    A('<div class="end-left">')
    A('<div class="dark-panel">')
    A(f'<div class="dp-h">{esc(ENDING["pristine_title"]).upper()}</div>')
    for tid, st in ENDING['pristine']:
        A(f'<div class="pr-row"><div class="pr-id">{tid}</div><div>{esc(st)}</div></div>')
    A('</div>')
    A('<div class="dark-panel">')
    A(f'<div class="dp-h">RECORDING</div>')
    A(f'<div class="pr-row"><div>{esc(ENDING["video_note"])}</div></div>')
    A('</div>')
    A('</div>')
    A('<div class="end-right">')
    A('<div class="dark-panel">')
    A(f'<div class="dp-h">{esc(ENDING["accounts_title"]).upper()}</div>')
    A('<div class="acc-head">ROLE &nbsp;&middot;&nbsp; NAME &nbsp;&middot;&nbsp; EMAIL</div>')
    for role, name, email in ENDING['accounts']:
        A(f'<div class="acc-row"><span class="acc-mail">{esc(role).upper().ljust(10, "\u00a0")}&nbsp;|&nbsp; '
          f'{esc(name).ljust(18, "\u00a0")}&nbsp;|&nbsp; {esc(email)}</span></div>')
    A(f'<div class="pw-note">{esc(ENDING["password_note"])}</div>')
    A('</div>')
    A('</div></div>')
    A('<div class="end-close"><span class="tag">Every record sealed, every action accountable.</span>'
      '<span class="brand">LAND LEDGER</span></div>')
    A('</div>')

    html = ('<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">'
            '<title>Land Ledger - Full Product Demo Walkthrough</title>'
            '<link rel="preconnect" href="https://fonts.googleapis.com">'
            '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900'
            '&family=Playfair+Display:ital,wght@0,700;0,900;1,500&display=swap" rel="stylesheet">'
            f'<style>{CSS}</style></head><body>' + '\n'.join(parts) + '</body></html>')
    return html


def main():
    os.makedirs(BASE, exist_ok=True)
    html = build_html()
    with open(HTML_PATH, 'w', encoding='utf-8') as f:
        f.write(html)
    print(f'HTML written: {HTML_PATH} ({len(html)/1024:.0f} KB)')

    # 1. pre-render validation
    r = subprocess.run(['python3', f'{SKILL}/scripts/poster_validate.py', 'check-html', HTML_PATH],
                       capture_output=True, text=True)
    print('--- check-html ---'); print(r.stdout[-3000:]); print(r.stderr[-1000:])
    if 'ERROR' in r.stdout:
        print('CHECK-HTML ERRORS FOUND'); sys.exit(1)

    # 2. render PDF (fixed-height deck -> Chromium native pagination is deterministic)
    r = subprocess.run(['node', f'{SKILL}/scripts/html2pdf-next.js', HTML_PATH,
                        '--output', PDF_PATH, '--width', '1020px', '--height', '720px', '--nopaged'],
                       capture_output=True, text=True, cwd=BASE)
    print('--- html2pdf ---'); print(r.stdout[-2500:]); print(r.stderr[-800:])
    if not os.path.exists(PDF_PATH):
        print('PDF NOT PRODUCED'); sys.exit(1)

    # 3. metadata
    meta = '{"Title": "Land Ledger - Full Product Demo Walkthrough", "Author": "Z.ai", "Creator": "Z.ai", ' \
           '"Subject": "Complete guided demo: 61 screens across 5 roles, from landing to on-chain registration"}'
    tmp = PDF_PATH.replace('.pdf', '.meta.pdf')
    subprocess.run(['python3', f'{SKILL}/scripts/pdf.py', 'meta.set', PDF_PATH, '-o', tmp, '-d', meta],
                   capture_output=True, text=True)
    if os.path.exists(tmp) and os.path.getsize(tmp) > 100000:
        shutil.move(tmp, PDF_PATH); print('metadata set')
    print('DONE:', PDF_PATH, f'{os.path.getsize(PDF_PATH)/1024/1024:.1f} MB')


if __name__ == '__main__':
    main()
