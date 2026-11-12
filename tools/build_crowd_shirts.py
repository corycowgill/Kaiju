"""Generate an original cotton/print atlas shared by every festival guest."""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
import random, math
random.seed(117)
T=256;atlas=Image.new('RGB',(T*4,T*4))
font_path='C:/Windows/Fonts/arialbd.ttf'
def font(n):return ImageFont.truetype(font_path,n)
for tile in range(16):
 im=Image.new('RGB',(T,T));px=im.load()
 for y in range(T):
  for x in range(T):
   # Woven cotton, shoulder falloff and non-uniform vertical fabric folds.
   fold=math.sin(x*.065+math.sin(y*.019)*1.2)*6+math.sin(x*.14+y*.03)*3
   shade=202+fold+random.uniform(-5,5)+(3 if (x+y)%3==0 else -1)
   px[x,y]=tuple(int(max(0,min(255,shade))) for _ in range(3))
 d=ImageDraw.Draw(im)
 if tile in [1,5,9]:
  for y in range(12,T,24):d.rectangle((0,y,T,y+5),fill=(85,91,92))
 elif tile in [2,6,10]:
  for x in range(0,T,44):d.rectangle((x,0,x+10,T),fill=(125,130,127))
  for y in range(0,T,44):d.rectangle((0,y,T,y+10),fill=(133,135,126))
 elif tile in [3,7,11]:
  d.rectangle((0,72,T,88),fill=(68,75,78));d.rectangle((0,90,T,99),fill=(237,232,212))
 elif tile in [4,8,12,13,14,15]:
  label=['LAKEFRONT','CHICAGO','KAIJU','LIVE','NORTH SIDE','FESTIVAL'][[4,8,12,13,14,15].index(tile)]
  d.rounded_rectangle((54,54,202,139),radius=8,outline=(236,230,210),width=3)
  f=font(16 if len(label)>8 else 23);w=d.textbbox((0,0),label,font=f)[2]
  d.text(((T-w)/2,68),label,font=f,fill=(242,235,216))
  if tile%2:
   d.ellipse((108,100,148,126),outline=(235,226,203),width=3)
  else:
   for i in range(5):d.line((92+i*15,118-i%2*13,92+i*15,130),fill=(233,224,205),width=5)
 # Seams, sleeve edge and light seam wear; no bright plastic-looking trim.
 d.line((9,0,17,255),fill=(159,163,153),width=2);d.line((247,0,239,255),fill=(159,163,153),width=2)
 d.line((0,242,255,242),fill=(159,162,150),width=2)
 atlas.paste(im,((tile%4)*T,(tile//4)*T))
out=Path(__file__).resolve().parents[1]/'assets/viewmodels/crowd_shirts.png';atlas.save(out,optimize=True)
print(out)
