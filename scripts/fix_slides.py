import re, glob

# 1) Wrap footer texts in inner spans so the measured text box sits inside the bar
pat_navy = re.compile(r'<div class="rl-foot-navy" style="font-size:var\(--fs-micro\);">([^<]+)</div>')
pat_orange = re.compile(r'<div class="rl-foot-orange" style="font-size:var\(--fs-micro\);">([^<]+)</div>')

for f in sorted(glob.glob('/home/z/my-project/download/slides/slide_*.html')):
    s = open(f).read()
    s = pat_navy.sub(r'<div class="rl-foot-navy"><span style="font-size:var(--fs-micro);line-height:1.2;display:inline-block;">\1</span></div>', s)
    s = pat_orange.sub(r'<div class="rl-foot-orange"><span style="font-size:var(--fs-micro);line-height:1.2;display:inline-block;">\1</span></div>', s)
    open(f, 'w').write(s)

# 2) slide_01: wrap UNIVERSITY in a span with tighter tracking (kills 1pt LEFT overflow)
p = '/home/z/my-project/download/slides/slide_01.html'
s = open(p).read()
s = s.replace(
    '<div style="font-family:var(--font-heading);font-size:18px;font-weight:600;letter-spacing:6px;color:var(--navy);text-transform:uppercase;margin-top:4px;">UNIVERSITY</div>',
    '<div style="font-family:var(--font-heading);font-size:18px;font-weight:600;color:var(--navy);text-transform:uppercase;margin-top:4px;"><span style="letter-spacing:5px;display:inline-block;">UNIVERSITY</span></div>'
)
open(p, 'w').write(s)
print('patched')
