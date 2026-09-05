// Builds a small two-artboard PDF by hand (no dependencies) so the e2e can exercise the artboard
// picker, pdf.js rasterization and text-run extraction with real PDF text objects.
// Fonts are the standard 14 (Helvetica family), which pdf.js serves from /pdf-standard-fonts/.

function pdfString(s) {
  return '(' + s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)') + ')';
}

/** @returns {Buffer} */
export function makeTestPdf() {
  const objects = [];
  const add = (body) => { objects.push(body); return objects.length; };

  const fontBold = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  const fontBoldObl = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-BoldOblique >>');
  const fontReg = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const resources = `<< /Font << /FB ${fontBold} 0 R /FI ${fontBoldObl} 0 R /FR ${fontReg} 0 R >> >>`;

  // Artboard 1: 600×600 square key visual
  const c1 = [
    '0 0.294 0.745 rg 0 0 600 600 re f', // Federal Blue field
    '1 1 1 rg BT /FB 36 Tf 60 500 Td (Federal Bank) Tj ET', // logo (text stand-in)
    '1 1 1 rg BT /FI 44 Tf 60 400 Td (Dreams don\'t wait.) Tj 0 -52 Td (Neither should you.) Tj ET',
    '1 1 1 rg BT /FR 22 Tf 60 300 Td (Personal Loan up to 25 lakh, approved in 10 minutes.) Tj ET',
    '1 0.612 0 rg 60 200 200 56 re f', // orange CTA pill (rect)
    '0 0.227 0.561 rg BT /FB 24 Tf 96 218 Td (Apply now) Tj ET',
    '0.9 0.92 0.98 rg BT /FR 18 Tf 60 60 Td ' + pdfString('Credit at sole discretion of the Bank. T&C apply.') + ' Tj ET',
  ].join('\n');
  // Artboard 2: 800×400 landscape variant
  const c2 = [
    '0 0.294 0.745 rg 0 0 800 400 re f',
    '1 1 1 rg BT /FB 30 Tf 50 330 Td (Federal Bank) Tj ET',
    '1 1 1 rg BT /FI 40 Tf 50 230 Td (Dreams don\'t wait.) Tj ET',
    '1 0.612 0 rg 50 120 180 50 re f',
    '0 0.227 0.561 rg BT /FB 22 Tf 82 136 Td (Apply now) Tj ET',
    '0.9 0.92 0.98 rg BT /FR 16 Tf 50 40 Td ' + pdfString('Credit at sole discretion of the Bank. T&C apply.') + ' Tj ET',
  ].join('\n');

  const content1 = add(`<< /Length ${Buffer.byteLength(c1)} >>\nstream\n${c1}\nendstream`);
  const content2 = add(`<< /Length ${Buffer.byteLength(c2)} >>\nstream\n${c2}\nendstream`);
  const pagesId = objects.length + 3; // reserved below
  const page1 = add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 600 600] /Resources ${resources} /Contents ${content1} 0 R >>`);
  const page2 = add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 800 400] /Resources ${resources} /Contents ${content2} 0 R >>`);
  const pages = add(`<< /Type /Pages /Kids [${page1} 0 R ${page2} 0 R] /Count 2 >>`);
  if (pages !== pagesId) throw new Error('object numbering drifted');
  const catalog = add(`<< /Type /Catalog /Pages ${pages} 0 R >>`);

  let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, 'binary'));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, 'binary');
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += String(o).padStart(10, '0') + ' 00000 n \n';
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'binary');
}

if (process.argv[1] && process.argv[1].endsWith('make-test-pdf.mjs')) {
  const fs = await import('node:fs');
  const out = process.argv[2] ?? 'e2e/test-master.pdf';
  fs.writeFileSync(out, makeTestPdf());
  console.log('wrote', out);
}
