import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const labEntries = sqliteTable(
  'lab_entries',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    reportNumber: text('report_number').notNull().unique(),
    locationId: text('location_id').notNull(),
    patient: text('patient').notNull(),
    title: text('title').notNull().default(''),
    registrationNumber: text('registration_number').notNull(),
    ipNumber: text('ip_number').notNull(),
    age: text('age').notNull(),
    sex: text('sex').notNull(),
    relationship: text('relationship').notNull(),
    ipHolderName: text('ip_holder_name').notNull().default(''),
    transferredFromLocationId: text('transferred_from_location_id'),
    sourceEntryId: integer('source_entry_id'),
    testsJson: text('tests_json').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    index('idx_lab_entries_location_created').on(table.locationId, table.createdAt),
    index('idx_lab_entries_source_entry').on(table.sourceEntryId),
  ],
);

export const registrationSequences = sqliteTable('registration_sequences', {
  locationId: text('location_id').primaryKey(),
  lastNumber: integer('last_number').notNull(),
});

export const customerReviews = sqliteTable(
  'customer_reviews',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    locationId: text('location_id').notNull(),
    rating: integer('rating').notNull(),
    reviewerName: text('reviewer_name').notNull(),
    message: text('message').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [index('idx_customer_reviews_location_created').on(table.locationId, table.createdAt)],
);

export const labSessions = sqliteTable(
  'lab_sessions',
  {
    token: text('token').primaryKey(),
    locationId: text('location_id').notNull(),
    expiresAt: integer('expires_at').notNull(),
  },
  (table) => [index('idx_lab_sessions_expiry').on(table.expiresAt)],
);

export const labTests = sqliteTable(
  'lab_tests',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    locationId: text('location_id').notNull(),
    name: text('name').notNull(),
    category: text('category').notNull(),
    referenceRange: text('reference_range').notNull().default(''),
    active: integer('active').notNull().default(1),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('lab_tests_location_name_unique').on(table.locationId, table.name),
    index('idx_lab_tests_location_active').on(table.locationId, table.active, table.name),
  ],
);

export const labEntryTests = sqliteTable(
  'lab_entry_tests',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    entryId: integer('entry_id').notNull(),
    testId: integer('test_id'),
    testName: text('test_name').notNull(),
    resultValue: text('result_value').notNull().default(''),
    referenceRange: text('reference_range').notNull().default(''),
    resultNote: text('result_note').notNull().default(''),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    index('idx_lab_entry_tests_entry').on(table.entryId),
  ],
);
