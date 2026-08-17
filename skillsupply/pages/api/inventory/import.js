import { query } from '../../../lib/db.js';
import { withAuth } from '../../../lib/rbac.js';

const FIELD_ALIASES = {
  serial_number: [
    'serial number', 'serial no', 'serial no.', 'serial #', 'serial', 's n', 'sn'
  ],
  item_name: [
    'item name', 'item', 'name', 'product', 'product name', 'supply', 'supply name',
    'description', 'item description', 'general description', 'particulars', 'article',
    'materials', 'material', 'supplies materials', 'supplies/materials'
  ],
  unit_of_measure: [
    'unit', 'units', 'uom', 'unit of measure', 'measure', 'measurement'
  ],
  quantity_on_hand: [
    'qty', 'quantity', 'stock', 'stocks', 'current stock', 'stock level',
    'quantity on hand', 'quantity_on_hand', 'on hand', 'available', 'balance'
  ],
  reorder_level: [
    'reorder point', 'reorder level', 'reorder', 'minimum stock', 'min stock',
    'critical level', 'alert level'
  ],
  unit_cost: [
    'unit price', 'price', 'cost', 'unit cost', 'unit_cost', 'amount', 'estimated budget',
    'budget', 'estimated cost'
  ],
  category_name: [
    'category', 'category name', 'classification', 'type', 'group'
  ],
  division_name: [
    'division', 'division name', 'department', 'office', 'section'
  ],
};

function normalizeHeader(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[_/\\-]+/g, ' ')
    .replace(/[^a-z0-9 ]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function toNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = typeof value === 'number' ? value : Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : fallback;
}

function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function getCell(row, index) {
  return row?.__cells?.[index];
}

function headerMatchesField(normalizedHeader, normalizedAlias, field) {
  if (!normalizedHeader || !normalizedAlias) return false;

  if (
    field === 'unit_of_measure' &&
    /\b(price|cost|amount|budget)\b/.test(normalizedHeader)
  ) {
    return false;
  }

  if (
    field === 'item_name' &&
    /\b(no|number|id|code)\b/.test(normalizedHeader) &&
    !/\b(description|name)\b/.test(normalizedHeader)
  ) {
    return false;
  }

  if (normalizedHeader === normalizedAlias) return true;
  if (normalizedHeader.startsWith(`${normalizedAlias} `) || normalizedHeader.endsWith(` ${normalizedAlias}`)) {
    return normalizedAlias.length > 3 || ['qty', 'uom'].includes(normalizedAlias);
  }

  return normalizedAlias.length > 4 && normalizedHeader.includes(normalizedAlias);
}

function getValue(row, field, fallbackIndexes = []) {
  const aliases = FIELD_ALIASES[field] || [];
  const normalizedAliases = aliases.map(normalizeHeader);
  const headers = Array.isArray(row.__headers) ? row.__headers : Object.keys(row);

  for (const header of headers) {
    const normalized = normalizeHeader(header);
    if (!normalized) continue;

    const matches = normalizedAliases.some((alias) => headerMatchesField(normalized, alias, field));

    if (matches && row[header] !== undefined && row[header] !== '') {
      return row[header];
    }
  }

  for (const index of fallbackIndexes) {
    const value = getCell(row, index);
    if (value !== undefined && value !== '') return value;
  }

  return '';
}

function inferItemName(row) {
  const direct = cleanText(getValue(row, 'item_name', [1, 0]));
  if (direct) return direct;

  const cells = Array.isArray(row.__cells) ? row.__cells : [];
  const textCells = cells
    .map(cleanText)
    .filter((value) => value && Number.isNaN(Number(value.replace(/[^0-9.-]/g, ''))));

  return textCells.sort((a, b) => b.length - a.length)[0] || '';
}

async function findLookupId(table, idColumn, nameColumn, value) {
  const name = cleanText(value);
  if (!name) return null;

  const result = await query(
    `
      SELECT ${idColumn} AS id
      FROM ${table}
      WHERE LOWER(${nameColumn}) = LOWER($1)
      LIMIT 1
    `,
    [name]
  );

  return result.rows[0]?.id ?? null;
}

function normalizeRow(row) {
  const item_name = inferItemName(row);
  const serial_number = cleanText(getValue(row, 'serial_number'));
  const unit_of_measure = cleanText(getValue(row, 'unit_of_measure', [2]));
  const quantity_on_hand = toNumber(getValue(row, 'quantity_on_hand', [4, 3]), 0);
  const reorder_level = toNumber(getValue(row, 'reorder_level'), 10);
  const unit_cost = toNumber(getValue(row, 'unit_cost', [3, 5]), 0);
  const category_name = cleanText(getValue(row, 'category_name'));
  const division_name = cleanText(getValue(row, 'division_name'));

  return {
    item_name,
    serial_number,
    unit_of_measure,
    quantity_on_hand,
    reorder_level,
    unit_cost,
    category_name,
    division_name,
  };
}

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { rows } = req.body || {};
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'No rows provided' });
  }

  try {
    const inserted = [];
    const skipped = [];

    for (const row of rows) {
      const item = normalizeRow(row);
      if (!item.item_name) {
        skipped.push({ rowNumber: row.__rowNumber, reason: 'Missing item name' });
        continue;
      }

      const categoryId = await findLookupId('categories', 'category_id', 'category_name', item.category_name);
      const divisionId = await findLookupId('divisions', 'division_id', 'division_name', item.division_name);

      const result = await query(
        `
          INSERT INTO inventory_items
            (item_name, serial_number, category_id, division_id, unit_of_measure, quantity_on_hand, reorder_level, unit_cost, is_active)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true)
          RETURNING *
        `,
        [
          item.item_name,
          item.serial_number || null,
          categoryId,
          divisionId,
          item.unit_of_measure,
          item.quantity_on_hand,
          item.reorder_level,
          item.unit_cost,
        ]
      );

      inserted.push(result.rows[0]);

      await query(
        `
          INSERT INTO audit_log (user_id, action_type, affected_table, affected_record_id, new_value)
          VALUES ($1,'CREATE','inventory_items',$2,$3)
        `,
        [req.user.user_id, result.rows[0].item_id, JSON.stringify(result.rows[0])]
      );
    }

    return res.status(200).json({
      insertedCount: inserted.length,
      skippedCount: skipped.length,
      skipped,
      inserted,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}

export default withAuth(handler, 2);
