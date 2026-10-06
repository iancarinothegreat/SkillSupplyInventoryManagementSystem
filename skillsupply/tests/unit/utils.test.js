import { describe, it, expect } from 'vitest';
import {
  getStockStatus,
  normalizeInventoryItem
} from '../../lib/utils.js';

describe('Inventory utility functions', () => {
  it('returns Out of Stock when quantity is zero', () => {
    const result = getStockStatus({
      quantity: 0,
      reorder_point: 5,
      defective_quantity: 0
    });

    expect(result.label).toBe('Out of Stock');
  });

  it('returns Critical when quantity is at the reorder point', () => {
    const result = getStockStatus({
      quantity: 5,
      reorder_point: 5,
      defective_quantity: 0
    });

    expect(result.label).toBe('Critical');
  });

  it('normalizes inventory database fields', () => {
    const result = normalizeInventoryItem({
      item_id: 10,
      quantity_on_hand: 25,
      unit_of_measure: 'pieces'
    });

    expect(result.id).toBe(10);
    expect(result.quantity).toBe(25);
    expect(result.unit).toBe('pieces');
  });
});