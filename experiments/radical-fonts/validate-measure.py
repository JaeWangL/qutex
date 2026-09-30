from pathlib import Path
from PIL import Image
import json,math
root=Path(__file__).parent
records=[]
metrics=json.loads((root/'validation-browser-metrics.json').read_text())['metrics']
for item in metrics:
 p=root/'validation-crops'/(item['id']+'.png')
 im=Image.open(p).convert('RGB');pix=im.load();blue=[];black=[]
 for y in range(im.height):
  for x in range(im.width):
   r,g,b=pix[x,y]
   if b>r+50 and b>g+30 and r<180:blue.append((x,y))
   elif max(r,g,b)<180 and max(r,g,b)-min(r,g,b)<15:black.append((x,y))
 if not blue or not black:continue
 xmin,xmax=min(x for x,y in blue),max(x for x,y in blue);ytop=min(y for x,y in blue)
 rows={}
 for x,y in black:
  if xmin<=x<=xmax and y<ytop:rows[y]=rows.get(y,0)+1
 bar=[y for y,count in rows.items() if count>=(xmax-xmin+1)*.5]
 # Thresholded full-white pixels between horizontal rule and top blue ink.
 gap=(ytop-max(bar)-1)/9 if bar else None
 # These are raster diagnostics at DPR9, not a claim of vector intersection.
 closest=None
 records.append({'id':p.stem,'barToTopInkWhiteGapCssPx':gap,'nearestInkCenterDistanceCssPx':closest,'blueInkBoxPx':[xmin,ytop,xmax,max(y for x,y in blue)],'threshold':180,'deviceScaleFactor':9})
(root/'validation-ink-measurements.json').write_text(json.dumps(records,indent=2)+'\n')
for r in records:
 if 'heldout' in r['id']:print(r['id'],r['barToTopInkWhiteGapCssPx'],r['nearestInkCenterDistanceCssPx'])
