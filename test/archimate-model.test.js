const assert = require("node:assert/strict");
const test = require("node:test");

const model = require("../shared/archimate-model");

const shape = (overrides = {}) => ({
  id: "shape",
  kind: "card",
  x: 20,
  y: 30,
  w: 180,
  h: 80,
  text: "Shape",
  detail: "Description",
  fill: "#ffffff",
  stroke: "#7392b8",
  fontSize: 16,
  ...overrides,
});

test("ArchiMate 4 catalogue covers the domains, concepts, and relationships", () => {
  assert.equal(model.ARCHIMATE_CATALOG.language.version, "4.0");
  assert.deepEqual(
    model.ARCHIMATE_CATALOG.domains.map((domain) => domain.id),
    [
      "motivation",
      "strategy",
      "common",
      "business",
      "application",
      "technology",
      "implementation-migration",
    ],
  );
  assert.equal(
    new Set(model.ARCHIMATE_CATALOG.elements.map((element) => element.glyph)).size,
    model.ARCHIMATE_CATALOG.elements.length,
  );
  assert.ok(model.ARCHIMATE_CATALOG.elements.every((element) => element.glyph));
  assert.ok(model.ELEMENT_TYPES.includes("Process"));
  assert.ok(model.ELEMENT_TYPES.includes("ApplicationComponent"));
  assert.ok(model.ELEMENT_TYPES.includes("Plateau"));
  assert.equal(model.RELATIONSHIP_TYPES.length, 11);
  assert.equal(model.relationshipIsValid("ApplicationComponent", "Serving", "Service"), true);
  assert.equal(model.relationshipIsValid("ApplicationComponent", "Access", "Service"), false);
  assert.equal(model.relationshipIsValid("Process", "Access", "DataObject"), true);
});

test("legacy drawing arrays migrate to one view without duplicating semantic identity", () => {
  const first = shape({ id: "component", text: "Order service" });
  const second = shape({
    id: "service",
    x: 320,
    text: "Order API",
    archimateType: "Service",
    modelElementId: "service-model",
  });
  const typed = shape({
    id: "component-typed",
    text: "Order component",
    archimateType: "ApplicationComponent",
    modelElementId: "component-model",
  });
  const link = shape({
    id: "link",
    kind: "arrow",
    x: 200,
    y: 60,
    w: 120,
    h: 0,
    text: "serves",
    sourceAnchor: { elementId: "component-typed", side: "right", offset: 0.5 },
    targetAnchor: { elementId: "service", side: "left", offset: 0.5 },
    relationshipType: "Serving",
    relationshipId: "serves-1",
    route: "straight",
    arrowhead: "open",
  });
  const document = model.migrateLegacyDocument([first, second, typed, link], { name: "Orders" });
  assert.equal(Object.keys(document.model.elements).length, 2);
  assert.equal(document.model.elements["component-model"].type, "ApplicationComponent");
  assert.equal(document.model.elements["service-model"].type, "Service");
  assert.equal(document.model.relationships["serves-1"].sourceId, "component-model");
  assert.equal(Object.keys(document.views[0].annotations).length, 1);
  assert.deepEqual(model.flattenDocument(document).find((item) => item.id === first.id), first);
  assert.equal(model.validateCanonicalDocument(document).length, 0);

  const secondView = model.createView("Operations");
  document.views.push(secondView);
  document.activeViewId = secondView.id;
  const secondViewDocument = model.applyLegacyElements(document, [
    { ...model.flattenDocument(document, document.views[0].id).find((item) => item.modelElementId === "component-model"), x: 600 },
  ], secondView.id);
  assert.equal(secondViewDocument.views.length, 2);
  assert.equal(secondViewDocument.views[0].nodes["node-component-typed"].x, 20);
  assert.equal(model.flattenDocument(secondViewDocument, secondView.id)[0].x, 600);
});

test("multiplicities normalize and reject inverted ranges", () => {
  assert.equal(model.normalizeMultiplicity("1"), "1..1");
  assert.equal(model.normalizeMultiplicity("*"), "0..*");
  assert.equal(model.normalizeMultiplicity("1..*"), "1..*");
  assert.equal(model.normalizeMultiplicity("2..1"), undefined);
  assert.equal(model.normalizeMultiplicity("many"), undefined);
});
