import type { Drawing, Element } from "../diagram";
import {
  DOCUMENT_APP,
  DOCUMENT_FORMAT,
  DOCUMENT_SCHEMA_VERSION,
  applyLegacyElements,
  ensureCanonicalDocument,
  flattenDocument,
  migrateLegacyDocument,
  validateDocument,
  type ArchimateDocument,
} from "../model/archimate";

export { DOCUMENT_APP, DOCUMENT_FORMAT, DOCUMENT_SCHEMA_VERSION };

export type ExportEnvelope = ArchimateDocument & {
  exportedAt: string;
  drawing: { name: string; category: string };
};

export type ImportedDocument = {
  name: string;
  category: string;
  elements: Element[];
  document: ArchimateDocument;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function categoryFor(value: unknown): string {
  return isRecord(value) && typeof value.category === "string"
    ? value.category
    : "Architecture";
}

export function documentForDrawing(
  drawing: Pick<Drawing, "name" | "elements" | "document">,
): ArchimateDocument {
  const canonical = ensureCanonicalDocument(
    drawing.document || migrateLegacyDocument(drawing.elements, { name: drawing.name }),
    { name: drawing.name },
  );
  const name = drawing.name.trim() || "Untitled drawing";
  canonical.model.name = name;
  if (drawing.elements) {
    const active = flattenDocument(canonical, canonical.activeViewId);
    if (JSON.stringify(active) !== JSON.stringify(drawing.elements)) {
      return applyLegacyElements(canonical, drawing.elements, canonical.activeViewId);
    }
  }
  return canonical;
}

export function serializeDocument(
  drawing: Pick<Drawing, "name" | "category" | "elements" | "document">,
): string {
  const document = documentForDrawing(drawing);
  const envelope: ExportEnvelope = {
    ...document,
    exportedAt: new Date().toISOString(),
    drawing: {
      name: drawing.name.trim() || "Untitled drawing",
      category: drawing.category,
    },
  };
  return JSON.stringify(envelope, null, 2);
}

export function parseDocumentJson(raw: string): ImportedDocument {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("The selected file is not valid JSON.");
  }
  if (!isRecord(value) || value.app !== DOCUMENT_APP) {
    throw new Error(`Unsupported document format. Expected ${DOCUMENT_APP} ArchiMate document.`);
  }
  const payload = isRecord(value.document) ? value.document : value;
  const isLegacy = payload.schemaVersion === 1 && Array.isArray(payload.elements);
  const document = isLegacy
    ? migrateLegacyDocument(payload, {
        name:
          isRecord(value.drawing) && typeof value.drawing.name === "string"
            ? value.drawing.name
            : undefined,
      })
    : ensureCanonicalDocument(payload);
  const result = validateDocument(document);
  if (!result.valid) throw new Error(result.errors.join("; "));
  const name =
    isRecord(value.drawing) && typeof value.drawing.name === "string"
      ? value.drawing.name
      : document.model.name;
  if (name.length > 100) throw new Error("The document name is too long.");
  return {
    name,
    category: categoryFor(value.drawing),
    elements: flattenDocument(document),
    document,
  };
}
