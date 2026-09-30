from pathlib import Path
from PIL import Image
import json
root=Path(__file__).parent
reference=Path('artifacts/hwp-math-reference/pdf-reference/page-1-sqrt3.png')

def components(path,threshold):
 im=Image.open(path).convert('RGB');pixels=im.load()
 ink={(x,y) for y in range(im.height) for x in range(im.width) if max(pixels[x,y])<threshold}
 parts=[]
 while ink:
  stack=[ink.pop()];part=set(stack)
  while stack:
   x,y=stack.pop()
   for dx in (-1,0,1):
    for dy in (-1,0,1):
     q=(x+dx,y+dy)
     if q in ink:ink.remove(q);part.add(q);stack.append(q)
  if len(part)>30:parts.append(part)
 return parts

def rightmost_digit(path,threshold):
 ps=components(path,threshold)
 p=max(ps,key=lambda s:min(x for x,y in s))
 xmin=min(x for x,y in p);xmax=max(x for x,y in p);ymin=min(y for x,y in p);ymax=max(y for x,y in p)
 return {(x-xmin,y-ymin) for x,y in p},[xmin,ymin,xmax,ymax]

rows=[]
for threshold in (96,128,180,220):
 target,tbox=rightmost_digit(reference,threshold)
 for key in ('gap300','stix','xits'):
  actual,box=rightmost_digit(root/'black-reference-crops'/f'{key}-inline-sqrt3.png',threshold)
  # Translation only: optimize raster grid phase by <=2 pixels, never scale.
  scores=[]
  for dx in range(-2,3):
   for dy in range(-2,3):
    shifted={(x+dx,y+dy) for x,y in actual}
    scores.append((len(target&shifted)/len(target|shifted),dx,dy))
  score,dx,dy=max(scores)
  rows.append({'font':key,'threshold':threshold,'referenceInkBox':tbox,'candidateInkBox':box,'translationOnlyIoU':score,'phaseShiftPx':[dx,dy],'scaleApplied':False})
(root/'reference-digit-comparison.json').write_text(json.dumps({'source':'Local Hancom PDF crop; local artifact excluded from repo','fontPointSize':11.032088,'pixelsPerPoint':12,'glyph':'3','method':'Rightmost connected ink component; translation only, <=2px raster phase; no rescaling','results':rows},indent=2)+'\n')
for r in rows:print(r['font'],r['threshold'],round(r['translationOnlyIoU'],4),r['referenceInkBox'],r['candidateInkBox'])
