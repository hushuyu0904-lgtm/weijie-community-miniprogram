"""原创几何插画与 PNG 图标，无外部素材或依赖下载。"""
from pathlib import Path
from PIL import Image, ImageDraw
out = Path(__file__).resolve().parents[1] / 'miniprogram' / 'assets'
out.mkdir(exist_ok=True)
colors = {'coffee':'#ffa664','outing':'#82cda0','lecture':'#9edcf5','chat':'#d5c2f7','calendar':'#a2e9c5','pin':'#ffd195','book':'#ffe3a2','person':'#a4d9f5'}
for name, color in colors.items():
    im=Image.new('RGBA',(96,96)); d=ImageDraw.Draw(im); ink='#27564e'
    if name=='coffee':
        d.ellipse((60,34,88,68),outline=ink,width=5); d.rounded_rectangle((18,30,69,82),12,fill=color,outline=ink,width=5)
        for x in (28,45,61): d.line((x,8,x,23),fill=ink,width=4)
    elif name=='outing':
        d.ellipse((64,6,88,30),fill='#ffcf60'); d.polygon([(5,83),(37,17),(66,83)],fill=color,outline=ink,width=4);d.polygon([(43,83),(70,40),(92,83)],fill='#b9e5cb',outline=ink,width=4)
    elif name=='lecture':
        d.rounded_rectangle((7,14,89,72),9,fill=color,outline=ink,width=5);d.polygon([(39,28),(62,43),(39,58)],fill=ink);d.line((48,72,48,89),fill=ink,width=5);d.line((29,89,67,89),fill=ink,width=5)
    elif name=='chat':
        d.polygon([(19,62),(19,88),(47,65)],fill=color,outline=ink,width=4); d.rounded_rectangle((7,12,88,69),12,fill=color,outline=ink,width=5)
        for x in (26,48,70):d.ellipse((x-3,37,x+3,43),fill=ink)
    elif name=='calendar':
        d.rounded_rectangle((12,18,84,87),10,fill=color,outline=ink,width=5);d.line((13,39,83,39),fill=ink,width=4)
        for x in (30,66):d.line((x,6,x,29),fill=ink,width=5)
        d.line([(29,61),(43,73),(67,48)],fill=ink,width=6)
    elif name=='pin':
        d.polygon([(21,46),(48,91),(76,46)],fill=color);d.ellipse((17,6,79,68),fill=color,outline=ink,width=5);d.ellipse((36,24,60,48),fill='white',outline=ink,width=4)
    elif name=='book':
        d.polygon([(7,17),(30,12),(48,22),(67,12),(89,17),(89,84),(66,78),(48,88),(30,78),(7,84)],fill=color,outline=ink,width=4);d.line((48,22,48,87),fill=ink,width=4)
    else:
        d.ellipse((29,8,67,46),fill=color,outline=ink,width=5);d.rounded_rectangle((14,51,82,90),20,fill=color,outline=ink,width=5)
    im.save(out/(name+'.png'))
    selected=Image.new('RGBA',(96,96),'#e1f5e9');selected.alpha_composite(im);selected.save(out/(name+'-selected.png'))
for name in ('scene','ai'):
    im=Image.new('RGB',(480,600),'#d9eee2' if name=='scene' else '#c8e5f3'); d=ImageDraw.Draw(im)
    d.ellipse((140,-60,610,410),fill='#eef9ed');d.ellipse((-120,390,620,750),fill='#94c5b3' if name=='scene' else '#80b5ce')
    if name=='scene':
        for x,y,shirt in [(100,240,'#f4a677'),(360,220,'#659ec4')]:
            d.rounded_rectangle((x-65,y+65,x+65,y+255),50,fill=shirt);d.ellipse((x-43,y-25,x+43,y+61),fill='#f2cea8');d.pieslice((x-48,y-43,x+47,y+30),180,360,fill='#214c44')
        d.ellipse((40,382,444,472),fill='#eac277');d.rectangle((108,444,122,570),fill='#a57846');d.rectangle((355,444,369,570),fill='#a57846');d.rounded_rectangle((204,356,254,409),8,fill='white');d.arc((240,363,274,397),270,90,fill='white',width=9)
    else:
        d.rounded_rectangle((65,210,415,425),50,fill='#f5faf6',outline='#296776',width=9);d.rounded_rectangle((100,255,380,355),30,fill='#296776')
        for x in (165,315):d.ellipse((x-18,283,x+18,319),fill='#a5f4cf')
        d.line((240,210,240,150),fill='#296776',width=10);d.ellipse((224,125,256,157),fill='#e9ad46');d.line((180,425,180,473),fill='#296776',width=12);d.line((300,425,300,473),fill='#296776',width=12)
    im.save(out/(name+'.png'))
