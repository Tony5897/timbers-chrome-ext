const { deleteApp, initializeApp } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { deleteScheduledAnonymousAccounts } = require('../lib/account-cleanup.js');

let app;
let firestore;

beforeAll(() => {
  app = initializeApp({ projectId: 'demo-timbers-matchday-account-cleanup' }, 'account-cleanup-emulator-test');
  firestore = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

test('deletes only completed due accounts and preserves retryable work', async () => {
  const now = new Date('2026-08-03T12:00:00Z');
  const requests = firestore.collection('compatibilityDeletionRequests');
  await Promise.all([
    requests.doc('due').set({
      uid: 'anonymous-due',
      status: 'completed',
      deleteAfter: Timestamp.fromDate(new Date('2026-08-03T11:00:00Z')),
    }),
    requests.doc('future').set({
      uid: 'anonymous-future',
      status: 'completed',
      deleteAfter: Timestamp.fromDate(new Date('2026-08-03T13:00:00Z')),
    }),
    requests.doc('pending').set({
      uid: 'anonymous-pending',
      status: 'pending',
      deleteAfter: Timestamp.fromDate(new Date('2026-08-03T10:00:00Z')),
    }),
  ]);
  const deletedUsers = [];
  const auth = { deleteUser: async (uid) => { deletedUsers.push(uid); } };

  await expect(deleteScheduledAnonymousAccounts(firestore, auth, now)).resolves.toBe(1);
  expect(deletedUsers).toEqual(['anonymous-due']);
  await expect(requests.doc('due').get()).resolves.toMatchObject({ exists: false });
  await expect(requests.doc('future').get()).resolves.toMatchObject({ exists: true });
  await expect(requests.doc('pending').get()).resolves.toMatchObject({ exists: true });
});

test('treats an already absent Firebase account as successful cleanup', async () => {
  const request = firestore.collection('compatibilityDeletionRequests').doc('missing-account');
  await request.set({
    uid: 'anonymous-missing',
    status: 'completed',
    deleteAfter: Timestamp.fromDate(new Date('2026-08-03T10:00:00Z')),
  });
  const auth = {
    deleteUser: async () => { throw { code: 'auth/user-not-found' }; },
  };

  await expect(deleteScheduledAnonymousAccounts(
    firestore,
    auth,
    new Date('2026-08-03T12:00:00Z'),
  )).resolves.toBe(1);
  await expect(request.get()).resolves.toMatchObject({ exists: false });
});
