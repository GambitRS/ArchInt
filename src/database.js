const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");

const DEFAULT_DATABASE_PATH = path.resolve(__dirname, "..", "data", "app.db");
const DEFAULT_SCHEMA_PATH = path.resolve(__dirname, "..", "database", "schema.json");
const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SQLITE_TYPES = new Set(["INTEGER", "REAL", "TEXT", "BLOB", "NUMERIC"]);
const RELATION_ACTIONS = new Set([
  "NO ACTION",
  "RESTRICT",
  "SET NULL",
  "SET DEFAULT",
  "CASCADE",
]);

function hasOwn(object, property) {
  return Object.prototype.hasOwnProperty.call(object, property);
}

function quoteIdentifier(identifier) {
  if (typeof identifier !== "string" || !IDENTIFIER_PATTERN.test(identifier)) {
    throw new Error(`Invalid SQLite identifier: ${identifier}`);
  }

  return `"${identifier}"`;
}

function quoteExistingIdentifier(identifier) {
  if (typeof identifier !== "string" || identifier.includes("\0")) {
    throw new Error(`Invalid existing SQLite identifier: ${identifier}`);
  }

  return `"${identifier.replaceAll('"', '""')}"`;
}

function normalizeRelationAction(action) {
  const normalized = String(action || "NO ACTION").toUpperCase();
  if (!RELATION_ACTIONS.has(normalized)) {
    throw new Error(`Unsupported foreign-key action: ${action}`);
  }
  return normalized;
}

function sqlLiteral(value) {
  if (value === null) return "NULL";
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string") return `'${value.replaceAll("'", "''")}'`;
  throw new Error("Column defaults must be JSON strings, numbers, booleans, or null");
}

function validateSchema(schema) {
  if (!schema || !Array.isArray(schema.tables)) {
    throw new Error("Database specification must contain a tables array");
  }
  if (schema.relations !== undefined && !Array.isArray(schema.relations)) {
    throw new Error("Database specification relations must be an array");
  }

  const tableColumns = new Map();

  for (const table of schema.tables) {
    if (!table || typeof table.name !== "string" || !Array.isArray(table.columns)) {
      throw new Error("Each table must have a name and a columns array");
    }

    quoteIdentifier(table.name);
    if (tableColumns.has(table.name)) {
      throw new Error(`Duplicate table in database specification: ${table.name}`);
    }

    const columnNames = new Set();
    for (const column of table.columns) {
      if (!column || typeof column.name !== "string") {
        throw new Error(`Table ${table.name} contains an invalid column`);
      }

      quoteIdentifier(column.name);
      if (columnNames.has(column.name)) {
        throw new Error(`Duplicate column in table ${table.name}: ${column.name}`);
      }
      columnNames.add(column.name);

      const type = String(column.type || "TEXT").toUpperCase();
      if (!SQLITE_TYPES.has(type)) {
        throw new Error(`Unsupported SQLite type for ${table.name}.${column.name}: ${type}`);
      }
      if (column.autoIncrement && (!column.primaryKey || type !== "INTEGER")) {
        throw new Error(
          `AUTOINCREMENT requires an INTEGER primary key: ${table.name}.${column.name}`,
        );
      }
      if (hasOwn(column, "default")) sqlLiteral(column.default);
      if (column.allowedValues !== undefined) {
        if (!Array.isArray(column.allowedValues) || column.allowedValues.length === 0) {
          throw new Error(
            `Allowed values for ${table.name}.${column.name} must be a non-empty array`,
          );
        }
        const allowedValues = new Set();
        for (const value of column.allowedValues) {
          sqlLiteral(value);
          const key = JSON.stringify(value);
          if (allowedValues.has(key)) {
            throw new Error(`Duplicate allowed value for ${table.name}.${column.name}`);
          }
          allowedValues.add(key);
        }
      }
    }

    tableColumns.set(table.name, columnNames);
  }

  for (const relation of schema.relations || []) {
    const from = relation?.from;
    const to = relation?.to;
    if (!from || !to) {
      throw new Error("Each relation must have from and to definitions");
    }
    if (!tableColumns.has(from.table) || !tableColumns.has(to.table)) {
      throw new Error("Relations must refer to tables in the database specification");
    }
    if (!tableColumns.get(from.table).has(from.column)) {
      throw new Error(`Relation source column does not exist: ${from.table}.${from.column}`);
    }
    if (!tableColumns.get(to.table).has(to.column)) {
      throw new Error(`Relation target column does not exist: ${to.table}.${to.column}`);
    }

    quoteIdentifier(from.table);
    quoteIdentifier(from.column);
    quoteIdentifier(to.table);
    quoteIdentifier(to.column);
    normalizeRelationAction(relation.onDelete);
    normalizeRelationAction(relation.onUpdate);
  }
}

function columnDefinition(column) {
  const type = String(column.type || "TEXT").toUpperCase();
  const definition = [quoteIdentifier(column.name), type];

  if (column.primaryKey) definition.push("PRIMARY KEY");
  if (column.autoIncrement) definition.push("AUTOINCREMENT");
  if (column.notNull) definition.push("NOT NULL");
  if (column.unique) definition.push("UNIQUE");
  if (column.allowedValues) {
    const allowed = column.allowedValues.map(sqlLiteral).join(", ");
    definition.push(`CHECK (${quoteIdentifier(column.name)} IN (${allowed}))`);
  }
  if (hasOwn(column, "default")) definition.push(`DEFAULT ${sqlLiteral(column.default)}`);

  return definition.join(" ");
}

function relationDefinition(relation) {
  const definition = [
    `FOREIGN KEY (${quoteIdentifier(relation.from.column)})`,
    `REFERENCES ${quoteIdentifier(relation.to.table)} (${quoteIdentifier(relation.to.column)})`,
  ];
  const onDelete = normalizeRelationAction(relation.onDelete);
  const onUpdate = normalizeRelationAction(relation.onUpdate);

  if (onDelete !== "NO ACTION") definition.push(`ON DELETE ${onDelete}`);
  if (onUpdate !== "NO ACTION") definition.push(`ON UPDATE ${onUpdate}`);

  return definition.join(" ");
}

function tableDefinition(table, schema) {
  const definitions = table.columns.map(columnDefinition);
  const relations = (schema.relations || []).filter(
    (relation) => relation.from.table === table.name,
  );
  definitions.push(...relations.map(relationDefinition));
  return definitions.join(", ");
}

function tableExists(db, tableName) {
  return Boolean(
    db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(tableName),
  );
}

function tableInfo(db, tableName) {
  return db.prepare(`PRAGMA table_info(${quoteIdentifier(tableName)})`).all();
}

function foreignKeys(db, tableName) {
  return db.prepare(`PRAGMA foreign_key_list(${quoteIdentifier(tableName)})`).all();
}

function relationMatches(foreignKey, relation) {
  const hasMatchingEndpoints =
    foreignKey.table === relation.to.table &&
    foreignKey.from === relation.from.column &&
    foreignKey.to === relation.to.column;
  if (!hasMatchingEndpoints) return false;

  return (
    String(foreignKey.on_delete || "NO ACTION").toUpperCase() ===
      normalizeRelationAction(relation.onDelete) &&
    String(foreignKey.on_update || "NO ACTION").toUpperCase() ===
      normalizeRelationAction(relation.onUpdate)
  );
}

function missingRelations(db, tableName, schema) {
  const existing = foreignKeys(db, tableName);
  return (schema.relations || []).filter(
    (relation) =>
      relation.from.table === tableName &&
      !existing.some((foreignKey) => relationMatches(foreignKey, relation)),
  );
}

function findMatchingParenthesis(sql, openIndex) {
  let depth = 0;
  let quote = null;

  for (let index = openIndex; index < sql.length; index += 1) {
    const character = sql[index];

    if (quote) {
      if (character === quote) {
        if (sql[index + 1] === quote && quote !== "]") {
          index += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }

    if (character === "'" || character === '"' || character === "`") {
      quote = character;
    } else if (character === "[") {
      quote = "]";
    } else if (character === "(") {
      depth += 1;
    } else if (character === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  return -1;
}

