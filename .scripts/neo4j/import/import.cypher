MATCH (n)
WITH COUNT(n) AS nodeCount
WHERE nodeCount = 0

WITH nodeCount
// Import sites
LOAD CSV WITH HEADERS FROM 'file:///sites.csv' AS row
CREATE (:site {siteId: row.siteId, name: row.name});

// Import evseGroups and relationships to sites
LOAD CSV WITH HEADERS FROM 'file:///evseGroups.csv' AS row
MATCH (s:site {siteId: row.siteId})
CREATE (eg:evseGroup {evseGroupId: row.evseGroupId, name: row.name})
CREATE (s)-[:HAS_GROUP]->(eg);

// Import evses and relationships to evseGroups
LOAD CSV WITH HEADERS FROM 'file:///evses.csv' AS row
MATCH (eg:evseGroup {evseGroupId: row.evseGroupId})
CREATE (e:evse {evseId: row.evseId, serialNumber: row.serialNumber})
CREATE (eg)-[:HAS_EVSE]->(e);

// Import connectors and relationships to evses
LOAD CSV WITH HEADERS FROM 'file:///connectors.csv' AS row
MATCH (e:evse {evseId: row.evseId})
CREATE (c:connector {connectorId: row.connectorId, type: row.type})
CREATE (e)-[:HAS_CONNECTOR]->(c);

// Import ocppServices and relationships to evses
// LOAD CSV WITH HEADERS FROM 'file:///ocppServices.csv' AS row
// MATCH (e:evse {evseId: row.evseId})
// MERGE (os:ocppService {ocppServiceId: row.ocppServiceId, hostname: row.hostname})
// CREATE (e)-[:CONNECTED_TO]->(os);