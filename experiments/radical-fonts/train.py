from pathlib import Path
from fontTools.ttLib import TTFont
root=Path(__file__).parent
for gap in (250,260,275,300,310,320):
 f=TTFont('fonts/upstream/latin-modern-math/latinmodern-math.otf',recalcTimestamp=False)
 f['MATH'].table.MathConstants.RadicalVerticalGap.Value=gap
 f['MATH'].table.MathConstants.RadicalDisplayStyleVerticalGap.Value=gap
 family=f'Qutex Clearance {gap}';ps=f'QutexClearance{gap}'
 for n in list(f['name'].names):
  values={1:family,3:ps+'0.2.0-experiment',4:family,6:ps,16:family}
  if n.nameID in values:f['name'].setName(values[n.nameID],n.nameID,n.platformID,n.platEncID,n.langID)
 c=f['CFF '].cff;c.fontNames=[ps];c.topDictIndex[0].FamilyName=family;c.topDictIndex[0].FullName=family
 f.save(root/'fonts'/f'profile-{gap}.otf')