function splitSqlList(sql) {
  const parts = [];
  let start = 0;
  let depth = 0;
  let quote = null;

  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index];

    if (quote) {
      if (character === quote) {
        if (sql[index + 1] === quote && quote !== "]") {
          index += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }

    if (character === "'" || character === '"' || character === "`") {
      quote = character;
    } else if (character === "[") {
      quote = "]";
    } else if (character === "(") {
      depth += 1;
    } else if (character === ")") {
      depth -= 1;
    } else if (character === "," && depth === 0) {
      parts.push(sql.slice(start, index).trim());
      start = index + 1;
    }
  }

  const finalPart = sql.slice(start).trim();
  if (finalPart) parts.push(finalPart);
  return parts;
}

function isTableConstraint(definition) {
  return /^\s*(?:CONSTRAINT\b[\s\S]*?\s+)?(?:PRIMARY\s+KEY|UNIQUE\b|CHECK\b|FOREIGN\s+KEY\b)/i.test(
    definition,
  );
}

function replacementTableSql(originalSql, temporaryName, newColumns, newRelations) {
  const openIndex = originalSql.indexOf("(");
  const closeIndex = findMatchingParenthesis(originalSql, openIndex);
  if (openIndex < 0 || closeIndex < 0) {
    throw new Error("Cannot reconcile a table with an unsupported SQLite definition");
  }

  const definitions = splitSqlList(originalSql.slice(openIndex + 1, closeIndex));
  const firstConstraint = definitions.findIndex(isTableConstraint);
  const insertionIndex = firstConstraint < 0 ? definitions.length : firstConstraint;

  definitions.splice(insertionIndex, 0, ...newColumns.map(columnDefinition));
  definitions.push(...newRelations.map(relationDefinition));

  return `CREATE TABLE ${quoteIdentifier(temporaryName)} (${definitions.join(", ")})${originalSql.slice(
    closeIndex + 1,
  )}`;
}

