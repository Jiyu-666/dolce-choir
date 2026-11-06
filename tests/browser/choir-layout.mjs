import assert from 'node:assert/strict';

export async function verifyChoirLayout(page) {
  const data = await page.evaluate(async () => {
    const { ScorePainter } = await import('/src/layout/painter.ts');
    const { loadScoreDoc } = await import('/src/model/fromxml.ts');
    const { choirPaintRequest } = await import('/src/choir/layout.ts');
    const { inkBounds } = await import('/src/mixed/ink.ts');
    const { Group, GraphicPath } = await import('/src/pagetree/pageitem.ts');
    const { drawSysStaff, drawLineObjs, drawChoirLabel } = await import('/src/mixed/render.ts');
    // Hand-authored 32-bar SATB fixture: synchronized quarters, octave dots and lyrics.
    const path = new GraphicPath(); path.moveTo(-8,-5); path.lineTo(2,15); path.lineTo(10,-5); path.close(); path.fill = true;
    const before = path.d, pb = inkBounds(path);
    if (pb.left !== -8 || pb.top !== -5 || pb.right !== 10 || pb.bottom !== 15 || path.d !== before) throw new Error("Negative ink path was normalized or measured incorrectly");
    const roles = ['S','A','T','B'];
    const xml = `<score-partwise version="4.0"><part-list>${roles.map(r => `<score-part id="${r}"><part-name>${r}</part-name></score-part>`).join('')}</part-list>${roles.map((r, pi) => `<part id="${r}">${Array.from({length:32}, (_, m) => `<measure number="${m+1}">${m ? '' : '<attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>'}${['C','D','E','F'].map(step => `<note><pitch><step>${step}</step><octave>${[6,5,4,3][pi]}</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><lyric><text>la</text></lyric></note>`).join('')}</measure>`).join('')}</part>`).join('')}</score-partwise>`;
    const doc = loadScoreDoc(xml), original = JSON.stringify(doc);
    async function layout(staffMm, jianpuPt, groupGapMm) {
      const painter = new ScorePainter(window.__app.painter.resources);
      await painter.load(choirPaintRequest(doc, {staffMm,jianpuPt,layerGapMm:2,groupGapMm}));
      const score = painter.staffPlacement.score;
      const clearances = [], boundsErrors = [], xSpreads = [];
      for (const sys of score.systems) {
        let lastBottom;
        for (const [i, st] of sys.staves.entries()) {
          const group = new Group(); drawSysStaff(group, sys, st, 0);
          const lines = new Group(); group.add(lines); lines.y = -sys.yposPart(st.part()); drawLineObjs(lines, sys, st.part());
          drawChoirLabel(group, sys, st, 0);
          const b = inkBounds(group), offset = sys.ypos(i);
          const cached = st.getYBound(sys);
          boundsErrors.push(Math.abs(cached[0] + b.top), Math.abs(cached[1] + b.bottom));
          if (lastBottom !== undefined) clearances.push((offset + b.top - lastBottom) * score.scaling * 25.4 / 72);
          lastBottom = offset + b.bottom;
        }
        for (const m of sys.measures) {
          const xs = score.parts.map(p => p.measures[m.index].chords[0].notes[0].x);
          xSpreads.push(Math.max(...xs) - Math.min(...xs));
        }
      }
      return {pages:painter.pageCount, systems:score.systems.length, font:score.options.mixFont.size*score.scaling,
        staff:40*score.scaling*25.4/72, clearances, boundsErrors,xSpreads};
    }
    return { small:await layout(7,12,4), large:await layout(7,24,8), staff:await layout(9,12,4), unchanged:original===JSON.stringify(doc) };
  });
  for (const d of [data.small,data.large,data.staff]) {
    assert(d.systems > 1); assert(d.boundsErrors.every(e => e < .01));
    assert(d.xSpreads.every(e => Math.abs(e) < .01), 'Simultaneous parts lost horizontal alignment');
  }
  assert(data.unchanged, 'Layout mutated authoritative score');
  assert(Math.abs(data.small.font-12)<.01 && Math.abs(data.large.font-24)<.01 && Math.abs(data.staff.font-12)<.01, 'Independent physical font sizing failed');
  assert(Math.abs(data.staff.staff-9)<.01);
  assert(data.small.clearances.every(v => Math.abs(v-4)<.01));
  assert(data.large.clearances.every(v => Math.abs(v-8)<.01));
  assert(data.large.pages > data.small.pages, 'Larger ink did not repaginate');
  console.log('PASS: SATB simultaneous geometry, independent mm/pt sizing, measured clearances, repagination', JSON.stringify({small:data.small.pages,large:data.large.pages}));
}
