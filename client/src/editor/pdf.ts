function encode(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function joinBytes(chunks: Uint8Array[]): Uint8Array {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function decodeJpeg(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) throw new Error("The raster export is missing image data.");
  const binary = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/** Build a small single-page PDF containing the rendered export as a JPEG. */
export function buildPdfFromJpeg(
  dataUrl: string,
  pixelWidth: number,
  pixelHeight: number,
): Blob {
  const jpeg = decodeJpeg(dataUrl);
  const pageWidth = 595;
  const pageHeight = Math.max(1, pageWidth * (pixelHeight / pixelWidth));
  const content = encode(
    `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im0 Do\nQ\n`,
  );
  const image = encode(
    `<< /Type /XObject /Subtype /Image /Width ${pixelWidth} /Height ${pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
  );

  const objects = [
    encode("<< /Type /Catalog /Pages 2 0 R >>"),
    encode("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    encode(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>`,
    ),
    joinBytes([
      encode(`<< /Length ${content.length} >>\nstream\n`),
      content,
      encode("endstream"),
    ]),
    joinBytes([image, jpeg, encode("\nendstream")]),
  ];

  const header = joinBytes([
    encode("%PDF-1.4\n%"),
    new Uint8Array([0xff, 0xff, 0xff, 0xff]),
    encode("\n"),
  ]);
  const chunks: Uint8Array[] = [header];
  const offsets: number[] = [0];
  let length = header.length;

  objects.forEach((object, index) => {
    offsets.push(length);
    const prefix = encode(`${index + 1} 0 obj\n`);
    const suffix = encode("\nendobj\n");
    chunks.push(prefix, object, suffix);
    length += prefix.length + object.length + suffix.length;
  });

  const xrefOffset = length;
  const xref = [
    "xref\n0 6\n",
    "0000000000 65535 f \n",
    ...offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`),
    `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  ];
  chunks.push(encode(xref.join("")));
  return new Blob([joinBytes(chunks).buffer as ArrayBuffer], {
    type: "application/pdf",
  });
}