function existingTableSql(db, tableName) {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName);
  if (!row?.sql) {
    throw new Error(`Cannot reconcile table ${tableName}: its CREATE TABLE SQL is unavailable`);
  }
  return row.sql;
}

function ownedObjects(db, tableName) {
  return db
    .prepare(
      "SELECT type, name, sql FROM sqlite_master " +
        "WHERE tbl_name = ? AND type IN ('index', 'trigger') AND sql IS NOT NULL",
    )
    .all(tableName);
}

function rebuildTable(db, table, currentColumns, newColumns, newRelations) {
  const rowCount = Number(
    db.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(table.name)}`).get().count,
  );

  for (const column of newColumns) {
    if (
      rowCount > 0 &&
      (column.notNull || column.primaryKey) &&
      !hasOwn(column, "default")
    ) {
      throw new Error(
        `Cannot add required column ${table.name}.${column.name} while rows exist without a default`,
      );
    }
  }

  const temporaryNameBase = `__schema_sync_${table.name}`;
  let temporaryName = temporaryNameBase;
  let suffix = 1;
  while (tableExists(db, temporaryName)) {
    temporaryName = `${temporaryNameBase}_${suffix}`;
    suffix += 1;
  }

  const originalSql = existingTableSql(db, table.name);
  const indexesAndTriggers = ownedObjects(db, table.name);
  const createSql = replacementTableSql(
    originalSql,
    temporaryName,
    newColumns,
    newRelations,
  );

  db.exec(createSql);

  const columnsToCopy = currentColumns.map((column) => column.name);
  if (columnsToCopy.length > 0) {
    const quotedColumns = columnsToCopy.map(quoteExistingIdentifier).join(", ");
    db.exec(
      `INSERT INTO ${quoteIdentifier(temporaryName)} (${quotedColumns}) ` +
        `SELECT ${quotedColumns} FROM ${quoteIdentifier(table.name)}`,
    );
  }

  db.exec(`DROP TABLE ${quoteIdentifier(table.name)}`);
  db.exec(`ALTER TABLE ${quoteIdentifier(temporaryName)} RENAME TO ${quoteIdentifier(table.name)}`);

  for (const object of indexesAndTriggers) {
    db.exec(object.sql);
  }
}

function applySchema(db, schema) {
  validateSchema(schema);

  const changes = {
    tables: [],
    columns: [],
    relations: [],
  };
  const previousForeignKeys = db.pragma("foreign_keys", { simple: true });
  db.pragma("foreign_keys = OFF");

  try {
    const synchronize = db.transaction(() => {
      const missingTables = new Set();

      for (const table of schema.tables) {
        if (!tableExists(db, table.name)) {
          db.exec(
            `CREATE TABLE ${quoteIdentifier(table.name)} (${tableDefinition(table, schema)})`,
          );
          missingTables.add(table.name);
          changes.tables.push(table.name);
          for (const relation of schema.relations || []) {
            if (relation.from.table === table.name) {
              changes.relations.push(
                `${relation.from.table}.${relation.from.column} -> ${relation.to.table}.${relation.to.column}`,
              );
            }
          }
        }
      }

      for (const table of schema.tables) {
        if (missingTables.has(table.name)) continue;

        const currentColumns = tableInfo(db, table.name);
        const currentColumnNames = new Set(currentColumns.map((column) => column.name));
        const newColumns = table.columns.filter((column) => !currentColumnNames.has(column.name));
        const newRelations = missingRelations(db, table.name, schema);

        if (newColumns.length > 0 || newRelations.length > 0) {
          rebuildTable(db, table, currentColumns, newColumns, newRelations);
          for (const column of newColumns) {
            changes.columns.push(`${table.name}.${column.name}`);
          }
          for (const relation of newRelations) {
            changes.relations.push(
              `${relation.from.table}.${relation.from.column} -> ${relation.to.table}.${relation.to.column}`,
            );
          }
        }
      }

      const violations = db.prepare("PRAGMA foreign_key_check").all();
      if (violations.length > 0) {
        throw new Error("Database contains foreign-key violations after schema synchronization");
      }
    });

    synchronize();
    return changes;
  } finally {
    db.pragma(`foreign_keys = ${previousForeignKeys ? "ON" : "OFF"}`);
  }
}

function loadSchema(schemaPath = DEFAULT_SCHEMA_PATH) {
  return JSON.parse(fs.readFileSync(schemaPath, "utf8"));
}

function createDatabase({ databasePath = DEFAULT_DATABASE_PATH, schemaPath = DEFAULT_SCHEMA_PATH } = {}) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new Database(databasePath);
  db.pragma("foreign_keys = ON");
  applySchema(db, loadSchema(schemaPath));
  return db;
}

module.exports = {
  applySchema,
  createDatabase,
  loadSchema,
};
