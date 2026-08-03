import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';

export async function deleteScheduledAnonymousAccounts(
  firestore: Firestore,
  auth: Pick<Auth, 'deleteUser'>,
  now: Date = new Date(),
): Promise<number> {
  const snapshot = await firestore
    .collection('compatibilityDeletionRequests')
    .where('status', '==', 'completed')
    .where('deleteAfter', '<=', now)
    .limit(500)
    .get();
  let deleted = 0;

  for (const request of snapshot.docs) {
    const uid = request.get('uid');
    if (typeof uid !== 'string' || uid.length === 0) throw new Error('invalid_deletion_request');
    try {
      await auth.deleteUser(uid);
    } catch (error) {
      const code = typeof error === 'object' && error && 'code' in error ? error.code : undefined;
      if (code !== 'auth/user-not-found') throw error;
    }
    await request.ref.delete();
    deleted += 1;
  }

  return deleted;
}
