const assert = require("node:assert/strict");
const test = require("node:test");

const model = require("../shared/archimate-model");
const exchange = require("../src/archimate-exchange");

function kindFor(type) {
  if (["Event", "AndJunction", "OrJunction"].includes(type)) return "ellipse";
  if (["Grouping", "Location", "Product", "Plateau"].includes(type)) return "container";
  return "card";
}

test("all catalogue concepts and relationships validate with repeated occurrences and nesting", () => {
  const document = model.createDocument("Catalogue fixture", { viewName: "Catalogue" });
  const view = document.views[0];
  for (const [index, definition] of model.ARCHIMATE_CATALOG.elements.entries()) {
    const elementId = `element-${definition.id}`;
    document.model.elements[elementId] = {
      id: elementId,
      type: definition.id,
      name: `${definition.name} ${index}`,
      documentation: `Unicode ✓ ${definition.name}`,
      properties: { owner: "Énité" },
      extensions: { catalogueGlyph: definition.glyph },
    };
    const nodeId = `node-${definition.id}`;
    view.nodes[nodeId] = {
      id: nodeId,
      elementId,
      x: 20 + (index % 8) * 170,
      y: 20 + Math.floor(index / 8) * 110,
      w: 150,
      h: 80,
      rotation: 0,
      kind: kindFor(definition.id),
      label: definition.name,
      style: model.defaultStyle(definition.id),
    };
    view.order.push(nodeId);
  }
  const relations = [
    ["Composition", "BusinessActor", "Service"],
    ["Aggregation", "BusinessActor", "Service"],
    ["Assignment", "Role", "Process"],
    ["Realization", "ApplicationComponent", "Service"],
    ["Serving", "ApplicationComponent", "Service"],
    ["Access", "Process", "DataObject"],
    ["Influence", "Driver", "Goal"],
    ["Triggering", "Event", "Process"],
    ["Flow", "Process", "Function"],
    ["Specialization", "BusinessActor", "Stakeholder"],
    ["Association", "BusinessObject", "ApplicationComponent"],
  ];
  for (const [index, [type, source, target]] of relations.entries()) {
    const relationshipId = `relationship-${type}`;
    document.model.relationships[relationshipId] = {
      id: relationshipId,
      type,
      sourceId: `element-${source}`,
      targetId: `element-${target}`,
      name: `${type} ✓`,
      documentation: "Relationship documentation",
      properties: { cardinality: "1..*" },
      sourceMultiplicity: "1..1",
      targetMultiplicity: "0..*",
      accessType: type === "Access" ? "read" : undefined,
      influenceStrength: type === "Influence" ? "+" : undefined,
    };
    const sourceNode = `node-${source}`;
    const targetNode = `node-${target}`;
    view.connections[`connection-${index}`] = {
      id: `connection-${index}`,
      relationshipId,
      x: 0,
      y: 0,
      w: 100,
      h: 0,
      source: { nodeId: sourceNode, side: "right", offset: 0.5 },
      target: { nodeId: targetNode, side: "left", offset: 0.5 },
      route: "orthogonal",
      waypoints: [{ x: 400 + index, y: 500 + index }],
      label: type,
      sourceMultiplicity: "1..1",
      targetMultiplicity: "0..*",
      style: { ...model.defaultStyle("Grouping"), strokeWidth: 2.5 },
    };
    view.order.push(`connection-${index}`);
  }
  const secondView = model.createView("Nested context", { width: 1800, height: 1200 });
  secondView.nodes["repeated-process"] = {
    ...view.nodes["node-Process"],
    id: "repeated-process",
    x: 800,
    y: 200,
    parentId: "nested-group",
  };
  secondView.nodes["nested-group"] = {
    ...view.nodes["node-Grouping"],
    id: "nested-group",
    elementId: "element-Grouping",
    x: 700,
    y: 100,
    w: 500,
    h: 400,
    kind: "container",
  };
  secondView.order.push("nested-group", "repeated-process");
  secondView.annotations.note = {
    id: "note",
    type: "legacy-drawing-element",
    element: {
      id: "note",
      kind: "text",
      x: 20,
      y: 20,
      w: 220,
      h: 40,
      text: "Keep this annotation ✓",
      detail: "ArchInt extension data",
      fill: "#ffffff",
      stroke: "#7392b8",
      fontSize: 16,
    },
  };
  secondView.order.push("note");
  document.views.push(secondView);
  document.model.organization = [{ id: "folder-1", elementId: "element-Process", name: "Operations", children: [] }];
  document.extensions = { vendor: { key: "preserve-me" }, unicode: "✓" };
  assert.deepEqual(model.validateCanonicalDocument(document), []);

  const exported = exchange.serializeOpenGroupExchange(document, { languageVersion: "3.2" });
  const reopened = exchange.parseArchimateFile(exported.content, "catalogue.xml");
  assert.deepEqual(reopened.errors, []);
  assert.equal(Object.keys(reopened.document.model.elements).length, model.ARCHIMATE_CATALOG.elements.length);
  assert.equal(Object.keys(reopened.document.model.relationships).length, relations.length);
  assert.equal(reopened.document.views.length, 2);
  assert.equal(reopened.document.views[1].nodes["repeated-process"].elementId, "element-Process");
  assert.equal(reopened.document.views[1].annotations.note.element.text, "Keep this annotation ✓");
  assert.equal(reopened.document.organization?.length || reopened.document.model.organization.length, 1);
  assert.equal(reopened.document.extensions.unicode, "✓");
});

test("unsupported exchange versions and oversized native files are rejected before parsing", () => {
  const unsupported = exchange.detectArchimateFileFormat('<model version="4.0"/>', "future.xml");
  assert.ok(unsupported.errors.some((message) => /unsupported/i.test(message)));
  const oversized = exchange.parseArchimateFile("{" + "x".repeat(5 * 1024 * 1024) + "}", "large.archimate");
  assert.ok(oversized.errors.some((message) => /5 MB/i.test(message)));
});
