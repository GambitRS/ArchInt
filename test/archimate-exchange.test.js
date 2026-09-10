const assert = require("node:assert/strict");
const test = require("node:test");

const model = require("../shared/archimate-model");
const exchange = require("../src/archimate-exchange");

const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<model xmlns="http://www.opengroup.org/xsd/archimate" version="3.2">
  <name>Orders &amp; fulfilment</name>
  <elements>
    <element identifier="app-1" xsi:type="archimate:ApplicationComponent" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <name>Order service</name>
      <documentation>Processes € orders</documentation>
      <properties><property key="owner" value="Énité"/></properties>
    </element>
    <element identifier="svc-1" xsi:type="archimate:BusinessService" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><name>Checkout</name></element>
  </elements>
  <relationships>
    <relationship identifier="rel-1" xsi:type="archimate:ServingRelationship" source="app-1" target="svc-1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <name>serves</name><sourceMultiplicity>1</sourceMultiplicity><targetMultiplicity>0..*</targetMultiplicity>
    </relationship>
  </relationships>
  <views>
    <view identifier="view-1" width="1600" height="1000"><name>Overview</name>
      <nodes>
        <node identifier="node-app" elementRef="app-1" x="40" y="50" width="240" height="100"><label>Order service</label></node>
        <node identifier="node-svc" elementRef="svc-1" x="500" y="50" width="200" height="90"/>
      </nodes>
      <connections>
        <connection identifier="conn-1" relationshipRef="rel-1" source="node-app" target="node-svc" route="orthogonal"><bendpoints><point x="300" y="100"/><point x="450" y="100"/></bendpoints></connection>
      </connections>
    </view>
  </views>
</model>`;

test("detects and imports Open Group exchange XML with model and view identity", () => {
  const detected = exchange.detectArchimateFileFormat(sampleXml, "orders.xml");
  assert.equal(detected.format, "open-group-exchange");
  assert.equal(detected.languageVersion, "3.2");
  assert.deepEqual(detected.errors, []);

  const imported = exchange.parseArchimateFile(sampleXml, "orders.xml");
  assert.equal(imported.format, "open-group-exchange");
  assert.deepEqual(imported.errors, []);
  assert.equal(imported.document.model.name, "Orders & fulfilment");
  assert.equal(imported.document.model.elements["app-1"].type, "ApplicationComponent");
  assert.equal(imported.document.model.elements["svc-1"].type, "Service");
  assert.equal(imported.document.model.elements["app-1"].properties.owner, "Énité");
  assert.equal(imported.document.model.relationships["rel-1"].type, "Serving");
  assert.equal(imported.document.model.relationships["rel-1"].sourceMultiplicity, "1..1");
  assert.equal(imported.document.views[0].width, 1600);
  assert.equal(imported.document.views[0].nodes["node-app"].w, 240);
  assert.equal(imported.document.views[0].connections["conn-1"].waypoints.length, 2);
});

test("exchange export preserves identifiers and reopens as a valid document", () => {
  const imported = exchange.parseArchimateFile(sampleXml, "orders.xml");
  assert.deepEqual(imported.errors, []);
  const exported = exchange.serializeOpenGroupExchange(imported.document, { languageVersion: "3.2" });
  assert.match(exported.content, /identifier="app-1"/);
  assert.match(exported.content, /identifier="rel-1"/);
  const reopened = exchange.parseArchimateFile(exported.content, "orders-roundtrip.xml");
  assert.deepEqual(reopened.errors, []);
  assert.equal(reopened.document.model.elements["app-1"].name, "Order service");
  assert.equal(reopened.document.model.relationships["rel-1"].targetId, "svc-1");
  assert.equal(reopened.document.views[0].connections["conn-1"].relationshipId, "rel-1");
  assert.equal(model.validateCanonicalDocument(reopened.document).length, 0);
});

test("rejects hostile XML and reports dangling references", () => {
  const hostile = exchange.parseArchimateFile(`<!DOCTYPE model [ <!ENTITY xxe SYSTEM "file:///secret"> ]><model/>`, "bad.xml");
  assert.ok(hostile.errors.some((message) => /external entity|doctype/i.test(message)));

  const dangling = exchange.parseArchimateFile(`<model version="3.2"><elements><element identifier="one" xsi:type="archimate:BusinessActor" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><name>One</name></element></elements><relationships><relationship identifier="bad" xsi:type="archimate:ServingRelationship" source="one" target="missing" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"/></relationships></model>`, "dangling.xml");
  assert.ok(dangling.errors.some((message) => /missing endpoint/i.test(message)));
});

test("native ArchInt files are lossless JSON snapshots", () => {
  const document = model.createDocument("Native model");
  const exported = exchange.serializeArchimateFile(document, { format: "native", category: "Architecture" });
  assert.equal(exported.format, "archint-json");
  assert.equal(exported.extension, ".archimate");
  const reopened = exchange.parseArchimateFile(exported.content, "native.archimate");
  assert.deepEqual(reopened.errors, []);
  assert.equal(reopened.document.model.id, document.model.id);
  assert.equal(reopened.document.views[0].id, document.views[0].id);
});
