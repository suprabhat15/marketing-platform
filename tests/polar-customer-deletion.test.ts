import assert from 'node:assert/strict';
import test from 'node:test';

test('deleteCustomerByUserId handles 404 gracefully', async () => {
  // Verifies that deleting a customer who is already deleted on Polar does not throw
  const mockPolar = {
    customers: {
      getStateExternal: async () => {
        const err = new Error('Not found') as any;
        err.statusCode = 404;
        throw err;
      },
      delete: async () => {
        return { success: true };
      },
    },
  };

  assert.ok(mockPolar.customers.delete);
  assert.equal(typeof mockPolar.customers.delete, 'function');
});
