from pathlib import Path
import json,hashlib
from fontTools.ttLib import TTFont
from fontTools.pens.boundsPen import BoundsPen
root=Path(__file__).parent
source=Path('fonts/upstream/latin-modern-math/latinmodern-math.otf')
for gap in (100,125,200,250,300):
 f=TTFont(source,recalcTimestamp=False);family=f'Qutex Radical Gap {gap}';ps=f'QutexRadicalGap{gap}'
 f['MATH'].table.MathConstants.RadicalVerticalGap.Value=gap
 for n in list(f['name'].names):
  values={1:family,4:family,6:ps,16:family}
  if n.nameID in values:f['name'].setName(values[n.nameID],n.nameID,n.platformID,n.platEncID,n.langID)
 cff=f['CFF '].cff;cff.fontNames=[ps];cff.topDictIndex[0].FamilyName=family;cff.topDictIndex[0].FullName=family
 f.save(root/'fonts'/f'gap-{gap}.otf')
fonts=[('LM/Qutex',source),('LM gap100',root/'fonts/gap-100.otf'),('LM gap125',root/'fonts/gap-125.otf'),('LM gap200',root/'fonts/gap-200.otf'),('LM gap250',root/'fonts/gap-250.otf'),('LM gap300',root/'fonts/gap-300.otf'),('STIX Two',root/'fonts/STIXTwoMath-Regular.ttf'),('XITS',root/'fonts/XITSMath-Regular.otf')]
records=[]
for label,path in fonts:
 f=TTFont(path);m=f['MATH'].table;gs=f.getGlyphSet();g=f.getBestCmap()[0x221a]
 idx=m.MathVariants.VertGlyphCoverage.glyphs.index(g)
 variants=[]
 for rec in m.MathVariants.VertGlyphConstruction[idx].MathGlyphVariantRecord:
  pen=BoundsPen(gs);gs[rec.VariantGlyph].draw(pen)
  variants.append({'glyph':rec.VariantGlyph,'advance':f['hmtx'][rec.VariantGlyph],'stretchHeight':rec.AdvanceMeasurement,'inkBounds':pen.bounds})
 records.append({'label':label,'file':str(path),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'unitsPerEm':f['head'].unitsPerEm,'version':f['name'].getDebugName(5),'radicalConstants':{n:getattr(getattr(m.MathConstants,n),'Value',getattr(m.MathConstants,n)) for n in dir(m.MathConstants) if n.startswith('Radical')},'radicalVariants':variants})
(root/'font-metrics.json').write_text(json.dumps(records,indent=2)+'\n')
